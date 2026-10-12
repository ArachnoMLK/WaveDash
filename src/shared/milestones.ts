// Logique des paliers : valeurs de seuil, prochain palier, franchissement. Fonctions pures, utilisées par
// le processus principal (détection) et par l'interface (objectifs, barres de progression).
import { MetricKey, MilestoneRule, Platform } from './types'

/** Statistiques pour lesquelles on peut définir des paliers. */
export const MILESTONE_METRICS: Record<Platform, MetricKey[]> = {
  youtube: ['subscribers', 'views', 'likes', 'comments', 'videos'],
  instagram: ['subscribers', 'likes', 'comments'],
  tiktok: ['subscribers', 'views', 'likes'],
  brawlhalla: ['elo_1v1', 'peak_1v1', 'elo_2v2', 'games', 'wins', 'level']
}

export const ruleKey = (p: Platform, m: MetricKey): string => `${p}.${m}`
const ELO: MetricKey[] = ['elo_1v1', 'peak_1v1', 'elo_2v2']

/** Règle par défaut : séquence 10-20-50… pour les compteurs, un palier tous les 100 pour l'ELO. */
export function defaultRule(p: Platform, m: MetricKey): MilestoneRule {
  if (p === 'brawlhalla') {
    return ELO.includes(m)
      ? { enabled: m !== 'peak_1v1', sequence: false, increment: 100, custom: [], notifyDown: true }
      : { enabled: false, sequence: true, increment: 0, custom: [], notifyDown: false }
  }
  return { enabled: ['subscribers', 'views', 'likes'].includes(m), sequence: true, increment: 0, custom: [], notifyDown: false }
}

export const getRule = (rules: Record<string, MilestoneRule>, p: Platform, m: MetricKey): MilestoneRule =>
  ({ ...defaultRule(p, m), ...rules[ruleKey(p, m)] })

const SEQ = [1, 2, 5]
/** Plus petit terme de 10, 20, 50, 100, 200, 500… strictement supérieur à v. */
function seqNext(v: number): number {
  for (let k = 1; k <= 15; k++) for (const m of SEQ) { const t = m * 10 ** k; if (t > v) return t }
  return Infinity
}
/** Plus grand terme de la séquence inférieur ou égal à v (null sous 10). */
function seqPrev(v: number): number | null {
  let best: number | null = null
  for (let k = 1; k <= 15; k++) for (const m of SEQ) { const t = m * 10 ** k; if (t <= v) best = t }
  return best
}

/** Plus petit palier strictement supérieur à v. */
export function nextThreshold(rule: MilestoneRule, v: number): number | null {
  const c: number[] = []
  if (rule.sequence) c.push(seqNext(v))
  if (rule.increment > 0) c.push((Math.floor(v / rule.increment) + 1) * rule.increment)
  for (const x of rule.custom) if (x > v) c.push(x)
  const m = Math.min(...c.filter(Number.isFinite))
  return Number.isFinite(m) ? m : null
}

/** Plus grand palier inférieur ou égal à v (null s'il n'y en a pas). */
export function prevThreshold(rule: MilestoneRule, v: number): number | null {
  const c: number[] = []
  if (rule.sequence) { const s = seqPrev(v); if (s !== null) c.push(s) }
  if (rule.increment > 0) { const i = Math.floor(v / rule.increment) * rule.increment; if (i > 0) c.push(i) }
  for (const x of rule.custom) if (x <= v) c.push(x)
  return c.length ? Math.max(...c) : null
}

/** Palier franchi à la hausse entre `from` et `to` (le plus proche de `to`), sinon null. */
export function crossedUp(rule: MilestoneRule, from: number, to: number): number | null {
  if (to <= from) return null
  const p = prevThreshold(rule, to)
  return p !== null && p > from ? p : null
}

/** Palier repassé à la baisse entre `from` et `to` (le plus proche de `to`), sinon null. */
export function crossedDown(rule: MilestoneRule, from: number, to: number): number | null {
  if (to >= from) return null
  const n = nextThreshold(rule, to)
  return n !== null && n <= from ? n : null
}
