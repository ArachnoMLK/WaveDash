// Studio Brawlhalla : rendus de légendes et de cosmétiques à partir des fichiers du jeu installé.

/** Ce qu'on peut rendre. `legend` = légende + skin + animation ; `swf` = symbole d'un .swf (portrait, effet) ; le reste = cosmétiques. */
export type StudioKind = 'legend' | 'emoji' | 'companion' | 'sidekick' | 'podium' | 'frame' | 'insignia' | 'portrait' | 'effect'
export const STUDIO_KINDS: StudioKind[] = ['legend', 'emoji', 'companion', 'sidekick', 'podium', 'frame', 'insignia', 'portrait', 'effect']

/** Arme (nom HeroTypes) → fichier d'animations. */
export const WEAPON_ANM: Record<string, string> = {
  Sword: 'Animation_Sword', Spear: 'Animation_Spear', Hammer: 'Animation_Hammer', Pistol: 'Animation_Pistols',
  RocketLance: 'Animation_Lance', Katar: 'Animation_Katar', Axe: 'Animation_Axe', Bow: 'Animation_Bow', Fists: 'Animation_Fists',
  Scythe: 'Animation_Scythe', Cannon: 'Animation_Cannon', Orb: 'Animation_Orb', Boots: 'Animation_Boots',
  Greatsword: 'Animation_GreatSword', Chakram: 'Animation_Chakram'
}
export const WEAPON_FR: Record<string, string> = {
  Sword: 'Épée', Spear: 'Lance', Hammer: 'Marteau', Pistol: 'Blasters', RocketLance: 'Lance-roquette', Katar: 'Katars', Axe: 'Hache',
  Bow: 'Arc', Fists: 'Gantelets', Scythe: 'Faux', Cannon: 'Canon', Orb: 'Orbe', Boots: 'Bottes', Greatsword: 'Espadon', Chakram: 'Chakram'
}

/** Arme de base d'une animation (« Animation_Sword.swf/… » → « Sword »), ou null (emotes…). */
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

/** Une animation prête à rendre : `animClass` = « Fichier.swf/Classe ». */
/** `parts` : coup en plusieurs animations jouées à la suite (NLight = Combo1 → Combo2 → Combo3). */
export interface StudioAnim { name: string; label: string; animClass: string; frames: number; parts?: string[] }
/** Groupe d'animations d'une légende (signatures, attaques d'une arme, emotes…). */
export interface StudioAnimGroup { id: string; label: string; items: StudioAnim[] }

/** Skins d'arme par arme de base (Sword, Spear…) ; `own` = skin propre à la légende. */
export type StudioWeaponSkins = Record<string, { name: string; display: string; own: boolean }[]>

/** Élément d'une liste de cosmétiques / symboles (emoji, compagnon, portrait, effet…). */
/** sequence : effet découpé en symboles numérotés (DragonFireALL01, 02…) joués à la suite */
export interface StudioItem { name: string; display: string; animClass: string; sequence?: string[] }

/** Export : seulement certaines images (indices dans l'ordre voulu) et vitesse en images par seconde. */
/** `duration` (s) : l'export dure ce temps ; les images sont répétées selon `loop` (`game` : l'intro une fois, la boucle du jeu
 *  répétée, puis la fin de l'animation ; `all` : toute l'animation, ou la sélection ; `off` : une seule fois). */
export type StudioLoopMode = 'off' | 'all' | 'game'
export interface StudioExportOptions { frames?: number[]; fps?: number; duration?: number; loop?: StudioLoopMode }
export const STUDIO_MAX_DURATION = 300
/** Suite d'images d'un export : la sélection (ou tout), puis répétée jusqu'à la durée demandée selon le mode de boucle. */
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
  // Comme en jeu : l'intro une fois, la boucle répétée, puis la fin de l'animation pour terminer proprement. Comme dans le jeu,
  // la fin peut partir de n'importe quelle image de la boucle : la durée demandée est respectée à l'image près.
  const end = loopEnd !== undefined && loopEnd > loopStart && loopEnd <= count ? loopEnd : count
  const intro = base.slice(0, loopStart), part = base.slice(loopStart, end), outro = base.slice(end)
  if (target <= intro.length + outro.length) return base.slice(0, Math.max(target, 1))
  const out = [...intro]
  while (out.length + outro.length < target) out.push(part[(out.length - intro.length) % part.length])
  return [...out, ...outro]
}

export interface StudioRenderRequest {
  kind: StudioKind
  item?: string            // nom du cosmétique
  animClass?: string       // « Fichier.swf/Classe » (légende, portrait, effet)
  animation?: string       // vide = choisie automatiquement
  animations?: string[]    // plusieurs animations enchaînées (coup en plusieurs parties)
  costume?: string
  color?: string
  weapon?: string
  sequence?: string[]      // symboles d'un effet en plusieurs parties, dans l'ordre
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
  /** Boucle du jeu : de loopStart à loopEnd (non compris). Avant : l'intro, jouée une fois ; après : la fin (ex. une emote qui se
   *  termine). Absents : pas de boucle connue ; loopEnd absent : la boucle va jusqu'à la dernière image. */
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
  /** `file` : fichier SFX_*.swf pour les effets. */
  items(kind: StudioKind, query?: string, file?: string): Promise<StudioItem[]>
  effectFiles(): Promise<string[]>
  thumb(req: StudioRenderRequest): Promise<string | null>
  /** Toutes les images d'une animation en petit (aperçu au survol). */
  preview(req: StudioRenderRequest): Promise<{ base: string; files: string[] } | null>
  /** Plusieurs rendus superposés, fusionnés image par image en un nouveau rendu. */
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
  /* éditeur de miniatures */
  importImage(): Promise<string | null>
  storeImage(bytes: Uint8Array, ext: string): Promise<string>
  saveImage(bytes: Uint8Array, name: string, ext: string): Promise<{ ok: boolean; path?: string }>
  saveProject(json: string, path?: string): Promise<{ ok: boolean; path?: string }>
  openProject(): Promise<{ path: string; json: string } | null>
}
