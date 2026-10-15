// Gestion des plugins : installation (bouton ou glisser-déposer), comptes, clés, activation, désinstallation.
import { useState } from 'react'
import { InstalledPlugin, loc } from '@shared/plugin'
import { PermissionList, PluginInstallDialog } from '../components/PluginInstallDialog'
import { PluginAccountDialog } from '../components/PluginAccountDialog'
import { Reveal, Switch } from '../components/ui'
import { useApp } from '../lib/AppContext'

function SecretRow({ plugin, secretKey }: { plugin: InstalledPlugin; secretKey: string }): JSX.Element {
  const { t, settings, info, reloadPlugins } = useApp()
  const [value, setValue] = useState('')
  const def = plugin.manifest.secrets.find((s) => s.key === secretKey)!
  const has = plugin.secretsSet.includes(secretKey)
  return (
    <div style={{ marginTop: 10 }}>
      <div className="row between"><span className="small">{loc(def.label, settings.lang)}</span>
        <span className="row" style={{ gap: 8 }}>
          <span className="badge">{has ? t('settings.saved') : t('settings.notSet')}</span>
          {has && <button className="btn small" onClick={() => void window.api.pluginSecretDelete(plugin.id, secretKey).then(reloadPlugins)}>{t('settings.remove')}</button>}
        </span></div>
      {def.help && <div className="muted small" style={{ marginTop: 3 }}>{loc(def.help, settings.lang)}</div>}
      <div className="row" style={{ marginTop: 6 }}>
        <input type="password" value={value} placeholder={t('settings.paste')} autoComplete="off" onChange={(e) => setValue(e.target.value)} />
        <button className="btn small primary" disabled={!value.trim() || !info?.encryptionAvailable}
          onClick={() => void window.api.pluginSecretSet(plugin.id, secretKey, value).then(() => { setValue(''); return reloadPlugins() })}>{t('settings.save')}</button>
      </div>
    </div>
  )
}

function PluginCard({ plugin, onAddAccount }: { plugin: InstalledPlugin; onAddAccount: () => void }): JSX.Element {
  const { t, settings, pluginAccounts, reloadPlugins } = useApp()
  const m = plugin.manifest
  const mine = pluginAccounts.filter((a) => a.pluginId === plugin.id)
  const autoDisabled = !plugin.enabled && plugin.failures >= 5

  return (
    <div className="glass pad">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 17 }}>{m.name} <span className="muted small">v{m.version}</span></h2>
          <div className="muted small">{m.author ? t('plugins.by', { author: m.author }) : ''}</div>
        </div>
        <Switch on={plugin.enabled} label={t('plugins.enabled')} onChange={(v) => void window.api.pluginsSetEnabled(plugin.id, v).then(reloadPlugins)} />
      </div>
      <p style={{ margin: '10px 0', fontSize: 14 }}>{loc(m.description, settings.lang)}</p>
      {autoDisabled && <div className="err">{t('plugins.autoDisabled')}{plugin.lastError ? ` (${plugin.lastError})` : ''}</div>}

      <details className="rule"><summary><span className="grow small muted">{t('plugins.perm.title')}</span></summary><PermissionList m={m} /></details>

      {m.secrets.length > 0 && <div style={{ marginTop: 8 }}><h2 className="small muted" style={{ fontWeight: 500 }}>{t('plugins.keys')}</h2>{m.secrets.map((s) => <SecretRow key={s.key} plugin={plugin} secretKey={s.key} />)}</div>}

      <div style={{ marginTop: 14 }}>
        <div className="row between"><h2 className="small muted" style={{ fontWeight: 500 }}>{t('plugins.accounts')}</h2>
          <button className="btn small" disabled={!plugin.enabled} onClick={onAddAccount}>{t('plugins.addAccount')}</button></div>
        {mine.length === 0 && <p className="muted small" style={{ marginTop: 6 }}>{t('plugins.noAccounts')}</p>}
        {mine.map((a) => (
          <div className="list-item" key={a.id}><span>{a.displayName}</span>
            <button className="btn small" onClick={() => void window.api.pluginAccountRemove(a.id).then(reloadPlugins)}>{t('settings.account.remove')}</button></div>
        ))}
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn small" onClick={() => { if (window.confirm(t('plugins.uninstallConfirm', { name: m.name }))) void window.api.pluginsUninstall(plugin.id).then(reloadPlugins) }}>{t('plugins.uninstall')}</button>
      </div>
    </div>
  )
}

/** `openPath` : fichier reçu par double-clic ; `onOpenHandled` le consomme. */
export function PluginsPage({ openPath, onOpenHandled }: { openPath: string | null; onOpenHandled: () => void }): JSX.Element {
  const { t, plugins } = useApp()
  const [installPath, setInstallPath] = useState<string | null>(null)
  const [accountFor, setAccountFor] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const path = installPath ?? openPath

  const pick = async (): Promise<void> => { const p = await window.api.pluginsPickPackage(); if (p) setInstallPath(p) }
  const close = (): void => { setInstallPath(null); onOpenHandled() }

  return (
    <div onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) setInstallPath(window.api.pathForFile(f)) }}>
      <div className="page-head">
        <div className="grow"><h1>{t('plugins.title')}</h1><div className="muted small">{t('plugins.drop')}</div></div>
        <button className="btn primary" onClick={() => void pick()}>{t('plugins.install')}</button>
      </div>
      <Reveal className="glass pad" ><p className="muted small" style={{ lineHeight: 1.6 }}>{t('plugins.sandbox')} {t('plugins.warn')}</p></Reveal>

      {plugins.length === 0
        ? <div className="glass empty sect"><p>{t('plugins.empty')}</p></div>
        : <div className="grid two sect">{plugins.map((p, i) => <Reveal key={p.id} delay={i * 0.05}><PluginCard plugin={p} onAddAccount={() => setAccountFor(p.id)} /></Reveal>)}</div>}

      {dragging && <div className="overlay" style={{ pointerEvents: 'none' }}><div className="glass modal"><h2>{t('plugins.dropNow')}</h2></div></div>}
      {path && <PluginInstallDialog path={path} onClose={close} />}
      {accountFor && plugins.find((p) => p.id === accountFor) && <PluginAccountDialog plugin={plugins.find((p) => p.id === accountFor)!} onClose={() => setAccountFor(null)} />}
    </div>
  )
}
