import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { AddressInfo } from 'node:net'
import { gzipSync } from 'node:zlib'
import { hostAllowed, httpRequest, isPrivateAddress, NetConfig, NetError } from '../src/main/plugins/net'

const cfg = (over: Partial<NetConfig> = {}): NetConfig => ({ allowedHosts: ['exemple.com'], maxBytes: 1000, timeoutMs: 3000, maxRedirects: 3, ...over })
const code = async (p: Promise<unknown>): Promise<string> => { try { await p; return 'ok' } catch (e) { return e instanceof NetError ? e.code : `autre: ${String(e)}` } }

test('allowed domains', () => {
  assert.ok(hostAllowed('exemple.com', ['exemple.com']))
  assert.ok(hostAllowed('API.Exemple.com', ['*.exemple.com']))
  assert.ok(!hostAllowed('exemple.com', ['*.exemple.com']))
  assert.ok(!hostAllowed('evilexemple.com', ['*.exemple.com']))
  assert.ok(!hostAllowed('exemple.com.evil.io', ['exemple.com']))
  assert.ok(!hostAllowed('exemple.com.', ['exemple.com']))
})

test('local and private addresses rejected', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.10', '172.20.0.1', '169.254.169.254', '0.0.0.0', '100.64.1.1', '::1', '::', 'fe80::1', 'fd00::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:c0a8:1', '64:ff9b::a00:1', 'not an ip']) assert.ok(isPrivateAddress(ip), ip)
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) assert.ok(!isPrivateAddress(ip), ip)
})

test('refus avant toute connexion', async () => {
  assert.equal(await code(httpRequest('http://exemple.com/', {}, cfg())), 'blocked')
  assert.equal(await code(httpRequest('https://autre.com/', {}, cfg())), 'blocked')
  assert.equal(await code(httpRequest('https://user:pw@exemple.com/', {}, cfg())), 'blocked')
  assert.equal(await code(httpRequest('https://127.0.0.1/', {}, cfg({ allowedHosts: ['127.0.0.1'] }))), 'blocked')
  assert.equal(await code(httpRequest('https://[::1]/', {}, cfg({ allowedHosts: ['[::1]'] }))), 'blocked')
  assert.equal(await code(httpRequest('not a url', {}, cfg())), 'bad_request')
  assert.equal(await code(httpRequest('https://exemple.com/', { method: 'GET /x' }, cfg())), 'bad_request')
  assert.equal(await code(httpRequest('https://exemple.com/', { method: 'POST', body: 'x'.repeat(100_001) }, cfg())), 'bad_request')
})

test('a domain name pointing to a local address is rejected at connection time', async () => {
  assert.equal(await code(httpRequest('https://localhost/', {}, cfg({ allowedHosts: ['localhost'] }))), 'blocked')
})

// Local server: only reachable with allowLocalForTests (never active in the app).
async function server(handler: http.RequestListener): Promise<{ port: number; close: () => void }> {
  const s = http.createServer(handler)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return { port: (s.address() as AddressInfo).port, close: () => s.close() }
}

test('responses: capped size, gzip decompressed with a cap, redirects rechecked', async () => {
  const seen: Record<string, string | undefined> = {}
  const s = await server((req, res) => {
    seen[req.url ?? ''] = req.headers.authorization
    if (req.url === '/big') { res.end('x'.repeat(5000)); return }
    if (req.url === '/gz') { res.setHeader('content-encoding', 'gzip'); res.end(gzipSync('ok')); return }
    if (req.url === '/bomb') { res.setHeader('content-encoding', 'gzip'); res.end(gzipSync(Buffer.alloc(1_000_000))); return }
    if (req.url === '/out') { res.statusCode = 302; res.setHeader('location', 'https://interdit.com/'); res.end(); return }
    if (req.url === '/other') { res.statusCode = 302; res.setHeader('location', `http://localhost:${(req.socket.address() as AddressInfo).port}/landing`); res.end(); return }
    if (req.url === '/loop') { res.statusCode = 302; res.setHeader('location', '/loop'); res.end(); return }
    res.end('fin')
  })
  try {
    const c = cfg({ allowedHosts: ['127.0.0.1', 'localhost'], allowLocalForTests: true })
    const base = `http://127.0.0.1:${s.port}`
    assert.equal(await code(httpRequest(`${base}/big`, {}, c)), 'too_large')
    assert.equal((await httpRequest(`${base}/gz`, {}, c)).text, 'ok')
    assert.equal(await code(httpRequest(`${base}/bomb`, {}, c)), 'too_large')
    assert.equal(await code(httpRequest(`${base}/out`, {}, c)), 'blocked')
    assert.equal(await code(httpRequest(`${base}/loop`, {}, c)), 'blocked')
    // To another host (even an allowed one), the authorization header is not sent.
    const r = await httpRequest(`${base}/other`, { headers: { Authorization: 'Bot secret' } }, c)
    assert.equal(r.text, 'fin')
    assert.equal(seen['/other'], 'Bot secret')
    assert.equal(seen['/landing'], undefined)
  } finally { s.close() }
})

test('cancellation: a pending request is aborted', async () => {
  const s = await server(() => { /* never answers */ })
  try {
    const ctrl = new AbortController()
    const p = code(httpRequest(`http://127.0.0.1:${s.port}/`, {}, cfg({ allowedHosts: ['127.0.0.1'], allowLocalForTests: true, signal: ctrl.signal })))
    setTimeout(() => ctrl.abort(), 100)
    assert.equal(await p, 'timeout')
  } finally { s.close() }
})
