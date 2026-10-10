import { motion } from 'framer-motion'
import { Platform, PLATFORMS } from '@shared/types'
import { useApp } from '../lib/AppContext'
import logoWhite from '../lib/logo-white.png'
import logoDark from '../lib/logo-dark.png'

export type Route = 'overview' | Platform | 'settings'

export function Sidebar({ route, onRoute }: { route: Route; onRoute: (r: Route) => void }): JSX.Element {
  const { t, accounts, settings, dur } = useApp()
  const item = (id: Route, label: string, dot = false): JSX.Element => (
    <button key={id} className={`nav ${route === id ? 'active' : ''}`} onClick={() => onRoute(id)}>
      {route === id && <motion.span layoutId="nav-pill" className="pill" transition={{ duration: dur * 0.6, ease: [0.22, 0.61, 0.36, 1] }} />}
      {label}{dot && <span className="dot" />}
    </button>
  )
  return (
    <nav className="glass sidebar">
      <div className="brand"><img src={settings.theme === 'dark' ? logoWhite : logoDark} alt="" />WaveDash</div>
      {item('overview', t('nav.overview'))}
      {PLATFORMS.map((p) => item(p, t(`platform.${p}`), accounts.some((a) => a.platform === p)))}
      <div className="nav-spacer" />
      {item('settings', t('nav.settings'))}
    </nav>
  )
}
