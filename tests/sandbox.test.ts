import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { AddressInfo } from 'node:net'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PluginError, runPlugin, RunRequest } from '../src/main/plugins/sandbox'
import { manifest, tempDir } from './helpers'

function req(body: string, over: Partial<RunRequest> = {}, mf: Record<string, unknown> = {}): RunRequest {
  const store = new Map<string, string>()
  return {
    manifest: manifest(mf), script: `var plugin = { refresh: async function (ctx) { ${body} } }`, fn: 'refresh',
    ctx: { inputs: { a: '1' }, secrets: {}, lang: 'fr' },
    storage: { get: (k) => store.get(k) ?? null, set: (k, v) => { store.set(k, v) } }, ...over
  }
}
async function fail(r: RunRequest): Promise<string> {
  try { await runPlugin(r); return 'ok' } catch (e) { return e instanceof PluginError ? e.code : `autre: ${String(e)}` }
}

test('simple run, context and log', async () => {
  const r = await runPlugin(req('host.log("salut", { a: 1 }); console.log("c"); return { metrics: { n: Number(ctx.inputs.a) } }'))
  assert.deepEqual(r.value, { metrics: { n: 1 } })
  assert.deepEqual(r.logs, ['salut {"a":1}', 'c'])
})

test('nothing but host: no require, process, fetch or internal functions', async () => {
  const r = await runPlugin(req('return [typeof require, typeof process, typeof fetch, typeof setTimeout, typeof __http, typeof __fread, Object.isFrozen(host)]'))
  assert.deepEqual(r.value, ['undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined', true])
})

test('storage goes through host.storage, keys checked', async () => {
  const r = req('host.storage.set("a.b-1", "v"); return host.storage.get("a.b-1")')
  assert.equal((await runPlugin(r)).value, 'v')
  assert.equal(await fail(req('host.storage.set("a:b", "v")')), 'script')
  assert.equal(await fail(req('host.storage.set("k", "x".repeat(70000))')), 'script')
})

test('limits: compute, memory, stack, result, never-resolved promise', async () => {
  assert.equal(await fail(req('for (;;) {}', { limits: { cpuMs: 300 } })), 'timeout')
  // Generous compute time: test files run in parallel, the machine may be busy.
  assert.equal(await fail(req('const a = []; for (;;) a.push("x".repeat(1e5))', { limits: { memoryBytes: 8 * 1024 * 1024, cpuMs: 60_000 } })), 'memory')
  assert.equal(await fail(req('const f = () => f(); f()', { limits: { cpuMs: 60_000 } })), 'memory')
  assert.equal(await fail(req('return "x".repeat(3e6)')), 'invalid_result')
  assert.equal(await fail(req('await new Promise(() => {})')), 'blocked_promise')
  assert.equal(await fail(req('throw new Error("boum")')), 'script')
  assert.equal(await fail({ ...req(''), fn: 'search' }), 'no_function')
})

test('files: only with the folder permission, exact byte reading', async () => {
  assert.equal(await fail(req('return host.files.list()')), 'script')
  const dir = tempDir(), bytes = Buffer.from([0, 1, 2, 254, 255, 0])
  writeFileSync(join(dir, 'a.bin'), bytes); writeFileSync(join(dir, 'b.txt'), 'text é')
  const folder = { dir, extensions: ['.bin', '.txt'] }
  const mf = { permissions: { folder: true, folderExtensions: ['.bin', '.txt'] }, inputs: [{ key: 'dir', label: 'Folder', type: 'folder' }] }
  const r = await runPlugin(req('return { names: host.files.list().map((f) => f.name).sort(), bytes: Array.from(host.files.readBytes("a.bin")), text: host.files.readText("b.txt") }', { folder }, mf))
  assert.deepEqual(r.value, { names: ['a.bin', 'b.txt'], bytes: [...bytes], text: 'text é' })
  assert.equal(await fail(req('return host.files.readText("../secret.txt")', { folder }, mf)), 'script')
  assert.equal(await fail(req('return host.files.readText("a.bin")', { folder, limits: { maxFileTotal: 2 } }, mf)), 'script')
})

test('network: declared domains only, and the plugin gets the error', async () => {
  const s = http.createServer((_q, res) => res.end('{"v":42}'))
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const port = (s.address() as AddressInfo).port
  try {
    const mf = { permissions: { network: ['exemple.com'] } }
    const ok = await runPlugin(req(`const r = await host.http("http://127.0.0.1:${port}/"); return r.json().v`, { allowLocalForTests: true, manifest: { ...manifest(mf), permissions: { network: ['127.0.0.1'], folder: false, folderExtensions: [] } } }))
    assert.equal(ok.value, 42)
    const blocked = await runPlugin(req('try { await host.http("https://interdit.com/") } catch (e) { return String(e.message) }', {}, mf))
    assert.match(String(blocked.value), /not allowed/)
    assert.equal(await fail(req('for (let i = 0; i < 40; i++) { try { await host.http("https://interdit.com/") } catch (e) {} } return 1', { limits: { maxRequests: 3 } }, mf)), 'ok')
  } finally { s.close() }
})

test('clean end of run even with a promise still pending', async () => {
  // Local server that never answers: the request is still pending when the plugin has finished (no Internet access).
  const s = http.createServer(() => { /* no answer */ })
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  try {
    const port = (s.address() as AddressInfo).port
    const r = await runPlugin(req(`new Promise(() => {}); host.http("http://127.0.0.1:${port}/").catch(() => {}); return 1`,
      { allowLocalForTests: true, manifest: { ...manifest(), permissions: { network: ['127.0.0.1'], folder: false, folderExtensions: [], images: false } } }))
    assert.equal(r.value, 1)
  } finally { s.closeAllConnections(); s.close() }
})
