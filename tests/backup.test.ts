import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeBackup } from '@shared/backup'
import { sanitizeTheme } from '@shared/theme'

const rule = { enabled: true, sequence: true, increment: 0, custom: [5, 'x'], notifyDown: false }

test('backup: only known and valid settings', () => {
  const s = sanitizeBackup({ lang: 'xx', refreshMinutes: 1, theme: 'dark', glass: 500, bgColor: 'red', evil: 1, seeThroughMaximized: false,
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

test('backup: milestone rules of platforms and plugins', () => {
  const s = sanitizeBackup({ milestoneRules: { 'youtube.subscribers': rule, 'plugin:wavedash.discord-server.members': rule, 'nope.x': rule, 'plugin:../x': rule } })
  assert.deepEqual(Object.keys(s.milestoneRules!).sort(), ['plugin:wavedash.discord-server.members', 'youtube.subscribers'])
  assert.deepEqual(s.milestoneRules!['youtube.subscribers'].custom, [5])
})

test('backup: a preset named "__proto__" is ignored', () => {
  const s = sanitizeBackup(JSON.parse('{"themePresets": {"__proto__": {"theme": "light"}, "Light": {"theme": "light"}}}'))
  assert.deepEqual(Object.keys(s.themePresets!), ['Light'])
  assert.equal(({} as Record<string, unknown>).theme, undefined)
})

test('theme: background image never imported', () => {
  assert.equal(sanitizeTheme({ bgMode: 'image' }).bgMode, 'default')
})
