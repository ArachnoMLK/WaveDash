// Periodic refresh of the followed accounts.
import { Account } from '@shared/types'
import * as db from './db'
import { processRefresh } from './milestones'
import { refreshAllPlugins } from './plugins/manager'
import { nextMetrics } from './providers/mock'
import { getProvider } from './providers'
import { ProviderError } from './providers/types'

let timer: NodeJS.Timeout | null = null
let onUpdate: () => void = () => {}

/** Refreshes an account and saves the result; any error is kept for display. */
export async function refreshAccount(a: Account): Promise<void> {
  try {
    const prev = db.getLatest(a.id)
    const res = a.demo ? nextMetrics(a.platform, prev) : await getProvider(a.platform).fetch(a.externalId)
    // Milestones are compared before saving the new reading; a notification error must not block the refresh.
    try { processRefresh(a, prev, res) } catch (e) { console.error('Paliers :', e) }
    db.insertSnapshots(a.id, res.metrics)
    if (res.items) db.saveItems(a.id, res.items)
    db.markSync(a.id, null)
  } catch (e) {
    db.markSync(a.id, e instanceof ProviderError ? e.code : 'api')
  }
}

export async function refreshAll(): Promise<void> {
  await Promise.all(db.listAccounts().map(refreshAccount))
  try { await refreshAllPlugins() } catch (e) { console.error('Plugins :', e) }
  onUpdate()
}

/** (Re)starts the scheduler with the frequency chosen in the settings. */
export function startScheduler(updateCb?: () => void): void {
  if (updateCb) onUpdate = updateCb
  if (timer) clearInterval(timer)
  const minutes = Math.max(5, db.getSettings().refreshMinutes)
  timer = setInterval(() => void refreshAll(), minutes * 60_000)
}
