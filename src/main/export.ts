// Data export (CSV, JSON, PDF report) and configuration backup / restore.
import { app, BrowserWindow, dialog } from 'electron'
import { readFileSync, statSync, writeFileSync } from 'fs'
import { METRIC_NAMES, PLATFORM_NAMES, REPORT_LABELS } from '@shared/labels'
import { BACKUP_KEYS, sanitizeBackup } from '@shared/backup'
import { validateManifest } from '@shared/plugin'
import { MetricKey, METRICS_BY_PLATFORM, Settings, localeOf } from '@shared/types'
import * as db from './db'

const DAY = 86_400_000

async function pickSavePath(win: BrowserWindow | null, name: string, ext: string, label: string): Promise<string | null> {
  const opts = { defaultPath: name, filters: [{ name: label, extensions: [ext] }] }
  const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  return r.canceled || !r.filePath ? null : r.filePath
}

const stamp = (): string => new Date().toISOString().slice(0, 10)

/** Escapes a CSV field; also neutralizes formula starts (=, +, -, @) read by spreadsheets. */
function csvField(v: string | number): string {
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function buildCsv(): string {
  const lines = ['platform,account,metric,timestamp,value']
  for (const r of db.allSnapshotRows()) lines.push([r.platform, r.account, r.metric, new Date(r.ts).toISOString(), r.value].map(csvField).join(','))
  return lines.join('\r\n') + '\r\n'
}

function buildJson(): string {
  const accounts = db.listAccounts().map((a) => {
    const metrics: Record<string, [number, number][]> = {}
    for (const m of METRICS_BY_PLATFORM[a.platform]) {
      const pts = db.getSeries(a.id, m, 0)
      if (pts.length) metrics[m] = pts.map((p) => [p.ts, p.value])
    }
    return { platform: a.platform, displayName: a.displayName, externalId: a.externalId, demo: a.demo, metrics, items: db.getItems(a.id) }
  })
  // Plugin accounts: series of the metrics declared in the plugin manifest.
  const pluginAccounts = db.listPluginAccountRows().map((pa) => {
    const row = db.getPluginRow(pa.plugin_id)
    const v = row ? validateManifest(JSON.parse(row.manifest)) : null
    const metrics: Record<string, [number, number][]> = {}
    for (const m of v && v.ok ? v.manifest.metrics : []) {
      const pts = db.getSeries(pa.account_id, m.key as MetricKey, 0)
      if (pts.length) metrics[m.key] = pts.map((p) => [p.ts, p.value])
    }
    return { plugin: pa.plugin_id, displayName: pa.display_name, metrics }
  })
  return JSON.stringify({ wavedashExport: 1, appVersion: app.getVersion(), exportedAt: new Date().toISOString(), accounts, pluginAccounts, events: db.listEvents(500) }, null, 2)
}

/* ---------- PDF report: a plain HTML page, printed by Chromium ---------- */
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function sparkline(points: { ts: number; value: number }[]): string {
  if (points.length < 2) return ''
  const step = Math.max(1, Math.floor(points.length / 80))
  const p = points.filter((_, i) => i % step === 0)
  const xs = p.map((q) => q.ts), ys = p.map((q) => q.value)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const pts = p.map((q) => `${(((q.ts - x0) / (x1 - x0 || 1)) * 120).toFixed(1)},${(22 - ((q.value - y0) / (y1 - y0 || 1)) * 20).toFixed(1)}`).join(' ')
  return `<svg width="120" height="24" viewBox="0 0 120 24"><polyline points="${pts}" fill="none" stroke="#333" stroke-width="1.4"/></svg>`
}

function buildReportHtml(s: Settings): string {
  const locale = localeOf(s.lang)
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const now = Date.now()
  const L = REPORT_LABELS[s.lang] ?? REPORT_LABELS.en
  const gain = (id: number, m: MetricKey, days: number, cur: number | null): string => {
    const v = db.valueAt(id, m, now - days * DAY)
    if (cur === null || v === null) return '—'
    const d = cur - v
    return `${d > 0 ? '+' : d < 0 ? '−' : ''}${nf.format(Math.abs(d))}`
  }
  const accounts = db.listAccounts()
  const sections = accounts.map((a) => {
    const rows = METRICS_BY_PLATFORM[a.platform].map((m) => {
      const cur = db.valueAt(a.id, m, now)
      if (cur === null) return ''
      return `<tr><td>${esc(METRIC_NAMES[s.lang][m])}</td><td>${nf.format(cur)}</td>
        <td>${gain(a.id, m, 7, cur)}</td><td>${gain(a.id, m, 30, cur)}</td><td>${sparkline(db.getSeries(a.id, m, now - 30 * DAY))}</td></tr>`
    }).join('')
    return `<h2>${esc(PLATFORM_NAMES[a.platform])} · ${esc(a.displayName)}${a.demo ? ` <small>(${L.demo})</small>` : ''}</h2>
      <table><tr><th>${L.stat}</th><th>${L.now}</th><th>${L.d7}</th><th>${L.d30}</th><th>${L.trend}</th></tr>${rows}</table>`
  }).join('')
  const events = db.listEvents(15).map((e) =>
    `<li>${e.direction === 'up' ? '▲' : '▼'} ${esc(e.message)} <small>${new Date(e.ts).toLocaleString(locale)}</small></li>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:'Segoe UI',Arial,sans-serif;color:#111;margin:0;font-size:12px}
    h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #bbb;padding-bottom:4px}small{color:#666;font-weight:400}
    table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #e3e3e3}th{color:#555;font-weight:600}
    ul{padding-left:16px}li{margin:3px 0}
  </style></head><body><h1>${L.title}</h1><div style="color:#666">${new Date().toLocaleString(locale)} · v${app.getVersion()}</div>
  ${sections || `<p>${L.none}</p>`}${events ? `<h2>${L.events}</h2><ul>${events}</ul>` : ''}</body></html>`
}

async function buildPdf(s: Settings): Promise<Buffer> {
  // Invisible window, without JavaScript: it only lays out the report.
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } })
  try {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildReportHtml(s)))
    return await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 } })
  } finally { w.destroy() }
}

export async function exportData(win: BrowserWindow | null, format: 'csv' | 'json' | 'pdf'): Promise<{ ok: boolean; error?: string }> {
  try {
    const path = await pickSavePath(win, `wavedash-${stamp()}.${format}`, format, format.toUpperCase())
    if (!path) return { ok: false }
    if (format === 'csv') writeFileSync(path, '\ufeff' + buildCsv(), 'utf8')      // BOM: correct accents in Excel
    else if (format === 'json') writeFileSync(path, buildJson(), 'utf8')
    else writeFileSync(path, await buildPdf(db.getSettings()))
    return { ok: true }
  } catch { return { ok: false, error: 'write' } }
}

/* ---------- Configuration backup / restore (no keys or accounts) ---------- */
export async function exportBackup(win: BrowserWindow | null): Promise<boolean> {
  const path = await pickSavePath(win, `wavedash-config-${stamp()}.wdbackup`, 'wdbackup', 'WaveDash backup')
  if (!path) return false
  const s = db.getSettings()
  const settings = Object.fromEntries(BACKUP_KEYS.map((k) => [k, s[k]]))
  writeFileSync(path, JSON.stringify({ wavedashBackup: 1, appVersion: app.getVersion(), settings }, null, 2), 'utf8')
  return true
}

export async function importBackup(win: BrowserWindow | null): Promise<{ ok: boolean; patch?: Partial<Settings>; error?: string }> {
  const opts = { properties: ['openFile' as const], filters: [{ name: 'WaveDash backup', extensions: ['wdbackup'] }] }
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  const file = r.filePaths[0]
  if (r.canceled || !file) return { ok: false }
  try {
    if (statSync(file).size > 500_000) return { ok: false, error: 'invalid' }
    const json = JSON.parse(readFileSync(file, 'utf8'))
    if (json?.wavedashBackup !== 1) return { ok: false, error: 'invalid' }
    return { ok: true, patch: sanitizeBackup(json.settings) }
  } catch { return { ok: false, error: 'invalid' } }
}
