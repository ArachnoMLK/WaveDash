// Studio thumbnail editor (inspired by MiniaMaker): layers, game asset bank, effects, colour grading, YouTube export.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import type { StudioAnim, StudioAnimGroup, StudioAssetKind, StudioCatalog, StudioItem, StudioKind, StudioRender, StudioRenderRequest, StudioWeaponSkins } from '@shared/studio'
import { weaponName, weaponOfAnim } from '@shared/studio'
import { useApp } from '../../lib/AppContext'
import '../../studio-editor.css'
import { Thumb } from './Thumb'
import {
  corners, drawDoc, GRADES, hit, imageSrc, LIGHTS, loadImage, makeBackground, makeImage, makeLight, makeShape, makeSpeed, makeTag, makeText, presetLabel, setSceneFrench,
  metrics, newDoc, setImageListener, TEXT_STYLES, uid, NEUTRAL,
  type Doc, type Grade, type ImageLayer, type Layer, type ShapeLayer, type TextLayer
} from './scene'

const studio = window.api.studio
const AUTOSAVE = 'studio:mini:doc'
const FONTS = ['Lilita One', 'Anton', 'Luckiest Guy', 'Bangers', 'Bebas Neue', 'Montserrat']
const clone = <T,>(v: T): T => structuredClone(v)
const store = {
  get<T>(k: string, d: T): T { try { return (JSON.parse(localStorage.getItem(k) ?? 'null') as T) ?? d } catch { return d } },
  set(k: string, v: unknown): void { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* full or unavailable */ } }
}

/** Waits for an engine render to finish. */
async function renderNow(req: StudioRenderRequest): Promise<StudioRender> {
  let j = await studio.render(req)
  while (j.status === 'running') { await new Promise((r) => setTimeout(r, 400)); j = (await studio.job(j.id)) ?? j }
  if (j.status !== 'done' || !j.result) throw new Error(j.error || 'rendu impossible')
  return j.result
}

/* ---------------------------------------------------------------- small controls */
function Slider({ label, value, min, max, step = 1, unit = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }): JSX.Element {
  return (
    <label className="mm-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(min < 0 ? 0 : min)} />
      <em>{Number.isInteger(step) ? Math.round(value) : value.toFixed(2)}{unit}</em>
    </label>
  )
}
function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }): JSX.Element {
  return <label className="mm-color"><span>{label}</span><input type="color" value={value} onChange={(e) => onChange(e.target.value)} /></label>
}
function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return <label className="mm-check"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>
}
function Section({ title, children, open = true, right }: { title: string; children: ReactNode; open?: boolean; right?: ReactNode }): JSX.Element {
  const [o, setO] = useState(open)
  return (
    <div className="mm-sec">
      <button className="mm-sec-h" onClick={() => setO(!o)}><span>{o ? '▾' : '▸'} {title}</span>{right}</button>
      {o && <div className="mm-sec-b">{children}</div>}
    </div>
  )
}
function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }): JSX.Element {
  return <label className="mm-num"><span>{label}</span><input type="number" step={step} value={Math.round(value * 100) / 100} onChange={(e) => onChange(Number(e.target.value))} /></label>
}


/* ---------------------------------------------------------------- asset bank */
type BankTab = 'legend' | 'maps' | 'elements' | 'images' | 'effects' | 'cosmetics' | 'library'
interface BankPick { add: (l: Layer, background?: boolean) => void; doc: Doc }

function Bank({ start, onClose, pick, tr }: { start: BankTab; onClose: () => void; pick: BankPick; tr: (en: string, fr: string) => string }): JSX.Element {
  const [tab, setTab] = useState<BankTab>(start)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const tabs: [BankTab, string][] = [
    ['legend', tr('Legends', 'Légendes')], ['maps', tr('Map backgrounds', 'Fonds de map')], ['elements', tr('Map elements', 'Éléments de map')],
    ['images', tr('Game images', 'Images du jeu')], ['effects', tr('Effects', 'Effets')], ['cosmetics', tr('Cosmetics', 'Cosmétiques')], ['library', tr('Library', 'Bibliothèque')]
  ]
  /** Engine render then layer (with all its frames to pick the pose). */
  const addRender = async (req: StudioRenderRequest, name: string, frame?: number): Promise<void> => {
    setBusy(name); setErr('')
    try {
      const r = await renderNow(req)
      const f = Math.min(r.files.length - 1, Math.max(0, frame ?? 0))
      pick.add(makeImage('', r.width, r.height, name, pick.doc, { id: r.id, files: r.files, frame: f }))
      onClose()
    } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }
  const addGameImage = async (path: string, background: boolean): Promise<void> => {
    const src = `studio://game/${path.split('/').map(encodeURIComponent).join('/')}`
    setBusy(path); setErr('')
    try {
      const im = await loadImage(src)
      const name = path.split('/').pop()!.replace(/\.\w+$/, '')
      pick.add(background ? makeBackground(src, im.naturalWidth, im.naturalHeight, name, pick.doc) : makeImage(src, im.naturalWidth, im.naturalHeight, name, pick.doc), background)
      onClose()
    } catch { setErr(tr('Unreadable image', 'Image illisible')) } finally { setBusy('') }
  }
  return (
    <div className="mm-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mm-bank">
        <div className="mm-bank-h">
          <b>{tr('Brawlhalla asset bank', 'Banque d’assets Brawlhalla')}</b>
          <div className="mm-tabs">{tabs.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
          {busy && <span className="muted small row"><i className="st-spin" /> {tr('Rendering…', 'Rendu…')}</span>}
          {err && <span className="err small">{err}</span>}
          <button className="btn small mm-x" onClick={onClose}>✕</button>
        </div>
        <div className="mm-bank-b">
          {tab === 'legend' && <BankLegend tr={tr} busy={!!busy} onAdd={(req, name, frame) => void addRender(req, name, frame)} />}
          {tab === 'maps' && <BankAssets kind="backgrounds" tr={tr} onPick={(p) => void addGameImage(p, true)} />}
          {tab === 'elements' && <BankAssets kind="maps" tr={tr} onPick={(p) => void addGameImage(p, false)} />}
          {tab === 'images' && <BankAssets kind="images" tr={tr} extraKinds onPick={(p) => void addGameImage(p, false)} />}
          {tab === 'effects' && <BankEffects tr={tr} onAdd={(req, name) => void addRender(req, name, Infinity)} />}
          {tab === 'cosmetics' && <BankCosmetics tr={tr} onAdd={(req, name) => void addRender(req, name)} />}
          {tab === 'library' && <BankLibrary tr={tr} onPick={(r) => { pick.add(makeImage('', r.width, r.height, r.label, pick.doc, { id: r.id, files: r.files, frame: 0 })); onClose() }} />}
        </div>
      </div>
    </div>
  )
}

function BankLegend({ tr, busy, onAdd }: { tr: (en: string, fr: string) => string; busy: boolean; onAdd: (req: StudioRenderRequest, name: string, frame?: number) => void }): JSX.Element {
  const { settings } = useApp()
  const [cat, setCat] = useState<StudioCatalog | null>(null)
  const [q, setQ] = useState('')
  const [hero, setHero] = useState<string>(store.get('studio:mini:hero', 'Ninetails'))
  const [costume, setCostume] = useState('')
  const [color, setColor] = useState('')
  const [groups, setGroups] = useState<StudioAnimGroup[] | null>(null)
  const [group, setGroup] = useState('emotes')
  const [anim, setAnim] = useState<StudioAnim | null>(null)
  const [aq, setAq] = useState('')
  const [wskins, setWskins] = useState<StudioWeaponSkins>({})
  const [wpick, setWpick] = useState<Record<string, string>>({})
  useEffect(() => { void studio.catalog().then(setCat) }, [])
  useEffect(() => {
    setGroups(null); setAnim(null); setWpick({}); store.set('studio:mini:hero', hero)
    void studio.legendAnims(hero).then((g) => { setGroups(g); setGroup((cur) => (g.some((x) => x.id === cur) ? cur : g[0]?.id ?? '')) })
    void studio.weaponSkins(hero).then(setWskins)
  }, [hero])
  const heroes = useMemo(() => (cat?.heroes ?? []).filter((h) => !q || h.bio.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.bio.localeCompare(b.bio)), [cat, q])
  const costumes = useMemo(() => (cat?.costumes ?? []).filter((c) => c.hero === hero), [cat, hero])
  useEffect(() => { setCostume(costumes[0]?.name ?? '') }, [costumes])
  const weapons = cat?.heroes.find((h) => h.name === hero)?.weapons ?? []
  const anims = (groups?.find((g) => g.id === group)?.items ?? []).filter((a) => !aq || a.label.toLowerCase().includes(aq.toLowerCase()) || a.name.toLowerCase().includes(aq.toLowerCase()))
  const req = (a: StudioAnim, scale: number): StudioRenderRequest => {
    const w = weaponOfAnim(a.animClass, weapons)
    return { kind: 'legend', animClass: a.animClass, animation: a.name, animations: a.parts, costume, color: color || undefined, weapon: w ? wpick[w] || undefined : undefined, scale }
  }
  const skin = costumes.find((c) => c.name === costume)
  const heroBio = cat?.heroes.find((h) => h.name === hero)?.bio ?? hero
  return (
    <div className="mm-legend">
      <div className="mm-col">
        <input type="search" placeholder={tr('Search a legend', 'Rechercher une légende')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mm-list">
          {heroes.map((h) => <button key={h.name} className={h.name === hero ? 'on' : ''} onClick={() => setHero(h.name)}>{h.bio}</button>)}
        </div>
      </div>
      <div className="mm-col grow">
        <div className="mm-row3">
          <label className="st-field"><span>{tr('Skin', 'Skin')}</span><select value={costume} onChange={(e) => setCostume(e.target.value)}>{costumes.map((c) => <option key={c.name} value={c.name}>{c.display}</option>)}</select></label>
          <label className="st-field"><span>{tr('Color', 'Couleur')}</span><select value={color} onChange={(e) => setColor(e.target.value)}><option value="">{tr('Skin default', 'Défaut du skin')}</option>{(cat?.colors ?? []).filter((c) => c !== 'NO_COLOR_SCHEME').map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          {weapons.map((w) => (
            <label key={w} className="st-field"><span>{weaponName(w, settings.lang)}</span>
              <select value={wpick[w] ?? ''} onChange={(e) => setWpick({ ...wpick, [w]: e.target.value })}>
                <option value="">{tr('Skin weapon', 'Arme du skin')}</option>
                {(wskins[w] ?? []).map((x) => <option key={x.name} value={x.name}>{x.own ? '★ ' : ''}{x.display}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="mm-tabs small">{(groups ?? []).map((g) => <button key={g.id} className={g.id === group ? 'on' : ''} onClick={() => setGroup(g.id)}>{g.label} <small>{g.items.length}</small></button>)}</div>
        <input type="search" placeholder={tr('Filter animations', 'Filtrer les animations')} value={aq} onChange={(e) => setAq(e.target.value)} />
        {!groups ? <p className="muted small">{tr('Loading…', 'Chargement…')}</p> : (
          <div className="mm-grid">
            {anims.slice(0, 160).map((a) => (
              <button key={a.animClass + a.name} className={`st-card ${anim === a ? 'on' : ''}`} onClick={() => setAnim(a)} onDoubleClick={() => onAdd(req(a, 3), `${skin?.display || heroBio} · ${a.label}`)} title={a.name}>
                <Thumb req={req(a, 0.7)} /><span>{a.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mm-col mm-side">
        {anim ? <div className="st-stage small"><Thumb req={req(anim, 1)} /></div> : <p className="muted small">{tr('Pick an animation (double-click: add).', 'Choisis une animation (double-clic : ajouter).')}</p>}
        <button className="btn primary" disabled={!anim || busy} onClick={() => anim && onAdd(req(anim, 3), `${skin?.display || heroBio} · ${anim.label}`)}>{tr('Add to canvas', 'Ajouter au canvas')}</button>
        <p className="muted small">{tr('Then pick the exact frame in the strip under the canvas.', 'La pose se choisit ensuite image par image dans la bande sous le canvas.')}</p>
      </div>
    </div>
  )
}

function BankAssets({ kind, tr, onPick, extraKinds }: { kind: StudioAssetKind; tr: (en: string, fr: string) => string; onPick: (path: string) => void; extraKinds?: boolean }): JSX.Element {
  const [k, setK] = useState<StudioAssetKind>(kind)
  const [q, setQ] = useState('')
  const [items, setItems] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  useEffect(() => { setK(kind) }, [kind])
  useEffect(() => {
    let alive = true
    const h = setTimeout(() => void studio.assets(k, q, 0, 120).then((p) => { if (alive) { setItems(p.items); setTotal(p.total) } }), 200)
    return () => { alive = false; clearTimeout(h) }
  }, [k, q])
  const more = (): void => { void studio.assets(k, q, items.length, 120).then((p) => setItems((cur) => [...cur, ...p.items])) }
  return (
    <div className="mm-col grow">
      <div className="row">
        {extraKinds && (
          <select value={k} onChange={(e) => setK(e.target.value as StudioAssetKind)} style={{ maxWidth: 220 }}>
            <option value="images">{tr('Game images', 'Images du jeu')}</option>
            <option value="avatars">{tr('Avatars', 'Avatars')}</option>
            <option value="banners">{tr('Banners', 'Bannières')}</option>
            <option value="sprites">{tr('Sprites', 'Sprites')}</option>
          </select>
        )}
        <input type="search" placeholder={tr('Search…', 'Rechercher…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted small">{total}</span>
      </div>
      <div className={`mm-grid ${kind === 'backgrounds' ? 'wide' : ''}`}>
        {items.map((f) => (
          <button key={f} className="st-card" title={f} onClick={() => onPick(f)}>
            <div className="st-thumb"><img loading="lazy" src={`studio://game/${f.split('/').map(encodeURIComponent).join('/')}`} alt="" /></div>
            <span>{f.split('/').pop()!.replace(/\.\w+$/, '').replace(/^BG_/, '')}</span>
          </button>
        ))}
      </div>
      {items.length < total && <button className="btn small" onClick={more}>{tr('More', 'Plus')}</button>}
    </div>
  )
}

function BankEffects({ tr, onAdd }: { tr: (en: string, fr: string) => string; onAdd: (req: StudioRenderRequest, name: string) => void }): JSX.Element {
  const [cat, setCat] = useState<StudioCatalog | null>(null)
  const [src, setSrc] = useState<string>(store.get('studio:mini:fxsrc', '*'))
  const [items, setItems] = useState<StudioItem[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => { void studio.catalog().then(setCat) }, [])
  useEffect(() => { setItems(null); store.set('studio:mini:fxsrc', src); void studio.items('effect', '', src).then(setItems) }, [src])
  const shown = (items ?? []).filter((x) => !q || x.display.toLowerCase().includes(q.toLowerCase())).slice(0, 240)
  return (
    <div className="mm-col grow">
      <div className="row">
        <select value={src} onChange={(e) => setSrc(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="*">{tr('All effects', 'Tous les effets')}</option>
          {[...(cat?.heroes ?? [])].sort((a, b) => a.bio.localeCompare(b.bio)).map((h) => <option key={h.name} value={`hero:${h.name}`}>{h.bio}</option>)}
        </select>
        <input type="search" placeholder={tr('Search: fire, hit, explosion…', 'Rechercher : fire, hit, explosion…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted small">{items ? items.length : '…'}</span>
      </div>
      {!items ? <p className="muted small">{tr('Indexing game effects…', 'Inventaire des effets du jeu…')}</p> : (
        <div className="mm-grid">
          {shown.map((x) => (
            <button key={x.animClass + x.name} className="st-card" title={x.animClass} onClick={() => onAdd({ kind: 'effect', animClass: x.animClass, sequence: x.sequence, scale: 2 }, x.display)}>
              <Thumb req={{ kind: 'effect', animClass: x.animClass }} /><span>{x.display}{x.sequence && <small className="muted"> · {x.sequence.length}</small>}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BankCosmetics({ tr, onAdd }: { tr: (en: string, fr: string) => string; onAdd: (req: StudioRenderRequest, name: string) => void }): JSX.Element {
  const kinds: [StudioKind, string][] = [['emoji', tr('Emojis', 'Emojis')], ['companion', tr('Companions', 'Compagnons')], ['sidekick', tr('Sidekicks', 'Sidekicks')], ['podium', tr('Podiums', 'Podiums')], ['frame', tr('Frames', 'Cadres')], ['insignia', tr('Insignias', 'Insignes')], ['portrait', tr('Portraits', 'Portraits')]]
  const [kind, setKind] = useState<StudioKind>('emoji')
  const [items, setItems] = useState<StudioItem[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => { setItems(null); void studio.items(kind, '').then(setItems) }, [kind])
  const shown = (items ?? []).filter((x) => !q || x.display.toLowerCase().includes(q.toLowerCase())).slice(0, 240)
  const req = (x: StudioItem, scale: number): StudioRenderRequest => (kind === 'portrait' ? { kind, animClass: x.animClass, scale } : { kind, item: x.name, scale })
  return (
    <div className="mm-col grow">
      <div className="row">
        <div className="mm-tabs small">{kinds.map(([k, l]) => <button key={k} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
        <input type="search" placeholder={tr('Search…', 'Rechercher…')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!items ? <p className="muted small">{tr('Loading…', 'Chargement…')}</p> : (
        <div className="mm-grid">
          {shown.map((x) => (
            <button key={x.animClass + x.name} className="st-card" onClick={() => onAdd(req(x, 2), x.display)} title={x.name}>
              <Thumb req={req(x, 0.9)} /><span>{x.display}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BankLibrary({ tr, onPick }: { tr: (en: string, fr: string) => string; onPick: (r: StudioRender) => void }): JSX.Element {
  const [lib, setLib] = useState<StudioRender[] | null>(null)
  useEffect(() => { void studio.library().then(setLib) }, [])
  if (!lib) return <p className="muted small">{tr('Loading…', 'Chargement…')}</p>
  if (!lib.length) return <p className="muted small">{tr('No renders yet: make some in the Create tab.', 'Aucun rendu : crée-en dans l’onglet Créer.')}</p>
  return (
    <div className="mm-grid">
      {lib.map((r) => (
        <button key={r.id} className="st-card" onClick={() => onPick(r)} title={r.label}>
          <div className="st-thumb"><img loading="lazy" src={`studio://renders/${r.id}/${r.files[0]}`} alt="" /></div><span>{r.label}</span>
        </button>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- export */
function ExportModal({ doc, onClose, tr }: { doc: Doc; onClose: () => void; tr: (en: string, fr: string) => string }): JSX.Element {
  const [name, setName] = useState(doc.name || 'miniature')
  const [fmt, setFmt] = useState<'png' | 'jpg' | 'webp'>(store.get('studio:mini:fmt', 'jpg'))
  const [big, setBig] = useState<boolean>(store.get('studio:mini:big', true))
  const [quality, setQuality] = useState(92)
  const [limit, setLimit] = useState(true)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [note, setNote] = useState('')
  const preview = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let alive = true
    const h = setTimeout(async () => {
      const scale = big ? 1.5 : 1
      const c = document.createElement('canvas'); c.width = doc.w * scale; c.height = doc.h * scale
      drawDoc(c.getContext('2d')!, doc, scale)
      const p = preview.current
      if (p) { p.width = 480; p.height = 270; p.getContext('2d')!.drawImage(c, 0, 0, 480, 270) }
      const type = fmt === 'png' ? 'image/png' : fmt === 'jpg' ? 'image/jpeg' : 'image/webp'
      let q = quality / 100
      let b = await new Promise<Blob | null>((ok) => c.toBlob(ok, type, q))
      // YouTube rejects thumbnails over 2 MB: lower the quality if needed
      while (limit && fmt !== 'png' && b && b.size > 2 * 1024 * 1024 && q > 0.4) { q -= 0.06; b = await new Promise<Blob | null>((ok) => c.toBlob(ok, type, q)) }
      if (alive) setBlob(b)
    }, 250)
    return () => { alive = false; clearTimeout(h) }
  }, [doc, fmt, big, quality, limit])
  const save = async (): Promise<void> => {
    if (!blob) return
    store.set('studio:mini:fmt', fmt); store.set('studio:mini:big', big)
    const r = await studio.saveImage(new Uint8Array(await blob.arrayBuffer()), name, fmt)
    if (r.ok) setNote(tr(`Saved: ${r.path}`, `Enregistré : ${r.path}`))
  }
  return (
    <div className="mm-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mm-export">
        <div className="mm-bank-h"><b>{tr('Export', 'Exporter')}</b><span className="muted small">{tr('Final image for YouTube', 'Image finale pour YouTube')}</span><button className="btn small mm-x" onClick={onClose}>✕</button></div>
        <div className="mm-export-b">
          <canvas ref={preview} className="mm-export-prev" />
          <div className="mm-col grow">
            <label className="st-field"><span>{tr('Name', 'Nom')}</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <div className="mm-tabs">{(['png', 'jpg', 'webp'] as const).map((f) => <button key={f} className={f === fmt ? 'on' : ''} onClick={() => setFmt(f)}>{f === 'png' ? tr('PNG (lossless)', 'PNG (sans perte)') : f.toUpperCase()}</button>)}</div>
            <div className="mm-tabs">{[false, true].map((b) => <button key={String(b)} className={b === big ? 'on' : ''} onClick={() => setBig(b)}>{b ? '1920 × 1080' : '1280 × 720'}</button>)}</div>
            {fmt !== 'png' && <Slider label={tr('Quality', 'Qualité')} value={quality} min={40} max={100} unit=" %" onChange={setQuality} />}
            {fmt !== 'png' && <Check label={tr('Stay under 2 MB (YouTube limit)', 'Rester sous 2 Mo (limite YouTube)')} value={limit} onChange={setLimit} />}
            <p className="muted small">{tr('File', 'Fichier')} : {blob ? `${Math.round(blob.size / 1024)} Ko` : '…'}</p>
            <button className="btn primary" disabled={!blob} onClick={() => void save()}>{tr('Save image…', 'Enregistrer l’image…')}</button>
            {note && <p className="small muted">{note}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- inspector */
function GradeControls({ g, set, tr }: { g: Grade; set: (k: keyof Grade, v: number) => void; tr: (en: string, fr: string) => string }): JSX.Element {
  return (
    <>
      <Slider label={tr('Exposure', 'Exposition')} value={g.exposure} min={-100} max={100} onChange={(v) => set('exposure', v)} />
      <Slider label={tr('Contrast', 'Contraste')} value={g.contrast} min={-100} max={100} onChange={(v) => set('contrast', v)} />
      <Slider label={tr('Saturation', 'Saturation')} value={g.saturation} min={-100} max={100} onChange={(v) => set('saturation', v)} />
      <Slider label={tr('Vibrance', 'Vibrance')} value={g.vibrance} min={-100} max={100} onChange={(v) => set('vibrance', v)} />
      <Slider label={tr('Temperature', 'Température')} value={g.temperature} min={-100} max={100} onChange={(v) => set('temperature', v)} />
      <Slider label={tr('Tint (green / magenta)', 'Teinte (vert / magenta)')} value={g.tint} min={-100} max={100} onChange={(v) => set('tint', v)} />
      <Slider label={tr('Hue shift', 'Décalage de teinte')} value={g.hue} min={-180} max={180} unit="°" onChange={(v) => set('hue', v)} />
      <Slider label={tr('Faded blacks', 'Noirs délavés')} value={g.fade} min={0} max={100} onChange={(v) => set('fade', v)} />
    </>
  )
}

function LayerProps({ l, upd, tr, doc }: { l: Layer; upd: (fn: (l: Layer) => void, key?: string) => void; tr: (en: string, fr: string) => string; doc: Doc }): JSX.Element {
  const u = <K extends Layer>(fn: (x: K) => void, key?: string): void => upd((x) => fn(x as K), key)
  return (
    <>
      <div className="mm-name"><input type="text" value={l.name} onChange={(e) => upd((x) => { x.name = e.target.value }, 'name')} /></div>
      {l.kind === 'image' && l.render && (
        <Section title={tr('Pose', 'Pose')}>
          <p className="muted small">{tr(`Frame ${l.render.frame + 1} / ${l.render.files.length} — pick it in the strip under the canvas.`, `Image ${l.render.frame + 1} / ${l.render.files.length} — choisis-la dans la bande sous le canvas.`)}</p>
          <button className="btn small" onClick={() => u<ImageLayer>((x) => { if (x.render) x.render.frame = Math.floor(Math.random() * x.render.files.length) })}>🎲 {tr('Random pose', 'Pose aléatoire')}</button>
        </Section>
      )}
      {l.kind === 'text' && (
        <Section title={tr('Text', 'Texte')}>
          <textarea className="mm-text" rows={3} value={l.text} onChange={(e) => u<TextLayer>((x) => { x.text = e.target.value }, 'text')} />
          <label className="st-field"><span>{tr('Style', 'Style')}</span>
            <select value="" onChange={(e) => { const s = TEXT_STYLES[e.target.value]; if (s) u<TextLayer>((x) => Object.assign(x, s(x))) }}>
              <option value="">{tr('Apply a style…', 'Appliquer un style…')}</option>
              <option value="sticker">Sticker 3D</option><option value="impact">Impact YouTube</option><option value="fire">{tr('Fire', 'Feu')}</option>
              <option value="ice">{tr('Ice', 'Glace')}</option><option value="neon">Néon</option><option value="clean">{tr('Clean', 'Sobre')}</option>
            </select>
          </label>
          <label className="st-field"><span>{tr('Font', 'Police')}</span><select value={l.font} onChange={(e) => u<TextLayer>((x) => { x.font = e.target.value })}>{FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}</select></label>
          <Slider label={tr('Size', 'Taille')} value={l.size} min={12} max={400} unit=" px" onChange={(v) => u<TextLayer>((x) => { x.size = v }, 'size')} />
          <Slider label={tr('Spacing', 'Espacement')} value={l.spacing} min={-20} max={60} onChange={(v) => u<TextLayer>((x) => { x.spacing = v }, 'sp')} />
          <Slider label={tr('Line height', 'Interligne')} value={l.lineHeight} min={0.6} max={1.6} step={0.01} onChange={(v) => u<TextLayer>((x) => { x.lineHeight = v }, 'lh')} />
          <div className="mm-tabs">{(['left', 'center', 'right'] as const).map((a) => <button key={a} className={l.align === a ? 'on' : ''} onClick={() => u<TextLayer>((x) => { x.align = a })}>{a === 'left' ? '⇤' : a === 'center' ? '≡' : '⇥'}</button>)}</div>
          <Check label={tr('Italic', 'Italique')} value={l.italic} onChange={(v) => u<TextLayer>((x) => { x.italic = v })} />
          <div className="mm-tabs">{(['solid', 'gradient'] as const).map((f) => <button key={f} className={l.fill === f ? 'on' : ''} onClick={() => u<TextLayer>((x) => { x.fill = f })}>{f === 'solid' ? tr('Solid', 'Uni') : tr('Gradient', 'Dégradé')}</button>)}</div>
          <Color label={tr('Color', 'Couleur')} value={l.color} onChange={(v) => u<TextLayer>((x) => { x.color = v }, 'c1')} />
          {l.fill === 'gradient' && <Color label={tr('Bottom color', 'Couleur du bas')} value={l.color2} onChange={(v) => u<TextLayer>((x) => { x.color2 = v }, 'c2')} />}
          <Color label={tr('*Words* in color', '*Mots* en couleur')} value={l.accent} onChange={(v) => u<TextLayer>((x) => { x.accent = v }, 'ac')} />
          <p className="muted small">{tr('Wrap a word in stars to color it: MY *RECORD*', 'Mets un mot entre étoiles pour le colorer : MON *RECORD*')}</p>
        </Section>
      )}
      {l.kind === 'text' && (
        <Section title={tr('Outlines and extrusion', 'Contours et relief')}>
          <Color label={tr('Inner outline', 'Contour intérieur')} value={l.inner.color} onChange={(v) => u<TextLayer>((x) => { x.inner.color = v }, 'ic')} />
          <Slider label={tr('Width', 'Épaisseur')} value={l.inner.width} min={0} max={30} onChange={(v) => u<TextLayer>((x) => { x.inner.width = v }, 'iw')} />
          <Color label={tr('Extrusion', 'Relief')} value={l.extrude.color} onChange={(v) => u<TextLayer>((x) => { x.extrude.color = v }, 'ec')} />
          <Slider label={tr('Depth', 'Profondeur')} value={l.extrude.depth} min={0} max={40} onChange={(v) => u<TextLayer>((x) => { x.extrude.depth = v }, 'ed')} />
          <Slider label={tr('Extrusion angle', 'Angle du relief')} value={l.extrude.angle} min={0} max={360} unit="°" onChange={(v) => u<TextLayer>((x) => { x.extrude.angle = v }, 'ea')} />
          <Color label={tr('Outer outline', 'Contour extérieur')} value={l.outer.color} onChange={(v) => u<TextLayer>((x) => { x.outer.color = v }, 'oc')} />
          <Slider label={tr('Width', 'Épaisseur')} value={l.outer.width} min={0} max={30} onChange={(v) => u<TextLayer>((x) => { x.outer.width = v }, 'ow')} />
        </Section>
      )}
      {l.kind === 'tag' && (
        <Section title="Tag">
          <input type="text" value={l.text} onChange={(e) => upd((x) => { if (x.kind === 'tag') x.text = e.target.value }, 'tag')} />
          <div className="mm-tabs">{[['#22d3ee', tr('Hero', 'Héros')], ['#e11d8f', tr('Opponent', 'Adversaire')], ['#eab308', tr('Neutral', 'Neutre')]].map(([c, n]) => <button key={c} className={l.team === c ? 'on' : ''} onClick={() => upd((x) => { if (x.kind === 'tag') x.team = c })}>{n}</button>)}</div>
          <Color label={tr('Team color', 'Couleur d’équipe')} value={l.team} onChange={(v) => upd((x) => { if (x.kind === 'tag') x.team = v }, 'team')} />
          <Color label={tr('Text color', 'Couleur du texte')} value={l.textColor} onChange={(v) => upd((x) => { if (x.kind === 'tag') x.textColor = v }, 'tc')} />
          <Slider label={tr('Size', 'Taille')} value={l.size} min={12} max={140} unit=" px" onChange={(v) => upd((x) => { if (x.kind === 'tag') x.size = v }, 'ts')} />
          <label className="st-field"><span>{tr('Font', 'Police')}</span><select value={l.font} onChange={(e) => upd((x) => { if (x.kind === 'tag') x.font = e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></label>
          <div className="mm-tabs">{(['none', 'down', 'up', 'left', 'right'] as const).map((a) => <button key={a} className={l.arrow === a ? 'on' : ''} onClick={() => upd((x) => { if (x.kind === 'tag') x.arrow = a })}>{a === 'none' ? tr('None', 'Aucune') : a === 'down' ? '▼' : a === 'up' ? '▲' : a === 'left' ? '◀' : '▶'}</button>)}</div>
        </Section>
      )}
      {l.kind === 'shape' && (
        <Section title={tr('Shape', 'Forme')}>
          <div className="mm-tabs">{(['rect', 'para', 'ribbon', 'circle'] as const).map((s) => <button key={s} className={l.shape === s ? 'on' : ''} onClick={() => u<ShapeLayer>((x) => { x.shape = s })}>{s === 'rect' ? '▭' : s === 'para' ? '▱' : s === 'ribbon' ? '⧓' : '◯'}</button>)}</div>
          <Num label="L" value={l.w} onChange={(v) => u<ShapeLayer>((x) => { x.w = Math.max(4, v) }, 'sw')} />
          <Num label="H" value={l.h} onChange={(v) => u<ShapeLayer>((x) => { x.h = Math.max(4, v) }, 'sh')} />
          {l.shape === 'rect' && <Slider label={tr('Radius', 'Arrondi')} value={l.radius} min={0} max={200} onChange={(v) => u<ShapeLayer>((x) => { x.radius = v }, 'sr')} />}
          <div className="mm-tabs">{(['solid', 'gradient'] as const).map((f) => <button key={f} className={l.fill === f ? 'on' : ''} onClick={() => u<ShapeLayer>((x) => { x.fill = f })}>{f === 'solid' ? tr('Solid', 'Uni') : tr('Gradient', 'Dégradé')}</button>)}</div>
          <Color label={tr('Color', 'Couleur')} value={l.color} onChange={(v) => u<ShapeLayer>((x) => { x.color = v }, 'sc')} />
          {l.fill === 'gradient' && <Color label={tr('Bottom color', 'Couleur du bas')} value={l.color2} onChange={(v) => u<ShapeLayer>((x) => { x.color2 = v }, 'sc2')} />}
          <Color label={tr('Stroke', 'Contour')} value={l.stroke} onChange={(v) => u<ShapeLayer>((x) => { x.stroke = v }, 'ss')} />
          <Slider label={tr('Stroke width', 'Épaisseur du contour')} value={l.strokeWidth} min={0} max={30} onChange={(v) => u<ShapeLayer>((x) => { x.strokeWidth = v }, 'ssw')} />
        </Section>
      )}
      {l.kind === 'speed' && (
        <Section title={tr('Speed lines', 'Lignes de vitesse')}>
          <p className="muted small">{tr('Drag the ⊕ target on the canvas to move the focus.', 'Glisse la cible ⊕ sur le canvas pour placer le centre.')}</p>
          <Slider label={tr('Count', 'Nombre')} value={l.count} min={4} max={200} onChange={(v) => upd((x) => { if (x.kind === 'speed') x.count = v }, 'n')} />
          <Color label={tr('Color', 'Couleur')} value={l.color} onChange={(v) => upd((x) => { if (x.kind === 'speed') x.color = v }, 'spc')} />
          <Slider label={tr('Fade', 'Fondu')} value={l.fade} min={0} max={100} unit=" %" onChange={(v) => upd((x) => { if (x.kind === 'speed') x.fade = v }, 'f')} />
          <Slider label={tr('Intensity', 'Intensité')} value={l.intensity} min={0} max={100} unit=" %" onChange={(v) => upd((x) => { if (x.kind === 'speed') x.intensity = v }, 'i')} />
          <Slider label={tr('Empty zone', 'Zone vide')} value={l.inner} min={0} max={800} onChange={(v) => upd((x) => { if (x.kind === 'speed') x.inner = v }, 'z')} />
          <Slider label={tr('Max length', 'Longueur max')} value={l.maxLen} min={40} max={1200} onChange={(v) => upd((x) => { if (x.kind === 'speed') x.maxLen = v }, 'ml')} />
          <Slider label={tr('Max width', 'Épaisseur max')} value={l.maxWidth} min={1} max={60} onChange={(v) => upd((x) => { if (x.kind === 'speed') x.maxWidth = v }, 'mw')} />
          <button className="btn small" onClick={() => upd((x) => { if (x.kind === 'speed') x.seed = Math.floor(Math.random() * 1e6) })}>🎲 {tr('Reroll', 'Nouveau tirage')}</button>
        </Section>
      )}
      {l.kind === 'light' && (
        <Section title={tr('Light', 'Lumière')}>
          <div className="mm-tabs">{(['glow', 'rays', 'spot', 'flare'] as const).map((s) => <button key={s} className={l.style === s ? 'on' : ''} onClick={() => upd((x) => { if (x.kind === 'light') x.style = s })}>{s === 'glow' ? tr('Glow', 'Halo') : s === 'rays' ? tr('Rays', 'Rayons') : s === 'spot' ? tr('Spot', 'Projecteur') : 'Flare'}</button>)}</div>
          <Color label={tr('Color', 'Couleur')} value={l.color} onChange={(v) => upd((x) => { if (x.kind === 'light') x.color = v }, 'lc')} />
          <Color label={tr('Core', 'Cœur')} value={l.color2} onChange={(v) => upd((x) => { if (x.kind === 'light') x.color2 = v }, 'lc2')} />
          <Slider label={tr('Radius', 'Rayon')} value={l.radius} min={20} max={1600} onChange={(v) => upd((x) => { if (x.kind === 'light') x.radius = v }, 'lr')} />
          <Slider label={tr('Intensity', 'Intensité')} value={l.intensity} min={0} max={2} step={0.05} onChange={(v) => upd((x) => { if (x.kind === 'light') x.intensity = v }, 'li')} />
          {l.style === 'rays' && <Slider label={tr('Rays', 'Rayons')} value={l.rays} min={2} max={40} onChange={(v) => upd((x) => { if (x.kind === 'light') x.rays = v }, 'lrs')} />}
        </Section>
      )}
      <Section title={tr('Transform', 'Transformation')}>
        <div className="mm-grid2">
          <Num label="X" value={l.x} onChange={(v) => upd((x) => { x.x = v }, 'x')} />
          <Num label="Y" value={l.y} onChange={(v) => upd((x) => { x.y = v }, 'y')} />
          <Num label={tr('Scale X', 'Échelle X')} step={0.05} value={l.sx} onChange={(v) => upd((x) => { x.sx = v }, 'sx')} />
          <Num label={tr('Scale Y', 'Échelle Y')} step={0.05} value={l.sy} onChange={(v) => upd((x) => { x.sy = v }, 'sy')} />
        </div>
        <Slider label="Rotation" value={l.rot} min={-180} max={180} unit="°" onChange={(v) => upd((x) => { x.rot = v }, 'rot')} />
        <Slider label={tr('Opacity', 'Opacité')} value={Math.round(l.opacity * 100)} min={0} max={100} unit=" %" onChange={(v) => upd((x) => { x.opacity = v / 100 }, 'op')} />
        <label className="st-field"><span>{tr('Blend', 'Fusion')}</span>
          <select value={l.blend} onChange={(e) => upd((x) => { x.blend = e.target.value as GlobalCompositeOperation })}>
            {([['source-over', 'Normal'], ['screen', tr('Screen', 'Superposition lumineuse')], ['lighter', tr('Add', 'Addition')], ['multiply', tr('Multiply', 'Produit')], ['overlay', 'Overlay'], ['soft-light', tr('Soft light', 'Lumière douce')], ['color-dodge', tr('Color dodge', 'Densité couleur')]] as const).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </label>
        <div className="row">
          <button className="btn small" onClick={() => upd((x) => { x.flipH = !x.flipH })}>⇆ Flip H</button>
          <button className="btn small" onClick={() => upd((x) => { x.flipV = !x.flipV })}>⇅ Flip V</button>
          <button className="btn small" onClick={() => upd((x) => { x.x = doc.w / 2; x.y = doc.h / 2 })}>{tr('Center', 'Centrer')}</button>
        </div>
      </Section>
      {l.kind !== 'speed' && l.kind !== 'light' && (
        <Section title={tr('Effects', 'Effets')}>
          <Check label={tr('Outline', 'Contour')} value={l.fx.outline.on} onChange={(v) => upd((x) => { x.fx.outline.on = v })} />
          {l.fx.outline.on && <>
            <Color label={tr('Color', 'Couleur')} value={l.fx.outline.color} onChange={(v) => upd((x) => { x.fx.outline.color = v }, 'olc')} />
            <Slider label={tr('Width', 'Épaisseur')} value={l.fx.outline.width} min={1} max={40} unit=" px" onChange={(v) => upd((x) => { x.fx.outline.width = v }, 'olw')} />
            <Slider label={tr('Softness', 'Douceur')} value={l.fx.outline.soft} min={0} max={100} unit=" %" onChange={(v) => upd((x) => { x.fx.outline.soft = v }, 'ols')} />
            <Check label={tr('2nd outline (around the first)', '2ᵉ contour (autour du premier)')} value={l.fx.outline2.on} onChange={(v) => upd((x) => { x.fx.outline2.on = v })} />
            {l.fx.outline2.on && <>
              <Color label={tr('Color', 'Couleur')} value={l.fx.outline2.color} onChange={(v) => upd((x) => { x.fx.outline2.color = v }, 'o2c')} />
              <Slider label={tr('Width', 'Épaisseur')} value={l.fx.outline2.width} min={1} max={40} unit=" px" onChange={(v) => upd((x) => { x.fx.outline2.width = v }, 'o2w')} />
            </>}
          </>}
          <Check label="Glow" value={l.fx.glow.on} onChange={(v) => upd((x) => { x.fx.glow.on = v })} />
          {l.fx.glow.on && <>
            <div className="mm-tabs">{[false, true].map((i) => <button key={String(i)} className={l.fx.glow.inner === i ? 'on' : ''} onClick={() => upd((x) => { x.fx.glow.inner = i })}>{i ? tr('Inner', 'Intérieur') : tr('Outer', 'Extérieur')}</button>)}</div>
            <Color label={tr('Color', 'Couleur')} value={l.fx.glow.color} onChange={(v) => upd((x) => { x.fx.glow.color = v }, 'gc')} />
            <Slider label={tr('Size', 'Taille')} value={l.fx.glow.size} min={2} max={80} unit=" px" onChange={(v) => upd((x) => { x.fx.glow.size = v }, 'gs')} />
            <Slider label={tr('Strength', 'Intensité')} value={l.fx.glow.strength} min={0.2} max={4} step={0.1} onChange={(v) => upd((x) => { x.fx.glow.strength = v }, 'gi')} />
          </>}
          <Check label={tr('Drop shadow', 'Ombre portée')} value={l.fx.shadow.on} onChange={(v) => upd((x) => { x.fx.shadow.on = v })} />
          {l.fx.shadow.on && <>
            <Color label={tr('Color', 'Couleur')} value={l.fx.shadow.color} onChange={(v) => upd((x) => { x.fx.shadow.color = v }, 'shc')} />
            <Slider label={tr('Blur', 'Flou')} value={l.fx.shadow.blur} min={0} max={60} onChange={(v) => upd((x) => { x.fx.shadow.blur = v }, 'shb')} />
            <Slider label={tr('Offset X', 'Décalage X')} value={l.fx.shadow.dx} min={-80} max={80} onChange={(v) => upd((x) => { x.fx.shadow.dx = v }, 'shx')} />
            <Slider label={tr('Offset Y', 'Décalage Y')} value={l.fx.shadow.dy} min={-80} max={80} onChange={(v) => upd((x) => { x.fx.shadow.dy = v }, 'shy')} />
            <Slider label={tr('Opacity', 'Opacité')} value={l.fx.shadow.opacity} min={0} max={1} step={0.05} onChange={(v) => upd((x) => { x.fx.shadow.opacity = v }, 'sho')} />
          </>}
          <Check label={tr('Motion blur', 'Flou de mouvement')} value={l.fx.motion.on} onChange={(v) => upd((x) => { x.fx.motion.on = v })} />
          {l.fx.motion.on && <>
            <Slider label="Direction" value={l.fx.motion.angle} min={0} max={360} unit="°" onChange={(v) => upd((x) => { x.fx.motion.angle = v }, 'ma')} />
            <Slider label="Distance" value={l.fx.motion.dist} min={4} max={200} unit=" px" onChange={(v) => upd((x) => { x.fx.motion.dist = v }, 'md')} />
          </>}
          <Slider label={tr('Blur', 'Flou')} value={l.fx.blur} min={0} max={30} unit=" px" onChange={(v) => upd((x) => { x.fx.blur = v }, 'blur')} />
        </Section>
      )}
      {l.kind !== 'speed' && (
        <Section title={tr('Layer color grading', 'Colorimétrie du calque')} open={false} right={<button className="btn small" onClick={(e) => { e.stopPropagation(); upd((x) => { x.fx.grade = { ...NEUTRAL } }) }}>↺</button>}>
          <GradeControls g={l.fx.grade} tr={tr} set={(k, v) => upd((x) => { x.fx.grade[k] = v }, 'g' + k)} />
        </Section>
      )}
    </>
  )
}

function ProjectProps({ doc, change, tr }: { doc: Doc; change: (fn: (d: Doc) => void, key?: string) => void; tr: (en: string, fr: string) => string }): JSX.Element {
  return (
    <>
      <Section title="Artboard">
        <p className="muted small">1280 × 720 ({tr('export up to 1080p', 'export jusqu’en 1080p')})</p>
        <Color label={tr('Background color', 'Couleur de fond')} value={doc.bg} onChange={(v) => change((d) => { d.bg = v }, 'bg')} />
      </Section>
      <Section title={tr('Scene tilt', 'Inclinaison de la scène')}>
        <Slider label="Angle" value={doc.tilt} min={-15} max={15} step={0.5} unit="°" onChange={(v) => change((d) => { d.tilt = v }, 'tilt')} />
        <div className="mm-tabs">{[-7, 0, 7].map((a) => <button key={a} className={doc.tilt === a ? 'on' : ''} onClick={() => change((d) => { d.tilt = a })}>{a === 0 ? tr('Straight', 'Droite') : `${a > 0 ? '+' : ''}${a}°`}</button>)}</div>
      </Section>
      <Section title={tr('Color grading', 'Colorimétrie')} right={<button className="btn small" onClick={(e) => { e.stopPropagation(); change((d) => { d.grade = { ...NEUTRAL }; d.vignette = 0 }) }}>↺</button>}>
        <label className="st-field"><span>{tr('Preset', 'Préréglage')}</span>
          <select value="" onChange={(e) => { const p = GRADES[e.target.value]; if (p) change((d) => { d.grade = { ...NEUTRAL, ...p.grade }; d.vignette = p.vignette ?? 0 }) }}>
            <option value="">{tr('Choose…', 'Choisir…')}</option>
            {Object.entries(GRADES).map(([k, p]) => <option key={k} value={k}>{presetLabel(p)}</option>)}
          </select>
        </label>
        <GradeControls g={doc.grade} tr={tr} set={(k, v) => change((d) => { d.grade[k] = v }, 'pg' + k)} />
        <Slider label={tr('Vignette', 'Vignette')} value={doc.vignette} min={0} max={100} unit=" %" onChange={(v) => change((d) => { d.vignette = v }, 'vig')} />
      </Section>
    </>
  )
}

/* ---------------------------------------------------------------- editor */
type Drag = { mode: 'move' | 'scale' | 'rotate' | 'focus'; start: Doc; px: number; py: number; ids: string[]; cx?: number; cy?: number; d0?: number; a0?: number }

export function ThumbEditor(): JSX.Element {
  const { settings } = useApp()
  const tr = useCallback((en: string, fr: string): string => (settings.lang === 'fr' ? fr : en), [settings.lang])
  setSceneFrench(settings.lang === 'fr')
  const [doc, setDoc] = useState<Doc>(() => store.get<Doc>(AUTOSAVE, newDoc()))
  const [sel, setSel] = useState<string[]>([])
  const [side, setSide] = useState<'layer' | 'project'>('layer')
  const [bank, setBank] = useState<BankTab | null>(null)
  const [exporting, setExporting] = useState(false)
  const [menu, setMenu] = useState<'light' | 'shape' | null>(null)
  const [path, setPath] = useState<string>(store.get('studio:mini:path', ''))
  const [toast, setToast] = useState('')
  const [, force] = useState(0)
  const undo = useRef<Doc[]>([]), redo = useRef<Doc[]>([])
  const last = useRef<{ key: string; at: number }>({ key: '', at: 0 })
  const cv = useRef<HTMLCanvasElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const docRef = useRef(doc); docRef.current = doc

  const flash = (m: string): void => { setToast(m); setTimeout(() => setToast((t) => (t === m ? '' : t)), 2600) }
  /** Changes the scene; `key` groups small successive changes (sliders) into a single undo step. */
  const change = useCallback((fn: (d: Doc) => void, key?: string): void => {
    const cur = docRef.current, next = clone(cur)
    fn(next)
    const now = Date.now()
    if (!(key && last.current.key === key && now - last.current.at < 800)) { undo.current.push(cur); if (undo.current.length > 100) undo.current.shift(); redo.current = [] }
    last.current = { key: key ?? '', at: now }
    setDoc(next)
  }, [])
  const updSel = (fn: (l: Layer) => void, key?: string): void => change((d) => { d.layers.forEach((l) => sel.includes(l.id) && fn(l)) }, key ? key + sel.join() : undefined)
  const doUndo = (): void => { const p = undo.current.pop(); if (p) { redo.current.push(docRef.current); setDoc(p) } }
  const doRedo = (): void => { const n = redo.current.pop(); if (n) { undo.current.push(docRef.current); setDoc(n) } }

  // render on every change + when an image finishes loading; autosave
  const draw = useCallback(() => { const c = cv.current; if (c) { drawDoc(c.getContext('2d')!, docRef.current, 1); force((n) => n + 1) } }, [])
  useEffect(() => { setImageListener(draw); document.fonts?.ready.then(draw); return () => setImageListener(null) }, [draw])
  useEffect(() => { const r = requestAnimationFrame(draw); const h = setTimeout(() => store.set(AUTOSAVE, doc), 600); return () => { cancelAnimationFrame(r); clearTimeout(h) } }, [doc, draw])

  const add = useCallback((l: Layer, background = false): void => {
    change((d) => { if (background) d.layers.unshift(l); else d.layers.push(l) })
    setSel([l.id]); setSide('layer')
  }, [change])
  const selected = doc.layers.filter((l) => sel.includes(l.id))
  const one = selected.length === 1 ? selected[0] : null

  /* ---- mouse on the canvas */
  const toDoc = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = cv.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * doc.w, y: ((e.clientY - r.top) / r.height) * doc.h }
  }
  const onDown = (e: RPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    const p = toDoc(e)
    const target = (e.target as HTMLElement).dataset
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    if (target.h && one) {
      const cx = one.x, cy = one.y
      if (target.h === 'rot') drag.current = { mode: 'rotate', start: doc, px: p.x, py: p.y, ids: [one.id], cx, cy, a0: Math.atan2(p.y - cy, p.x - cx) }
      else drag.current = { mode: 'scale', start: doc, px: p.x, py: p.y, ids: [one.id], cx, cy, d0: Math.hypot(p.x - cx, p.y - cy) }
      return
    }
    if (target.h === undefined && one?.kind === 'speed' && Math.hypot(p.x - one.fx0, p.y - one.fy0) < 30) { drag.current = { mode: 'focus', start: doc, px: p.x, py: p.y, ids: [one.id] }; return }
    const top = [...doc.layers].reverse().find((l) => l.visible && !l.locked && hit(l, p.x, p.y))
    if (!top) { if (!e.ctrlKey && !e.shiftKey) setSel([]); return }
    let ids = sel
    if (e.ctrlKey || e.shiftKey) ids = sel.includes(top.id) ? sel.filter((i) => i !== top.id) : [...sel, top.id]
    else if (!sel.includes(top.id)) ids = [top.id]
    setSel(ids); setSide('layer')
    drag.current = { mode: 'move', start: doc, px: p.x, py: p.y, ids }
  }
  const onMove = (e: RPointerEvent<HTMLDivElement>): void => {
    const g = drag.current; if (!g) return
    const p = toDoc(e)
    const next = clone(g.start)
    for (const l of next.layers) {
      if (!g.ids.includes(l.id)) continue
      const o = g.start.layers.find((x) => x.id === l.id)!
      if (g.mode === 'move') {
        let dx = p.x - g.px, dy = p.y - g.py
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0 }
        l.x = o.x + dx; l.y = o.y + dy
        if (l.kind === 'speed' && o.kind === 'speed') { l.fx0 = o.fx0 + dx; l.fy0 = o.fy0 + dy }
        // snapping to the centre and edges of the canvas
        if (!e.altKey) for (const [k, v] of [['x', next.w / 2], ['y', next.h / 2]] as const) if (Math.abs(l[k] - v) < 8) l[k] = v
      } else if (g.mode === 'scale') {
        const f = Math.max(0.02, Math.hypot(p.x - g.cx!, p.y - g.cy!) / (g.d0 || 1))
        l.sx = o.sx * f; l.sy = o.sy * f
      } else if (g.mode === 'rotate') {
        let a = o.rot + ((Math.atan2(p.y - g.cy!, p.x - g.cx!) - g.a0!) * 180) / Math.PI
        if (e.shiftKey) a = Math.round(a / 15) * 15
        l.rot = ((a + 540) % 360) - 180
      } else if (g.mode === 'focus' && l.kind === 'speed') { l.fx0 = p.x; l.fy0 = p.y }
    }
    setDoc(next)
  }
  const onUp = (): void => {
    const g = drag.current; drag.current = null
    if (g && JSON.stringify(g.start.layers) !== JSON.stringify(docRef.current.layers)) { undo.current.push(g.start); redo.current = [] }
  }

  /* ---- files: drag and drop and paste an image */
  const addFile = async (f: File): Promise<void> => {
    const src = await studio.storeImage(new Uint8Array(await f.arrayBuffer()), f.name.split('.').pop() ?? 'png')
    const im = await loadImage(src)
    add(makeImage(src, im.naturalWidth, im.naturalHeight, f.name.replace(/\.\w+$/, ''), docRef.current))
  }
  useEffect(() => {
    const paste = (e: ClipboardEvent): void => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'))
      if (f && !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)) { e.preventDefault(); void addFile(f) }
    }
    window.addEventListener('paste', paste)
    return () => window.removeEventListener('paste', paste)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- keyboard */
  const clip = useRef<Layer[]>([])
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || bank || exporting) return
      const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey
      if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo() }
      else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); doRedo() }
      else if (ctrl && k === 'a') { e.preventDefault(); setSel(doc.layers.filter((l) => !l.locked).map((l) => l.id)) }
      else if (ctrl && k === 'd' && sel.length) { e.preventDefault(); const copies = selected.map((l) => ({ ...clone(l), id: uid(), x: l.x + 24, y: l.y + 24 })); change((d) => d.layers.push(...copies)); setSel(copies.map((c) => c.id)) }
      else if (ctrl && k === 'c' && sel.length) { clip.current = clone(selected) }
      else if (ctrl && k === 'v' && clip.current.length) { const copies = clip.current.map((l) => ({ ...clone(l), id: uid(), x: l.x + 24, y: l.y + 24 })); change((d) => d.layers.push(...copies)); setSel(copies.map((c) => c.id)) }
      else if (ctrl && k === 's') { e.preventDefault(); void saveProj(false) }
      else if (ctrl && k === 'e') { e.preventDefault(); setExporting(true) }
      else if (ctrl && k === 'o') { e.preventDefault(); void openProj() }
      else if ((k === 'delete' || k === 'backspace') && sel.length) { e.preventDefault(); change((d) => { d.layers = d.layers.filter((l) => !sel.includes(l.id)) }); setSel([]) }
      else if (k === 'escape') setSel([])
      else if (k.startsWith('arrow') && sel.length) {
        e.preventDefault(); const s = e.shiftKey ? 10 : 1
        updSel((l) => { if (k === 'arrowleft') l.x -= s; if (k === 'arrowright') l.x += s; if (k === 'arrowup') l.y -= s; if (k === 'arrowdown') l.y += s }, 'nudge')
      } else if ((k === '[' || k === ']') && sel.length) change((d) => reorder(d, sel, k === ']' ? 1 : -1))
      else if ((k === ',' || k === '.') && one?.kind === 'image' && one.render) updSel((l) => { if (l.kind === 'image' && l.render) l.render.frame = (l.render.frame + (k === '.' ? 1 : -1) + l.render.files.length) % l.render.files.length }, 'frame')
      else if (!ctrl && k === 'b') setBank('legend')
      else if (!ctrl && k === 'e') setBank('effects')
      else if (!ctrl && k === 't') add(makeText(docRef.current))
      else if (!ctrl && k === 'f') void randomMap()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const reorder = (d: Doc, ids: string[], dir: number): void => {
    const idx = d.layers.map((l, i) => (ids.includes(l.id) ? i : -1)).filter((i) => i >= 0)
    const order = dir > 0 ? [...idx].reverse() : idx
    for (const i of order) { const j = i + dir; if (j < 0 || j >= d.layers.length || ids.includes(d.layers[j].id)) continue; [d.layers[i], d.layers[j]] = [d.layers[j], d.layers[i]] }
  }
  const randomMap = async (): Promise<void> => {
    const p = await studio.assets('backgrounds', '', 0, 400)
    if (!p.items.length) return
    const f = p.items[Math.floor(Math.random() * p.items.length)]
    const src = `studio://game/${f.split('/').map(encodeURIComponent).join('/')}`
    const im = await loadImage(src)
    const bg = makeBackground(src, im.naturalWidth, im.naturalHeight, f.split('/').pop()!.replace(/\.\w+$/, ''), docRef.current)
    // replaces the previous background placed by this button
    change((d) => { const i = d.layers.findIndex((l) => l.kind === 'image' && l.src.includes('/mapArt/Backgrounds/')); if (i >= 0) { bg.id = d.layers[i].id; d.layers[i] = bg } else d.layers.unshift(bg) })
  }
  const saveProj = async (as: boolean): Promise<void> => {
    const r = await studio.saveProject(JSON.stringify(docRef.current), as ? undefined : path || undefined)
    if (r.ok && r.path) { setPath(r.path); store.set('studio:mini:path', r.path); flash(tr('Project saved', 'Projet enregistré')) }
  }
  const openProj = async (): Promise<void> => {
    const r = await studio.openProject()
    if (!r) return
    try { const d = JSON.parse(r.json) as Doc; if (!Array.isArray(d.layers)) throw new Error(); undo.current.push(docRef.current); setDoc({ ...newDoc(), ...d }); setSel([]); setPath(r.path); store.set('studio:mini:path', r.path) } catch { flash(tr('Unreadable project file', 'Fichier de projet illisible')) }
  }
  const newProj = (): void => { undo.current.push(docRef.current); setDoc(newDoc()); setSel([]); setPath(''); store.set('studio:mini:path', '') }

  /* ---- handles */
  const handles = one && one.kind !== 'speed' ? corners(one) : null
  const rotHandle = handles ? (() => {
    const [a, b] = [handles[0], handles[1]], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
    const ang = ((one!.rot - 90) * Math.PI) / 180
    return [mx + Math.cos(ang) * 36, my + Math.sin(ang) * 36, mx, my]
  })() : null
  const strip = one?.kind === 'image' && one.render ? one : null

  return (
    <div className="mm">
      <div className="mm-bar glass">
        <div className="mm-group"><small>{tr('CHARACTERS', 'PERSOS')}</small>
          <button className="btn small" onClick={() => setBank('legend')}>☺ {tr('Legends', 'Légendes')}</button>
          <button className="btn small" onClick={() => setBank('library')}>▤ {tr('My renders', 'Mes rendus')}</button>
          <button className="btn small" onClick={() => setBank('cosmetics')}>✿ {tr('Cosmetics', 'Cosmétiques')}</button>
        </div>
        <div className="mm-group"><small>{tr('TEXT', 'TEXTES')}</small>
          <button className="btn small" onClick={() => add(makeText(doc))}>T {tr('Text', 'Texte')}</button>
          <button className="btn small" onClick={() => add(makeTag(doc))}>▼ Tag</button>
        </div>
        <div className="mm-group"><small>{tr('BACKGROUND', 'FOND')}</small>
          <button className="btn small" onClick={() => setBank('maps')}>▦ {tr('Map', 'Map')}</button>
          <button className="btn small" onClick={() => void randomMap()} title="F">🎲</button>
          <button className="btn small" onClick={() => setBank('elements')}>❖ {tr('Elements', 'Éléments')}</button>
        </div>
        <div className="mm-group"><small>{tr('EFFECTS', 'EFFETS')}</small>
          <button className="btn small" onClick={() => setBank('effects')}>✦ {tr('Effect', 'Effet')}</button>
          <div className="mm-drop">
            <button className="btn small" onClick={() => setMenu(menu === 'light' ? null : 'light')}>✺ {tr('Light', 'Lumière')} ▾</button>
            {menu === 'light' && <div className="mm-menu" onMouseLeave={() => setMenu(null)}>{Object.entries(LIGHTS).map(([k, v]) => <button key={k} onClick={() => { add(makeLight(doc, k)); setMenu(null) }}>{presetLabel(v)}</button>)}</div>}
          </div>
          <button className="btn small" onClick={() => add(makeSpeed(doc), false)}>✳ {tr('Speed', 'Vitesse')}</button>
        </div>
        <div className="mm-group"><small>{tr('ELEMENTS', 'ÉLÉMENTS')}</small>
          <div className="mm-drop">
            <button className="btn small" onClick={() => setMenu(menu === 'shape' ? null : 'shape')}>▭ {tr('Shape', 'Forme')} ▾</button>
            {menu === 'shape' && <div className="mm-menu" onMouseLeave={() => setMenu(null)}>
              {([['rect', tr('Rectangle', 'Rectangle')], ['para', tr('Parallelogram', 'Parallélogramme')], ['ribbon', tr('Pointed ribbon', 'Bandeau pointu')], ['circle', tr('Circle', 'Cercle')]] as const).map(([k, n]) => <button key={k} onClick={() => { add(makeShape(doc, k)); setMenu(null) }}>{n}</button>)}
            </div>}
          </div>
          <button className="btn small" onClick={() => setBank('images')}>⚑ {tr('Game images', 'Images du jeu')}</button>
          <button className="btn small" onClick={() => void studio.importImage().then(async (src) => { if (src) { const im = await loadImage(src); add(makeImage(src, im.naturalWidth, im.naturalHeight, tr('Image', 'Image'), docRef.current)) } })}>⤓ {tr('Import', 'Importer')}</button>
        </div>
        <div className="mm-group end">
          <button className="btn small" onClick={doUndo} disabled={!undo.current.length} title="Ctrl+Z">↶</button>
          <button className="btn small" onClick={doRedo} disabled={!redo.current.length} title="Ctrl+Y">↷</button>
          <button className="btn small" onClick={newProj}>{tr('New', 'Nouveau')}</button>
          <button className="btn small" onClick={() => void openProj()}>{tr('Open', 'Ouvrir')}</button>
          <button className="btn small" onClick={() => void saveProj(false)} onContextMenu={(e) => { e.preventDefault(); void saveProj(true) }} title={tr('Right click: save as', 'Clic droit : enregistrer sous')}>{tr('Save', 'Enregistrer')}</button>
          <button className="btn small primary" onClick={() => setExporting(true)}>{tr('Export', 'Exporter')}</button>
        </div>
      </div>

      <div className="mm-main">
        <div className="mm-layers glass">
          <div className="mm-h">{tr('LAYERS', 'CALQUES')} <small>{doc.layers.length}</small></div>
          <div className="mm-layer-list">
            {[...doc.layers].reverse().map((l) => (
              <div key={l.id} className={`mm-layer ${sel.includes(l.id) ? 'on' : ''}`}
                onClick={(e) => { setSide('layer'); setSel(e.ctrlKey || e.shiftKey ? (sel.includes(l.id) ? sel.filter((i) => i !== l.id) : [...sel, l.id]) : [l.id]) }}>
                <span className="mm-ico">{l.kind === 'image' ? (l.render ? '☺' : '▣') : l.kind === 'text' ? 'T' : l.kind === 'tag' ? '▼' : l.kind === 'shape' ? '▭' : l.kind === 'speed' ? '✳' : '✺'}</span>
                <span className="grow mm-ln">{l.name}</span>
                <button className={`mm-tg ${l.visible ? '' : 'off'}`} onClick={(e) => { e.stopPropagation(); change((d) => { const x = d.layers.find((y) => y.id === l.id)!; x.visible = !x.visible }) }} title={tr('Show', 'Afficher')}>👁</button>
                <button className={`mm-tg ${l.locked ? 'on' : 'off'}`} onClick={(e) => { e.stopPropagation(); change((d) => { const x = d.layers.find((y) => y.id === l.id)!; x.locked = !x.locked }) }} title={tr('Lock', 'Verrouiller')}>🔒</button>
              </div>
            ))}
            {!doc.layers.length && <p className="muted small">{tr('Add a legend, a map or a text with the top bar, or drop an image here.', 'Ajoute une légende, une map ou un texte avec la barre du haut, ou glisse une image ici.')}</p>}
          </div>
          <div className="mm-layer-btns">
            <button className="btn small" disabled={!sel.length} onClick={() => change((d) => reorder(d, sel, 1))} title="]">▲</button>
            <button className="btn small" disabled={!sel.length} onClick={() => change((d) => reorder(d, sel, -1))} title="[">▼</button>
            <button className="btn small" disabled={!sel.length} onClick={() => change((d) => { const pick = d.layers.filter((l) => sel.includes(l.id)); d.layers = [...d.layers.filter((l) => !sel.includes(l.id)), ...pick] })} title={tr('Bring to front', 'Premier plan')}>⤒</button>
            <button className="btn small" disabled={!sel.length} onClick={() => change((d) => { const pick = d.layers.filter((l) => sel.includes(l.id)); d.layers = [...pick, ...d.layers.filter((l) => !sel.includes(l.id))] })} title={tr('Send to back', 'Arrière-plan')}>⤓</button>
            <button className="btn small" disabled={!sel.length} onClick={() => { const copies = selected.map((l) => ({ ...clone(l), id: uid(), x: l.x + 24, y: l.y + 24 })); change((d) => d.layers.push(...copies)); setSel(copies.map((c) => c.id)) }} title="Ctrl+D">⧉</button>
            <button className="btn small mm-del" disabled={!sel.length} onClick={() => { change((d) => { d.layers = d.layers.filter((l) => !sel.includes(l.id)) }); setSel([]) }} title={tr('Delete', 'Supprimer')}>🗑</button>
          </div>
          <p className="muted small mm-help">Ctrl+clic : {tr('add / remove', 'ajouter / retirer')} · Ctrl+A · Suppr · [ ] · Ctrl+D · Ctrl+Z</p>
        </div>

        <div className="mm-center">
          <div className="mm-stage" ref={stage}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/')); if (f) void addFile(f) }}>
            <div className="mm-art" style={{ aspectRatio: `${doc.w} / ${doc.h}` }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              <canvas ref={cv} width={doc.w} height={doc.h} />
              <svg className="mm-over" viewBox={`0 0 ${doc.w} ${doc.h}`} preserveAspectRatio="none">
                {selected.filter((l) => l.kind !== 'speed').map((l) => <polygon key={l.id} points={corners(l).map((p) => p.join(',')).join(' ')} className="mm-box" />)}
                {handles && rotHandle && <>
                  <line x1={rotHandle[2]} y1={rotHandle[3]} x2={rotHandle[0]} y2={rotHandle[1]} className="mm-box" />
                  <circle cx={rotHandle[0]} cy={rotHandle[1]} r={9} className="mm-rot" data-h="rot" />
                  {handles.map(([hx, hy], i) => <rect key={i} x={hx - 7} y={hy - 7} width={14} height={14} className="mm-hd" data-h={String(i)} />)}
                </>}
                {one?.kind === 'speed' && <g className="mm-focus"><circle cx={one.fx0} cy={one.fy0} r={18} /><line x1={one.fx0 - 26} y1={one.fy0} x2={one.fx0 + 26} y2={one.fy0} /><line x1={one.fx0} y1={one.fy0 - 26} x2={one.fx0} y2={one.fy0 + 26} /></g>}
              </svg>
            </div>
          </div>
          {strip && strip.render && (
            <div className="mm-strip glass">
              <div className="row small">
                <b className="mm-ln">{strip.name}</b>
                <span className="muted">{strip.render.frame + 1} / {strip.render.files.length}</span>
                <span className="muted">· {tr(', and . : previous / next frame', ', et . : image précédente / suivante')}</span>
              </div>
              <div className="st-strip">
                {strip.render.files.map((f, i) => (
                  <button key={f} className={`st-cell${i === strip.render!.frame ? ' cur' : ''}`} onClick={() => updSel((l) => { if (l.kind === 'image' && l.render) l.render.frame = i }, 'frame')}>
                    <img loading="lazy" src={`studio://renders/${strip.render!.id}/${f}`} alt="" draggable={false} /><span>{i + 1}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mm-side glass">
          <div className="mm-tabs full">
            <button className={side === 'layer' ? 'on' : ''} onClick={() => setSide('layer')} disabled={!one}>{one ? one.name.slice(0, 18) : tr('Layer', 'Calque')}</button>
            <button className={side === 'project' || !one ? 'on' : ''} onClick={() => setSide('project')}>{tr('Project', 'Projet')}</button>
          </div>
          <div className="mm-side-b">
            {one && side === 'layer' ? <LayerProps l={one} upd={updSel} tr={tr} doc={doc} />
              : selected.length > 1 && side === 'layer' ? <p className="muted small">{tr(`${selected.length} layers selected: drag them together on the canvas.`, `${selected.length} calques sélectionnés : glisse-les ensemble sur le canvas.`)}</p>
                : <ProjectProps doc={doc} change={change} tr={tr} />}
          </div>
        </div>
      </div>
      {toast && <div className="mm-toast glass">{toast}</div>}
      {bank && <Bank start={bank} tr={tr} onClose={() => setBank(null)} pick={{ add, doc }} />}
      {exporting && <ExportModal doc={doc} tr={tr} onClose={() => setExporting(false)} />}
    </div>
  )
}

// keeps the import used when a layer's measurement does not exist yet (first render)
void metrics
void imageSrc
