// Plugin file access: read-only, in ONE folder chosen by the user, no subfolders,
// no symbolic links, only the extensions declared in the manifest.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'fs'
import { basename, extname, join } from 'path'

/** `dir`: the folder chosen by the user. `extra`: folder managed by WaveDash for imported files (optional). */
export interface FolderAccess { dir: string; extra?: string; extensions: string[] }
export interface FileEntry { name: string; size: number; mtime: number }

const extOk = (name: string, exts: string[]): boolean => exts.length === 0 || exts.includes(extname(name).toLowerCase())
const dirsOf = (a: FolderAccess): string[] => (a.extra && existsSync(a.extra) ? [a.dir, a.extra] : [a.dir])

/** The `max` most recent files. Sorting covers the whole folder (up to `scan` files examined):
 *  cutting before sorting would return files picked by alphabetical order, not the latest.
 *  Imported files are added to those of the chosen folder; with the same name, the chosen folder wins. */
export function listFiles(a: FolderAccess, max = 20_000, scan = 50_000): FileEntry[] {
  const out: FileEntry[] = [], seenNames = new Set<string>()
  let seen = 0
  for (const dir of dirsOf(a)) {
    for (const name of readdirSync(dir)) {
      if (!extOk(name, a.extensions) || seenNames.has(name)) continue
      if (++seen > scan) break
      try {
        const st = lstatSync(join(dir, name))
        if (st.isFile() && !st.isSymbolicLink()) { out.push({ name, size: st.size, mtime: Math.round(st.mtimeMs) }); seenNames.add(name) }
      } catch { /* file gone or unreadable: ignored */ }
    }
  }
  return out.sort((x, y) => y.mtime - x.mtime).slice(0, max)
}

/** Reads a file from the allowed folder (or the imports); rejects any name that is not a plain file name. */
export function readFileSafe(a: FolderAccess, name: string, maxBytes: number): Buffer {
  if (!name || name !== basename(name) || name.includes('\0') || name.includes('/') || name.includes('\\') || name === '.' || name === '..') throw new Error('invalid file name')
  if (!extOk(name, a.extensions)) throw new Error('extension not allowed')
  for (const dir of dirsOf(a)) {
    const full = join(dir, name)
    if (!existsSync(full)) continue
    const st = lstatSync(full)
    if (!st.isFile() || st.isSymbolicLink()) throw new Error('file not allowed')
    if (st.size > maxBytes) throw new Error('file too large')
    if (realpathSync(join(full, '..')) !== realpathSync(dir)) throw new Error('path not allowed')
    return readFileSync(full)
  }
  throw new Error('file not found')
}
