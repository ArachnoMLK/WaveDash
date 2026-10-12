// Personnalisation : verre, fond, couleur, interface, navigation, préréglages de thème.
import { useState } from 'react'
import { BgMode, ChartPalette, Density, FontFamily, NativeMaterial, ThemeMode } from '@shared/types'
import { DEFAULT_THEME, themeFromSettings } from '@shared/theme'
import { Row, Section, Slider } from '../components/settingsUi'
import { Switch, Tabs } from '../components/ui'
import { useApp } from '../lib/AppContext'
import { navLabelKey, orderedNav } from '../lib/constants'

const ACCENTS = ['#8ab4ff', '#7ee0a1', '#ff8f8f', '#ffd479', '#c9a0ff', '#ff9ec7']

export function AppearanceSettings(): JSX.Element {
  const { t, settings: s, info, updateSettings: up } = useApp()
  const [presetName, setPresetName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const names = Object.keys(s.themePresets)
  const order = orderedNav(s.navOrder)

  const savePreset = async (): Promise<void> => {
    const name = presetName.trim().slice(0, 40)
    if (!name) return
    await up({ themePresets: { ...s.themePresets, [name]: themeFromSettings(s) } })
    setPresetName('')
  }
  const deletePreset = (name: string): void => {
    const { [name]: _removed, ...rest } = s.themePresets
    void up({ themePresets: rest })
  }
  const importTheme = async (): Promise<void> => {
    const r = await window.api.importTheme()
    if (!r.ok) { if (r.error) setMsg(t('ap.importFail')); return }
    const name = r.name ?? 'Thème'
    await up({ themePresets: { ...s.themePresets, [name]: { ...themeFromSettings(s), ...r.theme } } })
    setMsg(t('ap.imported', { name }))
  }
  const pickImage = async (): Promise<void> => {
    setMsg(null)
    const r = await window.api.pickBackground()
    if (r.ok && r.filename) await up({ bgImage: r.filename, bgMode: 'image' })
    else if (r.error === 'too_big') setMsg(t('ap.imageTooBig'))
  }
  const removeImage = async (): Promise<void> => { await window.api.clearBackground(); await up({ bgImage: null, bgMode: 'default' }) }
  const reset = async (): Promise<void> => { await window.api.clearBackground(); await up({ ...DEFAULT_THEME, bgImage: null }) }
  const move = (i: number, d: -1 | 1): void => {
    const next = [...order]; const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    void up({ navOrder: next })
  }
  const toggleHidden = (id: string, visible: boolean): void =>
    void up({ navHidden: visible ? s.navHidden.filter((x) => x !== id) : [...s.navHidden, id] })

  return (
    <div>
      <Section title={t('ap.theme')}>
        <Row title={t('settings.theme')}>
          <Tabs<ThemeMode> value={s.theme} onChange={(v) => void up({ theme: v })} options={[{ id: 'dark', label: t('settings.theme.dark') }, { id: 'light', label: t('settings.theme.light') }]} />
        </Row>
        <Row title={t('ap.presets')} help={names.length ? undefined : t('ap.noPresets')}>
          {names.map((n) => (
            <div className="row between" key={n} style={{ marginBottom: 6 }}>
              <span>{n}</span>
              <span className="row" style={{ gap: 6 }}>
                <button className="btn small" onClick={() => void up(s.themePresets[n])}>{t('ap.apply')}</button>
                <button className="btn small" onClick={() => void window.api.exportTheme(n, s.themePresets[n])}>{t('ap.export')}</button>
                <button className="btn small" onClick={() => deletePreset(n)}>{t('ap.delete')}</button>
              </span>
            </div>
          ))}
        </Row>
        <Row title={t('ap.presetName')}>
          <div className="row">
            <input type="text" value={presetName} maxLength={40} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void savePreset()} />
            <button className="btn small primary" disabled={!presetName.trim()} onClick={() => void savePreset()}>{t('ap.save')}</button>
          </div>
        </Row>
        <Row title={t('ap.importExport')} help={msg ?? undefined}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn small" onClick={() => void importTheme()}>{t('ap.import')}</button>
            <button className="btn small" onClick={() => void reset()}>{t('ap.reset')}</button>
          </div>
        </Row>
      </Section>

      <Section title={t('ap.glass')} delay={0.04}>
        <Row title={t('ap.glassOn')} help={t('ap.glassOn.help')}><Switch on={s.glassEnabled} label={t('ap.glassOn')} onChange={(v) => void up({ glassEnabled: v })} /></Row>
        {s.glassEnabled && <>
          <Row title={t('ap.blur')}><Slider value={s.glass} min={0} max={100} onChange={(v) => void up({ glass: v })} /></Row>
          <Row title={t('ap.opacity')}><Slider value={s.glassOpacity} min={0} max={100} onChange={(v) => void up({ glassOpacity: v })} /></Row>
          <Row title={t('ap.saturation')}><Slider value={s.glassSaturation} min={100} max={200} unit=" %" onChange={(v) => void up({ glassSaturation: v })} /></Row>
          {info?.nativeGlass && (
            <Row title={t('ap.material')} help={t('ap.material.help')}>
              <Tabs<NativeMaterial> value={s.nativeMaterial} onChange={(v) => void up({ nativeMaterial: v })}
                options={[{ id: 'none', label: t('ap.material.none') }, { id: 'mica', label: 'Mica' }, { id: 'acrylic', label: t('ap.material.acrylic') }]} />
            </Row>
          )}
        </>}
      </Section>

      <Section title={t('ap.background')} delay={0.08}>
        <Row title={t('ap.bgMode')}>
          <Tabs<BgMode> value={s.bgMode} onChange={(v) => void up({ bgMode: v })}
            options={[{ id: 'default', label: t('ap.bg.default') }, { id: 'solid', label: t('ap.bg.solid') }, { id: 'gradient', label: t('ap.bg.gradient') }, { id: 'image', label: t('ap.bg.image') }]} />
        </Row>
        {(s.bgMode === 'solid' || s.bgMode === 'gradient') && (
          <Row title={t('ap.color')}>
            <div className="row">
              <input type="color" value={s.bgColor} onChange={(e) => void up({ bgColor: e.target.value })} />
              {s.bgMode === 'gradient' && <input type="color" value={s.bgColor2} onChange={(e) => void up({ bgColor2: e.target.value })} />}
            </div>
          </Row>
        )}
        {s.bgMode === 'gradient' && <Row title={t('ap.angle')}><Slider value={s.bgAngle} min={0} max={360} unit="°" onChange={(v) => void up({ bgAngle: v })} /></Row>}
        {s.bgMode === 'image' && <>
          <Row title={t('ap.bg.image')}>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn small" onClick={() => void pickImage()}>{t('ap.pickImage')}</button>
              {s.bgImage && <button className="btn small" onClick={() => void removeImage()}>{t('ap.removeImage')}</button>}
            </div>
          </Row>
          <Row title={t('ap.imageBlur')}><Slider value={s.bgBlur} min={0} max={30} unit=" px" onChange={(v) => void up({ bgBlur: v })} /></Row>
          <Row title={t('ap.imageDim')}><Slider value={s.bgDim} min={0} max={80} unit=" %" onChange={(v) => void up({ bgDim: v })} /></Row>
        </>}
        {s.bgMode === 'default' && <Row title={t('ap.ambient')}><Switch on={s.ambient} label={t('ap.ambient')} onChange={(v) => void up({ ambient: v })} /></Row>}
      </Section>

      <Section title={t('ap.accent')} delay={0.12}>
        <Row title={t('ap.accentOn')} help={t('ap.accentOn.help')}><Switch on={s.accentEnabled} label={t('ap.accentOn')} onChange={(v) => void up({ accentEnabled: v })} /></Row>
        {(s.accentEnabled || s.chartPalette === 'accent') && (
          <Row title={t('ap.accentColor')}>
            <input type="color" value={s.accentColor} onChange={(e) => void up({ accentColor: e.target.value })} />
            <div className="swatches">{ACCENTS.map((c) => <button key={c} className="swatch" style={{ background: c }} aria-label={c} onClick={() => void up({ accentColor: c, accentEnabled: true })} />)}</div>
          </Row>
        )}
        <Row title={t('ap.palette')}>
          <Tabs<ChartPalette> value={s.chartPalette} onChange={(v) => void up({ chartPalette: v })}
            options={[{ id: 'mono', label: t('ap.palette.mono') }, { id: 'accent', label: t('ap.palette.accent') }, { id: 'multi', label: t('ap.palette.multi') }]} />
        </Row>
      </Section>

      <Section title={t('ap.interface')} delay={0.16}>
        <Row title={t('settings.language')}>
          <Tabs value={s.lang} onChange={(v) => void up({ lang: v })} options={[{ id: 'fr', label: 'Français' }, { id: 'en', label: 'English' }]} />
        </Row>
        <Row title={t('ap.radius')}><Slider value={s.radius} min={0} max={28} unit=" px" onChange={(v) => void up({ radius: v })} /></Row>
        <Row title={t('ap.density')}>
          <Tabs<Density> value={s.density} onChange={(v) => void up({ density: v })}
            options={[{ id: 'compact', label: t('ap.density.compact') }, { id: 'comfortable', label: t('ap.density.comfortable') }, { id: 'spacious', label: t('ap.density.spacious') }]} />
        </Row>
        <Row title={t('ap.scale')}><Slider value={s.uiScale} min={85} max={130} unit=" %" onChange={(v) => void up({ uiScale: v })} /></Row>
        <Row title={t('ap.font')}>
          <select value={s.fontFamily} onChange={(e) => void up({ fontFamily: e.target.value as FontFamily })}>
            <option value="inter">Inter</option><option value="system">Segoe UI</option><option value="serif">Georgia (serif)</option><option value="mono">Cascadia Mono</option>
          </select>
        </Row>
        <Row title={t('settings.animations')}><Slider value={s.animations} min={0} max={100} onChange={(v) => void up({ animations: v })} /></Row>
      </Section>

      <Section title={t('ap.nav')} delay={0.2}>
        <p className="muted small" style={{ marginBottom: 6 }}>{t('ap.nav.help')}</p>
        {order.map((id, i) => (
          <div className="order-row" key={id}>
            <span className="grow">{t(navLabelKey(id))}</span>
            <button className="btn small" disabled={i === 0} aria-label={t('ap.up')} onClick={() => move(i, -1)}>↑</button>
            <button className="btn small" disabled={i === order.length - 1} aria-label={t('ap.down')} onClick={() => move(i, 1)}>↓</button>
            {id === 'overview' ? <span style={{ width: 42 }} /> : <Switch on={!s.navHidden.includes(id)} label={id} onChange={(v) => toggleHidden(id, v)} />}
          </div>
        ))}
      </Section>
    </div>
  )
}
