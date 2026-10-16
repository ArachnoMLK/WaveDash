// Gestion des plugins : installation (avec validation), comptes, actualisation, clés.
import { app } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { readFileSync, realpathSync, statSync } from 'fs'
import {
  compareVersions, InstalledPlugin, PLUGIN_LIMITS, PluginAccount, PluginInspect, PluginItemsPage, PluginManifest, sanitizeResolveResult, sanitizeRunResult, validateManifest
} from '@shared/plugin'
import * as db from '../db'
import * as secrets from '../secrets'
import { FolderAccess } from './files'
import { PluginError, RunRequest, runPlugin } from './sandbox'
import { readZip, ZipError } from './zip'

/** Après 5 échecs consécutifs, le plugin est désactivé pour ne pas s'exécuter en boucle. */
const MAX_FAILURES = 5
const MAX_STORAGE_KEYS = 100
/** Délai avant de relancer un plugin qui signale du travail restant (`backlog`). */
const CATCH_UP_MS = 5_000

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
function folderOf(manifest: PluginManifest, inputs: Record<string, string>): FolderAccess | undefined {
  if (!manifest.permissions.folder) return undefined
  const key = manifest.inputs.find((i) => i.type === 'folder')?.key
  const dir = key ? inputs[key] : undefined
  let real: string | null = null
  try { if (dir && statSync(dir).isDirectory()) real = realpathSync(dir) } catch { /* dossier supprimé, déplacé ou inaccessible */ }
  if (!real) throw new PluginError('blocked', 'Le dossier choisi est introuvable')
  return { dir: real, extensions: manifest.permissions.folderExtensions }
}

function buildRequest(row: db.PluginRow, fn: 'resolve' | 'refresh', inputs: Record<string, string>, account?: { id: number; externalId: string; displayName: string }): RunRequest {
  const manifest = loadManifest(row)
  const secretValues: Record<string, string> = {}
  for (const s of manifest.secrets) secretValues[s.key] = secrets.getSecret(secretKey(row.id, s.key)) ?? ''
  const memory = new Map<string, string>()                       // stockage éphémère pour `resolve` (compte pas encore créé)
  const accountId = account?.id
  return {
    manifest, script: row.script, fn,
    ctx: { inputs, secrets: secretValues, lang: db.getSettings().lang, account: account ? { externalId: account.externalId, displayName: account.displayName } : undefined },
    folder: folderOf(manifest, inputs),
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
    if (i.type === 'folder') { try { if (!statSync(v).isDirectory()) throw new Error() } catch { return { ok: false, error: `input_invalid:${i.key}` } } }
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
  let displayName = Object.entries(c.inputs).find(([k]) => manifest.inputs.find((i) => i.key === k)?.type !== 'folder')?.[1] ?? manifest.name
  try {
    const r = await runPlugin(buildRequest(row, 'resolve', c.inputs))
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

export function removePluginAccount(accountId: number): void {
  if (db.getPluginAccountRow(accountId)) db.deleteAccount(accountId)
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
    const run = await runPlugin(buildRequest(row, 'refresh', inputs, { id: accountId, externalId: pa.external_id, displayName: pa.display_name }))
    const result = sanitizeRunResult(run.value, manifest)
    if (!Object.keys(result.metrics).length && !result.history.length) throw new PluginError('invalid_result', 'Aucune métrique déclarée n’a été renvoyée')
    db.insertHistory(accountId, result.history)
    db.insertSnapshots(accountId, result.metrics)
    db.savePluginItems(accountId, result.items, manifest.itemsMode)
    db.setMeta(accountId, 'backlog', String(result.backlog))
    // Travail restant (ex. fichiers pas encore lus) : on relance bientôt, sans attendre la prochaine actualisation.
    if (result.backlog > 0) catchUps.set(accountId, setTimeout(() => { catchUps.delete(accountId); void refreshPluginAccount(accountId).then(() => notify()) }, CATCH_UP_MS))
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
    db.setMeta(accountId, 'backlog', '0')
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
    if (pa.last_sync_at && Date.now() - pa.last_sync_at < minutes * 60_000 * 0.9) continue
    await refreshPluginAccount(pa.account_id)
  }
}

export function pluginAccountData(accountId: number): { logs: string[]; error: string | null; backlog: number } {
  const parse = <T,>(k: string, fallback: T): T => { try { return JSON.parse(db.getMeta(accountId, k) ?? '') as T } catch { return fallback } }
  return { logs: parse<string[]>('log', []), error: db.getMeta(accountId, 'error') || null, backlog: Number(db.getMeta(accountId, 'backlog')) || 0 }
}

export function pluginAccountItems(accountId: number, offset: number, limit: number, month?: string): PluginItemsPage {
  const page = Math.min(200, Math.max(1, Math.floor(limit) || 50)), from = Math.max(0, Math.floor(offset) || 0)
  const m = typeof month === 'string' && /^\d{4}-\d{2}$/.test(month) ? month : undefined
  return db.listPluginItems(accountId, from, page, m)
}

/* ---------- Fichier .wdsh reçu à l'ouverture (double-clic) ---------- */
let pendingFile: string | null = null
export const setPendingFile = (p: string | null): void => { pendingFile = p }
export const takePendingFile = (): string | null => { const p = pendingFile; pendingFile = null; return p }
