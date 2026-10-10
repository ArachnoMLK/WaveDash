import { useMemo } from 'react'
import { useApp } from './AppContext'
import type { ChartTheme } from './charts'

export function useChartTheme(): ChartTheme {
  const { settings, dur } = useApp()
  return useMemo(() => ({ dark: settings.theme === 'dark', lang: settings.lang, animMs: Math.round(dur * 1100) }), [settings.theme, settings.lang, dur])
}

/** « bodvar » → « Bodvar » (l'API renvoie des clés en minuscules). */
export const prettyName = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
