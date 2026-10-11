// Types partagés entre le processus principal, le preload et l'interface.

export type Platform = 'youtube' | 'instagram' | 'tiktok' | 'brawlhalla'
export const PLATFORMS: Platform[] = ['youtube', 'instagram', 'tiktok', 'brawlhalla']
/** Plateformes dont le fournisseur est livré dans cette version. */
export const AVAILABLE_PLATFORMS: Platform[] = ['youtube', 'brawlhalla']

export type ChartType = 'line' | 'area' | 'bar' | 'pie' | 'radar'
export type ThemeMode = 'dark' | 'light'
export type Lang = 'fr' | 'en'

/** Clés de métriques stockées dans la table `snapshots`. */
export type MetricKey =
  | 'subscribers' | 'views' | 'likes' | 'comments' | 'videos'
  | 'elo_1v1' | 'peak_1v1' | 'elo_2v2' | 'games' | 'wins' | 'winrate' | 'level' | 'global_rank' | 'region_rank'

export const METRICS_BY_PLATFORM: Record<Platform, MetricKey[]> = {
  youtube: ['subscribers', 'views', 'likes', 'comments', 'videos'],
  instagram: ['subscribers', 'likes', 'comments'],
  tiktok: ['subscribers', 'views', 'likes'],
  brawlhalla: ['elo_1v1', 'peak_1v1', 'elo_2v2', 'games', 'wins', 'winrate', 'level', 'global_rank', 'region_rank']
}

export interface Account {
  id: number
  platform: Platform
  /** Ce que l'utilisateur a saisi (lien, @handle, ID Brawlhalla…). */
  input: string
  displayName: string
  /** Identifiant stable côté plateforme (ID de chaîne, brawlhalla_id…). */
  externalId: string
  avatar?: string
  /** true = données simulées (mode démo). */
  demo: boolean
  createdAt: number
  lastSyncAt: number | null
  lastError: string | null
}

export interface Point { ts: number; value: number }
export type LatestMetrics = Partial<Record<MetricKey, number>>

export interface ItemStat {
  externalId: string
  title: string
  publishedAt: number
  views: number
  likes: number
  comments: number
}

export interface LegendStat {
  legendId: number
  name: string
  games: number
  wins: number
  kos: number
  falls: number
  damageDealt: number
  matchTimeSec: number
  level: number
}

/** Résultat d'une actualisation par un fournisseur. */
export interface ProviderResult {
  metrics: Partial<Record<MetricKey, number>>
  items?: ItemStat[]
  legends?: LegendStat[]
  extra?: { tier?: string; region?: string }
}

export type NativeMaterial = 'none' | 'mica' | 'acrylic'
export type BgMode = 'default' | 'solid' | 'gradient' | 'image'
export type ChartPalette = 'mono' | 'accent' | 'multi'
export type Density = 'compact' | 'comfortable' | 'spacious'
export type FontFamily = 'inter' | 'system' | 'serif' | 'mono'

export interface Settings {
  theme: ThemeMode
  lang: Lang
  refreshMinutes: number
  chartTypes: Record<string, ChartType>
  scrapingEnabled: boolean
  startWithWindows: boolean
  closeToTray: boolean
  autoUpdate: boolean

  /* --- Apparence (sauvegardable en préréglage / exportable en thème) --- */
  /** Effet verre : false = panneaux opaques, sans flou. */
  glassEnabled: boolean
  /** 0–100 : flou du verre. */
  glass: number
  /** 0–100 : opacité des panneaux. */
  glassOpacity: number
  /** 100–200 (%) : saturation derrière le verre. */
  glassSaturation: number
  /** Matériau natif de la fenêtre (Windows 11 uniquement). */
  nativeMaterial: NativeMaterial
  bgMode: BgMode
  bgColor: string
  bgColor2: string
  bgAngle: number
  bgBlur: number
  bgDim: number
  ambient: boolean
  accentEnabled: boolean
  accentColor: string
  chartPalette: ChartPalette
  /** Arrondi des coins en px. */
  radius: number
  density: Density
  /** Taille de l'interface en %. */
  uiScale: number
  fontFamily: FontFamily
  /** 0–100 : intensité des animations (0 = aucune). */
  animations: number

  /* --- Données locales, non exportées dans un thème --- */
  /** Nom du fichier d'image de fond copié dans le dossier de l'appli. */
  bgImage: string | null
  navOrder: string[]
  navHidden: string[]
  themePresets: Record<string, ThemeData>
}

/** Réglages d'apparence regroupés dans un thème. */
export const THEME_KEYS = [
  'theme', 'glassEnabled', 'glass', 'glassOpacity', 'glassSaturation', 'nativeMaterial',
  'bgMode', 'bgColor', 'bgColor2', 'bgAngle', 'bgBlur', 'bgDim', 'ambient',
  'accentEnabled', 'accentColor', 'chartPalette', 'radius', 'density', 'uiScale', 'fontFamily', 'animations'
] as const
export type ThemeKey = (typeof THEME_KEYS)[number]
export type ThemeData = Pick<Settings, ThemeKey>

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark', lang: 'fr', refreshMinutes: 30, chartTypes: {}, scrapingEnabled: false,
  startWithWindows: false, closeToTray: true, autoUpdate: true,
  glassEnabled: true, glass: 70, glassOpacity: 50, glassSaturation: 120, nativeMaterial: 'acrylic',
  bgMode: 'default', bgColor: '#101010', bgColor2: '#2a2a2a', bgAngle: 160, bgBlur: 8, bgDim: 35, ambient: true,
  accentEnabled: false, accentColor: '#8ab4ff', chartPalette: 'mono',
  radius: 18, density: 'comfortable', uiScale: 100, fontFamily: 'inter', animations: 60,
  bgImage: null, navOrder: ['overview', 'youtube', 'instagram', 'tiktok', 'brawlhalla'], navHidden: [], themePresets: {}
}

export type UpdateState = 'idle' | 'checking' | 'downloading' | 'ready' | 'none' | 'error' | 'dev'
export interface UpdateStatus { state: UpdateState; version?: string; percent?: number; message?: string }

export interface AppInfo { version: string; nativeGlass: boolean; encryptionAvailable: boolean }

export type SecretKey = 'youtube.apiKey' | 'brawlhalla.apiKey'

export interface AddAccountInput {
  platform: Platform
  input: string
  demo?: boolean
  /** true = remplace le compte existant de cette plateforme (une fois le nouveau compte validé). */
  replace?: boolean
}
export interface AddAccountResult { ok: boolean; account?: Account; error?: string }

/** API exposée à l'interface par le preload. Aucun secret ne remonte jamais vers l'interface. */
export interface WaveApi {
  appInfo(): Promise<AppInfo>
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  listAccounts(): Promise<Account[]>
  addAccount(input: AddAccountInput): Promise<AddAccountResult>
  removeAccount(id: number): Promise<void>
  getSeries(accountId: number, metric: MetricKey, sinceMs: number): Promise<Point[]>
  getLatest(accountId: number): Promise<LatestMetrics>
  getItems(accountId: number): Promise<ItemStat[]>
  getLegends(accountId: number): Promise<LegendStat[]>
  refreshNow(): Promise<void>
  hasSecret(key: SecretKey): Promise<boolean>
  setSecret(key: SecretKey, value: string): Promise<void>
  deleteSecret(key: SecretKey): Promise<void>
  onDataUpdated(cb: () => void): () => void
  /** Zoom de l'interface (1 = 100 %). */
  setZoom(factor: number): void
  pickBackground(): Promise<{ ok: boolean; filename?: string; error?: string }>
  getBackground(): Promise<string | null>
  clearBackground(): Promise<void>
  exportTheme(name: string, theme: ThemeData): Promise<boolean>
  importTheme(): Promise<{ ok: boolean; name?: string; theme?: Partial<ThemeData>; error?: string }>
  checkUpdate(): Promise<void>
  installUpdate(): Promise<void>
  getUpdateStatus(): Promise<UpdateStatus>
  onUpdateStatus(cb: (s: UpdateStatus) => void): () => void
}
