import { ChartType, MetricKey, Platform, PLATFORMS } from '@shared/types'

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

/** Onglets de navigation personnalisables (les paramètres restent toujours en bas). */
export const NAV_IDS: string[] = ['overview', 'goals', ...PLATFORMS]
/** Clé de traduction du libellé d'un onglet. */
export const navLabelKey = (id: string): string => (id === 'overview' ? 'nav.overview' : id === 'goals' ? 'nav.goals' : `platform.${id}`)
/** Ordre enregistré ; un onglet apparu depuis (ex. Objectifs en 0.4) s'insère après la vue d'ensemble. */
export const orderedNav = (saved: string[]): string[] => {
  const out = saved.filter((id) => NAV_IDS.includes(id))
  for (const id of NAV_IDS.filter((x) => !out.includes(x))) {
    const i = id === 'goals' && out.includes('overview') ? out.indexOf('overview') + 1 : out.length
    out.splice(i, 0, id)
  }
  return out
}
