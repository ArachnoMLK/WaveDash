// Détection des paliers franchis (hausse et baisse) et des changements de rang, puis notification.
import { Notification } from 'electron'
import { DEFAULT_TEMPLATES, METRIC_NAMES, PLATFORM_NAMES, renderTemplate, templateVars } from '@shared/labels'
import { crossedDown, crossedUp, getRule, MILESTONE_METRICS } from '@shared/milestones'
import { Account, LatestMetrics, MilestoneEvent, ProviderResult, Settings, TemplateKey } from '@shared/types'
import { loc, PluginManifest } from '@shared/plugin'
import type { MilestoneRule } from '@shared/types'
import * as db from './db'

let emit: (e: MilestoneEvent) => void = () => {}
let showWindow: () => void = () => {}

export function initMilestones(onEvent: (e: MilestoneEvent) => void, onClick: () => void): void {
  emit = onEvent
  showWindow = onClick
}

const fmtNum = (n: number, s: Settings): string => new Intl.NumberFormat(s.lang === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: 1 }).format(n)

/** Message final : texte personnalisé s'il existe, sinon texte par défaut de la langue. */
function message(s: Settings, tpl: TemplateKey, a: Account, e: Omit<MilestoneEvent, 'id' | 'message'>): string {
  const text = s.notifyTemplates[tpl]?.trim() || DEFAULT_TEMPLATES[s.lang][tpl]
  const stat = e.metric === 'rank' ? (s.lang === 'fr' ? 'Rang' : 'Rank') : METRIC_NAMES[s.lang][e.metric as keyof (typeof METRIC_NAMES)['fr']] ?? e.metric
  return renderTemplate(text, templateVars({
    platform: PLATFORM_NAMES[a.platform], stat, value: fmtNum(e.value, s), threshold: fmtNum(e.threshold, s), previous: fmtNum(e.previous, s),
    account: a.displayName, rank: e.toRank ?? '', oldRank: e.fromRank ?? ''
  }))
}

/** Envoie la notification Windows et prévient l'interface (son, célébration). */
function deliver(s: Settings, e: MilestoneEvent): void {
  if (!s.notificationsEnabled) return
  if (Notification.isSupported()) {
    // Le son est joué par l'interface (choix du son et du volume) : la notification système reste muette.
    const n = new Notification({ title: `WaveDash · ${e.platform === 'plugin' ? e.source ?? 'Plugin' : PLATFORM_NAMES[e.platform]}${e.demo ? ' (démo)' : ''}`, body: e.message, silent: true })
    n.on('click', showWindow)
    n.show()
  }
  emit(e)
}

/**
 * Compare les valeurs précédentes aux nouvelles. À appeler AVANT l'enregistrement du nouveau relevé.
 * Le tout premier relevé d'un compte ne déclenche rien (rien à comparer).
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

/** Notification de test (non enregistrée dans l'historique). */
export function fireTest(): void {
  const s = db.getSettings()
  const base = { accountId: 0, platform: 'youtube' as const, account: s.lang === 'fr' ? 'Ma chaîne' : 'My channel', metric: 'subscribers', threshold: 1000,
    previous: 998, value: 1002, direction: 'up' as const, ts: Date.now(), demo: true }
  const fake = { id: 0, displayName: base.account, platform: 'youtube' } as unknown as Account
  deliver({ ...s, notificationsEnabled: true }, { ...base, id: 0, message: message(s, 'up', fake, base) })
}

/** Paliers des plugins : par défaut sur la métrique principale (si c'est un nombre), séquence 10, 20, 50, 100…
 *  Une règle enregistrée sous « plugin:<id>.<métrique> » dans les réglages la remplace. À appeler AVANT d'enregistrer le relevé. */
export function processPluginRefresh(accountId: number, account: string, m: PluginManifest, prev: Record<string, number>, next: Record<string, number>): void {
  if (Object.keys(prev).length === 0) return
  const s = db.getSettings(), ts = Date.now()
  for (const metric of m.metrics) {
    const from = prev[metric.key], to = next[metric.key]
    if (from === undefined || to === undefined || from === to) continue
    const base: MilestoneRule = { enabled: metric.primary && metric.format === 'number', sequence: true, increment: 0, custom: [], notifyDown: false }
    const rule: MilestoneRule = { ...base, ...s.milestoneRules[`plugin:${m.id}.${metric.key}`] }
    if (!rule.enabled) continue
    const up = crossedUp(rule, from, to), down = rule.notifyDown ? crossedDown(rule, from, to) : null
    const threshold = up ?? down
    if (threshold === null) continue
    const text = s.notifyTemplates[up !== null ? 'up' : 'down']?.trim() || DEFAULT_TEMPLATES[s.lang][up !== null ? 'up' : 'down']
    const e = { accountId, platform: 'plugin' as const, source: m.name, account, metric: metric.key, threshold, previous: from, value: to,
      direction: (up !== null ? 'up' : 'down') as 'up' | 'down', ts, demo: false }
    const event: MilestoneEvent = { ...e, id: 0, message: renderTemplate(text, templateVars({ platform: m.name, stat: loc(metric.label, s.lang), value: fmtNum(to, s),
      threshold: fmtNum(threshold, s), previous: fmtNum(from, s), account, rank: '', oldRank: '' })) }
    event.id = db.insertEvent(event)
    deliver(s, event)
  }
}
