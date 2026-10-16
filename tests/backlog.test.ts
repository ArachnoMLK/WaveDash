import test from 'node:test'
import assert from 'node:assert/strict'
import * as db from '../src/main/db'
import { refreshPluginAccount } from '../src/main/plugins/manager'
import { manifest } from './helpers'

test('un retard qui ne baisse jamais arrête les relances rapides', async () => {
  db.initDb()
  // Faux plugin : signale toujours 2 éléments en retard, comme Discord 1.2.3 avec des salons vides.
  db.upsertPlugin('test.plugin', JSON.stringify(manifest()), 'var plugin = { refresh: function () { return { metrics: { n: 1 }, backlog: 2 } } }', 'h')
  const acc = db.insertPluginAccount('test.plugin', 'Compte', 'b', {})
  for (let i = 1; i <= 4; i++) {
    await refreshPluginAccount(acc)
    assert.equal(db.getMeta(acc, 'stalled'), String(i - 1 === 0 ? 1 : i), `passage ${i}`)
  }
  assert.equal(db.getMeta(acc, 'backlog'), '2')
  // Un retard qui baisse remet le compteur à zéro.
  db.upsertPlugin('test.plugin', JSON.stringify(manifest()), 'var plugin = { refresh: function () { return { metrics: { n: 1 }, backlog: 1 } } }', 'h')
  await refreshPluginAccount(acc)
  assert.equal(db.getMeta(acc, 'stalled'), '0')
  db.deleteAccount(acc)                    // plus de compte : la relance programmée ne fera rien
})
