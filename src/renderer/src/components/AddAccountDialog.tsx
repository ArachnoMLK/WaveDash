import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { AVAILABLE_PLATFORMS, Platform, SecretKey } from '@shared/types'
import { useApp } from '../lib/AppContext'

export const SECRET_OF: Partial<Record<Platform, SecretKey>> = { youtube: 'youtube.apiKey', brawlhalla: 'brawlhalla.apiKey' }

export function AddAccountDialog({ platform, replace = false, onClose }: { platform: Platform; replace?: boolean; onClose: () => void }): JSX.Element {
  const { t, dur, reloadAccounts } = useApp()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasKey, setHasKey] = useState(true)
  const available = AVAILABLE_PLATFORMS.includes(platform)

  useEffect(() => { const k = SECRET_OF[platform]; if (k) void window.api.hasSecret(k).then(setHasKey) }, [platform])

  const submit = async (demo: boolean): Promise<void> => {
    setBusy(true); setError(null)
    const res = await window.api.addAccount({ platform, input: input.trim(), demo, replace })
    setBusy(false)
    if (res.ok) { await reloadAccounts(); onClose() } else setError(res.error ?? 'api')
  }

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: dur * 0.5 }} onMouseDown={onClose}>
      <motion.div className="glass modal" initial={dur ? { y: 14, opacity: 0 } : false} animate={{ y: 0, opacity: 1 }} transition={{ duration: dur * 0.7, ease: [0.22, 0.61, 0.36, 1] }}
        onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={t('add.title')}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>{replace ? t('add.titleReplace') : t('add.title')}</h2>
        <p className="muted small" style={{ marginBottom: 16 }}>{t(`platform.${platform}`)}</p>
        {available ? (
          <>
            <input type="text" autoFocus value={input} placeholder={t(`add.input.${platform}`)} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && input.trim() && !busy && void submit(false)} />
            {!hasKey && <div className="err">{t('add.needKey')}</div>}
            {error && <div className="err">{t(`err.${error}`)}</div>}
          </>
        ) : <div className="err">{t('platform.soon')}</div>}
        <div className="row between" style={{ marginTop: 22 }}>
          <button className="btn small" disabled={busy || !available} onClick={() => void submit(true)}>{t('add.demo')}</button>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={onClose}>{t('add.cancel')}</button>
            <button className="btn primary" disabled={busy || !input.trim() || !available} onClick={() => void submit(false)}>{busy ? t('add.loading') : t('add.submit')}</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
