// Éléments communs aux pages de paramètres.
import { ReactNode } from 'react'
import { Reveal } from './ui'

export const Row = ({ title, help, children }: { title: string; help?: string; children: ReactNode }): JSX.Element => (
  <div className="setting"><div><div>{title}</div>{help && <div className="help">{help}</div>}</div><div>{children}</div></div>
)

export const Section = ({ title, children, delay = 0 }: { title: string; children: ReactNode; delay?: number }): JSX.Element => (
  <Reveal className="glass pad sect" delay={delay}><h2 style={{ marginBottom: 6 }}>{title}</h2>{children}</Reveal>
)

/** Curseur avec sa valeur affichée à droite. */
export function Slider({ value, min, max, unit = '', onChange }: { value: number; min: number; max: number; unit?: string; onChange: (v: number) => void }): JSX.Element {
  return (
    <div className="slider">
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(+e.target.value)} />
      <span className="muted small">{value}{unit}</span>
    </div>
  )
}
