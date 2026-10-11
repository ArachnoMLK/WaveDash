// Pont entre l'interface et le processus principal.
import { app, BrowserWindow, ipcMain } from 'electron'
import os from 'os'
import { AddAccountInput, AddAccountResult, AppInfo, MetricKey, SecretKey, Settings } from '@shared/types'
import * as db from './db'
import { getProvider } from './providers'
import { nextMetrics, seedHistory } from './providers/mock'
import { ProviderError } from './providers/types'
import { refreshAccount, refreshAll, startScheduler } from './scheduler'
import * as secrets from './secrets'
import { applySystemSettings } from './system'

const DEMO_NAMES = { youtube: 'Chaîne démo', brawlhalla: 'Joueur démo', instagram: 'Compte démo', tiktok: 'Compte démo' }

/** Empreinte simple d'un texte : rend les comptes démo différents selon ce qui est saisi. */
const hash = (s: string): number => [...s.trim().toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

async function addAccount(a: AddAccountInput): Promise<AddAccountResult> {
  // Un seul compte par plateforme ; `replace` permet d'en changer sans perdre l'ancien si le nouveau échoue.
  const existing = db.listAccounts().find((x) => x.platform === a.platform)
  if (existing && !a.replace) return { ok: false, error: 'already_added' }
  try {
    const resolved = a.demo
      ? { externalId: `demo-${a.platform}-${hash(a.input)}`, displayName: a.input.trim().slice(0, 40) || DEMO_NAMES[a.platform] }
      : await getProvider(a.platform).resolve(a.input)
    if (existing) db.deleteAccount(existing.id)
    const account = db.insertAccount({ platform: a.platform, input: a.input, demo: !!a.demo, ...resolved })
    if (a.demo) for (const h of seedHistory(a.platform, hash(a.input))) db.insertSnapshots(account.id, h.metrics, h.ts)
    await refreshAccount(account)
    return { ok: true, account: db.getAccount(account.id) }
  } catch (e) {
    return { ok: false, error: e instanceof ProviderError ? e.code : 'api' }
  }
}

export function registerIpc(win: () => BrowserWindow | null): void {
  const notifyUpdated = (): void => win()?.webContents.send('data:updated')
  startScheduler(notifyUpdated)

  ipcMain.handle('app:info', (): AppInfo => ({
    version: app.getVersion(),
    // Mica/Acrylic natifs : Windows 11 22H2 (build 22621) ou plus récent.
    nativeGlass: process.platform === 'win32' && parseInt(os.release().split('.')[2] ?? '0', 10) >= 22621,
    encryptionAvailable: secrets.encryptionAvailable()
  }))
  ipcMain.handle('settings:get', () => db.getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const s = db.setSettings(patch)
    applySystemSettings(s, win())
    if ('refreshMinutes' in patch) startScheduler()
    return s
  })
  ipcMain.handle('accounts:list', () => db.listAccounts())
  ipcMain.handle('accounts:add', async (_e, a: AddAccountInput) => { const r = await addAccount(a); notifyUpdated(); return r })
  ipcMain.handle('accounts:remove', (_e, id: number) => { db.deleteAccount(id); notifyUpdated() })
  ipcMain.handle('data:series', (_e, id: number, metric: MetricKey, since: number) => db.getSeries(id, metric, since))
  ipcMain.handle('data:latest', (_e, id: number) => db.getLatest(id))
  ipcMain.handle('data:items', (_e, id: number) => db.getItems(id))
  ipcMain.handle('data:legends', (_e, id: number) => db.getLegends(id))
  ipcMain.handle('data:refresh', () => refreshAll())
  ipcMain.handle('secret:has', (_e, k: SecretKey) => secrets.hasSecret(k))
  ipcMain.handle('secret:set', (_e, k: SecretKey, v: string) => secrets.setSecret(k, v))
  ipcMain.handle('secret:delete', (_e, k: SecretKey) => secrets.deleteSecret(k))
}
