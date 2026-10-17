import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeFilters, sanitizeRunResult } from '@shared/plugin'
import * as db from '../src/main/db'
import { pluginAccountItems, refreshPluginAccount } from '../src/main/plugins/manager'
import { manifest } from './helpers'

test('filtres : forme contrôlée, période en jours, doublons écartés', () => {
  const f = sanitizeFilters([
    { key: 'mode', label: 'Mode', field: 'mode', options: [{ value: '1v1 Ranked', label: '1v1 Ranked (3)' }, { value: '' }, 'x'] },
    { key: 'mode', label: 'Doublon', options: [{ value: 'a' }] },
    { key: 'period', label: 'Période', field: '$ts', options: [{ value: '30', label: '30 jours' }, { value: 'tout' }] },
    { key: 'champ', label: 'X', field: '$.fields.x', options: [{ value: 'a' }] },
    { key: 'bad key', label: 'X', options: [{ value: 'a' }] }                    // 5e filtre : au-delà de la limite de 4
  ])
  assert.deepEqual(f.map((x) => x.key), ['mode', 'period', 'champ'])
  assert.deepEqual(f[0].options, [{ value: '1v1 Ranked', label: '1v1 Ranked (3)' }])
  assert.deepEqual(f[1].options.map((o) => o.value), ['30'])
  assert.equal(f[2].field, undefined, 'un champ invalide est retiré, le filtre ne s’applique qu’au bilan')
  assert.deepEqual(sanitizeRunResult({ metrics: { n: 1 }, filters: [{ key: 'a', label: 'A', options: [{ value: 'x' }] }] }, manifest()).filters, [], 'manifeste sans views : ignorés')
})

test('liste filtrée par les filtres proposés par le plugin, et eux seuls', async () => {
  db.initDb()
  const script = `var plugin = { refresh: function () { return { metrics: { n: 1 }, filters: [
    { key: 'mode', label: 'Mode', field: 'mode', options: [{ value: '1v1' }, { value: '2v2' }] },
    { key: 'period', label: 'Période', field: '$ts', options: [{ value: '7' }] }] } } }`
  db.upsertPlugin('test.plugin', JSON.stringify(manifest({ views: true, itemColumns: [{ key: 'mode', label: 'Mode' }] })), script, 'h')
  const acc = db.insertPluginAccount('test.plugin', 'Compte', 'f', {})
  await refreshPluginAccount(acc)
  const now = Date.now(), day = 86_400_000
  db.savePluginItems(acc, [
    { id: 'a', title: 'A', ts: now - day, fields: { mode: '1v1' } }, { id: 'b', title: 'B', ts: now - 20 * day, fields: { mode: '1v1' } },
    { id: 'c', title: 'C', ts: now - day, fields: { mode: '2v2' } }], 'keep')
  const ids = (f: Record<string, string>): string[] => pluginAccountItems(acc, 0, 50, undefined, 'ts', true, '', 'all', f).items.map((i) => i.id)
  assert.deepEqual(ids({}), ['a', 'c', 'b'])
  assert.deepEqual(ids({ mode: '1v1' }), ['a', 'b'])
  assert.deepEqual(ids({ mode: '1v1', period: '7' }), ['a'])
  assert.deepEqual(ids({ mode: 'inconnu' }), ['a', 'c', 'b'], 'valeur non proposée : ignorée')
  assert.deepEqual(ids({ autre: 'x' }), ['a', 'c', 'b'], 'filtre non proposé : ignoré')
  db.deleteAccount(acc)
})
