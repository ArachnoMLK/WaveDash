// YouTube Data API v3 (clé API gratuite). Statistiques publiques uniquement.
// Quota : ~4 unités par actualisation sur 10 000/jour.
import { ItemStat, ProviderResult } from '@shared/types'
import { getSecret } from '../secrets'
import { getJson, Provider, ProviderError, ResolvedAccount } from './types'

const BASE = 'https://www.googleapis.com/youtube/v3'

const key = (): string => {
  const k = getSecret('youtube.apiKey')
  if (!k) throw new ProviderError('missing_key', 'youtube')
  return k
}

/** Extrait un identifiant exploitable depuis un lien, un @handle ou un ID de chaîne. */
function parseInput(raw: string): { kind: 'id' | 'handle' | 'username'; value: string } {
  const s = raw.trim()
  if (/^UC[\w-]{20,}$/.test(s)) return { kind: 'id', value: s }
  if (s.startsWith('@')) return { kind: 'handle', value: s }
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`)
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0]?.startsWith('@')) return { kind: 'handle', value: parts[0] }
    if (parts[0] === 'channel' && parts[1]) return { kind: 'id', value: parts[1] }
    if (parts[0] === 'user' && parts[1]) return { kind: 'username', value: parts[1] }
    if (parts[0] === 'c' && parts[1]) return { kind: 'handle', value: `@${parts[1]}` }
  } catch { /* on retombe sur l'erreur ci-dessous */ }
  throw new ProviderError('invalid_input')
}

interface ChannelsResponse { items?: { id: string; snippet?: { title: string; thumbnails?: { default?: { url: string } } };
  statistics?: Record<string, string>; contentDetails?: { relatedPlaylists: { uploads: string } } }[] }

export const youtube: Provider = {
  platform: 'youtube',

  async resolve(input): Promise<ResolvedAccount> {
    const p = parseInput(input)
    const param = p.kind === 'id' ? `id=${p.value}` : p.kind === 'handle' ? `forHandle=${encodeURIComponent(p.value)}` : `forUsername=${encodeURIComponent(p.value)}`
    const data = await getJson<ChannelsResponse>(`${BASE}/channels?part=snippet&${param}&key=${key()}`)
    const ch = data.items?.[0]
    if (!ch) throw new ProviderError('not_found')
    return { externalId: ch.id, displayName: ch.snippet?.title ?? ch.id, avatar: ch.snippet?.thumbnails?.default?.url }
  },

  async fetch(channelId): Promise<ProviderResult> {
    const k = key()
    const data = await getJson<ChannelsResponse>(`${BASE}/channels?part=statistics,contentDetails&id=${channelId}&key=${k}`)
    const ch = data.items?.[0]
    if (!ch?.statistics) throw new ProviderError('not_found')
    const metrics: ProviderResult['metrics'] = {
      subscribers: Number(ch.statistics.subscriberCount ?? 0),
      views: Number(ch.statistics.viewCount ?? 0),
      videos: Number(ch.statistics.videoCount ?? 0)
    }

    // Likes et commentaires : somme sur les 50 dernières vidéos (l'API ne fournit pas de total de chaîne).
    const items: ItemStat[] = []
    const uploads = ch.contentDetails?.relatedPlaylists.uploads
    if (uploads) {
      const pl = await getJson<{ items?: { contentDetails: { videoId: string } }[] }>(
        `${BASE}/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}&key=${k}`)
      const ids = (pl.items ?? []).map((i) => i.contentDetails.videoId)
      if (ids.length) {
        const vids = await getJson<{ items?: { id: string; snippet: { title: string; publishedAt: string }; statistics: Record<string, string> }[] }>(
          `${BASE}/videos?part=snippet,statistics&id=${ids.join(',')}&key=${k}`)
        for (const v of vids.items ?? []) items.push({
          externalId: v.id, title: v.snippet.title, publishedAt: Date.parse(v.snippet.publishedAt),
          views: Number(v.statistics.viewCount ?? 0), likes: Number(v.statistics.likeCount ?? 0), comments: Number(v.statistics.commentCount ?? 0)
        })
      }
    }
    metrics.likes = items.reduce((a, i) => a + i.likes, 0)
    metrics.comments = items.reduce((a, i) => a + i.comments, 0)
    return { metrics, items }
  }
}
