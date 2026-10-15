import { PluginMetric } from '@shared/plugin'
import { Lang } from '@shared/types'

/** Formate la valeur d'une métrique de plugin selon son manifeste (nombre, pourcentage, rang, durée). */
export function fmtPluginMetric(m: PluginMetric, v: number, lang: Lang): string {
  const nf = (n: number, d: number): string =>
    new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
  if (m.format === 'percent') return `${nf(v, m.decimals)} %`
  if (m.format === 'rank') return `#${nf(v, 0)}`
  if (m.format === 'duration') {
    const s = Math.max(0, Math.round(v)), h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = s % 60
    return h ? `${h}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}` : `${mi}:${String(se).padStart(2, '0')}`
  }
  return `${nf(v, m.decimals)}${m.unit ? ' ' + m.unit : ''}`
}

/** Route d'une page de compte de plugin. */
export const pluginRoute = (accountId: number): string => `plugin:${accountId}`
export const pluginAccountOfRoute = (route: string): number | null => (route.startsWith('plugin:') ? Number(route.slice(7)) || null : null)
