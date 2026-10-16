// Exécution des plugins hors du processus principal : l'interface reste fluide pendant qu'un plugin calcule
// (relecture de milliers de replays, actualisation Discord…). Un seul processus utilitaire, gardé ouvert,
// traite les exécutions ; s'il dépasse le temps permis ou s'arrête, il est relancé à la demande.
import { app, utilityProcess, UtilityProcess } from 'electron'
import { appendFileSync, statSync } from 'fs'
import { join } from 'path'
import * as db from '../db'
import { DEFAULT_LIMITS, PluginError, PluginErrorCode, runPlugin, RunRequest } from './sandbox'

const MAX_STORAGE_KEYS = 100
interface Reply { id: number; ok: boolean; value?: unknown; logs: string[]; changes: Record<string, string>; code?: PluginErrorCode; message?: string }
type Pending = { resolve: (r: Reply) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }

let child: UtilityProcess | null = null
let seq = 0
const pending = new Map<number, Pending>()

function host(): UtilityProcess {
  if (child) return child
  const c = utilityProcess.fork(join(__dirname, 'pluginHost.js'), [], { serviceName: 'WaveDash · plugins', stdio: 'pipe' })
  // Ce que le processus écrit sur sa sortie d'erreur va dans plugin-host.log (dossier de l'appli), pour comprendre un arrêt.
  const logFile = join(app.getPath('userData'), 'plugin-host.log')
  const write = (t: string): void => { try { if ((statSync(logFile, { throwIfNoEntry: false })?.size ?? 0) < 1_000_000) appendFileSync(logFile, `[${new Date().toISOString()}] ${t}
`) } catch { /* journal facultatif */ } }
  c.stderr?.on('data', (d: Buffer) => write(d.toString().trim()))
  c.stdout?.on('data', (d: Buffer) => write(d.toString().trim()))
  c.on('message', (r: Reply) => {
    const p = pending.get(r.id)
    if (!p) return
    clearTimeout(p.timer); pending.delete(r.id); p.resolve(r)
  })
  c.on('exit', (code) => {
    write(`processus arrêté (code ${code})`)
    if (child === c) child = null
    for (const [id, p] of pending) { clearTimeout(p.timer); pending.delete(id); p.reject(new PluginError('engine', `Le processus des plugins s’est arrêté (code ${code})`)) }
  })
  child = c
  return c
}

/** Exécute un plugin dans le processus des plugins. `store` : compte dont le stockage est copié avant et mis à jour après. */
export async function runIsolated(req: RunRequest, store?: { pluginId: string; accountId: number }): Promise<{ value: unknown; logs: string[] }> {
  const snapshot = store ? db.pluginStorageAll(store.pluginId, store.accountId) : {}
  const { storage: _ignored, ...job } = req
  let reply: Reply
  const send = (): Promise<Reply> => {
    const p = host()
    const id = ++seq, wall = (req.limits?.wallMs ?? DEFAULT_LIMITS.wallMs) + 15_000
    return new Promise<Reply>((resolve, reject) => {
      // Garde-fou : au-delà du temps total permis (+15 s), le processus est arrêté et relancé à la prochaine exécution.
      const timer = setTimeout(() => { pending.delete(id); reject(new PluginError('timeout', 'Temps total dépassé')); p.kill() }, wall)
      pending.set(id, { resolve, reject, timer })
      p.postMessage({ id, job: { ...job, snapshot, maxKeys: MAX_STORAGE_KEYS } })
    })
  }
  try {
    // Le processus s'est arrêté pendant l'exécution (fermeture, arrêt forcé…) : ce n'est pas la faute du plugin, on réessaie une fois.
    try { reply = await send() } catch (e) { if (e instanceof PluginError && e.code === 'engine') reply = await send(); else throw e }
  } catch (e) {
    if (e instanceof PluginError) throw e
    // Processus indisponible (cas exceptionnel) : exécution sur place, comme avant la 0.11.
    console.error('Processus des plugins indisponible :', e)
    return runPlugin(req)
  }
  if (store) for (const [k, v] of Object.entries(reply.changes)) db.pluginStorageSet(store.pluginId, store.accountId, k, v)
  else for (const [k, v] of Object.entries(reply.changes)) req.storage.set(k, v)
  if (!reply.ok) { const err = new PluginError(reply.code ?? 'engine', reply.message ?? ''); err.logs = reply.logs; throw err }
  return { value: reply.value, logs: reply.logs }
}

export function stopPluginHost(): void { child?.kill(); child = null }
