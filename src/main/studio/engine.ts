// Brawlhalla render engine (BrawlRender.exe, .NET): a process started once, one JSON request per line.
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { createInterface } from 'readline'

type Pending = { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }

export class Engine {
  private proc: ChildProcessWithoutNullStreams | null = null
  private ready: Promise<void> | null = null
  private pending = new Map<number, Pending>()
  private nextId = 1
  /** Requests go one by one: the engine handles one command at a time. */
  private chain: Promise<unknown> = Promise.resolve()

  constructor(private exe: string, private gamePath: string) {}

  private start(): Promise<void> {
    if (this.ready && this.proc && this.proc.exitCode === null) return this.ready
    this.ready = new Promise((resolve, reject) => {
      const proc = spawn(this.exe, [this.gamePath], { windowsHide: true })
      this.proc = proc
      let first = true
      createInterface({ input: proc.stdout }).on('line', (line) => {
        let msg: Record<string, unknown>
        try { msg = JSON.parse(line) } catch { return }
        if (first) {
          first = false
          return msg.ok ? resolve() : reject(new Error(String(msg.error ?? 'moteur')))
        }
        const p = this.pending.get(Number(msg.id))
        if (!p) return
        this.pending.delete(Number(msg.id))
        if (msg.ok) p.resolve(msg)
        else p.reject(new Error(String(msg.error ?? 'erreur moteur')))
      })
      proc.stderr.on('data', () => { /* engine log ignored */ })
      proc.on('error', (e) => { if (first) reject(e) })
      proc.on('exit', () => {
        for (const p of this.pending.values()) p.reject(new Error('engine stopped'))
        this.pending.clear()
        this.proc = null
        if (first) reject(new Error('the engine stopped during startup'))
      })
    })
    return this.ready
  }

  /** Starts the engine (loads the game files, ~3 s). */
  warmup(): Promise<void> { return this.start() }

  call<T = Record<string, unknown>>(cmd: string, params: Record<string, unknown> = {}): Promise<T> {
    const run = async (): Promise<T> => {
      await this.start()
      const id = this.nextId++
      return new Promise<T>((resolve, reject) => {
        this.pending.set(id, { resolve: (v) => resolve(v as T), reject })
        this.proc!.stdin.write(JSON.stringify({ cmd, id, ...params }) + '\n')
      })
    }
    const p = this.chain.then(run, run)
    this.chain = p.catch(() => undefined)
    return p
  }

  stop(): void {
    if (!this.proc) return
    try { this.proc.stdin.write('{"cmd":"quit"}\n') } catch { /* already closed */ }
    const p = this.proc
    setTimeout(() => { if (p.exitCode === null) p.kill() }, 2000)
    this.proc = null
    this.ready = null
  }
}
