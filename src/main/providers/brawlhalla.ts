// API officielle Brawlhalla (clé personnelle demandée à Blue Mammoth Games).
// Endpoints utilisés : /search (Steam ID → ID Brawlhalla), /player/{id}/stats, /player/{id}/ranked.
import { LegendStat, ProviderResult } from '@shared/types'
import { getSecret } from '../secrets'
import { getJson, Provider, ProviderError, ResolvedAccount } from './types'

const BASE = 'https://api.brawlhalla.com'

const key = (): string => {
  const k = getSecret('brawlhalla.apiKey')
  if (!k) throw new ProviderError('missing_key', 'brawlhalla')
  return k
}

/** L'API renvoie parfois des nombres sous forme de chaînes. */
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

/** Accepte : ID Brawlhalla (chiffres), Steam ID64 (7656…) ou lien steamcommunity.com/profiles/<id>. */
function parseInput(raw: string): { steamId?: string; brawlhallaId?: string } {
  const s = raw.trim()
  const fromUrl = s.match(/steamcommunity\.com\/profiles\/(\d{17})/)
  const digits = fromUrl?.[1] ?? (/^\d+$/.test(s) ? s : undefined)
  if (!digits) throw new ProviderError('invalid_input')   // les liens « vanity » Steam ne sont pas résolus
  return digits.length === 17 && digits.startsWith('7656') ? { steamId: digits } : { brawlhallaId: digits }
}

export const brawlhalla: Provider = {
  platform: 'brawlhalla',

  async resolve(input): Promise<ResolvedAccount> {
    const k = key()
    const p = parseInput(input)
    let id = p.brawlhallaId
    if (p.steamId) {
      const r = await getJson<{ brawlhalla_id?: number }>(`${BASE}/search?steamid=${p.steamId}&api_key=${k}`)
      if (!r.brawlhalla_id) throw new ProviderError('not_found')
      id = String(r.brawlhalla_id)
    }
    const stats = await getJson<{ name?: string }>(`${BASE}/player/${id}/stats?api_key=${k}`)
    if (!stats.name) throw new ProviderError('not_found')
    return { externalId: id!, displayName: stats.name }
  },

  async fetch(id): Promise<ProviderResult> {
    const k = key()
    const [stats, ranked] = await Promise.all([
      getJson<any>(`${BASE}/player/${id}/stats?api_key=${k}`),
      getJson<any>(`${BASE}/player/${id}/ranked?api_key=${k}`)
    ])
    const games = num(stats.games), wins = num(stats.wins)
    const metrics: ProviderResult['metrics'] = {
      games, wins, winrate: games ? (wins / games) * 100 : 0, level: num(stats.level)
    }
    // Un joueur jamais classé renvoie un tableau vide à la place de l'objet.
    if (ranked && !Array.isArray(ranked)) {
      metrics.elo_1v1 = num(ranked.rating)
      metrics.peak_1v1 = num(ranked.peak_rating)
      metrics.global_rank = num(ranked.global_rank)
      metrics.region_rank = num(ranked.region_rank)
      const teams: any[] = ranked['2v2'] ?? []
      if (teams.length) metrics.elo_2v2 = Math.max(...teams.map((t) => num(t.rating)))
    }
    const legends: LegendStat[] = (stats.legends ?? []).map((l: any) => ({
      legendId: num(l.legend_id), name: String(l.legend_name_key ?? l.legend_id),
      games: num(l.games), wins: num(l.wins), kos: num(l.kos), falls: num(l.falls),
      damageDealt: num(l.damagedealt), matchTimeSec: num(l.matchtime), level: num(l.level)
    }))
    return { metrics, legends, extra: { tier: ranked?.tier, region: ranked?.region } }
  }
}
