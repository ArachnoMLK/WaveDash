// État global : réglages, comptes, langue, intensité des animations. Applique thème et verre au document.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Account, AppInfo, DEFAULT_SETTINGS, Settings } from '@shared/types'
import { translate } from '../i18n'

interface Ctx {
  settings: Settings
  info: AppInfo | null
  accounts: Account[]
  /** Incrémenté à chaque actualisation de données : les pages s'en servent pour recharger. */
  dataVersion: number
  t: (key: string, vars?: Record<string, string | number>) => string
  /** Durée de base des transitions (s) ; 0 quand les animations sont coupées. */
  dur: number
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  reloadAccounts: () => Promise<void>
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx)
export const useApp = (): Ctx => useContext(AppCtx)

export function AppProvider({ children }: { children: ReactNode }): JSX.Element | null {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [dataVersion, setVersion] = useState(0)
  const [ready, setReady] = useState(false)

  const reloadAccounts = useCallback(async () => { setAccounts(await window.api.listAccounts()) }, [])

  useEffect(() => {
    void (async () => {
      const [s, i] = await Promise.all([window.api.getSettings(), window.api.appInfo()])
      setSettings(s); setInfo(i); await reloadAccounts(); setReady(true)
    })()
    return window.api.onDataUpdated(() => { void reloadAccounts(); setVersion((v) => v + 1) })
  }, [reloadAccounts])

  // Thème, verre et animations → variables CSS.
  const dur = settings.animations === 0 ? 0 : 0.35 + (settings.animations / 100) * 0.9
  useEffect(() => {
    const r = document.documentElement
    r.dataset.theme = settings.theme
    if (info?.nativeGlass) r.dataset.nativeGlass = ''
    r.style.setProperty('--blur', `${(settings.glass / 100) * 34}px`)
    r.style.setProperty('--panel-a', String(0.25 + (settings.glass / 100) * 0.75))
    r.style.setProperty('--dur', `${dur}s`)
    r.style.setProperty('--ambient-play', settings.animations === 0 ? 'paused' : 'running')
    r.lang = settings.lang
  }, [settings, info, dur])

  const updateSettings = useCallback(async (patch: Partial<Settings>) => { setSettings(await window.api.setSettings(patch)) }, [])
  const t = useCallback((k: string, v?: Record<string, string | number>) => translate(settings.lang, k, v), [settings.lang])
  const value = useMemo(() => ({ settings, info, accounts, dataVersion, t, dur, updateSettings, reloadAccounts }),
    [settings, info, accounts, dataVersion, t, dur, updateSettings, reloadAccounts])

  return ready ? <AppCtx.Provider value={value}>{children}</AppCtx.Provider> : null
}
