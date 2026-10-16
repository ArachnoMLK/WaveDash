// Accès fichiers d'un plugin : lecture seule, dans UN dossier choisi par l'utilisateur, sans sous-dossiers,
// sans liens symboliques, uniquement les extensions déclarées dans le manifeste.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'fs'
import { basename, extname, join } from 'path'

/** `dir` : le dossier choisi par l'utilisateur. `extra` : dossier géré par WaveDash pour les fichiers importés (facultatif). */
export interface FolderAccess { dir: string; extra?: string; extensions: string[] }
export interface FileEntry { name: string; size: number; mtime: number }

const extOk = (name: string, exts: string[]): boolean => exts.length === 0 || exts.includes(extname(name).toLowerCase())
const dirsOf = (a: FolderAccess): string[] => (a.extra && existsSync(a.extra) ? [a.dir, a.extra] : [a.dir])

/** Les `max` fichiers les plus récents. Le tri se fait sur tout le dossier (jusqu'à `scan` fichiers examinés) :
 *  couper avant de trier rendrait des fichiers pris au hasard de l'ordre alphabétique, pas les derniers.
 *  Les fichiers importés s'ajoutent à ceux du dossier choisi ; à nom égal, celui du dossier choisi l'emporte. */
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
      } catch { /* fichier disparu ou illisible : ignoré */ }
    }
  }
  return out.sort((x, y) => y.mtime - x.mtime).slice(0, max)
}

/** Lit un fichier du dossier autorisé (ou des imports) ; refuse tout nom qui n'est pas un simple nom de fichier. */
export function readFileSafe(a: FolderAccess, name: string, maxBytes: number): Buffer {
  if (!name || name !== basename(name) || name.includes('\0') || name.includes('/') || name.includes('\\') || name === '.' || name === '..') throw new Error('nom de fichier invalide')
  if (!extOk(name, a.extensions)) throw new Error('extension non autorisée')
  for (const dir of dirsOf(a)) {
    const full = join(dir, name)
    if (!existsSync(full)) continue
    const st = lstatSync(full)
    if (!st.isFile() || st.isSymbolicLink()) throw new Error('fichier non autorisé')
    if (st.size > maxBytes) throw new Error('fichier trop volumineux')
    if (realpathSync(join(full, '..')) !== realpathSync(dir)) throw new Error('chemin non autorisé')
    return readFileSync(full)
  }
  throw new Error('fichier introuvable')
}
