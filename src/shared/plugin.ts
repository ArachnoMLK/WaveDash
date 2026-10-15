// Format des plugins .wdsh : manifeste, validation, résultats renvoyés par un plugin.
// Un plugin est une archive ZIP contenant `manifest.json` et un script JavaScript (point d'entrée).
import type { Lang } from './types'

/** Texte simple ou traduit : "Prix" ou { "fr": "Prix", "en": "Price" }. */
export type LocalText = string | { fr?: string; en?: string }
export const loc = (t: LocalText | undefined, lang: Lang): string =>
  !t ? '' : typeof t === 'string' ? t : t[lang] ?? t.fr ?? t.en ?? ''

export type InputType = 'text' | 'number' | 'folder'
export interface PluginInput { key: string; label: LocalText; type: InputType; placeholder?: string; required: boolean; help?: LocalText }
export interface PluginSecret { key: string; label: LocalText; help?: LocalText }
export type MetricFormat = 'number' | 'percent' | 'rank' | 'duration'
export interface PluginMetric { key: string; label: LocalText; unit?: string; format: MetricFormat; decimals: number; primary: boolean }
export interface PluginColumn { key: string; label: LocalText; unit?: string }

export interface PluginManifest {
  wdsh: 1
  id: string
  name: string
  version: string
  author: string
  description: LocalText
  minAppVersion?: string
  entry: string
  permissions: {
    /** Domaines autorisés (HTTPS uniquement). `*.exemple.com` = tous les sous-domaines. */
    network: string[]
    /** Lecture d'un dossier choisi par l'utilisateur (non récursive, jamais en écriture). */
    folder: boolean
    folderExtensions: string[]
  }
  inputs: PluginInput[]
  secrets: PluginSecret[]
  metrics: PluginMetric[]
  itemColumns: PluginColumn[]
  refreshMinutes: number
}

export const PLUGIN_LIMITS = { maxArchive: 5 * 1024 * 1024, maxScript: 1024 * 1024, maxItems: 200, maxHistory: 5000 }

const ID_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/
const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/
const METRIC_RE = /^[a-z][a-z0-9_]{0,31}$/
const DOMAIN_RE = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/
const EXT_RE = /^\.[a-z0-9]{1,10}$/
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/
const ENTRY_RE = /^[\w-]+(\/[\w-]+)*\.js$/

type Result = { ok: true; manifest: PluginManifest } | { ok: false; error: string }

function text(v: unknown, max: number): LocalText | null {
  if (typeof v === 'string') return v.trim() && v.length <= max ? v.trim() : null
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>, out: { fr?: string; en?: string } = {}
    for (const l of ['fr', 'en'] as const) if (o[l] !== undefined) { if (typeof o[l] !== 'string' || (o[l] as string).length > max) return null; out[l] = (o[l] as string).trim() }
    return out.fr || out.en ? out : null
  }
  return null
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

/** Contrôle strict du manifeste : tout ce qui n'est pas reconnu est ignoré, tout ce qui est incorrect est refusé. */
export function validateManifest(raw: unknown): Result {
  const fail = (error: string): Result => ({ ok: false, error })
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('manifest')
  const m = raw as Record<string, unknown>
  if (m.wdsh !== 1) return fail('format_version')
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) return fail('id')
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 60) return fail('name')
  if (typeof m.version !== 'string' || !VERSION_RE.test(m.version)) return fail('version')
  const author = typeof m.author === 'string' && m.author.length <= 60 ? m.author.trim() : ''
  const description = text(m.description ?? '-', 400) ?? '-'
  const entry = m.entry === undefined ? 'main.js' : m.entry
  if (typeof entry !== 'string' || !ENTRY_RE.test(entry)) return fail('entry')
  if (m.minAppVersion !== undefined && (typeof m.minAppVersion !== 'string' || !VERSION_RE.test(m.minAppVersion))) return fail('minAppVersion')

  const p = (m.permissions ?? {}) as Record<string, unknown>
  if (typeof p !== 'object' || Array.isArray(p)) return fail('permissions')
  const network = p.network ?? []
  if (!Array.isArray(network) || network.length > 10) return fail('permissions.network')
  for (const d of network) if (typeof d !== 'string' || !DOMAIN_RE.test(d)) return fail('permissions.network')
  const folder = p.folder === undefined ? false : p.folder
  if (typeof folder !== 'boolean') return fail('permissions.folder')
  const exts = p.folderExtensions ?? []
  if (!Array.isArray(exts) || exts.length > 10 || exts.some((e) => typeof e !== 'string' || !EXT_RE.test(e))) return fail('permissions.folderExtensions')

  const inputsRaw = m.inputs ?? []
  if (!Array.isArray(inputsRaw) || inputsRaw.length > 8) return fail('inputs')
  const inputs: PluginInput[] = []
  for (const i of inputsRaw as Record<string, unknown>[]) {
    const label = text(i?.label, 80)
    if (!i || typeof i.key !== 'string' || !KEY_RE.test(i.key) || !label || !['text', 'number', 'folder'].includes(i.type as string)) return fail('inputs')
    inputs.push({ key: i.key, label, type: i.type as InputType, required: i.required !== false,
      placeholder: typeof i.placeholder === 'string' ? i.placeholder.slice(0, 80) : undefined, help: text(i.help ?? '-', 200) ?? undefined })
  }
  const folderInputs = inputs.filter((i) => i.type === 'folder').length
  if (new Set(inputs.map((i) => i.key)).size !== inputs.length) return fail('inputs')
  if (folder && folderInputs !== 1) return fail('folder_input')
  if (!folder && folderInputs > 0) return fail('folder_permission')

  const secretsRaw = m.secrets ?? []
  if (!Array.isArray(secretsRaw) || secretsRaw.length > 4) return fail('secrets')
  const secrets: PluginSecret[] = []
  for (const s of secretsRaw as Record<string, unknown>[]) {
    const label = text(s?.label, 80)
    if (!s || typeof s.key !== 'string' || !KEY_RE.test(s.key) || !label) return fail('secrets')
    secrets.push({ key: s.key, label, help: text(s.help ?? '-', 200) ?? undefined })
  }

  const metricsRaw = m.metrics
  if (!Array.isArray(metricsRaw) || metricsRaw.length < 1 || metricsRaw.length > 20) return fail('metrics')
  const metrics: PluginMetric[] = []
  for (const x of metricsRaw as Record<string, unknown>[]) {
    const label = text(x?.label, 80)
    const format = x?.format === undefined ? 'number' : x.format
    if (!x || typeof x.key !== 'string' || !METRIC_RE.test(x.key) || !label || !['number', 'percent', 'rank', 'duration'].includes(format as string)) return fail('metrics')
    const decimals = typeof x.decimals === 'number' && x.decimals >= 0 && x.decimals <= 4 ? Math.floor(x.decimals) : 0
    metrics.push({ key: x.key, label, unit: typeof x.unit === 'string' ? x.unit.slice(0, 8) : undefined, format: format as MetricFormat, decimals, primary: x.primary === true })
  }
  if (new Set(metrics.map((x) => x.key)).size !== metrics.length) return fail('metrics')

  const colsRaw = m.itemColumns ?? []
  if (!Array.isArray(colsRaw) || colsRaw.length > 8) return fail('itemColumns')
  const itemColumns: PluginColumn[] = []
  for (const c of colsRaw as Record<string, unknown>[]) {
    const label = text(c?.label, 60)
    if (!c || typeof c.key !== 'string' || !KEY_RE.test(c.key) || !label) return fail('itemColumns')
    itemColumns.push({ key: c.key, label, unit: typeof c.unit === 'string' ? c.unit.slice(0, 8) : undefined })
  }

  const refresh = typeof m.refreshMinutes === 'number' && Number.isFinite(m.refreshMinutes) ? Math.min(1440, Math.max(5, Math.round(m.refreshMinutes))) : 30
  return { ok: true, manifest: { wdsh: 1, id: m.id, name: m.name.trim(), version: m.version, author, description, minAppVersion: m.minAppVersion as string | undefined, entry,
    permissions: { network: network as string[], folder, folderExtensions: (exts as string[]).map((e) => e.toLowerCase()) },
    inputs, secrets, metrics, itemColumns, refreshMinutes: refresh } }
}

/* ---------- Résultats renvoyés par un plugin ---------- */
/** Détail facultatif d'un élément : un tableau et/ou une frise d'événements (affichés quand on clique sur l'élément). */
export interface PluginDetail {
  table?: { columns: string[]; rows: (string | number)[][] }
  timeline?: { duration: number; lanes: string[]; events: { t: number; lane: number; label?: string }[] }
}
export interface PluginItem { id: string; title: string; ts?: number; fields: Record<string, string | number>; detail?: PluginDetail }
export const DETAIL_LIMITS = { columns: 8, rows: 40, cell: 80, lanes: 16, events: 400, label: 24 }
export interface PluginRunResult {
  metrics: Record<string, number>
  items: PluginItem[]
  history: { ts: number; metrics: Record<string, number> }[]
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e15 ? v : null)

/** Ne garde que ce que le manifeste déclare, avec les bons types. Rien d'autre n'entre dans la base. */
/** Détail d'un élément : tailles bornées, types vérifiés, rien d'autre n'est conservé. */
export function sanitizeDetail(raw: unknown): PluginDetail | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>, L = DETAIL_LIMITS, out: PluginDetail = {}
  const t = r.table as Record<string, unknown> | undefined
  if (t && Array.isArray(t.columns) && Array.isArray(t.rows)) {
    const columns = t.columns.slice(0, L.columns).map((c) => String(c ?? '').slice(0, L.cell))
    const rows = t.rows.slice(0, L.rows).filter(Array.isArray).map((row) =>
      (row as unknown[]).slice(0, columns.length).map((v) => (typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : String(v ?? '').slice(0, L.cell))))
    if (columns.length && rows.length) out.table = { columns, rows }
  }
  const tl = r.timeline as Record<string, unknown> | undefined
  if (tl && Array.isArray(tl.lanes) && Array.isArray(tl.events)) {
    const lanes = tl.lanes.slice(0, L.lanes).map((x) => String(x ?? '').slice(0, L.cell))
    const duration = num(tl.duration)
    const events: { t: number; lane: number; label?: string }[] = []
    for (const e of tl.events.slice(0, L.events) as Record<string, unknown>[]) {
      const at = num(e?.t), lane = num(e?.lane)
      if (at === null || at < 0 || at > 86_400 || lane === null || !Number.isInteger(lane) || lane < 0 || lane >= lanes.length) continue
      events.push({ t: at, lane, label: typeof e.label === 'string' ? e.label.slice(0, L.label) : undefined })
    }
    if (lanes.length && duration !== null && duration > 0 && duration <= 86_400) out.timeline = { duration, lanes, events }
  }
  return out.table || out.timeline ? out : undefined
}

export function sanitizeRunResult(raw: unknown, m: PluginManifest, now = Date.now()): PluginRunResult {
  const out: PluginRunResult = { metrics: {}, items: [], history: [] }
  if (!raw || typeof raw !== 'object') return out
  const r = raw as Record<string, unknown>
  const keys = new Set(m.metrics.map((x) => x.key))
  const pickMetrics = (src: unknown): Record<string, number> => {
    const o: Record<string, number> = {}
    if (src && typeof src === 'object') for (const [k, v] of Object.entries(src as Record<string, unknown>)) { const n = num(v); if (keys.has(k) && n !== null) o[k] = n }
    return o
  }
  out.metrics = pickMetrics(r.metrics)
  const cols = new Set(m.itemColumns.map((c) => c.key))
  if (Array.isArray(r.items)) {
    for (const it of r.items.slice(0, PLUGIN_LIMITS.maxItems) as Record<string, unknown>[]) {
      if (!it || typeof it.id !== 'string' || typeof it.title !== 'string') continue
      const fields: Record<string, string | number> = {}
      if (it.fields && typeof it.fields === 'object') for (const [k, v] of Object.entries(it.fields as Record<string, unknown>)) {
        if (!cols.has(k)) continue
        if (typeof v === 'string') fields[k] = v.slice(0, 200); else { const n = num(v); if (n !== null) fields[k] = n }
      }
      const ts = num(it.ts)
      out.items.push({ id: it.id.slice(0, 100), title: it.title.slice(0, 200), ts: ts !== null && ts > 0 && ts < now + 86_400_000 ? ts : undefined, fields, detail: sanitizeDetail(it.detail) })
    }
  }
  if (Array.isArray(r.history)) {
    for (const h of r.history.slice(0, PLUGIN_LIMITS.maxHistory) as Record<string, unknown>[]) {
      const ts = num(h?.ts), metrics = pickMetrics(h?.metrics)
      if (ts !== null && ts > 0 && ts <= now + 86_400_000 && Object.keys(metrics).length) out.history.push({ ts, metrics })
    }
  }
  return out
}

export function sanitizeResolveResult(raw: unknown): { externalId: string; displayName: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.externalId === 'string' && r.externalId.trim() ? r.externalId.trim().slice(0, 120) : null
  const name = typeof r.displayName === 'string' && r.displayName.trim() ? r.displayName.trim().slice(0, 80) : null
  return id && name ? { externalId: id, displayName: name } : null
}

/* ---------- Types échangés avec l'interface ---------- */
export interface InstalledPlugin {
  id: string
  manifest: PluginManifest
  enabled: boolean
  installedAt: number
  failures: number
  lastError: string | null
  /** Clés de secrets déjà enregistrées. */
  secretsSet: string[]
}
export interface PluginAccount {
  id: number
  pluginId: string
  displayName: string
  inputs: Record<string, string>
  createdAt: number
  lastSyncAt: number | null
  lastError: string | null
}
export interface PluginInspect {
  token: string
  manifest: PluginManifest
  /** Version déjà installée (mise à jour) ou null (nouvelle installation). */
  installedVersion: string | null
}
