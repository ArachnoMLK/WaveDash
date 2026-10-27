// Windows-related settings: native theme, window material (Mica/Acrylic), launch at startup.
import { app, BrowserWindow, nativeTheme } from 'electron'
import os from 'os'
import { Settings } from '@shared/types'

/** Native Mica/Acrylic: Windows 11 22H2 (build 22621) or newer. */
export const hasNativeGlass = (): boolean =>
  process.platform === 'win32' && parseInt(os.release().split('.')[2] ?? '0', 10) >= 22621

/** Material actually applied to the window according to the settings. */
export const materialFor = (s: Settings): 'none' | 'mica' | 'acrylic' =>
  hasNativeGlass() && s.glassEnabled ? s.nativeMaterial : 'none'

export const solidBackground = (s: Settings): string => (s.theme === 'dark' ? '#0d0d0d' : '#efefef')

export function applySystemSettings(s: Settings, win: BrowserWindow | null): void {
  // The native theme drives the colour of the material and of the window buttons.
  nativeTheme.themeSource = s.theme
  if (win && process.platform === 'win32') {
    win.setTitleBarOverlay({ color: '#00000000', symbolColor: s.theme === 'dark' ? '#e8e8e8' : '#1a1a1a', height: 40 })
    if (hasNativeGlass()) {
      const mat = materialFor(s)
      win.setBackgroundMaterial(mat)
      win.setBackgroundColor(mat === 'none' ? solidBackground(s) : '#00000000')
    }
  }
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: s.startWithWindows })
}
