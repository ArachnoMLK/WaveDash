import test from 'node:test'
import assert from 'node:assert/strict'
import { detectLang, isRtl, LANGS, localeOf } from '@shared/types'
import { DEFAULT_TEMPLATES, METRIC_NAMES, modernizeTemplate, renderTemplate, REPORT_LABELS, templateVars, TEMPLATE_VARIABLES } from '@shared/labels'
import { loc, validateManifest } from '@shared/plugin'
import { en, translate } from '../src/renderer/src/i18n/index'
import * as db from '../src/main/db'
import { languageDefaults } from '../src/main/migrations'

const vars = (s: string): string => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

test('every language translates every interface text, with the same {variables}', () => {
  const keys = Object.keys(en)
  for (const { id } of LANGS) {
    const missing = keys.filter((k) => translate(id, k) === k)
    assert.deepEqual(missing, [], `${id}: missing texts`)
    const broken = keys.filter((k) => vars(translate(id, k)) !== vars(en[k as keyof typeof en]))
    assert.deepEqual(broken, [], `${id}: variables differ`)
  }
  assert.equal(translate('ja', 'pp.pageOf', { page: 2, pages: 5 }), '2 / 5 ページ')
})

test('the system language is detected, English otherwise', () => {
  assert.equal(detectLang(['fr-FR', 'en-US']), 'fr')
  assert.equal(detectLang(['pt-BR']), 'pt')
  assert.equal(detectLang(['zh-Hans-CN']), 'zh')
  assert.equal(detectLang(['ar-SA']), 'ar')
  assert.equal(detectLang(['ko-KR', 'de-DE']), 'de', 'first supported language in the list')
  assert.equal(detectLang(['ko-KR']), 'en')
  assert.equal(detectLang([]), 'en')
  assert.ok(isRtl('ar') && !isRtl('en'))
  assert.equal(localeOf('pt'), 'pt-BR')
})

test('main-process texts exist in every language and use the English variable names', () => {
  for (const { id } of LANGS) {
    assert.ok(METRIC_NAMES[id] && REPORT_LABELS[id], id)
    for (const tpl of Object.values(DEFAULT_TEMPLATES[id])) {
      const unknown = vars(tpl).split(',').filter((v) => v && !TEMPLATE_VARIABLES.includes(v))
      assert.deepEqual(unknown, [], `${id}: ${tpl}`)
    }
  }
})

test('notification texts: former French variable names still work and are converted', () => {
  const data = templateVars({ platform: 'YouTube', stat: 'Abonnés', value: '1 002', threshold: '1 000', previous: '998', account: 'Ma chaîne', rank: 'Or', oldRank: 'Argent' })
  assert.equal(renderTemplate('{statistique} a atteint {palier}', data), 'Abonnés a atteint 1 000')
  assert.equal(modernizeTemplate('{statistique} a atteint {palier} ({ancien_rang}) {inconnue}'), '{stat} a atteint {threshold} ({oldRank}) {inconnue}')
})

test('first launch follows Windows, then the saved choice is kept', () => {
  db.initDb()
  assert.equal(db.hasSetting('lang'), false)
  languageDefaults(['de-DE'])
  assert.equal(db.getSettings().lang, 'de')
  languageDefaults(['ja-JP'])
  assert.equal(db.getSettings().lang, 'de', 'never overrides a saved language')
  db.setSettings({ notifyTemplates: { up: '{statistique} : {valeur}' } })
  languageDefaults(['de-DE'])
  assert.equal(db.getSettings().notifyTemplates.up, '{stat} : {value}')
})

test('plugin texts: any language, English then French as fallback', () => {
  assert.equal(loc({ en: 'Price', fr: 'Prix', ja: '価格' }, 'ja'), '価格')
  assert.equal(loc({ en: 'Price', fr: 'Prix' }, 'de'), 'Price')
  assert.equal(loc({ en: 'Price', fr: 'Prix' }, 'fr'), 'Prix')
  assert.equal(loc({ fr: 'Prix' }, 'es'), 'Prix')
  const v = validateManifest({ wdsh: 1, id: 'test.loc', name: 'T', version: '1.0.0', metrics: [{ key: 'n', label: { en: 'Games', es: 'Partidas', xx: 'ignored' } }] })
  assert.ok(v.ok)
  assert.deepEqual(v.ok && v.manifest.metrics[0].label, { en: 'Games', es: 'Partidas' })
})
