// Studio Brawlhalla : rendus de légendes et de cosmétiques, bibliothèque, assets et musiques du jeu.
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  StudioAnim, StudioAnimGroup, StudioAssetKind, StudioCatalog, StudioExportFormat, StudioItem, StudioJob, StudioKind,
  StudioRender, StudioRenderRequest, StudioStatus, StudioTrack, StudioWeaponSkins
} from '@shared/studio'
import { STUDIO_KINDS, WEAPON_FR, weaponOfAnim } from '@shared/studio'
import { Reveal, Switch, Tabs } from '../components/ui'
import { useApp } from '../lib/AppContext'

const studio = window.api.studio
type Tab = 'create' | 'library' | 'assets' | 'music'
const EXPORTS: StudioExportFormat[] = ['gif', 'apng', 'webm', 'mov', 'mp4', 'png']

/** Mémoire locale de l'interface (dernier choix), sans casser l'affichage si le stockage est indisponible. */
const mem = {
  get<T>(k: string, d: T): T { try { return (JSON.parse(localStorage.getItem('studio:' + k) ?? 'null') as T) ?? d } catch { return d } },
  set(k: string, v: unknown): void { try { localStorage.setItem('studio:' + k, JSON.stringify(v)) } catch { /* ignoré */ } }
}

/* ---------------------------------------------------------------- lecteur d'images animées */
/** Rendu image par image : lecture en boucle, ou arrêt sur une image choisie (barre avec un repère par image). */
function Player({ render, max = 520, controls = false, onFrame }: { render: StudioRender; max?: number; controls?: boolean; onFrame?: (i: number) => void }): JSX.Element {
  const { t } = useApp()
  const ref = useRef<HTMLCanvasElement>(null)
  const n = render.files.length
  const [playing, setPlaying] = useState(true)
  const [frame, setFrame] = useState(0)
  const frameRef = useRef(0)
  frameRef.current = frame
  const imgs = useMemo(() => render.files.map((f) => { const i = new Image(); i.src = `studio://renders/${render.id}/${f}`; return i }), [render])

  const draw = (i: number): void => {
    const canvas = ref.current, im = imgs[i]
    if (!canvas || !im) return
    if (!im.complete || !im.naturalWidth) { im.onload = () => { if (frameRef.current === i) draw(i) }; return }
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(im, 0, 0, canvas.width, canvas.height)
  }
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const s = Math.min(1, max / Math.max(render.width, render.height))
    canvas.width = Math.max(1, Math.round(render.width * s)); canvas.height = Math.max(1, Math.round(render.height * s))
    setFrame(0); setPlaying(true)
  }, [render, max])
  useEffect(() => { draw(frame); onFrame?.(frame) }, [frame, imgs]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing || n < 2) return
    const timer = setInterval(() => setFrame((f) => (f + 1) % n), 1000 / 24)
    return () => clearInterval(timer)
  }, [playing, n])

  const go = (i: number): void => { setPlaying(false); setFrame(((i % n) + n) % n) }
  return (
    <div className="st-player">
      <canvas ref={ref} className="st-canvas" />
      {controls && n > 1 && (
        <div className="st-ctrl">
          <div className="row">
            <button className="btn small" onClick={() => go(frame - 1)} aria-label={t('st.prevFrame')}>‹</button>
            <button className="btn small primary st-play" onClick={() => setPlaying(!playing)}>{playing ? t('st.pause') : t('st.play')}</button>
            <button className="btn small" onClick={() => go(frame + 1)} aria-label={t('st.nextFrame')}>›</button>
            <span className="muted small st-fnum">{t('st.frameOf', { i: frame + 1, n })}</span>
          </div>
          <div className="st-scrub">
            <input type="range" min={0} max={n - 1} step={1} value={frame} onChange={(e) => go(Number(e.target.value))} aria-label={t('st.frame')} />
            {/* un repère cliquable par image (au-delà de 160 images, la barre seule suffit) */}
            {n <= 160 && (
              <div className="st-ticks">
                {render.files.map((_, i) => (
                  <button key={i} className={i === frame ? 'on' : ''} style={{ left: `${(i / (n - 1)) * 100}%` }} onClick={() => go(i)} title={t('st.frameOf', { i: i + 1, n })} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Vignette calculée à la demande quand elle devient visible. */
function Thumb({ req }: { req: StudioRenderRequest }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState<string | null>(null)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return <div ref={ref} className={`st-thumb${src === '' ? ' empty' : ''}`}>{src ? <img src={src} alt="" /> : src === '' ? <span>—</span> : <i className="st-spin" />}</div>
}

function ExportBar({ render, onSaved }: { render: StudioRender; onSaved: (msg: string) => void }): JSX.Element {
  const { t } = useApp()
  const label = (f: StudioExportFormat): string => (f === 'mp4' ? t('st.export.mp4') : f === 'png' ? t('st.export.png') : f.toUpperCase())
  return (
    <div className="st-exports">
      {EXPORTS.map((f) => (
        <button key={f} className="btn small" onClick={() => void studio.exportRender(render.id, f).then((r) => r.ok && r.path && onSaved(t('st.saved', { path: r.path })))}>{label(f)}</button>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- onglet Créer */
function CreateTab({ status }: { status: StudioStatus }): JSX.Element {
  const { t } = useApp()
  const [kind, setKind] = useState<StudioKind>(mem.get('kind', 'legend'))
  const [cat, setCat] = useState<StudioCatalog | null>(null)
  const [hero, setHero] = useState<string>(mem.get('hero', 'Valkyrie'))
  const [costume, setCostume] = useState<string>(mem.get('costume', ''))
  const [color, setColor] = useState<string>(mem.get('color', ''))
  const [wskins, setWskins] = useState<StudioWeaponSkins>({})
  // skin choisi pour chaque arme de base de la légende ('' = celui du skin de la légende)
  const [wpick, setWpick] = useState<Record<string, string>>({})
  const [groups, setGroups] = useState<StudioAnimGroup[] | null>(null)
  const [group, setGroup] = useState<string>(mem.get('group', 'emotes'))
  const [anim, setAnim] = useState<StudioAnim | null>(null)
  const [items, setItems] = useState<StudioItem[] | null>(null)
  const [item, setItem] = useState<StudioItem | null>(null)
  const [effectFiles, setEffectFiles] = useState<string[]>([])
  const [effectFile, setEffectFile] = useState<string>(mem.get('effectFile', 'SFX_EpicYumiko.swf'))
  const [query, setQuery] = useState('')
  const [scale, setScale] = useState<number>(mem.get('scale', 2))
  const [flip, setFlip] = useState(false)
  const [job, setJob] = useState<StudioJob | null>(null)
  const [current, setCurrent] = useState<StudioRender | null>(null)
  const [note, setNote] = useState('')
  const [shownFrame, setShownFrame] = useState(0)
  const ready = status.state === 'ready'

  useEffect(() => { mem.set('kind', kind); setQuery(''); setItem(null) }, [kind])
  useEffect(() => { if (ready && !cat) void studio.catalog().then(setCat) }, [ready, cat]) // aussi pour les effets par légende
  useEffect(() => { void studio.library().then((l) => setCurrent((c) => c ?? l[0] ?? null)) }, [])

  // Légende : skins de la légende, puis ses animations rangées automatiquement.
  const costumes = useMemo(() => cat?.costumes.filter((c) => c.hero === hero) ?? [], [cat, hero])
  useEffect(() => {
    if (!costumes.length) return
    if (!costumes.some((c) => c.name === costume)) setCostume(costumes[0].name)
  }, [costumes, costume])
  useEffect(() => {
    if (!ready || kind !== 'legend') return
    setGroups(null); setAnim(null)
    void studio.legendAnims(hero).then((g) => {
      setGroups(g)
      setGroup((cur) => (g.some((x) => x.id === cur) ? cur : g[0]?.id ?? ''))
    })
    mem.set('hero', hero)
    void studio.weaponSkins(hero).then(setWskins)
    setWpick(mem.get('weapons:' + hero, {}))
  }, [ready, kind, hero])
  const pickWeapon = (w: string, v: string): void => { const next = { ...wpick, [w]: v }; setWpick(next); mem.set('weapons:' + hero, next) }
  const heroWeapons = cat?.heroes.find((h) => h.name === hero)?.weapons ?? []
  useEffect(() => { mem.set('costume', costume); mem.set('color', color); mem.set('group', group); mem.set('scale', scale) }, [costume, color, group, scale])

  // Cosmétiques, portraits, effets.
  useEffect(() => {
    if (!ready || kind === 'legend') return
    setItems(null)
    if (kind === 'effect' && !effectFiles.length) void studio.effectFiles().then(setEffectFiles)
    void studio.items(kind, '', kind === 'effect' ? effectFile : undefined).then(setItems)
    mem.set('effectFile', effectFile)
  }, [ready, kind, effectFile, effectFiles.length])

  const anims = useMemo(() => {
    const list = groups?.find((g) => g.id === group)?.items ?? []
    const q = query.trim().toLowerCase()
    return q ? list.filter((a) => a.label.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)) : list
  }, [groups, group, query])
  const shownItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (items ?? []).filter((x) => !q || x.display.toLowerCase().includes(q) || x.name.toLowerCase().includes(q)).slice(0, 240)
  }, [items, query])

  const request = (): StudioRenderRequest | null => {
    if (kind === 'legend') {
      if (!anim) return null
      const skin = costumes.find((c) => c.name === costume)
      // le skin d'arme suit l'arme de l'animation (épée pour une attaque à l'épée…) ; aucun pour une emote
      const w = weaponOfAnim(anim.animClass, heroWeapons), weapon = w ? wpick[w] || undefined : undefined
      const wname = weapon ? wskins[w!]?.find((x) => x.name === weapon)?.display : ''
      return { kind, animClass: anim.animClass, animation: anim.name, costume, color: color || undefined, weapon, scale, flip, label: `${skin?.display || hero}${wname ? ` (${wname})` : ''} — ${anim.label}` }
    }
    if (!item) return null
    const isSwf = kind === 'portrait' || kind === 'effect'
    return { kind, item: isSwf ? undefined : item.name, animClass: isSwf ? item.animClass : undefined, sequence: item.sequence, scale, flip, label: item.display }
  }

  const go = async (): Promise<void> => {
    const req = request(); if (!req) return
    setNote('')
    const j = await studio.render(req)
    setJob(j)
    const poll = async (): Promise<void> => {
      const s = await studio.job(j.id)
      if (!s || s.status === 'running') { setTimeout(() => void poll(), 700); return }
      setJob(s)
      if (s.result) setCurrent(s.result)
    }
    void poll()
  }
  const running = job?.status === 'running'

  return (
    <div className="st-create">
      <div className="glass pad st-side">
        <div className="chips st-kinds">
          {STUDIO_KINDS.map((k) => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{t(`st.kind.${k}`)}</button>)}
        </div>

        {kind === 'legend' && cat && (
          <>
            <label className="st-field"><span>{t('st.legend')}</span>
              <select value={hero} onChange={(e) => setHero(e.target.value)}>{cat.heroes.map((h) => <option key={h.name} value={h.name}>{h.bio}</option>)}</select>
            </label>
            <div className="st-two">
              <label className="st-field"><span>{t('st.skin')}</span>
                <select value={costume} onChange={(e) => setCostume(e.target.value)}>{costumes.map((c) => <option key={c.name} value={c.name}>{c.display || t('st.defaultSkin')}</option>)}</select>
              </label>
              <label className="st-field"><span>{t('st.color')}</span>
                <select value={color} onChange={(e) => setColor(e.target.value)}>
                  <option value="">{t('st.noColor')}</option>
                  {cat.colors.filter((c) => c !== 'NO_COLOR_SCHEME').map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            {heroWeapons.length > 0 && (
              <div className="st-two">
                {heroWeapons.map((w) => (
                  <label key={w} className="st-field"><span>{t('st.weaponSkin', { w: WEAPON_FR[w] ?? w })}</span>
                    <select value={wpick[w] ?? ''} onChange={(e) => pickWeapon(w, e.target.value)}>
                      <option value="">{t('st.weaponDefault')}</option>
                      {(wskins[w] ?? []).map((x) => <option key={x.name} value={x.name}>{x.own ? '★ ' : ''}{x.display}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
            {!groups ? <p className="muted small st-wait">{t('st.loadingAnims')}</p> : (
              <>
                <div className="chips">{groups.map((g) => <button key={g.id} className={`chip ${group === g.id ? 'on' : ''}`} onClick={() => { setGroup(g.id); setAnim(null) }}>{g.label} <small>{g.items.length}</small></button>)}</div>
                <input type="search" placeholder={t('st.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
                <div className="st-list">
                  {anims.length ? anims.map((a) => (
                    <button key={a.animClass + a.name} className={anim?.name === a.name && anim.animClass === a.animClass ? 'on' : ''} onClick={() => setAnim(a)} onDoubleClick={() => { setAnim(a); void go() }}>
                      <span>{a.label}</span><small>{t('st.frames', { n: a.frames })}</small>
                    </button>
                  )) : <p className="muted small">{t('st.empty')}</p>}
                </div>
              </>
            )}
          </>
        )}

        {kind !== 'legend' && (
          <>
            {kind === 'effect' && (
              <label className="st-field"><span>{t('st.file')}</span>
                <select value={effectFile} onChange={(e) => setEffectFile(e.target.value)}>
                  <option value="*">{t('st.allFiles')}</option>
                  {cat && <optgroup label={t('st.byLegend')}>{[...cat.heroes].sort((a, b) => a.bio.localeCompare(b.bio)).map((h) => <option key={h.name} value={`hero:${h.name}`}>{h.bio}</option>)}</optgroup>}
                  <optgroup label={t('st.byFile')}>{effectFiles.map((f) => <option key={f} value={f}>{f.replace(/^SFX_|\.swf$/g, '')}</option>)}</optgroup>
                </select>
              </label>
            )}
            <input type="search" placeholder={t('st.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            {!items ? <p className="muted small st-wait">{t('st.loadingAnims')}</p> : (
              <div className="st-grid">
                {shownItems.length ? shownItems.map((x) => {
                  const isSwf = kind === 'portrait' || kind === 'effect'
                  return (
                    <button key={x.animClass + x.name} className={`st-card ${item?.name === x.name && item.animClass === x.animClass ? 'on' : ''}`} onClick={() => setItem(x)} title={x.animClass.replace(/^(SFX_|Animation_)|\.swf\//g, (m) => (m.endsWith('/') ? ' · ' : ''))}>
                      <Thumb req={{ kind, item: isSwf ? undefined : x.name, animClass: isSwf ? x.animClass : undefined }} />
                      <span>{x.display}{x.sequence && <small className="muted"> · {x.sequence.length}</small>}</span>
                    </button>
                  )
                }) : <p className="muted small">{t('st.empty')}</p>}
              </div>
            )}
          </>
        )}

        {/* toujours visible en bas du panneau, même avec une longue liste au-dessus */}
        <div className="st-actions">
        <div className="st-out">
          <label className="st-field grow"><span>{t('st.quality')} · {scale}</span>
            <input type="range" min={0.5} max={6} step={0.5} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
          </label>
          <div className="row small muted">{t('st.flip')}<Switch on={flip} onChange={setFlip} label={t('st.flip')} /></div>
        </div>
        <button className="btn primary st-go" disabled={!ready || running || !request()} onClick={() => void go()}>
          {running ? t('st.rendering') : t('st.generate')}
        </button>
        </div>
        {job?.status === 'error' && <div className="err">{job.error}</div>}
        {kind === 'legend' && !anim && groups && <p className="muted small">{t('st.pick')}</p>}
      </div>

      <div className="glass pad st-preview">
        <div className="st-stage">{current ? <Player render={current} controls onFrame={setShownFrame} /> : <span className="muted">—</span>}</div>
        {current && (
          <>
            <div className="row between"><h2>{current.label}</h2><span className="badge">{t('st.frames', { n: current.frames })} · {current.width}×{current.height}</span></div>
            <ExportBar render={current} onSaved={setNote} />
            {current.frames > 1 && (
              <button className="btn small st-frame-png" onClick={() => void studio.exportFrame(current.id, shownFrame).then((r) => r.ok && r.path && setNote(t('st.saved', { path: r.path })))}>
                {t('st.exportFrame', { i: shownFrame + 1 })}
              </button>
            )}
          </>
        )}
        {note && <p className="muted small">{note}</p>}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- onglet Bibliothèque */
function LibraryTab(): JSX.Element {
  const { t } = useApp()
  const [list, setList] = useState<StudioRender[] | null>(null)
  const [note, setNote] = useState('')
  const load = (): void => { void studio.library().then(setList) }
  useEffect(load, [])
  if (!list) return <p className="muted">…</p>
  if (!list.length) return <div className="glass empty"><p>{t('st.libEmpty')}</p></div>
  return (
    <>
      {note && <p className="muted small" style={{ marginBottom: 10 }}>{note}</p>}
      <div className="st-lib">
        {list.map((r) => (
          <div key={r.id} className="glass st-libcard">
            <div className="st-stage small"><Player render={r} max={200} /></div>
            <b title={r.label}>{r.label}</b>
            <span className="muted small">{t('st.frames', { n: r.frames })} · {r.width}×{r.height}</span>
            <ExportBar render={r} onSaved={setNote} />
            <button className="btn small" onClick={() => void studio.remove(r.id).then(load)}>{t('st.delete')}</button>
          </div>
        ))}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- onglet Assets */
const ASSET_KINDS: StudioAssetKind[] = ['banners', 'avatars', 'sprites', 'backgrounds', 'maps', 'images']
function AssetsTab(): JSX.Element {
  const { t } = useApp()
  const [kind, setKind] = useState<StudioAssetKind>('banners')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<{ total: number; items: string[] }>({ total: 0, items: [] })
  const load = (offset: number): void => {
    void studio.assets(kind, query, offset, 120).then((p) => setPage((cur) => ({ total: p.total, items: offset ? [...cur.items, ...p.items] : p.items })))
  }
  useEffect(() => { const h = setTimeout(() => load(0), 200); return () => clearTimeout(h) }, [kind, query]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="row st-toolbar">
        <Tabs value={kind} onChange={setKind} options={ASSET_KINDS.map((k) => ({ id: k, label: t(`st.asset.${k}`) }))} />
        <input type="search" placeholder={t('st.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="muted small">{t('st.count', { n: page.total })}</span>
      </div>
      <div className="st-grid assets">
        {page.items.map((f) => (
          <button key={f} className="st-card" title={`${f} — ${t('st.save')}`} onClick={() => void studio.saveAsset(f)}>
            <div className="st-thumb"><img loading="lazy" src={`studio://game/${f.split('/').map(encodeURIComponent).join('/')}`} alt="" /></div>
            <span>{f.split('/').pop()}</span>
          </button>
        ))}
      </div>
      {page.items.length < page.total && <button className="btn st-more" onClick={() => load(page.items.length)}>{t('st.more')}</button>}
    </>
  )
}

/* ---------------------------------------------------------------- onglet Musiques */
function MusicTab(): JSX.Element {
  const { t } = useApp()
  const [tracks, setTracks] = useState<StudioTrack[] | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  useEffect(() => { void studio.tracks().then(setTracks) }, [])
  const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
  if (!tracks) return <p className="muted">…</p>
  return (
    <div className="glass pad">
      {playing && <audio className="st-audio" src={`studio://music/${playing}.mp3`} controls autoPlay />}
      {tracks.map((tr, i) => (
        <div key={tr.id} className="list-item">
          <span>{t('st.track', { n: i + 1 })} <span className="muted small">#{tr.id} · {fmt(tr.duration)}</span></span>
          <div className="row">
            <button className="btn small" onClick={() => setPlaying(tr.id)}>{t('st.listen')}</button>
            <button className="btn small" onClick={() => void studio.saveTrack(tr.id)}>MP3</button>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- page */
export function StudioPage(): JSX.Element {
  const { t } = useApp()
  const [tab, setTab] = useState<Tab>(mem.get('tab', 'create'))
  const [status, setStatus] = useState<StudioStatus | null>(null)
  useEffect(() => {
    let alive = true
    const tick = (): void => { void studio.status().then((s) => { if (alive) setStatus(s) }) }
    tick()
    const h = setInterval(tick, 2500)
    return () => { alive = false; clearInterval(h) }
  }, [])
  useEffect(() => mem.set('tab', tab), [tab])

  const stateText = !status ? '' : status.state === 'ready' ? t('st.state.ready') : status.state === 'starting' ? t('st.state.starting')
    : status.state === 'missing-engine' ? t('st.state.missingEngine') : status.state === 'missing-game' ? t('st.state.missingGame')
      : t('st.state.error', { e: status.error ?? '' })

  return (
    <>
      <div className="page-head">
        <div className="grow"><h1>{t('st.title')}</h1><p className="muted small">{t('st.sub')}</p></div>
        <span className={`badge st-state ${status?.state ?? ''}`}>{stateText}</span>
      </div>
      {status && (status.state === 'missing-game' || status.state === 'missing-engine' || status.state === 'error') && (
        <div className="err" style={{ marginBottom: 16 }}>
          {stateText}
          {status.state === 'missing-game' && <button className="btn small" style={{ marginLeft: 12 }} onClick={() => void studio.setGamePath().then(setStatus)}>{t('st.chooseGame')}</button>}
        </div>
      )}
      <Reveal><div style={{ marginBottom: 16 }}><Tabs value={tab} onChange={setTab} options={(['create', 'library', 'assets', 'music'] as Tab[]).map((id) => ({ id, label: t(`st.tab.${id}`) }))} /></div></Reveal>
      {tab === 'create' && status && <CreateTab status={status} />}
      {tab === 'library' && <LibraryTab />}
      {tab === 'assets' && <AssetsTab />}
      {tab === 'music' && <MusicTab />}
    </>
  )
}
