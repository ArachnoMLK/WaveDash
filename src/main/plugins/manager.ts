// Plugin management: install (with validation), accounts, refresh, keys.
import { app } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, utimesSync } from 'fs'
import { basename, extname, join } from 'path'
import {
  BankPlayer, compareVersions, IMAGE_FILE_RE, PLAYER_LIMITS, InstalledPlugin, PluginFilter, sanitizeDetail, PLUGIN_LIMITS, PluginAccount, PluginDetail, PluginInspect, PluginItemsPage, PluginManifest, sanitizeResolveResult, sanitizeRunResult, validateManifest
} from '@shared/plugin'
import * as db from '../db'
import { processPluginNotices, processPluginRefresh } from '../milestones'
import { fetchPackage, getCatalog } from './catalog'
import * as secrets from '../secrets'
import { FolderAccess, readFileSafe } from './files'
import { PluginError, RunRequest } from './sandbox'
import { runIsolated } from './isolated'
import { readZip, ZipError } from './zip'

/** After 5 consecutive failures, the plugin is disabled so it does not run in a loop. */
const MAX_FAILURES = 5
const MAX_STORAGE_KEYS = 100
/** Delay before running again a plugin that reports remaining work (`backlog`). */
const CATCH_UP_MS = 5_000
/** Quick reruns without the backlog going down before stopping (the plugin resumes at the next normal refresh). */
const MAX_STALLED = 3

let notify: () => void = () => {}
/** Called when a background catch-up saved new data (to refresh the interface). */
export const setPluginNotifier = (f: () => void): void => { notify = f }
const running = new Set<number>(), catchUps = new Map<number, NodeJS.Timeout>()

const secretKey = (pluginId: string, key: string): `plugin:${string}:${string}` => `plugin:${pluginId}:${key}`

function loadManifest(row: db.PluginRow): PluginManifest {
  const v = validateManifest(JSON.parse(row.manifest))     // revalidated on every use: the database is never taken at its word
  if (!v.ok) throw new PluginError('script', `Manifeste invalide : ${v.error}`)
  return v.manifest
}

/* ---------- Installation ---------- */
interface Pending { manifest: PluginManifest; script: string; hash: string; expires: number }
const pending = new Map<string, Pending>()

export function inspectPackage(path: string): { ok: true; inspect: PluginInspect } | { ok: false; error: string } {
  try {
    if (!path.toLowerCase().endsWith('.wdsh')) return { ok: false, error: 'not_wdsh' }
    const st = statSync(path)
    if (!st.isFile() || st.size > PLUGIN_LIMITS.maxArchive) return { ok: false, error: 'too_large' }
    const buf = readFileSync(path)

    const m = readZip(buf, (n) => n === 'manifest.json')
    const mf = m.get('manifest.json')
    if (!mf) return { ok: false, error: 'missing_manifest' }
    let raw: unknown
    try { raw = JSON.parse(mf.toString('utf8')) } catch { return { ok: false, error: 'manifest' } }
    const v = validateManifest(raw)
    if (!v.ok) return { ok: false, error: `manifest:${v.error}` }
    if (v.manifest.minAppVersion && compareVersions(v.manifest.minAppVersion, app.getVersion()) > 0) return { ok: false, error: 'needs_newer_app' }

    const s = readZip(buf, (n) => n === v.manifest.entry, { maxEntryBytes: PLUGIN_LIMITS.maxScript }).get(v.manifest.entry)
    if (!s) return { ok: false, error: 'missing_entry' }
    const script = s.toString('utf8')

    for (const [k, p] of pending) if (p.expires < Date.now()) pending.delete(k)
    const token = randomUUID()
    pending.set(token, { manifest: v.manifest, script, hash: createHash('sha256').update(buf).digest('hex'), expires: Date.now() + 10 * 60_000 })
    const installed = db.getPluginRow(v.manifest.id)
    return { ok: true, inspect: { token, manifest: v.manifest, installedVersion: installed ? loadManifest(installed).version : null } }
  } catch (e) {
    return { ok: false, error: e instanceof ZipError ? `zip:${e.message}` : 'unreadable' }
  }
}

export function installPending(token: string): { ok: boolean; error?: string } {
  const p = pending.get(token)
  if (!p || p.expires < Date.now()) return { ok: false, error: 'expired' }
  pending.delete(token)
  db.upsertPlugin(p.manifest.id, JSON.stringify(p.manifest), p.script, p.hash)
  return { ok: true }
}

export function listPlugins(): InstalledPlugin[] {
  return db.listPluginRows().flatMap((r) => {
    try {
      const manifest = loadManifest(r)
      return [{ id: r.id, manifest, enabled: !!r.enabled, installedAt: r.installed_at, failures: r.failures, lastError: r.last_error,
        secretsSet: manifest.secrets.filter((s) => secrets.hasSecret(secretKey(r.id, s.key))).map((s) => s.key) }]
    } catch { return [] }
  })
}

export function listPluginAccounts(): PluginAccount[] {
  return db.listPluginAccountRows().map((r) => ({ id: r.account_id, pluginId: r.plugin_id, displayName: r.display_name, inputs: JSON.parse(r.inputs) as Record<string, string>,
    createdAt: r.created_at, lastSyncAt: r.last_sync_at, lastError: r.last_error }))
}

export function uninstallPlugin(id: string): void {
  const row = db.getPluginRow(id)
  if (!row) return
  try { for (const s of loadManifest(row).secrets) secrets.deleteSecret(secretKey(id, s.key)) } catch { /* unreadable manifest: nothing to delete */ }
  db.deletePlugin(id)
}

/* ---------- Keys ---------- */
export function setPluginSecret(pluginId: string, key: string, value: string): boolean {
  const row = db.getPluginRow(pluginId)
  if (!row || !loadManifest(row).secrets.some((s) => s.key === key) || !value.trim() || value.length > 500) return false
  secrets.setSecret(secretKey(pluginId, key), value)
  return true
}
export function deletePluginSecret(pluginId: string, key: string): void {
  const row = db.getPluginRow(pluginId)
  if (row && loadManifest(row).secrets.some((s) => s.key === key)) secrets.deleteSecret(secretKey(pluginId, key))
}

/* ---------- Run ---------- */
/** Folder managed by WaveDash where files imported for an account are copied (read in addition to the chosen folder). */
/** "Imported" folder of an account, in Documents\WaveDash: imported files are copied there before being read. */
export function importDirOf(accountId: number): string {
  const dir = join(app.getPath('documents'), 'WaveDash', 'Imported', String(accountId))
  // Before 1.6.0 the folder had a French name.
  const french = join(app.getPath('documents'), 'WaveDash', 'Parties importées', String(accountId))
  if (existsSync(french)) {
    try { mkdirSync(dir, { recursive: true }); for (const n of readdirSync(french)) if (!existsSync(join(dir, n))) renameSync(join(french, n), join(dir, n)); rmSync(french, { recursive: true, force: true }) } catch { /* retried on next access */ }
  }
  // Migration: before 0.9.3, imports were in the app's hidden folder.
  const old = join(app.getPath('userData'), 'plugin-imports', String(accountId))
  if (existsSync(old)) {
    try { mkdirSync(dir, { recursive: true }); for (const n of readdirSync(old)) if (!existsSync(join(dir, n))) renameSync(join(old, n), join(dir, n)); rmSync(old, { recursive: true, force: true }) } catch { /* retried on the next access */ }
  }
  return dir
}

function folderOf(manifest: PluginManifest, inputs: Record<string, string>, accountId?: number): FolderAccess | undefined {
  if (!manifest.permissions.folder) return undefined
  const key = manifest.inputs.find((i) => i.type === 'folder')?.key
  const dir = key ? inputs[key] : undefined
  let real: string | null = null
  try { if (dir && statSync(dir).isDirectory()) real = realpathSync(dir) } catch { /* folder deleted, moved or inaccessible */ }
  if (!real) throw new PluginError('blocked', 'The chosen folder was not found')
  return { dir: real, extra: accountId === undefined ? undefined : importDirOf(accountId), extensions: manifest.permissions.folderExtensions }
}

function buildRequest(row: db.PluginRow, fn: 'resolve' | 'refresh' | 'search' | 'cross' | 'view', inputs: Record<string, string>, account?: { id: number; externalId: string; displayName: string }, query?: string, cross?: Record<string, string>, filters?: Record<string, string>): RunRequest {
  const manifest = loadManifest(row)
  const secretValues: Record<string, string> = {}
  for (const s of manifest.secrets) secretValues[s.key] = secrets.getSecret(secretKey(row.id, s.key)) ?? ''
  const memory = new Map<string, string>()                       // ephemeral storage for `resolve` (account not created yet)
  const accountId = account?.id
  return {
    manifest, script: row.script, fn,
    // The image folder only concerns the interface: the script does not even get its path.
    ctx: { inputs: Object.fromEntries(Object.entries(inputs).filter(([k]) => manifest.inputs.find((i) => i.key === k)?.type !== 'images')), secrets: secretValues, lang: db.getSettings().lang, account: account ? { externalId: account.externalId, displayName: account.displayName } : undefined, query, cross, filters },
    folder: folderOf(manifest, inputs, accountId),
    storage: accountId === undefined
      ? { get: (k) => memory.get(k) ?? null, set: (k, v) => { memory.set(k, v) } }
      : {
        get: (k) => db.pluginStorageGet(row.id, accountId, k),
        set: (k, v) => {
          if (db.pluginStorageGet(row.id, accountId, k) === null && db.pluginStorageCount(row.id, accountId) >= MAX_STORAGE_KEYS) throw new Error('too many storage keys')
          db.pluginStorageSet(row.id, accountId, k, v)
        }
      }
  }
}

/** Validates the fields entered according to the manifest. */
function cleanInputs(manifest: PluginManifest, raw: Record<string, string>): { ok: true; inputs: Record<string, string> } | { ok: false; error: string } {
  const inputs: Record<string, string> = {}
  for (const i of manifest.inputs) {
    const v = String(raw[i.key] ?? '').trim()
    if (v.length > 500) return { ok: false, error: `input_invalid:${i.key}` }
    if (!v) { if (i.required) return { ok: false, error: `input_required:${i.key}` }; continue }
    if (i.type === 'number' && !Number.isFinite(Number(v))) return { ok: false, error: `input_invalid:${i.key}` }
    if (i.type === 'folder' || i.type === 'images') { try { if (!statSync(v).isDirectory()) throw new Error() } catch { return { ok: false, error: `input_invalid:${i.key}` } } }
    inputs[i.key] = v
  }
  return { ok: true, inputs }
}

const msgOf = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 300)

export async function addPluginAccount(pluginId: string, rawInputs: Record<string, string>): Promise<{ ok: boolean; error?: string; detail?: string }> {
  const row = db.getPluginRow(pluginId)
  if (!row || !row.enabled) return { ok: false, error: 'disabled' }
  const manifest = loadManifest(row)
  const c = cleanInputs(manifest, rawInputs)
  if (!c.ok) return c

  // The plugin can validate inputs and provide a display name (optional `resolve` function).
  let externalId = createHash('sha1').update(JSON.stringify(c.inputs)).digest('hex').slice(0, 16)
  let displayName = Object.entries(c.inputs).find(([k]) => !['folder', 'images'].includes(manifest.inputs.find((i) => i.key === k)?.type ?? ''))?.[1] ?? manifest.name
  try {
    const r = await runIsolated(buildRequest(row, 'resolve', c.inputs))
    const res = sanitizeResolveResult(r.value)
    if (!res) return { ok: false, error: 'resolve_invalid' }
    externalId = res.externalId; displayName = res.displayName
  } catch (e) {
    if (!(e instanceof PluginError && e.code === 'no_function')) return { ok: false, error: e instanceof PluginError ? e.code : 'engine', detail: msgOf(e) }
  }
  if (db.listPluginAccountRows().some((a) => a.plugin_id === pluginId && a.external_id === externalId)) return { ok: false, error: 'already_added' }

  const id = db.insertPluginAccount(pluginId, displayName, externalId, c.inputs)
  await refreshPluginAccount(id)
  return { ok: true }
}

/** Changes an account's fields (e.g. adding the image folder); the account identity does not change. */
export function updatePluginAccount(accountId: number, raw: Record<string, string>): { ok: boolean; error?: string } {
  const pa = db.getPluginAccountRow(accountId), row = pa && db.getPluginRow(pa.plugin_id)
  if (!pa || !row) return { ok: false, error: 'disabled' }
  const c = cleanInputs(loadManifest(row), raw)
  if (!c.ok) return c
  db.setPluginAccountInputs(accountId, c.inputs)
  return { ok: true }
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
/** Image from an account's image folder (`images` permission): a plain file name, image only, at most 3 MB.
 *  The plugin script never has access to it; only the interface shows it. */
export function pluginImage(accountId: number, file: string): string | null {
  const pa = db.getPluginAccountRow(accountId), row = pa && db.getPluginRow(pa.plugin_id)
  if (!pa || !row || !IMAGE_FILE_RE.test(file)) return null
  try {
    const m = loadManifest(row), key = m.permissions.images ? m.inputs.find((i) => i.type === 'images')?.key : undefined
    const dir = key ? (JSON.parse(pa.inputs) as Record<string, string>)[key] : undefined
    if (!dir) return null
    const buf = readFileSafe({ dir: realpathSync(dir), extensions: ['.jpg', '.jpeg', '.png', '.webp'] }, file, 3 * 1024 * 1024)
    return `data:${MIME[extname(file).slice(1).toLowerCase()]};base64,${buf.toString('base64')}`
  } catch { return null }
}

export function removePluginAccount(accountId: number): void {
  if (!db.getPluginAccountRow(accountId)) return
  db.deleteAccount(accountId)
  try { rmSync(importDirOf(accountId), { recursive: true, force: true }) } catch { /* nothing to delete */ }
}

/** Copies the files chosen by the user into the account's import folder, keeping their date
 *  (plugins use it to date the data). Only the extensions allowed by the manifest are accepted. */
export function importPluginFiles(accountId: number, paths: string[]): { imported: number; skipped: number } {
  const pa = db.getPluginAccountRow(accountId), row = pa && db.getPluginRow(pa.plugin_id)
  if (!pa || !row) return { imported: 0, skipped: paths.length }
  const m = loadManifest(row)
  if (!m.permissions.folder) return { imported: 0, skipped: paths.length }
  const exts = m.permissions.folderExtensions, dir = importDirOf(accountId)
  mkdirSync(dir, { recursive: true })
  let imported = 0, skipped = 0
  for (const p of paths.slice(0, 5000)) {
    try {
      const st = statSync(p), name = basename(p), ext = extname(name).toLowerCase()
      if (!st.isFile() || (exts.length && !exts.includes(ext)) || st.size > 8 * 1024 * 1024) { skipped++; continue }
      let target = join(dir, name)
      for (let n = 2; existsSync(target); n++) {
        if (statSync(target).size === st.size && readFileSync(target).equals(readFileSync(p))) { target = ''; break }   // already imported
        target = join(dir, `${name.slice(0, name.length - ext.length)} (import ${n})${ext}`)
      }
      if (!target) { skipped++; continue }
      copyFileSync(p, target)
      utimesSync(target, st.atime, st.mtime)
      imported++
    } catch { skipped++ }
  }
  return { imported, skipped }
}

/** Runs the plugin for an account and saves the result. Errors are kept for display. */
export async function refreshPluginAccount(accountId: number): Promise<void> {
  const pa = db.getPluginAccountRow(accountId)
  const row = pa && db.getPluginRow(pa.plugin_id)
  if (!pa || !row || !row.enabled || running.has(accountId)) return
  running.add(accountId)
  const t = catchUps.get(accountId)
  if (t) { clearTimeout(t); catchUps.delete(accountId) }
  try {
    const manifest = loadManifest(row)
    const inputs = JSON.parse(pa.inputs) as Record<string, string>
    const run = await runIsolated(buildRequest(row, 'refresh', inputs, { id: accountId, externalId: pa.external_id, displayName: pa.display_name }), { pluginId: row.id, accountId })
    const result = sanitizeRunResult(run.value, manifest)
    if (!Object.keys(result.metrics).length && !result.history.length) throw new PluginError('invalid_result', 'No declared metric was returned')
    // Milestones: compared with the previous reading, before saving the new one; a notification error blocks nothing.
    try { processPluginRefresh(accountId, pa.display_name, manifest, db.getLatest(accountId) as Record<string, number>, result.metrics) } catch (e) { console.error('Plugin milestones:', e) }
    try { processPluginNotices(accountId, pa.display_name, manifest, result.notices) } catch (e) { console.error('Plugin notifications:', e) }
    db.insertHistory(accountId, result.history)
    db.insertSnapshots(accountId, result.metrics)
    db.savePluginItems(accountId, result.items, manifest.itemsMode)
    if (manifest.players && result.players.length) db.savePlayerRecords(row.id, result.players, 'local')
    // Safety net: a backlog that never goes down (buggy plugin) must not rerun the plugin every 5 s forever.
    const prevBacklog = Number(db.getMeta(accountId, 'backlog')) || 0
    const stalled = result.backlog > 0 && result.backlog >= prevBacklog ? (Number(db.getMeta(accountId, 'stalled')) || 0) + 1 : 0
    db.setMeta(accountId, 'stalled', String(stalled))
    db.setMeta(accountId, 'backlog', String(result.backlog))
    if (result.summary) db.setMeta(accountId, 'summary', JSON.stringify(result.summary))
    if (manifest.views) db.setMeta(accountId, 'filters', JSON.stringify(result.filters))
    // Remaining work (e.g. files not read yet): rerun soon, without waiting for the next refresh.
    if (result.backlog > 0 && stalled < MAX_STALLED) catchUps.set(accountId, setTimeout(() => { catchUps.delete(accountId); void refreshPluginAccount(accountId).then(() => notify()) }, CATCH_UP_MS))
    db.setMeta(accountId, 'log', JSON.stringify(run.logs))
    db.setMeta(accountId, 'error', '')
    db.markSync(accountId, null)
    db.setPluginState(row.id, 0, null)
  } catch (e) {
    const code = e instanceof PluginError ? e.code : 'engine'
    db.setMeta(accountId, 'log', JSON.stringify(e instanceof PluginError ? e.logs : []))
    db.setMeta(accountId, 'error', msgOf(e))
    db.markSync(accountId, code)
    const failures = row.failures + 1
    db.setPluginState(row.id, failures, `${code}: ${msgOf(e)}`, failures >= MAX_FAILURES)
  } finally {
    running.delete(accountId)
  }
}

/** Refreshes the plugin accounts that are due, one at a time to bound the load. */
export async function refreshAllPlugins(): Promise<void> {
  for (const pa of db.listPluginAccountRows()) {
    const row = db.getPluginRow(pa.plugin_id)
    if (!row || !row.enabled) continue
    let minutes = 30
    try { minutes = loadManifest(row).refreshMinutes } catch { continue }
    // An account that is still behind (backlog) is rerun even if it was just refreshed (e.g. after a restart).
    const behind = Number(db.getMeta(pa.account_id, 'backlog')) > 0 && (Number(db.getMeta(pa.account_id, 'stalled')) || 0) < MAX_STALLED
    if (!behind && pa.last_sync_at && Date.now() - pa.last_sync_at < minutes * 60_000 * 0.9) continue
    await refreshPluginAccount(pa.account_id)
  }
}

export function pluginAccountData(accountId: number): { logs: string[]; error: string | null; backlog: number; summary: PluginDetail | null; filters: PluginFilter[] } {
  const parse = <T,>(k: string, fallback: T): T => { try { return JSON.parse(db.getMeta(accountId, k) ?? '') as T } catch { return fallback } }
  return { logs: parse<string[]>('log', []), error: db.getMeta(accountId, 'error') || null, backlog: Number(db.getMeta(accountId, 'backlog')) || 0,
    summary: parse<PluginDetail | null>('summary', null), filters: parse<PluginFilter[]>('filters', []) }
}

/** Filters chosen in the top bar, limited to those the plugin offered (known key and value). */
function cleanFilters(accountId: number, raw: unknown): { sel: Record<string, string>; match: Record<string, string>; since: number } {
  const out = { sel: {} as Record<string, string>, match: {} as Record<string, string>, since: 0 }
  if (!raw || typeof raw !== 'object') return out
  let known: PluginFilter[] = []
  try { known = JSON.parse(db.getMeta(accountId, 'filters') ?? '[]') as PluginFilter[] } catch { known = [] }
  for (const f of known) {
    const v = (raw as Record<string, unknown>)[f.key]
    if (typeof v !== 'string' || !f.options.some((o) => o.value === v)) continue
    out.sel[f.key] = v
    if (f.field === '$ts') out.since = Math.max(out.since, Date.now() - Number(v) * 86_400_000)
    else if (f.field) out.match[f.field] = v
  }
  return out
}

export function pluginAccountItems(accountId: number, offset: number, limit: number, month?: string, sortKey?: string, desc = true, query = '', scope = 'all', filters?: unknown): PluginItemsPage {
  const page = Math.min(200, Math.max(1, Math.floor(limit) || 50)), from = Math.max(0, Math.floor(offset) || 0)
  const m = typeof month === 'string' && /^\d{4}-\d{2}$/.test(month) ? month : undefined
  const key = sortKey === 'title' || sortKey === 'ts' || (typeof sortKey === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(sortKey)) ? sortKey : 'ts'
  const pa = db.getPluginAccountRow(accountId), row = pa && db.getPluginRow(pa.plugin_id)
  let cols: string[] = []
  try { if (row) cols = loadManifest(row).itemColumns.map((c) => c.key) } catch { /* unreadable manifest: no stats */ }
  const sc = scope === 'all' || scope === 'title' || cols.includes(scope) ? scope : 'all'
  const f = cleanFilters(accountId, filters)
  return db.listPluginItems(accountId, from, page, m, key, desc !== false, typeof query === 'string' ? query.slice(0, 100) : '', sc, cols, f.match, f.since)
}

/* ---------- .wdsh file received on open (double-click) ---------- */
let pendingFile: string | null = null
export const setPendingFile = (p: string | null): void => { pendingFile = p }
export const takePendingFile = (): string | null => { const p = pendingFile; pendingFile = null; return p }

/* ---------- Plugins bundled with the app ---------- */
const bundledDir = (): string => (app.isPackaged ? join(process.resourcesPath, 'plugins') : join(app.getAppPath(), 'examples'))
const samePermissions = (a: PluginManifest, b: PluginManifest): boolean =>
  JSON.stringify([...a.permissions.network].sort()) === JSON.stringify([...b.permissions.network].sort()) &&
  a.permissions.folder === b.permissions.folder && a.permissions.images === b.permissions.images && JSON.stringify([...a.permissions.folderExtensions].sort()) === JSON.stringify([...b.permissions.folderExtensions].sort())

export interface BundledPlugin { path: string; id: string; name: string; version: string; description: PluginManifest['description']; installedVersion: string | null }

/** Plugins shipped with the app (one version per plugin, the latest). */
export function listBundled(): BundledPlugin[] {
  let names: string[] = []
  try { names = readdirSync(bundledDir()).filter((n) => n.toLowerCase().endsWith('.wdsh')) } catch { return [] }
  const best = new Map<string, BundledPlugin>()
  for (const n of names) {
    const path = join(bundledDir(), n), r = inspectPackage(path)
    if (!r.ok || !r.inspect) continue
    const m = r.inspect.manifest, cur = best.get(m.id)
    if (!cur || compareVersions(m.version, cur.version) > 0) best.set(m.id, { path, id: m.id, name: m.name, version: m.version, description: m.description, installedVersion: r.inspect.installedVersion })
  }
  return [...best.values()]
}

/** At startup: silently updates installed plugins for which the app ships a newer version,
 *  only if the permissions are identical (otherwise the user confirms from the Plugins page). */
export function syncBundledPlugins(): string[] {
  const updated: string[] = []
  for (const b of listBundled()) {
    if (!b.installedVersion || compareVersions(b.version, b.installedVersion) <= 0) continue
    const row = db.getPluginRow(b.id), r = inspectPackage(b.path)
    if (!row || !r.ok || !r.inspect || !samePermissions(loadManifest(row), r.inspect.manifest)) continue
    if (installPending(r.inspect.token).ok) updated.push(`${b.name} ${b.version}`)
  }
  return updated
}

/** Updates from the online catalog: same rule as bundled plugins (identical permissions, otherwise confirmation). */
export async function syncCatalogUpdates(): Promise<string[]> {
  const updated: string[] = []
  const view = await getCatalog()
  for (const e of view.entries) {
    if (!e.installedVersion || compareVersions(e.version, e.installedVersion) <= 0) continue
    try {
      const path = await fetchPackage(e.id), row = db.getPluginRow(e.id), r = inspectPackage(path)
      if (!row || !r.ok || !r.inspect || !samePermissions(loadManifest(row), r.inspect.manifest)) continue
      if (installPending(r.inspect.token).ok) {
        updated.push(`${e.name} ${e.version}`)
        // The plugin's accounts benefit from the new version right away, without waiting for their next refresh.
        for (const pa of db.listPluginAccountRows()) if (pa.plugin_id === e.id) await refreshPluginAccount(pa.account_id)
      }
    } catch (err) { console.error('Catalog:', e.id, err) }
  }
  return updated
}

/** Free search (top bar): the plugin's `search` function, if any, computes a detail for the query
 *  (e.g. all the stats of a player). No data is saved and a failure does not count as a plugin fault. */
export async function pluginAccountSearch(accountId: number, query: string, filters?: unknown): Promise<{ ok: boolean; unsupported?: boolean; detail?: PluginDetail; error?: string }> {
  const pa = db.getPluginAccountRow(accountId), row = pa && db.getPluginRow(pa.plugin_id)
  const q = String(query ?? '').trim().slice(0, 100)
  if (!pa || !row || !row.enabled || q.length < 2) return { ok: false }
  try {
    const inputs = JSON.parse(pa.inputs) as Record<string, string>
    const run = await runIsolated(buildRequest(row, 'search', inputs, { id: accountId, externalId: pa.external_id, displayName: pa.display_name }, q, undefined, cleanFilters(accountId, filters).sel), { pluginId: row.id, accountId })
    return { ok: true, detail: sanitizeDetail(run.value) }
  } catch (e) {
    if (e instanceof PluginError && e.code === 'no_function') return { ok: false, unsupported: true }
    return { ok: false, error: msgOf(e) }
  }
}

/** "Cross your data" tool: the plugin's `cross` function gets the player, the measure and the two chosen axes
 *  (values limited to the manifest menus) and returns a detail (bars, table). Nothing is saved. */
export async function pluginAccountCross(accountId: number, req: Record<string, string>, filters?: unknown): Promise<{ ok: boolean; detail?: PluginDetail; error?: string }> {
  const pa = db.getPluginAccountRow(accountId), row = pa && db.getPluginRow(pa.plugin_id)
  if (!pa || !row || !row.enabled) return { ok: false }
  let m: PluginManifest
  try { m = loadManifest(row) } catch { return { ok: false } }
  if (!m.cross) return { ok: false }
  const keys = (l: { key: string }[]): string[] => l.map((x) => x.key)
  const pick = (v: unknown, allowed: string[], fallback: string): string => (typeof v === 'string' && allowed.includes(v) ? v : fallback)
  const clean = { who: String(req?.who ?? '').trim().slice(0, 60), measure: pick(req?.measure, keys(m.cross.measures), m.cross.measures[0].key),
    a: pick(req?.a, keys(m.cross.dimensions), m.cross.dimensions[0].key), b: pick(req?.b, ['none', ...keys(m.cross.dimensions)], 'none') }
  try {
    const run = await runIsolated(buildRequest(row, 'cross', JSON.parse(pa.inputs) as Record<string, string>, { id: accountId, externalId: pa.external_id, displayName: pa.display_name }, undefined, clean, cleanFilters(accountId, filters).sel), { pluginId: row.id, accountId })
    return { ok: true, detail: sanitizeDetail(run.value) }
  } catch (e) { return { ok: false, error: msgOf(e) } }
}

/** Top bar: the plugin's `view` function recomputes the overview for the chosen filters (e.g. a single mode). Nothing is saved. */
export async function pluginAccountView(accountId: number, filters: unknown): Promise<{ ok: boolean; detail?: PluginDetail; error?: string }> {
  const pa = db.getPluginAccountRow(accountId), row = pa && db.getPluginRow(pa.plugin_id)
  if (!pa || !row || !row.enabled) return { ok: false }
  let m: PluginManifest
  try { m = loadManifest(row) } catch { return { ok: false } }
  if (!m.views) return { ok: false }
  try {
    const run = await runIsolated(buildRequest(row, 'view', JSON.parse(pa.inputs) as Record<string, string>, { id: accountId, externalId: pa.external_id, displayName: pa.display_name }, undefined, undefined, cleanFilters(accountId, filters).sel), { pluginId: row.id, accountId })
    return { ok: true, detail: sanitizeDetail(run.value) }
  } catch (e) { return { ok: false, error: msgOf(e) } }
}

/* ---------- Player bank ---------- */
/** Players matching a name (or an exact identifier) in the bank: a short list, nothing else. */
export const searchBank = (query: string): BankPlayer[] => db.searchPlayers(String(query ?? '').slice(0, 60), 50)

/** A player's sheet: the plugin that recorded them builds it from their records (`player` function).
 *  Only the resulting detail leaves this function; nothing is saved. */
export async function playerSheet(source: string, key: string): Promise<{ ok: boolean; detail?: PluginDetail; error?: string }> {
  const row = db.getPluginRow(String(source))
  if (!row || !row.enabled) return { ok: false, error: 'plugin_missing' }
  let manifest: PluginManifest
  try { manifest = loadManifest(row) } catch { return { ok: false, error: 'plugin_missing' } }
  if (!manifest.players) return { ok: false, error: 'plugin_missing' }
  const records = db.playerRecords(row.id, String(key), PLAYER_LIMITS.sheet)
  if (!records.length) return { ok: false, error: 'not_found' }
  const memory = new Map<string, string>()
  try {
    const run = await runIsolated({ manifest, script: row.script, fn: 'player', ctx: { inputs: {}, secrets: {}, lang: db.getSettings().lang, records },
      storage: { get: (k) => memory.get(k) ?? null, set: (k, v) => { memory.set(k, v) } } })
    return { ok: true, detail: sanitizeDetail(run.value) }
  } catch (e) { return { ok: false, error: msgOf(e) } }
}
