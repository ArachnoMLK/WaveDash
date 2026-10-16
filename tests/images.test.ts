import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sanitizeDetail, validateManifest } from '@shared/plugin'
import * as db from '../src/main/db'
import { pluginImage, updatePluginAccount } from '../src/main/plugins/manager'
import { tempDir } from './helpers'

const base = { wdsh: 1, id: 'test.images', name: 'Images', version: '1.0.0', metrics: [{ key: 'n', label: 'N' }] }
const imgInput = { key: 'thumbs', label: 'Vignettes', type: 'images', required: false }

test('permission images : un seul dossier, déclaré', () => {
  const ok = validateManifest({ ...base, permissions: { images: true }, inputs: [imgInput] })
  assert.ok(ok.ok && ok.manifest.permissions.images)
  const e = (o: Record<string, unknown>): string | undefined => { const v = validateManifest({ ...base, ...o }); return v.ok ? undefined : v.error }
  assert.equal(e({ inputs: [imgInput] }), 'images_permission')
  assert.equal(e({ permissions: { images: true } }), 'images_input')
  assert.equal(e({ permissions: { images: 'oui' }, inputs: [imgInput] }), 'permissions.images')
})

test('détail : nom d’image simple uniquement', () => {
  assert.deepEqual(sanitizeDetail({ image: { file: 'BrawlhavenSmall.jpg', caption: 'Small Brawlhaven' } })?.image, { file: 'BrawlhavenSmall.jpg', caption: 'Small Brawlhaven' })
  for (const f of ['../x.jpg', 'C:'+String.fromCharCode(92)+'x.jpg', 'a/b.png', 'x.exe', 'x.svg', '']) assert.equal(sanitizeDetail({ image: { file: f } }), undefined, f)
})

test('image d’un compte : lue dans son dossier, rien d’autre', () => {
  db.initDb()
  const dir = tempDir(), other = tempDir()
  writeFileSync(join(dir, 'Map.jpg'), Buffer.from([0xff, 0xd8, 0xff])); writeFileSync(join(dir, 'notes.txt'), 'x'); writeFileSync(join(other, 'secret.jpg'), 'x')
  const mf = { ...base, permissions: { images: true }, inputs: [imgInput] }
  db.upsertPlugin('test.images', JSON.stringify(validateManifest(mf).ok ? (validateManifest(mf) as { manifest: unknown }).manifest : {}), 'var plugin = {}', 'h')
  const id = db.insertPluginAccount('test.images', 'Compte', 'x', {})
  assert.equal(pluginImage(id, 'Map.jpg'), null, 'sans dossier choisi')
  assert.deepEqual(updatePluginAccount(id, { thumbs: dir }), { ok: true })
  assert.equal(pluginImage(id, 'Map.jpg'), 'data:image/jpeg;base64,/9j/')
  for (const f of ['notes.txt', '../' + other.split(/[\/]/).pop() + '/secret.jpg', 'absent.jpg']) assert.equal(pluginImage(id, f), null, f)
  assert.equal(updatePluginAccount(id, { thumbs: join(dir, 'inexistant') }).ok, false)
})
