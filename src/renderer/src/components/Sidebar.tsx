import { motion } from 'framer-motion'
import { useApp } from '../lib/AppContext'
import { orderedNav } from '../lib/constants'
import logoWhite from '../lib/logo-white.png'
import logoDark from '../lib/logo-dark.png'

/** 'overview', une plateforme, ou 'settings'. */
export type Route = string

/** Onglets visibles dans l'ordre choisi (la vue d'ensemble reste toujours présente). */
export const visibleNav = (order: string[], hidden: string[]): string[] =>
  orderedNav(order).filter((id) => id === 'overview' || !hidden.includes(id))

export function Sidebar({ route, onRoute }: { route: Route; onRoute: (r: Route) => void }): JSX.Element {
  const { t, accounts, settings, dur, update } = useApp()
  const item = (id: Route, label: string, dot = false): JSX.Element => (
    <button key={id} className={`nav ${route === id ? 'active' : ''}`} onClick={() => onRoute(id)}>
      {route === id && <motion.span layoutId="nav-pill" className="pill" transition={{ duration: dur * 0.6, ease: [0.22, 0.61, 0.36, 1] }} />}
      {label}{dot && <span className="dot" />}
    </button>
  )
  return (
    <nav className="glass sidebar">
      <div className="brand"><img src={settings.theme === 'dark' ? logoWhite : logoDark} alt="" />WaveDash</div>
      {visibleNav(settings.navOrder, settings.navHidden).map((id) =>
        id === 'overview' ? item(id, t('nav.overview')) : item(id, t(`platform.${id}`), accounts.some((a) => a.platform === id)))}
      <div className="nav-spacer" />
      {update.state === 'ready' && (
        <div className="banner">
          {t('up.banner', { v: update.version ?? '' })}
          <button className="btn small primary" onClick={() => void window.api.installUpdate()}>{t('up.install')}</button>
        </div>
      )}
      {item('settings', t('nav.settings'))}
    </nav>
  )
}
