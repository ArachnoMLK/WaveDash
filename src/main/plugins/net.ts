// Client HTTPS réservé aux plugins : uniquement les domaines déclarés, jamais d'adresse locale ou privée,
// redirections revérifiées, taille et durée plafonnées. L'adresse IP est contrôlée au moment de la connexion
// (et non avant), ce qui empêche le contournement par « DNS rebinding ».
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
  /** Réservé aux tests : autorise localhost et HTTP. Jamais activé en production. */
  allowLocalForTests?: boolean
  signal?: AbortSignal
}
export interface HttpOptions { method?: string; headers?: Record<string, string>; body?: string }
export interface HttpResult { status: number; ok: boolean; headers: Record<string, string>; text: string }

/** `exemple.com` exact, ou `*.exemple.com` (tous les sous-domaines, pas le domaine nu). */
export function hostAllowed(host: string, patterns: string[]): boolean {
  const h = host.toLowerCase()
  return patterns.some((p) => (p.startsWith('*.') ? h.length > p.length - 1 && h.endsWith(p.slice(1)) : h === p))
}

const BLOCKED = new net.BlockList()
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]] as [string, number][]) BLOCKED.addSubnet(a, p, 'ipv4')
for (const [a, p] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as [string, number][]) BLOCKED.addSubnet(a, p, 'ipv6')

/** Adresse locale, privée, réservée ou de diffusion : interdite pour un plugin. */
export function isPrivateAddress(ip: string): boolean {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mapped) return isPrivateAddress(mapped[1])
  const v = net.isIP(ip)
  return v === 0 ? true : BLOCKED.check(ip, v === 4 ? 'ipv4' : 'ipv6')
}

const REDIRECTS = new Set([301, 302, 303, 307, 308])
const DROPPED_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'upgrade', 'expect'])

function once(url: URL, o: HttpOptions, cfg: NetConfig): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const secure = url.protocol === 'https:'
    const headers: Record<string, string> = { 'user-agent': 'WaveDash-plugin', 'accept-encoding': 'gzip, deflate, br' }
    for (const [k, v] of Object.entries(o.headers ?? {})) if (typeof v === 'string' && !DROPPED_HEADERS.has(k.toLowerCase())) headers[k.toLowerCase()] = v.slice(0, 2000)
    const body = o.body !== undefined && !['GET', 'HEAD'].includes((o.method ?? 'GET').toUpperCase()) ? Buffer.from(o.body) : undefined
    if (body) headers['content-length'] = String(body.length)

    // Contrôle de l'adresse IP réellement utilisée pour la connexion.
    const lookup = (hostname: string, options: dns.LookupOptions, cb: (...a: unknown[]) => void): void => {
      dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
        if (err) return cb(err)
        const ok = (addrs as dns.LookupAddress[]).filter((a) => cfg.allowLocalForTests || !isPrivateAddress(a.address))
        if (!ok.length) return cb(new NetError('blocked', 'adresse réseau interdite'))
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
        size += c.length
        if (size > cfg.maxBytes) { req.destroy(new NetError('too_large', 'réponse trop volumineuse')); return }
        chunks.push(c)
      })
      res.on('end', () => {
        const h: Record<string, string> = {}
        for (const [k, v] of Object.entries(res.headers)) h[k] = Array.isArray(v) ? v.join(', ') : String(v ?? '')
        resolve({ status: res.statusCode ?? 0, headers: h, body: Buffer.concat(chunks) })
      })
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new NetError('timeout', 'délai dépassé')))
    req.on('error', (e) => reject(e instanceof NetError ? e : new NetError('network', e.message.slice(0, 120))))
    cfg.signal?.addEventListener('abort', () => req.destroy(new NetError('timeout', 'exécution interrompue')), { once: true })
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
  } catch { throw new NetError('too_large', 'réponse illisible ou trop volumineuse') }
}

export async function httpRequest(urlStr: string, o: HttpOptions, cfg: NetConfig): Promise<HttpResult> {
  let url: URL
  try { url = new URL(urlStr) } catch { throw new NetError('bad_request', 'URL invalide') }
  let method = (o.method ?? 'GET').toUpperCase()
  let body = o.body
  if (!/^[A-Z]{3,7}$/.test(method)) throw new NetError('bad_request', 'méthode invalide')
  if (body !== undefined && (typeof body !== 'string' || body.length > 100_000)) throw new NetError('bad_request', 'corps de requête trop volumineux')

  for (let hop = 0; hop <= cfg.maxRedirects; hop++) {
    if (url.protocol !== 'https:' && !(cfg.allowLocalForTests && url.protocol === 'http:')) throw new NetError('blocked', 'HTTPS obligatoire')
    if (url.username || url.password) throw new NetError('blocked', 'identifiants dans l’URL interdits')
    if (net.isIP(url.hostname.replace(/^\[|\]$/g, '')) && !cfg.allowLocalForTests) throw new NetError('blocked', 'adresse IP directe interdite')
    if (!hostAllowed(url.hostname, cfg.allowedHosts)) throw new NetError('blocked', `domaine non autorisé : ${url.hostname}`)

    const r = await once(url, { method, headers: o.headers, body }, cfg)
    if (REDIRECTS.has(r.status) && r.headers.location) {
      try { url = new URL(r.headers.location, url) } catch { throw new NetError('bad_request', 'redirection invalide') }
      if (r.status === 303 || ((r.status === 301 || r.status === 302) && method === 'POST')) { method = 'GET'; body = undefined }
      continue
    }
    return { status: r.status, ok: r.status >= 200 && r.status < 300, headers: r.headers, text: decode(r.body, r.headers['content-encoding'], cfg.maxBytes) }
  }
  throw new NetError('blocked', 'trop de redirections')
}
