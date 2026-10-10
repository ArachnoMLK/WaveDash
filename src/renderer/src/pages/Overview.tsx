import { useEffect, useMemo, useState } from 'react'
import { Account, MetricKey, PLATFORMS, Platform, Point } from '@shared/types'
import { Chart } from '../components/Chart'
import { Reveal, StatCard } from '../components/ui'
import { useApp } from '../lib/AppContext'
import { categoryOption, NamedSeries, timeOption } from '../lib/charts'
import { PRIMARY_METRICS } from '../lib/constants'
import { fmtDelta, fmtMetric } from '../lib/format'
import { useAccountData } from '../lib/hooks'
import { useChartTheme } from '../lib/useChartTheme'

const SOCIAL: Platform[] = ['youtube', 'instagram', 'tiktok']

/** Cartes de chiffres clés d'un compte. */
function AccountSummary({ account }: { account: Account }): JSX.Element {
  const { t, settings } = useApp()
  const data = useAccountData(account, '30')
  return (
    <section className="sect">
      <h2>{t(`platform.${account.platform}`)} · {account.displayName} {account.demo && <span className="badge" style={{ marginLeft: 8 }}>{t('platform.demo')}</span>}</h2>
      <div className="grid cards">
        {PRIMARY_METRICS[account.platform].map((m: MetricKey, i) => {
          const s = data?.series[m] ?? []
          const delta = s.length > 1 ? s[s.length - 1].value - s[0].value : undefined
          const v = data?.latest[m]
          return (
            <Reveal key={m} delay={i * 0.08}>
              <StatCard label={t(`metric.${m}`)} value={v === undefined ? '—' : fmtMetric(m, v, settings.lang)}
                delta={delta === undefined ? undefined : `${fmtDelta(delta, settings.lang, m === 'winrate' ? 1 : 0)} · 30 ${settings.lang === 'fr' ? 'j' : 'd'}`} />
            </Reveal>
          )
        })}
      </div>
    </section>
  )
}

export function Overview({ onAdd }: { onAdd: (p: Platform) => void }): JSX.Element {
  const { t, accounts, settings, dataVersion } = useApp()
  const th = useChartTheme()
  const socials = accounts.filter((a) => SOCIAL.includes(a.platform))
  const [subs, setSubs] = useState<NamedSeries[]>([])

  // Abonnés de toutes les plateformes sociales sur 30 jours (courbes combinées).
  useEffect(() => {
    let alive = true
    void (async () => {
      const since = Date.now() - 30 * 86_400_000
      const out: NamedSeries[] = []
      for (const a of socials) out.push({ name: t(`platform.${a.platform}`), points: (await window.api.getSeries(a.id, 'subscribers', since)) as Point[] })
      if (alive) setSubs(out)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, dataVersion, settings.lang])

  const share = useMemo(() => subs.filter((s) => s.points.length).map((s) => ({ name: s.name, value: s.points[s.points.length - 1].value })), [subs])

  if (accounts.length === 0) {
    return (
      <Reveal>
        <div className="page-head"><h1>{t('overview.title')}</h1></div>
        <div className="glass empty">
          <p>{t('overview.empty')}</p>
          <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            {PLATFORMS.map((p) => <button key={p} className="btn" onClick={() => onAdd(p)}>{t(`platform.${p}`)}</button>)}
          </div>
        </div>
      </Reveal>
    )
  }

  return (
    <div>
      <div className="page-head"><h1>{t('overview.title')}</h1></div>
      {accounts.map((a) => <AccountSummary key={a.id} account={a} />)}
      {socials.length > 0 && subs.some((s) => s.points.length > 1) && (
        <div className="grid two sect">
          <Reveal className="glass pad"><h2 style={{ marginBottom: 8 }}>{t('metric.subscribers')}</h2><Chart option={timeOption('area', subs, th)} height={280} /></Reveal>
          <Reveal className="glass pad" delay={0.1}><h2 style={{ marginBottom: 8 }}>{t('overview.share')}</h2><Chart option={categoryOption('pie', share, th)} height={280} /></Reveal>
        </div>
      )}
    </div>
  )
}
