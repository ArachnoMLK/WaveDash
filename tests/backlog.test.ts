import test from 'node:test'
import assert from 'node:assert/strict'
import * as db from '../src/main/db'
import { refreshPluginAccount } from '../src/main/plugins/manager'
import { manifest } from './helpers'

test('a backlog that never goes down stops the quick reruns', async () => {
  db.initDb()
  // Fake plugin: always reports 2 items behind, like Discord 1.2.3 with empty channels.
  db.upsertPlugin('test.plugin', JSON.stringify(manifest()), 'var plugin = { refresh: function () { return { metrics: { n: 1 }, backlog: 2 } } }', 'h')
  const acc = db.insertPluginAccount('test.plugin', 'Account', 'b', {})
  for (let i = 1; i <= 4; i++) {
    await refreshPluginAccount(acc)
    assert.equal(db.getMeta(acc, 'stalled'), String(i - 1 === 0 ? 1 : i), `passage ${i}`)
  }
  assert.equal(db.getMeta(acc, 'backlog'), '2')
  // A backlog that goes down resets the counter.
  db.upsertPlugin('test.plugin', JSON.stringify(manifest()), 'var plugin = { refresh: function () { return { metrics: { n: 1 }, backlog: 1 } } }', 'h')
  await refreshPluginAccount(acc)
  assert.equal(db.getMeta(acc, 'stalled'), '0')
  db.deleteAccount(acc)                    // no account any more: the scheduled rerun will do nothing
})
