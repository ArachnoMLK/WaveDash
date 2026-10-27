// Secret vault: encryption through Windows DPAPI (Electron's safeStorage).
// Secrets never leave the main process: the interface can only write / test for presence.
import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { SecretKey } from '@shared/types'

/** Key of a plugin secret: `plugin:<pluginId>:<key>`. */
export type PluginSecretKey = `plugin:${string}:${string}`
type AnyKey = SecretKey | PluginSecretKey

const file = (): string => join(app.getPath('userData'), 'secrets.json')

function load(): Record<string, string> {
  try { return existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : {} } catch { return {} }
}

export const encryptionAvailable = (): boolean => safeStorage.isEncryptionAvailable()

export function setSecret(key: AnyKey, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('System encryption is not available.')
  const data = load()
  data[key] = safeStorage.encryptString(value.trim()).toString('base64')
  writeFileSync(file(), JSON.stringify(data), { mode: 0o600 })
}

export function getSecret(key: AnyKey): string | null {
  const enc = load()[key]
  if (!enc) return null
  try { return safeStorage.decryptString(Buffer.from(enc, 'base64')) } catch { return null }
}

export const hasSecret = (key: AnyKey): boolean => !!load()[key]

export function deleteSecret(key: AnyKey): void {
  const data = load(); delete data[key]
  writeFileSync(file(), JSON.stringify(data), { mode: 0o600 })
}
