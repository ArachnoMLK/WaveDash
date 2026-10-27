// Automatic updates through GitHub Releases (electron-updater).
// Check at startup then every 4 h; installing happens on close or on demand.
import { app, BrowserWindow, Notification } from 'electron'
import { autoUpdater } from 'electron-updater'
import { UpdateStatus } from '@shared/types'
import { getSettings } from './db'
import { UPDATE_READY } from '@shared/labels'

let status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'dev' }
let send: (s: UpdateStatus) => void = () => {}
const set = (s: UpdateStatus): void => { status = s; send(s) }

export function initUpdater(win: () => BrowserWindow | null): void {
  send = (s) => win()?.webContents.send('update:status', s)
  if (!app.isPackaged) return                       // no updates in development

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }))
  autoUpdater.on('update-available', (i) => set({ state: 'downloading', version: i.version, percent: 0 }))
  autoUpdater.on('update-not-available', () => set({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', version: status.version, percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => {
    set({ state: 'ready', version: i.version })
    new Notification({ title: 'WaveDash', body: (UPDATE_READY[getSettings().lang] ?? UPDATE_READY.en).replace('{version}', i.version) }).show()
  })
  autoUpdater.on('error', (e) => set({ state: 'error', message: String(e?.message ?? e).slice(0, 200) }))

  const check = (): void => { if (getSettings().autoUpdate) void autoUpdater.checkForUpdates().catch(() => {}) }
  setTimeout(check, 15_000)
  setInterval(check, 4 * 3_600_000)
}

export const getUpdateStatus = (): UpdateStatus => status

export async function checkUpdate(): Promise<void> {
  if (!app.isPackaged) { set({ state: 'dev' }); return }
  try { await autoUpdater.checkForUpdates() } catch { /* the 'error' event reports the state */ }
}

export function installUpdate(): void {
  // quitAndInstall triggers before-quit: closing to the system tray is then disabled.
  // (true, true): silent install (no installer screen) then app restart.
  // Windows may still ask for administrator permission if WaveDash is installed for all users.
  if (status.state === 'ready') autoUpdater.quitAndInstall(true, true)
}
