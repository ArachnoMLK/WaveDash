// Page d'un compte de plugin : cartes de métriques, graphique d'évolution, éléments, journal.
import { Fragment, ReactNode, useEffect, useState } from 'react'
import { ColumnStat, DetailGrid, DetailTable, loc, PluginColumn, PluginDetail, PluginItemsPage, PluginManifest } from '@shared/plugin'
import { ChartType, Lang, Point, RawMetrics } from '@shared/types'
import { Chart } from '../components/Chart'
import { Reveal, StatCard, Tabs } from '../components/ui'
import { useApp } from '../lib/AppContext'
import { barsOption, ChartTheme, seriesOption, timelineOption, timeOption } from '../lib/charts'
import { TIME_CHARTS } from '../lib/constants'
import { ago, fmtDelta } from '../lib/format'
import { RangeKey, sinceOf } from '../lib/hooks'
import { fmtPluginMetric } from '../lib/plugin'
import { useChartTheme } from '../lib/useChartTheme'

const RANGES: RangeKey[] = ['7', '30', '90', 'all']
const PAGE = 50

export function PluginPage({ accountId }: { accountId: number }): JSX.Element {
  const { t, settings, plugins, pluginAccounts, dataVersion, updateSettings, reloadPlugins } = useApp()
  const th = useChartTheme()
  const account = pluginAccounts.find((a) => a.id === accountId)
  const plugin = plugins.find((p) => p.id === account?.pluginId)
  const m = plugin?.manifest
  const [range, setRange] = useState<RangeKey>('30')
  const [metric, setMetric] = useState<string>(m?.metrics.find((x) => x.primary)?.key ?? m?.metrics[0]?.key ?? '')
  const [latest, setLatest] = useState<RawMetrics>({})
  const [series, setSeries] = useState<Record<string, Point[]>>({})
  const [extra, setExtra] = useState<{ logs: string[]; error: string | null; backlog: number; summary: PluginDetail | null }>({ logs: [], error: null, backlog: 0, summary: null })
  const [list, setList] = useState<PluginItemsPage>({ items: [], total: 0, months: [] })
  const [page, setPage] = useState(0)
  const [month, setMonth] = useState('')
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: 'ts', desc: true })
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('all')
  // Barre du haut : recherche libre calculée par le plugin (joueur, carte, légende…), 400 ms après la dernière frappe.
  const [topQ, setTopQ] = useState('')
  const [found, setFound] = useState<{ q: string; busy: boolean; detail?: PluginDetail; unsupported?: boolean; error?: string } | null>(null)
  useEffect(() => {
    const q = topQ.trim()
    if (q.length < 2) { setFound(null); return }
    let alive = true
    const h = setTimeout(() => {
      setFound((f) => ({ ...(f ?? {}), q, busy: true }))
      void window.api.pluginAccountSearch(accountId, q).then((r) => { if (alive) setFound({ q, busy: false, detail: r.detail, unsupported: r.unsupported, error: r.error }) })
    }, 400)
    return () => { alive = false; clearTimeout(h) }
  }, [topQ, accountId])
  // La recherche part 300 ms après la dernière frappe.
  useEffect(() => { const h = setTimeout(() => { setQuery(search); setPage(0); setOpenId(null) }, 300); return () => clearTimeout(h) }, [search])
  const [note, setNote] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (!m) return
    let alive = true
    void (async () => {
      const [l, e, ...s] = await Promise.all([window.api.getLatest(accountId), window.api.pluginAccountData(accountId), ...m.metrics.map((x) => window.api.getSeries(accountId, x.key, sinceOf(range)))])
      if (alive) { setLatest(l); setExtra(e); setSeries(Object.fromEntries(m.metrics.map((x, i) => [x.key, s[i]]))) }
    })()
    return () => { alive = false }
  }, [accountId, range, dataVersion, m])

  // Éléments lus page par page (un plugin peut en garder des milliers), éventuellement pour un seul mois.
  useEffect(() => {
    let alive = true
    void window.api.pluginAccountItems(accountId, page * PAGE, PAGE, month || undefined, sort.key, sort.desc, query, scope).then((r) => { if (alive) setList(r) })
    return () => { alive = false }
  }, [accountId, page, month, dataVersion, sort, query, scope])
  useEffect(() => { setPage(0); setMonth(''); setOpenId(null) }, [accountId])

  if (!account || !plugin || !m) return <div className="glass empty"><p>{t('goals.noAccounts')}</p></div>

  const def = m.metrics.find((x) => x.key === metric) ?? m.metrics[0]
  const ckey = `plugin:${plugin.id}.${def.key}`
  const type: ChartType = settings.chartTypes[ckey] ?? 'line'
  const refresh = async (): Promise<void> => { setBusy(true); await window.api.pluginAccountRefresh(accountId); await reloadPlugins(); setBusy(false) }
  const done = async (r: { imported: number; skipped: number } | null): Promise<void> => {
    setBusy(false)
    if (r) { setNote(t('pp.imported', { imported: r.imported, skipped: r.skipped })); setImporting(false); await reloadPlugins() }
  }
  const importFiles = async (): Promise<void> => { setBusy(true); await done(await window.api.pluginImportFiles(accountId, m.permissions.folderExtensions)) }
  const importDropped = async (files: FileList): Promise<void> => {
    const paths = Array.from(files).map((f) => window.api.pathForFile(f)).filter(Boolean)
    if (!paths.length) return
    setBusy(true); await done(await window.api.pluginImportPaths(accountId, paths))
  }
  const hasDates = list.items.some((i) => i.ts)
  const hasDetail = list.items.some((i) => i.detail)
  const pages = Math.max(1, Math.ceil(list.total / PAGE))
  // Un clic trie par la colonne (décroissant d'abord) ; un second clic inverse le sens.
  const sortBy = (key: string): void => { setSort((s) => ({ key, desc: s.key === key ? !s.desc : true })); setPage(0); setOpenId(null) }
  const monthLabel = (ym: string): string => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 1, 1).toLocaleDateString(settings.lang === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' })
  const lang = settings.lang === 'fr' ? 'fr-FR' : 'en-US'

  return (
    <div>
      <div className="page-head">
        <div className="grow"><h1>{account.displayName}</h1>
          <div className="muted small">{m.name} · {t('platform.synced', { time: ago(account.lastSyncAt, settings.lang, t('platform.never')) })}</div></div>
        {m.permissions.folder && <button className="btn" disabled={busy} onClick={() => setImporting(true)}>{t('pp.import')}</button>}
        <button className="btn" disabled={busy} onClick={() => void refresh()}>{t('platform.refresh')}</button>
        <button className="btn" onClick={() => void window.api.pluginAccountRemove(accountId).then(reloadPlugins)}>{t('pp.removeAccount')}</button>
      </div>
      {importing && (
        <div className="overlay" onClick={() => !busy && setImporting(false)}>
          <div className="glass modal" style={{ width: 'min(560px, 92vw)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('pp.import')}>
            <h2 style={{ marginBottom: 6 }}>{t('pp.import')}</h2>
            <p className="muted small" style={{ marginBottom: 12 }}>{t('pp.importHint', { ext: m.permissions.folderExtensions.join(', ') || '*' })}</p>
            <div className={`dropzone${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); void importDropped(e.dataTransfer.files) }}>
              {busy ? t('pp.importing') : t('pp.dropHere')}
            </div>
            <div className="row between" style={{ marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => void window.api.pluginOpenImportDir(accountId)}>{t('pp.openImportDir')}</button>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn" disabled={busy} onClick={() => setImporting(false)}>{t('pp.close')}</button>
                <button className="btn primary" disabled={busy} onClick={() => void importFiles()}>{t('pp.chooseFiles')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {m.cross && <CrossPanel accountId={accountId} cross={m.cross} th={th} />}
      {m.search && <div className="glass pad sect top-search">
        <input type="search" className="search" value={topQ} onChange={(e) => setTopQ(e.target.value)} placeholder={t('pp.topSearch')} aria-label={t('pp.topSearch')} />
        {found && (found.busy ? <p className="muted small" style={{ marginTop: 8 }}>{t('pp.searching')}</p>
          : found.unsupported ? <p className="muted small" style={{ marginTop: 8 }}>{t('pp.topUnsupported')}</p>
          : found.error ? <div className="err" style={{ marginTop: 8 }}>{found.error}</div>
          : found.detail ? <div style={{ marginTop: 8 }}><DetailView detail={found.detail} th={th} t={t} /></div>
          : <p className="muted small" style={{ marginTop: 8 }}>{t('pp.noResult')}</p>)}
      </div>}
      {note && <div className="glass pad small" style={{ marginBottom: 16 }} role="status">{note}</div>}
      {extra.backlog > 0 && <div className="glass pad small muted" style={{ marginBottom: 16 }}>{t('pp.backlog', { count: extra.backlog })}</div>}
      {account.lastError && <div className="err" style={{ marginBottom: 16 }}>{t('pp.error', { error: `${t(`plugin.run.${account.lastError}`)}${extra.error ? ` — ${extra.error}` : ''}` })}</div>}

      <div className="grid cards">
        {m.metrics.map((x, i) => {
          const s = series[x.key] ?? [], v = latest[x.key]
          const delta = s.length > 1 ? s[s.length - 1].value - s[0].value : undefined
          return (
            <Reveal key={x.key} delay={i * 0.05}>
              <StatCard label={loc(x.label, settings.lang)} value={v === undefined ? '—' : fmtPluginMetric(x, v, settings.lang)} selected={x.key === def.key} onClick={() => setMetric(x.key)}
                delta={delta === undefined ? undefined : fmtDelta(delta, settings.lang, x.decimals)} />
            </Reveal>
          )
        })}
      </div>

      <Reveal className="glass pad sect" delay={0.12}>
        <div className="row between" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
          <h2>{loc(def.label, settings.lang)} · {t('platform.history')}</h2>
          <div className="row">
            <Tabs value={type} options={TIME_CHARTS.map((c) => ({ id: c, label: t(`chart.${c}`) }))} onChange={(c) => void updateSettings({ chartTypes: { ...settings.chartTypes, [ckey]: c } })} />
            <Tabs value={range} options={RANGES.map((r) => ({ id: r, label: t(`range.${r}`) }))} onChange={setRange} />
          </div>
        </div>
        {(series[def.key]?.length ?? 0) > 1
          ? <Chart option={timeOption(type, [{ name: loc(def.label, settings.lang), points: series[def.key] }], th, def.format === 'percent' ? ' %' : def.unit ? ` ${def.unit}` : '')} height={320} />
          : <p className="muted" style={{ padding: '60px 0', textAlign: 'center' }}>{t('platform.noData')}</p>}
      </Reveal>

      {extra.summary && (
        <Reveal className="glass pad sect" delay={0.14}>
          <h2 style={{ marginBottom: 10 }}>{t('pp.summary')}</h2>
          <DetailView detail={extra.summary} th={th} t={t} layoutKey={String(accountId)} />
        </Reveal>
      )}

      {(list.total > 0 || month || query) && (
        <Reveal className="glass pad sect" delay={0.16}>
          <div className="row between" style={{ marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
            <h2>{t('pp.items')} <span className="muted" style={{ fontWeight: 400 }}>· {list.total}</span></h2>
            <div className="row" style={{ gap: 8 }}>
              {list.months.length > 1 && (
                <select value={month} style={{ width: 'auto' }} aria-label={t('pp.month')} onChange={(e) => { setMonth(e.target.value); setPage(0); setOpenId(null) }}>
                  <option value="">{t('pp.allMonths')}</option>
                  {list.months.map((x) => <option key={x.month} value={x.month}>{monthLabel(x.month)} ({x.count})</option>)}
                </select>
              )}
              {pages > 1 && <>
                <button className="btn" disabled={page === 0} onClick={() => { setPage(page - 1); setOpenId(null) }} aria-label={t('pp.prev')}>‹</button>
                <span className="small muted">{t('pp.pageOf', { page: page + 1, pages })}</span>
                <button className="btn" disabled={page >= pages - 1} onClick={() => { setPage(page + 1); setOpenId(null) }} aria-label={t('pp.next')}>›</button>
              </>}
            </div>
          </div>
          {/* Recherche dans la liste : seulement pour les plugins qui gardent un historique d'éléments (itemsMode « keep »). */}
          {m.itemsMode === 'keep' && <div className="row" style={{ gap: 8, margin: '4px 0 8px' }}>
            <select value={scope} style={{ width: 'auto' }} aria-label={t('pp.scope')} onChange={(e) => { setScope(e.target.value); setPage(0); setOpenId(null) }}>
              <option value="all">{t('pp.scopeAll')}</option>
              <option value="title">{t('pp.name')}</option>
              {m.itemColumns.map((c) => <option key={c.key} value={c.key}>{loc(c.label, settings.lang)}</option>)}
            </select>
            <input type="text" className="search grow" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('pp.search')} aria-label={t('pp.search')} />
          </div>}
          {query && list.stats && list.stats.length > 0 && <SearchStats stats={list.stats} total={list.total} columns={m.itemColumns} lang={settings.lang} t={t} />}
          {query && list.total === 0 && <p className="muted small">{t('pp.noResult')}</p>}
          {hasDetail && <p className="muted small" style={{ marginBottom: 6 }}>{t('pp.clickHint')}</p>}
          <div className="tbl-wrap"><table className="table">
            <thead><tr><SortTh k="title" sort={sort} onSort={sortBy}>{t('pp.name')}</SortTh>{hasDates && <SortTh k="ts" sort={sort} onSort={sortBy}>{t('pp.date')}</SortTh>}
              {m.itemColumns.map((c) => <SortTh key={c.key} k={c.key} sort={sort} onSort={sortBy}>{loc(c.label, settings.lang)}</SortTh>)}</tr></thead>
            <tbody>{list.items.map((it) => {
              const open = it.id === openId && !!it.detail
              return (
                <Fragment key={it.id}>
                  <tr className={it.detail ? `click${open ? ' sel' : ''}` : undefined} onClick={it.detail ? () => setOpenId(open ? null : it.id) : undefined}
                    aria-expanded={it.detail ? open : undefined}><td className="wrap">{it.title}</td>{hasDates && <td>{it.ts ? new Date(it.ts).toLocaleString(lang) : '—'}</td>}
                    {m.itemColumns.map((c) => <td key={c.key}>{it.fields[c.key] ?? '—'}{it.fields[c.key] !== undefined && c.unit ? ` ${c.unit}` : ''}</td>)}</tr>
                  {/* Le détail s'ouvre sous la ligne cliquée, pas en bas d'une longue liste. */}
                  {open && it.detail && <tr className="detail-row"><td colSpan={1 + (hasDates ? 1 : 0) + m.itemColumns.length}>
                    <DetailView detail={it.detail} th={th} t={t} onClose={() => setOpenId(null)} /></td></tr>}
                </Fragment>
              )
            })}</tbody>
          </table></div>
        </Reveal>
      )}

      {extra.logs.length > 0 && (
        <details className="glass pad sect"><summary className="small muted" style={{ cursor: 'pointer' }}>{t('pp.log')}</summary>
          <pre style={{ marginTop: 10, whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--muted)' }}>{extra.logs.join('\n')}</pre></details>
      )}
    </div>
  )
}

/** En-tête de colonne cliquable, avec la flèche du sens de tri. */
function SortTh({ k, sort, onSort, children }: { k: string; sort: { key: string; desc: boolean }; onSort: (k: string) => void; children: ReactNode }): JSX.Element {
  const on = sort.key === k
  return <th className="sortable" aria-sort={on ? (sort.desc ? 'descending' : 'ascending') : 'none'} onClick={() => onSort(k)}>{children}{on ? (sort.desc ? ' ▼' : ' ▲') : ''}</th>
}

/** Valeur comparable : nombre, durée « 3:04 » en secondes, pourcentage, sinon texte. */
function sortValue(v: string | number): number | string {
  if (typeof v === 'number') return v
  const d = /^(\d+):(\d{2})$/.exec(v)
  if (d) return Number(d[1]) * 60 + Number(d[2])
  const n = Number(v.replace(/\s|%/g, '').replace(',', '.'))
  return v.trim() !== '' && Number.isFinite(n) ? n : v.toLowerCase()
}

/** Tableau du détail ou du bilan, trié au clic sur un en-tête (décroissant d'abord, second clic : croissant). */
function SortableTable({ tb }: { tb: DetailTable }): JSX.Element {
  const [sort, setSort] = useState<{ col: number; desc: boolean } | null>(null)
  const rows = sort === null ? tb.rows : [...tb.rows].sort((a, b) => {
    const x = sortValue(a[sort.col]), y = sortValue(b[sort.col])
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : typeof x === 'number' ? 1 : typeof y === 'number' ? -1 : String(x).localeCompare(String(y))
    return sort.desc ? -c : c
  })
  return (
    <div className="tbl-wrap"><table className="table">
      <thead><tr>{tb.columns.map((c, i) => (
        <th key={i} className="sortable" onClick={() => setSort((s) => ({ col: i, desc: s?.col === i ? !s.desc : true }))}>{c}{sort?.col === i ? (sort.desc ? ' ▼' : ' ▲') : ''}</th>
      ))}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
    </table></div>
  )
}

/** Disposition des modules d'un bilan (ordre, masqués, réduits), gardée dans ce navigateur, par compte. */
interface Layout { order: string[]; hidden: string[]; collapsed: string[] }
function useLayout(key: string | undefined): [Layout, (l: Layout) => void] {
  const read = (): Layout => { try { const v = key ? JSON.parse(localStorage.getItem(`wd.layout.${key}`) ?? 'null') : null; return v && Array.isArray(v.order) ? v : { order: [], hidden: [], collapsed: [] } } catch { return { order: [], hidden: [], collapsed: [] } } }
  const [layout, setLayout] = useState<Layout>(read)
  useEffect(() => { setLayout(read()) }, [key])        // eslint-disable-line react-hooks/exhaustive-deps
  const save = (l: Layout): void => { setLayout(l); try { if (key) localStorage.setItem(`wd.layout.${key}`, JSON.stringify(l)) } catch { /* stockage indisponible */ } }
  return [layout, save]
}

/** Grille de chaleur : chaque case montre sa part du total et le nombre en abrégé (exact au survol) ; le texte reste lisible sur fond clair. */
function Heat({ g, caption = true }: { g: DetailGrid; caption?: boolean }): JSX.Element {
  const all = g.values.flat(), max = Math.max(1, ...all), total = all.reduce((a, b) => a + b, 0) || 1
  const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
  return (
    <figure className="heat">
      <div className="heat-grid" style={{ gridTemplateColumns: `auto repeat(${g.cols.length}, minmax(4.4rem, auto))` }}>
        <span />{g.cols.map((c, j) => <span key={j} className="small muted">{c}</span>)}
        {g.rows.map((r, i) => [<span key={`r${i}`} className="small muted">{r}</span>,
          ...g.cols.map((_, j) => {
            const v = g.values[i][j], k = v / max
            return (
              <b key={`${i}-${j}`} title={v.toLocaleString()} style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(k * 85)}%, var(--ctrl))`, color: k > 0.55 ? '#111' : undefined }}>
                <span>{Math.round((v * 1000) / total) / 10} %</span><small>{compact.format(v)}</small>
              </b>
            )
          })])}
      </div>
      {caption && g.title && <figcaption className="small muted">{g.title}</figcaption>}
    </figure>
  )
}

/** Détail d'un élément de plugin, ou bilan du compte : badges, chiffres clés, tableaux, grilles, courbes, frise.
 *  Avec `layoutKey` (bilan), chaque bloc devient un module que l'on peut réduire, déplacer (flèches ou glisser) et masquer. */
function DetailView({ detail, th, t, onClose, layoutKey }: { detail: PluginDetail; th: ChartTheme; t: (k: string, v?: Record<string, string | number>) => string; onClose?: () => void; layoutKey?: string }): JSX.Element {
  const tables = [...(detail.table ? [detail.table] : []), ...(detail.tables ?? [])]
  const blocks: { id: string; title: string; node: ReactNode }[] = []
  if (detail.stats) blocks.push({ id: 'stats', title: t('pp.keyFigures'), node: <div className="mini-stats">{detail.stats.map((s, i) => <div key={i}><span className="small muted">{s.label}</span><b>{s.value}</b></div>)}</div> })
  // Les graphiques en barres d'abord : ils résument, le tableau détaille.
  detail.bars?.forEach((b, k) => blocks.push({ id: `bars:${b.title ?? k}`, title: b.title ?? '', node: <Chart option={barsOption(b, th)} height={Math.max(260, Math.min(420, 200 + b.categories.length * 6))} /> }))
  tables.forEach((tb, k) => blocks.push({ id: `table:${tb.title ?? k}`, title: tb.title ?? `${t('pp.table')} ${k + 1}`, node: <SortableTable tb={tb} /> }))
  if (layoutKey) detail.grids?.forEach((g, k) => blocks.push({ id: `grid:${g.title ?? k}`, title: g.title ?? `${t('pp.grid')} ${k + 1}`, node: <div className="grids"><Heat g={g} caption={false} /></div> }))
  else if (detail.grids) blocks.push({ id: 'grids', title: '', node: <div className="grids">{detail.grids.map((g, k) => <Heat key={k} g={g} />)}</div> })
  detail.series?.forEach((sr, k) => blocks.push({ id: `series:${sr.title ?? k}`, title: sr.title ?? '', node: <Chart option={seriesOption(sr, th)} height={220} /> }))
  if (detail.timeline) blocks.push({ id: 'timeline', title: t('pp.timeline'), node: <Chart option={timelineOption(detail.timeline, th)} height={Math.max(130, 48 + detail.timeline.lanes.length * 36)} /> })

  const [layout, setLayout] = useLayout(layoutKey)
  const [dragId, setDragId] = useState<string | null>(null)
  const pos = (id: string): number => { const i = layout.order.indexOf(id); return i < 0 ? 1000 + blocks.findIndex((b) => b.id === id) : i }
  const ordered = layoutKey ? [...blocks].sort((a, b) => pos(a.id) - pos(b.id)) : blocks
  const ids = ordered.map((b) => b.id)
  const moveTo = (id: string, to: number): void => { const o = ids.filter((x) => x !== id); o.splice(Math.max(0, Math.min(o.length, to)), 0, id); setLayout({ ...layout, order: o }) }
  const toggle = (list: 'hidden' | 'collapsed', id: string): void =>
    setLayout({ ...layout, [list]: layout[list].includes(id) ? layout[list].filter((x) => x !== id) : [...layout[list], id] })

  return (
    <Reveal className="detail" delay={0}>
      {onClose && (
        <div className="row between" style={{ marginBottom: 6 }}>
          <h3>{t('pp.detail')}</h3>
          <button className="btn" onClick={onClose}>{t('pp.close')}</button>
        </div>
      )}
      {detail.chips && <div className="chips">{detail.chips.map((c, i) => <span key={i} className="chip">{c}</span>)}</div>}
      {layoutKey && (
        <details className="modules-menu">
          <summary className="small muted">{t('pp.modules', { shown: ordered.filter((b) => !layout.hidden.includes(b.id)).length, all: ordered.length })}</summary>
          <div className="modules-list">
            {ordered.map((b) => (
              <label key={b.id} className="small"><input type="checkbox" checked={!layout.hidden.includes(b.id)} onChange={() => toggle('hidden', b.id)} /> {b.title}</label>
            ))}
            <button className="btn" onClick={() => setLayout({ order: [], hidden: [], collapsed: [] })}>{t('pp.resetLayout')}</button>
          </div>
        </details>
      )}
      {ordered.map((b, i) => {
        if (!layoutKey) return <div key={b.id} className="detail-block">{b.title && <h3 className="small muted">{b.title}</h3>}{b.node}</div>
        if (layout.hidden.includes(b.id)) return null
        const shut = layout.collapsed.includes(b.id)
        return (
          <section key={b.id} className={`module${dragId === b.id ? ' dragging' : ''}`}
            onDragOver={(e) => { if (dragId) e.preventDefault() }} onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== b.id) moveTo(dragId, ids.indexOf(b.id)); setDragId(null) }}>
            <header className="module-head" draggable onDragStart={() => setDragId(b.id)} onDragEnd={() => setDragId(null)}>
              <button className="icon-btn" aria-expanded={!shut} aria-label={shut ? t('pp.expand') : t('pp.collapse')} onClick={() => toggle('collapsed', b.id)}>{shut ? '▸' : '▾'}</button>
              <h3 className="grow" title={t('pp.dragHint')}>{b.title}</h3>
              <button className="icon-btn" disabled={i === 0} aria-label={t('pp.moveUp')} onClick={() => moveTo(b.id, i - 1)}>↑</button>
              <button className="icon-btn" disabled={i === ordered.length - 1} aria-label={t('pp.moveDown')} onClick={() => moveTo(b.id, i + 1)}>↓</button>
              <button className="icon-btn" aria-label={t('pp.hide')} onClick={() => toggle('hidden', b.id)}>✕</button>
            </header>
            {!shut && <div className="module-body">{b.node}</div>}
          </section>
        )
      })}
    </Reveal>
  )
}

/** Tes stats sur les éléments trouvés par la recherche, colonne par colonne. */
function SearchStats({ stats, total, columns, lang, t }: { stats: ColumnStat[]; total: number; columns: PluginColumn[]; lang: Lang; t: (k: string, v?: Record<string, string | number>) => string }): JSX.Element {
  const nf = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: 1 })
  const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
  return (
    <div className="search-stats">
      <h3 className="small">{t('pp.searchStats', { n: total })}</h3>
      <div className="mini-stats">
        {stats.map((s) => {
          const label = loc(columns.find((c) => c.key === s.key)?.label, lang) || s.key
          if (s.kind === 'cat') return (
            <div key={s.key}><span className="small muted">{label}</span>
              <span className="small">{s.top?.map((x) => `${x.value} ${Math.round((x.n * 100) / s.n)} %`).join(' · ')}</span></div>
          )
          const f = s.kind === 'dur' ? mmss : (v: number): string => nf.format(v)
          return (
            <div key={s.key}><span className="small muted">{label}</span><b>{f(s.avg ?? 0)}</b>
              <span className="small muted">{t('pp.minMax', { min: f(s.min ?? 0), max: f(s.max ?? 0) })}{s.kind === 'num' ? ` · ${t('pp.sum', { sum: nf.format(s.sum ?? 0) })}` : ''}</span></div>
          )
        })}
      </div>
    </div>
  )
}

/** Croiser tes données : un joueur (vide = toi), une mesure, un axe et un second axe facultatif → graphique en barres et tableau. */
function CrossPanel({ accountId, cross, th }: { accountId: number; cross: NonNullable<PluginManifest['cross']>; th: ChartTheme }): JSX.Element {
  const { t, settings } = useApp()
  const [req, setReq] = useState({ who: '', measure: cross.measures[0].key, a: cross.dimensions[0].key, b: 'none' })
  const [res, setRes] = useState<{ busy: boolean; detail?: PluginDetail; error?: string } | null>(null)
  const run = async (): Promise<void> => {
    setRes({ busy: true })
    const r = await window.api.pluginAccountCross(accountId, req)
    setRes({ busy: false, detail: r.detail, error: r.error })
  }
  const set = (k: keyof typeof req, v: string): void => setReq((x) => ({ ...x, [k]: v }))
  return (
    <div className="glass pad sect cross">
      <h2 style={{ marginBottom: 10 }}>{t('pp.cross')}</h2>
      <div className="cross-form">
        <label className="small muted">{t('pp.crossWho')}<input type="text" value={req.who} placeholder={t('pp.crossMe')} onChange={(e) => set('who', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void run() }} /></label>
        <label className="small muted">{t('pp.crossMeasure')}<select value={req.measure} onChange={(e) => set('measure', e.target.value)}>{cross.measures.map((x) => <option key={x.key} value={x.key}>{loc(x.label, settings.lang)}</option>)}</select></label>
        <label className="small muted">{t('pp.crossA')}<select value={req.a} onChange={(e) => set('a', e.target.value)}>{cross.dimensions.map((x) => <option key={x.key} value={x.key}>{loc(x.label, settings.lang)}</option>)}</select></label>
        <label className="small muted">{t('pp.crossB')}<select value={req.b} onChange={(e) => set('b', e.target.value)}><option value="none">{t('pp.crossNone')}</option>
          {cross.dimensions.filter((x) => x.key !== req.a).map((x) => <option key={x.key} value={x.key}>{loc(x.label, settings.lang)}</option>)}</select></label>
        <button className="btn primary" disabled={res?.busy} onClick={() => void run()}>{t('pp.crossRun')}</button>
      </div>
      {res && (res.busy ? <p className="muted small" style={{ marginTop: 10 }}>{t('pp.searching')}</p>
        : res.error ? <div className="err" style={{ marginTop: 10 }}>{res.error}</div>
        : res.detail ? <div style={{ marginTop: 10 }}><DetailView detail={res.detail} th={th} t={t} /></div>
        : <p className="muted small" style={{ marginTop: 10 }}>{t('pp.noResult')}</p>)}
    </div>
  )
}
