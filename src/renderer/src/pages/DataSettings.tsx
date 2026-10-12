// Export des données et sauvegarde / restauration de la configuration.
import { useState } from 'react'
import { Row, Section } from '../components/settingsUi'
import { useApp } from '../lib/AppContext'

export function DataSettings(): JSX.Element {
  const { t, reloadSettings } = useApp()
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (job: () => Promise<{ ok: boolean; error?: string } | boolean>, okKey: string): Promise<void> => {
    setBusy(true); setMsg(null)
    try {
      const r = await job()
      const ok = typeof r === 'boolean' ? r : r.ok
      const error = typeof r === 'boolean' ? undefined : r.error
      if (ok) setMsg(t(okKey))
      else if (error) setMsg(t(error === 'invalid' ? 'data.invalid' : 'data.fail'))   // pas de message si l'utilisateur a simplement annulé
    } finally { setBusy(false) }
  }

  return (
    <div>
      <Section title={t('data.title')}>
        <Row title={t('data.title')} help={t('data.help')}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn small" disabled={busy} onClick={() => void run(() => window.api.exportData('csv'), 'data.done')}>{t('data.csv')}</button>
            <button className="btn small" disabled={busy} onClick={() => void run(() => window.api.exportData('json'), 'data.done')}>{t('data.json')}</button>
            <button className="btn small" disabled={busy} onClick={() => void run(() => window.api.exportData('pdf'), 'data.done')}>{t('data.pdf')}</button>
          </div>
        </Row>
      </Section>

      <Section title={t('data.backup')} delay={0.05}>
        <Row title={t('data.backup')} help={t('data.backup.help')}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn small" disabled={busy} onClick={() => void run(() => window.api.exportBackup(), 'data.done')}>{t('data.backup.export')}</button>
            <button className="btn small" disabled={busy} onClick={() => void run(async () => { const r = await window.api.importBackup(); if (r.ok) await reloadSettings(); return r }, 'data.restored')}>{t('data.backup.import')}</button>
          </div>
        </Row>
      </Section>
      {msg && <p className="muted small" style={{ textAlign: 'center', marginTop: 16 }}>{msg}</p>}
    </div>
  )
}
