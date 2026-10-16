// Données simulées (mode démo) : permet de tester toute l'interface sans clé API.
import { ItemStat, LatestMetrics, MetricKey, Platform, ProviderResult } from '@shared/types'

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BASE: Record<Platform, Partial<Record<MetricKey, number>>> = {
  youtube: { subscribers: 1840, views: 96400, likes: 5200, comments: 410, videos: 42 }
}
const DAY = 86_400_000

/** Valeurs suivantes : petite évolution aléatoire à partir de la dernière valeur connue. */
export function nextMetrics(platform: Platform, last: LatestMetrics, seed = Date.now()): ProviderResult {
  const r = rng(seed)
  const m: ProviderResult['metrics'] = {}
  for (const [k, base] of Object.entries(BASE[platform]) as [MetricKey, number][]) {
    const prev = last[k] ?? base
    m[k] = Math.round(prev + prev * 0.0015 * r() + r() * 3)
  }
  return { metrics: m, items: platform === 'youtube' ? mockItems(seed) : undefined }
}

/** Historique simulé sur 30 jours, pour que les graphiques ne soient pas vides. */
export function seedHistory(platform: Platform, salt = 0): { ts: number; metrics: ProviderResult['metrics'] }[] {
  const out: { ts: number; metrics: ProviderResult['metrics'] }[] = []
  // La graine fait varier l'échelle : chaque compte démo est différent.
  const scale = 0.4 + (salt % 160) / 50
  let last: LatestMetrics = Object.fromEntries(Object.entries(BASE[platform]).map(([k, v]) => [k, (v as number) * 0.9 * scale]))
  const start = Date.now() - 30 * DAY
  for (let d = 0; d < 30; d++) {
    const res = nextMetrics(platform, last, 1000 + d + salt)
    // Évolution journalière un peu plus marquée pour des courbes lisibles.
    for (const k of Object.keys(res.metrics) as MetricKey[]) res.metrics[k] = Math.round((last[k] ?? 0) + (res.metrics[k]! - (last[k] ?? 0)) * 18)
    last = res.metrics
    out.push({ ts: start + d * DAY, metrics: res.metrics })
  }
  return out
}

function mockItems(seed: number): ItemStat[] {
  const r = rng(seed)
  return Array.from({ length: 12 }, (_, i) => {
    const views = Math.round(500 + r() * 14000)
    return { externalId: `demo${i}`, title: `Vidéo démo ${i + 1}`, publishedAt: Date.now() - (i + 1) * 6 * DAY,
      views, likes: Math.round(views * (0.03 + r() * 0.05)), comments: Math.round(views * 0.004 * r()) }
  })
}
