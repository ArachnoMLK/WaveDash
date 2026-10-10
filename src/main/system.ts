// Réglages liés à Windows : thème natif, démarrage automatique.
import { app, BrowserWindow, nativeTheme } from 'electron'
import { Settings } from '@shared/types'

export function applySystemSettings(s: Settings, win: BrowserWindow | null): void {
  // Le thème natif pilote la couleur du matériau Mica/Acrylic et des boutons de fenêtre.
  nativeTheme.themeSource = s.theme
  if (win && process.platform === 'win32') {
    win.setTitleBarOverlay({ color: '#00000000', symbolColor: s.theme === 'dark' ? '#e8e8e8' : '#1a1a1a', height: 40 })
  }
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: s.startWithWindows })
}
