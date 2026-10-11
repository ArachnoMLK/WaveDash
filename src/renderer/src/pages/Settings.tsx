import { ReactNode, useEffect, useState } from 'react'
import { ChartType, Lang, METRICS_BY_PLATFORM, Platform, PLATFORMS, ThemeMode } from '@shared/types'
import { SECRET_OF } from '../components/AddAccountDialog'
import { Reveal, Switch, Tabs } from '../components/ui'
import { useApp } from '../lib/AppContext'
import { CATEGORY_CHARTS, chartKey, CHART_KEYS, DEFAULT_CHART, TIME_CHARTS } from '../lib/constants'

const Row = ({ title, help, children }: { title: string; help?: string; children: ReactNode }): JSX.Element => (
  <div className="setting"><div><div>{title}</div>{help && <div className="help">{help}</div>}</div><div>{children}</div></div>
)
const Section = ({ title, children, delay = 0 }: { title: string; children: ReactNode; delay?: number }): JSX.Element => (
  <Reveal className="glass pad sect" delay={delay}><h2 style={{ marginBottom: 6 }}>{title}</h2>{children}</Reveal>
)

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

const REFRESH_CHOICES = [5, 15, 30, 60, 120, 360]

export function Settings(): JSX.Element {
  const { t, settings, accounts, info, updateSettings, reloadAccounts } = useApp()
  const setChart = (k: string, c: ChartType): void => void updateSettings({ chartTypes: { ...settings.chartTypes, [k]: c } })

  return (
    <div>
      <div className="page-head"><h1>{t('settings.title')}</h1></div>

      <Section title={t('settings.appearance')}>
        <Row title={t('settings.theme')}>
          <Tabs<ThemeMode> value={settings.theme} onChange={(v) => void updateSettings({ theme: v })}
            options={[{ id: 'dark', label: t('settings.theme.dark') }, { id: 'light', label: t('settings.theme.light') }]} />
        </Row>
        <Row title={t('settings.language')}>
          <Tabs<Lang> value={settings.lang} onChange={(v) => void updateSettings({ lang: v })} options={[{ id: 'fr', label: 'Français' }, { id: 'en', label: 'English' }]} />
        </Row>
        <Row title={t('settings.glass')}><input type="range" min={0} max={100} value={settings.glass} onChange={(e) => void updateSettings({ glass: +e.target.value })} /></Row>
        <Row title={t('settings.animations')}><input type="range" min={0} max={100} value={settings.animations} onChange={(e) => void updateSettings({ animations: +e.target.value })} /></Row>
      </Section>

      <Section title={t('settings.accounts')} delay={0.05}>
        {PLATFORMS.map((p) => <KeyRow key={p} platform={p} />)}
        {accounts.length === 0 && <p className="muted small" style={{ paddingTop: 10 }}>{t('settings.account.none')}</p>}
        {accounts.map((a) => (
          <Row key={a.id} title={`${t(`platform.${a.platform}`)} · ${a.displayName}`}>
            <button className="btn small" onClick={() => void window.api.removeAccount(a.id).then(reloadAccounts)}>{t('settings.account.remove')}</button>
          </Row>
        ))}
      </Section>

      <Section title={t('settings.refresh')} delay={0.1}>
        <Row title={t('settings.refreshEvery')}>
          <select value={settings.refreshMinutes} onChange={(e) => void updateSettings({ refreshMinutes: +e.target.value })}>
            {REFRESH_CHOICES.map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} h` : t('settings.minutes', { n: m })}</option>)}
          </select>
        </Row>
      </Section>

      <Section title={t('settings.charts')} delay={0.15}>
        <p className="muted small" style={{ marginBottom: 4 }}>{t('settings.charts.hint')}</p>
        {(['youtube', 'brawlhalla'] as Platform[]).flatMap((p) => METRICS_BY_PLATFORM[p].map((m) => {
          const k = chartKey(p, m)
          return (
            <Row key={k} title={`${t(`platform.${p}`)} · ${t(`metric.${m}`)}`}>
              <select value={settings.chartTypes[k] ?? 'line'} onChange={(e) => setChart(k, e.target.value as ChartType)}>
                {TIME_CHARTS.map((c) => <option key={c} value={c}>{t(`chart.${c}`)}</option>)}
              </select>
            </Row>
          )
        }))}
        {([[CHART_KEYS.videoViews, 'youtube', 'platform.topVideos'], [CHART_KEYS.legendGames, 'brawlhalla', 'platform.legendGames'], [CHART_KEYS.legendWinrate, 'brawlhalla', 'platform.legendWinrate']] as const).map(([k, p, label]) => (
          <Row key={k} title={`${t(`platform.${p}`)} · ${t(label)}`}>
            <select value={settings.chartTypes[k] ?? DEFAULT_CHART[k]} onChange={(e) => setChart(k, e.target.value as ChartType)}>
              {CATEGORY_CHARTS.map((c) => <option key={c} value={c}>{t(`chart.${c}`)}</option>)}
            </select>
          </Row>
        ))}
      </Section>

      <Section title={t('settings.system')} delay={0.2}>
        <Row title={t('settings.startup')}><Switch on={settings.startWithWindows} label={t('settings.startup')} onChange={(v) => void updateSettings({ startWithWindows: v })} /></Row>
        <Row title={t('settings.tray')}><Switch on={settings.closeToTray} label={t('settings.tray')} onChange={(v) => void updateSettings({ closeToTray: v })} /></Row>
        <Row title={t('settings.scraping')} help={t('settings.scraping.warn')}><Switch on={settings.scrapingEnabled} label={t('settings.scraping')} onChange={(v) => void updateSettings({ scrapingEnabled: v })} /></Row>
      </Section>

      <Section title={t('settings.limits')} delay={0.25}><p className="muted small" style={{ lineHeight: 1.6 }}>{t('settings.limits.text')}</p></Section>

      <p className="muted small" style={{ textAlign: 'center', marginTop: 26 }}>WaveDash · {t('settings.version', { v: info?.version ?? '' })}</p>
    </div>
  )
}
