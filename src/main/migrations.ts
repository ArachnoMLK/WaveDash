// Migrations au démarrage. 1.0.1 : le Brawlhalla intégré (clé API) devient le plugin « Brawlhalla (API officielle) ».
// Un compte de démo est supprimé ; un vrai compte est rattaché au plugin en gardant son historique, sa clé et ses paliers.
import * as db from './db'
import * as secrets from './secrets'
import { installPending, inspectPackage, listBundled, refreshPluginAccount } from './plugins/manager'
import { MilestoneRule } from '@shared/types'

const PLUGIN = 'wavedash.brawlhalla-api'
const OLD_SECRET = 'brawlhalla.apiKey' as never, NEW_SECRET = `plugin:${PLUGIN}:apiKey` as const

export function migrateBuiltinBrawlhalla(): void {
  const old = db.listAccounts().filter((a) => (a.platform as string) === 'brawlhalla')
  for (const a of old.filter((x) => x.demo)) db.deleteAccount(a.id)
  const real = old.filter((x) => !x.demo)
  if (!real.length) { if (secrets.hasSecret(OLD_SECRET)) moveSecret(); return }

  if (!db.getPluginRow(PLUGIN)) {
    // Même accès réseau que l'ancienne intégration (api.brawlhalla.com seulement) : le plugin fourni est installé d'office.
    const b = listBundled().find((x) => x.id === PLUGIN), r = b && inspectPackage(b.path)
    if (!r || !r.ok || !installPending(r.inspect.token).ok) { console.error('Migration Brawlhalla : plugin introuvable'); return }
  }
  moveSecret()

  const s = db.getSettings(), rules: Record<string, MilestoneRule> = {}
  for (const [k, v] of Object.entries(s.milestoneRules)) rules[k.startsWith('brawlhalla.') ? `plugin:${PLUGIN}.${k.slice(11)}` : k] = v
  // Comportement d'avant pour l'ELO : un palier tous les 100 points, dans les deux sens.
  rules[`plugin:${PLUGIN}.elo_1v1`] ??= { enabled: true, sequence: false, increment: 100, custom: [], notifyDown: true }
  rules[`plugin:${PLUGIN}.elo_2v2`] ??= { enabled: true, sequence: false, increment: 100, custom: [], notifyDown: true }
  db.setSettings({ milestoneRules: rules })

  for (const a of real) {
    db.convertToPluginAccount(a.id, PLUGIN, { player: a.input })
    void refreshPluginAccount(a.id)
  }
}

function moveSecret(): void {
  const key = secrets.getSecret(OLD_SECRET)
  if (key && !secrets.hasSecret(NEW_SECRET)) secrets.setSecret(NEW_SECRET, key)
  secrets.deleteSecret(OLD_SECRET)
}
