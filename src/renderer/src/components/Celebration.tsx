// Écran de célébration : s'affiche quand un palier est franchi (si l'option est activée).
import { useEffect } from 'react'
import { useApp } from '../lib/AppContext'
import { fmt } from '../lib/format'

export function Celebration(): JSX.Element | null {
  const { celebration: e, dismissCelebration, t, settings } = useApp()

  // Disparaît seul après 7 s de fenêtre visible (le compte à rebours attend si la fenêtre est réduite).
  useEffect(() => {
    if (!e) return
    let timer: number | undefined
    const start = (): void => { window.clearTimeout(timer); timer = window.setTimeout(dismissCelebration, 7000) }
    const onVis = (): void => { window.clearTimeout(timer); if (document.visibilityState === 'visible') start() }
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVis)
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [e, dismissCelebration])

  if (!e) return null
  const isRank = e.metric === 'rank'
  const kind = isRank ? (e.direction === 'up' ? 'rankUp' : 'rankDown') : e.direction
  return (
    <div className="celebrate" key={e.ts + e.metric} onClick={dismissCelebration} role="alertdialog" aria-label={t(`celebrate.${kind}`)}>
      <div className="rings"><i /><i /><i /></div>
      <div className="glass card">
        <div className="muted small">{t(`platform.${e.platform}`)} · {e.account}</div>
        <div className="big">{isRank ? e.toRank : fmt(e.threshold, settings.lang)}</div>
        <h2 style={{ marginTop: 10 }}>{t(`celebrate.${kind}`)}{!isRank && ` · ${t(`metric.${e.metric}`)}`}</h2>
        <p className="muted" style={{ marginTop: 8, maxWidth: 360 }}>{e.message}</p>
        <div className="muted small" style={{ marginTop: 14, opacity: 0.7 }}>{t('celebrate.close')}</div>
      </div>
    </div>
  )
}
