// Interface shared by all providers: adding a platform = adding a file here.
import { Platform, ProviderResult } from '@shared/types'

export interface ResolvedAccount { externalId: string; displayName: string; avatar?: string }

export interface Provider {
  platform: Platform
  /** Turns what the user entered (link, @handle, ID) into an identified account. */
  resolve(input: string): Promise<ResolvedAccount>
  /** Fetches the current statistics. */
  fetch(externalId: string): Promise<ProviderResult>
}

/** Error codes translated on the interface side (i18n key `err.<code>`). */
export type ErrorCode = 'missing_key' | 'invalid_input' | 'not_found' | 'rate_limit' | 'api' | 'network' | 'unsupported'

export class ProviderError extends Error {
  constructor(public code: ErrorCode, detail?: string) { super(detail ?? code) }
}

/** GET JSON with consistent error handling. */
export async function getJson<T>(url: string): Promise<T> {
  let res: Response
  try { res = await fetch(url, { headers: { Accept: 'application/json' } }) }
  catch { throw new ProviderError('network') }
  if (res.status === 404) throw new ProviderError('not_found')
  if (res.status === 429) throw new ProviderError('rate_limit')
  if (res.status === 401 || res.status === 403) throw new ProviderError('missing_key', 'API key rejected')
  if (!res.ok) throw new ProviderError('api', `HTTP ${res.status}`)
  return (await res.json()) as T
}
