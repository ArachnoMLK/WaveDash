import type { Lang } from './types'
// Brawlhalla Studio: renders of legends and cosmetics from the installed game files.

/** What can be rendered. `legend` = legend + skin + animation; `swf` = symbol of a .swf (portrait, effect); the rest = cosmetics. */
export type StudioKind = 'legend' | 'emoji' | 'companion' | 'sidekick' | 'podium' | 'frame' | 'insignia' | 'portrait' | 'effect'
export const STUDIO_KINDS: StudioKind[] = ['legend', 'emoji', 'companion', 'sidekick', 'podium', 'frame', 'insignia', 'portrait', 'effect']

/** Arme (nom HeroTypes) → fichier d'animations. */
export const WEAPON_ANM: Record<string, string> = {
  Sword: 'Animation_Sword', Spear: 'Animation_Spear', Hammer: 'Animation_Hammer', Pistol: 'Animation_Pistols',
  RocketLance: 'Animation_Lance', Katar: 'Animation_Katar', Axe: 'Animation_Axe', Bow: 'Animation_Bow', Fists: 'Animation_Fists',
  Scythe: 'Animation_Scythe', Cannon: 'Animation_Cannon', Orb: 'Animation_Orb', Boots: 'Animation_Boots',
  Greatsword: 'Animation_GreatSword', Chakram: 'Animation_Chakram'
}
const WEAPON_NAMES: Partial<Record<Lang, Record<string, string>>> = {
  en: { Pistol: 'Blasters', RocketLance: 'Rocket Lance', Katar: 'Katars', Fists: 'Gauntlets' },
  fr: {
    Sword: 'Épée', Spear: 'Lance', Hammer: 'Marteau', Pistol: 'Blasters', RocketLance: 'Lance-roquette', Katar: 'Katars', Axe: 'Hache',
    Bow: 'Arc', Fists: 'Gantelets', Scythe: 'Faux', Cannon: 'Canon', Orb: 'Orbe', Boots: 'Bottes', Greatsword: 'Espadon', Chakram: 'Chakram'
  }
}
/** In-game name of a base weapon (English for languages without their own table). */
export const weaponName = (w: string, lang: Lang): string => WEAPON_NAMES[lang]?.[w] ?? WEAPON_NAMES.en![w] ?? w

/** Labels of the automatic animation groups (French, otherwise English). */
export const groupLabels = (lang: Lang): { sigs: string; attacks: string; stances: string; emotes: string } =>
  lang === 'fr'
    ? { sigs: 'Signatures', attacks: 'Attaques', stances: 'Postures', emotes: 'Emotes & danses' }
    : { sigs: 'Signatures', attacks: 'Attacks', stances: 'Stances', emotes: 'Emotes & dances' }

/** Base weapon of an animation ("Animation_Sword.swf/…" → "Sword"), or null (emotes…). */
export const weaponOfAnim = (animClass: string, weapons: string[]): string | null =>
  weapons.find((w) => WEAPON_ANM[w] && animClass.startsWith(WEAPON_ANM[w] + '.swf/')) ?? null

export interface StudioStatus {
  state: 'missing-engine' | 'missing-game' | 'starting' | 'ready' | 'error'
  error?: string
  gamePath: string
  enginePath: string
  busy: number
}

export interface StudioHero { name: string; bio: string; weapons: string[] }
export interface StudioCostume { name: string; display: string; hero: string }
export interface StudioCatalog { heroes: StudioHero[]; costumes: StudioCostume[]; colors: string[] }

/** An animation ready to render: `animClass` = "File.swf/Class". */
/** `parts`: move made of several animations played in sequence (NLight = Combo1 → Combo2 → Combo3). */
export interface StudioAnim { name: string; label: string; animClass: string; frames: number; parts?: string[] }
/** Group of animations of a legend (signatures, attacks of a weapon, emotes…). */
export interface StudioAnimGroup { id: string; label: string; items: StudioAnim[] }

/** Weapon skins per base weapon (Sword, Spear…); `own` = skin specific to the legend. */
export type StudioWeaponSkins = Record<string, { name: string; display: string; own: boolean }[]>

/** Item of a list of cosmetics / symbols (emoji, companion, portrait, effect…). */
/** sequence: effect split into numbered symbols (DragonFireALL01, 02…) played in sequence */
export interface StudioItem { name: string; display: string; animClass: string; sequence?: string[] }

/** Export: only some frames (indices in the desired order) and speed in frames per second. */
/** `duration` (s): the export lasts this long; frames are repeated according to `loop` (`game`: the intro once, the game loop
 *  repeated, then the end of the animation; `all`: the whole animation, or the selection; `off`: only once). */
export type StudioLoopMode = 'off' | 'all' | 'game'
export interface StudioExportOptions { frames?: number[]; fps?: number; duration?: number; loop?: StudioLoopMode }
export const STUDIO_MAX_DURATION = 300
/** Frame sequence of an export: the selection (or everything), then repeated up to the requested duration according to the loop mode. */
export function exportSequence(count: number, opts: StudioExportOptions, loopStart?: number, loopEnd?: number): number[] {
  const fps = Math.min(60, Math.max(1, Math.round(Number(opts.fps) || 24)))
  const picked = (opts.frames ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < count)
  const base = picked.length ? picked : Array.from({ length: count }, (_, i) => i)
  const duration = Math.min(STUDIO_MAX_DURATION, Math.max(0, Number(opts.duration) || 0))
  if (!duration || opts.loop === 'off' || !base.length) return base
  const target = Math.max(1, Math.round(duration * fps))
  if (picked.length || opts.loop !== 'game' || loopStart === undefined || loopStart >= count) {
    const out: number[] = []
    while (out.length < target) out.push(...base)
    return out.slice(0, target)
  }
  // Like in game: the intro once, the loop repeated, then the end of the animation to finish cleanly. As in the game,
  // the ending can start from any frame of the loop: the requested duration is matched to the frame.
  const end = loopEnd !== undefined && loopEnd > loopStart && loopEnd <= count ? loopEnd : count
  const intro = base.slice(0, loopStart), part = base.slice(loopStart, end), outro = base.slice(end)
  if (target <= intro.length + outro.length) return base.slice(0, Math.max(target, 1))
  const out = [...intro]
  while (out.length + outro.length < target) out.push(part[(out.length - intro.length) % part.length])
  return [...out, ...outro]
}

export interface StudioRenderRequest {
  kind: StudioKind
  item?: string            // cosmetic name
  animClass?: string       // "File.swf/Class" (legend, portrait, effect)
  animation?: string       // vide = choisie automatiquement
  animations?: string[]    // several chained animations (multi-part move)
  costume?: string
  color?: string
  weapon?: string
  sequence?: string[]      // symbols of a multi-part effect, in order
  scale?: number
  flip?: boolean
  label?: string
}

export interface StudioRender {
  id: string
  label: string
  kind: StudioKind | 'composite'
  animation: string
  frames: number
  width: number
  height: number
  files: string[]
  created: number
  /** Game loop: from loopStart to loopEnd (excluded). Before: the intro, played once; after: the ending (e.g. an emote that
   *  finishes). Absent: no known loop; loopEnd absent: the loop runs to the last frame. */
  loopStart?: number
  loopEnd?: number
}

export interface StudioJob { id: string; status: 'running' | 'done' | 'error'; label: string; error?: string; result?: StudioRender }

export type StudioAssetKind = 'banners' | 'avatars' | 'sprites' | 'backgrounds' | 'maps' | 'images'
export interface StudioAssetPage { total: number; items: string[] }

export interface StudioTrack { id: string; duration: number }

export type StudioExportFormat = 'gif' | 'apng' | 'webm' | 'mov' | 'mp4' | 'png'

export interface StudioApi {
  status(): Promise<StudioStatus>
  setGamePath(): Promise<StudioStatus>
  catalog(): Promise<StudioCatalog>
  legendAnims(hero: string): Promise<StudioAnimGroup[]>
  weaponSkins(hero: string): Promise<StudioWeaponSkins>
  /** `file`: SFX_*.swf file for the effects. */
  items(kind: StudioKind, query?: string, file?: string): Promise<StudioItem[]>
  effectFiles(): Promise<string[]>
  thumb(req: StudioRenderRequest): Promise<string | null>
  /** All the frames of an animation at small size (hover preview). */
  preview(req: StudioRenderRequest): Promise<{ base: string; files: string[] } | null>
  /** Several renders stacked, merged frame by frame into a new render. */
  saveComposite(frames: Uint8Array[], label: string, width: number, height: number): Promise<StudioRender>
  render(req: StudioRenderRequest): Promise<StudioJob>
  job(id: string): Promise<StudioJob | null>
  library(): Promise<StudioRender[]>
  remove(id: string): Promise<void>
  exportRender(id: string, format: StudioExportFormat, opts?: StudioExportOptions): Promise<{ ok: boolean; path?: string; error?: string }>
  exportFrame(id: string, index: number): Promise<{ ok: boolean; path?: string }>
  assets(kind: StudioAssetKind, query: string, offset: number, limit: number): Promise<StudioAssetPage>
  saveAsset(path: string): Promise<boolean>
  tracks(): Promise<StudioTrack[]>
  saveTrack(id: string): Promise<boolean>
  /* thumbnail editor */
  importImage(): Promise<string | null>
  storeImage(bytes: Uint8Array, ext: string): Promise<string>
  saveImage(bytes: Uint8Array, name: string, ext: string): Promise<{ ok: boolean; path?: string }>
  saveProject(json: string, path?: string): Promise<{ ok: boolean; path?: string }>
  openProject(): Promise<{ path: string; json: string } | null>
}
