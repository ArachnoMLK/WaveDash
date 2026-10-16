import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeBackup } from '@shared/backup'
import { sanitizeTheme } from '@shared/theme'

const rule = { enabled: true, sequence: true, increment: 0, custom: [5, 'x'], notifyDown: false }

test('sauvegarde : seuls les réglages connus et valides', () => {
  const s = sanitizeBackup({ lang: 'de', refreshMinutes: 1, theme: 'dark', glass: 500, bgColor: 'red', evil: 1, seeThroughMaximized: false,
    navOrder: ['overview', 'x'], navHidden: ['overview', 'goals'], chartTypes: { a: 'line', b: 'fancy' } }) as Record<string, unknown>
  assert.equal(s.lang, undefined)
  assert.equal(s.refreshMinutes, 5)
  assert.equal(s.theme, 'dark')
  assert.equal(s.glass, 100)
  assert.equal(s.bgColor, undefined)
  assert.equal(s.evil, undefined)
  assert.equal(s.seeThroughMaximized, false)
  assert.deepEqual(s.navOrder, ['overview'])
  assert.deepEqual(s.navHidden, ['goals'])
  assert.deepEqual(s.chartTypes, { a: 'line' })
})

test('sauvegarde : règles de paliers des plateformes et des plugins', () => {
  const s = sanitizeBackup({ milestoneRules: { 'youtube.subscribers': rule, 'plugin:wavedash.discord-server.members': rule, 'nope.x': rule, 'plugin:../x': rule } })
  assert.deepEqual(Object.keys(s.milestoneRules!).sort(), ['plugin:wavedash.discord-server.members', 'youtube.subscribers'])
  assert.deepEqual(s.milestoneRules!['youtube.subscribers'].custom, [5])
})

test('sauvegarde : un préréglage nommé « __proto__ » est ignoré', () => {
  const s = sanitizeBackup(JSON.parse('{"themePresets": {"__proto__": {"theme": "light"}, "Clair": {"theme": "light"}}}'))
  assert.deepEqual(Object.keys(s.themePresets!), ['Clair'])
  assert.equal(({} as Record<string, unknown>).theme, undefined)
})

test('thème : image de fond jamais importée', () => {
  assert.equal(sanitizeTheme({ bgMode: 'image' }).bgMode, 'default')
})
