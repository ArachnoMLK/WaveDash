import { InstalledPlugin, PluginAccount, PluginMetric } from '@shared/plugin'
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
/** Onglets des comptes de plugins installés, dans l'ordre de création. */
export const pluginNavIds = (plugins: InstalledPlugin[], accounts: PluginAccount[]): string[] =>
  accounts.filter((a) => plugins.some((p) => p.id === a.pluginId)).map((a) => pluginRoute(a.id))
/** Nom de l'onglet d'un compte de plugin : le plugin, suivi du compte s'il en a plusieurs. */
export function pluginNavLabel(route: string, plugins: InstalledPlugin[], accounts: PluginAccount[]): string {
  const a = accounts.find((x) => x.id === pluginAccountOfRoute(route)), pl = a && plugins.find((p) => p.id === a.pluginId)
  if (!a || !pl) return route
  return accounts.filter((x) => x.pluginId === a.pluginId).length > 1 ? `${pl.manifest.name} · ${a.displayName}` : pl.manifest.name
}
