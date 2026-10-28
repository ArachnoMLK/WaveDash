// Bundled plugins, run in the real sandbox. Brawlhalla Replays is tested on real replays if present
// (WAVEDASH_REPLAYS variable, otherwise the game's default folder): they are copied to a temporary folder, never modified.
import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { PluginManifest, sanitizeDetail, sanitizeRunResult, validateManifest } from '@shared/plugin'
import { runPlugin, RunRequest } from '../src/main/plugins/sandbox'
import { exampleRaw, exampleScript, tempDir } from './helpers'

function load(id: string): { m: PluginManifest; script: string } {
  const v = validateManifest(exampleRaw(id))
  if (!v.ok) throw new Error(v.error)
  return { m: v.manifest, script: exampleScript(id) }
}
function runner(id: string, dir: string, inputs: Record<string, string>) {
  const { m, script } = load(id), store = new Map<string, string>(), logs: string[] = []
  const run = async (fn: RunRequest['fn'], extra: Partial<RunRequest['ctx']> = {}): Promise<unknown> => { const r = await runPlugin({
    manifest: m, script, fn, ctx: { inputs, secrets: {}, lang: 'en', account: { externalId: 'x', displayName: 'x' }, ...extra },
    storage: { get: (k) => store.get(k) ?? null, set: (k, v) => { if (!/^[\w.-]{1,64}$/.test(k)) throw new Error('key'); if (!store.has(k) && store.size >= 100) throw new Error('too many keys'); store.set(k, v) } },
    folder: { dir, extensions: m.permissions.folderExtensions }, limits: { cpuMs: 60_000, wallMs: 120_000 }
  }); logs.push(...r.logs); return r.value }
  return Object.assign(run, { logs })
}

test('Folder stats', async () => {
  const dir = tempDir()
  writeFileSync(join(dir, 'a.txt'), 'x'.repeat(2048)); writeFileSync(join(dir, 'b.txt'), 'y')
  const r = sanitizeRunResult(await runner('folder-stats', dir, { folder: dir })('refresh'), load('folder-stats').m)
  assert.equal(r.metrics.files, 2)
  assert.equal(r.items.length, 2)
})

const source = process.env.WAVEDASH_REPLAYS ?? join(homedir(), 'BrawlhallaReplays')
test('Brawlhalla Replays on real replays', { skip: !existsSync(source) && 'no replay folder', timeout: 300_000 }, async () => {
  const dir = tempDir()
  const names = readdirSync(source).filter((n) => n.endsWith('.replay')).map((n) => ({ n, t: statSync(join(source, n)).mtimeMs })).sort((a, b) => b.t - a.t)
  // The 25 newest and 15 oldest: formats from several patches.
  for (const { n } of [...names.slice(0, 25), ...names.slice(-15)]) { const s = statSync(join(source, n)); copyFileSync(join(source, n), join(dir, n)); utimesSync(join(dir, n), s.atime, s.mtime) }
  const run = runner('brawlhalla-replays', dir, { folder: dir, playerName: 'Close' }), { m } = load('brawlhalla-replays')

  // The plugin reads within a time budget: on a busy machine (parallel tests), it needs more passes.
  // Each pass only returns the games it just read (itemsMode keep): accumulate them, like WaveDash.
  let r = sanitizeRunResult(await run('refresh'), m), loops = 0
  const items = new Map(r.items.map((i) => [i.id, i])), bank = [...r.players]
  while (r.backlog > 0 && loops++ < 100) { r = sanitizeRunResult(await run('refresh'), m); r.items.forEach((i) => items.set(i.id, i)); bank.push(...r.players) }
  const games = [...items.values()]
  assert.equal(r.backlog, 0)
  const all = run.logs.join('\n'), failed = [...all.matchAll(/(\d+) unreadable/g)].reduce((s, x) => s + Number(x[1]), 0)
  const ignored = Number(/(\d+) games without your name/.exec([...run.logs].reverse().find((l) => /without your name/.test(l)) ?? '')?.[1] ?? 0)
  assert.equal(failed, 0, all)
  assert.equal(r.metrics.games + ignored, 40, all)
  assert.ok(r.metrics.games > 0)
  assert.ok(r.summary?.tables?.length, 'overview with tables')
  assert.ok(games.length > 0 && games.every((i) => i.ts && i.detail), 'every game is dated and detailed')

  const kinds = new Set(games.flatMap((i) => i.detail?.timeline?.events.map((e) => e.kind ?? 'ko') ?? []))
  assert.ok(kinds.has('ko') && kinds.has('action'), `richer timeline: ${[...kinds].join(', ')}`)
  assert.ok(games.some((i) => i.detail?.image?.file.endsWith('.jpg')), 'map thumbnail')

  // Top bar: filters offered, and overview recomputed for a single mode.
  assert.deepEqual(r.filters.map((f) => f.key), ['mode', 'patch', 'period'])
  const mode = r.filters[0].options[0].value
  const view = sanitizeDetail(await run('view', { filters: { mode } }))
  const nGames = (d: typeof view): number => Number(d?.stats?.find((x) => x.label === 'Games')?.value ?? -1)
  assert.ok(nGames(view) > 0 && nGames(view) <= r.metrics.games, `overview of mode ${mode}: ${nGames(view)} games`)
  assert.equal(nGames(view), games.filter((g) => g.fields.mode === mode).length, 'as many games as in the filtered list')

  const again = sanitizeRunResult(await run('refresh'), m)
  assert.equal(again.metrics.games, r.metrics.games, 'a 2nd refresh counts nothing again')

  const player = games[0].detail!.table?.rows.map((row) => String(row[0])).find((n) => n && !/close/i.test(n))
  if (player) assert.ok(sanitizeDetail(await run('search', { query: player.replace(/^.*\|\s*/, '').slice(0, 20) })), 'player search')
  const cross = sanitizeDetail(await run('cross', { cross: { who: '', measure: m.cross!.measures[0].key, a: m.cross!.dimensions[0].key, b: 'none' } }))
  assert.ok(cross?.bars?.length || cross?.table, 'cross tool')

  // Player bank: one record per player and per game read, with the same game identifier for every player of a game.
  const byGame = new Map<string, number>()
  for (const p of bank) byGame.set(p.game, (byGame.get(p.game) ?? 0) + 1)
  assert.equal(byGame.size, 40, 'one game identifier per replay')
  assert.ok([...byGame.values()].every((n) => n >= 2), 'every game has at least two players')
  const counts = new Map<string, number>()
  for (const p of bank) counts.set(p.key, (counts.get(p.key) ?? 0) + 1)
  const top = [...counts].sort((a, b) => b[1] - a[1])[0][0]
  const sheet = sanitizeDetail(await run('player', { records: bank.filter((p) => p.key === top) }))
  assert.equal(sheet?.stats?.find((x) => x.label === 'Games recorded')?.value, counts.get(top))
  assert.ok(sheet?.tables?.some((t) => t.title === 'Legends'), 'legends of the player')
})

test('Brawlhalla (official API): clear messages without a key or with an invalid input', async () => {
  const { m, script } = load('brawlhalla-api')
  const call = async (inputs: Record<string, string>, apiKey: string): Promise<string> => {
    try {
      await runPlugin({ manifest: m, script, fn: 'resolve', ctx: { inputs, secrets: { apiKey }, lang: 'en' }, storage: { get: () => null, set: () => {} } })
      return 'ok'
    } catch (e) { return String((e as Error).message) }
  }
  assert.match(await call({ player: '123' }, ''), /API key missing/)
  assert.match(await call({ player: 'steamcommunity.com/id/pseudo' }, 'k'), /Brawlhalla ID, a Steam ID64/)
})
