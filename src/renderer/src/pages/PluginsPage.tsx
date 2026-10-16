// Gestion des plugins : installation (bouton ou glisser-déposer), comptes, clés, activation, désinstallation.
import { useEffect, useState } from 'react'
import { compareVersions, InstalledPlugin, loc } from '@shared/plugin'
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
  const { t, plugins, settings } = useApp()
  const [installPath, setInstallPath] = useState<string | null>(null)
  const [accountFor, setAccountFor] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const path = installPath ?? openPath
  const [bundled, setBundled] = useState<Awaited<ReturnType<typeof window.api.pluginsBundled>>>([])
  useEffect(() => { void window.api.pluginsBundled().then(setBundled) }, [plugins])
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof window.api.pluginsCatalog>> | null>(null)
  const [fetching, setFetching] = useState<string | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  useEffect(() => { void window.api.pluginsCatalog(false).then(setCatalog) }, [plugins])
  const fromCatalog = async (id: string): Promise<void> => {
    setFetching(id); setCatalogError(null)
    const r = await window.api.pluginsCatalogFetch(id)
    setFetching(null)
    if (r.ok && r.path) setInstallPath(r.path); else setCatalogError(r.error ?? '')
  }
  // Sans catalogue (hors ligne au premier lancement), les plugins fournis avec l'appli restent proposés.
  const offered = catalog?.entries.length ? [] : bundled.filter((b) => !b.installedVersion || b.installedVersion !== b.version)

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

      {catalog && catalog.entries.length > 0 && (
        <Reveal className="glass pad sect">
          <div className="row between" style={{ marginBottom: 8 }}>
            <h2>{t('plugins.catalog')}</h2>
            <button className="btn" onClick={() => void window.api.pluginsCatalog(true).then(setCatalog)}>{t('platform.refresh')}</button>
          </div>
          <p className="muted small" style={{ marginBottom: 6 }}>{t('plugins.catalogHint')}{catalog.offline ? ` ${t('plugins.catalogOffline')}` : ''}</p>
          {catalogError && <div className="err" style={{ marginBottom: 8 }}>{catalogError}</div>}
          {catalog.entries.map((e) => {
            const upToDate = e.installedVersion !== null && compareVersions(e.installedVersion, e.version) >= 0   // jamais de retour en arrière
            return (
              <div key={e.id} className="row between" style={{ padding: '8px 0', borderTop: '1px solid var(--line)', gap: 12 }}>
                <div className="grow"><b>{e.name}</b> <span className="muted small">{e.version}{e.author ? ` · ${e.author}` : ''}{e.installedVersion && !upToDate ? ` (${t('plugins.installedV', { v: e.installedVersion })})` : ''}</span>
                  <div className="muted small">{loc(e.description, settings.lang)}</div></div>
                {upToDate ? <span className="small muted">{t('plugins.upToDate')}</span>
                  : <button className="btn" disabled={fetching !== null} onClick={() => void fromCatalog(e.id)}>{fetching === e.id ? '…' : e.installedVersion ? t('plugins.updateBtn') : t('plugins.install')}</button>}
              </div>
            )
          })}
        </Reveal>
      )}

      {offered.length > 0 && (
        <Reveal className="glass pad sect">
          <h2 style={{ marginBottom: 8 }}>{t('plugins.bundled')}</h2>
          {offered.map((b) => (
            <div key={b.id} className="row between" style={{ padding: '8px 0', borderTop: '1px solid var(--line)', gap: 12 }}>
              <div className="grow"><b>{b.name}</b> <span className="muted small">{b.version}{b.installedVersion ? ` (${t('plugins.installedV', { v: b.installedVersion })})` : ''}</span>
                <div className="muted small">{loc(b.description, settings.lang)}</div></div>
              <button className="btn" onClick={() => setInstallPath(b.path)}>{b.installedVersion ? t('plugins.updateBtn') : t('plugins.install')}</button>
            </div>
          ))}
        </Reveal>
      )}

      {dragging && <div className="overlay" style={{ pointerEvents: 'none' }}><div className="glass modal"><h2>{t('plugins.dropNow')}</h2></div></div>}
      {path && <PluginInstallDialog path={path} onClose={close} />}
      {accountFor && plugins.find((p) => p.id === accountFor) && <PluginAccountDialog plugin={plugins.find((p) => p.id === accountFor)!} onClose={() => setAccountFor(null)} />}
    </div>
  )
}
