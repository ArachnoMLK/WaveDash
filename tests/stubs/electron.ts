// Remplace le module electron pendant les tests : un dossier temporaire tient lieu de dossier de l'appli.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = mkdtempSync(join(tmpdir(), 'wavedash-test-'))
export const app = {
  getPath: (_name: string): string => base,
  getVersion: (): string => '1.0.0',
  getAppPath: (): string => process.env.WAVEDASH_ROOT ?? process.cwd(),
  isPackaged: false
}
export const safeStorage = {
  isEncryptionAvailable: (): boolean => true,
  encryptString: (s: string): Buffer => Buffer.from(s, 'utf8'),
  decryptString: (b: Buffer): string => b.toString('utf8')
}
export const utilityProcess = { fork: (): never => { throw new Error('pas de processus utilitaire en test') } }
export const Notification = class { static isSupported(): boolean { return false } show(): void {} on(): void {} }
export default { app, safeStorage, utilityProcess, Notification }
