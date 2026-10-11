// Pont sécurisé : expose uniquement les fonctions nécessaires à l'interface.
import { contextBridge, ipcRenderer, webFrame } from 'electron'
import type { UpdateStatus } from '@shared/types'
import type { WaveApi } from '@shared/types'

const api: WaveApi = {
  appInfo: () => ipcRenderer.invoke('app:info'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (p) => ipcRenderer.invoke('settings:set', p),
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  addAccount: (a) => ipcRenderer.invoke('accounts:add', a),
  removeAccount: (id) => ipcRenderer.invoke('accounts:remove', id),
  getSeries: (id, m, since) => ipcRenderer.invoke('data:series', id, m, since),
  getLatest: (id) => ipcRenderer.invoke('data:latest', id),
  getItems: (id) => ipcRenderer.invoke('data:items', id),
  getLegends: (id) => ipcRenderer.invoke('data:legends', id),
  refreshNow: () => ipcRenderer.invoke('data:refresh'),
  hasSecret: (k) => ipcRenderer.invoke('secret:has', k),
  setSecret: (k, v) => ipcRenderer.invoke('secret:set', k, v),
  deleteSecret: (k) => ipcRenderer.invoke('secret:delete', k),
  setZoom: (f) => webFrame.setZoomFactor(f),
  pickBackground: () => ipcRenderer.invoke('bg:pick'),
  getBackground: () => ipcRenderer.invoke('bg:get'),
  clearBackground: () => ipcRenderer.invoke('bg:clear'),
  exportTheme: (name, theme) => ipcRenderer.invoke('theme:export', name, theme),
  importTheme: () => ipcRenderer.invoke('theme:import'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  onUpdateStatus: (cb) => {
    const h = (_e: unknown, s: UpdateStatus): void => cb(s)
    ipcRenderer.on('update:status', h)
    return () => ipcRenderer.removeListener('update:status', h)
  },
  onDataUpdated: (cb) => {
    const h = (): void => cb()
    ipcRenderer.on('data:updated', h)
    return () => ipcRenderer.removeListener('data:updated', h)
  }
}
contextBridge.exposeInMainWorld('api', api)
