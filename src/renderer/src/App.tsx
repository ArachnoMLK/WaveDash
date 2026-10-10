import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Platform } from '@shared/types'
import { AddAccountDialog } from './components/AddAccountDialog'
import { Route, Sidebar } from './components/Sidebar'
import { useApp } from './lib/AppContext'
import { Overview } from './pages/Overview'
import { PlatformPage } from './pages/PlatformPage'
import { Settings } from './pages/Settings'

export function App(): JSX.Element {
  const { dur } = useApp()
  const [route, setRoute] = useState<Route>('overview')
  const [adding, setAdding] = useState<Platform | null>(null)

  const page = route === 'overview' ? <Overview onAdd={setAdding} />
    : route === 'settings' ? <Settings />
    : <PlatformPage key={route} platform={route} onAdd={setAdding} />

  return (
    <>
      <div className="ambient"><i /><i /></div>
      <div className="titlebar" />
      <div className="shell">
        <Sidebar route={route} onRoute={setRoute} />
        <main>
          <AnimatePresence mode="wait">
            <motion.div key={route} initial={dur ? { opacity: 0 } : false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur * 0.45 }}>
              {page}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <AnimatePresence>{adding && <AddAccountDialog key="add" platform={adding} onClose={() => setAdding(null)} />}</AnimatePresence>
    </>
  )
}
