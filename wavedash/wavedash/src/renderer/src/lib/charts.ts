// Construction des options ECharts en niveaux de gris. Les séries sont distinguées par la nuance ET par des
// motifs (hachures) grâce à l'option `aria.decal`, pour rester lisibles sans couleur.
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, RadarChart } from 'echarts/charts'
import { AriaComponent, GridComponent, LegendComponent, RadarComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import { ChartType, Lang, Point } from '@shared/types'
import { fmt } from './format'

echarts.use([BarChart, LineChart, PieChart, RadarChart, AriaComponent, GridComponent, LegendComponent, RadarComponent, TooltipComponent, CanvasRenderer])
export { echarts }

export interface ChartTheme { dark: boolean; lang: Lang; animMs: number }
export interface NamedSeries { name: string; points: Point[] }
export interface Category { name: string; value: number }

const PALETTE = {
  dark: ['#f5f5f5', '#b9b9b9', '#858585', '#5a5a5a', '#3b3b3b', '#d4d4d4', '#707070'],
  light: ['#141414', '#454545', '#767676', '#a2a2a2', '#cbcbcb', '#2c2c2c', '#8c8c8c']
}

function base(th: ChartTheme): EChartsOption {
  const ink = th.dark ? '#e6e6e6' : '#1a1a1a'
  return {
    color: th.dark ? PALETTE.dark : PALETTE.light,
    textStyle: { color: ink, fontFamily: 'Inter Variable, Segoe UI, sans-serif' },
    animationDuration: th.animMs, animationDurationUpdate: th.animMs, animationEasing: 'cubicOut',
    aria: { enabled: true, decal: { show: true } },
    tooltip: {
      trigger: 'item', confine: true, borderWidth: 0, textStyle: { color: ink, fontSize: 12.5 },
      backgroundColor: th.dark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.94)'
    }
  }
}

const axisStyle = (th: ChartTheme) => ({
  axisLine: { lineStyle: { color: th.dark ? '#3a3a3a' : '#cfcfcf' } },
  axisLabel: { color: th.dark ? '#8f8f8f' : '#6b6b6b', fontSize: 11.5 },
  splitLine: { lineStyle: { color: th.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)' } }
})

/** Courbe / aire / barres dans le temps. L'axe Y ne démarre pas à zéro pour que l'évolution reste visible. */
export function timeOption(type: ChartType, series: NamedSeries[], th: ChartTheme, unit = ''): EChartsOption {
  const kind = type === 'bar' ? 'bar' : 'line'
  const ax = axisStyle(th)
  return {
    ...base(th),
    grid: { left: 8, right: 16, top: series.length > 1 ? 36 : 14, bottom: 6, containLabel: true },
    legend: series.length > 1 ? { top: 0, textStyle: { color: th.dark ? '#bbb' : '#444' }, icon: 'roundRect' } : undefined,
    tooltip: { ...(base(th).tooltip as object), trigger: 'axis', valueFormatter: (v) => `${fmt(Number(v), th.lang, 1)}${unit}` },
    xAxis: { type: 'time', ...ax, splitLine: { show: false } },
    yAxis: { type: 'value', scale: true, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => fmt(v, th.lang) } },
    series: series.map((s) => ({
      name: s.name, type: kind, smooth: kind === 'line' ? 0.35 : undefined, showSymbol: false,
      data: s.points.map((p) => [p.ts, p.value]),
      lineStyle: { width: 2 },
      areaStyle: type === 'area' ? { opacity: 0.18 } : undefined,
      barMaxWidth: 18, itemStyle: kind === 'bar' ? { borderRadius: [4, 4, 0, 0] } : undefined
    }))
  } as EChartsOption
}

/** Données par catégorie : barres, camembert ou radar. */
export function categoryOption(type: ChartType, data: Category[], th: ChartTheme, unit = '', radarMax?: number): EChartsOption {
  const ax = axisStyle(th)
  const tip = { ...(base(th).tooltip as object), valueFormatter: (v: unknown) => `${fmt(Number(v), th.lang, 1)}${unit}` }
  if (type === 'pie') {
    return { ...base(th), tooltip: tip, legend: { bottom: 0, textStyle: { color: th.dark ? '#bbb' : '#444' }, icon: 'circle' },
      series: [{ type: 'pie', radius: ['46%', '72%'], center: ['50%', '45%'], padAngle: 2, itemStyle: { borderRadius: 6 }, label: { show: false }, data }] }
  }
  if (type === 'radar') {
    const max = radarMax ?? Math.max(1, ...data.map((d) => d.value)) * 1.1
    return { ...base(th), tooltip: tip,
      radar: { indicator: data.map((d) => ({ name: d.name, max })), radius: '68%', axisName: { color: th.dark ? '#aaa' : '#555', fontSize: 11 },
        splitLine: { lineStyle: { color: th.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' } }, splitArea: { show: false }, axisLine: { lineStyle: { color: th.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' } } },
      series: [{ type: 'radar', symbol: 'none', lineStyle: { width: 2 }, areaStyle: { opacity: 0.2 }, data: [{ value: data.map((d) => d.value), name: unit || ' ' }] }] }
  }
  return { ...base(th), tooltip: { ...tip, trigger: 'axis' }, grid: { left: 8, right: 12, top: 14, bottom: 6, containLabel: true },
    xAxis: { type: 'category', data: data.map((d) => d.name), ...ax, splitLine: { show: false }, axisLabel: { ...ax.axisLabel, interval: 0, rotate: data.length > 7 ? 35 : 0 } },
    yAxis: { type: 'value', ...ax },
    series: [{ type: 'bar', barMaxWidth: 26, itemStyle: { borderRadius: [5, 5, 0, 0] }, data: data.map((d) => d.value) }] }
}
