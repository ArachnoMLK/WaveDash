// Animations d'une légende rangées automatiquement : signatures, attaques de ses deux armes, emotes, postures.
// Sources : HeroTypes.xml (armes, pouvoirs) et powerTypes.csv (animation de chaque pouvoir) lus dans Game.swz.
import type { StudioAnim, StudioAnimGroup, StudioHero } from '@shared/studio'

/** Arme (nom HeroTypes) → fichier d'animations. */
export const WEAPON_ANM: Record<string, string> = {
  Sword: 'Animation_Sword', Spear: 'Animation_Spear', Hammer: 'Animation_Hammer', Pistol: 'Animation_Pistols',
  RocketLance: 'Animation_Lance', Katar: 'Animation_Katar', Axe: 'Animation_Axe', Bow: 'Animation_Bow', Fists: 'Animation_Fists',
  Scythe: 'Animation_Scythe', Cannon: 'Animation_Cannon', Orb: 'Animation_Orb', Boots: 'Animation_Boots',
  Greatsword: 'Animation_GreatSword', Chakram: 'Animation_Chakram'
}
export const WEAPON_FR: Record<string, string> = {
  Sword: 'Épée', Spear: 'Lance', Hammer: 'Marteau', Pistol: 'Blasters', RocketLance: 'Lance-roquette', Katar: 'Katars', Axe: 'Hache',
  Bow: 'Arc', Fists: 'Gantelets', Scythe: 'Faux', Cannon: 'Canon', Orb: 'Orbe', Boots: 'Bottes', Greatsword: 'Espadon', Chakram: 'Chakram'
}

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
const DIR: Record<string, string> = { '': 'Neutre', _Forward: 'Côté', _Down: 'Bas' }
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
      const names = powerAnims(power, powers)
      names.forEach((n, k) => {
        const a = find(file, n)
        if (a) sigs.push({ ...a, label: `${WEAPON_FR[w] ?? w} — ${dir}${names.length > 1 ? ` (${k + 1}/${names.length})` : ''}` })
      })
    }
  })
  if (sigs.length) groups.push({ id: 'sigs', label: 'Signatures', items: sigs })

  // Attaques normales et postures de chaque arme (classe principale du fichier).
  for (const w of hero.weapons) {
    const file = WEAPON_ANM[w]; const l = listings[file]; if (!l) continue
    const cls = mainClass(l); if (!cls) continue
    const all = l.classes[cls].filter((a) => clean(a.name))
    const attacks = all.filter((a) => a.name.startsWith('Attack') && !a.name.startsWith('AttackSpecial'))
    groups.push({ id: `atk-${w}`, label: `Attaques ${WEAPON_FR[w] ?? w}`, items: attacks.map((a) => ({ name: a.name, label: a.name.replace(/^Attack/, ''), animClass: cls, frames: a.frames })) })
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
