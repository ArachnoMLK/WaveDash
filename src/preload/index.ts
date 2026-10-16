// Pont sécurisé : expose uniquement les fonctions nécessaires à l'interface.
import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import type { MilestoneEvent, UpdateStatus } from '@shared/types'
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
  pluginsList: () => ipcRenderer.invoke('plugins:list'),
  pluginsBundled: () => ipcRenderer.invoke('plugins:bundled'),
  pluginsCatalog: (force) => ipcRenderer.invoke('plugins:catalog', force),
  pluginsCatalogFetch: (id) => ipcRenderer.invoke('plugins:catalogFetch', id),
  pluginAccountsList: () => ipcRenderer.invoke('plugins:accounts'),
  pluginsPickPackage: () => ipcRenderer.invoke('plugins:pickPackage'),
  pluginsInspect: (path) => ipcRenderer.invoke('plugins:inspect', path),
  pluginsInstall: (token) => ipcRenderer.invoke('plugins:install', token),
  pluginsSetEnabled: (id, enabled) => ipcRenderer.invoke('plugins:setEnabled', id, enabled),
  pluginsUninstall: (id) => ipcRenderer.invoke('plugins:uninstall', id),
  pluginAccountAdd: (id, inputs) => ipcRenderer.invoke('plugins:accountAdd', id, inputs),
  pluginAccountRemove: (id) => ipcRenderer.invoke('plugins:accountRemove', id),
  pluginAccountRefresh: (id) => ipcRenderer.invoke('plugins:accountRefresh', id),
  pluginAccountData: (id) => ipcRenderer.invoke('plugins:accountData', id),
  pluginAccountItems: (id, offset, limit, month, sortKey, desc, query) => ipcRenderer.invoke('plugins:accountItems', id, offset, limit, month, sortKey, desc, query),
  pluginSecretSet: (id, key, value) => ipcRenderer.invoke('plugins:secretSet', id, key, value),
  pluginSecretDelete: (id, key) => ipcRenderer.invoke('plugins:secretDelete', id, key),
  pickFolder: () => ipcRenderer.invoke('plugins:pickFolder'),
  pluginImportFiles: (id, exts) => ipcRenderer.invoke('plugins:importFiles', id, exts),
  pathForFile: (file) => webUtils.getPathForFile(file),
  takePendingPluginFile: () => ipcRenderer.invoke('plugins:takePendingFile'),
  onPluginFile: (cb) => {
    const h = (_e: unknown, p: string): void => cb(p)
    ipcRenderer.on('plugin:file', h)
    return () => ipcRenderer.removeListener('plugin:file', h)
  },
  reloadSettings: () => ipcRenderer.invoke('settings:get'),
  getMilestoneEvents: (limit) => ipcRenderer.invoke('milestones:events', limit),
  testNotification: () => ipcRenderer.invoke('notify:test'),
  onMilestone: (cb) => {
    const h = (_e: unknown, ev: MilestoneEvent): void => cb(ev)
    ipcRenderer.on('milestone:fired', h)
    return () => ipcRenderer.removeListener('milestone:fired', h)
  },
  exportData: (format) => ipcRenderer.invoke('export:data', format),
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  importBackup: () => ipcRenderer.invoke('backup:import'),
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
