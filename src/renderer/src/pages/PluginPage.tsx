// Page d'un compte de plugin : cartes de métriques, graphique d'évolution, éléments, journal.
import { Fragment, ReactNode, useEffect, useState } from 'react'
import { DetailTable, loc, PluginDetail, PluginItemsPage } from '@shared/plugin'
import { ChartType, Point, RawMetrics } from '@shared/types'
import { Chart } from '../components/Chart'
import { Reveal, StatCard, Tabs } from '../components/ui'
import { useApp } from '../lib/AppContext'
import { ChartTheme, seriesOption, timelineOption, timeOption } from '../lib/charts'
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
    void window.api.pluginAccountItems(accountId, page * PAGE, PAGE, month || undefined, sort.key, sort.desc, query).then((r) => { if (alive) setList(r) })
    return () => { alive = false }
  }, [accountId, page, month, dataVersion, sort, query])
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
          <DetailView detail={extra.summary} th={th} t={t} />
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
          <input type="text" className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('pp.search')} aria-label={t('pp.search')} style={{ margin: '4px 0 8px' }} />
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

/** Détail d'un élément de plugin, ou bilan du compte : badges, chiffres clés, tableaux, grilles, courbes, frise. */
function DetailView({ detail, th, t, onClose }: { detail: PluginDetail; th: ChartTheme; t: (k: string) => string; onClose?: () => void }): JSX.Element {
  const tables = [...(detail.table ? [detail.table] : []), ...(detail.tables ?? [])]
  return (
    <Reveal className="detail" delay={0}>
      {onClose && (
        <div className="row between" style={{ marginBottom: 6 }}>
          <h3>{t('pp.detail')}</h3>
          <button className="btn" onClick={onClose}>{t('pp.close')}</button>
        </div>
      )}
      {detail.chips && <div className="chips">{detail.chips.map((c, i) => <span key={i} className="chip">{c}</span>)}</div>}
      {detail.stats && <div className="mini-stats">{detail.stats.map((s, i) => <div key={i}><span className="small muted">{s.label}</span><b>{s.value}</b></div>)}</div>}
      {tables.map((tb, k) => (
        <div key={k} className="detail-block">
          {tb.title && <h3 className="small muted">{tb.title}</h3>}
          <SortableTable tb={tb} />
        </div>
      ))}
      {detail.grids && (
        <div className="detail-block grids">
          {detail.grids.map((g, k) => {
            const max = Math.max(1, ...g.values.flat())
            return (
              <figure key={k} className="heat">
                <div className="heat-grid" style={{ gridTemplateColumns: `auto repeat(${g.cols.length}, 2.6rem)` }}>
                  <span />{g.cols.map((c, j) => <span key={j} className="small muted">{c}</span>)}
                  {g.rows.map((r, i) => [<span key={`r${i}`} className="small muted">{r}</span>,
                    ...g.cols.map((_, j) => <b key={`${i}-${j}`} style={{ background: `color-mix(in srgb, var(--accent) ${Math.round((g.values[i][j] / max) * 85)}%, var(--ctrl))` }}>{g.values[i][j]}</b>)])}
                </div>
                {g.title && <figcaption className="small muted">{g.title}</figcaption>}
              </figure>
            )
          })}
        </div>
      )}
      {detail.series?.map((sr, k) => (
        <div key={k} className="detail-block">
          {sr.title && <h3 className="small muted">{sr.title}</h3>}
          <Chart option={seriesOption(sr, th)} height={220} />
        </div>
      ))}
      {detail.timeline && (
        <div className="detail-block">
          <h3 className="small muted">{t('pp.timeline')}</h3>
          <Chart option={timelineOption(detail.timeline, th)} height={Math.max(130, 48 + detail.timeline.lanes.length * 36)} />
        </div>
      )}
    </Reveal>
  )
}
