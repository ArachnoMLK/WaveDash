// Studio Brawlhalla : rendus de légendes et de cosmétiques à partir des fichiers du jeu installé.

/** Ce qu'on peut rendre. `legend` = légende + skin + animation ; `swf` = symbole d'un .swf (portrait, effet) ; le reste = cosmétiques. */
export type StudioKind = 'legend' | 'emoji' | 'companion' | 'sidekick' | 'podium' | 'frame' | 'insignia' | 'portrait' | 'effect'
export const STUDIO_KINDS: StudioKind[] = ['legend', 'emoji', 'companion', 'sidekick', 'podium', 'frame', 'insignia', 'portrait', 'effect']

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

/** Élément d'une liste de cosmétiques / symboles (emoji, compagnon, portrait, effet…). */
export interface StudioItem { name: string; display: string; animClass: string }

export interface StudioRenderRequest {
  kind: StudioKind
  item?: string            // nom du cosmétique
  animClass?: string       // « Fichier.swf/Classe » (légende, portrait, effet)
  animation?: string       // vide = choisie automatiquement
  costume?: string
  color?: string
  weapon?: string
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
  /** `file` : fichier SFX_*.swf pour les effets. */
  items(kind: StudioKind, query?: string, file?: string): Promise<StudioItem[]>
  effectFiles(): Promise<string[]>
  thumb(req: StudioRenderRequest): Promise<string | null>
  render(req: StudioRenderRequest): Promise<StudioJob>
  job(id: string): Promise<StudioJob | null>
  library(): Promise<StudioRender[]>
  remove(id: string): Promise<void>
  exportRender(id: string, format: StudioExportFormat): Promise<{ ok: boolean; path?: string; error?: string }>
  assets(kind: StudioAssetKind, query: string, offset: number, limit: number): Promise<StudioAssetPage>
  saveAsset(path: string): Promise<boolean>
  tracks(): Promise<StudioTrack[]>
  saveTrack(id: string): Promise<boolean>
}
