// Plugin process: an Electron utility process, separate from the interface, which runs the scripts in QuickJS.
// It touches neither the database nor the secrets: it gets everything a run needs (script, context, copy of the
// account storage) and returns the result and the storage changes, which the main process saves.
import { PluginError, runPlugin, RunRequest } from './sandbox'

interface Job extends Omit<RunRequest, 'storage'> { snapshot: Record<string, string>; maxKeys: number }
interface Message { id: number; job: Job }

const port = (process as unknown as { parentPort: { on(e: 'message', f: (m: { data: Message }) => void): void; postMessage(m: unknown): void } }).parentPort

port.on('message', ({ data }) => {
  const { id, job } = data
  const store = new Map(Object.entries(job.snapshot ?? {})), changes: Record<string, string> = {}
  const req: RunRequest = {
    ...job,
    storage: {
      get: (k) => store.get(k) ?? null,
      set: (k, v) => {
        if (!store.has(k) && store.size >= job.maxKeys) throw new Error('too many storage keys')
        store.set(k, v); changes[k] = v
      }
    }
  }
  runPlugin(req).then(
    (r) => port.postMessage({ id, ok: true, value: r.value, logs: r.logs, changes }),
    (e) => port.postMessage({ id, ok: false, code: e instanceof PluginError ? e.code : 'engine', message: e instanceof Error ? e.message : String(e),
      logs: e instanceof PluginError ? e.logs : [], changes })
  )
})
