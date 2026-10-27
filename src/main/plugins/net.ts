// HTTPS client reserved for plugins: only declared domains, never a local or private address,
// redirects rechecked, size and duration capped. The IP address is checked at connection time
// (not before), which prevents bypassing it through "DNS rebinding".
import dns from 'dns'
import http from 'http'
import https from 'https'
import net from 'net'
import { brotliDecompressSync, gunzipSync, inflateSync } from 'zlib'

export type NetErrorCode = 'blocked' | 'timeout' | 'too_large' | 'network' | 'bad_request'
export class NetError extends Error { constructor(public code: NetErrorCode, message: string) { super(message) } }

export interface NetConfig {
  allowedHosts: string[]
  maxBytes: number
  timeoutMs: number
  maxRedirects: number
  /** Tests only: allows localhost and HTTP. Never enabled in production. */
  allowLocalForTests?: boolean
  signal?: AbortSignal
}
export interface HttpOptions { method?: string; headers?: Record<string, string>; body?: string }
export interface HttpResult { status: number; ok: boolean; headers: Record<string, string>; text: string }

/** Exact `example.com`, or `*.example.com` (all subdomains, not the bare domain). */
export function hostAllowed(host: string, patterns: string[]): boolean {
  const h = host.toLowerCase()
  return patterns.some((p) => (p.startsWith('*.') ? h.length > p.length - 1 && h.endsWith(p.slice(1)) : h === p))
}

const BLOCKED = new net.BlockList()
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]] as [string, number][]) BLOCKED.addSubnet(a, p, 'ipv4')
// IPv6: loopback, private and link-local networks, multicast, documentation, and the prefixes that embed an IPv4 address
// (NAT64, 6to4, Teredo; "mapped" IPv4 addresses are already compared with the IPv4 ranges): they could lead to a local address.
for (const [a, p] of [['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['2001::', 32], ['2001:db8::', 32],
  ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as [string, number][]) BLOCKED.addSubnet(a, p, 'ipv6')

/** Local, private, reserved or broadcast address: forbidden for a plugin. */
export function isPrivateAddress(ip: string): boolean {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mapped) return isPrivateAddress(mapped[1])
  const v = net.isIP(ip)
  return v === 0 ? true : BLOCKED.check(ip, v === 4 ? 'ipv4' : 'ipv6')
}

const REDIRECTS = new Set([301, 302, 303, 307, 308])
const DROPPED_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'upgrade', 'expect'])
const SECRET_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization'])

function once(url: URL, o: HttpOptions, cfg: NetConfig): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    // A single outcome per request: a late error (e.g. stream cut after the size limit) must never
    // become an uncaught exception, which would stop the whole plugin process.
    let settled = false
    const fail = (e: unknown): void => { if (settled) return; settled = true; cleanup(); reject(e instanceof NetError ? e : new NetError('network', String((e as Error)?.message ?? e).slice(0, 120))) }
    const onAbort = (): void => { fail(new NetError('timeout', 'run aborted')); req.destroy() }
    const cleanup = (): void => cfg.signal?.removeEventListener('abort', onAbort)
    const secure = url.protocol === 'https:'
    const headers: Record<string, string> = { 'user-agent': 'WaveDash-plugin', 'accept-encoding': 'gzip, deflate, br' }
    for (const [k, v] of Object.entries(o.headers ?? {})) if (typeof v === 'string' && !DROPPED_HEADERS.has(k.toLowerCase())) headers[k.toLowerCase()] = v.slice(0, 2000)
    const body = o.body !== undefined && !['GET', 'HEAD'].includes((o.method ?? 'GET').toUpperCase()) ? Buffer.from(o.body) : undefined
    if (body) headers['content-length'] = String(body.length)

    // Check of the IP address actually used for the connection.
    const lookup = (hostname: string, options: dns.LookupOptions, cb: (...a: unknown[]) => void): void => {
      dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
        if (err) return cb(err)
        const ok = (addrs as dns.LookupAddress[]).filter((a) => cfg.allowLocalForTests || !isPrivateAddress(a.address))
        if (!ok.length) return cb(new NetError('blocked', 'forbidden network address'))
        return options.all ? cb(null, ok) : cb(null, ok[0].address, ok[0].family)
      })
    }

    const req = (secure ? https : http).request({
      protocol: url.protocol, hostname: url.hostname, port: url.port || undefined, path: url.pathname + url.search,
      method: (o.method ?? 'GET').toUpperCase(), headers, timeout: cfg.timeoutMs, lookup: lookup as never
    }, (res) => {
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => {
        if (settled) return
        size += c.length
        if (size > cfg.maxBytes) { fail(new NetError('too_large', 'response too large')); res.destroy(); req.destroy(); return }
        chunks.push(c)
      })
      res.on('end', () => {
        if (settled) return
        settled = true; cleanup()
        const h: Record<string, string> = {}
        for (const [k, v] of Object.entries(res.headers)) h[k] = Array.isArray(v) ? v.join(', ') : String(v ?? '')
        resolve({ status: res.statusCode ?? 0, headers: h, body: Buffer.concat(chunks) })
      })
      res.on('error', fail)
      res.on('aborted', () => fail(new NetError('network', 'response interrupted')))
    })
    req.on('timeout', () => { fail(new NetError('timeout', 'timed out')); req.destroy() })
    req.on('error', fail)
    if (cfg.signal?.aborted) { onAbort(); return }
    cfg.signal?.addEventListener('abort', onAbort, { once: true })
    if (body) req.write(body)
    req.end()
  })
}

function decode(body: Buffer, encoding: string | undefined, max: number): string {
  try {
    const e = (encoding ?? '').toLowerCase()
    const raw = e === 'gzip' ? gunzipSync(body, { maxOutputLength: max }) : e === 'deflate' ? inflateSync(body, { maxOutputLength: max })
      : e === 'br' ? brotliDecompressSync(body, { maxOutputLength: max }) : body
    return raw.toString('utf8')
  } catch { throw new NetError('too_large', 'unreadable or too large response') }
}

export async function httpRequest(urlStr: string, o: HttpOptions, cfg: NetConfig): Promise<HttpResult> {
  let url: URL
  try { url = new URL(urlStr) } catch { throw new NetError('bad_request', 'URL invalide') }
  let method = (o.method ?? 'GET').toUpperCase()
  let body = o.body
  let headers: Record<string, string> = o.headers && typeof o.headers === 'object' ? o.headers : {}
  if (!/^[A-Z]{3,7}$/.test(method)) throw new NetError('bad_request', 'invalid method')
  if (body !== undefined && (typeof body !== 'string' || body.length > 100_000)) throw new NetError('bad_request', 'request body too large')

  for (let hop = 0; hop <= cfg.maxRedirects; hop++) {
    if (url.protocol !== 'https:' && !(cfg.allowLocalForTests && url.protocol === 'http:')) throw new NetError('blocked', 'HTTPS obligatoire')
    if (url.username || url.password) throw new NetError('blocked', 'credentials in the URL are not allowed')
    if (net.isIP(url.hostname.replace(/^\[|\]$/g, '')) && !cfg.allowLocalForTests) throw new NetError('blocked', 'adresse IP directe interdite')
    if (!hostAllowed(url.hostname, cfg.allowedHosts)) throw new NetError('blocked', `domain not allowed: ${url.hostname}`)

    const r = await once(url, { method, headers, body }, cfg)
    if (REDIRECTS.has(r.status) && r.headers.location) {
      const from = url.host
      try { url = new URL(r.headers.location, url) } catch { throw new NetError('bad_request', 'redirection invalide') }
      // To another host: credentials (bot token, cookies) do not follow the redirect.
      if (url.host !== from) headers = Object.fromEntries(Object.entries(headers).filter(([k]) => !SECRET_HEADERS.has(k.toLowerCase())))
      if (r.status === 303 || ((r.status === 301 || r.status === 302) && method === 'POST')) { method = 'GET'; body = undefined }
      continue
    }
    return { status: r.status, ok: r.status >= 200 && r.status < 300, headers: r.headers, text: decode(r.body, r.headers['content-encoding'], cfg.maxBytes) }
  }
  throw new NetError('blocked', 'trop de redirections')
}
