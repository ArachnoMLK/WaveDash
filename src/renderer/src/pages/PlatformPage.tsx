import { useState } from 'react'
import { AVAILABLE_PLATFORMS, ChartType, METRICS_BY_PLATFORM, MetricKey, Platform } from '@shared/types'
import { Chart } from '../components/Chart'
import { Reveal, StatCard, Tabs } from '../components/ui'
import { useApp } from '../lib/AppContext'
import { categoryOption, Category, timeOption } from '../lib/charts'
import { CATEGORY_CHARTS, chartKey, CHART_KEYS, DEFAULT_CHART, TIME_CHARTS } from '../lib/constants'
import { ago, fmt, fmtDelta, fmtMetric } from '../lib/format'
import { AccountData, RangeKey, useAccountData } from '../lib/hooks'
import { prettyName, useChartTheme } from '../lib/useChartTheme'

const RANGES: RangeKey[] = ['7', '30', '90', 'all']

/** Carte de graphique par catégories dont le type (barres / camembert / radar) se règle ici et dans les paramètres. */
function CategoryCard({ title, k, data, unit, radarMax }: { title: string; k: string; data: Category[]; unit?: string; radarMax?: number }): JSX.Element {
  const { t, settings, updateSettings } = useApp()
  const th = useChartTheme()
  const type: ChartType = settings.chartTypes[k] ?? DEFAULT_CHART[k] ?? 'bar'
  return (
    <Reveal className="glass pad">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2>{title}</h2>
        <Tabs value={type} options={CATEGORY_CHARTS.map((c) => ({ id: c, label: t(`chart.${c}`) }))}
          onChange={(c) => void updateSettings({ chartTypes: { ...settings.chartTypes, [k]: c } })} />
      </div>
      <Chart option={categoryOption(type, data, th, unit, radarMax)} height={300} />
    </Reveal>
  )
}

function YouTubeExtras({ data }: { data: AccountData }): JSX.Element | null {
  const { t, settings } = useApp()
  if (!data.items.length) return null
  const top = data.items.slice(0, 8)
  return (
    <div className="grid two sect">
      <Reveal className="glass pad">
        <h2 style={{ marginBottom: 6 }}>{t('platform.topVideos')}</h2>
        {top.map((v) => (
          <div className="list-item" key={v.externalId}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</span>
            <span className="muted">{fmt(v.views, settings.lang)} {t('video.views')}</span>
          </div>
        ))}
      </Reveal>
      <CategoryCard title={t('platform.topVideos')} k={CHART_KEYS.videoViews} data={top.map((v) => ({ name: v.title.slice(0, 18), value: v.views }))} />
    </div>
  )
}

function BrawlhallaExtras({ data }: { data: AccountData }): JSX.Element | null {
  const { t, settings } = useApp()
  if (!data.legends.length) return null
  const byGames = data.legends.slice(0, 8)
  const wr = (l: { wins: number; games: number }): number => (l.games ? (l.wins / l.games) * 100 : 0)
  return (
    <>
      <div className="grid two sect">
        <CategoryCard title={t('platform.legendGames')} k={CHART_KEYS.legendGames} data={byGames.map((l) => ({ name: prettyName(l.name), value: l.games }))} />
        <CategoryCard title={t('platform.legendWinrate')} k={CHART_KEYS.legendWinrate} data={byGames.map((l) => ({ name: prettyName(l.name), value: Math.round(wr(l) * 10) / 10 }))} unit=" %" radarMax={100} />
      </div>
      <Reveal className="glass pad sect">
        <h2 style={{ marginBottom: 6 }}>{t('platform.legends')}</h2>
        {data.legends.map((l) => (
          <div className="list-item" key={l.legendId}>
            <span>{prettyName(l.name)}</span>
            <span className="muted">{fmt(l.games, settings.lang)} · {fmt(wr(l), settings.lang, 1)} %</span>
          </div>
        ))}
      </Reveal>
    </>
  )
}

export function PlatformPage({ platform, onAdd }: { platform: Platform; onAdd: (p: Platform) => void }): JSX.Element {
  const { t, accounts, settings, updateSettings, reloadAccounts } = useApp()
  const th = useChartTheme()
  const account = accounts.find((a) => a.platform === platform)
  const [range, setRange] = useState<RangeKey>('30')
  const [metric, setMetric] = useState<MetricKey>(METRICS_BY_PLATFORM[platform][0])
  const [busy, setBusy] = useState(false)
  const data = useAccountData(account, range)

  if (!account) {
    return (
      <Reveal>
        <div className="page-head"><h1>{t(`platform.${platform}`)}</h1></div>
        <div className="glass empty">
          <p>{t('platform.notConnected')}</p>
          {AVAILABLE_PLATFORMS.includes(platform)
            ? <button className="btn primary" onClick={() => onAdd(platform)}>{t('platform.connect')}</button>
            : <><span className="badge">{t('platform.soon')}</span><p className="small" style={{ marginTop: 14 }}>{t(`settings.keyHelp.${platform}`)}</p></>}
        </div>
      </Reveal>
    )
  }

  const type: ChartType = settings.chartTypes[chartKey(platform, metric)] ?? 'line'
  const refresh = async (): Promise<void> => { setBusy(true); await window.api.refreshNow(); await reloadAccounts(); setBusy(false) }
  const series = data?.series[metric] ?? []

  return (
    <div>
      <div className="page-head">
        {account.avatar && <img className="avatar" src={account.avatar} alt="" />}
        <div className="grow">
          <h1>{account.displayName}</h1>
          <div className="muted small">{t('platform.synced', { time: ago(account.lastSyncAt, settings.lang, t('platform.never')) })}</div>
        </div>
        {account.demo && <span className="badge">{t('platform.demo')}</span>}
        <button className="btn" disabled={busy} onClick={() => void refresh()}>{t('platform.refresh')}</button>
      </div>
      {account.lastError && <div className="err" style={{ marginBottom: 16 }}>{t('platform.syncError', { error: t(`err.${account.lastError}`) })}</div>}

      <div className="grid cards">
        {METRICS_BY_PLATFORM[platform].map((m, i) => {
          const s = data?.series[m] ?? []
          const v = data?.latest[m]
          const delta = s.length > 1 ? s[s.length - 1].value - s[0].value : undefined
          return (
            <Reveal key={m} delay={i * 0.06}>
              <StatCard label={t(`metric.${m}`)} value={v === undefined ? '—' : fmtMetric(m, v, settings.lang)} selected={m === metric} onClick={() => setMetric(m)}
                delta={delta === undefined ? undefined : fmtDelta(delta, settings.lang, m === 'winrate' ? 1 : 0)} />
            </Reveal>
          )
        })}
      </div>

      <Reveal className="glass pad sect" delay={0.15}>
        <div className="row between" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
          <h2>{t(`metric.${metric}`)} · {t('platform.history')}</h2>
          <div className="row">
            <Tabs value={type} options={TIME_CHARTS.map((c) => ({ id: c, label: t(`chart.${c}`) }))}
              onChange={(c) => void updateSettings({ chartTypes: { ...settings.chartTypes, [chartKey(platform, metric)]: c } })} />
            <Tabs value={range} options={RANGES.map((r) => ({ id: r, label: t(`range.${r}`) }))} onChange={setRange} />
          </div>
        </div>
        {series.length > 1
          ? <Chart option={timeOption(type, [{ name: t(`metric.${metric}`), points: series }], th, metric === 'winrate' ? ' %' : '')} height={320} />
          : <p className="muted" style={{ padding: '60px 0', textAlign: 'center' }}>{t('platform.noData')}</p>}
      </Reveal>

      {data && platform === 'youtube' && <YouTubeExtras data={data} />}
      {data && platform === 'brawlhalla' && <BrawlhallaExtras data={data} />}
    </div>
  )
}
