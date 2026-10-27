import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLegendGroups, effectItems, heroEffectTest, mainClass, moveAnims, parseCsv, parseHeroes, powerAnims } from '../src/main/studio/presets'

const HEROES = `<HeroTypes><HeroType HeroName="Template"><BioName>T</BioName></HeroType>
<HeroType HeroName="Ninja"><HeroDisplayName>HATTORI</HeroDisplayName><BaseWeapon1>Sword</BaseWeapon1><SpecialPower1>SwordSmashNeutralNinja</SpecialPower1>
<SpecialPower1_Forward>SwordSmashSideNinja</SpecialPower1_Forward><BaseWeapon2>Spear</BaseWeapon2><BioName>Hattori</BioName></HeroType>
<HeroType HeroName="Bot"><HeroDisplayName>BOT</HeroDisplayName><BaseWeapon1>--</BaseWeapon1></HeroType></HeroTypes>`

test('HeroTypes: name, weapons and signature powers', () => {
  const hs = parseHeroes(HEROES)
  const h = hs.find((x) => x.name === 'Ninja')!
  assert.equal(h.bio, 'Hattori')
  assert.deepEqual(h.weapons, ['Sword', 'Spear'])
  assert.equal(h.powers['SpecialPower1_Forward'], 'SwordSmashSideNinja')
  assert.equal(hs.find((x) => x.name === 'Bot')!.bio, 'Bot')          // name shown in lowercase for lack of a BioName
  assert.deepEqual(hs.find((x) => x.name === 'Bot')!.weapons, [])     // "--" = no weapon
})

test('game CSV: 1st line ignored, quotes and commas in fields', () => {
  const rows = parseCsv('junk line\r\nPowerName,CastAnim,ComboName\r\nA,"L:One,L:Two",B\r\nB,"say ""hi""",\r\n')
  assert.deepEqual(rows, [{ PowerName: 'A', CastAnim: 'L:One,L:Two', ComboName: 'B' }, { PowerName: 'B', CastAnim: 'say "hi"', ComboName: '' }])
})

test('power → animations played, follow-ups included, without an infinite loop', () => {
  const powers = new Map([
    ['A', { CastAnim: 'L:AttackSpecialNinja2Charge', ComboName: 'B' }],
    ['B', { CastAnim: 'L:AttackSpecialNinja2', ComboName: 'A' }]
  ])
  assert.deepEqual(powerAnims('A', powers), ['AttackSpecialNinja2Charge', 'AttackSpecialNinja2'])
  assert.deepEqual(powerAnims('inconnu', powers), [])
})

test('legend groups: signatures, attacks without variants, sorted emotes', () => {
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
  assert.deepEqual(by['sigs'].items.map((a) => [a.label, a.name]), [['★ NSig · Sword', 'AttackSpecialNinja3'], ['★ SSig · Sword', 'AttackSpecialNinja1']])
  assert.deepEqual(by['atk-Sword'].items.map((a) => a.name), ['AttackCombo1'])
  assert.deepEqual(by['mv-Sword'].items.map((a) => a.name), ['Ready'])
  assert.deepEqual(by['emotes'].items.map((a) => a.label), ['Breakdance', 'Robot Dance'])
})

test('multi-part effects: numbered symbols grouped and sorted', () => {
  const items = effectItems('SFX_X.swf', ['a_Glow', 'DragonFireALL10', 'DragonFireALL2', 'DragonFireALL1', 'Sparkle01', 'Lone7'])
  const by = Object.fromEntries(items.map((x) => [x.name, x]))
  assert.deepEqual(by['DragonFireALL'].sequence, ['DragonFireALL1', 'DragonFireALL2', 'DragonFireALL10'])
  assert.equal(by['DragonFireALL'].animClass, 'SFX_X.swf/DragonFireALL2')
  assert.equal(by['Sparkle01'].sequence, undefined)     // a single part: normal effect
  assert.equal(by['a_Glow'].display, 'Glow')
  assert.equal(items.length, 4)
})

test('legend effects: internal name without catching longer names', () => {
  const monk = heroEffectTest('Monk')
  assert.ok(monk('a_SFXAttackSpecialMonkNeutral2_IW'))
  assert.ok(monk('a_FFXAttackSpecialMonk2_IW_SwapAang'))
  assert.ok(!monk('a_Jaw_MonkeyKing'))
})

test('named moves: NLight = Combo1 → Combo2 → Combo3, without catching neighbouring moves', () => {
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

test('export of a desired duration: intro once, then the game loop', async () => {
  const { exportSequence } = await import('@shared/studio')
  // "The Reads": 50 frames; intro 0-16, loop 17-40, ending 41-49 (the book is thrown); 10 s at 24 fps = 240 frames.
  const seq = exportSequence(50, { fps: 24, duration: 10, loop: 'game' }, 17, 41)
  assert.equal(seq.length, 240)
  assert.deepEqual(seq.slice(0, 42), [...Array(41).keys(), 17], 'the intro, the loop, then back to the start of the loop')
  assert.deepEqual(seq.slice(-9), [41, 42, 43, 44, 45, 46, 47, 48, 49], 'the end of the emote finishes the export')
  assert.ok(seq.slice(17, -9).every((i) => i >= 17 && i < 41), 'in between: only the loop')
  assert.equal(exportSequence(50, { fps: 24, duration: 10, loop: 'game' }, 17).length, 240, 'without a known loop end: up to the last frame')
  assert.deepEqual(exportSequence(4, { fps: 2, duration: 5, loop: 'all' }, 2), [0, 1, 2, 3, 0, 1, 2, 3, 0, 1])
  assert.deepEqual(exportSequence(4, { fps: 2, duration: 5, loop: 'off' }, 2), [0, 1, 2, 3], 'no loop: once')
  assert.deepEqual(exportSequence(4, { fps: 2, duration: 2, loop: 'game', frames: [1, 3] }, 2), [1, 3, 1, 3], 'the selection is repeated as is')
  assert.deepEqual(exportSequence(4, { fps: 2 }), [0, 1, 2, 3], 'no duration: unchanged')
  assert.equal(exportSequence(10, { fps: 60, duration: 99999, loop: 'all' }).length, 300 * 60, 'plafond de 5 min')
})
