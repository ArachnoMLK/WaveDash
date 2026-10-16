import { Lang, MetricKey } from '@shared/types'

const locale = (l: Lang): string => (l === 'fr' ? 'fr-FR' : 'en-US')

export const fmt = (n: number, l: Lang, digits = 0): string =>
  new Intl.NumberFormat(locale(l), { maximumFractionDigits: digits }).format(n)

export const compact = (n: number, l: Lang): string =>
  new Intl.NumberFormat(locale(l), { notation: 'compact', maximumFractionDigits: 1 }).format(n)

/** Formate la valeur d'une métrique (forme compacte au-delà de 100 000). */
export function fmtMetric(_k: MetricKey, v: number, l: Lang): string {
  return v >= 100_000 ? compact(v, l) : fmt(v, l)
}

export function fmtDelta(v: number, l: Lang, digits = 0): string {
  const s = fmt(Math.abs(v), l, digits)
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s
}

export function ago(ts: number | null, l: Lang, never: string): string {
  if (!ts) return never
  const diffMin = Math.round((ts - Date.now()) / 60_000)
  const rtf = new Intl.RelativeTimeFormat(locale(l), { numeric: 'auto' })
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute')
  if (Math.abs(diffMin) < 1440) return rtf.format(Math.round(diffMin / 60), 'hour')
  return rtf.format(Math.round(diffMin / 1440), 'day')
}
