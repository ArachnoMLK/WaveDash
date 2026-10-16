// Mises à jour automatiques via les Releases GitHub (electron-updater).
// Vérification au démarrage puis toutes les 4 h ; l'installation se fait à la fermeture ou sur demande.
import { app, BrowserWindow, Notification } from 'electron'
import { autoUpdater } from 'electron-updater'
import { UpdateStatus } from '@shared/types'
import { getSettings } from './db'

let status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'dev' }
let send: (s: UpdateStatus) => void = () => {}
const set = (s: UpdateStatus): void => { status = s; send(s) }

export function initUpdater(win: () => BrowserWindow | null): void {
  send = (s) => win()?.webContents.send('update:status', s)
  if (!app.isPackaged) return                       // pas de mise à jour en développement

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }))
  autoUpdater.on('update-available', (i) => set({ state: 'downloading', version: i.version, percent: 0 }))
  autoUpdater.on('update-not-available', () => set({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', version: status.version, percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => {
    set({ state: 'ready', version: i.version })
    new Notification({ title: 'WaveDash', body: `Mise à jour ${i.version} prête : redémarre l'appli pour l'installer.` }).show()
  })
  autoUpdater.on('error', (e) => set({ state: 'error', message: String(e?.message ?? e).slice(0, 200) }))

  const check = (): void => { if (getSettings().autoUpdate) void autoUpdater.checkForUpdates().catch(() => {}) }
  setTimeout(check, 15_000)
  setInterval(check, 4 * 3_600_000)
}

export const getUpdateStatus = (): UpdateStatus => status

export async function checkUpdate(): Promise<void> {
  if (!app.isPackaged) { set({ state: 'dev' }); return }
  try { await autoUpdater.checkForUpdates() } catch { /* l'événement 'error' renseigne l'état */ }
}

export function installUpdate(): void {
  // quitAndInstall déclenche before-quit : la fermeture dans la barre système est alors désactivée.
  // (true, true) : installation silencieuse (pas d'écran d'installateur) puis relance de l'appli.
  // Windows peut encore demander l'autorisation administrateur si WaveDash est installé pour tous les utilisateurs.
  if (status.state === 'ready') autoUpdater.quitAndInstall(true, true)
}
