import test from 'node:test'
import assert from 'node:assert/strict'
import * as db from '../src/main/db'
import { PluginItem } from '@shared/plugin'

db.initDb()
db.upsertPlugin('test.plugin', '{}', '', 'h')
const acc = db.insertPluginAccount('test.plugin', 'Compte', 'ext', {})
const ts = (d: string): number => new Date(d).getTime()
const item = (id: string, date: string, fields: Record<string, string | number>, title = `Partie ${id}`): PluginItem => ({ id, title, ts: ts(date), fields })

test('éléments : mode keep (ajout et mise à jour) puis replace', () => {
  db.savePluginItems(acc, [item('1', '2026-09-01T12:00', { mode: '2v2', dur: '3:10', kos: 3 }), item('2', '2026-10-02T12:00', { mode: '1v1', dur: '2:50', kos: 1 })], 'keep')
  db.savePluginItems(acc, [item('2', '2026-10-02T12:00', { mode: '1v1', dur: '2:50', kos: 5 }), item('3', '2026-10-05T12:00', { mode: '2v2', dur: '4:00', kos: 2 }, '100%_vrai')], 'keep')
  const p = db.listPluginItems(acc, 0, 50)
  assert.equal(p.total, 3)
  assert.deepEqual(p.items.map((i) => i.id), ['3', '2', '1'])
  assert.equal(p.items[1].fields.kos, 5)
  assert.deepEqual(p.months, [{ month: '2026-10', count: 2 }, { month: '2026-09', count: 1 }])
})

test('éléments : tri par colonne, filtre par mois, pagination', () => {
  assert.deepEqual(db.listPluginItems(acc, 0, 50, undefined, 'kos', false).items.map((i) => i.id), ['3', '1', '2'])
  assert.deepEqual(db.listPluginItems(acc, 0, 50, undefined, 'title', true).items.map((i) => i.id), ['2', '1', '3'])
  assert.deepEqual(db.listPluginItems(acc, 0, 50, '2026-09').items.map((i) => i.id), ['1'])
  assert.deepEqual(db.listPluginItems(acc, 1, 1).items.map((i) => i.id), ['2'])
  assert.equal(db.listPluginItems(acc, 0, 50, undefined, 'n\'existe pas').items.length, 3)
})

test('recherche : mots, caractères spéciaux littéraux, colonne choisie, stats', () => {
  assert.deepEqual(db.listPluginItems(acc, 0, 50, undefined, 'ts', true, '2v2').items.map((i) => i.id), ['3', '1'])
  assert.deepEqual(db.listPluginItems(acc, 0, 50, undefined, 'ts', true, '100%').items.map((i) => i.id), ['3'])
  assert.equal(db.listPluginItems(acc, 0, 50, undefined, 'ts', true, '%').total, 1)
  assert.equal(db.listPluginItems(acc, 0, 50, undefined, 'ts', true, '_').total, 1)
  assert.equal(db.listPluginItems(acc, 0, 50, undefined, 'ts', true, "'; DROP TABLE plugin_items; --").total, 0)
  assert.deepEqual(db.listPluginItems(acc, 0, 50, undefined, 'ts', true, 'Partie', 'title').items.map((i) => i.id), ['2', '1'])
  assert.deepEqual(db.listPluginItems(acc, 0, 50, undefined, 'ts', true, '1v1', 'mode').items.map((i) => i.id), ['2'])
  const st = db.listPluginItems(acc, 0, 50, undefined, 'ts', true, 'v', 'all', ['kos', 'dur', 'mode']).stats!
  assert.deepEqual(st.find((s) => s.key === 'kos'), { key: 'kos', kind: 'num', n: 3, avg: 10 / 3, min: 2, max: 5, sum: 10 })
  assert.equal(st.find((s) => s.key === 'dur')!.kind, 'dur')
  assert.equal(st.find((s) => s.key === 'dur')!.sum, 190 + 170 + 240)
  assert.deepEqual(st.find((s) => s.key === 'mode')!.top, [{ value: '2v2', n: 2 }, { value: '1v1', n: 1 }])
  assert.equal(db.listPluginItems(acc, 0, 50).stats, undefined)
})

test('historique fourni par un plugin : il fait foi de son premier point à maintenant', () => {
  const now = ts('2026-10-10T00:00')
  db.insertSnapshots(acc, { n: 1 }, ts('2026-08-01T00:00'))
  db.insertSnapshots(acc, { n: 99 }, ts('2026-10-01T00:00'))
  db.insertHistory(acc, [{ ts: ts('2026-09-01T00:00'), metrics: { n: 5 } }, { ts: ts('2026-09-15T00:00'), metrics: { n: 7 } }], now)
  assert.deepEqual(db.getSeries(acc, 'n', 0).map((p) => p.value), [1, 5, 7])
})

test('stockage et suppression d’un compte : tout part avec lui', () => {
  db.pluginStorageSet('test.plugin', acc, 'k', 'v')
  db.setMeta(acc, 'backlog', '3')
  assert.deepEqual(db.pluginStorageAll('test.plugin', acc), { k: 'v' })
  db.deleteAccount(acc)
  assert.deepEqual(db.pluginStorageAll('test.plugin', acc), {})
  assert.equal(db.getMeta(acc, 'backlog'), null)
  assert.equal(db.listPluginItems(acc, 0, 50).total, 0)
  assert.equal(db.getSeries(acc, 'n', 0).length, 0)
})

test('réglages : valeurs par défaut et enregistrement', () => {
  assert.equal(db.getSettings().seeThroughMaximized, true)
  assert.equal(db.setSettings({ seeThroughMaximized: false }).seeThroughMaximized, false)
})
