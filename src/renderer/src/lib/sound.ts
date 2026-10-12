// Sons de palier synthétisés (Web Audio) : aucun fichier audio à embarquer.
import type { SoundKind } from '@shared/types'

let ctx: AudioContext | null = null

export function playSound(kind: SoundKind, volume: number): void {
  try {
    ctx = ctx ?? new AudioContext()
    const c = ctx
    if (c.state === 'suspended') void c.resume()
    const master = c.createGain()
    master.gain.value = Math.max(0, Math.min(1, volume / 100)) * 0.35
    master.connect(c.destination)
    const t0 = c.currentTime
    const note = (freq: number, start: number, dur: number, type: OscillatorType = 'sine'): void => {
      const o = c.createOscillator(), g = c.createGain()
      o.type = type; o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, t0 + start)
      g.gain.exponentialRampToValueAtTime(1, t0 + start + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur)
      o.connect(g); g.connect(master)
      o.start(t0 + start); o.stop(t0 + start + dur + 0.05)
    }
    if (kind === 'chime') { note(784, 0, 0.35); note(1175, 0.14, 0.6) }
    else if (kind === 'pulse') { note(523, 0, 0.12, 'triangle'); note(523, 0.16, 0.12, 'triangle'); note(784, 0.32, 0.32, 'triangle') }
    else { note(660, 0, 1.1); note(1320, 0, 0.7); note(1980, 0, 0.4) }
  } catch { /* audio indisponible : on ignore */ }
}
