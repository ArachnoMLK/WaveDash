// Replay player view: a reserved rectangle that the preloaded game window (main process) covers exactly,
// with arrows to go to the previous / next replay of the list without leaving the player.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ReplayPlayerStatus } from '@shared/types'
import { useApp } from '../lib/AppContext'

export interface ReplayRef { id: string; title: string; sub?: string }

/** `index` may step outside `replays` when `canPrev` / `canNext` say another page has more (the page loads it). */
export function ReplayPlayerView({ accountId, replays, index, onIndex, onBack, canPrev, canNext, position }: {
  accountId: number; replays: ReplayRef[]; index: number; onIndex: (i: number) => void; onBack: () => void
  canPrev: boolean; canNext: boolean; position: string
}): JSX.Element {
  const { t } = useApp()
  const box = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  // The player fills the page down to the bottom of the window (measured, the page head height varies).
  const [height, setHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const fit = (): void => { const el = root.current; if (el) setHeight(Math.max(420, Math.floor(window.innerHeight - el.getBoundingClientRect().top - 20))) }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  const [st, setSt] = useState<ReplayPlayerStatus | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const cur = replays[index]

  useEffect(() => {
    void window.api.replayPlayer.status().then(setSt)
    return window.api.replayPlayer.onStatus(setSt)
  }, [])

  // Open the replay once the player is ready (it may still be loading when the view opens).
  const ready = st?.state === 'ready'
  useEffect(() => {
    if (!cur || !ready) return
    let alive = true
    setErr(null)
    void window.api.replayPlayer.open(accountId, cur.id).then((r) => { if (alive && !r.ok) setErr(r.error ?? '?') })
    return () => { alive = false }
  }, [accountId, cur?.id, ready])

  // Keep the game window on the reserved rectangle: page scroll, window and layout changes.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    let raf = 0
    const send = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        // Hidden behind the page edges (scrolled away): hide the game window instead of overlapping the UI.
        const visible = r.width > 50 && r.height > 50 && r.top >= -2 && r.bottom <= window.innerHeight + 2
        void window.api.replayPlayer.place(visible && ready && !err ? { x: r.left, y: r.top, width: r.width, height: r.height } : null)
      })
    }
    send()
    const ro = new ResizeObserver(send)
    ro.observe(el)
    window.addEventListener('scroll', send, true)
    window.addEventListener('resize', send)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('scroll', send, true); window.removeEventListener('resize', send); void window.api.replayPlayer.place(null) }
  }, [ready, err])

  // Leaving the player stops the replay (the game goes back to idle, hidden).
  useEffect(() => () => { void window.api.replayPlayer.close() }, [])

  // Arrow keys (when WaveDash has the focus) switch replays.
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft' && canPrev) onIndex(index - 1)
      else if (e.key === 'ArrowRight' && canNext) onIndex(index + 1)
      else if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [index, canPrev, canNext, onIndex, onBack])

  const message = !st ? t('rp.loading')
    : st.state === 'missing' ? t('rp.missing')
    : st.state === 'error' ? t('rp.error', { error: st.error ?? '?' })
    : st.state !== 'ready' ? t('rp.loading')
    : err ? t('rp.error', { error: err }) : null

  return (
    <div ref={root} className="replay-player" style={height ? { height } : undefined}>
      <div className="replay-head">
        <button className="btn" onClick={onBack}>← {t('rp.back')}</button>
        <div className="grow replay-title">
          <b>{cur?.title ?? ''}</b>
          {cur?.sub && <span className="small muted">{cur.sub}</span>}
        </div>
        {ready && st?.replay && <span className="chip">{st.analysed ? t('rp.analysed') : t('rp.analysing')}</span>}
        <span className="small muted">{position}</span>
      </div>
      <div className="replay-stage">
        <button className="replay-arrow" disabled={!canPrev} aria-label={t('rp.prev')} title={t('rp.prev')} onClick={() => onIndex(index - 1)}>‹</button>
        <div ref={box} className="replay-box">
          {message && <div className="replay-msg">
            <p>{message}</p>
            {st?.state === 'missing' && <button className="btn primary" onClick={() => void window.api.replayPlayer.setDir().then(setSt)}>{t('rp.chooseDir')}</button>}
          </div>}
        </div>
        <button className="replay-arrow" disabled={!canNext} aria-label={t('rp.next')} title={t('rp.next')} onClick={() => onIndex(index + 1)}>›</button>
      </div>
    </div>
  )
}
