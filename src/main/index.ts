// Main process: glass window, system tray, updates, service startup.
import { app, BrowserWindow, Menu, screen, shell, Tray } from 'electron'
import { join } from 'path'
import { getSettings, initDb } from './db'
import { registerIpc } from './ipc'
import { refreshAll } from './scheduler'
import { applySystemSettings, materialFor, solidBackground } from './system'
import { setPendingFile, syncBundledPlugins } from './plugins/manager'
import { initUpdater } from './updater'
import { stopPluginHost } from './plugins/isolated'
import { languageDefaults, migrateBuiltinBrawlhalla, removeSocialPlaceholders } from './migrations'
import { registerStudio, registerStudioScheme, stopStudio } from './studio'

registerStudioScheme()

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
    // Native Windows 11 material picked in the settings; otherwise a solid background (the CSS blur of the panels stays independent).
    backgroundMaterial: material,
    backgroundColor: material !== 'none' ? '#00000000' : solidBackground(s),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: s.theme === 'dark' ? '#e8e8e8' : '#1a1a1a', height: 40 },
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  win.once('ready-to-show', () => win?.show())
  // After a minimize, some setups (translucent window) do not repaint the content: force a render.
  const repaint = (): void => win?.webContents.invalidate()
  win.on('restore', repaint); win.on('show', repaint); win.on('maximize', repaint); win.on('unmaximize', repaint)
  // Windows makes the material (Mica/Acrylic) of a maximized window opaque. "See the desktop in full screen" option:
  // the window then fills the whole work area without being maximized; maximizing again restores the previous size.
  let before: Electron.Rectangle | null = null
  win.on('maximize', () => {
    const w = win, cur = getSettings()
    if (!w || !cur.seeThroughMaximized || materialFor(cur) === 'none') return
    const normal = w.getNormalBounds(), area = screen.getDisplayMatching(normal).workArea
    const filled = normal.x === area.x && normal.y === area.y && normal.width === area.width && normal.height === area.height
    const target = filled ? before : area
    before = filled ? null : normal
    w.unmaximize()
    // Windows restores the previous size right after leaving the maximized state: resize afterwards.
    if (target) setTimeout(() => { if (!w.isDestroyed() && !w.isMaximized()) w.setBounds(target) }, 60)
  })
  // External links open in the browser, never in the app.
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

/** Path of a .wdsh file passed as an argument (double-click in Explorer). */
const wdshArg = (argv: string[]): string | undefined => argv.find((a) => a.toLowerCase().endsWith('.wdsh') && !a.startsWith('--'))

// Only one instance at a time.
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', (_e, argv) => {
    const f = wdshArg(argv)
    if (f) win?.webContents.send('plugin:file', f)
    win?.show(); win?.focus()
  })
  app.whenReady().then(() => {
    app.setAppUserModelId('app.wavedash.desktop')   // required for Windows notifications
    initDb()
    try { const up = syncBundledPlugins(); if (up.length) console.log('Plugins updated:', up.join(', ')) } catch (e) { console.error('Bundled plugins:', e) }
    try { languageDefaults(app.getPreferredSystemLanguages()); migrateBuiltinBrawlhalla(); removeSocialPlaceholders() } catch (e) { console.error('Migrations:', e) }
    createWindow()
    createTray()
    registerIpc(() => win)
    registerStudio(() => win)
    setPendingFile(wdshArg(process.argv) ?? null)
    applySystemSettings(getSettings(), win)
    void refreshAll()
    initUpdater(() => win)
  })
  app.on('before-quit', () => { quitting = true; stopPluginHost(); stopStudio() })
  app.on('window-all-closed', () => { /* the app stays in the system tray */ })
}
