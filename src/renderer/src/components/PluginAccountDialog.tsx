// Ajout d'un compte pour un plugin : champs définis par le manifeste (texte, nombre, dossier).
import { useState } from 'react'
import { InstalledPlugin, loc, PluginAccount } from '@shared/plugin'
import { useApp } from '../lib/AppContext'

/** Ajout d'un compte, ou modification de ses champs quand `account` est donné. */
export function PluginAccountDialog({ plugin, account, onClose }: { plugin: InstalledPlugin; account?: PluginAccount; onClose: () => void }): JSX.Element {
  const { t, settings, reloadPlugins } = useApp()
  const [values, setValues] = useState<Record<string, string>>(account?.inputs ?? {})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const m = plugin.manifest

  const labelOf = (key: string): string => loc(m.inputs.find((i) => i.key === key)?.label, settings.lang)
  const explain = (code: string, detail?: string): string => {
    if (code.startsWith('input_required:')) return t('pa.required', { field: labelOf(code.slice(15)) })
    if (code.startsWith('input_invalid:')) return t('pa.invalid', { field: labelOf(code.slice(14)) })
    return t(`plugin.run.${code}`) + (detail ? ` (${detail})` : '')
  }

  const submit = async (): Promise<void> => {
    setBusy(true); setError(null)
    const r: { ok: boolean; error?: string; detail?: string } = account ? await window.api.pluginAccountUpdate(account.id, values) : await window.api.pluginAccountAdd(plugin.id, values)
    await reloadPlugins()
    setBusy(false)
    if (r.ok) onClose(); else setError(explain(r.error ?? 'engine', r.detail))
  }
  const pick = async (key: string): Promise<void> => { const p = await window.api.pickFolder(); if (p) setValues((v) => ({ ...v, [key]: p })) }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="glass modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={t('plugins.addAccount')}>
        <h2 style={{ fontSize: 18, marginBottom: 14 }}>{account ? t('pa.editTitle', { name: account.displayName }) : t('pa.title', { name: m.name })}</h2>
        {m.inputs.length === 0 && <p className="muted small">{t('pa.noInputs')}</p>}
        {m.inputs.map((i) => (
          <div key={i.key} style={{ marginBottom: 12 }}>
            <div className="small" style={{ marginBottom: 4 }}>{loc(i.label, settings.lang)}{i.required ? ' *' : ''}</div>
            {i.type === 'folder' || i.type === 'images'
              ? <div className="row"><input type="text" readOnly value={values[i.key] ?? ''} placeholder={t('pa.noFolder')} /><button className="btn small" onClick={() => void pick(i.key)}>{t('pa.choose')}</button>
                  {!i.required && values[i.key] && <button className="btn small" onClick={() => setValues((v) => { const { [i.key]: _x, ...rest } = v; return rest })}>×</button>}</div>
              : <input type="text" value={values[i.key] ?? ''} inputMode={i.type === 'number' ? 'decimal' : undefined} placeholder={i.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [i.key]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && !busy && void submit()} />}
            {i.help && <div className="muted small" style={{ marginTop: 4 }}>{loc(i.help, settings.lang)}</div>}
          </div>
        ))}
        {error && <div className="err">{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18, gap: 8 }}>
          <button className="btn" onClick={onClose}>{t('add.cancel')}</button>
          <button className="btn primary" disabled={busy} onClick={() => void submit()}>{busy ? t('pa.loading') : t('add.submit')}</button>
        </div>
      </div>
    </div>
  )
}
