// Petits composants réutilisables : onglets, carte de statistique, interrupteur, volet de transition.
import { motion } from 'framer-motion'
import { ReactNode, useId } from 'react'
import { useApp } from '../lib/AppContext'

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }): JSX.Element {
  const gid = useId()
  const { dur } = useApp()
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={o.id === value} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.id === value && <motion.span layoutId={gid} className="bg" transition={{ duration: dur * 0.6, ease: [0.22, 0.61, 0.36, 1] }} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function StatCard({ label, value, delta, selected, onClick }: { label: string; value: string; delta?: string; selected?: boolean; onClick?: () => void }): JSX.Element {
  const inner = (<><div className="label">{label}</div><div className="value">{value}</div>{delta && <div className="delta">{delta}</div>}</>)
  return onClick
    ? <button className={`glass stat ${selected ? 'selected' : ''}`} onClick={onClick}>{inner}</button>
    : <div className="glass stat static">{inner}</div>
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }): JSX.Element {
  return <div className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} tabIndex={0}
    onClick={() => onChange(!on)} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && onChange(!on)} />
}

/** Apparition douce d'un bloc ; `delay` permet un léger décalage entre éléments voisins. */
// Animation purement CSS (fill-mode « backwards ») : une fois terminée, l'élément reprend son style normal,
// et elle ne dépend plus de JavaScript, donc rien ne peut rester invisible après une réduction de la fenêtre.
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }): JSX.Element {
  const { dur } = useApp()
  return <div className={`reveal ${className ?? ''}`} style={{ animationDuration: `${dur}s`, animationDelay: dur ? `${delay}s` : '0s' }}>{children}</div>
}
