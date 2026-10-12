// État global : réglages, comptes, langue, mises à jour. Applique thème, verre, fond, couleur et police au document.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Account, AppInfo, DEFAULT_SETTINGS, MilestoneEvent, Settings, UpdateStatus } from '@shared/types'
import { translate } from '../i18n'
import { playSound } from './sound'

interface Ctx {
  settings: Settings
  info: AppInfo | null
  accounts: Account[]
  /** Incrémenté à chaque actualisation de données : les pages s'en servent pour recharger. */
  dataVersion: number
  t: (key: string, vars?: Record<string, string | number>) => string
  /** Durée de base des transitions (s) ; 0 quand les animations sont coupées. */
  dur: number
  /** Image de fond (data URL) quand le fond « Image » est choisi. */
  bgUrl: string | null
  update: UpdateStatus
  /** Palier à célébrer (null = rien à afficher). */
  celebration: MilestoneEvent | null
  dismissCelebration: () => void
  reloadSettings: () => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  reloadAccounts: () => Promise<void>
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx)
export const useApp = (): Ctx => useContext(AppCtx)

const FONTS: Record<Settings['fontFamily'], string> = {
  inter: "'Inter Variable', 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
  system: "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Cascadia Mono', Consolas, monospace"
}
const DENSITY = { compact: 0.82, comfortable: 1, spacious: 1.2 }

/** Texte lisible (noir ou blanc) sur une couleur d'accent donnée. */
function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return lum > 150 ? '#111111' : '#ffffff'
}

export function AppProvider({ children }: { children: ReactNode }): JSX.Element | null {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [dataVersion, setVersion] = useState(0)
  const [ready, setReady] = useState(false)
  const [bgUrl, setBgUrl] = useState<string | null>(null)
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' })
  const [celebration, setCelebration] = useState<MilestoneEvent | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const reloadAccounts = useCallback(async () => { setAccounts(await window.api.listAccounts()) }, [])

  useEffect(() => {
    void (async () => {
      const [s, i] = await Promise.all([window.api.getSettings(), window.api.appInfo()])
      setSettings(s); setInfo(i); await reloadAccounts(); setReady(true)
    })()
    return window.api.onDataUpdated(() => { void reloadAccounts(); setVersion((v) => v + 1) })
  }, [reloadAccounts])

  useEffect(() => {
    void window.api.getUpdateStatus().then(setUpdate)
    return window.api.onUpdateStatus(setUpdate)
  }, [])

  // Palier franchi : son et célébration selon les réglages du moment.
  useEffect(() => window.api.onMilestone((ev) => {
    const s = settingsRef.current
    if (s.notifySound) playSound(s.notifySoundKind, s.notifyVolume)
    if (s.notifyCelebration) setCelebration(ev)
  }), [])

  // L'image de fond est relue quand le fichier change.
  useEffect(() => {
    if (!settings.bgImage) { setBgUrl(null); return }
    let alive = true
    void window.api.getBackground().then((u) => { if (alive) setBgUrl(u) })
    return () => { alive = false }
  }, [settings.bgImage])

  const dur = settings.animations === 0 ? 0 : 0.35 + (settings.animations / 100) * 0.9

  // Apparence → variables CSS.
  useEffect(() => {
    const r = document.documentElement
    const s = settings
    const dark = s.theme === 'dark'
    const set = (k: string, v: string): void => r.style.setProperty(k, v)
    r.dataset.theme = s.theme
    r.lang = s.lang

    // Verre : fond translucide + flou, ou panneaux opaques.
    const nativeOn = !!info?.nativeGlass && s.glassEnabled && s.nativeMaterial !== 'none'
    if (nativeOn) r.dataset.nativeGlass = ''; else delete r.dataset.nativeGlass
    if (s.glassEnabled) {
      const op = s.glassOpacity / 100
      set('--panel-bg', `rgba(255,255,255,${(dark ? 0.02 + op * 0.2 : 0.25 + op * 0.6).toFixed(3)})`)
      set('--bf', `blur(${((s.glass / 100) * 34).toFixed(1)}px) saturate(${s.glassSaturation}%)`)
    } else {
      set('--panel-bg', 'var(--panel-solid)')
      set('--bf', 'none')
    }

    // Couleur d'accent (sinon on reste en niveaux de gris).
    if (s.accentEnabled) {
      set('--accent', s.accentColor); set('--accent-ink', inkFor(s.accentColor)); set('--glow', `${s.accentColor}66`)
    } else {
      for (const k of ['--accent', '--accent-ink', '--glow']) r.style.removeProperty(k)
    }

    set('--radius', `${s.radius}px`)
    set('--radius-sm', `${Math.round(s.radius * 0.6)}px`)
    set('--space', String(DENSITY[s.density]))
    set('--font', FONTS[s.fontFamily])
    set('--dur', `${dur}s`)
    set('--ambient-play', s.animations === 0 ? 'paused' : 'running')
    window.api.setZoom(s.uiScale / 100)
  }, [settings, info, dur])

  const dismissCelebration = useCallback(() => setCelebration(null), [])
  const reloadSettings = useCallback(async () => { setSettings(await window.api.reloadSettings()) }, [])
  const updateSettings = useCallback(async (patch: Partial<Settings>) => { setSettings(await window.api.setSettings(patch)) }, [])
  const t = useCallback((k: string, v?: Record<string, string | number>) => translate(settings.lang, k, v), [settings.lang])
  const value = useMemo(() => ({ settings, info, accounts, dataVersion, t, dur, bgUrl, update, celebration, dismissCelebration, reloadSettings, updateSettings, reloadAccounts }),
    [settings, info, accounts, dataVersion, t, dur, bgUrl, update, celebration, dismissCelebration, reloadSettings, updateSettings, reloadAccounts])

  return ready ? <AppCtx.Provider value={value}>{children}</AppCtx.Provider> : null
}
