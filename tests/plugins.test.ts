// Plugins fournis, exécutés dans le vrai bac à sable. Brawlhalla Replays est testé sur des replays réels s'ils sont présents
// (variable WAVEDASH_REPLAYS, sinon le dossier par défaut du jeu) : ils sont copiés dans un dossier temporaire, jamais modifiés.
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
    manifest: m, script, fn, ctx: { inputs, secrets: {}, lang: 'fr', account: { externalId: 'x', displayName: 'x' }, ...extra },
    storage: { get: (k) => store.get(k) ?? null, set: (k, v) => { if (!/^[\w.-]{1,64}$/.test(k)) throw new Error('clé'); if (!store.has(k) && store.size >= 100) throw new Error('trop de clés'); store.set(k, v) } },
    folder: { dir, extensions: m.permissions.folderExtensions }, limits: { cpuMs: 60_000, wallMs: 120_000 }
  }); logs.push(...r.logs); return r.value }
  return Object.assign(run, { logs })
}

test('Statistiques de dossier', async () => {
  const dir = tempDir()
  writeFileSync(join(dir, 'a.txt'), 'x'.repeat(2048)); writeFileSync(join(dir, 'b.txt'), 'y')
  const r = sanitizeRunResult(await runner('folder-stats', dir, { folder: dir })('refresh'), load('folder-stats').m)
  assert.equal(r.metrics.files, 2)
  assert.equal(r.items.length, 2)
})

const source = process.env.WAVEDASH_REPLAYS ?? join(homedir(), 'BrawlhallaReplays')
test('Brawlhalla Replays sur des replays réels', { skip: !existsSync(source) && 'aucun dossier de replays', timeout: 300_000 }, async () => {
  const dir = tempDir()
  const names = readdirSync(source).filter((n) => n.endsWith('.replay')).map((n) => ({ n, t: statSync(join(source, n)).mtimeMs })).sort((a, b) => b.t - a.t)
  // Les 25 plus récents et 15 plus anciens : formats de plusieurs patchs.
  for (const { n } of [...names.slice(0, 25), ...names.slice(-15)]) { const s = statSync(join(source, n)); copyFileSync(join(source, n), join(dir, n)); utimesSync(join(dir, n), s.atime, s.mtime) }
  const run = runner('brawlhalla-replays', dir, { folder: dir, playerName: 'Close' }), { m } = load('brawlhalla-replays')

  // Le plugin lit selon un budget de temps : sur une machine chargée (tests en parallèle), il lui faut plus de passages.
  // Chaque passage ne renvoie que les parties qu'il vient de lire (itemsMode keep) : on les cumule, comme WaveDash.
  let r = sanitizeRunResult(await run('refresh'), m), loops = 0
  const items = new Map(r.items.map((i) => [i.id, i]))
  while (r.backlog > 0 && loops++ < 100) { r = sanitizeRunResult(await run('refresh'), m); r.items.forEach((i) => items.set(i.id, i)) }
  const games = [...items.values()]
  assert.equal(r.backlog, 0)
  const all = run.logs.join('\n'), failed = [...all.matchAll(/(\d+) illisibles/g)].reduce((s, x) => s + Number(x[1]), 0)
  const ignored = Number(/(\d+) parties sans ton pseudo/.exec([...run.logs].reverse().find((l) => /sans ton pseudo/.test(l)) ?? '')?.[1] ?? 0)
  assert.equal(failed, 0, all)
  assert.equal(r.metrics.games + ignored, 40, all)
  assert.ok(r.metrics.games > 0)
  assert.ok(r.summary?.tables?.length, 'bilan avec tableaux')
  assert.ok(games.length > 0 && games.every((i) => i.ts && i.detail), 'chaque partie est datée et détaillée')

  const kinds = new Set(games.flatMap((i) => i.detail?.timeline?.events.map((e) => e.kind ?? 'ko') ?? []))
  assert.ok(kinds.has('ko') && kinds.has('action'), `frise enrichie : ${[...kinds].join(', ')}`)
  assert.ok(games.some((i) => i.detail?.image?.file.endsWith('.jpg')), 'vignette de carte')

  const again = sanitizeRunResult(await run('refresh'), m)
  assert.equal(again.metrics.games, r.metrics.games, 'une 2e actualisation ne recompte rien')

  const player = games[0].detail!.table?.rows.map((row) => String(row[0])).find((n) => n && !/close/i.test(n))
  if (player) assert.ok(sanitizeDetail(await run('search', { query: player.replace(/^.*\|\s*/, '').slice(0, 20) })), 'recherche d’un joueur')
  const cross = sanitizeDetail(await run('cross', { cross: { who: '', measure: m.cross!.measures[0].key, a: m.cross!.dimensions[0].key, b: 'none' } }))
  assert.ok(cross?.bars?.length || cross?.table, 'croisement')
})

test('Brawlhalla (API officielle) : messages clairs sans clé ou avec une saisie invalide', async () => {
  const { m, script } = load('brawlhalla-api')
  const call = async (inputs: Record<string, string>, apiKey: string): Promise<string> => {
    try {
      await runPlugin({ manifest: m, script, fn: 'resolve', ctx: { inputs, secrets: { apiKey }, lang: 'fr' }, storage: { get: () => null, set: () => {} } })
      return 'ok'
    } catch (e) { return String((e as Error).message) }
  }
  assert.match(await call({ player: '123' }, ''), /Clé API manquante/)
  assert.match(await call({ player: 'steamcommunity.com/id/pseudo' }, 'k'), /ID Brawlhalla, un Steam ID64/)
})
