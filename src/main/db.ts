// Base SQLite locale : comptes, historique (snapshots), contenus, légendes, paramètres.
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import {
  Account, DEFAULT_SETTINGS, ItemStat, LatestMetrics, LegendStat, MetricKey, MilestoneEvent, Platform, Point, Settings
} from '@shared/types'

let db: Database.Database

export function initDb(): void {
  db = new Database(join(app.getPath('userData'), 'wavedash.sqlite'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL, input TEXT NOT NULL, display_name TEXT NOT NULL,
      external_id TEXT NOT NULL, avatar TEXT, demo INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, last_sync_at INTEGER, last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      metric TEXT NOT NULL, ts INTEGER NOT NULL, value REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snap ON snapshots(account_id, metric, ts);
    CREATE TABLE IF NOT EXISTS items (
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      external_id TEXT NOT NULL, title TEXT NOT NULL, published_at INTEGER NOT NULL,
      views INTEGER NOT NULL, likes INTEGER NOT NULL, comments INTEGER NOT NULL,
      PRIMARY KEY (account_id, external_id)
    );
    CREATE TABLE IF NOT EXISTS item_snapshots (
      account_id INTEGER NOT NULL, item_external_id TEXT NOT NULL, ts INTEGER NOT NULL,
      views INTEGER NOT NULL, likes INTEGER NOT NULL, comments INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS legend_stats (
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      legend_id INTEGER NOT NULL, name TEXT NOT NULL, games INTEGER, wins INTEGER, kos INTEGER,
      falls INTEGER, damage_dealt INTEGER, match_time INTEGER, level INTEGER,
      PRIMARY KEY (account_id, legend_id)
    );
    -- Tables prévues pour les étapes suivantes (paliers, notifications, rivaux).
    CREATE TABLE IF NOT EXISTS rivals (id INTEGER PRIMARY KEY AUTOINCREMENT, brawlhalla_id TEXT NOT NULL, name TEXT);
    CREATE TABLE IF NOT EXISTS milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT, metric TEXT, kind TEXT, value REAL, enabled INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS milestone_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER, metric TEXT, value REAL, direction TEXT, ts INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    -- Valeurs non numériques propres à un compte (ex. rang Brawlhalla précédent).
    CREATE TABLE IF NOT EXISTS account_meta (
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, key TEXT NOT NULL, value TEXT NOT NULL,
      PRIMARY KEY (account_id, key)
    );
  `)
  // Migration : la table milestone_events (créée en 0.1) reçoit une colonne pour le détail JSON.
  const cols = db.prepare('PRAGMA table_info(milestone_events)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'detail')) db.exec('ALTER TABLE milestone_events ADD COLUMN detail TEXT')
}

/* ---------- Paramètres ---------- */
export function getSettings(): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const stored: Record<string, unknown> = {}
  for (const r of rows) stored[r.key] = JSON.parse(r.value)
  return { ...DEFAULT_SETTINGS, ...stored } as Settings
}

export function setSettings(patch: Partial<Settings>): Settings {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  const tx = db.transaction(() => { for (const [k, v] of Object.entries(patch)) stmt.run(k, JSON.stringify(v)) })
  tx()
  return getSettings()
}

/* ---------- Comptes ---------- */
type AccountRow = {
  id: number; platform: Platform; input: string; display_name: string; external_id: string
  avatar: string | null; demo: number; created_at: number; last_sync_at: number | null; last_error: string | null
}
const toAccount = (r: AccountRow): Account => ({
  id: r.id, platform: r.platform, input: r.input, displayName: r.display_name, externalId: r.external_id,
  avatar: r.avatar ?? undefined, demo: !!r.demo, createdAt: r.created_at, lastSyncAt: r.last_sync_at, lastError: r.last_error
})

export const listAccounts = (): Account[] =>
  (db.prepare('SELECT * FROM accounts ORDER BY id').all() as AccountRow[]).map(toAccount)

export const getAccount = (id: number): Account | undefined => {
  const r = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined
  return r && toAccount(r)
}

export function insertAccount(a: Omit<Account, 'id' | 'createdAt' | 'lastSyncAt' | 'lastError'>): Account {
  const info = db.prepare(
    'INSERT INTO accounts (platform, input, display_name, external_id, avatar, demo, created_at) VALUES (?,?,?,?,?,?,?)'
  ).run(a.platform, a.input, a.displayName, a.externalId, a.avatar ?? null, a.demo ? 1 : 0, Date.now())
  return getAccount(Number(info.lastInsertRowid))!
}

export const deleteAccount = (id: number): void => { db.prepare('DELETE FROM accounts WHERE id = ?').run(id) }

export const markSync = (id: number, error: string | null): void => {
  db.prepare('UPDATE accounts SET last_sync_at = ?, last_error = ? WHERE id = ?').run(error ? null : Date.now(), error, id)
}

/* ---------- Historique ---------- */
export function insertSnapshots(accountId: number, metrics: Partial<Record<MetricKey, number>>, ts = Date.now()): void {
  const stmt = db.prepare('INSERT INTO snapshots (account_id, metric, ts, value) VALUES (?,?,?,?)')
  const tx = db.transaction(() => {
    for (const [m, v] of Object.entries(metrics)) if (typeof v === 'number' && Number.isFinite(v)) stmt.run(accountId, m, ts, v)
  })
  tx()
}

export const getSeries = (accountId: number, metric: MetricKey, sinceMs: number): Point[] =>
  db.prepare('SELECT ts, value FROM snapshots WHERE account_id = ? AND metric = ? AND ts >= ? ORDER BY ts')
    .all(accountId, metric, sinceMs) as Point[]

export function getLatest(accountId: number): LatestMetrics {
  const rows = db.prepare(`
    SELECT metric, value FROM snapshots s WHERE account_id = ?
    AND ts = (SELECT MAX(ts) FROM snapshots WHERE account_id = s.account_id AND metric = s.metric)
  `).all(accountId) as { metric: MetricKey; value: number }[]
  return Object.fromEntries(rows.map((r) => [r.metric, r.value]))
}

/* ---------- Contenus et légendes ---------- */
export function saveItems(accountId: number, items: ItemStat[]): void {
  const up = db.prepare(`INSERT INTO items (account_id, external_id, title, published_at, views, likes, comments)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(account_id, external_id) DO UPDATE SET
    title = excluded.title, views = excluded.views, likes = excluded.likes, comments = excluded.comments`)
  const hist = db.prepare('INSERT INTO item_snapshots VALUES (?,?,?,?,?,?)')
  const now = Date.now()
  db.transaction(() => {
    for (const i of items) {
      up.run(accountId, i.externalId, i.title, i.publishedAt, i.views, i.likes, i.comments)
      hist.run(accountId, i.externalId, now, i.views, i.likes, i.comments)
    }
  })()
}

export const getItems = (accountId: number): ItemStat[] =>
  (db.prepare('SELECT * FROM items WHERE account_id = ? ORDER BY views DESC LIMIT 50').all(accountId) as any[])
    .map((r) => ({ externalId: r.external_id, title: r.title, publishedAt: r.published_at, views: r.views, likes: r.likes, comments: r.comments }))

export function saveLegends(accountId: number, legends: LegendStat[]): void {
  const up = db.prepare(`INSERT INTO legend_stats VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(account_id, legend_id) DO UPDATE SET name=excluded.name, games=excluded.games, wins=excluded.wins,
    kos=excluded.kos, falls=excluded.falls, damage_dealt=excluded.damage_dealt, match_time=excluded.match_time, level=excluded.level`)
  db.transaction(() => {
    for (const l of legends) up.run(accountId, l.legendId, l.name, l.games, l.wins, l.kos, l.falls, l.damageDealt, l.matchTimeSec, l.level)
  })()
}

export const getLegends = (accountId: number): LegendStat[] =>
  (db.prepare('SELECT * FROM legend_stats WHERE account_id = ? ORDER BY games DESC').all(accountId) as any[])
    .map((r) => ({ legendId: r.legend_id, name: r.name, games: r.games, wins: r.wins, kos: r.kos, falls: r.falls,
      damageDealt: r.damage_dealt, matchTimeSec: r.match_time, level: r.level }))

/* ---------- Valeurs propres à un compte (rang précédent) ---------- */
export const getMeta = (accountId: number, key: string): string | null =>
  (db.prepare('SELECT value FROM account_meta WHERE account_id = ? AND key = ?').get(accountId, key) as { value: string } | undefined)?.value ?? null
export const setMeta = (accountId: number, key: string, value: string): void => {
  db.prepare('INSERT INTO account_meta VALUES (?,?,?) ON CONFLICT(account_id, key) DO UPDATE SET value = excluded.value').run(accountId, key, value)
}

/* ---------- Événements de paliers ---------- */
export function insertEvent(e: Omit<MilestoneEvent, 'id'>): number {
  const { id: _id, ...detail } = e as MilestoneEvent
  const info = db.prepare('INSERT INTO milestone_events (account_id, metric, value, direction, ts, detail) VALUES (?,?,?,?,?,?)')
    .run(e.accountId, e.metric, e.threshold, e.direction, e.ts, JSON.stringify(detail))
  return Number(info.lastInsertRowid)
}

export function listEvents(limit = 50): MilestoneEvent[] {
  const rows = db.prepare('SELECT id, detail FROM milestone_events WHERE detail IS NOT NULL ORDER BY ts DESC, id DESC LIMIT ?').all(limit) as { id: number; detail: string }[]
  const out: MilestoneEvent[] = []
  for (const r of rows) { try { out.push({ ...JSON.parse(r.detail), id: r.id }) } catch { /* ligne illisible ignorée */ } }
  return out
}

/* ---------- Export ---------- */
export interface SnapshotRow { platform: Platform; account: string; metric: string; ts: number; value: number }
export const allSnapshotRows = (): SnapshotRow[] =>
  db.prepare(`SELECT a.platform AS platform, a.display_name AS account, s.metric AS metric, s.ts AS ts, s.value AS value
    FROM snapshots s JOIN accounts a ON a.id = s.account_id ORDER BY a.platform, s.metric, s.ts`).all() as SnapshotRow[]

/** Dernière valeur connue d'une métrique à l'instant `ts` (ou avant), sinon null. */
export const valueAt = (accountId: number, metric: MetricKey, ts: number): number | null =>
  (db.prepare('SELECT value FROM snapshots WHERE account_id = ? AND metric = ? AND ts <= ? ORDER BY ts DESC LIMIT 1').get(accountId, metric, ts) as { value: number } | undefined)?.value ?? null
