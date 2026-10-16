// Notifications : activation, son, célébration, textes personnalisés, paliers par statistique.
import { useState } from 'react'
import { MetricKey, MilestoneRule, Platform, PLATFORMS, SoundKind, TemplateKey } from '@shared/types'
import { DEFAULT_TEMPLATES, renderTemplate, TEMPLATE_VARIABLES, templateVars } from '@shared/labels'
import { getRule, MILESTONE_METRICS, nextThreshold, ruleKey } from '@shared/milestones'
import { Row, Section, Slider } from '../components/settingsUi'
import { Switch, Tabs } from '../components/ui'
import { useApp } from '../lib/AppContext'
import { fmt } from '../lib/format'
import { playSound } from '../lib/sound'

// Les modèles de changement de rang servaient au Brawlhalla intégré, devenu un plugin : seuls « hausse » et « baisse » restent.
const TEMPLATES: TemplateKey[] = ['up', 'down']

/** Éditeur des paliers d'une statistique (séquence, incrément, valeurs précises, baisses). */
function RuleEditor({ platform, metric }: { platform: Platform; metric: MetricKey }): JSX.Element {
  const { t, settings, updateSettings } = useApp()
  const rule = getRule(settings.milestoneRules, platform, metric)
  const [custom, setCustom] = useState(rule.custom.join(', '))
  const [inc, setInc] = useState(String(rule.increment))
  const save = (patch: Partial<MilestoneRule>): void =>
    void updateSettings({ milestoneRules: { ...settings.milestoneRules, [ruleKey(platform, metric)]: { ...rule, ...patch } } })

  const commitInc = (): void => {
    const n = Math.max(0, Math.min(1e9, Math.round(Number(inc.replace(/\s/g, '')) || 0)))
    setInc(String(n)); save({ increment: n })
  }
  const commitCustom = (): void => {
    const list = [...new Set(custom.split(/[,;\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b).slice(0, 50)
    setCustom(list.join(', ')); save({ custom: list })
  }

  // Aperçu des premiers paliers produits par la règle.
  const preview: number[] = []
  for (let v = 0, i = 0; i < 6; i++) { const n = nextThreshold(rule, v); if (n === null) break; preview.push(n); v = n }

  return (
    <details className="rule">
      <summary>
        <span className="grow">{t(`metric.${metric}`)}</span>
        <span className="badge">{rule.enabled ? t('on') : t('off')}</span>
      </summary>
      <Row title={t('rule.enabled')}><Switch on={rule.enabled} label={t('rule.enabled')} onChange={(v) => save({ enabled: v })} /></Row>
      {rule.enabled && <>
        <Row title={t('rule.sequence')} help={t('rule.sequence.help')}><Switch on={rule.sequence} label={t('rule.sequence')} onChange={(v) => save({ sequence: v })} /></Row>
        <Row title={t('rule.increment')} help={t('rule.increment.help')}>
          <input type="text" inputMode="numeric" value={inc} onChange={(e) => setInc(e.target.value)} onBlur={commitInc} onKeyDown={(e) => e.key === 'Enter' && commitInc()} />
        </Row>
        <Row title={t('rule.custom')} help={t('rule.custom.help')}>
          <input type="text" value={custom} placeholder="1500, 25000" onChange={(e) => setCustom(e.target.value)} onBlur={commitCustom} onKeyDown={(e) => e.key === 'Enter' && commitCustom()} />
        </Row>
        <Row title={t('rule.down')}><Switch on={rule.notifyDown} label={t('rule.down')} onChange={(v) => save({ notifyDown: v })} /></Row>
        <p className="muted small" style={{ paddingTop: 6 }}>{preview.length ? t('rule.preview', { list: preview.map((n) => fmt(n, settings.lang)).join(' · ') + ' …' }) : t('rule.none')}</p>
      </>}
    </details>
  )
}

export function NotificationSettings(): JSX.Element {
  const { t, settings: s, updateSettings: up } = useApp()
  const defaults = DEFAULT_TEMPLATES[s.lang]
  const setTpl = (k: TemplateKey, v: string): void => void up({ notifyTemplates: { ...s.notifyTemplates, [k]: v } })

  // Aperçu des textes avec des valeurs d'exemple.
  const sample = templateVars({ platform: 'YouTube', stat: t('metric.subscribers'), value: fmt(1002, s.lang), threshold: fmt(1000, s.lang), previous: fmt(998, s.lang),
    account: 'Ma chaîne', rank: 'Platinum 1', oldRank: 'Gold 5' })

  return (
    <div>
      <Section title={t('notif.general')}>
        <Row title={t('notif.enabled')} help={t('notif.enabled.help')}><Switch on={s.notificationsEnabled} label={t('notif.enabled')} onChange={(v) => void up({ notificationsEnabled: v })} /></Row>
        <Row title={t('notif.sound')}><Switch on={s.notifySound} label={t('notif.sound')} onChange={(v) => void up({ notifySound: v })} /></Row>
        {s.notifySound && <>
          <Row title={t('notif.soundKind')}>
            <Tabs<SoundKind> value={s.notifySoundKind} onChange={(v) => { void up({ notifySoundKind: v }); playSound(v, s.notifyVolume) }}
              options={[{ id: 'chime', label: t('notif.sound.chime') }, { id: 'pulse', label: t('notif.sound.pulse') }, { id: 'bell', label: t('notif.sound.bell') }]} />
          </Row>
          <Row title={t('notif.volume')}><Slider value={s.notifyVolume} min={0} max={100} unit=" %" onChange={(v) => void up({ notifyVolume: v })} /></Row>
        </>}
        <Row title={t('notif.celebration')} help={t('notif.celebration.help')}><Switch on={s.notifyCelebration} label={t('notif.celebration')} onChange={(v) => void up({ notifyCelebration: v })} /></Row>
        <Row title={t('notif.test')}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn small" onClick={() => playSound(s.notifySoundKind, s.notifyVolume)}>{t('notif.listen')}</button>
            <button className="btn small primary" onClick={() => void window.api.testNotification()}>{t('notif.test')}</button>
          </div>
        </Row>
      </Section>

      <Section title={t('notif.texts')} delay={0.05}>
        <p className="muted small" style={{ marginBottom: 6 }}>{t('notif.texts.help', { vars: TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(' ') })}</p>
        {TEMPLATES.map((k) => {
          const value = s.notifyTemplates[k] ?? ''
          return (
            <Row key={k} title={t(`notif.tpl.${k}`)}>
              <div className="row">
                <input type="text" maxLength={200} value={value} placeholder={defaults[k]} onChange={(e) => setTpl(k, e.target.value)} />
                <button className="btn small" disabled={!value} onClick={() => setTpl(k, '')}>{t('notif.reset')}</button>
              </div>
              <div className="tpl-preview">{t('notif.preview')} : {renderTemplate(value.trim() || defaults[k], sample)}</div>
            </Row>
          )
        })}
      </Section>

      <Section title={t('notif.rules')} delay={0.1}>
        <p className="muted small" style={{ marginBottom: 6 }}>{t('notif.rules.help')}</p>
        {PLATFORMS.map((p) => (
          <div key={p} style={{ marginTop: 12 }}>
            <h2 className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{t(`platform.${p}`)}</h2>
            {MILESTONE_METRICS[p].map((m) => <RuleEditor key={`${p}.${m}`} platform={p} metric={m} />)}
          </div>
        ))}
      </Section>
    </div>
  )
}
