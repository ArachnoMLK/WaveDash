import { AnimatePresence } from 'framer-motion'
import { CSSProperties, useEffect, useState } from 'react'
import { Platform, Settings as AppSettings } from '@shared/types'
import { AddAccountDialog } from './components/AddAccountDialog'
import { Route, Sidebar, visibleNav } from './components/Sidebar'
import { useApp } from './lib/AppContext'
import { Celebration } from './components/Celebration'
import { Goals } from './pages/Goals'
import { PluginPage } from './pages/PluginPage'
import { PluginsPage } from './pages/PluginsPage'
import { pluginAccountOfRoute } from './lib/plugin'
import { Overview } from './pages/Overview'
import { PlatformPage } from './pages/PlatformPage'
import { Settings } from './pages/Settings'

/** Style de la couche de fond selon le mode choisi (null = fond par défaut du thème). */
function backgroundStyle(s: AppSettings, bgUrl: string | null): CSSProperties | null {
  if (s.bgMode === 'solid') return { background: s.bgColor }
  if (s.bgMode === 'gradient') return { background: `linear-gradient(${s.bgAngle}deg, ${s.bgColor}, ${s.bgColor2})` }
  if (s.bgMode === 'image' && bgUrl) return { backgroundImage: `url("${bgUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center', filter: `blur(${s.bgBlur}px)`, transform: 'scale(1.08)' }
  return null
}

export function App(): JSX.Element {
  const { settings, bgUrl, pluginAccounts } = useApp()
  const [route, setRoute] = useState<Route>('overview')
  // `replace` : le nouveau compte remplace celui déjà connecté sur cette plateforme.
  const [adding, setAdding] = useState<{ platform: Platform; replace: boolean } | null>(null)
  const openAdd = (platform: Platform, replace = false): void => setAdding({ platform, replace })

  // Fichier .wdsh reçu (double-clic dans l'Explorateur ou fenêtre déjà ouverte) : on ouvre la page Plugins pour le valider.
  const [incoming, setIncoming] = useState<string | null>(null)
  useEffect(() => {
    void window.api.takePendingPluginFile().then((p) => { if (p) { setIncoming(p); setRoute('plugins') } })
    return window.api.onPluginFile((p) => { setIncoming(p); setRoute('plugins') })
  }, [])

  // Un onglet masqué (ou un compte de plugin supprimé) ramène à la vue d'ensemble.
  const pluginId = pluginAccountOfRoute(route)
  const known = route === 'settings' || route === 'plugins' || (pluginId !== null && pluginAccounts.some((a) => a.id === pluginId))
  const current = known || visibleNav(settings.navOrder, settings.navHidden).includes(route) ? route : 'overview'
  const bg = backgroundStyle(settings, bgUrl)

  const page = current === 'overview' ? <Overview onAdd={openAdd} />
    : current === 'goals' ? <Goals />
    : current === 'plugins' ? <PluginsPage openPath={incoming} onOpenHandled={() => setIncoming(null)} />
    : pluginAccountOfRoute(current) !== null ? <PluginPage accountId={pluginAccountOfRoute(current)!} />
    : current === 'settings' ? <Settings />
    : <PlatformPage platform={current as Platform} onAdd={openAdd} />

  return (
    <>
      {bg && <div className="bg-layer" style={bg} />}
      {bg && settings.bgMode === 'image' && <div className="bg-dim" style={{ background: `rgba(0,0,0,${settings.bgDim / 100})` }} />}
      {settings.ambient && !bg && <div className="ambient"><i /><i /></div>}
      <div className="titlebar" />
      <div className="shell">
        <Sidebar route={current} onRoute={setRoute} />
        {/* key = changement de page : le bloc est recréé et rejoue son apparition CSS */}
        <main><div className="page" key={current}>{page}</div></main>
      </div>
      <Celebration />
      <AnimatePresence>
        {adding && <AddAccountDialog key="add" platform={adding.platform} replace={adding.replace} onClose={() => setAdding(null)} />}
      </AnimatePresence>
    </>
  )
}
