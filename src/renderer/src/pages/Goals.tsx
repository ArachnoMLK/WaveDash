// Objectifs : progression vers le prochain palier (avec date estimée), comparaison de périodes, derniers paliers.
import { useEffect, useState } from 'react'
import { Account, MetricKey, MilestoneEvent, Point } from '@shared/types'
import { getRule, MILESTONE_METRICS, nextThreshold, prevThreshold } from '@shared/milestones'
import { Reveal } from '../components/ui'
import { useApp } from '../lib/AppContext'
import { fmt, fmtDelta, fmtMetric } from '../lib/format'

const DAY = 86_400_000
type SeriesMap = Record<number, Partial<Record<MetricKey, Point[]>>>

/** Dernière valeur connue à l'instant t (ou avant) ; null si l'historique ne remonte pas jusque-là. */
function valueAt(pts: Point[], t: number): number | null {
  let v: number | null = null
  for (const p of pts) { if (p.ts <= t) v = p.value; else break }
  return v
}

/** Gain sur une période de `days` jours se terminant il y a `offset` jours (null si l'historique est trop court). */
function gain(pts: Point[], days: number, offset: number): number | null {
  if (!pts.length) return null
  const end = Date.now() - offset * DAY
  const vEnd = offset === 0 ? pts[pts.length - 1].value : valueAt(pts, end)
  const vStart = valueAt(pts, end - days * DAY)
  return vEnd === null || vStart === null ? null : vEnd - vStart
}

/** Croissance moyenne par jour sur les 14 derniers jours (régression linéaire), null si insuffisant. */
function slopePerDay(pts: Point[]): number | null {
  const w = pts.filter((p) => p.ts >= Date.now() - 14 * DAY)
  if (w.length < 2) return null
  const xs = w.map((p) => (p.ts - w[0].ts) / DAY), ys = w.map((p) => p.value)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0)
  return den === 0 ? null : xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den
}

function Goal({ account, metric, pts }: { account: Account; metric: MetricKey; pts: Point[] }): JSX.Element | null {
  const { t, settings } = useApp()
  const rule = getRule(settings.milestoneRules, account.platform, metric)
  const cur = pts[pts.length - 1]?.value
  if (cur === undefined) return null
  const next = nextThreshold(rule, cur)
  if (next === null) return null
  const prev = prevThreshold(rule, cur) ?? 0
  const pct = Math.max(0, Math.min(100, ((cur - prev) / (next - prev)) * 100))

  // Date estimée : d'après la tendance des derniers relevés.
  let eta: string | null = null
  {
    const slope = slopePerDay(pts)
    if (slope && slope > 0) {
      const days = (next - cur) / slope
      if (days < 1) eta = t('goals.eta.today')
      else if (days <= 3650) eta = t('goals.eta.days', { n: Math.ceil(days), date: new Date(Date.now() + days * DAY).toLocaleDateString(settings.lang === 'fr' ? 'fr-FR' : 'en-US') })
    }
    eta = eta ?? t('goals.eta.none')
  }
  return (
    <div className="glass pad">
      <div className="muted small">{t(`platform.${account.platform}`)} · {account.displayName}</div>
      <div className="goal-top" style={{ marginTop: 6 }}>
        <h2>{t(`metric.${metric}`)}</h2>
        <span className="muted">{fmtMetric(metric, cur, settings.lang)} → <b style={{ color: 'var(--fg)' }}>{fmt(next, settings.lang)}</b></span>
      </div>
      <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
      <div className="muted small" style={{ marginTop: 10 }}>
        {t('goals.remaining', { n: fmt(next - cur, settings.lang) })}{eta && ` · ${t('goals.eta', { when: eta })}`}
      </div>
    </div>
  )
}

export function Goals(): JSX.Element {
  const { t, accounts, settings, dataVersion } = useApp()
  const [series, setSeries] = useState<SeriesMap>({})
  const [events, setEvents] = useState<MilestoneEvent[]>([])

  useEffect(() => {
    let alive = true
    void (async () => {
      const since = Date.now() - 62 * DAY
      const out: SeriesMap = {}
      for (const a of accounts) {
        out[a.id] = {}
        for (const m of MILESTONE_METRICS[a.platform]) out[a.id][m] = await window.api.getSeries(a.id, m, since)
      }
      const ev = await window.api.getMilestoneEvents(30)
      if (alive) { setSeries(out); setEvents(ev) }
    })()
    return () => { alive = false }
  }, [accounts, dataVersion])

  const goals = accounts.flatMap((a) => MILESTONE_METRICS[a.platform]
    .filter((m) => getRule(settings.milestoneRules, a.platform, m).enabled && (series[a.id]?.[m]?.length ?? 0) > 0)
    .map((m) => ({ a, m })))

  if (accounts.length === 0) {
    return <Reveal><div className="page-head"><h1>{t('goals.title')}</h1></div><div className="glass empty"><p>{t('goals.noAccounts')}</p></div></Reveal>
  }

  // Cellule de comparaison : gain de la période + variation par rapport à la précédente.
  const cell = (pts: Point[], days: number): JSX.Element => {
    const now = gain(pts, days, 0), before = gain(pts, days, days)
    const pct = now !== null && before !== null && before !== 0 ? ((now - before) / Math.abs(before)) * 100 : null
    return <td>{now === null ? '—' : fmtDelta(now, settings.lang)}{pct !== null && <span className="sub">{fmtDelta(pct, settings.lang)} %</span>}</td>
  }
  const lastCell = (pts: Point[], days: number): JSX.Element => {
    const b = gain(pts, days, days)
    return <td>{b === null ? '—' : fmtDelta(b, settings.lang)}</td>
  }

  return (
    <div>
      <div className="page-head"><h1>{t('goals.title')}</h1></div>

      <section>
        <h2 style={{ marginBottom: 12 }}>{t('goals.current')}</h2>
        {goals.length === 0
          ? <div className="glass pad muted">{t('goals.none')}</div>
          : <div className="grid two">{goals.map(({ a, m }, i) => <Reveal key={`${a.id}-${m}`} delay={i * 0.05}><Goal account={a} metric={m} pts={series[a.id]![m]!} /></Reveal>)}</div>}
      </section>

      <Reveal className="glass pad sect" delay={0.1}>
        <h2 style={{ marginBottom: 6 }}>{t('goals.compare')}</h2>
        <div className="tbl-wrap">
          <table className="table">
            <thead><tr><th /><th>{t('goals.thisWeek')}</th><th>{t('goals.lastWeek')}</th><th>{t('goals.thisMonth')}</th><th>{t('goals.lastMonth')}</th></tr></thead>
            <tbody>
              {accounts.flatMap((a) => MILESTONE_METRICS[a.platform].filter((m) => (series[a.id]?.[m]?.length ?? 0) > 1).map((m) => {
                const pts = series[a.id]![m]!
                return <tr key={`${a.id}-${m}`}><td>{t(`platform.${a.platform}`)} · {t(`metric.${m}`)}</td>{cell(pts, 7)}{lastCell(pts, 7)}{cell(pts, 30)}{lastCell(pts, 30)}</tr>
              }))}
            </tbody>
          </table>
        </div>
      </Reveal>

      <Reveal className="glass pad sect" delay={0.15}>
        <h2 style={{ marginBottom: 6 }}>{t('goals.history')}</h2>
        {events.length === 0 && <p className="muted small">{t('goals.noHistory')}</p>}
        {events.map((e) => (
          <div className="list-item" key={e.id}>
            <span>{e.direction === 'up' ? '▲' : '▼'} {e.platform === 'plugin' ? e.source : t(`platform.${e.platform}`)} · {e.message}{e.demo && <span className="badge" style={{ marginLeft: 8 }}>{t('platform.demo')}</span>}</span>
            <span className="muted small">{new Date(e.ts).toLocaleString(settings.lang === 'fr' ? 'fr-FR' : 'en-US')}</span>
          </div>
        ))}
      </Reveal>
    </div>
  )
}
