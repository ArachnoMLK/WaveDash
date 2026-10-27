import test from 'node:test'
import assert from 'node:assert/strict'
import { crossedDown, crossedUp, getPluginRule, pluginMilestoneMetrics } from '@shared/milestones'
import { manifest } from './helpers'

const m = manifest({ metrics: [
  { key: 'n', label: 'N', primary: true }, { key: 'elo', label: 'ELO', milestone: { increment: 100, notifyDown: true } },
  { key: 'pct', label: '%', format: 'percent' }, { key: 'rank', label: 'Rank', format: 'rank' }, { key: 'd', label: 'Duration', format: 'duration' }] })
const metric = (k: string) => m.metrics.find((x) => x.key === k)!

test('plugin milestones: eligible metrics and default rules', () => {
  assert.deepEqual(pluginMilestoneMetrics(m).map((x) => x.key), ['n', 'elo', 'pct'])
  const n = getPluginRule({}, m.id, metric('n')), elo = getPluginRule({}, m.id, metric('elo')), pct = getPluginRule({}, m.id, metric('pct'))
  assert.ok(n.enabled && n.sequence)
  assert.ok(elo.enabled && !elo.sequence && elo.increment === 100 && elo.notifyDown)
  assert.equal(pct.enabled, false)
  assert.equal(crossedUp(elo, 1480, 1512), 1500)
  assert.equal(crossedDown(elo, 1512, 1490), 1500)
  assert.equal(crossedUp(n, 18, 21), 20)
})

test('plugin milestones: the user rule wins', () => {
  const r = getPluginRule({ [`plugin:${m.id}.elo`]: { enabled: false, sequence: false, increment: 50, custom: [], notifyDown: false } }, m.id, metric('elo'))
  assert.equal(r.enabled, false)
  assert.equal(r.increment, 50)
})

test('plugin notifications: only if declared, at most 3, bounded sizes', async () => {
  const { sanitizeRunResult } = await import('@shared/plugin')
  const raw = { metrics: { n: 1 }, notices: [{ id: 'a', title: 'T'.repeat(60), text: 'x' }, { id: 'b', title: '', text: 'x' }, { id: 'c', title: 'C', text: 'y', direction: 'down' }, { id: 'd', title: 'D', text: 'z' }, { id: 'e', title: 'E', text: 'z' }] }
  assert.deepEqual(sanitizeRunResult(raw, manifest()).notices, [])
  const got = sanitizeRunResult(raw, manifest({ notices: true })).notices
  assert.deepEqual(got.map((n) => n.id), ['a', 'c'])
  assert.equal(got[0].title.length, 40)
  assert.equal(got[1].direction, 'down')
})

test('plugin notifications: once per identifier, can be turned off per plugin', async () => {
  const db = await import('../src/main/db')
  const { processPluginNotices } = await import('../src/main/milestones')
  db.initDb()
  db.upsertPlugin('test.plugin', '{}', '', 'h')
  const acc = db.insertPluginAccount('test.plugin', 'Account', 'n', {})
  const m = manifest({ notices: true }), n = { id: 'x1', title: 'Platine', text: 'Nouveau rang', direction: 'up' as const }
  const count = (): number => db.listEvents(200).filter((e) => e.accountId === acc && e.metric === 'notice').length
  processPluginNotices(acc, 'Account', m, [n]); processPluginNotices(acc, 'Account', m, [n])
  assert.equal(count(), 1)
  db.setSettings({ pluginNotices: { 'test.plugin': false } })
  processPluginNotices(acc, 'Account', m, [{ ...n, id: 'x2' }])
  assert.equal(count(), 1)
})
