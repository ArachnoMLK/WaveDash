// Prepares the Studio binaries in resources/studio:
//   engine/     BrawlRender.exe (published from the BrawlStudio repository, self-contained: no .NET needed on the user's PC)
//   vgmstream/  Wwise music decoder (latest official release)
// Usage: npm run studio:engine   (BRAWLSTUDIO_DIR = BrawlStudio repository folder, default ../BrawlStudio)
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const root = resolve(import.meta.dirname, '..')
const out = join(root, 'resources', 'studio')
const studio = resolve(process.env.BRAWLSTUDIO_DIR ?? join(root, '..', 'BrawlStudio'))
const project = join(studio, 'renderer', 'BrawlRender.csproj')

if (!existsSync(project)) {
  console.error(`Project not found: ${project}\nClone BrawlStudio (git clone --recurse-submodules) next to WaveDash or set BRAWLSTUDIO_DIR.`)
  process.exit(1)
}

// Submodule patches (BrawlStudio/patches, target in targets.json): applied once, before compiling.
const patches = join(studio, 'patches')
if (existsSync(join(patches, 'targets.json'))) {
  for (const [file, target] of Object.entries(JSON.parse(readFileSync(join(patches, 'targets.json'), 'utf8')))) {
    const git = (...args) => execFileSync('git', ['-C', join(studio, target), 'apply', '--ignore-whitespace', ...args, join(patches, file)], { stdio: 'pipe' })
    try { git('--reverse', '--check'); console.log(`Patch already applied: ${file}`) } catch { git(); console.log(`Patch applied: ${file}`) }
  }
}

console.log('1/2 Publishing the render engine…')
rmSync(join(out, 'engine'), { recursive: true, force: true })
execFileSync('dotnet', ['publish', project, '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '-o', join(out, 'engine')], { stdio: 'inherit' })

console.log('2/2 Downloading vgmstream…')
const rel = await (await fetch('https://api.github.com/repos/vgmstream/vgmstream/releases/latest')).json()
const asset = rel.assets.find((a) => a.name === 'vgmstream-win64.zip')
if (!asset) throw new Error('vgmstream-win64.zip archive missing from the latest release')
const zip = join(out, 'vgmstream.zip')
mkdirSync(out, { recursive: true })
writeFileSync(zip, Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer()))
rmSync(join(out, 'vgmstream'), { recursive: true, force: true })
execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${join(out, 'vgmstream')}' -Force`], { stdio: 'inherit' })
rmSync(zip, { force: true })
console.log(`Ready: ${out} (vgmstream ${rel.tag_name})`)
