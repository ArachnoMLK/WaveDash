// Page d'un compte de plugin : cartes de métriques, graphique d'évolution, éléments, journal.
import { Fragment, useEffect, useState } from 'react'
import { loc, PluginDetail, PluginItemsPage } from '@shared/plugin'
import { ChartType, Point, RawMetrics } from '@shared/types'
import { Chart } from '../components/Chart'
import { Reveal, StatCard, Tabs } from '../components/ui'
import { useApp } from '../lib/AppContext'
import { ChartTheme, timelineOption, timeOption } from '../lib/charts'
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
  const [extra, setExtra] = useState<{ logs: string[]; error: string | null; backlog: number }>({ logs: [], error: null, backlog: 0 })
  const [list, setList] = useState<PluginItemsPage>({ items: [], total: 0, months: [] })
  const [page, setPage] = useState(0)
  const [month, setMonth] = useState('')
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
    void window.api.pluginAccountItems(accountId, page * PAGE, PAGE, month || undefined).then((r) => { if (alive) setList(r) })
    return () => { alive = false }
  }, [accountId, page, month, dataVersion])
  useEffect(() => { setPage(0); setMonth(''); setOpenId(null) }, [accountId])

  if (!account || !plugin || !m) return <div className="glass empty"><p>{t('goals.noAccounts')}</p></div>

  const def = m.metrics.find((x) => x.key === metric) ?? m.metrics[0]
  const ckey = `plugin:${plugin.id}.${def.key}`
  const type: ChartType = settings.chartTypes[ckey] ?? 'line'
  const refresh = async (): Promise<void> => { setBusy(true); await window.api.pluginAccountRefresh(accountId); await reloadPlugins(); setBusy(false) }
  const hasDates = list.items.some((i) => i.ts)
  const hasDetail = list.items.some((i) => i.detail)
  const pages = Math.max(1, Math.ceil(list.total / PAGE))
  const monthLabel = (ym: string): string => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 1, 1).toLocaleDateString(settings.lang === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' })
  const lang = settings.lang === 'fr' ? 'fr-FR' : 'en-US'

  return (
    <div>
      <div className="page-head">
        <div className="grow"><h1>{account.displayName}</h1>
          <div className="muted small">{m.name} · {t('platform.synced', { time: ago(account.lastSyncAt, settings.lang, t('platform.never')) })}</div></div>
        <button className="btn" disabled={busy} onClick={() => void refresh()}>{t('platform.refresh')}</button>
        <button className="btn" onClick={() => void window.api.pluginAccountRemove(accountId).then(reloadPlugins)}>{t('pp.removeAccount')}</button>
      </div>
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

      {(list.total > 0 || month) && (
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
          {hasDetail && <p className="muted small" style={{ marginBottom: 6 }}>{t('pp.clickHint')}</p>}
          <div className="tbl-wrap"><table className="table">
            <thead><tr><th>{t('pp.name')}</th>{hasDates && <th>{t('pp.date')}</th>}{m.itemColumns.map((c) => <th key={c.key}>{loc(c.label, settings.lang)}</th>)}</tr></thead>
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

/** Détail d'un élément de plugin : tableau et/ou frise d'événements. */
function DetailView({ detail, th, t, onClose }: { detail: PluginDetail; th: ChartTheme; t: (k: string) => string; onClose: () => void }): JSX.Element {
  return (
    <Reveal className="detail" delay={0}>
      <div className="row between" style={{ marginBottom: 6 }}>
        <h3>{t('pp.detail')}</h3>
        <button className="btn" onClick={onClose}>{t('pp.close')}</button>
      </div>
      {detail.table && (
        <div className="tbl-wrap"><table className="table">
          <thead><tr>{detail.table.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>{detail.table.rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
        </table></div>
      )}
      {detail.timeline && (
        <div style={{ marginTop: 14 }}>
          <h3 className="small muted" style={{ marginBottom: 4 }}>{t('pp.timeline')}</h3>
          <Chart option={timelineOption(detail.timeline, th)} height={Math.max(130, 48 + detail.timeline.lanes.length * 36)} />
        </div>
      )}
    </Reveal>
  )
}
