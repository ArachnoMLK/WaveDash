import test from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, DETAIL_LIMITS, sanitizeDetail, sanitizeResolveResult, sanitizeRunResult, validateManifest } from '@shared/plugin'
import { exampleIds, exampleRaw, manifest } from './helpers'

const base = { wdsh: 1, id: 'test.plugin', name: 'Test', version: '1.0.0', metrics: [{ key: 'n', label: 'N' }] }
const err = (over: Record<string, unknown>): string | undefined => { const v = validateManifest({ ...base, ...over }); return v.ok ? undefined : v.error }

test('les manifestes des plugins fournis sont valides', () => {
  for (const id of exampleIds()) { const v = validateManifest(exampleRaw(id)); assert.ok(v.ok, `${id} : ${v.ok ? '' : v.error}`) }
})

test('manifeste : refus de ce qui est incorrect', () => {
  assert.equal(err({ wdsh: 2 }), 'format_version')
  assert.equal(err({ id: 'A' }), 'id')
  assert.equal(err({ id: '../evil' }), 'id')
  assert.equal(err({ version: '1.0' }), 'version')
  assert.equal(err({ entry: '../x.js' }), 'entry')
  assert.equal(err({ entry: 'C:/x.js' }), 'entry')
  assert.equal(err({ permissions: { network: ['http://exemple.com'] } }), 'permissions.network')
  assert.equal(err({ permissions: { network: ['localhost'] } }), 'permissions.network')
  assert.equal(err({ permissions: { network: ['*'] } }), 'permissions.network')
  assert.equal(err({ permissions: { network: ['192.168.1.1'] } }), 'permissions.network')
  assert.equal(err({ permissions: 'all' }), 'permissions')
  assert.equal(err({ permissions: { folder: true } }), 'folder_input')
  assert.equal(err({ inputs: [{ key: 'd', label: 'D', type: 'folder' }] }), 'folder_permission')
  assert.equal(err({ metrics: [] }), 'metrics')
  assert.equal(err({ metrics: [{ key: 'n', label: 'N' }, { key: 'n', label: 'N2' }] }), 'metrics')
  assert.equal(err({ itemsMode: 'append' }), 'itemsMode')
  assert.equal(err({ inputs: [{ key: 'a', label: 'A', type: 'text' }, { key: 'a', label: 'B', type: 'text' }] }), 'inputs')
})

test('manifeste : valeurs par défaut et bornes', () => {
  const m = manifest({ refreshMinutes: 1 })
  assert.equal(m.refreshMinutes, 5)
  assert.equal(manifest({ refreshMinutes: 99999 }).refreshMinutes, 1440)
  assert.equal(m.entry, 'main.js')
  assert.equal(m.itemsMode, 'replace')
  assert.equal(m.search, false)
  assert.deepEqual(m.permissions, { network: [], folder: false, folderExtensions: [], images: false })
  assert.equal(manifest({ cross: { measures: [{ key: 'm', label: 'M' }], dimensions: [{ key: 'bad key', label: 'D' }] } }).cross, undefined)
  assert.ok(manifest({ cross: { measures: [{ key: 'm', label: 'M' }], dimensions: [{ key: 'd', label: 'D' }] } }).cross)
})

test('manifeste : paliers proposés par une métrique', () => {
  const m = manifest({ metrics: [{ key: 'elo', label: 'ELO', milestone: { increment: 100, notifyDown: true } }] })
  assert.deepEqual(m.metrics[0].milestone, { enabled: undefined, increment: 100, notifyDown: true })
  assert.equal(err({ metrics: [{ key: 'n', label: 'N', milestone: { increment: 0 } }] }), 'metrics')
  assert.equal(err({ metrics: [{ key: 'n', label: 'N', milestone: { increment: 1.5 } }] }), 'metrics')
  assert.equal(err({ metrics: [{ key: 'n', label: 'N', milestone: 'oui' }] }), 'metrics')
  assert.equal(err({ metrics: [{ key: 'n', label: 'N', milestone: { notifyDown: 1 } }] }), 'metrics')
})

test('versions', () => {
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0)
  assert.equal(compareVersions('2.0.0', '2.0.0'), 0)
  assert.ok(compareVersions('0.9.0', '1.0.0') < 0)
})

test('résultat : seules les métriques déclarées, nombres finis, dates plausibles', () => {
  const m = manifest({ itemColumns: [{ key: 'k', label: 'K' }] }), now = 1_800_000_000_000
  const r = sanitizeRunResult({
    metrics: { n: 5, other: 3, bad: Infinity }, backlog: 12.7,
    items: [{ id: 'a', title: 'A', ts: now + 10 * 86_400_000, fields: { k: 'x'.repeat(500), z: 1 } }, { id: 3, title: 'bad' }],
    history: [{ ts: now - 1000, metrics: { n: 4 } }, { ts: now + 3 * 86_400_000, metrics: { n: 9 } }, { ts: now - 5, metrics: { zz: 1 } }]
  }, m, now)
  assert.deepEqual(r.metrics, { n: 5 })
  assert.equal(r.backlog, 12)
  assert.equal(r.items.length, 1)
  assert.equal(r.items[0].ts, undefined)
  assert.deepEqual(Object.keys(r.items[0].fields), ['k'])
  assert.equal((r.items[0].fields.k as string).length, 200)
  assert.deepEqual(r.history, [{ ts: now - 1000, metrics: { n: 4 } }])
  assert.equal(sanitizeRunResult(null, m).backlog, 0)
  assert.equal(sanitizeRunResult({ metrics: { n: 1 }, backlog: -4 }, m).backlog, 0)
})

test('détail : tailles bornées, types contrôlés', () => {
  const L = DETAIL_LIMITS
  const d = sanitizeDetail({
    chips: Array(50).fill('c'), stats: [{ label: 'a', value: NaN }, null],
    table: { columns: Array(20).fill('col'), rows: [...Array(200)].map(() => Array(20).fill(1)) },
    grids: [{ rows: ['a'], cols: ['b'], values: [['x']] }],
    series: [{ step: 0, lines: [] }, { step: 60, lines: [{ name: 'l', values: Array(2000).fill(1) }] }],
    bars: [{ categories: ['a', 'b'], series: [{ name: 's', values: [1] }] }],
    timeline: { duration: 100, lanes: ['x'], events: [{ t: 5, lane: 0, kind: 'action' }, { t: 5, lane: 3 }, { t: -1, lane: 0 }, { t: 6, lane: 0, kind: 'boum' }] },
    script: '<script>'
  })!
  assert.equal(d.chips!.length, L.chips)
  assert.deepEqual(d.stats, [{ label: 'a', value: 0 }])
  assert.equal(d.table!.columns.length, L.columns)
  assert.equal(d.table!.rows.length, L.rows)
  assert.deepEqual(d.grids![0].values, [[0]])
  assert.equal(d.series!.length, 1)
  assert.equal(d.series![0].lines[0].values.length, L.points)
  assert.deepEqual(d.bars![0].series[0].values, [1, 0])
  assert.deepEqual(d.timeline!.events.map((e) => e.kind), ['action', undefined])
  assert.equal((d as Record<string, unknown>).script, undefined)
  assert.equal(sanitizeDetail({}), undefined)
  assert.equal(sanitizeDetail('x'), undefined)
})

test('resolve : identifiant et nom obligatoires', () => {
  assert.deepEqual(sanitizeResolveResult({ externalId: ' a ', displayName: ' B ' }), { externalId: 'a', displayName: 'B' })
  assert.equal(sanitizeResolveResult({ externalId: 'a' }), null)
  assert.equal(sanitizeResolveResult({ externalId: '  ', displayName: 'B' }), null)
})
