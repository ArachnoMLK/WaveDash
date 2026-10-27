// Milestone logic: threshold values, next milestone, crossing. Pure functions, used by
// the main process (detection) and by the interface (goals, progress bars).
import { MetricKey, MilestoneRule, Platform } from './types'
import type { PluginManifest, PluginMetric } from './plugin'

/** Statistics for which milestones can be defined. */
export const MILESTONE_METRICS: Record<Platform, MetricKey[]> = {
  youtube: ['subscribers', 'views', 'likes', 'comments', 'videos']
}

export const ruleKey = (p: Platform, m: MetricKey): string => `${p}.${m}`
/** Default rule: sequence 10-20-50… for the main counters. */
export function defaultRule(_p: Platform, m: MetricKey): MilestoneRule {
  return { enabled: ['subscribers', 'views', 'likes'].includes(m), sequence: true, increment: 0, custom: [], notifyDown: false }
}

export const getRule = (rules: Record<string, MilestoneRule>, p: Platform, m: MetricKey): MilestoneRule =>
  ({ ...defaultRule(p, m), ...rules[ruleKey(p, m)] })

/* ---------- Plugin milestones ---------- */
export const pluginRuleKey = (pluginId: string, metric: string): string => `plugin:${pluginId}.${metric}`
/** Plugin metrics that can have milestones: numbers and percentages (not ranks or durations). */
export const pluginMilestoneMetrics = (m: PluginManifest): PluginMetric[] => m.metrics.filter((x) => x.format === 'number' || x.format === 'percent')
/** Default rule: the one offered by the manifest (e.g. a milestone every 100 for an ELO), otherwise the sequence 10-20-50…
 *  on the main metric only. */
export function pluginDefaultRule(x: PluginMetric): MilestoneRule {
  const ms = x.milestone
  if (ms) return { enabled: ms.enabled ?? true, sequence: !ms.increment, increment: ms.increment ?? 0, custom: [], notifyDown: ms.notifyDown ?? false }
  return { enabled: x.primary && x.format === 'number', sequence: true, increment: 0, custom: [], notifyDown: false }
}
export const getPluginRule = (rules: Record<string, MilestoneRule>, pluginId: string, x: PluginMetric): MilestoneRule =>
  ({ ...pluginDefaultRule(x), ...rules[pluginRuleKey(pluginId, x.key)] })

const SEQ = [1, 2, 5]
/** Smallest term of 10, 20, 50, 100, 200, 500… strictly greater than v. */
function seqNext(v: number): number {
  for (let k = 1; k <= 15; k++) for (const m of SEQ) { const t = m * 10 ** k; if (t > v) return t }
  return Infinity
}
/** Largest term of the sequence less than or equal to v (null under 10). */
function seqPrev(v: number): number | null {
  let best: number | null = null
  for (let k = 1; k <= 15; k++) for (const m of SEQ) { const t = m * 10 ** k; if (t <= v) best = t }
  return best
}

/** Smallest milestone strictly greater than v. */
export function nextThreshold(rule: MilestoneRule, v: number): number | null {
  const c: number[] = []
  if (rule.sequence) c.push(seqNext(v))
  if (rule.increment > 0) c.push((Math.floor(v / rule.increment) + 1) * rule.increment)
  for (const x of rule.custom) if (x > v) c.push(x)
  const m = Math.min(...c.filter(Number.isFinite))
  return Number.isFinite(m) ? m : null
}

/** Largest milestone less than or equal to v (null if there is none). */
export function prevThreshold(rule: MilestoneRule, v: number): number | null {
  const c: number[] = []
  if (rule.sequence) { const s = seqPrev(v); if (s !== null) c.push(s) }
  if (rule.increment > 0) { const i = Math.floor(v / rule.increment) * rule.increment; if (i > 0) c.push(i) }
  for (const x of rule.custom) if (x <= v) c.push(x)
  return c.length ? Math.max(...c) : null
}

/** Milestone crossed upwards between `from` and `to` (the closest to `to`), otherwise null. */
export function crossedUp(rule: MilestoneRule, from: number, to: number): number | null {
  if (to <= from) return null
  const p = prevThreshold(rule, to)
  return p !== null && p > from ? p : null
}

/** Milestone crossed downwards between `from` and `to` (the closest to `to`), otherwise null. */
export function crossedDown(rule: MilestoneRule, from: number, to: number): number | null {
  if (to >= from) return null
  const n = nextThreshold(rule, to)
  return n !== null && n <= from ? n : null
}
