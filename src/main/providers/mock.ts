// Données simulées (mode démo) : permet de tester toute l'interface sans clé API.
import { ItemStat, LatestMetrics, LegendStat, MetricKey, Platform, ProviderResult } from '@shared/types'

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
  youtube: { subscribers: 1840, views: 96400, likes: 5200, comments: 410, videos: 42 },
  instagram: { subscribers: 2300, likes: 8800, comments: 640 },
  tiktok: { subscribers: 5100, views: 210000, likes: 31000 },
  brawlhalla: { elo_1v1: 1420, peak_1v1: 1510, elo_2v2: 1380, games: 1260, wins: 668, level: 87, global_rank: 48210, region_rank: 4120 }
}
const DAY = 86_400_000

/** Valeurs suivantes : petite évolution aléatoire à partir de la dernière valeur connue. */
export function nextMetrics(platform: Platform, last: LatestMetrics, seed = Date.now()): ProviderResult {
  const r = rng(seed)
  const m: ProviderResult['metrics'] = {}
  for (const [k, base] of Object.entries(BASE[platform]) as [MetricKey, number][]) {
    const prev = last[k] ?? base
    if (k.startsWith('elo') || k === 'peak_1v1') m[k] = Math.round(prev + (r() - 0.48) * 22)
    else if (k === 'level') m[k] = prev + (r() < 0.02 ? 1 : 0)
    else if (k.endsWith('rank')) m[k] = Math.max(1, Math.round(prev - (r() - 0.45) * 160))
    else m[k] = Math.round(prev + prev * 0.0015 * r() + r() * 3)
  }
  if (platform === 'brawlhalla') {
    m.peak_1v1 = Math.max(m.peak_1v1 ?? 0, m.elo_1v1 ?? 0)
    m.winrate = m.games ? ((m.wins ?? 0) / m.games) * 100 : 0
  }
  return { metrics: m, items: platform === 'youtube' ? mockItems(seed) : undefined, legends: platform === 'brawlhalla' ? mockLegends(seed) : undefined,
    extra: platform === 'brawlhalla' ? { tier: 'Gold 2', region: 'EU' } : undefined }
}

/** Historique simulé sur 30 jours, pour que les graphiques ne soient pas vides. */
export function seedHistory(platform: Platform, salt = 0): { ts: number; metrics: ProviderResult['metrics'] }[] {
  const out: { ts: number; metrics: ProviderResult['metrics'] }[] = []
  // La graine fait varier l'échelle (compteurs) et le niveau (ELO) : chaque compte démo est différent.
  const scale = 0.4 + (salt % 160) / 50, eloShift = (salt % 700) - 350
  let last: LatestMetrics = Object.fromEntries(Object.entries(BASE[platform]).map(([k, v]) => {
    const n = v as number
    return [k, k.startsWith('elo') || k === 'peak_1v1' ? n + eloShift : k === 'level' || k.endsWith('rank') ? n : n * 0.9 * scale]
  }))
  const start = Date.now() - 30 * DAY
  for (let d = 0; d < 30; d++) {
    const res = nextMetrics(platform, last, 1000 + d + salt)
    // Évolution journalière un peu plus marquée pour des courbes lisibles.
    for (const k of Object.keys(res.metrics) as MetricKey[]) {
      if (!k.startsWith('elo') && k !== 'level' && !k.endsWith('rank') && k !== 'winrate' && k !== 'peak_1v1') res.metrics[k] = Math.round((last[k] ?? 0) + (res.metrics[k]! - (last[k] ?? 0)) * 18)
    }
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

const LEGENDS = ['Bödvar', 'Cassidy', 'Orion', 'Hattori', 'Mirage', 'Ada', 'Val', 'Thatch', 'Kor', 'Jhala']
function mockLegends(seed: number): LegendStat[] {
  const r = rng(seed >> 4)   // varie peu entre deux actualisations
  return LEGENDS.map((name, i) => {
    const games = Math.round(40 + r() * 260 * (1 - i / 14))
    return { legendId: i + 1, name, games, wins: Math.round(games * (0.42 + r() * 0.2)), kos: Math.round(games * (2 + r() * 3)),
      falls: Math.round(games * (2 + r() * 2)), damageDealt: Math.round(games * (900 + r() * 700)),
      matchTimeSec: Math.round(games * (230 + r() * 80)), level: Math.round(10 + r() * 60) }
  })
}
