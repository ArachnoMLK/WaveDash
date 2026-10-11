import { AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { Platform } from '@shared/types'
import { AddAccountDialog } from './components/AddAccountDialog'
import { Route, Sidebar } from './components/Sidebar'
import { Overview } from './pages/Overview'
import { PlatformPage } from './pages/PlatformPage'
import { Settings } from './pages/Settings'

export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>('overview')
  // `replace` : le nouveau compte remplace celui déjà connecté sur cette plateforme.
  const [adding, setAdding] = useState<{ platform: Platform; replace: boolean } | null>(null)
  const openAdd = (platform: Platform, replace = false): void => setAdding({ platform, replace })

  const page = route === 'overview' ? <Overview onAdd={openAdd} />
    : route === 'settings' ? <Settings />
    : <PlatformPage platform={route} onAdd={openAdd} />

  return (
    <>
      <div className="ambient"><i /><i /></div>
      <div className="titlebar" />
      <div className="shell">
        <Sidebar route={route} onRoute={setRoute} />
        {/* key = changement de page : le bloc est recréé et rejoue son apparition CSS */}
        <main><div className="page" key={route}>{page}</div></main>
      </div>
      <AnimatePresence>
        {adding && <AddAccountDialog key="add" platform={adding.platform} replace={adding.replace} onClose={() => setAdding(null)} />}
      </AnimatePresence>
    </>
  )
}
