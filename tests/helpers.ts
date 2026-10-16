import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginManifest, validateManifest } from '@shared/plugin'

export const ROOT = process.env.WAVEDASH_ROOT ?? process.cwd()
export const tempDir = (): string => mkdtempSync(join(tmpdir(), 'wd-'))
export const exampleIds = (): string[] => readdirSync(join(ROOT, 'examples', 'plugins'))
export const exampleRaw = (id: string): Record<string, unknown> => JSON.parse(readFileSync(join(ROOT, 'examples', 'plugins', id, 'manifest.json'), 'utf8'))
export const exampleScript = (id: string): string => readFileSync(join(ROOT, 'examples', 'plugins', id, 'main.js'), 'utf8')
export function manifest(over: Record<string, unknown> = {}): PluginManifest {
  const v = validateManifest({ wdsh: 1, id: 'test.plugin', name: 'Test', version: '1.0.0', metrics: [{ key: 'n', label: 'N', primary: true }], ...over })
  if (!v.ok) throw new Error(v.error)
  return v.manifest
}
