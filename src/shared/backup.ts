// Sauvegarde de la configuration : réglages, paliers, textes, préréglages. Jamais de clés API ni de comptes.
import { MILESTONE_METRICS, ruleKey } from './milestones'
import { sanitizeTheme, themeFromSettings } from './theme'
import { DEFAULT_SETTINGS, MilestoneRule, PLATFORMS, Settings, TemplateKey, ThemeData } from './types'

const NAV_IDS = ['overview', 'goals', ...PLATFORMS]
const CHARTS = ['line', 'area', 'bar', 'pie', 'radar']
const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null

function sanitizeRule(raw: unknown): MilestoneRule | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const increment = num(r.increment, 0, 1e9)
  if (typeof r.enabled !== 'boolean' || typeof r.sequence !== 'boolean' || typeof r.notifyDown !== 'boolean' || increment === null || !Array.isArray(r.custom)) return null
  const custom = r.custom.map((x) => num(x, 0, 1e12)).filter((x): x is number => x !== null).slice(0, 50)
  return { enabled: r.enabled, sequence: r.sequence, increment: Math.round(increment), custom, notifyDown: r.notifyDown }
}

/** Ne garde que les réglages connus, du bon type et dans les bornes. */
export function sanitizeBackup(raw: unknown): Partial<Settings> {
  const out: Partial<Settings> & Record<string, unknown> = {}
  if (!raw || typeof raw !== 'object') return out
  const s = raw as Record<string, unknown>
  Object.assign(out, sanitizeTheme(s))                       // apparence
  if (s.lang === 'fr' || s.lang === 'en') out.lang = s.lang
  const refresh = num(s.refreshMinutes, 5, 1440); if (refresh !== null) out.refreshMinutes = Math.round(refresh)
  for (const k of ['scrapingEnabled', 'startWithWindows', 'closeToTray', 'autoUpdate', 'notificationsEnabled', 'notifyRank', 'notifySound', 'notifyCelebration'] as const)
    if (typeof s[k] === 'boolean') out[k] = s[k]
  if (s.notifySoundKind === 'chime' || s.notifySoundKind === 'pulse' || s.notifySoundKind === 'bell') out.notifySoundKind = s.notifySoundKind
  const vol = num(s.notifyVolume, 0, 100); if (vol !== null) out.notifyVolume = vol

  if (s.chartTypes && typeof s.chartTypes === 'object') {
    out.chartTypes = Object.fromEntries(Object.entries(s.chartTypes as Record<string, unknown>)
      .filter(([k, v]) => k.length <= 60 && typeof v === 'string' && CHARTS.includes(v))) as Settings['chartTypes']
  }
  if (s.notifyTemplates && typeof s.notifyTemplates === 'object') {
    const t: Partial<Record<TemplateKey, string>> = {}
    for (const k of ['up', 'down', 'rankUp', 'rankDown'] as TemplateKey[]) {
      const v = (s.notifyTemplates as Record<string, unknown>)[k]
      if (typeof v === 'string') t[k] = v.slice(0, 200)
    }
    out.notifyTemplates = t
  }
  if (s.milestoneRules && typeof s.milestoneRules === 'object') {
    const valid = new Set(PLATFORMS.flatMap((p) => MILESTONE_METRICS[p].map((m) => ruleKey(p, m))))
    const rules: Record<string, MilestoneRule> = {}
    for (const [k, v] of Object.entries(s.milestoneRules as Record<string, unknown>)) {
      const r = valid.has(k) ? sanitizeRule(v) : null
      if (r) rules[k] = r
    }
    out.milestoneRules = rules
  }
  if (Array.isArray(s.navOrder)) out.navOrder = s.navOrder.filter((x): x is string => typeof x === 'string' && NAV_IDS.includes(x))
  if (Array.isArray(s.navHidden)) out.navHidden = s.navHidden.filter((x): x is string => typeof x === 'string' && NAV_IDS.includes(x) && x !== 'overview')
  if (s.themePresets && typeof s.themePresets === 'object') {
    const base: ThemeData = themeFromSettings(DEFAULT_SETTINGS)
    const presets: Record<string, ThemeData> = {}
    for (const [name, v] of Object.entries(s.themePresets as Record<string, unknown>).slice(0, 30))
      presets[name.slice(0, 40)] = { ...base, ...sanitizeTheme(v) }
    out.themePresets = presets
  }
  return out
}

/** Clés enregistrées dans une sauvegarde (tout sauf image de fond locale). */
export const BACKUP_KEYS: (keyof Settings)[] = [
  'theme', 'glassEnabled', 'glass', 'glassOpacity', 'glassSaturation', 'nativeMaterial', 'bgMode', 'bgColor', 'bgColor2', 'bgAngle', 'bgBlur', 'bgDim', 'ambient',
  'accentEnabled', 'accentColor', 'chartPalette', 'radius', 'density', 'uiScale', 'fontFamily', 'animations',
  'lang', 'refreshMinutes', 'chartTypes', 'scrapingEnabled', 'startWithWindows', 'closeToTray', 'autoUpdate',
  'notificationsEnabled', 'notifyRank', 'notifySound', 'notifySoundKind', 'notifyVolume', 'notifyCelebration', 'notifyTemplates', 'milestoneRules',
  'navOrder', 'navHidden', 'themePresets'
]
