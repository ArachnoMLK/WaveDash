import { Platform } from '@shared/types'
import { Provider, ProviderError } from './types'
import { youtube } from './youtube'

const REGISTRY: Partial<Record<Platform, Provider>> = { youtube }

export function getProvider(platform: Platform): Provider {
  const p = REGISTRY[platform]
  if (!p) throw new ProviderError('unsupported')
  return p
}
