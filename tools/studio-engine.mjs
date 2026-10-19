// Prépare les binaires du Studio dans resources/studio :
//   engine/     BrawlRender.exe (publié depuis le dépôt BrawlStudio, autonome : pas besoin de .NET chez l'utilisateur)
//   vgmstream/  décodeur des musiques Wwise (dernière version officielle)
// Usage : npm run studio:engine   (BRAWLSTUDIO_DIR = dossier du dépôt BrawlStudio, par défaut ../BrawlStudio)
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const root = resolve(import.meta.dirname, '..')
const out = join(root, 'resources', 'studio')
const studio = resolve(process.env.BRAWLSTUDIO_DIR ?? join(root, '..', 'BrawlStudio'))
const project = join(studio, 'renderer', 'BrawlRender.csproj')

if (!existsSync(project)) {
  console.error(`Projet introuvable : ${project}\nClone BrawlStudio (git clone --recurse-submodules) à côté de WaveDash ou définis BRAWLSTUDIO_DIR.`)
  process.exit(1)
}

// Correctifs des sous-modules (BrawlStudio/patches, cible dans targets.json) : appliqués une fois, avant la compilation.
const patches = join(studio, 'patches')
if (existsSync(join(patches, 'targets.json'))) {
  for (const [file, target] of Object.entries(JSON.parse(readFileSync(join(patches, 'targets.json'), 'utf8')))) {
    const git = (...args) => execFileSync('git', ['-C', join(studio, target), 'apply', '--ignore-whitespace', ...args, join(patches, file)], { stdio: 'pipe' })
    try { git('--reverse', '--check'); console.log(`Correctif déjà appliqué : ${file}`) } catch { git(); console.log(`Correctif appliqué : ${file}`) }
  }
}

console.log('1/2 Publication du moteur de rendu…')
rmSync(join(out, 'engine'), { recursive: true, force: true })
execFileSync('dotnet', ['publish', project, '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '-o', join(out, 'engine')], { stdio: 'inherit' })

console.log('2/2 Téléchargement de vgmstream…')
const rel = await (await fetch('https://api.github.com/repos/vgmstream/vgmstream/releases/latest')).json()
const asset = rel.assets.find((a) => a.name === 'vgmstream-win64.zip')
if (!asset) throw new Error('archive vgmstream-win64.zip absente de la dernière version')
const zip = join(out, 'vgmstream.zip')
mkdirSync(out, { recursive: true })
writeFileSync(zip, Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer()))
rmSync(join(out, 'vgmstream'), { recursive: true, force: true })
execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${join(out, 'vgmstream')}' -Force`], { stdio: 'inherit' })
rmSync(zip, { force: true })
console.log(`Prêt : ${out} (vgmstream ${rel.tag_name})`)
