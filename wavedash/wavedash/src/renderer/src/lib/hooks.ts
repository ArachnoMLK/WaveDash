import { useEffect, useState } from 'react'
import { Account, ItemStat, LatestMetrics, LegendStat, METRICS_BY_PLATFORM, MetricKey, Point } from '@shared/types'
import { useApp } from './AppContext'

export type RangeKey = '7' | '30' | '90' | 'all'
export const RANGE_DAYS: Record<RangeKey, number> = { '7': 7, '30': 30, '90': 90, all: 0 }
const DAY = 86_400_000
export const sinceOf = (r: RangeKey): number => (r === 'all' ? 0 : Date.now() - RANGE_DAYS[r] * DAY)

export interface AccountData {
  latest: LatestMetrics
  series: Partial<Record<MetricKey, Point[]>>
  items: ItemStat[]
  legends: LegendStat[]
}

/** Charge dernières valeurs, historiques, contenus et légendes d'un compte ; se met à jour à chaque actualisation. */
export function useAccountData(account: Account | undefined, range: RangeKey): AccountData | null {
  const { dataVersion } = useApp()
  const [data, setData] = useState<AccountData | null>(null)
  useEffect(() => {
    if (!account) { setData(null); return }
    let alive = true
    void (async () => {
      const metrics = METRICS_BY_PLATFORM[account.platform]
      const [latest, items, legends, ...series] = await Promise.all([
        window.api.getLatest(account.id), window.api.getItems(account.id), window.api.getLegends(account.id),
        ...metrics.map((m) => window.api.getSeries(account.id, m, sinceOf(range)))
      ])
      if (alive) setData({ latest, items, legends, series: Object.fromEntries(metrics.map((m, i) => [m, series[i]])) })
    })()
    return () => { alive = false }
  }, [account, range, dataVersion])
  return data
}
