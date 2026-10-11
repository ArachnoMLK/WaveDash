// Pont entre l'interface et le processus principal.
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { extname, join } from 'path'
import { AddAccountInput, AddAccountResult, AppInfo, MetricKey, SecretKey, Settings, ThemeData } from '@shared/types'
import { sanitizeTheme } from '@shared/theme'
import * as db from './db'
import { getProvider } from './providers'
import { nextMetrics, seedHistory } from './providers/mock'
import { ProviderError } from './providers/types'
import { refreshAccount, refreshAll, startScheduler } from './scheduler'
import * as secrets from './secrets'
import { applySystemSettings, hasNativeGlass } from './system'
import { checkUpdate, getUpdateStatus, installUpdate } from './updater'

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
    nativeGlass: hasNativeGlass(),
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
  /* ---------- Image de fond : copiée dans le dossier de l'appli, relue en data URL ---------- */
  const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }
  const dir = (): string => app.getPath('userData')
  const removeBackgrounds = (): void => {
    for (const f of readdirSync(dir())) if (/^background-\d+\.\w+$/.test(f)) unlinkSync(join(dir(), f))
  }
  ipcMain.handle('bg:pick', async () => {
    const opts = { properties: ['openFile' as const], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] }
    const w = win()
    const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    const src = r.filePaths[0]
    if (r.canceled || !src) return { ok: false }
    if (statSync(src).size > 20 * 1024 * 1024) return { ok: false, error: 'too_big' }
    removeBackgrounds()
    const filename = `background-${Date.now()}${extname(src).toLowerCase()}`
    copyFileSync(src, join(dir(), filename))
    return { ok: true, filename }
  })
  ipcMain.handle('bg:get', () => {
    const name = db.getSettings().bgImage
    if (!name || !existsSync(join(dir(), name))) return null
    return `data:${MIME[extname(name).toLowerCase()] ?? 'image/png'};base64,${readFileSync(join(dir(), name)).toString('base64')}`
  })
  ipcMain.handle('bg:clear', () => removeBackgrounds())

  /* ---------- Thèmes : export / import en fichier .wdtheme (JSON validé) ---------- */
  ipcMain.handle('theme:export', async (_e, name: string, theme: ThemeData) => {
    const opts = { defaultPath: `${(name || 'WaveDash').replace(/[^\w .-]/g, '_')}.wdtheme`, filters: [{ name: 'WaveDash theme', extensions: ['wdtheme'] }] }
    const w = win()
    const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return false
    writeFileSync(r.filePath, JSON.stringify({ wavedashTheme: 1, name, theme: sanitizeTheme(theme) }, null, 2))
    return true
  })
  ipcMain.handle('theme:import', async () => {
    const opts = { properties: ['openFile' as const], filters: [{ name: 'WaveDash theme', extensions: ['wdtheme'] }] }
    const w = win()
    const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    const file = r.filePaths[0]
    if (r.canceled || !file) return { ok: false }
    try {
      if (statSync(file).size > 100_000) return { ok: false, error: 'invalid' }
      const json = JSON.parse(readFileSync(file, 'utf8'))
      if (json?.wavedashTheme !== 1) return { ok: false, error: 'invalid' }
      return { ok: true, name: String(json.name ?? 'Thème').slice(0, 40), theme: sanitizeTheme(json.theme) }
    } catch { return { ok: false, error: 'invalid' } }
  })

  /* ---------- Mises à jour ---------- */
  ipcMain.handle('update:check', () => checkUpdate())
  ipcMain.handle('update:install', () => installUpdate())
  ipcMain.handle('update:status', () => getUpdateStatus())

  ipcMain.handle('secret:has', (_e, k: SecretKey) => secrets.hasSecret(k))
  ipcMain.handle('secret:set', (_e, k: SecretKey, v: string) => secrets.setSecret(k, v))
  ipcMain.handle('secret:delete', (_e, k: SecretKey) => secrets.deleteSecret(k))
}
