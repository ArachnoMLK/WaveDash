// Composition : plusieurs rendus superposés dans l'aperçu (animés ou figés), déplaçables, puis fusionnés en un nouveau rendu.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { StudioRender } from '@shared/studio'

const studio = window.api.studio

export interface StackItem {
  id: string; render: StudioRender; visible: boolean
  x: number; y: number; scale: number; flip: boolean
  delay: number          // images d'attente avant de démarrer
  mode: 'once' | 'loop' | 'still'
  still: number          // image affichée en mode figé
}
export const stackItem = (render: StudioRender, x = 0, y = 0): StackItem => ({
  id: Math.random().toString(36).slice(2), render, visible: true, x, y, scale: 1, flip: false, delay: 0, mode: 'loop', still: 0
})

const imgs = new Map<string, HTMLImageElement>()
function img(r: StudioRender, i: number, redraw: () => void): HTMLImageElement | null {
  const src = `studio://renders/${r.id}/${r.files[i]}`
  let im = imgs.get(src)
  if (!im) { im = new Image(); im.crossOrigin = 'anonymous'; im.onload = redraw; im.src = src; imgs.set(src, im) }
  return im.complete && im.naturalWidth ? im : null
}
const loaded = (src: string): Promise<HTMLImageElement> => new Promise((ok, ko) => {
  const known = imgs.get(src); if (known?.complete && known.naturalWidth) return ok(known)
  const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { imgs.set(src, im); ok(im) }; im.onerror = ko; im.src = src
})

/** Image d'un calque à l'instant `t` (null : pas encore commencé). */
function frameAt(s: StackItem, t: number): number | null {
  const n = s.render.files.length
  if (s.mode === 'still') return Math.min(n - 1, s.still)
  const k = t - s.delay
  if (k < 0) return null
  return s.mode === 'loop' ? k % n : Math.min(n - 1, k)
}
/** Cadre commun : l'union des calques (centrés sur leur position). */
function bounds(stack: StackItem[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of stack) {
    if (!s.visible) continue
    const w = s.render.width * s.scale, h = s.render.height * s.scale
    x0 = Math.min(x0, s.x - w / 2); y0 = Math.min(y0, s.y - h / 2); x1 = Math.max(x1, s.x + w / 2); y1 = Math.max(y1, s.y + h / 2)
  }
  return x0 === Infinity ? { x: 0, y: 0, w: 1, h: 1 } : { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1 - x0), h: Math.ceil(y1 - y0) }
}
const total = (stack: StackItem[]): number => Math.max(1, ...stack.filter((s) => s.visible).map((s) => (s.mode === 'still' ? 1 : s.delay + s.render.files.length)))

function paint(c: CanvasRenderingContext2D, stack: StackItem[], b: { x: number; y: number }, t: number, k: number, redraw: () => void): boolean {
  let ready = true
  for (const s of stack) {
    if (!s.visible) continue
    const f = frameAt(s, t); if (f === null) continue
    const im = img(s.render, f, redraw); if (!im) { ready = false; continue }
    const w = s.render.width * s.scale * k, h = s.render.height * s.scale * k
    c.save(); c.translate((s.x - b.x) * k, (s.y - b.y) * k); if (s.flip) c.scale(-1, 1)
    c.drawImage(im, -w / 2, -h / 2, w, h); c.restore()
  }
  return ready
}

export function Composer({ stack, setStack, tr, onMerged }: {
  stack: StackItem[]; setStack: (s: StackItem[]) => void; tr: (fr: string, en: string) => string; onMerged: (r: StudioRender) => void
}): JSX.Element {
  const cv = useRef<HTMLCanvasElement>(null)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [sel, setSel] = useState<string | null>(stack[stack.length - 1]?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [, bump] = useState(0)
  const b = useMemo(() => bounds(stack), [stack])
  const n = total(stack)
  const max = 520, k = Math.min(1, max / Math.max(b.w, b.h))
  const drag = useRef<{ id: string; px: number; py: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const c = cv.current; if (!c) return
    c.width = Math.max(1, Math.round(b.w * k)); c.height = Math.max(1, Math.round(b.h * k))
    const x = c.getContext('2d')!; x.clearRect(0, 0, c.width, c.height)
    paint(x, stack, b, t, k, () => bump((v) => v + 1))
  })
  useEffect(() => {
    if (!playing || n < 2) return
    const h = setInterval(() => setT((v) => (v + 1) % n), 1000 / 24)
    return () => clearInterval(h)
  }, [playing, n])

  const set = (id: string, patch: Partial<StackItem>): void => setStack(stack.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const cur = stack.find((s) => s.id === sel) ?? null
  const toScene = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = cv.current!.getBoundingClientRect()
    return { x: b.x + ((e.clientX - r.left) / r.width) * b.w, y: b.y + ((e.clientY - r.top) / r.height) * b.h }
  }
  const down = (e: RPointerEvent<HTMLCanvasElement>): void => {
    const p = toScene(e)
    const hitItem = [...stack].reverse().find((s) => s.visible && Math.abs(p.x - s.x) <= (s.render.width * s.scale) / 2 && Math.abs(p.y - s.y) <= (s.render.height * s.scale) / 2)
    if (!hitItem) return
    setSel(hitItem.id); e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: hitItem.id, px: e.clientX, py: e.clientY, x: hitItem.x, y: hitItem.y }
  }
  const move = (e: RPointerEvent<HTMLCanvasElement>): void => {
    const d = drag.current; if (!d) return
    const r = cv.current!.getBoundingClientRect(), f = b.w / r.width
    set(d.id, { x: d.x + (e.clientX - d.px) * f, y: d.y + (e.clientY - d.py) * f })
  }

  /** Toutes les images de la composition, en pleine taille, enregistrées comme un nouveau rendu. */
  const merge = async (): Promise<void> => {
    setBusy(true)
    try {
      // toutes les images chargées avant de dessiner
      await Promise.all(stack.filter((s) => s.visible).flatMap((s) => s.render.files.map((f) => loaded(`studio://renders/${s.render.id}/${f}`))))
      const c = document.createElement('canvas'); c.width = b.w; c.height = b.h
      const x = c.getContext('2d')!
      const frames: Uint8Array[] = []
      for (let i = 0; i < n; i++) {
        x.clearRect(0, 0, c.width, c.height); paint(x, stack, b, i, 1, () => undefined)
        const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'))
        if (blob) frames.push(new Uint8Array(await blob.arrayBuffer()))
      }
      const label = stack.filter((s) => s.visible).map((s) => s.render.label.split(' — ').pop()).join(' + ').slice(0, 80)
      onMerged(await studio.saveComposite(frames, label, b.w, b.h))
    } finally { setBusy(false) }
  }

  return (
    <div className="cmp">
      <canvas ref={cv} className="st-canvas cmp-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null }} />
      <div className="st-ctrl">
        <div className="row">
          <button className="btn small primary st-play" onClick={() => setPlaying(!playing)}>{playing ? tr('Pause', 'Pause') : tr('Lecture', 'Play')}</button>
          <span className="small st-fnum">{t + 1} / {n}</span>
          <input className="st-range" type="range" min={0} max={n - 1} value={Math.min(t, n - 1)} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)) }} style={{ flex: 1 }} />
        </div>
      </div>
      <div className="cmp-list">
        {[...stack].reverse().map((s) => (
          <div key={s.id} className={`cmp-item ${s.id === sel ? 'on' : ''}`} onClick={() => setSel(s.id)}>
            <img src={`studio://renders/${s.render.id}/${s.render.files[0]}`} alt="" />
            <span className="grow mm-ln">{s.render.label}</span>
            <button className={`mm-tg ${s.visible ? '' : 'off'}`} title={tr('Afficher', 'Show')} onClick={(e) => { e.stopPropagation(); set(s.id, { visible: !s.visible }) }}>👁</button>
            <button className="mm-tg" title={tr('Monter', 'Up')} onClick={(e) => { e.stopPropagation(); const i = stack.indexOf(s); if (i < stack.length - 1) { const a = [...stack]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; setStack(a) } }}>▲</button>
            <button className="mm-tg" title={tr('Descendre', 'Down')} onClick={(e) => { e.stopPropagation(); const i = stack.indexOf(s); if (i > 0) { const a = [...stack]; [a[i], a[i - 1]] = [a[i - 1], a[i]]; setStack(a) } }}>▼</button>
            <button className="mm-tg" title={tr('Retirer', 'Remove')} onClick={(e) => { e.stopPropagation(); setStack(stack.filter((x) => x.id !== s.id)) }}>✕</button>
          </div>
        ))}
      </div>
      {cur && (
        <div className="cmp-props">
          <div className="mm-tabs">
            {(['loop', 'once', 'still'] as const).map((m) => <button key={m} className={cur.mode === m ? 'on' : ''} onClick={() => set(cur.id, { mode: m })}>{m === 'loop' ? tr('En boucle', 'Loop') : m === 'once' ? tr('Une fois', 'Once') : tr('Image fixe', 'Still')}</button>)}
            <button className={cur.flip ? 'on' : ''} onClick={() => set(cur.id, { flip: !cur.flip })}>⇆ Flip</button>
          </div>
          <label className="mm-slider"><span>{tr('Taille', 'Scale')}</span><input type="range" min={0.1} max={3} step={0.05} value={cur.scale} onChange={(e) => set(cur.id, { scale: Number(e.target.value) })} /><em>{Math.round(cur.scale * 100)} %</em></label>
          {cur.mode === 'still'
            ? <label className="mm-slider"><span>{tr('Image', 'Frame')}</span><input type="range" min={0} max={cur.render.files.length - 1} value={cur.still} onChange={(e) => set(cur.id, { still: Number(e.target.value) })} /><em>{cur.still + 1}</em></label>
            : <label className="mm-slider"><span>{tr('Départ', 'Start')}</span><input type="range" min={0} max={120} value={cur.delay} onChange={(e) => set(cur.id, { delay: Number(e.target.value) })} /><em>{cur.delay} i</em></label>}
          <p className="muted small">{tr('Glisse un calque sur l’aperçu pour le placer.', 'Drag a layer on the preview to place it.')}</p>
        </div>
      )}
      <div className="row">
        <button className="btn primary small" disabled={busy || !stack.some((s) => s.visible)} onClick={() => void merge()}>{busy ? tr('Fusion…', 'Merging…') : tr('Fusionner en un rendu', 'Merge into one render')}</button>
        <button className="btn small" onClick={() => setStack([])}>{tr('Fermer la composition', 'Close composition')}</button>
      </div>
    </div>
  )
}
