// Animations d'une légende rangées automatiquement : signatures, attaques de ses deux armes, emotes, postures.
// Sources : HeroTypes.xml (armes, pouvoirs) et powerTypes.csv (animation de chaque pouvoir) lus dans Game.swz.
import type { StudioAnim, StudioAnimGroup, StudioHero, StudioItem } from '@shared/studio'
import { WEAPON_ANM, WEAPON_FR } from '@shared/studio'

export { WEAPON_ANM, WEAPON_FR }

export type AnimListing = { classes: Record<string, { name: string; frames: number }[]> }

/** Champs simples des <HeroType> (pas besoin d'un parseur XML complet). */
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

/** CSV du jeu : 1re ligne ignorée, puis en-tête ; champs éventuellement entre guillemets. */
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

/** Pouvoir → animations jouées (le pouvoir puis ses enchaînements `ComboName`). */
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

/** Classe principale d'un fichier .anm : la classe « a__ » la plus fournie. */
export function mainClass(listing: AnimListing): string | null {
  const main = Object.entries(listing.classes).filter(([k]) => k.includes('/a__')).sort((a, b) => b[1].length - a[1].length)
  return main[0]?.[0] ?? null
}

const clean = (n: string): boolean => !/Swap|_IW|UI$|Po$/.test(n)
const DIR: Record<string, string> = { '': 'NSig', _Forward: 'SSig', _Down: 'DSig' }
/** Préfixe des pouvoirs d'une arme dans powerTypes.csv (SwordNeutral, LanceAir…). */
const POWER_PREFIX: Record<string, string> = { RocketLance: 'Lance' }
/** Attaques normales, dans l'ordre habituel des joueurs : nom → suffixe du pouvoir. */
export const MOVESET: [string, string][] = [
  ['NLight', 'Neutral'], ['SLight', 'Side'], ['DLight', 'Down'],
  ['NAir', 'Air'], ['SAir', 'AirSide'], ['DAir', 'AirDown'], ['Recovery', 'AirUpHeavy'], ['GP', 'GroundPound']
]
/** Suites d'un même coup (enchaînement, touche, variante au sol…), sans déborder sur le coup voisin (Air → AirSide). */
const FOLLOW = /^(Combo\d*|Hit\d*|Miss|Release|Exhaust|Ground\w*|Far|Near|Forward|BounceRecover)?$/

/** Animations d'un coup : la chaîne d'enchaînements du pouvoir, puis ses suites (touché, au sol…). */
export function moveAnims(base: string, powers: Map<string, Record<string, string>>): string[] {
  const out = powerAnims(base, powers)
  for (const name of powers.keys()) {
    if (name === base || !name.startsWith(base) || !FOLLOW.test(name.slice(base.length))) continue
    for (const a of powerAnims(name, powers)) if (!out.includes(a)) out.push(a)
  }
  return out
}

/** Un coup en plusieurs parties : l'enchaînement complet, puis chaque partie. */
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
  emotes: AnimListing
): StudioAnimGroup[] {
  const groups: StudioAnimGroup[] = []
  const find = (file: string, name: string): StudioAnim | null => {
    const l = listings[file]; if (!l) return null
    for (const [cls, anims] of Object.entries(l.classes)) {
      const a = anims.find((x) => x.name === name)
      if (a) return { name, label: name, animClass: cls, frames: a.frames }
    }
    return null
  }

  // Signatures : pour chaque arme, neutre / côté / bas (avec leurs enchaînements).
  const sigs: StudioAnim[] = []
  hero.weapons.forEach((w, i) => {
    const file = WEAPON_ANM[w]; if (!file) return
    for (const [suffix, dir] of Object.entries(DIR)) {
      const power = hero.powers[`SpecialPower${i + 1}${suffix}`]; if (!power) continue
      sigs.push(...moveItems(`★ ${dir} · ${WEAPON_FR[w] ?? w}`, moveAnims(power, powers), (n) => find(file, n)))
    }
  })
  if (sigs.length) groups.push({ id: 'sigs', label: 'Signatures', items: sigs })

  // Attaques normales et postures de chaque arme (classe principale du fichier).
  for (const w of hero.weapons) {
    const file = WEAPON_ANM[w]; const l = listings[file]; if (!l) continue
    const cls = mainClass(l); if (!cls) continue
    const all = l.classes[cls].filter((a) => clean(a.name))
    const attacks = all.filter((a) => a.name.startsWith('Attack') && !a.name.startsWith('AttackSpecial'))
    // coups nommés (NLight, SAir, Recovery…) d'après powerTypes, puis le reste des animations d'attaque
    const prefix = POWER_PREFIX[w] ?? w
    const byName = (n: string): StudioAnim | null => { const a = l.classes[cls].find((x) => x.name === n); return a ? { name: a.name, label: a.name, animClass: cls, frames: a.frames } : null }
    const named: StudioAnim[] = [], used = new Set<string>()
    for (const [label, suffix] of MOVESET) {
      const items = moveItems(label, moveAnims(prefix + suffix, powers), byName)
      items.forEach((a) => used.add(a.name))
      named.push(...items)
    }
    const rest = attacks.filter((a) => !used.has(a.name)).map((a) => ({ name: a.name, label: `${a.name.replace(/^Attack/, '')}`, animClass: cls, frames: a.frames }))
    groups.push({ id: `atk-${w}`, label: `Attaques ${WEAPON_FR[w] ?? w}`, items: [...named, ...rest] })
    const moves = all.filter((a) => MOVES.test(a.name) && a.frames > 1)
    if (moves.length) groups.push({ id: `mv-${w}`, label: `Postures ${WEAPON_FR[w] ?? w}`, items: moves.map((a) => ({ name: a.name, label: a.name, animClass: cls, frames: a.frames })) })
  }

  // Emotes et danses (communes à toutes les légendes).
  const ecls = mainClass(emotes)
  if (ecls) {
    const items = emotes.classes[ecls].filter((a) => a.name.startsWith('Taunt') && clean(a.name))
      .map((a) => ({ name: a.name, label: a.name.replace(/^Taunt/, '').replace(/([a-z])([A-Z])/g, '$1 $2'), animClass: ecls, frames: a.frames }))
      .sort((a, b) => a.label.localeCompare(b.label))
    groups.push({ id: 'emotes', label: 'Emotes & danses', items })
  }
  return groups
}

/** Symboles d'un SFX ; ceux numérotés d'une même famille (Sparkle01, Sparkle02…) ne forment qu'un effet joué à la suite. */
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
    const mid = parts[Math.floor(parts.length / 2)].name   // vignette : une image du milieu, plus parlante que la 1re
    list.push({ name: prefix, display: prefix.replace(/^a_/, ''), animClass: `${file}/${mid}`, sequence: parts.map((p) => p.name) })
  }
  return list.sort((a, b) => a.display.localeCompare(b.display))
}

/** Le nom interne d'une légende dans ses effets : AttackSpecialMonk2… pour Wu Shang (Monk), sans attraper MonkeyKing. */
export function heroEffectTest(heroName: string): (symbol: string) => boolean {
  const re = new RegExp(`${heroName.replace(/[^\w]/g, '')}(?![a-z])`)
  return (symbol) => re.test(symbol)
}
