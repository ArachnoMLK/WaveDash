// Types partagés entre le processus principal, le preload et l'interface.

// Seul YouTube reste intégré : Brawlhalla (1.0.1), TikTok et le reste passent par des plugins ; Instagram n'a pas d'API
// pour les comptes personnels (retiré en 1.1.0, il n'affichait que « bientôt disponible »).
export type Platform = 'youtube'
export const PLATFORMS: Platform[] = ['youtube']
/** Plateformes dont le fournisseur est livré dans cette version. */
export const AVAILABLE_PLATFORMS: Platform[] = ['youtube']

export type ChartType = 'line' | 'area' | 'bar' | 'pie' | 'radar'
export type ThemeMode = 'dark' | 'light'
export type Lang = 'fr' | 'en'

/** Clés de métriques stockées dans la table `snapshots`. */
export type MetricKey =
  | 'subscribers' | 'views' | 'likes' | 'comments' | 'videos'

export const METRICS_BY_PLATFORM: Record<Platform, MetricKey[]> = {
  youtube: ['subscribers', 'views', 'likes', 'comments', 'videos']
}

export interface Account {
  id: number
  platform: Platform
  /** Ce que l'utilisateur a saisi (lien, @handle…). */
  input: string
  displayName: string
  /** Identifiant stable côté plateforme (ID de chaîne…). */
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

/** Résultat d'une actualisation par un fournisseur. */
export interface ProviderResult {
  metrics: Partial<Record<MetricKey, number>>
  items?: ItemStat[]
}

export type SoundKind = 'chime' | 'pulse' | 'bell'
export type TemplateKey = 'up' | 'down' | 'rankUp' | 'rankDown'

/** Règle de paliers d'une statistique : séquence 10-20-50…, incrément, valeurs précises (cumulables). */
export interface MilestoneRule {
  enabled: boolean
  /** 10, 20, 50, 100, 200, 500, 1 000… qui se prolonge automatiquement. */
  sequence: boolean
  /** Un palier tous les N (0 = désactivé). */
  increment: number
  custom: number[]
  /** Notifier aussi quand la valeur repasse sous un palier. */
  notifyDown: boolean
}

export interface MilestoneEvent {
  id: number
  accountId: number
  /** Plateforme intégrée, ou 'plugin' (alors `source` donne le nom du plugin). */
  platform: Platform | 'plugin'
  source?: string
  account: string
  /** Une métrique, 'rank' pour un changement de rang, ou 'notice' pour une notification envoyée par un plugin. */
  metric: string
  /** Nom lisible de la métrique (paliers des plugins) ; sinon traduit d'après `metric`. */
  label?: string
  threshold: number
  previous: number
  value: number
  direction: 'up' | 'down'
  ts: number
  fromRank?: string
  toRank?: string
  message: string
  demo: boolean
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

  /* --- Paliers et notifications --- */
  notificationsEnabled: boolean
  /** Notifier les changements de rang Brawlhalla. */
  notifyRank: boolean
  notifySound: boolean
  notifySoundKind: SoundKind
  /** 0–100 */
  notifyVolume: number
  /** Écran de célébration dans l'appli. */
  notifyCelebration: boolean
  /** Textes personnalisés ; vide = texte par défaut de la langue. */
  notifyTemplates: Partial<Record<TemplateKey, string>>
  /** Règles de paliers par statistique, clé « plateforme.métrique ». Absent = règle par défaut. */
  milestoneRules: Record<string, MilestoneRule>

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
  /** Fenêtre agrandie : garder le bureau visible à travers (Windows rend opaque une fenêtre réellement maximisée). */
  seeThroughMaximized: boolean
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
  /** Noms personnalisés des onglets (identifiant d'onglet → nom) ; absent = nom par défaut. */
  navLabels: Record<string, string>
  /** Notifications envoyées par les plugins : false = coupées pour ce plugin (identifiant → activé). */
  pluginNotices: Record<string, boolean>
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
  glassEnabled: true, glass: 70, glassOpacity: 50, glassSaturation: 120, nativeMaterial: 'acrylic', seeThroughMaximized: true,
  bgMode: 'default', bgColor: '#101010', bgColor2: '#2a2a2a', bgAngle: 160, bgBlur: 8, bgDim: 35, ambient: true,
  accentEnabled: false, accentColor: '#8ab4ff', chartPalette: 'multi',
  radius: 18, density: 'comfortable', uiScale: 100, fontFamily: 'inter', animations: 60,
  bgImage: null, navOrder: ['overview', 'goals', 'youtube'], navHidden: [], navLabels: {}, pluginNotices: {}, themePresets: {},
  notificationsEnabled: true, notifyRank: true, notifySound: true, notifySoundKind: 'chime', notifyVolume: 60,
  notifyCelebration: true, notifyTemplates: {}, milestoneRules: {}
}

export type UpdateState = 'idle' | 'checking' | 'downloading' | 'ready' | 'none' | 'error' | 'dev'
export interface UpdateStatus { state: UpdateState; version?: string; percent?: number; message?: string }

export interface AppInfo { version: string; nativeGlass: boolean; encryptionAvailable: boolean }

export type SecretKey = 'youtube.apiKey'

import type { InstalledPlugin, PluginAccount, PluginDetail, PluginFilter, PluginInspect, PluginItemsPage } from './plugin'

/** Valeurs de métriques par clé : les plugins définissent leurs propres clés. */
export type RawMetrics = Record<string, number>

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
  getSeries(accountId: number, metric: string, sinceMs: number): Promise<Point[]>
  getLatest(accountId: number): Promise<RawMetrics>
  getItems(accountId: number): Promise<ItemStat[]>
  refreshNow(): Promise<void>
  hasSecret(key: SecretKey): Promise<boolean>
  setSecret(key: SecretKey, value: string): Promise<void>
  deleteSecret(key: SecretKey): Promise<void>
  onDataUpdated(cb: () => void): () => void
  /** Zoom de l'interface (1 = 100 %). */
  setZoom(factor: number): void
  /* --- Plugins .wdsh --- */
  pluginsList(): Promise<InstalledPlugin[]>
  pluginAccountsList(): Promise<PluginAccount[]>
  pluginsPickPackage(): Promise<string | null>
  pluginsInspect(path: string): Promise<{ ok: true; inspect: PluginInspect } | { ok: false; error: string }>
  pluginsInstall(token: string): Promise<{ ok: boolean; error?: string }>
  pluginsSetEnabled(id: string, enabled: boolean): Promise<void>
  pluginsUninstall(id: string): Promise<void>
  pluginAccountAdd(pluginId: string, inputs: Record<string, string>): Promise<{ ok: boolean; error?: string; detail?: string }>
  pluginAccountRemove(accountId: number): Promise<void>
  pluginAccountRefresh(accountId: number): Promise<void>
  pluginAccountData(accountId: number): Promise<{ logs: string[]; error: string | null; backlog: number; summary: PluginDetail | null; filters: PluginFilter[] }>
  pluginAccountCross(accountId: number, req: { who: string; measure: string; a: string; b: string }, filters?: Record<string, string>): Promise<{ ok: boolean; detail?: PluginDetail; error?: string }>
  pluginAccountSearch(accountId: number, query: string, filters?: Record<string, string>): Promise<{ ok: boolean; unsupported?: boolean; detail?: PluginDetail; error?: string }>
  /** Bilan recalculé par le plugin pour les filtres de la barre du haut (manifeste `views`). */
  pluginAccountView(accountId: number, filters: Record<string, string>): Promise<{ ok: boolean; detail?: PluginDetail; error?: string }>
  pluginsBundled(): Promise<{ path: string; id: string; name: string; version: string; description: import('./plugin').LocalText; installedVersion: string | null }[]>
  pluginsCatalog(force?: boolean): Promise<{ entries: { id: string; name: string; version: string; author: string; description: import('./plugin').LocalText;
    permissions: { network?: string[]; folder?: boolean }; installedVersion: string | null }[]; fetchedAt: number | null; offline: boolean }>
  pluginsCatalogFetch(id: string): Promise<{ ok: boolean; path?: string; error?: string }>
  pluginAccountItems(accountId: number, offset: number, limit: number, month?: string, sortKey?: string, desc?: boolean, query?: string, scope?: string, filters?: Record<string, string>): Promise<PluginItemsPage>
  /** Ouvre le sélecteur de fichiers et importe les fichiers choisis pour ce compte ; null si annulé. */
  pluginImportFiles(accountId: number, extensions: string[]): Promise<{ imported: number; skipped: number } | null>
  pluginImportPaths(accountId: number, paths: string[]): Promise<{ imported: number; skipped: number }>
  /** Image du dossier d'images d'un compte de plugin, en data URL (null si absente ou refusée). */
  pluginImage(accountId: number, file: string): Promise<string | null>
  pluginAccountUpdate(accountId: number, inputs: Record<string, string>): Promise<{ ok: boolean; error?: string }>
  pluginOpenImportDir(accountId: number): Promise<string>
  pluginSecretSet(pluginId: string, key: string, value: string): Promise<boolean>
  pluginSecretDelete(pluginId: string, key: string): Promise<void>
  pickFolder(): Promise<string | null>
  /** Chemin d'un fichier déposé dans la fenêtre (glisser-déposer). */
  pathForFile(file: File): string
  takePendingPluginFile(): Promise<string | null>
  onPluginFile(cb: (path: string) => void): () => void
  reloadSettings(): Promise<Settings>
  getMilestoneEvents(limit?: number): Promise<MilestoneEvent[]>
  testNotification(): Promise<void>
  onMilestone(cb: (e: MilestoneEvent) => void): () => void
  exportData(format: 'csv' | 'json' | 'pdf'): Promise<{ ok: boolean; error?: string }>
  exportBackup(): Promise<boolean>
  importBackup(): Promise<{ ok: boolean; error?: string }>
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
