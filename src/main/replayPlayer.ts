// Brawlhalla replay player: the real game (bh-harness, run by Adobe AIR's adl64) started hidden when WaveDash
// starts, so a replay opens in about a second. It idles at a few frames per second while hidden.
// Control: JSON lines over TCP 127.0.0.1 (the harness CommandServer). Placement: a small PowerShell helper
// (Win32) makes the player window an owned window of WaveDash (always just above it, minimized with it)
// and moves it, in physical pixels, over the rectangle the Replays tab reserves for it.
import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron'
import { ChildProcess, ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { connect, Socket } from 'net'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { createInterface } from 'readline'
import { replayFileOf } from './plugins/manager'
import { ReplayPlayerRect, ReplayPlayerStatus } from '@shared/types'

const PORT = 47831
const TITLE = 'WaveDash replay player'

type Config = { dir: string; adl: string }
let config: Config = { dir: '', adl: '' }
let proc: ChildProcess | null = null
let sock: Socket | null = null
let state: ReplayPlayerStatus['state'] = 'off'
let lastError = ''
let current: string | null = null
let analysed = false
let hwnd = ''
let shown = false
let lastBounds = ''
let rect: ReplayPlayerRect | null = null
let getWin: () => BrowserWindow | null = () => null

const configFile = (): string => join(app.getPath('userData'), 'replay-player.json')

/** bh-harness folder: has harness/application-wavedash.xml and runtime-11.01/Harness.swf. */
const dirOk = (d: string): boolean => !!d && existsSync(join(d, 'harness', 'application-wavedash.xml')) && existsSync(join(d, 'runtime-11.01', 'Harness.swf'))

/** adl64.exe of an AIR SDK: in the bh-harness folder, or in %USERPROFILE%\AIRSDKs\<sdk>\bin. */
function findAdl(dir: string): string {
  const cands = [join(dir, 'airsdk', 'bin', 'adl64.exe')]
  const sdks = join(homedir(), 'AIRSDKs')
  try { for (const n of readdirSync(sdks).sort().reverse()) cands.push(join(sdks, n, 'bin', 'adl64.exe')) } catch { /* no SDK folder */ }
  return cands.find((c) => existsSync(c)) ?? ''
}

function loadConfig(): void {
  try { config = { ...config, ...JSON.parse(readFileSync(configFile(), 'utf8')) } } catch { /* first start */ }
  // Development setup: bh-harness next to the WaveDash folder.
  if (!dirOk(config.dir)) { const guess = resolve(process.cwd(), '..', 'bh-harness'); if (dirOk(guess)) config.dir = guess }
  if (!config.adl || !existsSync(config.adl)) config.adl = findAdl(config.dir)
}

export function status(): ReplayPlayerStatus {
  return { state, error: lastError || undefined, replay: current, analysed, dir: config.dir, installed: dirOk(config.dir) && !!config.adl }
}
const notify = (): void => { getWin()?.webContents.send('replayPlayer:status', status()) }
const setState = (s: ReplayPlayerStatus['state'], err = ''): void => { state = s; lastError = err; notify() }

/* ---------- Win32 helper (one PowerShell process, compiled once) ---------- */
/** Only makes the player window an owned window of WaveDash (placement goes through AIR itself, see place). */
const HELPER = `
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public static class WdWin {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint f);
  public static IntPtr Find(string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, p) => { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); if (sb.ToString() == title) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
}
"@
# Physical pixels: without this, Windows scales the coordinates of a DPI-unaware process a second time.
[void][WdWin]::SetProcessDPIAware()
[Console]::Out.WriteLine("ok")
while ($true) {
  $l = [Console]::In.ReadLine(); if ($l -eq $null) { break }
  $a = $l.Split(' ')
  try {
    switch ($a[0]) {
      'find' { [Console]::Out.WriteLine("hwnd " + [WdWin]::Find(($a[1..($a.Length-1)] -join ' ')).ToInt64()) }
      'own' { [void][WdWin]::SetWindowLongPtr([IntPtr][long]$a[1], -8, [IntPtr][long]$a[2]); [Console]::Out.WriteLine("owned") }
      'place' { [void][WdWin]::SetWindowPos([IntPtr][long]$a[1], [IntPtr]::Zero, [int]$a[2], [int]$a[3], [int]$a[4], [int]$a[5], 0x0014); [Console]::Out.WriteLine("placed") }
    }
  } catch { [Console]::Out.WriteLine("error " + $_) }
}
`
let helper: ChildProcessWithoutNullStreams | null = null
let helperWaiters: ((line: string) => void)[] = []

function helperCall(line: string): Promise<string> {
  if (!helper || helper.exitCode !== null) {
    // Script in a file, so stdin carries only the commands.
    const script = join(app.getPath('userData'), 'replay-player-helper.ps1')
    writeFileSync(script, HELPER)
    helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true })
    helperWaiters = [() => undefined]                               // first line: "ok" once compiled
    createInterface({ input: helper.stdout }).on('line', (l) => { const w = helperWaiters.shift(); if (w) w(l.trim()) })
    helper.on('exit', () => { helper = null; for (const w of helperWaiters) w('error exit'); helperWaiters = [] })
  }
  return new Promise((res) => { helperWaiters.push(res); helper!.stdin.write(line + '\r\n') })
}

async function findWindow(): Promise<string> {
  if (hwnd) return hwnd
  for (let i = 0; i < 20 && !hwnd; i++) {
    const r = await helperCall(`find ${TITLE}`)
    const h = /^hwnd (\d+)/.exec(r)?.[1]
    if (h && h !== '0') hwnd = h
    else await new Promise((r2) => setTimeout(r2, 500))
  }
  const w = getWin()
  if (hwnd && w) await helperCall(`own ${hwnd} ${w.getNativeWindowHandle().readBigUInt64LE(0)}`)
  return hwnd
}

/* ---------- Harness process and command channel ---------- */
const waiters = new Map<string, ((m: Record<string, unknown>) => void)[]>()
function send(msg: Record<string, unknown>): void { if (sock && !sock.destroyed) sock.write(JSON.stringify(msg) + '\n') }
function waitFor(event: string, ms: number): Promise<Record<string, unknown> | null> {
  return new Promise((res) => {
    const list = waiters.get(event) ?? []
    const done = (m: Record<string, unknown> | null): void => { clearTimeout(timer); const l = waiters.get(event); if (l) waiters.set(event, l.filter((x) => x !== fn)); res(m) }
    const fn = (m: Record<string, unknown>): void => done(m)
    const timer = setTimeout(() => done(null), ms)
    list.push(fn); waiters.set(event, list)
  })
}

function onMessage(m: Record<string, unknown>): void {
  const ev = String(m.event ?? '')
  if (ev === 'hello') { if (m.ready) { setState('ready'); void place(rect) } }
  else if (ev === 'ready') { setState('ready'); void place(rect) }
  else if (ev === 'opened') { current = String(m.path); analysed = false; notify() }
  else if (ev === 'analysed') { analysed = true; notify() }
  for (const fn of waiters.get(ev) ?? []) fn(m)
}

function connectLoop(tries = 0): void {
  if (!proc) return
  const s = connect(PORT, '127.0.0.1')
  s.setEncoding('utf8')
  let buf = ''
  s.on('connect', () => { sock = s })
  s.on('data', (d: string) => {
    buf += d
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { onMessage(JSON.parse(line)) } catch { /* not JSON */ } }
  })
  s.on('error', () => { /* retried below */ })
  s.on('close', () => {
    if (sock === s) sock = null
    if (proc && tries < 240) setTimeout(() => connectLoop(tries + 1), 500)
  })
}

/** Starts the hidden player (WaveDash startup). Does nothing when bh-harness or the AIR SDK is missing. */
export function startPlayer(): void {
  if (proc) return
  loadConfig()
  if (!dirOk(config.dir) || !config.adl) { setState('missing'); return }
  setState('loading')
  // A player left over by a WaveDash that did not quit cleanly still holds the port: ask it to quit first.
  const probe = connect(PORT, '127.0.0.1')
  let launched = false
  const go = (wait: number): void => { if (launched) return; launched = true; probe.destroy(); setTimeout(launch, wait) }
  probe.on('connect', () => { probe.write('{"cmd":"quit"}\n'); go(2000) })
  probe.on('error', () => go(0))
  setTimeout(() => go(0), 1500)
}

function launch(): void {
  if (proc) return
  const ext = join(config.dir, 'exp1', 'ext')
  const args = ['-nodebug', '-profile', 'extendedDesktop', ...(existsSync(ext) ? ['-extdir', ext] : []),
    join(config.dir, 'harness', 'application-wavedash.xml'), join(config.dir, 'runtime-11.01'), '--', 'host=1', `port=${PORT}`]
  const p = spawn(config.adl, args, { cwd: join(config.dir, 'harness'), windowsHide: true, stdio: 'ignore' })
  proc = p
  hwnd = ''; current = null; shown = false
  p.on('error', (e) => { proc = null; setState('error', e.message) })
  p.on('exit', (code) => { if (proc === p) { proc = null; sock = null; hwnd = ''; current = null; setState('error', `player stopped (${code})`) } })
  setTimeout(() => connectLoop(), 1500)
}

export function stopPlayer(): void {
  send({ cmd: 'quit' })
  const p = proc
  proc = null
  setTimeout(() => { try { if (p && p.exitCode === null) p.kill() } catch { /* already gone */ } }, 1500)
  try { helper?.stdin.end() } catch { /* closed */ }
}

/** Puts the player window over `rect` (CSS pixels of the WaveDash page), or hides it. */
async function place(r: ReplayPlayerRect | null): Promise<void> {
  rect = r
  const w = getWin()
  if (!w || !proc || state !== 'ready') return
  if (!r || w.isMinimized() || !w.isVisible()) {
    if (shown) { shown = false; send({ cmd: 'window', visible: false }) }
    return
  }
  // Owned by WaveDash: always just above it, minimized and hidden with it.
  if (!(await findWindow())) return
  const zoom = w.webContents.getZoomFactor()
  const cb = w.getContentBounds()
  const dip = { x: Math.round(cb.x + r.x * zoom), y: Math.round(cb.y + r.y * zoom), width: Math.round(r.width * zoom), height: Math.round(r.height * zoom) }
  // AIR is DPI-unaware: Windows gives it coordinates scaled by the system DPI (primary display), and the game only
  // follows a size it set itself (an outside resize leaves its stage at the old size). So: physical pixels / system scale,
  // applied by AIR through the window command.
  const px = screen.dipToScreenRect(w, dip), k = screen.getPrimaryDisplay().scaleFactor || 1
  const ax = Math.round(px.x / k), ay = Math.round(px.y / k), aw = Math.round(px.width / k), ah = Math.round(px.height / k)
  const key = `${ax},${ay},${aw},${ah}`
  if (key !== lastBounds || !shown) { lastBounds = key; send({ cmd: 'window', x: ax, y: ay, width: aw, height: ah, ...(shown ? {} : { visible: true }) }) }
  shown = true
}

async function open(accountId: number, file: string): Promise<{ ok: boolean; error?: string }> {
  const path = replayFileOf(accountId, file)
  if (!path) return { ok: false, error: 'replay file not found' }
  if (state !== 'ready') return { ok: false, error: state === 'missing' ? 'player not installed' : 'player still loading' }
  const reply = waitFor('opened', 8000), fail = waitFor('error', 8000)
  send({ cmd: 'open', path })
  const r = await Promise.race([reply, fail])
  if (!r) return { ok: false, error: 'no answer from the player' }
  if (r.event === 'error') return { ok: false, error: String(r.message) }
  return { ok: true }
}

function close(): void {
  shown = false; rect = null; current = null; analysed = false
  send({ cmd: 'close' })
  notify()
}

export function registerReplayPlayer(win: () => BrowserWindow | null): void {
  getWin = win
  ipcMain.handle('replayPlayer:status', () => status())
  ipcMain.handle('replayPlayer:open', (_e, accountId: number, file: string) => open(Number(accountId), String(file)))
  ipcMain.handle('replayPlayer:place', (_e, r: ReplayPlayerRect | null) => place(r && Number.isFinite(r.x) ? { x: +r.x, y: +r.y, width: +r.width, height: +r.height } : null))
  ipcMain.handle('replayPlayer:close', () => close())
  ipcMain.handle('replayPlayer:command', (_e, cmd: string, args?: Record<string, unknown>) => {
    if (['pause', 'seek', 'speed'].includes(String(cmd))) send({ ...(args ?? {}), cmd: String(cmd) })
  })
  ipcMain.handle('replayPlayer:setDir', async () => {
    const w = win()
    const r = w ? await dialog.showOpenDialog(w, { properties: ['openDirectory'] }) : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    const d = r.filePaths[0]
    if (!r.canceled && d && dirOk(d)) {
      config = { dir: d, adl: findAdl(d) }
      writeFileSync(configFile(), JSON.stringify(config))
      stopPlayer(); setTimeout(startPlayer, 2000)
    }
    return status()
  })
  // The window moves or changes size: the player follows (it is owned by WaveDash, so it already stays above it).
  const w = win()
  if (w) {
    const follow = (): void => { void place(rect) }
    w.on('move', follow); w.on('resize', follow); w.on('restore', follow); w.on('show', follow)
    w.on('minimize', () => { if (shown) { shown = false; send({ cmd: 'window', visible: false }) } })
    w.on('hide', () => { if (shown) { shown = false; send({ cmd: 'window', visible: false }) } })
  }
  startPlayer()
}
