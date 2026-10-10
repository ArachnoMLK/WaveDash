import { useEffect, useRef } from 'react'
import type { EChartsOption } from 'echarts'
import { echarts } from '../lib/charts'

/** Enveloppe ECharts : crée l'instance, applique les options et suit le redimensionnement. */
export function Chart({ option, height = 300 }: { option: EChartsOption; height?: number }): JSX.Element {
  const el = useRef<HTMLDivElement>(null)
  const inst = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!el.current) return
    inst.current = echarts.init(el.current, undefined, { renderer: 'canvas' })
    const ro = new ResizeObserver(() => inst.current?.resize())
    ro.observe(el.current)
    return () => { ro.disconnect(); inst.current?.dispose(); inst.current = null }
  }, [])

  useEffect(() => { inst.current?.setOption(option, true) }, [option])
  return <div ref={el} className="chart-box" style={{ height }} />
}
