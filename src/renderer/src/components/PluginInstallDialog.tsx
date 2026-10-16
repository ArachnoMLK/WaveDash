// Écran de validation avant installation : liste ce que le plugin demande, puis installe sur confirmation.
import { useEffect, useState } from 'react'
import { loc, PluginInspect, PluginManifest } from '@shared/plugin'
import { useApp } from '../lib/AppContext'

/** Résumé lisible des permissions d'un manifeste (réutilisé dans la liste des plugins installés). */
export function PermissionList({ m }: { m: PluginManifest }): JSX.Element {
  const { t, settings } = useApp()
  const rows: string[] = []
  if (m.permissions.network.length) rows.push(t('plugins.perm.network', { domains: m.permissions.network.map((d) => (d.startsWith('*.') ? t('plugins.perm.wildcard', { domain: d.slice(2) }) : d)).join(', ') }))
  else rows.push(t('plugins.perm.network.none'))
  if (m.permissions.folder) rows.push(t('plugins.perm.folder', { ext: m.permissions.folderExtensions.length ? t('plugins.perm.folder.ext', { ext: m.permissions.folderExtensions.join(', ') }) : '' }))
  if (m.permissions.images) rows.push(t('plugins.perm.images'))
  if (m.notices) rows.push(t('plugins.perm.notices'))
  if (m.secrets.length) rows.push(t('plugins.perm.secrets', { names: m.secrets.map((s) => loc(s.label, settings.lang)).join(', ') }))
  return <ul style={{ paddingLeft: 18, lineHeight: 1.7, fontSize: 13.5 }}>{rows.map((r) => <li key={r}>{r}</li>)}</ul>
}

/** Traduit un code d'erreur d'inspection (« manifest:id », « zip:corrupt »…). */
export function inspectError(t: (k: string, v?: Record<string, string>) => string, code: string): string {
  if (code.startsWith('manifest:')) return t('plugins.err.manifest', { field: code.slice(9) })
  if (code.startsWith('zip:')) return t('plugins.err.zip')
  return t(`plugins.err.${code}`)
}

export function PluginInstallDialog({ path, onClose }: { path: string; onClose: () => void }): JSX.Element {
  const { t, settings, reloadPlugins } = useApp()
  const [state, setState] = useState<{ inspect: PluginInspect } | { error: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void window.api.pluginsInspect(path).then((r) => { if (alive) setState(r.ok ? { inspect: r.inspect } : { error: r.error }) })
    return () => { alive = false }
  }, [path])

  const install = async (token: string): Promise<void> => {
    setBusy(true)
    const r = await window.api.pluginsInstall(token)
    await reloadPlugins()
    setBusy(false)
    if (r.ok) onClose(); else setState({ error: r.error ?? 'unreadable' })
  }

  const m = state && 'inspect' in state ? state.inspect.manifest : null
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="glass modal" style={{ width: 'min(520px, 94vw)' }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={t('plugins.install')}>
        {!state && <p className="muted">{t('plugins.inspecting')}</p>}
        {state && 'error' in state && <>
          <h2 style={{ fontSize: 18 }}>{t('plugins.install')}</h2>
          <div className="err">{inspectError(t, state.error)}</div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}><button className="btn" onClick={onClose}>{t('add.cancel')}</button></div>
        </>}
        {m && state && 'inspect' in state && <>
          <h2 style={{ fontSize: 18 }}>{m.name} <span className="muted small">v{m.version}</span></h2>
          <div className="muted small" style={{ marginTop: 2 }}>{m.author ? t('plugins.by', { author: m.author }) : ''}{' '}
            · {state.inspect.installedVersion ? t('plugins.update', { from: state.inspect.installedVersion, to: m.version }) : t('plugins.new')}</div>
          <p style={{ margin: '12px 0', fontSize: 14 }}>{loc(m.description, settings.lang)}</p>
          <h2 style={{ fontSize: 14, marginTop: 14 }}>{t('plugins.perm.title')}</h2>
          <PermissionList m={m} />
          <div className="err">{t('plugins.sandbox')}<br />{t('plugins.warn')}</div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20, gap: 8 }}>
            <button className="btn" onClick={onClose}>{t('add.cancel')}</button>
            <button className="btn primary" disabled={busy} onClick={() => void install(state.inspect.token)}>{t('plugins.confirmInstall')}</button>
          </div>
        </>}
      </div>
    </div>
  )
}
