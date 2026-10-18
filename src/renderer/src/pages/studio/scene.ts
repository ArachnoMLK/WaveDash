// Miniature : modèle de scène (calques) et rendu canvas, utilisé tel quel pour l'affichage et pour l'export.

/** Colorimétrie (par calque et pour tout le projet). 0 = neutre partout. */
export interface Grade {
  exposure: number    // -100..100
  contrast: number    // -100..100
  saturation: number  // -100..100
  vibrance: number    // -100..100 (sature surtout les couleurs ternes)
  temperature: number // -100 (froid) .. 100 (chaud)
  tint: number        // -100 (vert) .. 100 (magenta)
  hue: number         // -180..180
  fade: number        // 0..100 (noirs délavés)
}
export const NEUTRAL: Grade = { exposure: 0, contrast: 0, saturation: 0, vibrance: 0, temperature: 0, tint: 0, hue: 0, fade: 0 }

export interface Fx {
  outline: { on: boolean; color: string; width: number; soft: number }
  outline2: { on: boolean; color: string; width: number }
  glow: { on: boolean; color: string; size: number; strength: number; inner: boolean }
  shadow: { on: boolean; color: string; blur: number; dx: number; dy: number; opacity: number }
  motion: { on: boolean; angle: number; dist: number }
  blur: number
  grade: Grade
}
export const noFx = (): Fx => ({
  outline: { on: false, color: '#ffffff', width: 4, soft: 0 },
  outline2: { on: false, color: '#000000', width: 4 },
  glow: { on: false, color: '#22d3ee', size: 16, strength: 1.5, inner: false },
  shadow: { on: false, color: '#000000', blur: 12, dx: 0, dy: 8, opacity: 0.5 },
  motion: { on: false, angle: 180, dist: 40 },
  blur: 0,
  grade: { ...NEUTRAL }
})

interface Base {
  id: string; name: string; visible: boolean; locked: boolean
  x: number; y: number; sx: number; sy: number; rot: number; opacity: number; flipH: boolean; flipV: boolean
  blend: GlobalCompositeOperation
  fx: Fx
}
/** Image : rendu du Studio (avec ses images, pour choisir la pose), image du jeu ou fichier importé. */
export interface ImageLayer extends Base {
  kind: 'image'; src: string; w: number; h: number
  render?: { id: string; files: string[]; frame: number }
}
export interface TextLayer extends Base {
  kind: 'text'; text: string; font: string; size: number; spacing: number; lineHeight: number; align: CanvasTextAlign
  fill: 'solid' | 'gradient'; color: string; color2: string; accent: string
  inner: { color: string; width: number }
  extrude: { color: string; depth: number; angle: number }
  outer: { color: string; width: number }
  italic: boolean
}
export interface TagLayer extends Base {
  kind: 'tag'; text: string; font: string; size: number; team: string; textColor: string; arrow: 'none' | 'down' | 'up' | 'left' | 'right'
}
export interface ShapeLayer extends Base {
  kind: 'shape'; shape: 'rect' | 'para' | 'ribbon' | 'circle'; w: number; h: number; radius: number
  fill: 'solid' | 'gradient'; color: string; color2: string; stroke: string; strokeWidth: number
}
export interface SpeedLayer extends Base {
  kind: 'speed'; count: number; color: string; fade: number; intensity: number; fx0: number; fy0: number
  inner: number; maxLen: number; maxWidth: number; seed: number
}
export interface LightLayer extends Base {
  kind: 'light'; style: 'glow' | 'rays' | 'spot' | 'flare'; color: string; color2: string; radius: number; intensity: number; rays: number
}
export type Layer = ImageLayer | TextLayer | TagLayer | ShapeLayer | SpeedLayer | LightLayer
export type LayerKind = Layer['kind']

export interface Doc {
  version: 1
  name: string
  w: number; h: number
  bg: string
  tilt: number
  grade: Grade
  vignette: number   // 0..100
  layers: Layer[]
}
export const newDoc = (): Doc => ({ version: 1, name: 'miniature', w: 1280, h: 720, bg: '#1b1f2a', tilt: 0, grade: { ...NEUTRAL }, vignette: 0, layers: [] })

let seq = 0
export const uid = (): string => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
const base = (name: string, x: number, y: number): Base => ({
  id: uid(), name, visible: true, locked: false, x, y, sx: 1, sy: 1, rot: 0, opacity: 1, flipH: false, flipV: false, blend: 'source-over', fx: noFx()
})

/* ---------------------------------------------------------------- fabriques */
export const makeImage = (src: string, w: number, h: number, name: string, doc: Doc, render?: ImageLayer['render']): ImageLayer => {
  const s = Math.min(1, (doc.h * 0.85) / h, (doc.w * 0.6) / w)
  return { ...base(name, doc.w / 2, doc.h / 2), kind: 'image', src, w, h, sx: s, sy: s, render }
}
/** Fond : couvre tout le canvas. */
export const makeBackground = (src: string, w: number, h: number, name: string, doc: Doc): ImageLayer => {
  const s = Math.max(doc.w / w, doc.h / h)
  return { ...base(name, doc.w / 2, doc.h / 2), kind: 'image', src, w, h, sx: s, sy: s }
}
export const TEXT_STYLES: Record<string, (l: TextLayer) => Partial<TextLayer>> = {
  sticker: () => ({ font: 'Lilita One', fill: 'solid', color: '#4ade80', inner: { color: '#ffffff', width: 10 }, extrude: { color: '#0b0b0b', depth: 10, angle: 100 }, outer: { color: '#ffffff', width: 4 } }),
  impact: () => ({ font: 'Anton', fill: 'solid', color: '#facc15', inner: { color: '#000000', width: 8 }, extrude: { color: '#000000', depth: 0, angle: 90 }, outer: { color: '#000000', width: 0 } }),
  fire: () => ({ font: 'Luckiest Guy', fill: 'gradient', color: '#fde047', color2: '#ea580c', inner: { color: '#3b0a00', width: 8 }, extrude: { color: '#3b0a00', depth: 8, angle: 100 }, outer: { color: '#ffffff', width: 3 } }),
  ice: () => ({ font: 'Lilita One', fill: 'gradient', color: '#ffffff', color2: '#38bdf8', inner: { color: '#0c4a6e', width: 8 }, extrude: { color: '#082f49', depth: 8, angle: 100 }, outer: { color: '#e0f2fe', width: 3 } }),
  neon: (l) => ({ font: 'Bebas Neue', fill: 'solid', color: '#ffffff', inner: { color: '#e879f9', width: 4 }, extrude: { color: '#000000', depth: 0, angle: 90 }, outer: { color: '#000000', width: 0 }, fx: { ...l.fx, glow: { on: true, color: '#e879f9', size: 22, strength: 2, inner: false } } }),
  clean: () => ({ font: 'Montserrat', fill: 'solid', color: '#ffffff', inner: { color: '#000000', width: 0 }, extrude: { color: '#000000', depth: 0, angle: 90 }, outer: { color: '#000000', width: 0 } })
}
export const makeText = (doc: Doc, text = 'TITRE'): TextLayer => {
  const l: TextLayer = {
    ...base('Texte', doc.w / 2, doc.h * 0.3), kind: 'text', text, font: 'Lilita One', size: 140, spacing: 0, lineHeight: 0.95, align: 'center',
    fill: 'solid', color: '#4ade80', color2: '#16a34a', accent: '#ef4444',
    inner: { color: '#ffffff', width: 10 }, extrude: { color: '#0b0b0b', depth: 10, angle: 100 }, outer: { color: '#ffffff', width: 4 }, italic: false
  }
  l.rot = -4
  return l
}
export const makeTag = (doc: Doc): TagLayer => ({
  ...base('Tag', doc.w * 0.7, doc.h * 0.2), kind: 'tag', text: 'PSEUDO', font: 'Montserrat', size: 38, team: '#22d3ee', textColor: '#ffffff', arrow: 'down', rot: -10
})
export const makeShape = (doc: Doc, shape: ShapeLayer['shape']): ShapeLayer => ({
  ...base(shape === 'rect' ? 'Rectangle' : shape === 'para' ? 'Parallélogramme' : shape === 'ribbon' ? 'Bandeau' : 'Cercle', doc.w / 2, doc.h * 0.8),
  kind: 'shape', shape, w: shape === 'circle' ? 220 : 520, h: shape === 'circle' ? 220 : 110, radius: shape === 'rect' ? 16 : 0,
  fill: 'solid', color: '#ef4444', color2: '#7f1d1d', stroke: '#ffffff', strokeWidth: 0
})
export const makeSpeed = (doc: Doc): SpeedLayer => ({
  ...base('Lignes de vitesse', doc.w / 2, doc.h / 2), kind: 'speed', count: 60, color: '#ffffff', fade: 80, intensity: 90,
  fx0: doc.w / 2, fy0: doc.h / 2, inner: 260, maxLen: 420, maxWidth: 12, seed: Math.floor(Math.random() * 1e6), opacity: 0.9
})
export const LIGHTS: Record<string, { label: string; make: (doc: Doc) => Partial<LightLayer> }> = {
  warm: { label: 'Contre-jour chaud', make: (d) => ({ style: 'glow', color: '#fb923c', color2: '#fde68a', radius: d.h * 0.7, intensity: 0.9 }) },
  cyan: { label: 'Néon cyan', make: (d) => ({ style: 'glow', color: '#22d3ee', color2: '#a5f3fc', radius: d.h * 0.55, intensity: 1 }) },
  rage: { label: 'Rage rouge', make: (d) => ({ style: 'glow', color: '#dc2626', color2: '#f87171', radius: d.h * 0.6, intensity: 1 }) },
  aura: { label: 'Aura violette', make: (d) => ({ style: 'glow', color: '#7c3aed', color2: '#e879f9', radius: d.h * 0.6, intensity: 1 }) },
  spot: { label: 'Projecteur', make: (d) => ({ style: 'spot', color: '#ffffff', color2: '#fef9c3', radius: d.h * 1.1, intensity: 0.7, y: 0 }) },
  rays: { label: 'Rayons divins', make: (d) => ({ style: 'rays', color: '#fef3c7', color2: '#fbbf24', radius: d.w * 0.8, intensity: 0.7, rays: 14, y: d.h * 0.1 }) },
  flare: { label: 'Éclat (flare)', make: (d) => ({ style: 'flare', color: '#ffffff', color2: '#60a5fa', radius: d.h * 0.35, intensity: 1 }) }
}
export const makeLight = (doc: Doc, preset: string): LightLayer => ({
  ...base(LIGHTS[preset]?.label ?? 'Lumière', doc.w / 2, doc.h / 2), kind: 'light', style: 'glow', color: '#ffffff', color2: '#ffffff',
  radius: 300, intensity: 1, rays: 12, blend: 'screen', ...(LIGHTS[preset]?.make(doc) ?? {})
})

/* ---------------------------------------------------------------- images */
const cache = new Map<string, HTMLImageElement>()
let onImageLoad: (() => void) | null = null
export const setImageListener = (fn: (() => void) | null): void => { onImageLoad = fn }
export function image(src: string): HTMLImageElement | null {
  let im = cache.get(src)
  if (!im) {
    im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => onImageLoad?.()
    im.src = src
    cache.set(src, im)
  }
  return im.complete && im.naturalWidth ? im : null
}
export const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((ok, ko) => {
  const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { cache.set(src, im); ok(im) }; im.onerror = ko; im.src = src
})
export const imageSrc = (l: ImageLayer): string => (l.render ? `studio://renders/${l.render.id}/${l.render.files[l.render.frame]}` : l.src)

/* ---------------------------------------------------------------- rendu */
const canvas = (w: number, h: number): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c }
const ctx2d = (c: HTMLCanvasElement): CanvasRenderingContext2D => c.getContext('2d')!

/** Filtre CSS de la colorimétrie (exposition, contraste, saturation, teinte). Température, tint et fondu se font par-dessus. */
export function gradeFilter(g: Grade): string {
  const parts: string[] = []
  if (g.exposure) parts.push(`brightness(${(1 + g.exposure / 100).toFixed(3)})`)
  if (g.contrast) parts.push(`contrast(${(1 + g.contrast / 100).toFixed(3)})`)
  const sat = 1 + g.saturation / 100 + g.vibrance / 200
  if (sat !== 1) parts.push(`saturate(${Math.max(0, sat).toFixed(3)})`)
  if (g.hue) parts.push(`hue-rotate(${g.hue}deg)`)
  return parts.join(' ') || 'none'
}
/** Température / tint / fondu, appliqués sur ce qui est déjà dessiné (`atop` = seulement sur les pixels du calque). */
function gradeOverlay(c: CanvasRenderingContext2D, w: number, h: number, g: Grade, atop: boolean): void {
  c.save()
  c.globalCompositeOperation = atop ? 'source-atop' : 'soft-light'
  if (g.temperature) { c.globalAlpha = Math.min(1, Math.abs(g.temperature) / 100) * (atop ? 0.35 : 0.8); c.fillStyle = g.temperature > 0 ? '#ff8a1f' : '#1f7bff'; c.fillRect(0, 0, w, h) }
  if (g.tint) { c.globalAlpha = Math.min(1, Math.abs(g.tint) / 100) * (atop ? 0.3 : 0.7); c.fillStyle = g.tint > 0 ? '#ff2bd6' : '#2bff6a'; c.fillRect(0, 0, w, h) }
  if (g.fade) { c.globalCompositeOperation = atop ? 'source-atop' : 'lighten'; c.globalAlpha = g.fade / 100 * 0.5; c.fillStyle = '#3a3a44'; c.fillRect(0, 0, w, h) }
  c.restore()
}
const gradeUsed = (g: Grade): boolean => Object.values(g).some((v) => v !== 0)

/** Mesures d'un calque (taille locale, avant échelle) : utilisées pour les poignées et la sélection. */
export const metrics = new Map<string, { w: number; h: number }>()

interface Run { text: string; accent: boolean }
const runs = (line: string): Run[] => line.split(/(\*[^*]+\*)/).filter(Boolean).map((p) => (p.startsWith('*') && p.endsWith('*') && p.length > 2 ? { text: p.slice(1, -1), accent: true } : { text: p, accent: false }))
const fontOf = (l: { font: string; size: number; italic?: boolean }): string => `${l.italic ? 'italic ' : ''}${l.font === 'Montserrat' ? '800 ' : ''}${l.size}px "${l.font}", "Segoe UI", sans-serif`

/** Contenu brut d'un calque, centré dans un canvas (marge `pad` autour pour les effets). */
function content(l: Layer, pad: number): { c: HTMLCanvasElement; w: number; h: number } | null {
  if (l.kind === 'image') {
    const im = image(imageSrc(l))
    const w = im?.naturalWidth || l.w, h = im?.naturalHeight || l.h
    if (!im) return null
    const c = canvas(w + pad * 2, h + pad * 2); const x = ctx2d(c)
    x.drawImage(im, pad, pad, w, h)
    return { c, w, h }
  }
  if (l.kind === 'text') {
    const m = ctx2d(canvas(4, 4)); m.font = fontOf(l); (m as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${l.spacing}px`
    const lines = l.text.split('\n').map(runs)
    const lh = l.size * l.lineHeight
    const widths = lines.map((rs) => rs.reduce((a, r) => a + m.measureText(r.text).width, 0))
    const extra = l.inner.width + l.outer.width + l.extrude.depth + 8
    const w = Math.max(10, ...widths) + l.size * (l.italic ? 0.2 : 0.05), h = lh * lines.length + l.size * 0.25
    const c = canvas(w + (pad + extra) * 2, h + (pad + extra) * 2); const x = ctx2d(c)
    x.font = m.font; (x as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${l.spacing}px`
    x.textBaseline = 'alphabetic'; x.lineJoin = 'round'; x.miterLimit = 2
    const ox = pad + extra, oy = pad + extra
    const top = oy, bottom = oy + h
    const grad = x.createLinearGradient(0, top, 0, bottom); grad.addColorStop(0, l.color); grad.addColorStop(1, l.color2)
    const pass = (draw: (t: string, px: number, py: number, accent: boolean) => void): void => {
      lines.forEach((rs, i) => {
        const lw = widths[i]
        let px = ox + (l.align === 'left' ? 0 : l.align === 'right' ? w - lw : (w - lw) / 2)
        const py = oy + lh * (i + 1) - lh * 0.12
        for (const r of rs) { draw(r.text, px, py, r.accent); px += x.measureText(r.text).width }
      })
    }
    const ang = (l.extrude.angle * Math.PI) / 180, ex = Math.cos(ang), ey = Math.sin(ang)
    // extrusion (relief), puis contour extérieur autour du tout, contour intérieur, remplissage
    if (l.extrude.depth > 0) {
      for (let d = l.extrude.depth; d >= 1; d--) {
        if (l.outer.width > 0) { x.strokeStyle = l.outer.color; x.lineWidth = (l.inner.width + l.outer.width) * 2; pass((t, px, py) => x.strokeText(t, px + ex * d, py + ey * d)) }
      }
      for (let d = l.extrude.depth; d >= 1; d--) {
        x.strokeStyle = l.extrude.color; x.fillStyle = l.extrude.color; x.lineWidth = l.inner.width * 2
        pass((t, px, py) => { if (l.inner.width > 0) x.strokeText(t, px + ex * d, py + ey * d); x.fillText(t, px + ex * d, py + ey * d) })
      }
    }
    if (l.outer.width > 0) { x.strokeStyle = l.outer.color; x.lineWidth = (l.inner.width + l.outer.width) * 2; pass((t, px, py) => x.strokeText(t, px, py)) }
    if (l.inner.width > 0) { x.strokeStyle = l.inner.color; x.lineWidth = l.inner.width * 2; pass((t, px, py) => x.strokeText(t, px, py)) }
    pass((t, px, py, accent) => { x.fillStyle = accent ? l.accent : l.fill === 'gradient' ? grad : l.color; x.fillText(t, px, py) })
    return { c, w: w + extra * 2, h: h + extra * 2 }
  }
  if (l.kind === 'tag') {
    const m = ctx2d(canvas(4, 4)); m.font = fontOf({ font: l.font, size: l.size })
    const tw = m.measureText(l.text).width, arrow = l.size * 0.55
    const w = tw + l.size * 0.6 + (l.arrow === 'left' || l.arrow === 'right' ? arrow * 1.6 : 0)
    const h = l.size * 1.2 + (l.arrow === 'down' || l.arrow === 'up' ? arrow * 1.6 : 0)
    const c = canvas(w + pad * 2, h + pad * 2); const x = ctx2d(c)
    x.font = m.font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round'
    const cx = pad + w / 2 - (l.arrow === 'right' ? arrow * 0.8 : l.arrow === 'left' ? -arrow * 0.8 : 0)
    const cy = pad + h / 2 - (l.arrow === 'down' ? arrow * 0.8 : l.arrow === 'up' ? -arrow * 0.8 : 0)
    x.shadowColor = l.team; x.shadowBlur = l.size * 0.45
    x.strokeStyle = l.team; x.lineWidth = l.size * 0.16; x.strokeText(l.text, cx, cy)
    x.shadowBlur = 0; x.fillStyle = l.textColor; x.fillText(l.text, cx, cy)
    if (l.arrow !== 'none') {
      x.fillStyle = l.textColor; x.strokeStyle = l.team; x.lineWidth = l.size * 0.1
      const a = arrow, p = new Path2D()
      if (l.arrow === 'down') { const y0 = cy + l.size * 0.62; p.moveTo(cx - a * 0.6, y0); p.lineTo(cx + a * 0.6, y0); p.lineTo(cx, y0 + a * 0.8) }
      if (l.arrow === 'up') { const y0 = cy - l.size * 0.62; p.moveTo(cx - a * 0.6, y0); p.lineTo(cx + a * 0.6, y0); p.lineTo(cx, y0 - a * 0.8) }
      if (l.arrow === 'left') { const x0 = cx - tw / 2 - l.size * 0.35; p.moveTo(x0, cy - a * 0.6); p.lineTo(x0, cy + a * 0.6); p.lineTo(x0 - a * 0.8, cy) }
      if (l.arrow === 'right') { const x0 = cx + tw / 2 + l.size * 0.35; p.moveTo(x0, cy - a * 0.6); p.lineTo(x0, cy + a * 0.6); p.lineTo(x0 + a * 0.8, cy) }
      p.closePath(); x.shadowColor = l.team; x.shadowBlur = l.size * 0.3; x.stroke(p); x.shadowBlur = 0; x.fill(p)
    }
    return { c, w, h }
  }
  if (l.kind === 'shape') {
    const sw = l.strokeWidth, w = l.w, h = l.h
    const c = canvas(w + (pad + sw) * 2, h + (pad + sw) * 2); const x = ctx2d(c)
    const ox = pad + sw, oy = pad + sw, p = new Path2D()
    if (l.shape === 'rect') p.roundRect(ox, oy, w, h, Math.min(l.radius, w / 2, h / 2))
    else if (l.shape === 'circle') p.ellipse(ox + w / 2, oy + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    else if (l.shape === 'para') { const k = h * 0.35; p.moveTo(ox + k, oy); p.lineTo(ox + w, oy); p.lineTo(ox + w - k, oy + h); p.lineTo(ox, oy + h); p.closePath() }
    else { const k = h * 0.45; p.moveTo(ox, oy); p.lineTo(ox + w, oy); p.lineTo(ox + w - k, oy + h / 2); p.lineTo(ox + w, oy + h); p.lineTo(ox, oy + h); p.lineTo(ox + k, oy + h / 2); p.closePath() }
    if (l.fill === 'gradient') { const g = x.createLinearGradient(0, oy, 0, oy + h); g.addColorStop(0, l.color); g.addColorStop(1, l.color2); x.fillStyle = g } else x.fillStyle = l.color
    x.fill(p)
    if (sw > 0) { x.lineJoin = 'round'; x.strokeStyle = l.stroke; x.lineWidth = sw * 2; x.save(); x.clip(p, 'evenodd'); x.restore(); x.stroke(p) }
    return { c, w: w + sw * 2, h: h + sw * 2 }
  }
  return null
}

/** Silhouette colorée d'un contenu (pour contour, glow, ombre). */
function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = canvas(src.width, src.height); const x = ctx2d(c)
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height)
  return c
}
/** Dilatation : la silhouette répétée tout autour, sur `r` pixels. */
function ring(target: CanvasRenderingContext2D, sil: HTMLCanvasElement, r: number, ox: number, oy: number): void {
  if (r <= 0) return
  const steps = Math.min(48, Math.max(12, Math.round(r * 3)))
  for (let i = 0; i < steps; i++) { const a = (i / steps) * Math.PI * 2; target.drawImage(sil, ox + Math.cos(a) * r, oy + Math.sin(a) * r) }
  if (r > 3) for (let i = 0; i < steps; i++) { const a = (i / steps) * Math.PI * 2; target.drawImage(sil, ox + Math.cos(a) * r * 0.5, oy + Math.sin(a) * r * 0.5) }
}

/** Calque avec ses effets, prêt à poser : canvas centré sur le calque (taille locale + marge). */
function layerBitmap(l: Layer): { c: HTMLCanvasElement; w: number; h: number; pad: number } | null {
  const fx = l.fx
  const pad = Math.ceil(Math.max(
    fx.outline.on ? fx.outline.width + (fx.outline2.on ? fx.outline2.width : 0) : 0,
    fx.glow.on ? fx.glow.size * 2 : 0,
    fx.shadow.on ? fx.shadow.blur * 2 + Math.max(Math.abs(fx.shadow.dx), Math.abs(fx.shadow.dy)) : 0,
    fx.motion.on ? fx.motion.dist : 0,
    fx.blur * 2
  )) + 4
  const raw = content(l, pad)
  if (!raw) return null
  let src = raw.c
  // colorimétrie du calque
  if (gradeUsed(fx.grade)) {
    const g = canvas(src.width, src.height); const x = ctx2d(g)
    x.filter = gradeFilter(fx.grade); x.drawImage(src, 0, 0); x.filter = 'none'
    gradeOverlay(x, g.width, g.height, fx.grade, true)
    src = g
  }
  const any = fx.outline.on || fx.glow.on || fx.shadow.on || fx.motion.on || fx.blur > 0
  if (!any) return { c: src, w: raw.w, h: raw.h, pad: (src.width - raw.w) / 2 }
  const out = canvas(src.width, src.height); const x = ctx2d(out)
  if (fx.shadow.on) {
    x.save(); x.globalAlpha = fx.shadow.opacity; x.filter = `blur(${fx.shadow.blur}px)`
    x.drawImage(silhouette(src, fx.shadow.color), fx.shadow.dx, fx.shadow.dy); x.restore()
  }
  if (fx.glow.on && !fx.glow.inner) {
    const sil = silhouette(src, fx.glow.color)
    x.save(); x.filter = `blur(${fx.glow.size / 2}px)`
    for (let k = 0; k < Math.ceil(fx.glow.strength); k++) { x.globalAlpha = Math.min(1, fx.glow.strength - k); ring(x, sil, fx.glow.size / 3, 0, 0); x.drawImage(sil, 0, 0) }
    x.restore()
  }
  if (fx.outline.on) {
    if (fx.outline2.on) ring(x, silhouette(src, fx.outline2.color), fx.outline.width + fx.outline2.width, 0, 0)
    const ol = canvas(src.width, src.height); const ox = ctx2d(ol)
    ring(ox, silhouette(src, fx.outline.color), fx.outline.width, 0, 0)
    x.save(); if (fx.outline.soft) x.filter = `blur(${fx.outline.soft / 10}px)`; x.drawImage(ol, 0, 0); x.restore()
  }
  if (fx.motion.on) {
    const a = (fx.motion.angle * Math.PI) / 180, n = 8
    for (let i = n; i >= 1; i--) { x.save(); x.globalAlpha = 0.5 * (1 - i / (n + 1)); x.drawImage(src, Math.cos(a) * fx.motion.dist * (i / n), Math.sin(a) * fx.motion.dist * (i / n)); x.restore() }
  }
  x.save(); if (fx.blur > 0) x.filter = `blur(${fx.blur}px)`; x.drawImage(src, 0, 0); x.restore()
  if (fx.glow.on && fx.glow.inner) {
    const inner = canvas(src.width, src.height); const ix = ctx2d(inner)
    ix.drawImage(src, 0, 0); ix.globalCompositeOperation = 'source-atop'; ix.filter = `blur(${fx.glow.size / 2}px)`
    ix.globalAlpha = Math.min(1, fx.glow.strength / 2); ix.lineWidth = fx.glow.size; ix.strokeStyle = fx.glow.color; ix.strokeRect(0, 0, inner.width, inner.height)
    const inv = canvas(src.width, src.height); const vx = ctx2d(inv); vx.fillStyle = fx.glow.color; vx.fillRect(0, 0, inv.width, inv.height); vx.globalCompositeOperation = 'destination-out'; vx.drawImage(src, 0, 0)
    ix.drawImage(inv, 0, 0)
    x.drawImage(inner, 0, 0)
  }
  return { c: out, w: raw.w, h: raw.h, pad: (out.width - raw.w) / 2 }
}

/** Petit générateur pseudo-aléatoire reproductible (lignes de vitesse). */
function rng(seed: number): () => number { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000 } }

function drawSpeed(x: CanvasRenderingContext2D, l: SpeedLayer, doc: Doc): void {
  const r = rng(l.seed), far = Math.hypot(doc.w, doc.h)
  x.save(); x.globalAlpha *= l.intensity / 100
  for (let i = 0; i < l.count; i++) {
    const a = r() * Math.PI * 2, start = l.inner + r() * l.maxLen * 0.3, len = l.maxLen * (0.3 + r() * 0.7), wdt = 1 + r() * l.maxWidth
    const r0 = start, r1 = Math.min(far, start + len + far * 0.6 * r())
    const p0x = l.fx0 + Math.cos(a) * r0, p0y = l.fy0 + Math.sin(a) * r0, p1x = l.fx0 + Math.cos(a) * r1, p1y = l.fy0 + Math.sin(a) * r1
    const nx = -Math.sin(a) * wdt / 2, ny = Math.cos(a) * wdt / 2
    const g = x.createLinearGradient(p0x, p0y, p1x, p1y)
    g.addColorStop(0, `${l.color}00`); g.addColorStop(Math.min(0.99, 1 - l.fade / 100 + 0.01), l.color); g.addColorStop(1, l.color)
    x.fillStyle = g; x.beginPath(); x.moveTo(p0x, p0y); x.lineTo(p1x + nx, p1y + ny); x.lineTo(p1x - nx, p1y - ny); x.closePath(); x.fill()
  }
  x.restore()
}
function drawLight(x: CanvasRenderingContext2D, l: LightLayer): void {
  const R = l.radius
  x.save(); x.globalAlpha *= l.intensity
  if (l.style === 'glow' || l.style === 'flare') {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, R)
    g.addColorStop(0, l.color2); g.addColorStop(l.style === 'flare' ? 0.08 : 0.25, l.color); g.addColorStop(1, `${l.color}00`)
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, R, 0, Math.PI * 2); x.fill()
    if (l.style === 'flare') {
      for (const [w, h] of [[R * 2.4, R * 0.05], [R * 0.05, R * 1.2]] as const) {
        const s = x.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) / 2); s.addColorStop(0, l.color2); s.addColorStop(1, `${l.color}00`)
        x.fillStyle = s; x.beginPath(); x.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); x.fill()
      }
    }
  } else if (l.style === 'spot') {
    const g = x.createLinearGradient(0, 0, 0, R); g.addColorStop(0, l.color2); g.addColorStop(1, `${l.color}00`)
    x.fillStyle = g; x.beginPath(); x.moveTo(-R * 0.08, 0); x.lineTo(R * 0.08, 0); x.lineTo(R * 0.45, R); x.lineTo(-R * 0.45, R); x.closePath(); x.fill()
  } else {
    for (let i = 0; i < l.rays; i++) {
      const a = Math.PI * 0.15 + (i / Math.max(1, l.rays - 1)) * Math.PI * 0.7, w = 0.035 + ((i * 7) % 5) * 0.012
      const g = x.createLinearGradient(0, 0, Math.cos(a) * R, Math.sin(a) * R); g.addColorStop(0, l.color2); g.addColorStop(1, `${l.color}00`)
      x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a - w) * R, Math.sin(a - w) * R); x.lineTo(Math.cos(a + w) * R, Math.sin(a + w) * R); x.closePath(); x.fill()
    }
  }
  x.restore()
}

/** Dessine la scène entière dans `ctx` (taille doc.w × doc.h, multipliée par `scale`). */
export function drawDoc(target: CanvasRenderingContext2D, doc: Doc, scale = 1): void {
  const W = doc.w * scale, H = doc.h * scale
  const scene = canvas(W, H); const x = ctx2d(scene)
  x.scale(scale, scale)
  x.fillStyle = doc.bg; x.fillRect(0, 0, doc.w, doc.h)
  if (doc.tilt) {
    // la scène entière penche, agrandie pour couvrir les coins
    const a = (doc.tilt * Math.PI) / 180, k = Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)) * Math.max(doc.w / doc.h, doc.h / doc.w)
    x.translate(doc.w / 2, doc.h / 2); x.rotate(a); x.scale(k, k); x.translate(-doc.w / 2, -doc.h / 2)
  }
  for (const l of doc.layers) {
    if (!l.visible) continue
    x.save()
    x.globalAlpha = l.opacity; x.globalCompositeOperation = l.blend
    if (l.kind === 'speed') { drawSpeed(x, l, doc); metrics.set(l.id, { w: doc.w, h: doc.h }); x.restore(); continue }
    x.translate(l.x, l.y); x.rotate((l.rot * Math.PI) / 180); x.scale(l.sx * (l.flipH ? -1 : 1), l.sy * (l.flipV ? -1 : 1))
    if (l.kind === 'light') { drawLight(x, l); metrics.set(l.id, { w: l.radius * 2, h: l.radius * 2 }); x.restore(); continue }
    const b = layerBitmap(l)
    if (b) { metrics.set(l.id, { w: b.w, h: b.h }); x.drawImage(b.c, -b.c.width / 2, -b.c.height / 2) }
    else if (l.kind === 'image') metrics.set(l.id, { w: l.w, h: l.h })
    x.restore()
  }
  // colorimétrie et vignette du projet
  target.save()
  target.clearRect(0, 0, W, H)
  target.filter = gradeFilter(doc.grade); target.drawImage(scene, 0, 0); target.filter = 'none'
  if (gradeUsed(doc.grade)) gradeOverlay(target, W, H, doc.grade, false)
  if (doc.vignette > 0) {
    const g = target.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2)
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${(doc.vignette / 100) * 0.85})`)
    target.fillStyle = g; target.fillRect(0, 0, W, H)
  }
  target.restore()
}

/** Préréglages de colorimétrie du projet. */
export const GRADES: Record<string, { label: string; grade: Partial<Grade>; vignette?: number }> = {
  none: { label: 'Aucun', grade: {} },
  vivid: { label: 'Vif YouTube', grade: { contrast: 12, saturation: 25, vibrance: 20, exposure: 4 }, vignette: 20 },
  warm: { label: 'Chaud', grade: { temperature: 35, saturation: 10, contrast: 8 }, vignette: 15 },
  cold: { label: 'Froid', grade: { temperature: -35, tint: -5, contrast: 8 }, vignette: 15 },
  cinema: { label: 'Cinéma (teal & orange)', grade: { contrast: 18, saturation: -8, temperature: 12, tint: -10, fade: 12 }, vignette: 35 },
  punch: { label: 'Punchy', grade: { contrast: 30, saturation: 35, exposure: 6 }, vignette: 25 },
  faded: { label: 'Délavé', grade: { contrast: -18, saturation: -20, fade: 40 } },
  bw: { label: 'Noir & blanc', grade: { saturation: -100, contrast: 20 } },
  night: { label: 'Nuit', grade: { exposure: -25, temperature: -45, saturation: -15, contrast: 10 }, vignette: 45 }
}

/** Point de la scène → repère local du calque (pour la sélection au clic). */
export function toLocal(l: Layer, px: number, py: number): { x: number; y: number } {
  const dx = px - l.x, dy = py - l.y, a = (-l.rot * Math.PI) / 180
  const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a)
  return { x: rx / (l.sx * (l.flipH ? -1 : 1)), y: ry / (l.sy * (l.flipV ? -1 : 1)) }
}
export function hit(l: Layer, px: number, py: number): boolean {
  if (l.kind === 'speed') return false
  const m = metrics.get(l.id); if (!m) return false
  const p = toLocal(l, px, py)
  return Math.abs(p.x) <= m.w / 2 && Math.abs(p.y) <= m.h / 2
}
/** Coins du calque dans la scène (poignées). */
export function corners(l: Layer): [number, number][] {
  const m = metrics.get(l.id) ?? { w: 100, h: 100 }
  const a = (l.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([u, v]) => {
    const lx = (u * m.w * l.sx) / 2, ly = (v * m.h * l.sy) / 2
    return [l.x + lx * c - ly * s, l.y + lx * s + ly * c]
  })
}
