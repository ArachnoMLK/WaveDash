// Bac à sable des plugins : le script s'exécute dans QuickJS (WebAssembly), un moteur JavaScript isolé qui n'a,
// par construction, ni `process`, ni `require`, ni réseau, ni disque. Le plugin ne voit QUE l'objet `host`
// ci-dessous, dont chaque fonction est contrôlée côté WaveDash selon les permissions du manifeste.
// Chaque exécution utilise un moteur neuf, avec plafonds de mémoire, de temps de calcul et de requêtes.
import type { QuickJSContext, QuickJSDeferredPromise } from 'quickjs-emscripten'
import type { PluginManifest } from '@shared/plugin'
import { setMaxListeners } from 'events'
import { FolderAccess, listFiles, readFileSafe } from './files'
import { httpRequest, NetConfig, NetError } from './net'

export type PluginErrorCode = 'engine' | 'script' | 'timeout' | 'memory' | 'blocked' | 'network' | 'blocked_promise' | 'invalid_result' | 'no_function'
export class PluginError extends Error { logs: string[] = []; constructor(public code: PluginErrorCode, message: string) { super(message) } }

export interface Limits {
  memoryBytes: number; stackBytes: number
  /** Temps de calcul JavaScript cumulé (hors attente réseau). */
  cpuMs: number
  /** Durée totale maximale, réseau compris. */
  wallMs: number
  maxRequests: number; maxResponseBytes: number; httpTimeoutMs: number
  maxFileBytes: number; maxFileTotal: number
  maxStorageValue: number; maxLogLines: number; maxResultBytes: number
}
export const DEFAULT_LIMITS: Limits = {
  // Pile : au-delà d'environ 400 Ko, la pile native du moteur déborde avant sa propre limite ; 256 Ko reste sûr.
  memoryBytes: 48 * 1024 * 1024, stackBytes: 256 * 1024, cpuMs: 8000, wallMs: 45_000,
  maxRequests: 30, maxResponseBytes: 5 * 1024 * 1024, httpTimeoutMs: 15_000,
  maxFileBytes: 8 * 1024 * 1024, maxFileTotal: 64 * 1024 * 1024,
  maxStorageValue: 64 * 1024, maxLogLines: 100, maxResultBytes: 2 * 1024 * 1024
}

export interface RunRequest {
  manifest: PluginManifest
  script: string
  fn: 'resolve' | 'refresh' | 'search' | 'cross' | 'view'
  ctx: { inputs: Record<string, string>; secrets: Record<string, string>; lang: string; account?: { externalId: string; displayName: string }; query?: string; cross?: Record<string, string>; filters?: Record<string, string> }
  storage: { get(key: string): string | null; set(key: string, value: string): void }
  /** Présent seulement si le manifeste demande la permission « dossier » et que l'utilisateur en a choisi un. */
  folder?: FolderAccess
  limits?: Partial<Limits>
  /** Réservé aux tests. */
  allowLocalForTests?: boolean
}

// Code exécuté dans le moteur avant le script du plugin : il construit l'objet `host` puis retire les fonctions internes.
const BOOTSTRAP = `(() => {
  const g = globalThis;
  const L = g.__log, SG = g.__sget, SS = g.__sset, H = g.__http, FL = g.__flist, FR = g.__fread;
  const fmt = (a) => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (e) { return String(a); } };
  const log = (...args) => L(args.map(fmt).join(' '));
  const files = {
    list: () => JSON.parse(FL()),
    readText: (name) => FR(String(name), 'text'),
    readBytes: (name) => { const s = FR(String(name), 'bytes'); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) - 1; return u; }
  };
  g.host = Object.freeze({
    log: log,
    storage: Object.freeze({ get: (k) => SG(String(k)), set: (k, v) => SS(String(k), String(v)) }),
    http: (url, opts) => H(String(url), JSON.stringify(opts || {})).then(
      (s) => { const r = JSON.parse(s); r.json = () => JSON.parse(r.text); return r; },
      (e) => { throw new Error(String(e)); }),
    files: Object.freeze(files)
  });
  g.console = { log: log, info: log, warn: log, error: log };
  for (const k of ['__log', '__sget', '__sset', '__http', '__flist', '__fread']) delete g[k];
})()`

const CALL = `globalThis.__state = 'pending'; globalThis.__out = '';
(async () => {
  const p = (typeof plugin === 'undefined') ? undefined : plugin;
  if (!p || typeof p[__fn] !== 'function') throw new Error('NO_FUNCTION:' + __fn);
  const v = await p[__fn](JSON.parse(__ctx));
  return JSON.stringify(v === undefined ? null : v);
})().then((v) => { __out = v; __state = 'ok'; }, (e) => { __out = (e && e.message) ? String(e.message) : String(e); __state = 'err'; });`

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) + '…' : s)

/** Octets → chaîne sans caractère nul (octet + 1), car la frontière du moteur ne transporte pas le caractère nul. */
function encodeBytes(buf: Buffer): string {
  const u = new Uint16Array(buf.length)
  for (let i = 0; i < buf.length; i++) u[i] = buf[i] + 1
  return Buffer.from(u.buffer).toString('utf16le')
}

function mapVmError(err: { name?: string; message?: string }): PluginError {
  const msg = String(err?.message ?? err)
  if (/interrupted/i.test(msg)) return new PluginError('timeout', 'Temps de calcul dépassé')
  if (/out of memory/i.test(msg)) return new PluginError('memory', 'Mémoire dépassée')
  if (/stack/i.test(msg) && /overflow|exceeded/i.test(msg)) return new PluginError('memory', 'Pile dépassée')
  return new PluginError('script', clip(msg, 300))
}

export async function runPlugin(req: RunRequest): Promise<{ value: unknown; logs: string[] }> {
  const limits = { ...DEFAULT_LIMITS, ...req.limits }
  const logs: string[] = []
  const abort = new AbortController()
  setMaxListeners(limits.maxRequests + 10, abort.signal)   // une écoute par requête du plugin

  let mod
  try { mod = await (await import('quickjs-emscripten')).newQuickJSWASMModule() } catch (e) { throw new PluginError('engine', `Moteur de plugins indisponible : ${(e as Error).message}`) }
  const rt = mod.newRuntime()
  rt.setMemoryLimit(limits.memoryBytes)
  rt.setMaxStackSize(limits.stackBytes)

  // Temps de calcul : on ne mesure que les phases où le JavaScript du plugin s'exécute.
  let cpuUsed = 0, sliceStart = Date.now(), aborted = false
  rt.setInterruptHandler(() => aborted || cpuUsed + (Date.now() - sliceStart) > limits.cpuMs)
  const slice = <T,>(fn: () => T): T => { sliceStart = Date.now(); try { return fn() } finally { cpuUsed += Date.now() - sliceStart } }

  const vm: QuickJSContext = rt.newContext()
  const deferreds: QuickJSDeferredPromise[] = []
  let pending = 0, requests = 0, fileTotal = 0, wakeFlag = false
  let wakeResolve: (() => void) | null = null
  const wake = (): void => { if (wakeResolve) { const r = wakeResolve; wakeResolve = null; r() } else wakeFlag = true }
  const waitWake = (ms: number): Promise<void> => new Promise((resolve) => {
    if (wakeFlag) { wakeFlag = false; return resolve() }
    const t = setTimeout(() => { wakeResolve = null; resolve() }, ms)
    wakeResolve = () => { clearTimeout(t); resolve() }
  })

  const netCfg: NetConfig = { allowedHosts: req.manifest.permissions.network, maxBytes: limits.maxResponseBytes, timeoutMs: limits.httpTimeoutMs,
    maxRedirects: 3, allowLocalForTests: req.allowLocalForTests, signal: abort.signal }

  // ----- fonctions fournies au plugin -----
  const define = (name: string, impl: Parameters<QuickJSContext['newFunction']>[1]): void => {
    const h = vm.newFunction(name, impl); vm.setProp(vm.global, name, h); h.dispose()
  }
  define('__log', (m) => { if (logs.length < limits.maxLogLines) logs.push(clip(vm.getString(m), 400)) })
  define('__sget', (k) => { const v = req.storage.get(vm.getString(k)); return v === null ? vm.null : vm.newString(v) })
  define('__sset', (k, v) => {
    const key = vm.getString(k), val = vm.getString(v)
    if (!/^[\w.-]{1,64}$/.test(key)) throw new Error('clé de stockage invalide')
    if (val.length > limits.maxStorageValue) throw new Error('valeur de stockage trop grande')
    req.storage.set(key, val)
  })
  define('__http', (urlH, optsH) => {
    const url = vm.getString(urlH), optsJson = vm.getString(optsH)
    const d = vm.newPromise(); deferreds.push(d); pending++
    const finish = (ok: boolean, text: string): void => {
      pending--
      if (!aborted) { const h = vm.newString(text); if (ok) d.resolve(h); else d.reject(h); h.dispose() }
      wake()
    }
    if (++requests > limits.maxRequests) { queueMicrotask(() => finish(false, 'trop de requêtes pour une exécution')); return d.handle }
    let opts: { method?: string; headers?: Record<string, string>; body?: string } = {}
    try { opts = JSON.parse(optsJson) } catch { /* options ignorées */ }
    httpRequest(url, opts, netCfg).then((r) => finish(true, JSON.stringify(r)), (e: unknown) => finish(false, e instanceof NetError ? e.message : 'requête impossible'))
    return d.handle
  })
  define('__flist', () => {
    if (!req.folder) throw new Error('permission « dossier » non accordée')
    return vm.newString(JSON.stringify(listFiles(req.folder)))
  })
  define('__fread', (nameH, modeH) => {
    if (!req.folder) throw new Error('permission « dossier » non accordée')
    const name = vm.getString(nameH), mode = vm.getString(modeH)
    const buf = readFileSafe(req.folder, name, limits.maxFileBytes)
    fileTotal += buf.length
    if (fileTotal > limits.maxFileTotal) throw new Error('volume de lecture dépassé')
    return vm.newString(mode === 'text' ? buf.toString('utf8') : encodeBytes(buf))
  })

  const evalOk = (code: string, file: string): void => {
    const r = slice(() => vm.evalCode(code, file))
    if (r.error) { const e = vm.dump(r.error); r.error.dispose(); throw mapVmError(e) }
    r.value.dispose()
  }
  const readState = (): string => {
    const r = slice(() => vm.evalCode('__state'))
    if (r.error) { r.error.dispose(); return 'err' }
    const s = vm.getString(r.value); r.value.dispose(); return s
  }
  const readOut = (): string => {
    const r = slice(() => vm.evalCode('__out'))
    if (r.error) { r.error.dispose(); return '' }
    const s = vm.getString(r.value); r.value.dispose(); return s
  }

  try {
    evalOk(BOOTSTRAP, 'bootstrap.js')
    evalOk(req.script, 'plugin.js')
    for (const [k, v] of Object.entries({ __fn: req.fn, __ctx: JSON.stringify(req.ctx) })) { const h = vm.newString(v); vm.setProp(vm.global, k, h); h.dispose() }
    evalOk(CALL, 'call.js')

    const deadline = Date.now() + limits.wallMs
    for (;;) {
      const jobs = slice(() => rt.executePendingJobs())
      if ('error' in jobs && jobs.error) { const e = vm.dump(jobs.error); jobs.error.dispose(); throw mapVmError(e) }
      const st = readState()
      if (st !== 'pending') break
      if (pending === 0) throw new PluginError('blocked_promise', 'Le plugin attend une promesse qui ne se résout jamais')
      const left = deadline - Date.now()
      if (left <= 0) throw new PluginError('timeout', 'Durée maximale dépassée')
      await waitWake(left)
    }

    const out = readOut()
    if (readState() === 'err') {
      if (out.startsWith('NO_FUNCTION:')) throw new PluginError('no_function', `Le plugin ne définit pas « ${out.slice(12)} »`)
      throw mapVmError({ message: out })
    }
    if (out.length > limits.maxResultBytes) throw new PluginError('invalid_result', 'Résultat trop volumineux')
    try { return { value: JSON.parse(out), logs } } catch { throw new PluginError('invalid_result', 'Résultat illisible') }
  } catch (e) {
    // Filet de sécurité : une exception inattendue du moteur devient une erreur de plugin, jamais un plantage de l'appli.
    const err = e instanceof PluginError ? e
      : e instanceof RangeError ? new PluginError('memory', 'Pile dépassée')
      : new PluginError('engine', `Erreur du moteur : ${clip(String((e as Error)?.message ?? e), 200)}`)
    err.logs = logs     // le journal accompagne l'erreur pour aider à comprendre
    throw err
  } finally {
    aborted = true
    abort.abort()
    for (const d of deferreds) { try { d.dispose() } catch { /* déjà libéré */ } }
    try { vm.dispose() } catch { /* le moteur est jeté de toute façon */ }
    // Pas de rt.dispose() : une promesse du plugin encore en attente y déclenche une assertion de QuickJS.
    // Le module WebAssembly, créé pour cette exécution, est jeté en entier avec le runtime.
  }
}
