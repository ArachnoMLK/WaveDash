// Detection of milestones crossed (up and down) and rank changes, then notification.
import { Notification } from 'electron'
import { DEFAULT_TEMPLATES, METRIC_NAMES, PLATFORM_NAMES, renderTemplate, SAMPLE_ACCOUNT, templateVars } from '@shared/labels'
import { crossedDown, crossedUp, getPluginRule, getRule, MILESTONE_METRICS, pluginMilestoneMetrics } from '@shared/milestones'
import { Account, LatestMetrics, localeOf, MilestoneEvent, ProviderResult, Settings, TemplateKey } from '@shared/types'
import { loc, PluginManifest, PluginNotice } from '@shared/plugin'
import * as db from './db'

let emit: (e: MilestoneEvent) => void = () => {}
let showWindow: () => void = () => {}

export function initMilestones(onEvent: (e: MilestoneEvent) => void, onClick: () => void): void {
  emit = onEvent
  showWindow = onClick
}

const fmtNum = (n: number, s: Settings): string => new Intl.NumberFormat(localeOf(s.lang), { maximumFractionDigits: 1 }).format(n)

/** Final message: custom text if any, otherwise the default text of the language. */
function message(s: Settings, tpl: TemplateKey, a: Account, e: Omit<MilestoneEvent, 'id' | 'message'>): string {
  const text = s.notifyTemplates[tpl]?.trim() || (DEFAULT_TEMPLATES[s.lang] ?? DEFAULT_TEMPLATES.en)[tpl]
  const stat = e.metric === 'rank' ? (s.lang === 'fr' ? 'Rang' : 'Rank') : (METRIC_NAMES[s.lang] ?? METRIC_NAMES.en)[e.metric as keyof (typeof METRIC_NAMES)['en']] ?? e.metric
  return renderTemplate(text, templateVars({
    platform: PLATFORM_NAMES[a.platform], stat, value: fmtNum(e.value, s), threshold: fmtNum(e.threshold, s), previous: fmtNum(e.previous, s),
    account: a.displayName, rank: e.toRank ?? '', oldRank: e.fromRank ?? ''
  }))
}

/** Sends the Windows notification and tells the interface (sound, celebration). */
function deliver(s: Settings, e: MilestoneEvent): void {
  if (!s.notificationsEnabled) return
  if (Notification.isSupported()) {
    // The sound is played by the interface (choice of sound and volume): the system notification stays silent.
    const n = new Notification({ title: `WaveDash · ${e.platform === 'plugin' ? e.source ?? 'Plugin' : PLATFORM_NAMES[e.platform]}${e.demo ? ' (demo)' : ''}`, body: e.message, silent: true })
    n.on('click', showWindow)
    n.show()
  }
  emit(e)
}

/**
 * Compares the previous values with the new ones. Call BEFORE saving the new reading.
 * The very first reading of an account triggers nothing (nothing to compare).
 */
export function processRefresh(a: Account, prev: LatestMetrics, res: ProviderResult): void {
  if (Object.keys(prev).length === 0) return
  const s = db.getSettings()
  const ts = Date.now()

  for (const metric of MILESTONE_METRICS[a.platform]) {
    const from = prev[metric], to = res.metrics[metric]
    if (from === undefined || to === undefined || from === to) continue
    const rule = getRule(s.milestoneRules, a.platform, metric)
    if (!rule.enabled) continue
    const up = crossedUp(rule, from, to)
    const down = rule.notifyDown ? crossedDown(rule, from, to) : null
    const threshold = up ?? down
    if (threshold === null) continue
    const base = { accountId: a.id, platform: a.platform, account: a.displayName, metric, threshold, previous: from, value: to,
      direction: (up !== null ? 'up' : 'down') as 'up' | 'down', ts, demo: a.demo }
    const event: MilestoneEvent = { ...base, id: 0, message: message(s, up !== null ? 'up' : 'down', a, base) }
    event.id = db.insertEvent(event)
    deliver(s, event)
  }
}

/** Test notification (not recorded in the history). */
export function fireTest(): void {
  const s = db.getSettings()
  const base = { accountId: 0, platform: 'youtube' as const, account: SAMPLE_ACCOUNT[s.lang] ?? SAMPLE_ACCOUNT.en, metric: 'subscribers', threshold: 1000,
    previous: 998, value: 1002, direction: 'up' as const, ts: Date.now(), demo: true }
  const fake = { id: 0, displayName: base.account, platform: 'youtube' } as unknown as Account
  deliver({ ...s, notificationsEnabled: true }, { ...base, id: 0, message: message(s, 'up', fake, base) })
}

/** Plugin milestones: by default on the main metric (if it is a number), sequence 10, 20, 50, 100…
 *  A rule saved as "plugin:<id>.<metric>" in the settings replaces it. Call BEFORE saving the reading. */
export function processPluginRefresh(accountId: number, account: string, m: PluginManifest, prev: Record<string, number>, next: Record<string, number>): void {
  if (Object.keys(prev).length === 0) return
  const s = db.getSettings(), ts = Date.now()
  for (const metric of pluginMilestoneMetrics(m)) {
    const from = prev[metric.key], to = next[metric.key]
    if (from === undefined || to === undefined || from === to) continue
    const rule = getPluginRule(s.milestoneRules, m.id, metric)
    if (!rule.enabled) continue
    const up = crossedUp(rule, from, to), down = rule.notifyDown ? crossedDown(rule, from, to) : null
    const threshold = up ?? down
    if (threshold === null) continue
    const text = s.notifyTemplates[up !== null ? 'up' : 'down']?.trim() || (DEFAULT_TEMPLATES[s.lang] ?? DEFAULT_TEMPLATES.en)[up !== null ? 'up' : 'down']
    const e = { accountId, platform: 'plugin' as const, source: m.name, account, metric: metric.key, label: loc(metric.label, s.lang), threshold, previous: from, value: to,
      direction: (up !== null ? 'up' : 'down') as 'up' | 'down', ts, demo: false }
    const event: MilestoneEvent = { ...e, id: 0, message: renderTemplate(text, templateVars({ platform: m.name, stat: loc(metric.label, s.lang), value: fmtNum(to, s),
      threshold: fmtNum(threshold, s), previous: fmtNum(from, s), account, rank: '', oldRank: '' })) }
    event.id = db.insertEvent(event)
    deliver(s, event)
  }
}

/** Notifications sent by a plugin (e.g. new rank): each `id` is sent only once per account; the
 *  "Plugin notifications" setting can turn them off. Recorded in the history like milestones. */
export function processPluginNotices(accountId: number, account: string, m: PluginManifest, notices: PluginNotice[]): void {
  if (!notices.length) return
  const s = db.getSettings()
  let seen: string[] = []
  try { seen = JSON.parse(db.getMeta(accountId, 'notices') ?? '[]') as string[] } catch { seen = [] }
  const fresh = notices.filter((n) => !seen.includes(n.id))
  if (!fresh.length) return
  db.setMeta(accountId, 'notices', JSON.stringify([...seen, ...fresh.map((n) => n.id)].slice(-200)))
  if (s.pluginNotices[m.id] === false) return
  const ts = Date.now()
  for (const n of fresh) {
    const event: MilestoneEvent = { id: 0, accountId, platform: 'plugin', source: m.name, account, metric: 'notice', threshold: 0, previous: 0, value: 0,
      direction: n.direction, ts, toRank: n.title, message: n.text, demo: false }
    event.id = db.insertEvent(event)
    deliver(s, event)
  }
}
