// Accès fichiers d'un plugin : lecture seule, dans UN dossier choisi par l'utilisateur, sans sous-dossiers,
// sans liens symboliques, uniquement les extensions déclarées dans le manifeste.
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'fs'
import { basename, extname, join } from 'path'

export interface FolderAccess { dir: string; extensions: string[] }
export interface FileEntry { name: string; size: number; mtime: number }

const extOk = (name: string, exts: string[]): boolean => exts.length === 0 || exts.includes(extname(name).toLowerCase())

export function listFiles(a: FolderAccess, max = 2000): FileEntry[] {
  const out: FileEntry[] = []
  for (const name of readdirSync(a.dir)) {
    if (out.length >= max) break
    if (!extOk(name, a.extensions)) continue
    try {
      const st = lstatSync(join(a.dir, name))
      if (st.isFile() && !st.isSymbolicLink()) out.push({ name, size: st.size, mtime: Math.round(st.mtimeMs) })
    } catch { /* fichier disparu ou illisible : ignoré */ }
  }
  return out.sort((x, y) => y.mtime - x.mtime)
}

/** Lit un fichier du dossier autorisé ; refuse tout nom qui n'est pas un simple nom de fichier. */
export function readFileSafe(a: FolderAccess, name: string, maxBytes: number): Buffer {
  if (!name || name !== basename(name) || name.includes('\0') || name.includes('/') || name.includes('\\') || name === '.' || name === '..') throw new Error('nom de fichier invalide')
  if (!extOk(name, a.extensions)) throw new Error('extension non autorisée')
  const full = join(a.dir, name)
  const st = lstatSync(full)
  if (!st.isFile() || st.isSymbolicLink()) throw new Error('fichier non autorisé')
  if (st.size > maxBytes) throw new Error('fichier trop volumineux')
  if (realpathSync(join(full, '..')) !== realpathSync(a.dir)) throw new Error('chemin non autorisé')
  return readFileSync(full)
}
