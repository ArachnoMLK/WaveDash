import { Platform } from '@shared/types'
import { Provider, ProviderError } from './types'
import { youtube } from './youtube'

// Instagram et TikTok arrivent aux étapes 3 et 4 : ils signalent clairement qu'ils ne sont pas encore disponibles.
const REGISTRY: Partial<Record<Platform, Provider>> = { youtube }

export function getProvider(platform: Platform): Provider {
  const p = REGISTRY[platform]
  if (!p) throw new ProviderError('unsupported')
  return p
}
