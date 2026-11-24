// Types shared by the main process, the preload and the interface.

// Only YouTube stays built in: Brawlhalla (1.0.1), TikTok and the rest go through plugins; Instagram has no API
// for personal accounts (removed in 1.1.0, it only showed "coming soon").
export type Platform = 'youtube'
export const PLATFORMS: Platform[] = ['youtube']
/** Platforms whose provider ships in this version. */
export const AVAILABLE_PLATFORMS: Platform[] = ['youtube']

export type ChartType = 'line' | 'area' | 'bar' | 'pie' | 'radar'
export type ThemeMode = 'dark' | 'light'
export type Lang = 'en' | 'fr' | 'es' | 'pt' | 'de' | 'it' | 'ja' | 'zh' | 'ar'
/** Interface languages: native name, locale used for dates and numbers, right-to-left script. */
export const LANGS: { id: Lang; name: string; locale: string; rtl?: boolean }[] = [
  { id: 'en', name: 'English', locale: 'en-US' },
  { id: 'fr', name: 'Français', locale: 'fr-FR' },
  { id: 'es', name: 'Español', locale: 'es-ES' },
  { id: 'pt', name: 'Português (Brasil)', locale: 'pt-BR' },
  { id: 'de', name: 'Deutsch', locale: 'de-DE' },
  { id: 'it', name: 'Italiano', locale: 'it-IT' },
  { id: 'ja', name: '日本語', locale: 'ja-JP' },
  { id: 'zh', name: '中文（简体）', locale: 'zh-CN' },
  { id: 'ar', name: 'العربية', locale: 'ar', rtl: true }
]
export const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.id === v)
export const localeOf = (l: Lang): string => LANGS.find((x) => x.id === l)?.locale ?? 'en-US'
export const isRtl = (l: Lang): boolean => !!LANGS.find((x) => x.id === l)?.rtl
/** First supported language among the system's preferred ones ("fr-FR", "pt-BR", "zh-Hans-CN"…), English otherwise. */
export function detectLang(preferred: readonly string[]): Lang {
  for (const tag of preferred) {
    const base = String(tag).toLowerCase().split(/[-_]/)[0]
    if (isLang(base)) return base
  }
  return 'en'
}

/** Metric keys stored in the `snapshots` table. */
export type MetricKey =
  | 'subscribers' | 'views' | 'likes' | 'comments' | 'videos'

export const METRICS_BY_PLATFORM: Record<Platform, MetricKey[]> = {
  youtube: ['subscribers', 'views', 'likes', 'comments', 'videos']
}

export interface Account {
  id: number
  platform: Platform
  /** What the user entered (link, @handle…). */
  input: string
  displayName: string
  /** Stable identifier on the platform side (channel ID…). */
  externalId: string
  avatar?: string
  /** true = simulated data (demo mode). */
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

/** Result of a refresh by a provider. */
export interface ProviderResult {
  metrics: Partial<Record<MetricKey, number>>
  items?: ItemStat[]
}

export type SoundKind = 'chime' | 'pulse' | 'bell'
export type TemplateKey = 'up' | 'down' | 'rankUp' | 'rankDown'

/** Milestone rule of a statistic: sequence 10-20-50…, increment, exact values (combinable). */
export interface MilestoneRule {
  enabled: boolean
  /** 10, 20, 50, 100, 200, 500, 1,000… which extends automatically. */
  sequence: boolean
  /** A milestone every N (0 = disabled). */
  increment: number
  custom: number[]
  /** Also notify when the value drops back below a milestone. */
  notifyDown: boolean
}

export interface MilestoneEvent {
  id: number
  accountId: number
  /** Built-in platform, or 'plugin' (then `source` gives the plugin name). */
  platform: Platform | 'plugin'
  source?: string
  account: string
  /** A metric, 'rank' for a rank change, or 'notice' for a notification sent by a plugin. */
  metric: string
  /** Readable metric name (plugin milestones); otherwise translated from `metric`. */
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

  /* --- Milestones and notifications --- */
  notificationsEnabled: boolean
  /** Notify Brawlhalla rank changes. */
  notifyRank: boolean
  notifySound: boolean
  notifySoundKind: SoundKind
  /** 0–100 */
  notifyVolume: number
  /** In-app celebration screen. */
  notifyCelebration: boolean
  /** Custom texts; empty = default text of the language. */
  notifyTemplates: Partial<Record<TemplateKey, string>>
  /** Milestone rules per statistic, key "platform.metric". Absent = default rule. */
  milestoneRules: Record<string, MilestoneRule>

  /* --- Appearance (can be saved as a preset / exported as a theme) --- */
  /** Glass effect: false = opaque panels, no blur. */
  glassEnabled: boolean
  /** 0–100: glass blur. */
  glass: number
  /** 0–100: panel opacity. */
  glassOpacity: number
  /** 100–200 (%): saturation behind the glass. */
  glassSaturation: number
  /** Native window material (Windows 11 only). */
  nativeMaterial: NativeMaterial
  /** Enlarged window: keep the desktop visible through it (Windows makes a truly maximized window opaque). */
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
  /** Corner radius in px. */
  radius: number
  density: Density
  /** Taille de l'interface en %. */
  uiScale: number
  fontFamily: FontFamily
  /** 0–100: animation intensity (0 = none). */
  animations: number

  /* --- Local data, not exported in a theme --- */
  /** File name of the background image copied into the app folder. */
  bgImage: string | null
  navOrder: string[]
  navHidden: string[]
  /** Custom tab names (tab identifier → name); absent = default name. */
  navLabels: Record<string, string>
  /** Notifications sent by plugins: false = turned off for this plugin (identifier → enabled). */
  pluginNotices: Record<string, boolean>
  themePresets: Record<string, ThemeData>
}

/** Appearance settings grouped into a theme. */
export const THEME_KEYS = [
  'theme', 'glassEnabled', 'glass', 'glassOpacity', 'glassSaturation', 'nativeMaterial',
  'bgMode', 'bgColor', 'bgColor2', 'bgAngle', 'bgBlur', 'bgDim', 'ambient',
  'accentEnabled', 'accentColor', 'chartPalette', 'radius', 'density', 'uiScale', 'fontFamily', 'animations'
] as const
export type ThemeKey = (typeof THEME_KEYS)[number]
export type ThemeData = Pick<Settings, ThemeKey>

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark', lang: 'en', refreshMinutes: 30, chartTypes: {}, scrapingEnabled: false,
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

import type { BankPlayer, BankStats, InstalledPlugin, PluginAccount, PluginDetail, PluginFilter, PluginInspect, PluginItemsPage } from './plugin'
import type { StudioApi } from './studio'

/** Metric values by key: plugins define their own keys. */
export type RawMetrics = Record<string, number>

export interface AddAccountInput {
  platform: Platform
  input: string
  demo?: boolean
  /** true = replaces the existing account of this platform (once the new account is validated). */
  replace?: boolean
}
export interface AddAccountResult { ok: boolean; account?: Account; error?: string }

/** API exposed to the interface by the preload. No secret ever goes up to the interface. */
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
  /** Overview recomputed by the plugin for the top bar filters (manifest `views`). */
  pluginAccountView(accountId: number, filters: Record<string, string>): Promise<{ ok: boolean; detail?: PluginDetail; error?: string }>
  /** Player bank: players matching a name, a player's sheet (built by the plugin that recorded them), content, .wdbank exchange. */
  bankSearch(query: string): Promise<BankPlayer[]>
  bankSheet(source: string, key: string): Promise<{ ok: boolean; detail?: PluginDetail; error?: string }>
  bankStats(): Promise<BankStats>
  bankForget(origin: string): Promise<number>
  bankExport(): Promise<{ rows: number } | null>
  bankImport(): Promise<{ file: string; added: number; known: number; rejected: number; error?: string }[] | null>
  pluginsBundled(): Promise<{ path: string; id: string; name: string; version: string; description: import('./plugin').LocalText; installedVersion: string | null }[]>
  pluginsCatalog(force?: boolean): Promise<{ entries: { id: string; name: string; version: string; author: string; description: import('./plugin').LocalText;
    permissions: { network?: string[]; folder?: boolean }; installedVersion: string | null }[]; fetchedAt: number | null; offline: boolean }>
  pluginsCatalogFetch(id: string): Promise<{ ok: boolean; path?: string; error?: string }>
  pluginAccountItems(accountId: number, offset: number, limit: number, month?: string, sortKey?: string, desc?: boolean, query?: string, scope?: string, filters?: Record<string, string>): Promise<PluginItemsPage>
  /** Opens the file picker and imports the chosen files for this account; null if cancelled. */
  pluginImportFiles(accountId: number, extensions: string[]): Promise<{ imported: number; skipped: number } | null>
  pluginImportPaths(accountId: number, paths: string[]): Promise<{ imported: number; skipped: number }>
  /** Image from a plugin account's image folder, as a data URL (null if missing or refused). */
  pluginImage(accountId: number, file: string): Promise<string | null>
  pluginAccountUpdate(accountId: number, inputs: Record<string, string>): Promise<{ ok: boolean; error?: string }>
  pluginOpenImportDir(accountId: number): Promise<string>
  pluginSecretSet(pluginId: string, key: string, value: string): Promise<boolean>
  pluginSecretDelete(pluginId: string, key: string): Promise<void>
  pickFolder(): Promise<string | null>
  /** Path of a file dropped onto the window (drag and drop). */
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
  studio: StudioApi
  replayPlayer: ReplayPlayerApi
}

/** Brawlhalla replay player (the real game, preloaded hidden): see src/main/replayPlayer.ts. */
export interface ReplayPlayerStatus {
  state: 'off' | 'missing' | 'loading' | 'ready' | 'error'
  error?: string
  /** Replay being shown (full path), null when closed. */
  replay: string | null
  /** The player finished analysing the replay (actions, team combos...). */
  analysed: boolean
  dir: string
  installed: boolean
}
/** Rectangle of the page (CSS pixels, from the top-left of the window content) the player covers. */
export interface ReplayPlayerRect { x: number; y: number; width: number; height: number }
export interface ReplayPlayerApi {
  status(): Promise<ReplayPlayerStatus>
  /** Opens a file of a plugin account (item id = file name). */
  open(accountId: number, file: string): Promise<{ ok: boolean; error?: string }>
  /** Moves the player window over `rect`, or hides it (null). */
  place(rect: ReplayPlayerRect | null): Promise<void>
  close(): Promise<void>
  command(cmd: 'pause' | 'seek' | 'speed', args?: Record<string, unknown>): Promise<void>
  /** Picks the bh-harness folder. */
  setDir(): Promise<ReplayPlayerStatus>
  onStatus(cb: (s: ReplayPlayerStatus) => void): () => void
}
