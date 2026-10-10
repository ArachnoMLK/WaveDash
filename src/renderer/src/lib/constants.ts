import { ChartType, MetricKey, Platform } from '@shared/types'

/** Métriques mises en avant dans les cartes de la vue d'ensemble. */
export const PRIMARY_METRICS: Record<Platform, MetricKey[]> = {
  youtube: ['subscribers', 'views'], instagram: ['subscribers', 'likes'], tiktok: ['subscribers', 'views'], brawlhalla: ['elo_1v1', 'winrate']
}

/** Pour les métriques où une valeur plus basse est meilleure (classements). */
export const LOWER_IS_BETTER: MetricKey[] = ['global_rank', 'region_rank']

/** Types de graphique proposés par statistique (courbes dans le temps vs données par catégorie). */
export const TIME_CHARTS: ChartType[] = ['line', 'area', 'bar']
export const CATEGORY_CHARTS: ChartType[] = ['bar', 'pie', 'radar']
export const CHART_KEYS = { legendGames: 'brawlhalla.legendGames', legendWinrate: 'brawlhalla.legendWinrate', videoViews: 'youtube.videoViews' }
export const DEFAULT_CHART: Record<string, ChartType> = {
  [CHART_KEYS.legendGames]: 'bar', [CHART_KEYS.legendWinrate]: 'radar', [CHART_KEYS.videoViews]: 'bar'
}
export const chartKey = (platform: Platform, metric: MetricKey): string => `${platform}.${metric}`
