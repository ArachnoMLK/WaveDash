import test from 'node:test'
import assert from 'node:assert/strict'
import * as db from '../src/main/db'
import * as secrets from '../src/main/secrets'
import { migrateBuiltinBrawlhalla, removeSocialPlaceholders } from '../src/main/migrations'
import { listPluginAccounts } from '../src/main/plugins/manager'

test('Brawlhalla intégré → plugin : démo supprimée, vrai compte rattaché avec historique, clé et paliers', () => {
  db.initDb()
  const demo = db.insertAccount({ platform: 'brawlhalla' as never, input: 'x', displayName: 'Démo', externalId: 'd', demo: true })
  const real = db.insertAccount({ platform: 'brawlhalla' as never, input: '7656119000000000', displayName: 'Joueur', externalId: '123', demo: false })
  db.insertSnapshots(real.id, { elo_1v1: 1500 } as never, 1000)
  secrets.setSecret('brawlhalla.apiKey' as never, 'cle-de-test')
  db.setSettings({ milestoneRules: { 'brawlhalla.games': { enabled: true, sequence: true, increment: 0, custom: [], notifyDown: false } } })

  const refreshed: number[] = []
  migrateBuiltinBrawlhalla(async (id) => { refreshed.push(id) })      // aucun appel réseau pendant les tests

  assert.equal(db.getAccount(demo.id), undefined)
  const pa = listPluginAccounts().find((a) => a.id === real.id)!
  assert.equal(pa.pluginId, 'wavedash.brawlhalla-api')
  assert.deepEqual(pa.inputs, { player: '7656119000000000' })
  assert.ok(db.getPluginRow('wavedash.brawlhalla-api'), 'plugin fourni installé')
  assert.deepEqual(db.getSeries(real.id, 'elo_1v1', 0).map((p) => p.value), [1500])
  assert.equal(secrets.getSecret('plugin:wavedash.brawlhalla-api:apiKey'), 'cle-de-test')
  assert.equal(secrets.hasSecret('brawlhalla.apiKey' as never), false)
  const rules = db.getSettings().milestoneRules
  assert.ok(rules['plugin:wavedash.brawlhalla-api.games'])
  assert.equal(rules['plugin:wavedash.brawlhalla-api.elo_1v1'].increment, 100)
  assert.equal(rules['brawlhalla.games'], undefined)

  assert.deepEqual(refreshed, [real.id], 'le compte converti est actualisé')
  migrateBuiltinBrawlhalla(async () => {})      // deuxième passage : rien ne change
  assert.equal(listPluginAccounts().filter((a) => a.id === real.id).length, 1)
})

test('Instagram et TikTok intégrés : comptes de démo supprimés, YouTube intact', () => {
  db.initDb()
  const ig = db.insertAccount({ platform: 'instagram' as never, input: 'x', displayName: 'IG', externalId: 'i', demo: true })
  const tk = db.insertAccount({ platform: 'tiktok' as never, input: 'x', displayName: 'TK', externalId: 't', demo: true })
  const yt = db.insertAccount({ platform: 'youtube', input: 'x', displayName: 'YT', externalId: 'y', demo: true })
  removeSocialPlaceholders()
  assert.equal(db.getAccount(ig.id), undefined)
  assert.equal(db.getAccount(tk.id), undefined)
  assert.ok(db.getAccount(yt.id))
})
