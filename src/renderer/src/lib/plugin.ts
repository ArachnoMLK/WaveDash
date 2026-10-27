import { InstalledPlugin, PluginAccount, PluginMetric } from '@shared/plugin'
import { Lang, localeOf } from '@shared/types'

/** Formats a plugin metric value according to its manifest (number, percentage, rank, duration). */
export function fmtPluginMetric(m: PluginMetric, v: number, lang: Lang): string {
  const nf = (n: number, d: number): string =>
    new Intl.NumberFormat(localeOf(lang), { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
  if (m.format === 'percent') return `${nf(v, m.decimals)} %`
  if (m.format === 'rank') return `#${nf(v, 0)}`
  if (m.format === 'duration') {
    const s = Math.max(0, Math.round(v)), h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = s % 60
    return h ? `${h}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}` : `${mi}:${String(se).padStart(2, '0')}`
  }
  return `${nf(v, m.decimals)}${m.unit ? ' ' + m.unit : ''}`
}

/** Route of a plugin account page. */
export const pluginRoute = (accountId: number): string => `plugin:${accountId}`
export const pluginAccountOfRoute = (route: string): number | null => (route.startsWith('plugin:') ? Number(route.slice(7)) || null : null)
/** Tabs of installed plugin accounts, in creation order. */
export const pluginNavIds = (plugins: InstalledPlugin[], accounts: PluginAccount[]): string[] =>
  accounts.filter((a) => plugins.some((p) => p.id === a.pluginId)).map((a) => pluginRoute(a.id))
/** Tab name of a plugin account: the plugin, followed by the account if it has several. */
export function pluginNavLabel(route: string, plugins: InstalledPlugin[], accounts: PluginAccount[]): string {
  const a = accounts.find((x) => x.id === pluginAccountOfRoute(route)), pl = a && plugins.find((p) => p.id === a.pluginId)
  if (!a || !pl) return route
  return accounts.filter((x) => x.pluginId === a.pluginId).length > 1 ? `${pl.manifest.name} · ${a.displayName}` : pl.manifest.name
}
