// Processus principal : fenêtre en verre, barre système, mises à jour, démarrage des services.
import { app, BrowserWindow, Menu, shell, Tray } from 'electron'
import { autoUpdater } from 'electron-updater'
import os from 'os'
import { join } from 'path'
import { getSettings, initDb } from './db'
import { registerIpc } from './ipc'
import { refreshAll } from './scheduler'
import { applySystemSettings } from './system'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

const resource = (f: string): string =>
  join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'resources', f)

function createWindow(): void {
  const s = getSettings()
  const nativeGlass = process.platform === 'win32' && parseInt(os.release().split('.')[2] ?? '0', 10) >= 22621
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 980, minHeight: 640,
    title: 'WaveDash', icon: resource('icon.ico'), show: false,
    // Verre natif Windows 11 ; sur Windows 10 on retombe sur un fond uni (le flou CSS reste actif dans les panneaux).
    backgroundMaterial: nativeGlass ? 'acrylic' : 'none',
    backgroundColor: nativeGlass ? '#00000000' : s.theme === 'dark' ? '#101010' : '#f2f2f2',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: s.theme === 'dark' ? '#e8e8e8' : '#1a1a1a', height: 40 },
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  win.once('ready-to-show', () => win?.show())
  // Après une réduction, certaines configurations (fenêtre translucide) ne repeignent pas le contenu : on force le rendu.
  const repaint = (): void => win?.webContents.invalidate()
  win.on('restore', repaint); win.on('show', repaint); win.on('maximize', repaint); win.on('unmaximize', repaint)
  // Les liens externes s'ouvrent dans le navigateur, jamais dans l'appli.
  win.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' } })
  win.on('close', (e) => {
    if (!quitting && getSettings().closeToTray) { e.preventDefault(); win?.hide() }
  })

  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function createTray(): void {
  tray = new Tray(resource('tray.png'))
  tray.setToolTip('WaveDash')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ouvrir WaveDash', click: () => { win?.show(); win?.focus() } },
    { label: 'Actualiser maintenant', click: () => void refreshAll() },
    { type: 'separator' },
    { label: 'Quitter', click: () => { quitting = true; app.quit() } }
  ]))
  tray.on('click', () => { win?.show(); win?.focus() })
}

// Une seule instance à la fois.
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { win?.show(); win?.focus() })
  app.whenReady().then(() => {
    app.setAppUserModelId('app.wavedash.desktop')   // requis pour les notifications Windows
    initDb()
    createWindow()
    createTray()
    registerIpc(() => win)
    applySystemSettings(getSettings(), win)
    void refreshAll()
    if (app.isPackaged) void autoUpdater.checkForUpdatesAndNotify()
  })
  app.on('before-quit', () => { quitting = true })
  app.on('window-all-closed', () => { /* l'appli reste dans la barre système */ })
}
