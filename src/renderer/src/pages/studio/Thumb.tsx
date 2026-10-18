// Vignette d'un rendu : image fixe calculée quand elle devient visible, animation jouée au survol de la carte.
import { useEffect, useRef, useState } from 'react'
import type { StudioRenderRequest } from '@shared/studio'

const studio = window.api.studio

export function Thumb({ req, animate = true }: { req: StudioRenderRequest; animate?: boolean }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [frame, setFrame] = useState<string | null>(null)
  const key = JSON.stringify(req)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let alive = true
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      void studio.thumb(req).then((s) => { if (alive) setSrc(s ?? '') })
    })
    io.observe(el)
    return () => { alive = false; io.disconnect() }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  // survol de la carte entière (le bouton parent) : petite boucle de l'animation, préparée à la demande
  useEffect(() => {
    const card = (ref.current?.closest('button, .st-card') as HTMLElement | null) ?? ref.current
    if (!card || !animate) return
    let timer: ReturnType<typeof setTimeout> | null = null, loop: ReturnType<typeof setInterval> | null = null, on = false
    const enter = (): void => {
      on = true
      timer = setTimeout(() => {
        void studio.preview(req).then((p) => {
          if (!on || !p || p.files.length < 2) return
          const urls = p.files.map((f) => p.base + f)
          urls.forEach((u) => { const im = new Image(); im.src = u })
          let i = 0
          loop = setInterval(() => { i = (i + 1) % urls.length; setFrame(urls[i]) }, 1000 / 24)
        })
      }, 180)
    }
    const leave = (): void => { on = false; if (timer) clearTimeout(timer); if (loop) clearInterval(loop); loop = null; setFrame(null) }
    card.addEventListener('mouseenter', enter)
    card.addEventListener('mouseleave', leave)
    return () => { leave(); card.removeEventListener('mouseenter', enter); card.removeEventListener('mouseleave', leave) }
  }, [key, animate]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = frame ?? src
  return <div ref={ref} className={`st-thumb${src === '' ? ' empty' : ''}`}>{shown ? <img src={shown} alt="" /> : src === '' ? <span>—</span> : <i className="st-spin" />}</div>
}
