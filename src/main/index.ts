// Processus principal : fenêtre en verre, barre système, mises à jour, démarrage des services.
import { app, BrowserWindow, Menu, shell, Tray } from 'electron'
import { join } from 'path'
import { getSettings, initDb } from './db'
import { registerIpc } from './ipc'
import { refreshAll } from './scheduler'
import { applySystemSettings, materialFor, solidBackground } from './system'
import { setPendingFile, syncBundledPlugins } from './plugins/manager'
import { initUpdater } from './updater'
import { stopPluginHost } from './plugins/isolated'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

const resource = (f: string): string =>
  join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'resources', f)

function createWindow(): void {
  const s = getSettings()
  const material = materialFor(s)
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 980, minHeight: 640,
    title: 'WaveDash', icon: resource('icon.ico'), show: false,
    // Matériau natif Windows 11 choisi dans les réglages ; sinon fond uni (le flou CSS des panneaux reste indépendant).
    backgroundMaterial: material,
    backgroundColor: material !== 'none' ? '#00000000' : solidBackground(s),
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

/** Chemin d'un fichier .wdsh passé en argument (double-clic dans l'Explorateur). */
const wdshArg = (argv: string[]): string | undefined => argv.find((a) => a.toLowerCase().endsWith('.wdsh') && !a.startsWith('--'))

// Une seule instance à la fois.
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', (_e, argv) => {
    const f = wdshArg(argv)
    if (f) win?.webContents.send('plugin:file', f)
    win?.show(); win?.focus()
  })
  app.whenReady().then(() => {
    app.setAppUserModelId('app.wavedash.desktop')   // requis pour les notifications Windows
    initDb()
    try { const up = syncBundledPlugins(); if (up.length) console.log('Plugins mis à jour :', up.join(', ')) } catch (e) { console.error('Plugins fournis :', e) }
    createWindow()
    createTray()
    registerIpc(() => win)
    setPendingFile(wdshArg(process.argv) ?? null)
    applySystemSettings(getSettings(), win)
    void refreshAll()
    initUpdater(() => win)
  })
  app.on('before-quit', () => { quitting = true; stopPluginHost() })
  app.on('window-all-closed', () => { /* l'appli reste dans la barre système */ })
}
