// .wdsh plugin format: manifest, validation, results returned by a plugin.
// A plugin is a ZIP archive containing `manifest.json` and a JavaScript script (entry point).
import { LANGS, type Lang } from './types'

/** Plain or translated text: "Price" or { "en": "Price", "fr": "Prix", "ja": "価格" }. */
export type LocalText = string | Partial<Record<Lang, string>>
/** The text in the interface language; otherwise English (French first for a French interface), then any language. */
export const loc = (t: LocalText | undefined, lang: Lang): string =>
  !t ? '' : typeof t === 'string' ? t : t[lang] ?? (lang === 'fr' ? t.fr ?? t.en : t.en ?? t.fr) ?? Object.values(t).find(Boolean) ?? ''

/** `images`: image folder shown by WaveDash (`images` permission); the script never reads it, it only gives a file name. */
export type InputType = 'text' | 'number' | 'folder' | 'images'
export interface PluginInput { key: string; label: LocalText; type: InputType; placeholder?: string; required: boolean; help?: LocalText }
export interface PluginSecret { key: string; label: LocalText; help?: LocalText }
export type MetricFormat = 'number' | 'percent' | 'rank' | 'duration'
/** Milestones offered by default for a metric (the user can change them in Settings › Notifications). */
export interface PluginMilestone { enabled?: boolean; increment?: number; notifyDown?: boolean }
export interface PluginMetric { key: string; label: LocalText; unit?: string; format: MetricFormat; decimals: number; primary: boolean; milestone?: PluginMilestone }
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
    /** Allowed domains (HTTPS only). `*.example.com` = all subdomains. */
    network: string[]
    /** Reading of a folder chosen by the user (non-recursive, never writing). */
    folder: boolean
    folderExtensions: string[]
    /** Display of images from a folder chosen by the user (e.g. game thumbnails), without the script having access to it. */
    images: boolean
  }
  inputs: PluginInput[]
  secrets: PluginSecret[]
  metrics: PluginMetric[]
  itemColumns: PluginColumn[]
  /** `replace` (default): each refresh replaces the item list. `keep`: items are added and
   *  kept (same `id` = updated), to keep a history, for example one game per file read. */
  itemsMode: 'replace' | 'keep'
  /** The script defines `search`: WaveDash shows the search bar at the top of the account page. */
  search: boolean
  /** The plugin can send notifications (`notices` in its result), which can be turned off in the settings. */
  notices: boolean
  /** The script defines `view`: with the top bar filters (`filters` in its result), it recomputes the overview. */
  views: boolean
  /** The plugin feeds the player bank (`players` in its result) and defines `player`, which builds a player's sheet from their records. */
  players: boolean
  /** "Cross your data" tool: measures and axes offered in the menus; the script then defines `cross`. */
  cross?: { measures: { key: string; label: LocalText }[]; dimensions: { key: string; label: LocalText }[] }
  refreshMinutes: number
}

export const PLUGIN_LIMITS = { maxArchive: 5 * 1024 * 1024, maxScript: 1024 * 1024, maxItems: 200, maxHistory: 5000, maxStoredItems: 20000 }

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
    const o = v as Record<string, unknown>, out: Partial<Record<Lang, string>> = {}
    for (const { id } of LANGS) if (o[id] !== undefined) { if (typeof o[id] !== 'string' || (o[id] as string).length > max) return null; out[id] = (o[id] as string).trim() }
    return Object.values(out).some(Boolean) ? out : null
  }
  return null
}

/** Menus of the cross tool: 2 to 12 entries each, simple keys, short labels; otherwise the tool is ignored. */
function crossOf(raw: unknown): PluginManifest['cross'] {
  const r = raw as { measures?: unknown; dimensions?: unknown } | undefined
  const list = (v: unknown): { key: string; label: LocalText }[] | null => {
    if (!Array.isArray(v) || v.length < 1 || v.length > 12) return null
    const out = (v as Record<string, unknown>[]).map((x) => ({ key: x?.key, label: text(x?.label, 40) }))
    return out.every((x) => typeof x.key === 'string' && KEY_RE.test(x.key) && x.label) ? (out as { key: string; label: LocalText }[]) : null
  }
  const measures = list(r?.measures), dimensions = list(r?.dimensions)
  return measures && dimensions ? { measures, dimensions } : undefined
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

/** Strict manifest check: anything unrecognized is ignored, anything incorrect is rejected. */
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
    if (!i || typeof i.key !== 'string' || !KEY_RE.test(i.key) || !label || !['text', 'number', 'folder', 'images'].includes(i.type as string)) return fail('inputs')
    inputs.push({ key: i.key, label, type: i.type as InputType, required: i.required !== false,
      placeholder: typeof i.placeholder === 'string' ? i.placeholder.slice(0, 80) : undefined, help: text(i.help ?? '-', 200) ?? undefined })
  }
  const folderInputs = inputs.filter((i) => i.type === 'folder').length
  if (new Set(inputs.map((i) => i.key)).size !== inputs.length) return fail('inputs')
  if (folder && folderInputs !== 1) return fail('folder_input')
  if (!folder && folderInputs > 0) return fail('folder_permission')
  const images = p.images === undefined ? false : p.images
  if (typeof images !== 'boolean') return fail('permissions.images')
  const imageInputs = inputs.filter((i) => i.type === 'images').length
  if (images && imageInputs !== 1) return fail('images_input')
  if (!images && imageInputs > 0) return fail('images_permission')

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
    let milestone: PluginMilestone | undefined
    if (x.milestone !== undefined) {
      const ms = x.milestone as Record<string, unknown>
      if (!ms || typeof ms !== 'object' || Array.isArray(ms)) return fail('metrics')
      if (ms.enabled !== undefined && typeof ms.enabled !== 'boolean') return fail('metrics')
      if (ms.notifyDown !== undefined && typeof ms.notifyDown !== 'boolean') return fail('metrics')
      if (ms.increment !== undefined && (typeof ms.increment !== 'number' || !Number.isInteger(ms.increment) || ms.increment < 1 || ms.increment > 1e9)) return fail('metrics')
      milestone = { enabled: ms.enabled as boolean | undefined, increment: ms.increment as number | undefined, notifyDown: ms.notifyDown as boolean | undefined }
    }
    metrics.push({ key: x.key, label, unit: typeof x.unit === 'string' ? x.unit.slice(0, 8) : undefined, format: format as MetricFormat, decimals, primary: x.primary === true, milestone })
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

  const itemsMode = m.itemsMode === undefined ? 'replace' : m.itemsMode
  if (itemsMode !== 'replace' && itemsMode !== 'keep') return fail('itemsMode')

  const refresh = typeof m.refreshMinutes === 'number' && Number.isFinite(m.refreshMinutes) ? Math.min(1440, Math.max(5, Math.round(m.refreshMinutes))) : 30
  return { ok: true, manifest: { wdsh: 1, id: m.id, name: m.name.trim(), version: m.version, author, description, minAppVersion: m.minAppVersion as string | undefined, entry,
    permissions: { network: network as string[], folder, folderExtensions: (exts as string[]).map((e) => e.toLowerCase()), images },
    inputs, secrets, metrics, itemColumns, itemsMode, search: m.search === true, notices: m.notices === true, views: m.views === true, players: m.players === true, cross: crossOf(m.cross), refreshMinutes: refresh } }
}

/* ---------- Results returned by a plugin ---------- */
/** Optional detail of an item (shown on click) or account overview: badges, key figures, tables,
 *  heat grids, curves and event timeline. Every part is optional. */
export interface DetailTable { title?: string; columns: string[]; rows: (string | number)[][] }
export interface DetailGrid { title?: string; rows: string[]; cols: string[]; values: number[][] }
export interface DetailSeries { title?: string; unit?: string; step: number; lines: { name: string; values: number[] }[] }
/** Bars by category, one colour per series (grouped, or stacked with `stacked`). */
export interface DetailBars { title?: string; unit?: string; stacked?: boolean; categories: string[]; series: { name: string; values: number[] }[] }
/** Image shown at the top of the detail: a file from the account's image folder (`images` permission). */
export interface DetailImage { file: string; caption?: string }
export const IMAGE_FILE_RE = /^[\w .()'&,+-]{1,100}\.(jpg|jpeg|png|webp)$/i
export interface PluginDetail {
  image?: DetailImage
  chips?: string[]
  stats?: { label: string; value: string | number }[]
  table?: DetailTable
  tables?: DetailTable[]
  grids?: DetailGrid[]
  series?: DetailSeries[]
  bars?: DetailBars[]
  /** Timeline: `kind` picks the point shape (`ko` diamond, the default; `action` small dot; `mark` triangle). */
  timeline?: { duration: number; lanes: string[]; events: { t: number; lane: number; label?: string; kind?: TimelineKind }[] }
}
export type TimelineKind = 'ko' | 'action' | 'mark'
export interface PluginItem { id: string; title: string; ts?: number; fields: Record<string, string | number>; detail?: PluginDetail }
export const DETAIL_LIMITS = {
  columns: 10, rows: 80, cell: 80, lanes: 16, events: 400, label: 24,
  chips: 16, chip: 40, stats: 24, tables: 8, grids: 8, gridSize: 8, series: 4, lines: 16, points: 600, bars: 4, categories: 60
}
export interface PluginRunResult {
  metrics: Record<string, number>
  items: PluginItem[]
  history: { ts: number; metrics: Record<string, number> }[]
  /** Account overview (same format as an item detail), shown at the top of its page. */
  summary?: PluginDetail
  /** Remaining work reported by the plugin (e.g. files not read yet): if positive, WaveDash reruns the plugin shortly after. */
  backlog: number
  /** Notifications (manifest `notices: true`): at most 3, each sent only once (same `id` = ignored afterwards). */
  notices: PluginNotice[]
  /** Top bar filters (manifest `views: true`). */
  filters: PluginFilter[]
  /** Player bank records (manifest `players: true`). */
  players: PlayerRecord[]
}
export interface PluginNotice { id: string; title: string; text: string; direction: 'up' | 'down' }
/** Top bar filter (e.g. Mode, Patch, Period). `field`: item column filtered by exact match; "$ts": the
 *  items of the last N days (value = number of days). Without `field`, only the overview (`view` function) is filtered. */
export interface PluginFilter { key: string; label: string; field?: string; options: { value: string; label: string }[] }
export const FILTER_LIMITS = { filters: 4, options: 60, text: 60 }
export function sanitizeFilters(raw: unknown): PluginFilter[] {
  if (!Array.isArray(raw)) return []
  const out: PluginFilter[] = [], L = FILTER_LIMITS
  for (const f of raw.slice(0, L.filters) as Record<string, unknown>[]) {
    if (!f || typeof f.key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(f.key) || typeof f.label !== 'string' || !Array.isArray(f.options)) continue
    const field = typeof f.field === 'string' && (f.field === '$ts' || /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(f.field)) ? f.field : undefined
    const options = (f.options as Record<string, unknown>[]).slice(0, L.options)
      .filter((o) => o && typeof o.value === 'string' && o.value && (field !== '$ts' || /^\d{1,5}$/.test(o.value)))
      .map((o) => ({ value: (o.value as string).slice(0, L.text), label: String(o.label ?? o.value).slice(0, L.text) }))
    if (options.length && !out.some((x) => x.key === f.key)) out.push({ key: f.key, label: f.label.slice(0, 30), field, options })
  }
  return out
}
/** One player seen in one game. `key`: stable player identifier chosen by the plugin (e.g. an account ID); `game`: identifier
 *  of the game, identical for every player who recorded it, so the same game imported twice is stored once. `data`: numbers,
 *  short texts or short lists of numbers; the plugin's `player` function reads them back to build the sheet. */
export interface PlayerRecord { key: string; name: string; game: string; ts: number; data: Record<string, string | number | number[]> }
export const PLAYER_LIMITS = { perRun: 3000, fields: 40, text: 300, list: 16, sheet: 3000 }
const PLAYER_KEY_RE = /^[\w.:|-]{1,64}$/
export function sanitizePlayerRecord(raw: unknown, now = Date.now()): PlayerRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>, L = PLAYER_LIMITS, ts = num(r.ts)
  if (typeof r.key !== 'string' || !PLAYER_KEY_RE.test(r.key) || typeof r.game !== 'string' || !PLAYER_KEY_RE.test(r.game)) return null
  if (typeof r.name !== 'string' || !r.name.trim() || ts === null || ts <= 0 || ts > now + 86_400_000) return null
  const data: PlayerRecord['data'] = {}
  if (r.data && typeof r.data === 'object' && !Array.isArray(r.data)) {
    for (const [k, v] of Object.entries(r.data as Record<string, unknown>).slice(0, L.fields)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(k)) continue
      if (typeof v === 'string') data[k] = v.slice(0, L.text)
      else if (Array.isArray(v)) data[k] = v.slice(0, L.list).map((x) => num(x) ?? 0)
      else { const n = num(v); if (n !== null) data[k] = n }
    }
  }
  return { key: r.key, name: r.name.trim().slice(0, 40), game: r.game, ts, data }
}

export const NOTICE_LIMITS = { perRun: 3, id: 80, title: 40, text: 200 }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e15 ? v : null)

/** Item detail or overview: bounded sizes, checked types, nothing else is kept. */
export function sanitizeDetail(raw: unknown): PluginDetail | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>, L = DETAIL_LIMITS, out: PluginDetail = {}
  const str = (v: unknown, max = L.cell): string => String(v ?? '').slice(0, max)
  const cell = (v: unknown): string | number => (typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : str(v))
  const title = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.slice(0, L.cell) : undefined)
  const table = (t: unknown): DetailTable | undefined => {
    const o = t as Record<string, unknown> | undefined
    if (!o || !Array.isArray(o.columns) || !Array.isArray(o.rows)) return undefined
    const columns = o.columns.slice(0, L.columns).map((c) => str(c))
    const rows = o.rows.slice(0, L.rows).filter(Array.isArray).map((row) => (row as unknown[]).slice(0, columns.length).map(cell))
    return columns.length && rows.length ? { title: title(o.title), columns, rows } : undefined
  }
  const im = r.image as Record<string, unknown> | undefined
  if (im && typeof im.file === 'string' && IMAGE_FILE_RE.test(im.file)) out.image = { file: im.file, caption: typeof im.caption === 'string' && im.caption.trim() ? im.caption.slice(0, L.cell) : undefined }
  if (Array.isArray(r.chips)) { const c = r.chips.slice(0, L.chips).map((x) => str(x, L.chip)).filter(Boolean); if (c.length) out.chips = c }
  if (Array.isArray(r.stats)) {
    const st = (r.stats as Record<string, unknown>[]).slice(0, L.stats).filter((x) => x && typeof x === 'object')
      .map((x) => ({ label: str(x.label, L.chip), value: cell(x.value) }))
    if (st.length) out.stats = st
  }
  const t1 = table(r.table); if (t1) out.table = t1
  if (Array.isArray(r.tables)) { const ts = r.tables.slice(0, L.tables).map(table).filter((x): x is DetailTable => !!x); if (ts.length) out.tables = ts }
  if (Array.isArray(r.grids)) {
    const gs: DetailGrid[] = []
    for (const g of (r.grids as Record<string, unknown>[]).slice(0, L.grids)) {
      if (!g || !Array.isArray(g.rows) || !Array.isArray(g.cols) || !Array.isArray(g.values)) continue
      const rows = g.rows.slice(0, L.gridSize).map((x) => str(x, L.label)), cols = g.cols.slice(0, L.gridSize).map((x) => str(x, L.label))
      const values = rows.map((_, i) => cols.map((__, j) => { const v = num((g.values as unknown[][])[i]?.[j]); return v ?? 0 }))
      if (rows.length && cols.length) gs.push({ title: title(g.title), rows, cols, values })
    }
    if (gs.length) out.grids = gs
  }
  if (Array.isArray(r.series)) {
    const ss: DetailSeries[] = []
    for (const x of (r.series as Record<string, unknown>[]).slice(0, L.series)) {
      const step = num(x?.step)
      if (!x || step === null || step <= 0 || step > 86_400 || !Array.isArray(x.lines)) continue
      const lines = (x.lines as Record<string, unknown>[]).slice(0, L.lines).filter((l) => l && Array.isArray(l.values))
        .map((l) => ({ name: str(l.name, L.cell), values: (l.values as unknown[]).slice(0, L.points).map((v) => num(v) ?? 0) }))
      if (lines.length) ss.push({ title: title(x.title), unit: typeof x.unit === 'string' ? x.unit.slice(0, 8) : undefined, step, lines })
    }
    if (ss.length) out.series = ss
  }
  if (Array.isArray(r.bars)) {
    const bs: DetailBars[] = []
    for (const x of (r.bars as Record<string, unknown>[]).slice(0, L.bars)) {
      if (!x || !Array.isArray(x.categories) || !Array.isArray(x.series)) continue
      const categories = x.categories.slice(0, L.categories).map((c) => str(c, L.cell))
      const series = (x.series as Record<string, unknown>[]).slice(0, L.lines).filter((v) => v && Array.isArray(v.values))
        .map((v) => ({ name: str(v.name, L.cell), values: categories.map((_, i) => num((v.values as unknown[])[i]) ?? 0) }))
      if (categories.length && series.length) bs.push({ title: title(x.title), unit: typeof x.unit === 'string' ? x.unit.slice(0, 8) : undefined, stacked: x.stacked === true, categories, series })
    }
    if (bs.length) out.bars = bs
  }
  const tl = r.timeline as Record<string, unknown> | undefined
  if (tl && Array.isArray(tl.lanes) && Array.isArray(tl.events)) {
    const lanes = tl.lanes.slice(0, L.lanes).map((x) => str(x))
    const duration = num(tl.duration)
    const events: { t: number; lane: number; label?: string; kind?: TimelineKind }[] = []
    for (const e of tl.events.slice(0, L.events) as Record<string, unknown>[]) {
      const at = num(e?.t), lane = num(e?.lane)
      if (at === null || at < 0 || at > 86_400 || lane === null || !Number.isInteger(lane) || lane < 0 || lane >= lanes.length) continue
      events.push({ t: at, lane, label: typeof e.label === 'string' ? e.label.slice(0, L.label) : undefined, kind: e.kind === 'action' || e.kind === 'mark' ? e.kind : undefined })
    }
    if (lanes.length && duration !== null && duration > 0 && duration <= 86_400) out.timeline = { duration, lanes, events }
  }
  return Object.keys(out).length ? out : undefined
}

export function sanitizeRunResult(raw: unknown, m: PluginManifest, now = Date.now()): PluginRunResult {
  const out: PluginRunResult = { metrics: {}, items: [], history: [], backlog: 0, notices: [], filters: [], players: [] }
  if (!raw || typeof raw !== 'object') return out
  const r = raw as Record<string, unknown>
  const keys = new Set(m.metrics.map((x) => x.key))
  const pickMetrics = (src: unknown): Record<string, number> => {
    const o: Record<string, number> = {}
    if (src && typeof src === 'object') for (const [k, v] of Object.entries(src as Record<string, unknown>)) { const n = num(v); if (keys.has(k) && n !== null) o[k] = n }
    return o
  }
  out.metrics = pickMetrics(r.metrics)
  out.summary = sanitizeDetail(r.summary)
  if (m.views) out.filters = sanitizeFilters(r.filters)
  if (m.players && Array.isArray(r.players)) for (const p of r.players.slice(0, PLAYER_LIMITS.perRun)) { const x = sanitizePlayerRecord(p, now); if (x) out.players.push(x) }
  const backlog = num(r.backlog)
  out.backlog = backlog !== null && backlog > 0 ? Math.min(1e7, Math.floor(backlog)) : 0
  if (m.notices && Array.isArray(r.notices)) {
    const N = NOTICE_LIMITS
    for (const n of r.notices.slice(0, N.perRun) as Record<string, unknown>[]) {
      if (!n || typeof n.id !== 'string' || !n.id.trim() || typeof n.title !== 'string' || !n.title.trim() || typeof n.text !== 'string') continue
      out.notices.push({ id: n.id.slice(0, N.id), title: n.title.trim().slice(0, N.title), text: n.text.trim().slice(0, N.text), direction: n.direction === 'down' ? 'down' : 'up' })
    }
  }
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

/* ---------- Types exchanged with the interface ---------- */
/** A player found in the bank: `source` is the plugin that recorded them, `key` their identifier there. */
export interface BankPlayer { source: string; key: string; name: string; games: number; last: number }
/** Content of the bank: records, distinct players and games, and records per origin ('local' or 'import:<file>'). */
export interface BankStats { rows: number; players: number; games: number; origins: { origin: string; rows: number }[] }
export interface PluginItemsPage {
  items: PluginItem[]
  /** Number of items matching the filter. */
  total: number
  /** Available months (YYYY-MM, local time), newest to oldest, with their number of items. */
  months: { month: string; count: number }[]
  /** During a search: your stats on the items found, column by column. */
  stats?: ColumnStat[]
}
/** num: average, min, max, total. dur: "m:ss" durations (in seconds). cat: most frequent values with their count. */
export interface ColumnStat { key: string; kind: 'num' | 'dur' | 'cat'; n: number; avg?: number; min?: number; max?: number; sum?: number; top?: { value: string; n: number }[] }
export interface InstalledPlugin {
  id: string
  manifest: PluginManifest
  enabled: boolean
  installedAt: number
  failures: number
  lastError: string | null
  /** Secret keys already saved. */
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
  /** Version already installed (update) or null (new install). */
  installedVersion: string | null
}
