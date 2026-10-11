// Validation des thèmes : un fichier importé n'est jamais accepté tel quel, chaque valeur est contrôlée.
import { DEFAULT_SETTINGS, Settings, THEME_KEYS, ThemeData, ThemeKey } from './types'

type Spec =
  | { t: 'bool' }
  | { t: 'num'; min: number; max: number }
  | { t: 'enum'; values: readonly string[] }
  | { t: 'color' }

export const THEME_SPEC: Record<ThemeKey, Spec> = {
  theme: { t: 'enum', values: ['dark', 'light'] },
  glassEnabled: { t: 'bool' },
  glass: { t: 'num', min: 0, max: 100 },
  glassOpacity: { t: 'num', min: 0, max: 100 },
  glassSaturation: { t: 'num', min: 100, max: 200 },
  nativeMaterial: { t: 'enum', values: ['none', 'mica', 'acrylic'] },
  bgMode: { t: 'enum', values: ['default', 'solid', 'gradient', 'image'] },
  bgColor: { t: 'color' }, bgColor2: { t: 'color' },
  bgAngle: { t: 'num', min: 0, max: 360 }, bgBlur: { t: 'num', min: 0, max: 30 }, bgDim: { t: 'num', min: 0, max: 80 },
  ambient: { t: 'bool' },
  accentEnabled: { t: 'bool' }, accentColor: { t: 'color' },
  chartPalette: { t: 'enum', values: ['mono', 'accent', 'multi'] },
  radius: { t: 'num', min: 0, max: 28 },
  density: { t: 'enum', values: ['compact', 'comfortable', 'spacious'] },
  uiScale: { t: 'num', min: 85, max: 130 },
  fontFamily: { t: 'enum', values: ['inter', 'system', 'serif', 'mono'] },
  animations: { t: 'num', min: 0, max: 100 }
}

/** Ne garde que les clés connues, aux valeurs du bon type et dans les bornes. */
export function sanitizeTheme(raw: unknown): Partial<ThemeData> {
  const out: Record<string, unknown> = {}
  if (!raw || typeof raw !== 'object') return out
  const src = raw as Record<string, unknown>
  for (const k of THEME_KEYS) {
    const v = src[k]
    const s = THEME_SPEC[k]
    if (v === undefined) continue
    if (s.t === 'bool' && typeof v === 'boolean') out[k] = v
    else if (s.t === 'num' && typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(s.max, Math.max(s.min, v))
    else if (s.t === 'enum' && typeof v === 'string' && s.values.includes(v)) out[k] = v
    else if (s.t === 'color' && typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) out[k] = v
  }
  // L'image de fond est un fichier local : elle ne voyage pas avec un thème.
  if (out.bgMode === 'image') out.bgMode = 'default'
  return out as Partial<ThemeData>
}

export const themeFromSettings = (s: Settings): ThemeData =>
  Object.fromEntries(THEME_KEYS.map((k) => [k, s[k]])) as unknown as ThemeData

export const DEFAULT_THEME: ThemeData = themeFromSettings(DEFAULT_SETTINGS)
