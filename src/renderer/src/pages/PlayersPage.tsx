// Player bank: search a player seen in the replays (this PC and imported .wdbank files), then their sheet.
// The page only asks two narrow questions: which players match a name, and one player's sheet.
import { useEffect, useState } from 'react'
import type { BankPlayer, BankStats, PluginDetail } from '@shared/plugin'
import { localeOf } from '@shared/types'
import { Reveal } from '../components/ui'
import { useApp } from '../lib/AppContext'
import { useChartTheme } from '../lib/useChartTheme'
import { DetailView } from './PluginPage'

export function PlayersPage(): JSX.Element {
  const { t, settings, plugins, dataVersion } = useApp()
  const th = useChartTheme()
  const [stats, setStats] = useState<BankStats | null>(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<BankPlayer[] | null>(null)
  const [open, setOpen] = useState<BankPlayer | null>(null)
  const [sheet, setSheet] = useState<{ busy: boolean; detail?: PluginDetail; error?: string }>({ busy: false })
  const [notes, setNotes] = useState<string[]>([])
  const date = (ts: number): string => new Date(ts).toLocaleDateString(localeOf(settings.lang))

  const loadStats = (): void => { void window.api.bankStats().then(setStats) }
  useEffect(loadStats, [dataVersion])

  // The search starts 300 ms after the last keystroke.
  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) { setFound(null); return }
    const timer = setTimeout(() => { void window.api.bankSearch(query).then(setFound) }, 300)
    return () => clearTimeout(timer)
  }, [q, dataVersion])

  const show = (p: BankPlayer): void => {
    setOpen(p); setSheet({ busy: true })
    void window.api.bankSheet(p.source, p.key).then((r) => setSheet({ busy: false, detail: r.detail, error: r.ok ? undefined : r.error }))
  }

  const doExport = async (): Promise<void> => {
    const r = await window.api.bankExport()
    if (r) setNotes([t('pl.exported', { n: r.rows })])
  }
  const doImport = async (): Promise<void> => {
    const res = await window.api.bankImport()
    if (!res) return
    setNotes(res.map((x) => (x.error ? t('pl.importError', { file: x.file }) : t('pl.imported', { file: x.file, added: x.added, known: x.known, rejected: x.rejected }))))
    loadStats()
  }
  const forget = async (origin: string): Promise<void> => { await window.api.bankForget(origin); loadStats(); setFound(null); setQ((x) => x) }

  const pluginName = (id: string): string => plugins.find((p) => p.id === id)?.manifest.name ?? id
  const errorText = (e?: string): string => (e === 'plugin_missing' ? t('pl.pluginMissing') : t('pl.sheetError', { e: e ?? '' }))

  return (
    <>
      <Reveal>
        <div className="page-head"><h1>{t('pl.title')}</h1></div>
        <p className="muted" style={{ marginTop: -6 }}>{t('pl.intro')}</p>
      </Reveal>

      <Reveal delay={0.04}>
        <div className="glass pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input className="grow" style={{ minWidth: 240 }} value={q} placeholder={t('pl.search')} onChange={(e) => { setQ(e.target.value); setOpen(null) }} />
          <button className="btn" onClick={() => void doExport()}>{t('pl.export')}</button>
          <button className="btn" onClick={() => void doImport()}>{t('pl.import')}</button>
          {stats && <span className="muted small" style={{ width: '100%' }}>{t('pl.stats', { players: stats.players, games: stats.games, rows: stats.rows })}</span>}
          {notes.map((n, i) => <span key={i} className="small" style={{ width: '100%' }}>{n}</span>)}
        </div>
      </Reveal>

      {stats && stats.rows === 0 && !found && <Reveal delay={0.08}><div className="glass empty"><p>{t('pl.empty')}</p></div></Reveal>}

      {open ? (
        <Reveal>
          <div className="glass pad">
            <button className="btn small" onClick={() => setOpen(null)}>← {t('pl.back')}</button>
            <h2 style={{ margin: '12px 0 4px' }}>{open.name}</h2>
            <p className="muted small">{pluginName(open.source)} · {t('pl.games', { n: open.games })} · {t('pl.lastSeen', { date: date(open.last) })}</p>
            {sheet.busy ? <p className="muted">…</p>
              : sheet.detail ? <div style={{ marginTop: 10 }}><DetailView accountId={0} detail={sheet.detail} th={th} t={t} /></div>
              : <p className="muted">{errorText(sheet.error)}</p>}
          </div>
        </Reveal>
      ) : found && (
        <Reveal>
          <div className="glass pad">
            {found.length === 0 ? <p className="muted">{t('pl.noMatch', { q: q.trim() })}</p> : (
              <table className="table">
                <tbody>
                  {found.map((p) => (
                    <tr key={p.source + p.key} className="click" onClick={() => show(p)}>
                      <td><b>{p.name}</b>{p.key.startsWith('p') && <span className="muted small"> · ID {p.key.slice(1)}</span>}</td>
                      <td className="muted small">{pluginName(p.source)}</td>
                      <td>{t('pl.games', { n: p.games })}</td>
                      <td className="muted small">{t('pl.lastSeen', { date: date(p.last) })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Reveal>
      )}

      {stats && stats.origins.length > 0 && (
        <Reveal delay={0.1}>
          <div className="glass pad">
            <h2>{t('pl.sources')}</h2>
            <p className="muted small">{t('pl.exchange')}</p>
            <table className="table">
              <tbody>
                {stats.origins.map((o) => (
                  <tr key={o.origin}>
                    <td>{o.origin === 'local' ? t('pl.local') : o.origin.slice(7)}</td>
                    <td>{o.rows}</td>
                    <td style={{ textAlign: 'right' }}>{o.origin !== 'local' && <button className="btn small" onClick={() => void forget(o.origin)}>{t('pl.forget')}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      )}
    </>
  )
}
