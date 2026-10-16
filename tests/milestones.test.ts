import test from 'node:test'
import assert from 'node:assert/strict'
import { crossedDown, crossedUp, getPluginRule, pluginMilestoneMetrics } from '@shared/milestones'
import { manifest } from './helpers'

const m = manifest({ metrics: [
  { key: 'n', label: 'N', primary: true }, { key: 'elo', label: 'ELO', milestone: { increment: 100, notifyDown: true } },
  { key: 'pct', label: '%', format: 'percent' }, { key: 'rank', label: 'Rang', format: 'rank' }, { key: 'd', label: 'Durée', format: 'duration' }] })
const metric = (k: string) => m.metrics.find((x) => x.key === k)!

test('paliers des plugins : métriques concernées et règles par défaut', () => {
  assert.deepEqual(pluginMilestoneMetrics(m).map((x) => x.key), ['n', 'elo', 'pct'])
  const n = getPluginRule({}, m.id, metric('n')), elo = getPluginRule({}, m.id, metric('elo')), pct = getPluginRule({}, m.id, metric('pct'))
  assert.ok(n.enabled && n.sequence)
  assert.ok(elo.enabled && !elo.sequence && elo.increment === 100 && elo.notifyDown)
  assert.equal(pct.enabled, false)
  assert.equal(crossedUp(elo, 1480, 1512), 1500)
  assert.equal(crossedDown(elo, 1512, 1490), 1500)
  assert.equal(crossedUp(n, 18, 21), 20)
})

test('paliers des plugins : la règle de l’utilisateur l’emporte', () => {
  const r = getPluginRule({ [`plugin:${m.id}.elo`]: { enabled: false, sequence: false, increment: 50, custom: [], notifyDown: false } }, m.id, metric('elo'))
  assert.equal(r.enabled, false)
  assert.equal(r.increment, 50)
})
