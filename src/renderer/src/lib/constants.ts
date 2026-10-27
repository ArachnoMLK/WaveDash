import { ChartType, MetricKey, Platform, PLATFORMS } from '@shared/types'

/** Metrics highlighted in the overview cards. */
export const PRIMARY_METRICS: Record<Platform, MetricKey[]> = {
  youtube: ['subscribers', 'views']
}

/** Chart types offered per statistic (curves over time vs data by category). */
export const TIME_CHARTS: ChartType[] = ['line', 'area', 'bar']
export const CATEGORY_CHARTS: ChartType[] = ['bar', 'pie', 'radar']
export const CHART_KEYS = { videoViews: 'youtube.videoViews' }
export const DEFAULT_CHART: Record<string, ChartType> = {
  [CHART_KEYS.videoViews]: 'bar'
}
export const chartKey = (platform: Platform, metric: MetricKey): string => `${platform}.${metric}`

/** Customizable navigation tabs (settings always stay at the bottom). */
export const NAV_IDS: string[] = ['overview', 'goals', 'studio', ...PLATFORMS]
/** Translation key of a tab label. */
export const navLabelKey = (id: string): string =>
  (id === 'overview' ? 'nav.overview' : id === 'goals' ? 'nav.goals' : id === 'studio' ? 'nav.studio' : `platform.${id}`)
/** Saved order; a tab added since (e.g. Goals in 0.4) is inserted after the overview.
 *  `extra`: tabs of plugin accounts ("plugin:<id>"); a new account is added at the end. */
export const orderedNav = (saved: string[], extra: string[] = []): string[] => {
  const out = saved.filter((id) => NAV_IDS.includes(id) || extra.includes(id))
  for (const id of NAV_IDS.filter((x) => !out.includes(x))) {
    const i = id === 'goals' && out.includes('overview') ? out.indexOf('overview') + 1 : out.length
    out.splice(i, 0, id)
  }
  for (const id of extra) if (!out.includes(id)) out.push(id)
  return out
}
