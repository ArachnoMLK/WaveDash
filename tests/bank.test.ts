import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { sanitizePlayerRecord, sanitizeRunResult } from '@shared/plugin'
import * as db from '../src/main/db'
import { exportBank, importBank } from '../src/main/bank'
import { manifest, tempDir } from './helpers'

const rec = (key: string, name: string, game: string, ts: number, data: Record<string, unknown> = { L: 3, w: 1 }): Record<string, unknown> => ({ key, name, game, ts, data })

test('player records: checked keys, names, dates and fields', () => {
  const now = Date.now()
  assert.equal(sanitizePlayerRecord(rec('p 1', 'A', 'g1', now)), null, 'space in the key')
  assert.equal(sanitizePlayerRecord(rec('p1', '  ', 'g1', now)), null, 'empty name')
  assert.equal(sanitizePlayerRecord(rec('p1', 'A', 'g1', now + 3 * 86_400_000)), null, 'date in the future')
  const r = sanitizePlayerRecord(rec('p1', ' Alby ', 'g1', now, { L: 3, md: 'x'.repeat(500), g: Array(30).fill(1), bad: { o: 1 }, '1x': 2, n: Infinity }))!
  assert.equal(r.name, 'Alby')
  assert.equal((r.data.md as string).length, 300)
  assert.equal((r.data.g as number[]).length, 16)
  assert.deepEqual(Object.keys(r.data).sort(), ['L', 'g', 'md'])
})

test('player records are kept only when the manifest declares players', () => {
  const raw = { metrics: { n: 1 }, players: [rec('p1', 'A', 'g1', Date.now())] }
  assert.equal(sanitizeRunResult(raw, manifest()).players.length, 0)
  assert.equal(sanitizeRunResult(raw, manifest({ players: true })).players.length, 1)
})

test('bank: one row per player and game, search by former names and by key, newest first', () => {
  db.initDb()
  const t0 = Date.UTC(2026, 0, 1)
  const local = [rec('p42', 'OldName', 'gA', t0), rec('p42', 'NewName', 'gB', t0 + 1000), rec('p7', 'Other', 'gA', t0)].map((r) => sanitizePlayerRecord(r)!)
  assert.equal(db.savePlayerRecords('wavedash.brawlhalla-replays', local, 'local'), 3)
  assert.equal(db.savePlayerRecords('wavedash.brawlhalla-replays', local, 'local'), 0, 'a 2nd read adds nothing')
  const found = db.searchPlayers('oldna')
  assert.equal(found.length, 1)
  assert.deepEqual([found[0].key, found[0].name, found[0].games], ['p42', 'NewName', 2], 'latest name, all games')
  assert.equal(db.searchPlayers('p7')[0]?.name, 'Other', 'exact key')
  assert.deepEqual(db.playerRecords('wavedash.brawlhalla-replays', 'p42', 10).map((r) => r.game), ['gB', 'gA'])
})

test('.wdbank: export of local records, import without duplicates, bad rows and files rejected', () => {
  const dir = tempDir(), file = join(dir, 'me.wdbank')
  assert.equal(exportBank(file, '1.7.0').rows, db.bankRecordsOf('local').reduce((n, s) => n + s.rows.length, 0))
  const again = importBank(file)
  assert.deepEqual([again.added, again.rejected, again.error], [0, 0, undefined], 'everything already known')

  const friend = join(dir, 'friend.wdbank'), t = Date.UTC(2026, 1, 1)
  writeFileSync(friend, gzipSync(JSON.stringify({ format: 'wdbank', version: 1, sources: [
    { source: 'wavedash.brawlhalla-replays', rows: [rec('p42', 'NewName', 'gA', t), rec('p99', 'Friend', 'gC', t), rec('bad key', 'X', 'gC', t)] },
    { source: '../evil', rows: [rec('p1', 'X', 'g1', t)] }] })))
  const r = importBank(friend)
  assert.deepEqual([r.added, r.known, r.rejected], [1, 1, 1], 'gA was already known (same game), gC is new, one row rejected')
  assert.equal(db.searchPlayers('friend')[0]?.games, 1)
  assert.ok(db.bankStats().origins.some((o) => o.origin === 'import:friend.wdbank'))

  const junk = join(dir, 'junk.wdbank'); writeFileSync(junk, 'not gzip')
  assert.equal(importBank(junk).error, 'format')
  assert.equal(db.forgetBankOrigin('import:friend.wdbank'), 1)
  assert.equal(db.searchPlayers('friend').length, 0)
})
