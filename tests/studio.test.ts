import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLegendGroups, effectItems, heroEffectTest, mainClass, moveAnims, parseCsv, parseHeroes, powerAnims } from '../src/main/studio/presets'

const HEROES = `<HeroTypes><HeroType HeroName="Template"><BioName>T</BioName></HeroType>
<HeroType HeroName="Ninja"><HeroDisplayName>HATTORI</HeroDisplayName><BaseWeapon1>Sword</BaseWeapon1><SpecialPower1>SwordSmashNeutralNinja</SpecialPower1>
<SpecialPower1_Forward>SwordSmashSideNinja</SpecialPower1_Forward><BaseWeapon2>Spear</BaseWeapon2><BioName>Hattori</BioName></HeroType>
<HeroType HeroName="Bot"><HeroDisplayName>BOT</HeroDisplayName><BaseWeapon1>--</BaseWeapon1></HeroType></HeroTypes>`

test('HeroTypes : nom, armes et pouvoirs de signature', () => {
  const hs = parseHeroes(HEROES)
  const h = hs.find((x) => x.name === 'Ninja')!
  assert.equal(h.bio, 'Hattori')
  assert.deepEqual(h.weapons, ['Sword', 'Spear'])
  assert.equal(h.powers['SpecialPower1_Forward'], 'SwordSmashSideNinja')
  assert.equal(hs.find((x) => x.name === 'Bot')!.bio, 'Bot')          // nom affiché en minuscules faute de BioName
  assert.deepEqual(hs.find((x) => x.name === 'Bot')!.weapons, [])     // « -- » = pas d'arme
})

test('CSV du jeu : 1re ligne ignorée, guillemets et virgules dans les champs', () => {
  const rows = parseCsv('junk line\r\nPowerName,CastAnim,ComboName\r\nA,"L:One,L:Two",B\r\nB,"say ""hi""",\r\n')
  assert.deepEqual(rows, [{ PowerName: 'A', CastAnim: 'L:One,L:Two', ComboName: 'B' }, { PowerName: 'B', CastAnim: 'say "hi"', ComboName: '' }])
})

test('pouvoir → animations jouées, enchaînements compris, sans boucle infinie', () => {
  const powers = new Map([
    ['A', { CastAnim: 'L:AttackSpecialNinja2Charge', ComboName: 'B' }],
    ['B', { CastAnim: 'L:AttackSpecialNinja2', ComboName: 'A' }]
  ])
  assert.deepEqual(powerAnims('A', powers), ['AttackSpecialNinja2Charge', 'AttackSpecialNinja2'])
  assert.deepEqual(powerAnims('inconnu', powers), [])
})

test('groupes d’une légende : signatures, attaques sans variantes, emotes triées', () => {
  const sword = { classes: {
    'Animation_Sword.swf/a__1HandRearAnimation': [
      { name: 'AttackSpecialNinja3', frames: 30 }, { name: 'AttackSpecialNinja1', frames: 20 }, { name: 'AttackCombo1', frames: 12 },
      { name: 'AttackCombo1_SwapPatrick', frames: 12 }, { name: 'Ready', frames: 40 }
    ],
    'Animation_Sword.swf/a_SFXSmoke': [{ name: 'Ready', frames: 3 }]
  } }
  const emotes = { classes: { 'Animation_Emote.swf/a__EmoteAnimation': [
    { name: 'TauntRobotDance', frames: 69 }, { name: 'TauntBreakdance', frames: 41 }, { name: 'TauntBreakdanceSwapSpongebob', frames: 41 }
  ] } }
  assert.equal(mainClass(sword), 'Animation_Sword.swf/a__1HandRearAnimation')
  const powers = new Map([['SwordSmashNeutralNinja', { CastAnim: 'L:AttackSpecialNinja3' }], ['SwordSmashSideNinja', { CastAnim: 'L:AttackSpecialNinja1' }]])
  const hero = { name: 'Ninja', weapons: ['Sword'], powers: { SpecialPower1: 'SwordSmashNeutralNinja', SpecialPower1_Forward: 'SwordSmashSideNinja' } }
  const groups = buildLegendGroups(hero, powers, { Animation_Sword: sword }, emotes)
  const by = Object.fromEntries(groups.map((g) => [g.id, g]))
  assert.deepEqual(by['sigs'].items.map((a) => [a.label, a.name]), [['★ NSig · Épée', 'AttackSpecialNinja3'], ['★ SSig · Épée', 'AttackSpecialNinja1']])
  assert.deepEqual(by['atk-Sword'].items.map((a) => a.name), ['AttackCombo1'])
  assert.deepEqual(by['mv-Sword'].items.map((a) => a.name), ['Ready'])
  assert.deepEqual(by['emotes'].items.map((a) => a.label), ['Breakdance', 'Robot Dance'])
})

test('effets en plusieurs parties : symboles numérotés regroupés et triés', () => {
  const items = effectItems('SFX_X.swf', ['a_Glow', 'DragonFireALL10', 'DragonFireALL2', 'DragonFireALL1', 'Sparkle01', 'Lone7'])
  const by = Object.fromEntries(items.map((x) => [x.name, x]))
  assert.deepEqual(by['DragonFireALL'].sequence, ['DragonFireALL1', 'DragonFireALL2', 'DragonFireALL10'])
  assert.equal(by['DragonFireALL'].animClass, 'SFX_X.swf/DragonFireALL2')
  assert.equal(by['Sparkle01'].sequence, undefined)     // une seule partie : effet normal
  assert.equal(by['a_Glow'].display, 'Glow')
  assert.equal(items.length, 4)
})

test('effets d’une légende : nom interne sans attraper les noms plus longs', () => {
  const monk = heroEffectTest('Monk')
  assert.ok(monk('a_SFXAttackSpecialMonkNeutral2_IW'))
  assert.ok(monk('a_FFXAttackSpecialMonk2_IW_SwapAang'))
  assert.ok(!monk('a_Jaw_MonkeyKing'))
})

test('coups nommés : NLight = Combo1 → Combo2 → Combo3, sans attraper les coups voisins', () => {
  const powers = new Map([
    ['SwordNeutral', { CastAnim: 'AttackCombo1', ComboName: 'SwordNeutralCombo' }],
    ['SwordNeutralCombo', { CastAnim: 'AttackCombo2', ComboName: 'SwordNeutralMiss' }],
    ['SwordNeutralHit', { CastAnim: 'AttackCombo3' }],
    ['SwordNeutralMiss', { CastAnim: '' }],
    ['SwordAir', { CastAnim: 'AttackAirUpShorter' }],
    ['SwordAirSide', { CastAnim: 'AttackAirSide' }],
    ['SwordGroundPound', { CastAnim: 'L:AttackAirDownHeavy', ComboName: 'SwordGroundPoundCombo' }],
    ['SwordGroundPoundHit', { CastAnim: 'AttackAirDownHeavyHit' }],
    ['SwordGroundPoundCombo', { CastAnim: 'AttackAirDownHeavyHitGround' }]
  ])
  assert.deepEqual(moveAnims('SwordNeutral', powers), ['AttackCombo1', 'AttackCombo2', 'AttackCombo3'])
  assert.deepEqual(moveAnims('SwordAir', powers), ['AttackAirUpShorter'])
  assert.deepEqual(moveAnims('SwordGroundPound', powers), ['AttackAirDownHeavy', 'AttackAirDownHeavyHitGround', 'AttackAirDownHeavyHit'])
  const sword = { classes: { 'Animation_Sword.swf/a__1HandRearAnimation': [
    { name: 'AttackCombo1', frames: 9 }, { name: 'AttackCombo2', frames: 10 }, { name: 'AttackCombo3', frames: 18 }, { name: 'AttackAirUpShorter', frames: 14 }, { name: 'AttackOdd', frames: 5 }
  ] } }
  const hero = { name: 'Knight', weapons: ['Sword'], powers: {} }
  const atk = buildLegendGroups(hero, powers, { Animation_Sword: sword }, { classes: {} }).find((g) => g.id === 'atk-Sword')!
  assert.deepEqual(atk.items.map((a) => a.label), ['NLight', 'NLight · 1/3', 'NLight · 2/3', 'NLight · 3/3', 'NAir', 'Odd'])
  assert.deepEqual(atk.items[0].parts, ['AttackCombo1', 'AttackCombo2', 'AttackCombo3'])
  assert.equal(atk.items[0].frames, 37)
})
