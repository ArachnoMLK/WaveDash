// Startup migrations. 1.0.1: the built-in Brawlhalla (API key) becomes the "Brawlhalla (official API)" plugin.
// A demo account is removed; a real account is attached to the plugin, keeping its history, key and milestones.
import * as db from './db'
import * as secrets from './secrets'
import { installPending, inspectPackage, listBundled, refreshPluginAccount } from './plugins/manager'
import { detectLang, MilestoneRule } from '@shared/types'
import { modernizeTemplate } from '@shared/labels'

const PLUGIN = 'wavedash.brawlhalla-api'
const OLD_SECRET = 'brawlhalla.apiKey' as never, NEW_SECRET = `plugin:${PLUGIN}:apiKey` as const

/** 1.6.0: the interface follows the Windows language on first launch (it used to default to French). Saved once, so the
 *  user's own choice in Settings is kept afterwards. Notification texts move to the English variable names. */
export function languageDefaults(systemLanguages: readonly string[]): void {
  if (!db.hasSetting('lang')) db.setSettings({ lang: detectLang(systemLanguages) })
  const tpl = db.getSettings().notifyTemplates, next = Object.fromEntries(Object.entries(tpl).map(([k, v]) => [k, typeof v === 'string' ? modernizeTemplate(v) : v]))
  if (JSON.stringify(next) !== JSON.stringify(tpl)) db.setSettings({ notifyTemplates: next })
}

/** 1.1.0: the built-in Instagram and TikTok platforms are removed. They had no provider: an account
 *  could only be a demo, removed here. TikTok tracking goes through the "TikTok (public profile)" plugin. */
export function removeSocialPlaceholders(): void {
  for (const a of db.listAccounts().filter((x) => ['instagram', 'tiktok'].includes(x.platform as string))) db.deleteAccount(a.id)
}

/** `refresh`: refresh of the converted account (replaceable in tests, which must not call the API). */
export function migrateBuiltinBrawlhalla(refresh: (id: number) => Promise<void> = refreshPluginAccount): void {
  const old = db.listAccounts().filter((a) => (a.platform as string) === 'brawlhalla')
  for (const a of old.filter((x) => x.demo)) db.deleteAccount(a.id)
  const real = old.filter((x) => !x.demo)
  if (!real.length) { if (secrets.hasSecret(OLD_SECRET)) moveSecret(); return }

  if (!db.getPluginRow(PLUGIN)) {
    // Same network access as the old integration (api.brawlhalla.com only): the bundled plugin is installed automatically.
    const b = listBundled().find((x) => x.id === PLUGIN), r = b && inspectPackage(b.path)
    if (!r || !r.ok || !installPending(r.inspect.token).ok) { console.error('Migration Brawlhalla : plugin introuvable'); return }
  }
  moveSecret()

  const s = db.getSettings(), rules: Record<string, MilestoneRule> = {}
  for (const [k, v] of Object.entries(s.milestoneRules)) rules[k.startsWith('brawlhalla.') ? `plugin:${PLUGIN}.${k.slice(11)}` : k] = v
  // Previous ELO behaviour: a milestone every 100 points, in both directions.
  rules[`plugin:${PLUGIN}.elo_1v1`] ??= { enabled: true, sequence: false, increment: 100, custom: [], notifyDown: true }
  rules[`plugin:${PLUGIN}.elo_2v2`] ??= { enabled: true, sequence: false, increment: 100, custom: [], notifyDown: true }
  db.setSettings({ milestoneRules: rules })

  for (const a of real) {
    db.convertToPluginAccount(a.id, PLUGIN, { player: a.input })
    void refresh(a.id)
  }
}

function moveSecret(): void {
  const key = secrets.getSecret(OLD_SECRET)
  if (key && !secrets.hasSecret(NEW_SECRET)) secrets.setSecret(NEW_SECRET, key)
  secrets.deleteSecret(OLD_SECRET)
}
