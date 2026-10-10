// Interface commune à tous les fournisseurs : ajouter une plateforme = ajouter un fichier ici.
import { Platform, ProviderResult } from '@shared/types'

export interface ResolvedAccount { externalId: string; displayName: string; avatar?: string }

export interface Provider {
  platform: Platform
  /** Transforme ce que l'utilisateur a saisi (lien, @handle, ID) en compte identifié. */
  resolve(input: string): Promise<ResolvedAccount>
  /** Récupère les statistiques actuelles. */
  fetch(externalId: string): Promise<ProviderResult>
}

/** Codes d'erreur traduits côté interface (clé i18n `err.<code>`). */
export type ErrorCode = 'missing_key' | 'invalid_input' | 'not_found' | 'rate_limit' | 'api' | 'network' | 'unsupported'

export class ProviderError extends Error {
  constructor(public code: ErrorCode, detail?: string) { super(detail ?? code) }
}

/** GET JSON avec gestion d'erreurs homogène. */
export async function getJson<T>(url: string): Promise<T> {
  let res: Response
  try { res = await fetch(url, { headers: { Accept: 'application/json' } }) }
  catch { throw new ProviderError('network') }
  if (res.status === 404) throw new ProviderError('not_found')
  if (res.status === 429) throw new ProviderError('rate_limit')
  if (res.status === 401 || res.status === 403) throw new ProviderError('missing_key', 'Clé API refusée')
  if (!res.ok) throw new ProviderError('api', `HTTP ${res.status}`)
  return (await res.json()) as T
}
