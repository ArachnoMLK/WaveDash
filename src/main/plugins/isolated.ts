// Plugins run outside the main process: the interface stays smooth while a plugin computes
// (reading thousands of replays, Discord refresh…). A single utility process, kept open,
// handles the runs; if it exceeds the allowed time or stops, it is restarted on demand.
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
  // What the process writes to its error output goes to plugin-host.log (app folder), to understand a crash.
  const logFile = join(app.getPath('userData'), 'plugin-host.log')
  const write = (t: string): void => { try { if ((statSync(logFile, { throwIfNoEntry: false })?.size ?? 0) < 1_000_000) appendFileSync(logFile, `[${new Date().toISOString()}] ${t}
`) } catch { /* optional log */ } }
  c.stderr?.on('data', (d: Buffer) => write(d.toString().trim()))
  c.stdout?.on('data', (d: Buffer) => write(d.toString().trim()))
  c.on('message', (r: Reply) => {
    const p = pending.get(r.id)
    if (!p) return
    clearTimeout(p.timer); pending.delete(r.id); p.resolve(r)
  })
  c.on('exit', (code) => {
    write(`process stopped (code ${code})`)
    if (child === c) child = null
    for (const [id, p] of pending) { clearTimeout(p.timer); pending.delete(id); p.reject(new PluginError('engine', `The plugin process stopped (code ${code})`)) }
  })
  child = c
  return c
}

/** Runs a plugin in the plugin process. `store`: account whose storage is copied before and updated after. */
export async function runIsolated(req: RunRequest, store?: { pluginId: string; accountId: number }): Promise<{ value: unknown; logs: string[] }> {
  const snapshot = store ? db.pluginStorageAll(store.pluginId, store.accountId) : {}
  const { storage: _ignored, ...job } = req
  let reply: Reply
  const send = (): Promise<Reply> => {
    const p = host()
    const id = ++seq, wall = (req.limits?.wallMs ?? DEFAULT_LIMITS.wallMs) + 15_000
    return new Promise<Reply>((resolve, reject) => {
      // Safety net: past the total allowed time (+15 s), the process is stopped and restarted on the next run.
      const timer = setTimeout(() => { pending.delete(id); reject(new PluginError('timeout', 'Total time exceeded')); p.kill() }, wall)
      pending.set(id, { resolve, reject, timer })
      p.postMessage({ id, job: { ...job, snapshot, maxKeys: MAX_STORAGE_KEYS } })
    })
  }
  try {
    // The process stopped during the run (closing, forced stop…): not the plugin's fault, retry once.
    try { reply = await send() } catch (e) { if (e instanceof PluginError && e.code === 'engine') reply = await send(); else throw e }
  } catch (e) {
    if (e instanceof PluginError) throw e
    // Process unavailable (exceptional case): run in place, as before 0.11.
    console.error('Plugin process unavailable:', e)
    return runPlugin(req)
  }
  if (store) for (const [k, v] of Object.entries(reply.changes)) db.pluginStorageSet(store.pluginId, store.accountId, k, v)
  else for (const [k, v] of Object.entries(reply.changes)) req.storage.set(k, v)
  if (!reply.ok) { const err = new PluginError(reply.code ?? 'engine', reply.message ?? ''); err.logs = reply.logs; throw err }
  return { value: reply.value, logs: reply.logs }
}

export function stopPluginHost(): void { child?.kill(); child = null }
