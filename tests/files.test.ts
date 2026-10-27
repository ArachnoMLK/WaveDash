import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { listFiles, readFileSafe } from '../src/main/plugins/files'
import { tempDir } from './helpers'

function setup(): { dir: string; extra: string } {
  const dir = tempDir(), extra = tempDir()
  for (let i = 0; i < 5; i++) { const f = join(dir, `g${i}.replay`); writeFileSync(f, `game ${i}`); utimesSync(f, 1000 + i, 1000 + i) }
  writeFileSync(join(dir, 'notes.txt'), 'x')
  mkdirSync(join(dir, 'subfolder.replay'))
  writeFileSync(join(extra, 'import.replay'), 'imported'); utimesSync(join(extra, 'import.replay'), 2000, 2000)
  writeFileSync(join(extra, 'g0.replay'), 'doublon')
  writeFileSync(join(dir, 'gros.replay'), Buffer.alloc(2000)); utimesSync(join(dir, 'gros.replay'), 10, 10)
  return { dir, extra }
}

test('list: declared extensions, newest first, imports added, folders ignored', () => {
  const { dir, extra } = setup()
  const names = listFiles({ dir, extra, extensions: ['.replay'] }).map((f) => f.name)
  assert.deepEqual(names, ['import.replay', 'g4.replay', 'g3.replay', 'g2.replay', 'g1.replay', 'g0.replay', 'gros.replay'])
  assert.deepEqual(listFiles({ dir, extensions: ['.replay'] }, 2).map((f) => f.name), ['g4.replay', 'g3.replay'])
})

test('read: a plain file name, in the folder or the imports', () => {
  const { dir, extra } = setup(), a = { dir, extra, extensions: ['.replay'] }
  assert.equal(readFileSafe(a, 'g1.replay', 1000).toString(), 'game 1')
  assert.equal(readFileSafe(a, 'g0.replay', 1000).toString(), 'game 0')      // the chosen folder wins
  assert.equal(readFileSafe(a, 'import.replay', 1000).toString(), 'imported')
  const bad = ['../g1.replay', '..\\g1.replay', 'x/g1.replay', 'C:g1.replay', 'g1.replay:flux', 'notes.txt', '', '.', '..', 'g1.replay\0', 'absent.replay', 'subfolder.replay', 'gros.replay']
  for (const n of bad) assert.throws(() => readFileSafe(a, n, 1000), undefined, JSON.stringify(n))
  assert.throws(() => readFileSafe(a, `${dir}\\g1.replay`, 1000))
})

test('read: an NTFS alternate data stream is rejected', { skip: process.platform !== 'win32' }, () => {
  const { dir } = setup()
  writeFileSync(join(dir, 'a'), 'main'); writeFileSync(join(dir, 'a:cache.replay'), 'hidden')
  assert.throws(() => readFileSafe({ dir, extensions: ['.replay'] }, 'a:cache.replay', 1000))
})

test('read: a symbolic link is rejected', (t) => {
  const { dir } = setup(), secret = join(tempDir(), 'secret.replay')
  writeFileSync(secret, 'secret')
  try { symlinkSync(secret, join(dir, 'link.replay')) } catch { t.skip('creating links is not allowed on this system'); return }
  assert.throws(() => readFileSafe({ dir, extensions: ['.replay'] }, 'link.replay', 1000))
  assert.ok(!listFiles({ dir, extensions: ['.replay'] }).some((f) => f.name === 'link.replay'))
})
