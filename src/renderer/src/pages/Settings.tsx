import { useEffect, useState } from 'react'
import { ChartType, METRICS_BY_PLATFORM, Platform, PLATFORMS } from '@shared/types'
import { SECRET_OF } from '../components/AddAccountDialog'
import { Row, Section } from '../components/settingsUi'
import { Reveal, Switch, Tabs } from '../components/ui'
import { useApp } from '../lib/AppContext'
import { CATEGORY_CHARTS, chartKey, CHART_KEYS, DEFAULT_CHART, TIME_CHARTS } from '../lib/constants'
import { AppearanceSettings } from './AppearanceSettings'
import { DataSettings } from './DataSettings'
import { NotificationSettings } from './NotificationSettings'

/** Saisie d'une clé API : elle part chiffrée vers le processus principal et n'est jamais relue par l'interface. */
function KeyRow({ platform }: { platform: Platform }): JSX.Element {
  const { t, info } = useApp()
  const secret = SECRET_OF[platform]
  const [has, setHas] = useState(false)
  const [value, setValue] = useState('')
  useEffect(() => { if (secret) void window.api.hasSecret(secret).then(setHas) }, [secret])
  if (!secret) return <Row title={t(`platform.${platform}`)} help={t(`settings.keyHelp.${platform}`)}><span className="badge">{t('platform.soon')}</span></Row>
  const save = async (): Promise<void> => { await window.api.setSecret(secret, value); setValue(''); setHas(true) }
  const remove = async (): Promise<void> => { await window.api.deleteSecret(secret); setHas(false) }
  return (
    <Row title={`${t(`platform.${platform}`)} · ${t('settings.apiKey')}`} help={info && !info.encryptionAvailable ? t('settings.encryptionOff') : t(`settings.keyHelp.${platform}`)}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="badge">{has ? t('settings.saved') : t('settings.notSet')}</span>
        {has && <button className="btn small" onClick={() => void remove()}>{t('settings.remove')}</button>}
      </div>
      <div className="row">
        <input type="password" value={value} placeholder={t('settings.paste')} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
        <button className="btn small primary" disabled={!value.trim() || !info?.encryptionAvailable} onClick={() => void save()}>{t('settings.save')}</button>
      </div>
    </Row>
  )
}

function AccountsSettings(): JSX.Element {
  const { t, accounts, reloadAccounts } = useApp()
  return (
    <Section title={t('settings.accounts')}>
      {PLATFORMS.map((p) => <KeyRow key={p} platform={p} />)}
      {accounts.length === 0 && <p className="muted small" style={{ paddingTop: 10 }}>{t('settings.account.none')}</p>}
      {accounts.map((a) => (
        <Row key={a.id} title={`${t(`platform.${a.platform}`)} · ${a.displayName}`}>
          <button className="btn small" onClick={() => void window.api.removeAccount(a.id).then(reloadAccounts)}>{t('settings.account.remove')}</button>
        </Row>
      ))}
    </Section>
  )
}

const REFRESH_CHOICES = [5, 15, 30, 60, 120, 360]

function GeneralSettings(): JSX.Element {
  const { t, settings, updateSettings } = useApp()
  const setChart = (k: string, c: ChartType): void => void updateSettings({ chartTypes: { ...settings.chartTypes, [k]: c } })
  return (
    <div>
      <Section title={t('settings.refresh')}>
        <Row title={t('settings.refreshEvery')}>
          <select value={settings.refreshMinutes} onChange={(e) => void updateSettings({ refreshMinutes: +e.target.value })}>
            {REFRESH_CHOICES.map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} h` : t('settings.minutes', { n: m })}</option>)}
          </select>
        </Row>
      </Section>

      <Section title={t('settings.charts')} delay={0.05}>
        <p className="muted small" style={{ marginBottom: 4 }}>{t('settings.charts.hint')}</p>
        {(['youtube'] as Platform[]).flatMap((p) => METRICS_BY_PLATFORM[p].map((m) => {
          const k = chartKey(p, m)
          return (
            <Row key={k} title={`${t(`platform.${p}`)} · ${t(`metric.${m}`)}`}>
              <select value={settings.chartTypes[k] ?? 'line'} onChange={(e) => setChart(k, e.target.value as ChartType)}>
                {TIME_CHARTS.map((c) => <option key={c} value={c}>{t(`chart.${c}`)}</option>)}
              </select>
            </Row>
          )
        }))}
        {([[CHART_KEYS.videoViews, 'youtube', 'platform.topVideos']] as const).map(([k, p, label]) => (
          <Row key={k} title={`${t(`platform.${p}`)} · ${t(label)}`}>
            <select value={settings.chartTypes[k] ?? DEFAULT_CHART[k]} onChange={(e) => setChart(k, e.target.value as ChartType)}>
              {CATEGORY_CHARTS.map((c) => <option key={c} value={c}>{t(`chart.${c}`)}</option>)}
            </select>
          </Row>
        ))}
      </Section>

      <Section title={t('settings.system')} delay={0.1}>
        <Row title={t('settings.startup')}><Switch on={settings.startWithWindows} label={t('settings.startup')} onChange={(v) => void updateSettings({ startWithWindows: v })} /></Row>
        <Row title={t('settings.tray')}><Switch on={settings.closeToTray} label={t('settings.tray')} onChange={(v) => void updateSettings({ closeToTray: v })} /></Row>
        <Row title={t('settings.scraping')} help={t('settings.scraping.warn')}><Switch on={settings.scrapingEnabled} label={t('settings.scraping')} onChange={(v) => void updateSettings({ scrapingEnabled: v })} /></Row>
      </Section>
    </div>
  )
}

function UpdatesSettings(): JSX.Element {
  const { t, settings, update, info, updateSettings } = useApp()
  const msg =
    update.state === 'downloading' ? t('up.state.downloading', { v: update.version ?? '', p: update.percent ?? 0 })
    : update.state === 'ready' ? t('up.state.ready', { v: update.version ?? '' })
    : t(`up.state.${update.state}`)
  return (
    <div>
      <Section title={t('up.title')}>
        <Row title={t('up.auto')} help={t('up.auto.help')}><Switch on={settings.autoUpdate} label={t('up.auto')} onChange={(v) => void updateSettings({ autoUpdate: v })} /></Row>
        <Row title={`${t('settings.version', { v: info?.version ?? '' })}`} help={msg + (update.state === 'error' && update.message ? ` (${update.message})` : '')}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn small" disabled={update.state === 'checking' || update.state === 'downloading'} onClick={() => void window.api.checkUpdate()}>{t('up.check')}</button>
            {update.state === 'ready' && <button className="btn small primary" onClick={() => void window.api.installUpdate()}>{t('up.install')}</button>}
          </div>
        </Row>
      </Section>
      <Section title={t('settings.limits')} delay={0.05}><p className="muted small" style={{ lineHeight: 1.6 }}>{t('settings.limits.text')}</p></Section>
    </div>
  )
}

type Tab = 'appearance' | 'notifications' | 'accounts' | 'general' | 'data' | 'updates'

export function Settings(): JSX.Element {
  const { t, info } = useApp()
  const [tab, setTab] = useState<Tab>('appearance')
  return (
    <div>
      <div className="page-head">
        <h1 className="grow">{t('settings.title')}</h1>
        <Tabs<Tab> value={tab} onChange={setTab} options={[
          { id: 'appearance', label: t('tab.appearance') }, { id: 'notifications', label: t('tab.notifications') }, { id: 'accounts', label: t('tab.accounts') },
          { id: 'general', label: t('tab.general') }, { id: 'data', label: t('tab.data') }, { id: 'updates', label: t('tab.updates') }]} />
      </div>
      <Reveal key={tab}>
        {tab === 'appearance' && <AppearanceSettings />}
        {tab === 'notifications' && <NotificationSettings />}
        {tab === 'accounts' && <AccountsSettings />}
        {tab === 'general' && <GeneralSettings />}
        {tab === 'data' && <DataSettings />}
        {tab === 'updates' && <UpdatesSettings />}
      </Reveal>
      <p className="muted small" style={{ textAlign: 'center', marginTop: 26 }}>WaveDash · {t('settings.version', { v: info?.version ?? '' })}</p>
    </div>
  )
}
