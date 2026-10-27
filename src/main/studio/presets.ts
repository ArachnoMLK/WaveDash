// A legend's animations sorted automatically: signatures, attacks of both weapons, emotes, stances.
// Sources: HeroTypes.xml (weapons, powers) and powerTypes.csv (animation of each power) read from Game.swz.
import type { StudioAnim, StudioAnimGroup, StudioHero, StudioItem } from '@shared/studio'
import { groupLabels, WEAPON_ANM, weaponName } from '@shared/studio'
import type { Lang } from '@shared/types'

export { WEAPON_ANM }

export type AnimListing = { classes: Record<string, { name: string; frames: number; loopStart?: number; recoveryStart?: number }[]> }

/** Simple fields of <HeroType> (no need for a full XML parser). */
export function parseHeroes(xml: string): (StudioHero & { powers: Record<string, string> })[] {
  const out: (StudioHero & { powers: Record<string, string> })[] = []
  for (const m of xml.matchAll(/<HeroType HeroName="([^"]+)">([\s\S]*?)<\/HeroType>/g)) {
    const body = m[2]
    const tag = (k: string): string => body.match(new RegExp(`<${k}>([^<]*)</${k}>`))?.[1] ?? ''
    const display = tag('HeroDisplayName')
    const bio = tag('BioName') || (display ? display[0] + display.slice(1).toLowerCase() : m[1])
    const weapons = [tag('BaseWeapon1'), tag('BaseWeapon2')].filter((w) => w && w !== '--')
    const powers: Record<string, string> = {}
    for (const k of ['SpecialPower1', 'SpecialPower1_Forward', 'SpecialPower1_Down', 'SpecialPower2', 'SpecialPower2_Forward', 'SpecialPower2_Down']) {
      const v = tag(k); if (v) powers[k] = v
    }
    out.push({ name: m[1], bio, weapons, powers })
  }
  return out
}

/** Game CSV: 1st line ignored, then the header; fields possibly quoted. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  const body = text.slice(text.indexOf('\n') + 1)
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') { field += '"'; i++ } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [head, ...rest] = rows
  return rest.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

/** Power → animations played (the power then its `ComboName` follow-ups). */
export function powerAnims(power: string, powers: Map<string, Record<string, string>>): string[] {
  const out: string[] = []
  let cur: string | undefined = power
  for (let depth = 0; cur && depth < 8; depth++) {
    const row = powers.get(cur)
    if (!row) break
    for (const part of (row['CastAnim'] ?? '').split(',')) {
      const name = part.includes(':') ? part.split(':').pop()! : part
      if (name && !out.includes(name)) out.push(name.trim())
    }
    cur = row['ComboName'] || undefined
  }
  return out
}

/** Main class of a .anm file: the "a__" class with the most content. */
export function mainClass(listing: AnimListing): string | null {
  const main = Object.entries(listing.classes).filter(([k]) => k.includes('/a__')).sort((a, b) => b[1].length - a[1].length)
  return main[0]?.[0] ?? null
}

const clean = (n: string): boolean => !/Swap|_IW|UI$|Po$/.test(n)
const DIR: Record<string, string> = { '': 'NSig', _Forward: 'SSig', _Down: 'DSig' }
/** Prefix of a weapon's powers in powerTypes.csv (SwordNeutral, LanceAir…). */
const POWER_PREFIX: Record<string, string> = { RocketLance: 'Lance' }
/** Normal attacks, in the order players usually list them: name → power suffix. */
export const MOVESET: [string, string][] = [
  ['NLight', 'Neutral'], ['SLight', 'Side'], ['DLight', 'Down'],
  ['NAir', 'Air'], ['SAir', 'AirSide'], ['DAir', 'AirDown'], ['Recovery', 'AirUpHeavy'], ['GP', 'GroundPound']
]
/** Follow-ups of the same move (combo, hit, ground variant…), without spilling over the next move (Air → AirSide). */
const FOLLOW = /^(Combo\d*|Hit\d*|Miss|Release|Exhaust|Ground\w*|Far|Near|Forward|BounceRecover)?$/

/** Animations of a move: the power's combo chain, then its follow-ups (hit, ground…). */
export function moveAnims(base: string, powers: Map<string, Record<string, string>>): string[] {
  const out = powerAnims(base, powers)
  for (const name of powers.keys()) {
    if (name === base || !name.startsWith(base) || !FOLLOW.test(name.slice(base.length))) continue
    for (const a of powerAnims(name, powers)) if (!out.includes(a)) out.push(a)
  }
  return out
}

/** A multi-part move: the full chain, then each part. */
function moveItems(label: string, names: string[], find: (n: string) => StudioAnim | null): StudioAnim[] {
  const parts = names.map(find).filter((a): a is StudioAnim => !!a)
  if (!parts.length) return []
  if (parts.length === 1) return [{ ...parts[0], label }]
  return [
    { ...parts[0], label, parts: parts.map((a) => a.name), frames: parts.reduce((s, a) => s + a.frames, 0) },
    ...parts.map((a, k) => ({ ...a, label: `${label} · ${k + 1}/${parts.length}` }))
  ]
}
const MOVES = /^(Ready|Idle|Run|Walk|Jump|Fall|Dodge|Dash|Land|Crouch|Hit|Throw|Ledge|Wall|Spawn|Win|Lose)/

export function buildLegendGroups(
  hero: { name: string; weapons: string[]; powers: Record<string, string> },
  powers: Map<string, Record<string, string>>,
  listings: Record<string, AnimListing>,
  emotes: AnimListing,
  lang: Lang = 'en'
): StudioAnimGroup[] {
  const groups: StudioAnimGroup[] = []
  const L = groupLabels(lang)
  const find = (file: string, name: string): StudioAnim | null => {
    const l = listings[file]; if (!l) return null
    for (const [cls, anims] of Object.entries(l.classes)) {
      const a = anims.find((x) => x.name === name)
      if (a) return { name, label: name, animClass: cls, frames: a.frames }
    }
    return null
  }

  // Signatures: for each weapon, neutral / side / down (with their follow-ups).
  const sigs: StudioAnim[] = []
  hero.weapons.forEach((w, i) => {
    const file = WEAPON_ANM[w]; if (!file) return
    for (const [suffix, dir] of Object.entries(DIR)) {
      const power = hero.powers[`SpecialPower${i + 1}${suffix}`]; if (!power) continue
      sigs.push(...moveItems(`★ ${dir} · ${weaponName(w, lang)}`, moveAnims(power, powers), (n) => find(file, n)))
    }
  })
  if (sigs.length) groups.push({ id: 'sigs', label: L.sigs, items: sigs })

  // Normal attacks and stances of each weapon (main class of the file).
  for (const w of hero.weapons) {
    const file = WEAPON_ANM[w]; const l = listings[file]; if (!l) continue
    const cls = mainClass(l); if (!cls) continue
    const all = l.classes[cls].filter((a) => clean(a.name))
    const attacks = all.filter((a) => a.name.startsWith('Attack') && !a.name.startsWith('AttackSpecial'))
    // named moves (NLight, SAir, Recovery…) from powerTypes, then the rest of the attack animations
    const prefix = POWER_PREFIX[w] ?? w
    const byName = (n: string): StudioAnim | null => { const a = l.classes[cls].find((x) => x.name === n); return a ? { name: a.name, label: a.name, animClass: cls, frames: a.frames } : null }
    const named: StudioAnim[] = [], used = new Set<string>()
    for (const [label, suffix] of MOVESET) {
      const items = moveItems(label, moveAnims(prefix + suffix, powers), byName)
      items.forEach((a) => used.add(a.name))
      named.push(...items)
    }
    const rest = attacks.filter((a) => !used.has(a.name)).map((a) => ({ name: a.name, label: `${a.name.replace(/^Attack/, '')}`, animClass: cls, frames: a.frames }))
    groups.push({ id: `atk-${w}`, label: `${L.attacks} ${weaponName(w, lang)}`, items: [...named, ...rest] })
    const moves = all.filter((a) => MOVES.test(a.name) && a.frames > 1)
    if (moves.length) groups.push({ id: `mv-${w}`, label: `${L.stances} ${weaponName(w, lang)}`, items: moves.map((a) => ({ name: a.name, label: a.name, animClass: cls, frames: a.frames })) })
  }

  // Emotes and dances (shared by all legends).
  const ecls = mainClass(emotes)
  if (ecls) {
    const items = emotes.classes[ecls].filter((a) => a.name.startsWith('Taunt') && clean(a.name))
      .map((a) => ({ name: a.name, label: a.name.replace(/^Taunt/, '').replace(/([a-z])([A-Z])/g, '$1 $2'), animClass: ecls, frames: a.frames }))
      .sort((a, b) => a.label.localeCompare(b.label))
    groups.push({ id: 'emotes', label: L.emotes, items })
  }
  return groups
}

/** Symbols of an SFX; numbered ones of the same family (Sparkle01, Sparkle02…) form a single effect played in sequence. */
export function effectItems(file: string, symbols: string[]): StudioItem[] {
  const families = new Map<string, { n: number; name: string }[]>()
  const single: string[] = []
  for (const name of symbols) {
    const m = /^(.*?[A-Za-z_])(\d+)$/.exec(name)
    if (m) (families.get(m[1]) ?? families.set(m[1], []).get(m[1])!).push({ n: Number(m[2]), name })
    else single.push(name)
  }
  const list: StudioItem[] = single.map((n) => ({ name: n, display: n.replace(/^a_/, ''), animClass: `${file}/${n}` }))
  for (const [prefix, parts] of families) {
    if (parts.length < 2) { list.push({ name: parts[0].name, display: parts[0].name.replace(/^a_/, ''), animClass: `${file}/${parts[0].name}` }); continue }
    parts.sort((a, b) => a.n - b.n)
    const mid = parts[Math.floor(parts.length / 2)].name   // thumbnail: a frame from the middle, more telling than the 1st
    list.push({ name: prefix, display: prefix.replace(/^a_/, ''), animClass: `${file}/${mid}`, sequence: parts.map((p) => p.name) })
  }
  return list.sort((a, b) => a.display.localeCompare(b.display))
}

/** A legend's internal name in its effects: AttackSpecialMonk2… for Wu Shang (Monk), without catching MonkeyKing. */
export function heroEffectTest(heroName: string): (symbol: string) => boolean {
  const re = new RegExp(`${heroName.replace(/[^\w]/g, '')}(?![a-z])`)
  return (symbol) => re.test(symbol)
}
