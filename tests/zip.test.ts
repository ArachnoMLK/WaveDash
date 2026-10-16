import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { crc32, readZip } from '../src/main/plugins/zip'

interface Entry { name: string; data: Buffer; method?: 0 | 8; flags?: number; crc?: number; usize?: number }
/** Petit écrivain ZIP pour fabriquer des archives normales et piégées. */
function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const method = e.method ?? 8, body = method === 8 ? deflateRawSync(e.data) : e.data, name = Buffer.from(e.name)
    const crc = e.crc ?? crc32(e.data), usize = e.usize ?? e.data.length
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(e.flags ?? 0, 6); lh.writeUInt16LE(method, 8)
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(usize, 22); lh.writeUInt16LE(name.length, 26)
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(e.flags ?? 0, 8); ch.writeUInt16LE(method, 10)
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(usize, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42)
    locals.push(lh, name, body); central.push(ch, name); offset += 30 + name.length + body.length
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}
const all = (): boolean => true
const fails = (buf: Buffer, msg: string, limits = {}): void => assert.throws(() => readZip(buf, all, limits), (e: Error) => e.message === msg, msg)

test('archive normale : contenu identique, compressé ou non', () => {
  const m = readZip(zip([{ name: 'manifest.json', data: Buffer.from('{"a":1}') }, { name: 'main.js', data: Buffer.from('var x'), method: 0 }]), all)
  assert.equal(m.get('manifest.json')!.toString(), '{"a":1}')
  assert.equal(m.get('main.js')!.toString(), 'var x')
  assert.deepEqual([...readZip(zip([{ name: 'a', data: Buffer.from('1') }, { name: 'b', data: Buffer.from('2') }]), (n) => n === 'b').keys()], ['b'])
})

test('archives piégées refusées', () => {
  fails(zip([{ name: '../evil.js', data: Buffer.from('x') }]), 'unsafe_name')
  fails(zip([{ name: '/abs.js', data: Buffer.from('x') }]), 'unsafe_name')
  fails(zip([{ name: 'a\\b.js', data: Buffer.from('x') }]), 'unsafe_name')
  fails(zip([{ name: 'a.js', data: Buffer.from('x') }, { name: 'a.js', data: Buffer.from('y') }]), 'duplicate_entry')
  fails(zip([{ name: 'a.js', data: Buffer.from('x'), flags: 1 }]), 'encrypted')
  fails(zip([{ name: 'a.js', data: Buffer.from('x'), crc: 1234 }]), 'corrupt')
  fails(zip([{ name: 'a.js', data: Buffer.from('xyz'), usize: 1 }]), 'corrupt')
  fails(zip([{ name: 'a.js', data: Buffer.from('x'), method: 0 }]).subarray(5), 'corrupt')
  // Bombe : 50 Mo de zéros annoncés comme 10 octets, et entrée trop grosse annoncée honnêtement.
  fails(zip([{ name: 'bomb', data: Buffer.alloc(50 * 1024 * 1024), usize: 10 }]), 'entry_too_large')
  fails(zip([{ name: 'big', data: Buffer.alloc(2 * 1024 * 1024) }]), 'entry_too_large')
  fails(zip([...Array(101)].map((_, i) => ({ name: `f${i}`, data: Buffer.from('x') }))), 'too_many_entries')
  fails(Buffer.alloc(6 * 1024 * 1024), 'archive_too_large')
  fails(Buffer.from('pas un zip du tout, juste du texte assez long'), 'not_a_zip')
})
