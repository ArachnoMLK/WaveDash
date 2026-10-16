// Catalogue en ligne des plugins : index.json du dépôt ArachnoMLK/WaveDash-Plugins (adresse fixe, non modifiable).
// Chaque paquet téléchargé est vérifié (taille, empreinte SHA-256 de l'index) avant d'être proposé à l'installation.
import { app } from 'electron'
import { createHash } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { compareVersions, LocalText } from '@shared/plugin'
import * as db from '../db'

const BASE = 'https://raw.githubusercontent.com/ArachnoMLK/WaveDash-Plugins/main/'
const MAX_INDEX = 1024 * 1024, MAX_PACKAGE = 5 * 1024 * 1024, TTL = 3 * 3_600_000

export interface CatalogEntry {
  id: string; name: string; version: string; author: string; description: LocalText; minAppVersion?: string
  permissions: { network?: string[]; folder?: boolean; folderExtensions?: string[] }
  file: string; size: number; sha256: string
}
export interface CatalogView { entries: (CatalogEntry & { installedVersion: string | null })[]; fetchedAt: number | null; offline: boolean }

const dir = (): string => { const d = join(app.getPath('userData'), 'catalog'); mkdirSync(d, { recursive: true }); return d }
let cache: { entries: CatalogEntry[]; at: number } | null = null

async function download(url: string, max: number): Promise<Buffer> {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'WaveDash' } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const len = Number(r.headers.get('content-length') || 0)
    if (len > max) throw new Error('fichier trop volumineux')
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > max) throw new Error('fichier trop volumineux')
    return buf
  } finally { clearTimeout(timer) }
}

const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.length <= max ? v : null)
/** Contrôle strict de chaque entrée : tout ce qui est incorrect est écarté. */
function parseIndex(raw: unknown): CatalogEntry[] {
  const out: CatalogEntry[] = []
  const list = (raw as { plugins?: unknown })?.plugins
  if (!Array.isArray(list)) return out
  for (const p of list.slice(0, 500) as Record<string, unknown>[]) {
    const id = str(p?.id, 64), version = str(p?.version, 16), file = str(p?.file, 120), sha = str(p?.sha256, 64)
    if (!id || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(id) || !version || !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)) continue
    if (!file || !/^packages\/[a-z0-9._-]+\.wdsh$/.test(file) || !sha || !/^[0-9a-f]{64}$/.test(sha)) continue
    if (typeof p.size !== 'number' || p.size <= 0 || p.size > MAX_PACKAGE) continue
    const perms = (p.permissions && typeof p.permissions === 'object' ? p.permissions : {}) as CatalogEntry['permissions']
    out.push({ id, version, file, sha256: sha, size: p.size, name: str(p.name, 60) ?? id, author: str(p.author, 60) ?? '',
      description: (typeof p.description === 'string' || (p.description && typeof p.description === 'object') ? p.description : '') as LocalText,
      minAppVersion: str(p.minAppVersion, 16) ?? undefined,
      permissions: { network: Array.isArray(perms.network) ? perms.network.filter((d) => typeof d === 'string').slice(0, 10) : [], folder: perms.folder === true,
        folderExtensions: Array.isArray(perms.folderExtensions) ? perms.folderExtensions.filter((d) => typeof d === 'string').slice(0, 10) : [] } })
  }
  return out
}

/** Index du catalogue (cache de 3 h ; en cas d'échec réseau, la dernière copie enregistrée). */
export async function getCatalog(force = false): Promise<CatalogView> {
  let offline = false
  if (force || !cache || Date.now() - cache.at > TTL) {
    try {
      const buf = await download(BASE + 'index.json', MAX_INDEX)
      cache = { entries: parseIndex(JSON.parse(buf.toString('utf8'))), at: Date.now() }
      writeFileSync(join(dir(), 'index.json'), buf)
    } catch {
      offline = true
      if (!cache) try { cache = { entries: parseIndex(JSON.parse(readFileSync(join(dir(), 'index.json'), 'utf8'))), at: 0 } } catch { cache = null }
    }
  }
  const installed = new Map(db.listPluginRows().map((r) => { try { return [r.id, (JSON.parse(r.manifest) as { version: string }).version] as const } catch { return [r.id, ''] as const } }))
  const entries = (cache?.entries ?? []).filter((e) => !e.minAppVersion || compareVersions(e.minAppVersion, app.getVersion()) <= 0)
    .map((e) => ({ ...e, installedVersion: installed.get(e.id) ?? null }))
  return { entries, fetchedAt: cache?.at || null, offline }
}

/** Télécharge un paquet du catalogue et vérifie taille et empreinte. Renvoie le chemin du fichier vérifié. */
export async function fetchPackage(id: string): Promise<string> {
  const view = await getCatalog()
  const e = view.entries.find((x) => x.id === id)
  if (!e) throw new Error('plugin absent du catalogue')
  const buf = await download(BASE + e.file, MAX_PACKAGE)
  if (buf.length !== e.size || createHash('sha256').update(buf).digest('hex') !== e.sha256) throw new Error('empreinte incorrecte : paquet refusé')
  const path = join(dir(), `${e.id}-${e.version}.wdsh`)
  writeFileSync(path, buf)
  return path
}
