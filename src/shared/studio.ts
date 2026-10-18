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
export interface StudioAnim { name: string; label: string; animClass: string; frames: number }
/** Groupe d'animations d'une légende (signatures, attaques d'une arme, emotes…). */
export interface StudioAnimGroup { id: string; label: string; items: StudioAnim[] }

/** Skins d'arme par arme de base (Sword, Spear…) ; `own` = skin propre à la légende. */
export type StudioWeaponSkins = Record<string, { name: string; display: string; own: boolean }[]>

/** Élément d'une liste de cosmétiques / symboles (emoji, compagnon, portrait, effet…). */
/** sequence : effet découpé en symboles numérotés (DragonFireALL01, 02…) joués à la suite */
export interface StudioItem { name: string; display: string; animClass: string; sequence?: string[] }

export interface StudioRenderRequest {
  kind: StudioKind
  item?: string            // nom du cosmétique
  animClass?: string       // « Fichier.swf/Classe » (légende, portrait, effet)
  animation?: string       // vide = choisie automatiquement
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
  kind: StudioKind
  animation: string
  frames: number
  width: number
  height: number
  files: string[]
  created: number
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
  render(req: StudioRenderRequest): Promise<StudioJob>
  job(id: string): Promise<StudioJob | null>
  library(): Promise<StudioRender[]>
  remove(id: string): Promise<void>
  exportRender(id: string, format: StudioExportFormat): Promise<{ ok: boolean; path?: string; error?: string }>
  exportFrame(id: string, index: number): Promise<{ ok: boolean; path?: string }>
  assets(kind: StudioAssetKind, query: string, offset: number, limit: number): Promise<StudioAssetPage>
  saveAsset(path: string): Promise<boolean>
  tracks(): Promise<StudioTrack[]>
  saveTrack(id: string): Promise<boolean>
}
