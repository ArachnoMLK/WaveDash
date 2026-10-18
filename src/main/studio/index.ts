// Studio Brawlhalla : rendus de légendes et de cosmétiques depuis les fichiers du jeu installé.
// Le rendu est fait par BrawlRender.exe (moteur .NET basé sur WallyAnmRenderer, MIT) ; ffmpeg sert aux exports,
// vgmstream au décodage des musiques Wwise. Les images sont servies à l'interface par le protocole studio://.
import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron'
import { execFile } from 'child_process'
import { createHash, randomBytes } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, extname, join, relative, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { promisify } from 'util'
import type {
  StudioAnimGroup, StudioAssetKind, StudioAssetPage, StudioCatalog, StudioExportFormat, StudioItem, StudioJob, StudioKind,
  StudioRender, StudioRenderRequest, StudioStatus, StudioTrack, StudioWeaponSkins
} from '@shared/studio'
import { Engine } from './engine'
import { AnimListing, buildLegendGroups, effectItems, heroEffectTest, parseCsv, parseHeroes, WEAPON_ANM } from './presets'

const run = promisify(execFile)
const DEFAULT_GAME = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Brawlhalla'

/** À appeler avant `app.whenReady()` : le protocole doit être déclaré tôt. */
export function registerStudioScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: 'studio', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
}

const resource = (...p: string[]): string => join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'resources', 'studio', ...p)
const root = (): string => join(app.getPath('userData'), 'studio')
const dir = (...p: string[]): string => { const d = join(root(), ...p); mkdirSync(d, { recursive: true }); return d }
const enginePath = (): string => process.env['WAVEDASH_STUDIO_ENGINE'] || resource('engine', 'BrawlRender.exe')
const vgmstream = (): string => resource('vgmstream', 'vgmstream-cli.exe')
function ffmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const p: string = require('ffmpeg-static')
  return p.replace('app.asar', 'app.asar.unpacked')
}

/* ---------------------------------------------------------------- configuration */
type Config = { gamePath: string }
function readConfig(): Config {
  try { return { gamePath: DEFAULT_GAME, ...JSON.parse(readFileSync(join(root(), 'config.json'), 'utf8')) } } catch { return { gamePath: DEFAULT_GAME } }
}
let config: Config
const gameOk = (p: string): boolean => existsSync(join(p, 'Game.swz')) && existsSync(join(p, 'anims'))
/** Clé de cache : change à chaque patch du jeu. */
const gameStamp = (): string => { try { return String(Math.round(statSync(join(config.gamePath, 'Game.swz')).mtimeMs)) } catch { return '0' } }

/* ---------------------------------------------------------------- moteur */
let engine: Engine | null = null
let engineState: StudioStatus['state'] = 'starting'
let engineError: string | undefined
let busy = 0

function getEngine(): Engine {
  if (!existsSync(enginePath())) { engineState = 'missing-engine'; throw new Error('Moteur de rendu absent : lance « npm run studio:engine ».') }
  if (!gameOk(config.gamePath)) { engineState = 'missing-game'; throw new Error('Dossier Brawlhalla introuvable.') }
  if (!engine) {
    engine = new Engine(enginePath(), config.gamePath)
    engineState = 'starting'
    engine.warmup().then(() => { engineState = 'ready'; engineError = undefined; void preload() })
      .catch((e: Error) => { engineState = 'error'; engineError = e.message; engine = null })
  }
  return engine
}
const call = async <T>(cmd: string, params: Record<string, unknown> = {}): Promise<T> => {
  busy++
  try { return await getEngine().call<T>(cmd, params) } finally { busy-- }
}

/** Résultat JSON mis en cache sur disque pour la version du jeu en cours. */
async function cached<T>(name: string, produce: () => Promise<T>): Promise<T> {
  const file = join(dir('cache', gameStamp()), name.replace(/[^\w.-]/g, '_') + '.json')
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as T
  const data = await produce()
  writeFileSync(file, JSON.stringify(data))
  return data
}

const swzFile = (name: string): Promise<string> =>
  cached(`swz-${name}`, async () => (await call<{ content: string }>('swzfile', { swz: 'Game.swz', name })).content)
const listing = (anm: string): Promise<AnimListing> => cached(`anims-${anm}`, () => call<AnimListing>('anims', { file: `anims/${anm}.anm` }))

/** Lecture en tâche de fond des fichiers lourds (emotes ~40 s la première fois) pour que tout soit instantané ensuite. */
let preloading = false
async function preload(): Promise<void> {
  if (preloading) return
  preloading = true
  try { for (const f of ['Animation_Emote', ...new Set(Object.values(WEAPON_ANM))]) await listing(f) } catch { /* réessayé à la demande */ }
  preloading = false
}

/* ---------------------------------------------------------------- catalogue et animations */
type EngineCatalog = { heroes: { name: string; bio: string }[]; costumes: { name: string; display: string; hero: string }[]; colors: string[] }

async function heroes(): Promise<ReturnType<typeof parseHeroes>> { return parseHeroes(await swzFile('HeroTypes.xml')) }

async function catalog(): Promise<StudioCatalog> {
  const [cat, hs] = await Promise.all([cached('catalog', () => call<EngineCatalog>('catalog')), heroes()])
  const byName = new Map(hs.map((h) => [h.name, h]))
  return {
    heroes: cat.heroes.filter((h) => !['DEFAULT_CHARACTER', 'Random'].includes(h.name) && byName.get(h.name)?.weapons.length)
      .map((h) => ({ name: h.name, bio: h.bio, weapons: byName.get(h.name)!.weapons }))
      .sort((a, b) => a.bio.localeCompare(b.bio)),
    costumes: cat.costumes,
    colors: cat.colors
  }
}

let powerMap: Map<string, Record<string, string>> | null = null
/** Skins d'arme compatibles avec les armes d'une légende : ceux de la légende d'abord, puis les autres par nom. */
async function weaponSkins(heroName: string): Promise<StudioWeaponSkins> {
  const hero = (await heroes()).find((h) => h.name === heroName)
  if (!hero) return {}
  const rows = await cached('weapon-skins', async () => parseCsv(await swzFile('weaponSkinTypes.csv'))
    .filter((r) => r['WeaponSkinName'] && r['WeaponSkinName'] !== 'Template')
    .map((r) => ({ name: r['WeaponSkinName'], base: r['BaseWeapon'], owner: r['OwnerHero'] ?? '', key: r['DisplayNameKey'] ?? '' })))
  const cat = await cached('catalog', () => call<EngineCatalog & { weapons: { name: string; display: string }[] }>('catalog'))
  const display = new Map((cat.weapons ?? []).map((w) => [w.name, w.display]))
  const out: StudioWeaponSkins = {}
  for (const w of hero.weapons) {
    out[w] = rows.filter((r) => r.base === w && (display.get(r.name) || r.owner === heroName))
      .map((r) => ({ name: r.name, display: display.get(r.name) || r.name, own: r.owner === heroName }))
      .sort((a, b) => Number(b.own) - Number(a.own) || a.display.localeCompare(b.display))
  }
  return out
}

/** Une image précise d'un rendu, enregistrée en PNG. */
async function exportFrame(win: BrowserWindow | null, id: string, index: number): Promise<{ ok: boolean; path?: string }> {
  const meta = readRender(id)
  const file = meta?.files[Math.max(0, Math.min(meta.files.length - 1, Math.floor(index)))]
  if (!meta || !file) return { ok: false }
  const name = `${meta.label.replace(/[^\w .-]/g, '_') || id} - image ${Math.floor(index) + 1}.png`
  const opts = { defaultPath: name, filters: [{ name: 'PNG', extensions: ['png'] }] }
  const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (r.canceled || !r.filePath) return { ok: false }
  copyFileSync(join(dir('renders'), id, file), r.filePath)
  return { ok: true, path: r.filePath }
}

async function legendAnims(heroName: string): Promise<StudioAnimGroup[]> {
  const hero = (await heroes()).find((h) => h.name === heroName)
  if (!hero) return []
  if (!powerMap) powerMap = new Map(parseCsv(await swzFile('powerTypes.csv')).map((r) => [r['PowerName'], r]))
  const files = hero.weapons.map((w) => WEAPON_ANM[w]).filter(Boolean)
  const listings: Record<string, AnimListing> = {}
  for (const f of files) listings[f] = await listing(f)
  return buildLegendGroups(hero, powerMap, listings, await listing('Animation_Emote'))
}

type Cosmetics = Record<string, StudioItem[]>
async function items(kind: StudioKind, query = '', file?: string): Promise<StudioItem[]> {
  let list: StudioItem[]
  if (kind === 'portrait') {
    const s = await cached('symbols-UI_Icons', () => call<{ symbols: string[] }>('symbols', { file: 'UI_Icons.swf' }))
    list = s.symbols.filter((n) => n.startsWith('a_Roster_Pose_') && !/M$/.test(n)).sort()
      .map((n) => ({ name: n, display: n.replace('a_Roster_Pose_', '').replace(/([a-z])([A-Z])/g, '$1 $2'), animClass: `UI_Icons.swf/${n}` }))
  } else if (kind === 'effect') {
    // « * » : tous les fichiers ; « hero:Ninja » : les effets d'une légende, rangés par le jeu selon l'arme
    // (SFX_Sword, SFX_Spear…) et dans les rigs des fichiers d'animation des armes
    const hero = file?.startsWith('hero:') ? (await heroes()).find((h) => h.name === file.slice(5)) : undefined
    const files = file === '*' || hero ? effectFiles() : file && /^SFX_[\w-]+\.swf$/.test(file) ? [file] : []
    list = []
    for (const f of files) {
      const s = await cached(`symbols-${f}`, () => call<{ symbols: string[] }>('symbols', { file: f }))
      list.push(...effectItems(f, s.symbols))
    }
    if (hero) {
      for (const w of hero.weapons) {
        if (!WEAPON_ANM[w]) continue
        const l = await listing(WEAPON_ANM[w])
        for (const cls of Object.keys(l.classes)) {
          const n = cls.split('/')[1]
          if (!n.startsWith('a__')) list.push({ name: n, display: n.replace(/^a_/, ''), animClass: cls })
        }
      }
      const mine = heroEffectTest(hero.name)
      // effets de base d'abord, puis ceux des skins (_SwapAang…)
      list = list.filter((x) => mine(x.sequence?.[0] ?? x.name)).sort((a, b) => Number(/Swap/.test(a.name)) - Number(/Swap/.test(b.name)) || a.display.localeCompare(b.display))
    }
  } else {
    const cos = await cached('cosmetics', () => call<Cosmetics>('cosmetics'))
    list = (cos[kind] ?? []).map((x) => ({ ...x, display: x.display || x.name }))
  }
  const q = query.trim().toLowerCase()
  return q ? list.filter((x) => x.display.toLowerCase().includes(q) || x.name.toLowerCase().includes(q)) : list
}

function effectFiles(): string[] {
  return readdirSync(config.gamePath).filter((f) => /^SFX_.*\.swf$/i.test(f) && statSync(join(config.gamePath, f)).size > 1000).sort()
}

/* ---------------------------------------------------------------- rendus */
function engineRequest(req: StudioRenderRequest): Record<string, unknown> {
  const r: Record<string, unknown> = { scale: Math.min(Math.max(Number(req.scale) || 2, 0.5), 8), flip: !!req.flip }
  if (req.kind === 'legend') Object.assign(r, { kind: 'legend', animClass: req.animClass, animation: req.animation, costume: req.costume, color: req.color || undefined, weapon: req.weapon || undefined })
  else if (req.kind === 'portrait' || req.kind === 'effect') Object.assign(r, { kind: 'swf', animClass: req.animClass, animation: '' })
  if (req.kind === 'effect' && Array.isArray(req.sequence)) r.sequence = req.sequence.filter((n) => typeof n === 'string' && /^[\w-]+$/.test(n)).slice(0, 400)
  else Object.assign(r, { kind: req.kind, item: req.item })
  // Rig d'une seule image (emojis, symboles) dont le dessin peut s'animer seul : on rend une boucle, réduite à 1 image si fixe.
  if (req.kind === 'emoji' || req.kind === 'effect' || req.kind === 'portrait') r.minFrames = 48
  return r
}

function readRender(id: string): StudioRender | null {
  try { return JSON.parse(readFileSync(join(dir('renders'), id, 'render.json'), 'utf8')) as StudioRender } catch { return null }
}

const jobs = new Map<string, StudioJob>()
function render(req: StudioRenderRequest): StudioJob {
  const id = `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`
  const label = (req.label || req.animation || req.item || req.animClass?.split('/')[1] || 'Rendu').slice(0, 80)
  const job: StudioJob = { id, status: 'running', label }
  jobs.set(id, job)
  const out = join(dir('renders'), id)
  call<{ frames: number; width: number; height: number; files: string[]; animation: string }>('render', { ...engineRequest(req), outDir: out })
    .then((m) => {
      const meta: StudioRender = { id, label, kind: req.kind, animation: m.animation, frames: m.frames, width: m.width, height: m.height, files: m.files, created: Date.now() }
      writeFileSync(join(out, 'render.json'), JSON.stringify(meta))
      job.status = 'done'; job.result = meta
    })
    .catch((e: Error) => { job.status = 'error'; job.error = e.message; rmSync(out, { recursive: true, force: true }) })
  return job
}

/** Vignette : première image, petite échelle, mise en cache. */
async function thumb(req: StudioRenderRequest): Promise<string | null> {
  const key = createHash('sha1').update(JSON.stringify({ ...req, label: '' }) + gameStamp()).digest('hex').slice(0, 20)
  const out = join(dir('thumbs'), key)
  if (!existsSync(join(out, 'frame_0000.png'))) {
    const scale = req.kind === 'portrait' ? 1 : req.kind === 'legend' ? 0.7 : 0.9
    // certains effets démarrent vides (la 1re image n'a rien) : on essaie quelques images plus loin
    const tries = req.kind === 'effect' ? [0, 3, 8, 15, 30] : [0]
    let ok = false
    for (const f of tries) {
      try { await call('render', { ...engineRequest({ ...req, scale }), start: f, end: f, outDir: out }); ok = true; break } catch { /* image vide */ }
    }
    if (!ok) return null
  }
  return `studio://thumbs/${key}/frame_0000.png`
}

function library(): StudioRender[] {
  return readdirSync(dir('renders')).map(readRender).filter((r): r is StudioRender => !!r).sort((a, b) => b.created - a.created)
}

async function exportRender(win: BrowserWindow | null, id: string, format: StudioExportFormat): Promise<{ ok: boolean; path?: string; error?: string }> {
  const meta = readRender(id)
  if (!meta) return { ok: false, error: 'introuvable' }
  const src = join(dir('renders'), id)
  const name = meta.label.replace(/[^\w .-]/g, '_') || id
  if (format === 'png') {
    const r = win ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] }) : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return { ok: false }
    const target = join(r.filePaths[0], name); mkdirSync(target, { recursive: true })
    for (const f of meta.files) copyFileSync(join(src, f), join(target, f))
    return { ok: true, path: target }
  }
  const opts = { defaultPath: `${name}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] }
  const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (r.canceled || !r.filePath) return { ok: false }
  const input = ['-y', '-framerate', '24', '-i', join(src, 'frame_%04d.png')]
  const args: Record<Exclude<StudioExportFormat, 'png'>, string[]> = {
    gif: [...input, '-vf', 'split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse', '-loop', '0', r.filePath],
    apng: [...input, '-plays', '0', '-f', 'apng', r.filePath],
    webm: [...input, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '24', r.filePath],
    mov: [...input, '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', r.filePath],
    // MP4 n'a pas de transparence : fond vert, prêt pour l'incrustation dans CapCut.
    mp4: [...input, '-filter_complex', 'color=c=0x00ff00:s=16x16[c];[c][0:v]scale2ref[c2][v];[c2][v]overlay=shortest=1,pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-crf', '16', r.filePath]
  }
  try { await run(ffmpegPath(), args[format], { windowsHide: true }); return { ok: true, path: r.filePath } } catch (e) { return { ok: false, error: (e as Error).message.slice(-300) } }
}

/* ---------------------------------------------------------------- assets (fichiers images du jeu) */
const assetIndex = new Map<StudioAssetKind, string[]>()
function walk(base: string, exts: RegExp, out: string[] = []): string[] {
  if (!existsSync(base)) return out
  for (const e of readdirSync(base, { withFileTypes: true })) {
    const p = join(base, e.name)
    if (e.isDirectory()) walk(p, exts, out)
    else if (exts.test(e.name)) out.push(relative(config.gamePath, p).split(sep).join('/'))
  }
  return out
}
function assetList(kind: StudioAssetKind): string[] {
  if (!assetIndex.has(kind)) {
    const g = config.gamePath, img = /\.(png|jpe?g)$/i
    const lists: Record<StudioAssetKind, () => string[]> = {
      sprites: () => walk(join(g, 'sprites'), img),
      // Chaque bannière est découpée en morceaux (1a, 1b, 2c…, pour l'animation du drapeau) : un seul par bannière.
      banners: () => walk(join(g, 'sprites'), img).filter((f) => /\/a_Flag1a_/i.test(f)),
      avatars: () => walk(join(g, 'sprites'), img).filter((f) => /Sprites_Avatars/i.test(f)),
      backgrounds: () => walk(join(g, 'mapArt', 'Backgrounds'), img),
      maps: () => walk(join(g, 'mapArt'), img).filter((f) => !f.includes('/Backgrounds/')),
      images: () => walk(join(g, 'images'), img)
    }
    assetIndex.set(kind, lists[kind]().sort((a, b) => a.localeCompare(b)))
  }
  return assetIndex.get(kind)!
}
function assets(kind: StudioAssetKind, query: string, offset: number, limit: number): StudioAssetPage {
  const q = query.trim().toLowerCase()
  const all = assetList(kind).filter((f) => !q || f.toLowerCase().includes(q))
  return { total: all.length, items: all.slice(Math.max(0, offset), Math.max(0, offset) + Math.min(limit, 300)) }
}
/** Chemin sûr dans le dossier du jeu (refuse « .. » et tout ce qui sort du dossier). */
function gameFile(rel: string): string | null {
  const full = resolve(config.gamePath, rel)
  return full.startsWith(resolve(config.gamePath) + sep) && existsSync(full) ? full : null
}
async function saveCopy(win: BrowserWindow | null, src: string, name: string): Promise<boolean> {
  const ext = extname(name).slice(1)
  const opts = { defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] }
  const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (r.canceled || !r.filePath) return false
  copyFileSync(src, r.filePath)
  return true
}

/* ---------------------------------------------------------------- musiques (Wwise → MP3) */
async function tracks(): Promise<StudioTrack[]> {
  return cached('tracks', async () => {
    const out: StudioTrack[] = []
    for (const f of walk(join(config.gamePath, 'audio'), /\.wem$/i)) {
      const full = join(config.gamePath, f)
      if (statSync(full).size < 1_000_000) continue
      const { stdout } = await run(vgmstream(), ['-m', full], { windowsHide: true })
      const m = stdout.match(/play duration: \d+ samples \((\d+):([\d.]+) seconds\)/)
      out.push({ id: basename(f, '.wem'), duration: m ? Number(m[1]) * 60 + Number(m[2]) : 0 })
    }
    return out
  })
}
async function trackMp3(id: string): Promise<string | null> {
  if (!/^\d+$/.test(id)) return null
  const mp3 = join(dir('music'), `${id}.mp3`)
  if (existsSync(mp3)) return mp3
  const src = walk(join(config.gamePath, 'audio'), /\.wem$/i).find((f) => basename(f, '.wem') === id)
  if (!src) return null
  const wav = join(dir('music'), `${id}.wav`)
  await run(vgmstream(), ['-o', wav, join(config.gamePath, src)], { windowsHide: true })
  await run(ffmpegPath(), ['-y', '-i', wav, '-b:a', '160k', mp3], { windowsHide: true })
  rmSync(wav, { force: true })
  return mp3
}

/* ---------------------------------------------------------------- statut */
function status(): StudioStatus {
  let state = engineState
  if (!existsSync(enginePath())) state = 'missing-engine'
  else if (!gameOk(config.gamePath)) state = 'missing-game'
  return { state, error: engineError, gamePath: config.gamePath, enginePath: enginePath(), busy }
}

/* ---------------------------------------------------------------- enregistrement */
export function registerStudio(win: () => BrowserWindow | null): void {
  config = readConfig()

  // studio://renders/<id>/<fichier> · studio://thumbs/<clé>/<fichier> · studio://game/<chemin> · studio://music/<id>.mp3
  protocol.handle('studio', async (request) => {
    const url = new URL(request.url)
    const path = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    let file: string | null = null
    if (url.host === 'renders' || url.host === 'thumbs') {
      const base = resolve(dir(url.host)), full = resolve(base, path)
      file = full.startsWith(base + sep) && existsSync(full) ? full : null
    } else if (url.host === 'game') file = gameFile(path)
    else if (url.host === 'music') file = await trackMp3(path.replace(/\.mp3$/, '')).catch(() => null)
    return file ? net.fetch(pathToFileURL(file).toString()) : new Response('not found', { status: 404 })
  })

  ipcMain.handle('studio:status', () => status())
  ipcMain.handle('studio:setGamePath', async () => {
    const w = win()
    const r = w ? await dialog.showOpenDialog(w, { properties: ['openDirectory'] }) : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    const p = r.filePaths[0]
    if (!r.canceled && p && gameOk(p)) {
      config.gamePath = p
      writeFileSync(join(root(), 'config.json'), JSON.stringify(config))
      engine?.stop(); engine = null; assetIndex.clear(); powerMap = null
    }
    return status()
  })
  ipcMain.handle('studio:catalog', () => catalog())
  ipcMain.handle('studio:legendAnims', (_e, hero: string) => legendAnims(String(hero)))
  ipcMain.handle('studio:weaponSkins', (_e, hero: string) => weaponSkins(String(hero)))
  ipcMain.handle('studio:exportFrame', (_e, id: string, index: number) => exportFrame(win(), String(id), Number(index) || 0))
  ipcMain.handle('studio:items', (_e, kind: StudioKind, query?: string, file?: string) => items(kind, String(query ?? ''), file ? String(file) : undefined))
  ipcMain.handle('studio:effectFiles', () => effectFiles())
  ipcMain.handle('studio:thumb', (_e, req: StudioRenderRequest) => thumb(req))
  ipcMain.handle('studio:render', (_e, req: StudioRenderRequest) => render(req))
  ipcMain.handle('studio:job', (_e, id: string) => jobs.get(String(id)) ?? null)
  ipcMain.handle('studio:library', () => library())
  ipcMain.handle('studio:remove', (_e, id: string) => {
    if (/^[\w-]+$/.test(String(id))) rmSync(join(dir('renders'), String(id)), { recursive: true, force: true })
  })
  ipcMain.handle('studio:export', (_e, id: string, format: StudioExportFormat) => exportRender(win(), String(id), format))
  ipcMain.handle('studio:assets', (_e, kind: StudioAssetKind, query: string, offset: number, limit: number) =>
    assets(kind, String(query ?? ''), Number(offset) || 0, Number(limit) || 120))
  ipcMain.handle('studio:saveAsset', (_e, rel: string) => { const f = gameFile(String(rel)); return f ? saveCopy(win(), f, basename(f)) : false })
  ipcMain.handle('studio:tracks', () => tracks())
  ipcMain.handle('studio:saveTrack', async (_e, id: string) => { const f = await trackMp3(String(id)); return f ? saveCopy(win(), f, `brawlhalla_${id}.mp3`) : false })

  // Démarre le moteur en arrière-plan pour que le Studio soit prêt à l'ouverture.
  try { getEngine() } catch { /* état visible dans le Studio */ }
}

export function stopStudio(): void { engine?.stop() }
