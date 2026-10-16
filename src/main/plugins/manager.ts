// Gestion des plugins : installation (avec validation), comptes, actualisation, clés.
import { app } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, utimesSync } from 'fs'
import { basename, extname, join } from 'path'
import {
  compareVersions, IMAGE_FILE_RE, InstalledPlugin, sanitizeDetail, PLUGIN_LIMITS, PluginAccount, PluginDetail, PluginInspect, PluginItemsPage, PluginManifest, sanitizeResolveResult, sanitizeRunResult, validateManifest
} from '@shared/plugin'
import * as db from '../db'
import { processPluginNotices, processPluginRefresh } from '../milestones'
import { fetchPackage, getCatalog } from './catalog'
import * as secrets from '../secrets'
import { FolderAccess, readFileSafe } from './files'
import { PluginError, RunRequest } from './sandbox'
import { runIsolated } from './isolated'
import { readZip, ZipError } from './zip'

/** Après 5 échecs consécutifs, le plugin est désactivé pour ne pas s'exécuter en boucle. */
const MAX_FAILURES = 5
const MAX_STORAGE_KEYS = 100
/** Délai avant de relancer un plugin qui signale du travail restant (`backlog`). */
const CATCH_UP_MS = 5_000
/** Relances rapides sans que le retard baisse avant d'arrêter (le plugin reprend à l'actualisation normale suivante). */
const MAX_STALLED = 3

let notify: () => void = () => {}
/** Appelé quand un rattrapage en arrière-plan a enregistré de nouvelles données (pour rafraîchir l'interface). */
export const setPluginNotifier = (f: () => void): void => { notify = f }
const running = new Set<number>(), catchUps = new Map<number, NodeJS.Timeout>()

const secretKey = (pluginId: string, key: string): `plugin:${string}:${string}` => `plugin:${pluginId}:${key}`

function loadManifest(row: db.PluginRow): PluginManifest {
  const v = validateManifest(JSON.parse(row.manifest))     // revalidé à chaque usage : la base n'est jamais crue sur parole
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
  try { for (const s of loadManifest(row).secrets) secrets.deleteSecret(secretKey(id, s.key)) } catch { /* manifeste illisible : rien à effacer */ }
  db.deletePlugin(id)
}

/* ---------- Clés ---------- */
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

/* ---------- Exécution ---------- */
/** Dossier géré par WaveDash où sont copiés les fichiers importés pour un compte (lu en plus du dossier choisi). */
/** Dossier « Parties importées » d'un compte, dans Documents\WaveDash : les fichiers importés y sont copiés avant d'être lus. */
export function importDirOf(accountId: number): string {
  const dir = join(app.getPath('documents'), 'WaveDash', 'Parties importées', String(accountId))
  // Migration : avant la 0.9.3, les imports étaient dans le dossier caché de l'appli.
  const old = join(app.getPath('userData'), 'plugin-imports', String(accountId))
  if (existsSync(old)) {
    try { mkdirSync(dir, { recursive: true }); for (const n of readdirSync(old)) if (!existsSync(join(dir, n))) renameSync(join(old, n), join(dir, n)); rmSync(old, { recursive: true, force: true }) } catch { /* nouvel essai au prochain accès */ }
  }
  return dir
}

function folderOf(manifest: PluginManifest, inputs: Record<string, string>, accountId?: number): FolderAccess | undefined {
  if (!manifest.permissions.folder) return undefined
  const key = manifest.inputs.find((i) => i.type === 'folder')?.key
  const dir = key ? inputs[key] : undefined
  let real: string | null = null
  try { if (dir && statSync(dir).isDirectory()) real = realpathSync(dir) } catch { /* dossier supprimé, déplacé ou inaccessible */ }
  if (!real) throw new PluginError('blocked', 'Le dossier choisi est introuvable')
  return { dir: real, extra: accountId === undefined ? undefined : importDirOf(accountId), extensions: manifest.permissions.folderExtensions }
}

function buildRequest(row: db.PluginRow, fn: 'resolve' | 'refresh' | 'search' | 'cross', inputs: Record<string, string>, account?: { id: number; externalId: string; displayName: string }, query?: string, cross?: Record<string, string>): RunRequest {
  const manifest = loadManifest(row)
  const secretValues: Record<string, string> = {}
  for (const s of manifest.secrets) secretValues[s.key] = secrets.getSecret(secretKey(row.id, s.key)) ?? ''
  const memory = new Map<string, string>()                       // stockage éphémère pour `resolve` (compte pas encore créé)
  const accountId = account?.id
  return {
    manifest, script: row.script, fn,
    // Le dossier d'images ne regarde que l'interface : le script ne reçoit même pas son chemin.
    ctx: { inputs: Object.fromEntries(Object.entries(inputs).filter(([k]) => manifest.inputs.find((i) => i.key === k)?.type !== 'images')), secrets: secretValues, lang: db.getSettings().lang, account: account ? { externalId: account.externalId, displayName: account.displayName } : undefined, query, cross },
    folder: folderOf(manifest, inputs, accountId),
    storage: accountId === undefined
      ? { get: (k) => memory.get(k) ?? null, set: (k, v) => { memory.set(k, v) } }
      : {
        get: (k) => db.pluginStorageGet(row.id, accountId, k),
        set: (k, v) => {
          if (db.pluginStorageGet(row.id, accountId, k) === null && db.pluginStorageCount(row.id, accountId) >= MAX_STORAGE_KEYS) throw new Error('trop de clés de stockage')
          db.pluginStorageSet(row.id, accountId, k, v)
        }
      }
  }
}

/** Valide les champs saisis selon le manifeste. */
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

  // Le plugin peut valider les saisies et fournir un nom d'affichage (fonction `resolve`, facultative).
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

/** Modifie les champs d'un compte (ex. ajouter le dossier d'images) ; l'identité du compte ne change pas. */
export function updatePluginAccount(accountId: number, raw: Record<string, string>): { ok: boolean; error?: string } {
  const pa = db.getPluginAccountRow(accountId), row = pa && db.getPluginRow(pa.plugin_id)
  if (!pa || !row) return { ok: false, error: 'disabled' }
  const c = cleanInputs(loadManifest(row), raw)
  if (!c.ok) return c
  db.setPluginAccountInputs(accountId, c.inputs)
  return { ok: true }
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
/** Image du dossier d'images d'un compte (permission `images`) : un simple nom de fichier, image uniquement, 3 Mo au plus.
 *  Le script du plugin n'y a jamais accès ; seule l'interface l'affiche. */
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
  try { rmSync(importDirOf(accountId), { recursive: true, force: true }) } catch { /* rien à supprimer */ }
}

/** Copie des fichiers choisis par l'utilisateur dans le dossier d'imports du compte, en gardant leur date
 *  (les plugins s'en servent pour dater les données). Seules les extensions autorisées par le manifeste sont acceptées. */
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
        if (statSync(target).size === st.size && readFileSync(target).equals(readFileSync(p))) { target = ''; break }   // déjà importé
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

/** Exécute le plugin pour un compte et enregistre le résultat. Les erreurs sont conservées pour l'affichage. */
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
    if (!Object.keys(result.metrics).length && !result.history.length) throw new PluginError('invalid_result', 'Aucune métrique déclarée n’a été renvoyée')
    // Paliers : comparés au relevé précédent, avant d'enregistrer le nouveau ; une erreur de notification ne bloque rien.
    try { processPluginRefresh(accountId, pa.display_name, manifest, db.getLatest(accountId) as Record<string, number>, result.metrics) } catch (e) { console.error('Paliers plugin :', e) }
    try { processPluginNotices(accountId, pa.display_name, manifest, result.notices) } catch (e) { console.error('Notifications plugin :', e) }
    db.insertHistory(accountId, result.history)
    db.insertSnapshots(accountId, result.metrics)
    db.savePluginItems(accountId, result.items, manifest.itemsMode)
    // Garde-fou : un retard qui ne baisse jamais (plugin qui se trompe) ne doit pas relancer le plugin toutes les 5 s sans fin.
    const prevBacklog = Number(db.getMeta(accountId, 'backlog')) || 0
    const stalled = result.backlog > 0 && result.backlog >= prevBacklog ? (Number(db.getMeta(accountId, 'stalled')) || 0) + 1 : 0
    db.setMeta(accountId, 'stalled', String(stalled))
    db.setMeta(accountId, 'backlog', String(result.backlog))
    if (result.summary) db.setMeta(accountId, 'summary', JSON.stringify(result.summary))
    // Travail restant (ex. fichiers pas encore lus) : on relance bientôt, sans attendre la prochaine actualisation.
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

/** Actualise les comptes de plugins arrivés à échéance, un par un pour borner la charge. */
export async function refreshAllPlugins(): Promise<void> {
  for (const pa of db.listPluginAccountRows()) {
    const row = db.getPluginRow(pa.plugin_id)
    if (!row || !row.enabled) continue
    let minutes = 30
    try { minutes = loadManifest(row).refreshMinutes } catch { continue }
    // Un compte qui a encore du retard (backlog) est relancé même s'il vient d'être actualisé (ex. après un redémarrage).
    const behind = Number(db.getMeta(pa.account_id, 'backlog')) > 0 && (Number(db.getMeta(pa.account_id, 'stalled')) || 0) < MAX_STALLED
    if (!behind && pa.last_sync_at && Date.now() - pa.last_sync_at < minutes * 60_000 * 0.9) continue
    await refreshPluginAccount(pa.account_id)
  }
}

export function pluginAccountData(accountId: number): { logs: string[]; error: string | null; backlog: number; summary: PluginDetail | null } {
  const parse = <T,>(k: string, fallback: T): T => { try { return JSON.parse(db.getMeta(accountId, k) ?? '') as T } catch { return fallback } }
  return { logs: parse<string[]>('log', []), error: db.getMeta(accountId, 'error') || null, backlog: Number(db.getMeta(accountId, 'backlog')) || 0,
    summary: parse<PluginDetail | null>('summary', null) }
}

export function pluginAccountItems(accountId: number, offset: number, limit: number, month?: string, sortKey?: string, desc = true, query = '', scope = 'all'): PluginItemsPage {
  const page = Math.min(200, Math.max(1, Math.floor(limit) || 50)), from = Math.max(0, Math.floor(offset) || 0)
  const m = typeof month === 'string' && /^\d{4}-\d{2}$/.test(month) ? month : undefined
  const key = sortKey === 'title' || sortKey === 'ts' || (typeof sortKey === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(sortKey)) ? sortKey : 'ts'
  const pa = db.getPluginAccountRow(accountId), row = pa && db.getPluginRow(pa.plugin_id)
  let cols: string[] = []
  try { if (row) cols = loadManifest(row).itemColumns.map((c) => c.key) } catch { /* manifeste illisible : pas de stats */ }
  const sc = scope === 'all' || scope === 'title' || cols.includes(scope) ? scope : 'all'
  return db.listPluginItems(accountId, from, page, m, key, desc !== false, typeof query === 'string' ? query.slice(0, 100) : '', sc, cols)
}

/* ---------- Fichier .wdsh reçu à l'ouverture (double-clic) ---------- */
let pendingFile: string | null = null
export const setPendingFile = (p: string | null): void => { pendingFile = p }
export const takePendingFile = (): string | null => { const p = pendingFile; pendingFile = null; return p }

/* ---------- Plugins fournis avec l'appli ---------- */
const bundledDir = (): string => (app.isPackaged ? join(process.resourcesPath, 'plugins') : join(app.getAppPath(), 'examples'))
const samePermissions = (a: PluginManifest, b: PluginManifest): boolean =>
  JSON.stringify([...a.permissions.network].sort()) === JSON.stringify([...b.permissions.network].sort()) &&
  a.permissions.folder === b.permissions.folder && a.permissions.images === b.permissions.images && JSON.stringify([...a.permissions.folderExtensions].sort()) === JSON.stringify([...b.permissions.folderExtensions].sort())

export interface BundledPlugin { path: string; id: string; name: string; version: string; description: PluginManifest['description']; installedVersion: string | null }

/** Plugins livrés avec l'appli (une version par plugin, la plus récente). */
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

/** Au démarrage : met à jour en silence les plugins installés dont l'appli fournit une version plus récente,
 *  seulement si les permissions sont identiques (sinon l'utilisateur confirme depuis la page Plugins). */
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

/** Mises à jour depuis le catalogue en ligne : même règle que les plugins fournis (permissions identiques, sinon confirmation). */
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
        // Les comptes du plugin profitent de la nouvelle version tout de suite, sans attendre leur prochaine actualisation.
        for (const pa of db.listPluginAccountRows()) if (pa.plugin_id === e.id) await refreshPluginAccount(pa.account_id)
      }
    } catch (err) { console.error('Catalogue :', e.id, err) }
  }
  return updated
}

/** Recherche libre (barre du haut) : la fonction `search` du plugin, si elle existe, calcule un détail pour la requête
 *  (ex. toutes les stats d'un joueur). Aucune donnée n'est enregistrée et un échec ne compte pas comme une panne du plugin. */
export async function pluginAccountSearch(accountId: number, query: string): Promise<{ ok: boolean; unsupported?: boolean; detail?: PluginDetail; error?: string }> {
  const pa = db.getPluginAccountRow(accountId), row = pa && db.getPluginRow(pa.plugin_id)
  const q = String(query ?? '').trim().slice(0, 100)
  if (!pa || !row || !row.enabled || q.length < 2) return { ok: false }
  try {
    const inputs = JSON.parse(pa.inputs) as Record<string, string>
    const run = await runIsolated(buildRequest(row, 'search', inputs, { id: accountId, externalId: pa.external_id, displayName: pa.display_name }, q), { pluginId: row.id, accountId })
    return { ok: true, detail: sanitizeDetail(run.value) }
  } catch (e) {
    if (e instanceof PluginError && e.code === 'no_function') return { ok: false, unsupported: true }
    return { ok: false, error: msgOf(e) }
  }
}

/** Outil « Croiser tes données » : la fonction `cross` du plugin reçoit le joueur, la mesure et les deux axes choisis
 *  (valeurs limitées aux menus du manifeste) et renvoie un détail (barres, tableau). Rien n'est enregistré. */
export async function pluginAccountCross(accountId: number, req: Record<string, string>): Promise<{ ok: boolean; detail?: PluginDetail; error?: string }> {
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
    const run = await runIsolated(buildRequest(row, 'cross', JSON.parse(pa.inputs) as Record<string, string>, { id: accountId, externalId: pa.external_id, displayName: pa.display_name }, undefined, clean), { pluginId: row.id, accountId })
    return { ok: true, detail: sanitizeDetail(run.value) }
  } catch (e) { return { ok: false, error: msgOf(e) } }
}
