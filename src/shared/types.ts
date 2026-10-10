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

export interface Settings {
  theme: ThemeMode
  lang: Lang
  /** 0–100 : intensité du verre dépoli. */
  glass: number
  /** 0–100 : intensité des animations (0 = aucune). */
  animations: number
  refreshMinutes: number
  chartTypes: Record<string, ChartType>
  scrapingEnabled: boolean
  startWithWindows: boolean
  closeToTray: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark', lang: 'fr', glass: 70, animations: 60, refreshMinutes: 30,
  chartTypes: {}, scrapingEnabled: false, startWithWindows: false, closeToTray: true
}

export interface AppInfo { version: string; nativeGlass: boolean; encryptionAvailable: boolean }

export type SecretKey = 'youtube.apiKey' | 'brawlhalla.apiKey'

export interface AddAccountInput { platform: Platform; input: string; demo?: boolean }
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
}
