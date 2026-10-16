// Base SQLite locale : comptes, historique (snapshots), contenus, légendes, paramètres.
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import {
  Account, DEFAULT_SETTINGS, ItemStat, LatestMetrics, LegendStat, MetricKey, MilestoneEvent, Platform, Point, Settings
} from '@shared/types'
import { ColumnStat, PLUGIN_LIMITS, PluginItem, PluginItemsPage } from '@shared/plugin'

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
    -- Plugins .wdsh : le script installé, ses comptes (liés à une ligne de la table accounts, plateforme plugin) et son stockage.
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY, manifest TEXT NOT NULL, script TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      installed_at INTEGER NOT NULL, failures INTEGER NOT NULL DEFAULT 0, last_error TEXT, hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plugin_accounts (
      account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE, inputs TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plugin_storage (
      plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE, account_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
      PRIMARY KEY (plugin_id, account_id, key)
    );
    -- Valeurs non numériques propres à un compte (ex. rang Brawlhalla précédent).
    CREATE TABLE IF NOT EXISTS account_meta (
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, key TEXT NOT NULL, value TEXT NOT NULL,
      PRIMARY KEY (account_id, key)
    );
    -- Éléments renvoyés par un plugin (JSON déjà validé), consultés page par page.
    CREATE TABLE IF NOT EXISTS plugin_items (
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, item_id TEXT NOT NULL, ts INTEGER NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY (account_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_plugin_items ON plugin_items(account_id, ts);
  `)
  // Migration 0.6.2 : les éléments de plugin étaient un seul JSON dans account_meta.
  const old = db.prepare("SELECT account_id, value FROM account_meta WHERE key = 'items'").all() as { account_id: number; value: string }[]
  for (const o of old) {
    try { savePluginItems(o.account_id, JSON.parse(o.value) as PluginItem[], 'replace') } catch { /* JSON illisible : ignoré */ }
    db.prepare("DELETE FROM account_meta WHERE account_id = ? AND key = 'items'").run(o.account_id)
  }
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
  (db.prepare("SELECT * FROM accounts WHERE platform != 'plugin' ORDER BY id").all() as AccountRow[]).map(toAccount)

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

export const deleteAccount = (id: number): void => {
  db.transaction(() => {
    db.prepare('DELETE FROM plugin_storage WHERE account_id = ?').run(id)   // le stockage d'un plugin n'a pas de lien étranger vers accounts
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
  })()
}

export const markSync = (id: number, error: string | null): void => {
  db.prepare('UPDATE accounts SET last_sync_at = ?, last_error = ? WHERE id = ?').run(error ? null : Date.now(), error, id)
}

/* ---------- Historique ---------- */
export function insertSnapshots(accountId: number, metrics: Partial<Record<string, number>>, ts = Date.now()): void {
  const stmt = db.prepare('INSERT INTO snapshots (account_id, metric, ts, value) VALUES (?,?,?,?)')
  const tx = db.transaction(() => {
    for (const [m, v] of Object.entries(metrics)) if (typeof v === 'number' && Number.isFinite(v)) stmt.run(accountId, m, ts, v)
  })
  tx()
}

export const getSeries = (accountId: number, metric: string, sinceMs: number): Point[] =>
  db.prepare('SELECT ts, value FROM snapshots WHERE account_id = ? AND metric = ? AND ts >= ? ORDER BY ts')
    .all(accountId, metric, sinceMs) as Point[]

export function getLatest(accountId: number): Record<string, number> {
  const rows = db.prepare(`
    SELECT metric, value FROM snapshots s WHERE account_id = ?
    AND ts = (SELECT MAX(ts) FROM snapshots WHERE account_id = s.account_id AND metric = s.metric)
  `).all(accountId) as { metric: string; value: number }[]
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
export interface SnapshotRow { platform: string; account: string; metric: string; ts: number; value: number }
export const allSnapshotRows = (): SnapshotRow[] =>
  db.prepare(`SELECT COALESCE('plugin:' || pa.plugin_id, a.platform) AS platform, a.display_name AS account, s.metric AS metric, s.ts AS ts, s.value AS value
    FROM snapshots s JOIN accounts a ON a.id = s.account_id LEFT JOIN plugin_accounts pa ON pa.account_id = a.id ORDER BY 1, s.metric, s.ts`).all() as SnapshotRow[]

/** Dernière valeur connue d'une métrique à l'instant `ts` (ou avant), sinon null. */
export const valueAt = (accountId: number, metric: MetricKey, ts: number): number | null =>
  (db.prepare('SELECT value FROM snapshots WHERE account_id = ? AND metric = ? AND ts <= ? ORDER BY ts DESC LIMIT 1').get(accountId, metric, ts) as { value: number } | undefined)?.value ?? null

/* ---------- Plugins ---------- */
export interface PluginRow { id: string; manifest: string; script: string; enabled: number; installed_at: number; failures: number; last_error: string | null; hash: string }
export interface PluginAccountRow { account_id: number; plugin_id: string; inputs: string; display_name: string; external_id: string; created_at: number; last_sync_at: number | null; last_error: string | null }

export const getPluginRow = (id: string): PluginRow | undefined => db.prepare('SELECT * FROM plugins WHERE id = ?').get(id) as PluginRow | undefined
export const listPluginRows = (): PluginRow[] => db.prepare('SELECT * FROM plugins ORDER BY installed_at').all() as PluginRow[]

/** Installe ou met à jour un plugin ; ses comptes, clés et stockage sont conservés. */
export function upsertPlugin(id: string, manifest: string, script: string, hash: string): void {
  db.prepare(`INSERT INTO plugins (id, manifest, script, enabled, installed_at, failures, last_error, hash) VALUES (?,?,?,1,?,0,NULL,?)
    ON CONFLICT(id) DO UPDATE SET manifest = excluded.manifest, script = excluded.script, hash = excluded.hash, enabled = 1, failures = 0, last_error = NULL`)
    .run(id, manifest, script, Date.now(), hash)
}
export const setPluginEnabled = (id: string, enabled: boolean): void => {
  db.prepare('UPDATE plugins SET enabled = ?, failures = CASE WHEN ? THEN 0 ELSE failures END, last_error = CASE WHEN ? THEN NULL ELSE last_error END WHERE id = ?').run(enabled ? 1 : 0, enabled ? 1 : 0, enabled ? 1 : 0, id)
}
export const setPluginState = (id: string, failures: number, lastError: string | null, disable = false): void => {
  db.prepare('UPDATE plugins SET failures = ?, last_error = ?, enabled = CASE WHEN ? THEN 0 ELSE enabled END WHERE id = ?').run(failures, lastError, disable ? 1 : 0, id)
}
/** Supprime le plugin, ses comptes (et leur historique) et son stockage. */
export function deletePlugin(id: string): void {
  db.transaction(() => {
    db.prepare('DELETE FROM accounts WHERE id IN (SELECT account_id FROM plugin_accounts WHERE plugin_id = ?)').run(id)
    db.prepare('DELETE FROM plugins WHERE id = ?').run(id)
  })()
}

export function insertPluginAccount(pluginId: string, displayName: string, externalId: string, inputs: Record<string, string>): number {
  return db.transaction(() => {
    const info = db.prepare("INSERT INTO accounts (platform, input, display_name, external_id, avatar, demo, created_at) VALUES ('plugin', '', ?, ?, NULL, 0, ?)")
      .run(displayName, externalId, Date.now())
    const id = Number(info.lastInsertRowid)
    db.prepare('INSERT INTO plugin_accounts (account_id, plugin_id, inputs) VALUES (?,?,?)').run(id, pluginId, JSON.stringify(inputs))
    return id
  })()
}

const PA_SELECT = `SELECT pa.account_id, pa.plugin_id, pa.inputs, a.display_name, a.external_id, a.created_at, a.last_sync_at, a.last_error
  FROM plugin_accounts pa JOIN accounts a ON a.id = pa.account_id`
export const listPluginAccountRows = (): PluginAccountRow[] => db.prepare(`${PA_SELECT} ORDER BY pa.account_id`).all() as PluginAccountRow[]
export const getPluginAccountRow = (accountId: number): PluginAccountRow | undefined => db.prepare(`${PA_SELECT} WHERE pa.account_id = ?`).get(accountId) as PluginAccountRow | undefined

export const pluginStorageGet = (pluginId: string, accountId: number, key: string): string | null =>
  (db.prepare('SELECT value FROM plugin_storage WHERE plugin_id = ? AND account_id = ? AND key = ?').get(pluginId, accountId, key) as { value: string } | undefined)?.value ?? null
export const pluginStorageCount = (pluginId: string, accountId: number): number =>
  (db.prepare('SELECT COUNT(*) AS n FROM plugin_storage WHERE plugin_id = ? AND account_id = ?').get(pluginId, accountId) as { n: number }).n
export const pluginStorageSet = (pluginId: string, accountId: number, key: string, value: string): void => {
  db.prepare('INSERT INTO plugin_storage VALUES (?,?,?,?) ON CONFLICT(plugin_id, account_id, key) DO UPDATE SET value = excluded.value').run(pluginId, accountId, key, value)
}

/** Ajoute des points d'historique fournis par un plugin, sans doublon (même compte, métrique et instant). */
/** Historique renvoyé par un plugin : il fait foi de son premier point jusqu'à maintenant. Pour chaque métrique, les points
 *  déjà enregistrés sur cette période sont remplacés : un plugin qui complète des données passées corrige ainsi les cumuls
 *  calculés avant, y compris les relevés pris pendant qu'il rattrapait son retard. Les points plus anciens ne sont pas touchés. */
export function insertHistory(accountId: number, points: { ts: number; metrics: Record<string, number> }[], now = Date.now()): void {
  const span: Record<string, [number, number]> = {}
  for (const p of points) for (const m of Object.keys(p.metrics)) {
    const s = span[m]
    span[m] = s ? [Math.min(s[0], p.ts), Math.max(s[1], p.ts)] : [p.ts, p.ts]
  }
  const del = db.prepare('DELETE FROM snapshots WHERE account_id = ? AND metric = ? AND ts BETWEEN ? AND ?')
  const ins = db.prepare('INSERT INTO snapshots (account_id, metric, ts, value) VALUES (?,?,?,?)')
  db.transaction(() => {
    for (const [m, [a, b]] of Object.entries(span)) del.run(accountId, m, a, Math.max(b, now))
    for (const p of points) for (const [m, v] of Object.entries(p.metrics)) ins.run(accountId, m, p.ts, v)
  })()
}

/* ---------- Éléments de plugin ---------- */
/** `replace` : la liste remplace l'ancienne. `keep` : ajout ou mise à jour par identifiant, au plus `maxStoredItems` (les plus récents). */
export function savePluginItems(accountId: number, items: PluginItem[], mode: 'replace' | 'keep'): void {
  const up = db.prepare('INSERT INTO plugin_items VALUES (?,?,?,?) ON CONFLICT(account_id, item_id) DO UPDATE SET ts = excluded.ts, data = excluded.data')
  db.transaction(() => {
    if (mode === 'replace') db.prepare('DELETE FROM plugin_items WHERE account_id = ?').run(accountId)
    for (const it of items) up.run(accountId, it.id, it.ts ?? 0, JSON.stringify(it))
    if (mode === 'keep') db.prepare(`DELETE FROM plugin_items WHERE account_id = ? AND item_id NOT IN
      (SELECT item_id FROM plugin_items WHERE account_id = ? ORDER BY ts DESC LIMIT ?)`).run(accountId, accountId, PLUGIN_LIMITS.maxStoredItems)
  })()
}

const MONTH = "strftime('%Y-%m', ts / 1000, 'unixepoch', 'localtime')"

/** Une page d'éléments, du plus récent au plus ancien, éventuellement limitée à un mois (AAAA-MM). */
/** Tri : 'ts' (date), 'title' ou la clé d'une colonne du plugin ; les éléments sans valeur passent en dernier.
 *  Recherche : `scope` = 'all' (tout l'élément, détail compris), 'title' ou la clé d'une colonne. Pendant une recherche,
 *  `statKeys` donne les colonnes sur lesquelles calculer tes stats (moyennes, répartitions). */
export function listPluginItems(accountId: number, offset: number, limit: number, month?: string, sortKey = 'ts', desc = true, query = '',
  scope = 'all', statKeys: string[] = []): PluginItemsPage {
  let where = month ? `account_id = ? AND ts > 0 AND ${MONTH} = ?` : 'account_id = ?'
  const args: (number | string)[] = month ? [accountId, month] : [accountId]
  const target = scope === 'all' ? 'data' : scope === 'title' ? "json_extract(data, '$.title')" : 'json_extract(data, ?)'
  for (const word of query.trim().split(/\s+/).filter(Boolean).slice(0, 6)) {
    where += ` AND ${target} LIKE ? ESCAPE '\\'`
    if (target === 'json_extract(data, ?)') args.push(`$.fields.${scope}`)
    args.push(`%${word.replace(/[\\%_]/g, (c) => '\\' + c)}%`)
  }
  const dir = desc ? 'DESC' : 'ASC'
  const expr = sortKey === 'ts' ? 'ts' : 'json_extract(data, ?)'
  const sortArgs: string[] = sortKey === 'ts' ? [] : [sortKey === 'title' ? '$.title' : `$.fields.${sortKey}`]
  const rows = db.prepare(`SELECT data FROM plugin_items WHERE ${where} ORDER BY (${expr}) IS NULL, (${expr}) ${dir}, ts DESC, item_id LIMIT ? OFFSET ?`)
    .all(...args, ...sortArgs, ...sortArgs, limit, offset) as { data: string }[]
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM plugin_items WHERE ${where}`).get(...args) as { n: number }).n
  const months = db.prepare(`SELECT ${MONTH} AS month, COUNT(*) AS count FROM plugin_items WHERE account_id = ? AND ts > 0 GROUP BY month ORDER BY month DESC`)
    .all(accountId) as { month: string; count: number }[]
  const items: PluginItem[] = []
  for (const r of rows) { try { items.push(JSON.parse(r.data) as PluginItem) } catch { /* ligne illisible ignorée */ } }
  const stats = query.trim() ? statKeys.map((k) => columnStat(where, args, k)).filter((x): x is ColumnStat => !!x) : undefined
  return { items, total, months, stats }
}

/** Stats d'une colonne sur les éléments filtrés : nombres (moyenne, min, max, total), durées « m:ss », ou valeurs les plus fréquentes. */
function columnStat(where: string, args: (number | string)[], key: string): ColumnStat | null {
  const path = `$.fields.${key}`
  const num = db.prepare(`SELECT COUNT(v) n, AVG(v) avg, MIN(v) min, MAX(v) max, SUM(v) sum FROM (SELECT json_extract(data, ?) v FROM plugin_items WHERE ${where})
    WHERE typeof(v) IN ('integer', 'real')`).get(path, ...args) as { n: number; avg: number; min: number; max: number; sum: number }
  if (num.n) return { key, kind: 'num', n: num.n, avg: num.avg, min: num.min, max: num.max, sum: num.sum }
  const groups = db.prepare(`SELECT v, COUNT(*) n FROM (SELECT json_extract(data, ?) v FROM plugin_items WHERE ${where}) WHERE typeof(v) = 'text' AND v NOT IN ('', '—')
    GROUP BY v ORDER BY n DESC LIMIT 5000`).all(path, ...args) as { v: string; n: number }[]
  if (!groups.length) return null
  const n = groups.reduce((s, g) => s + g.n, 0)
  if (groups.every((g) => /^\d{1,3}:\d{2}$/.test(g.v))) {
    let sum = 0, min = Infinity, max = 0
    for (const g of groups) { const [m, s] = g.v.split(':').map(Number), sec = m * 60 + s; sum += sec * g.n; min = Math.min(min, sec); max = Math.max(max, sec) }
    return { key, kind: 'dur', n, avg: sum / n, min, max, sum }
  }
  return { key, kind: 'cat', n, top: groups.slice(0, 6).map((g) => ({ value: g.v.slice(0, 60), n: g.n })) }
}
