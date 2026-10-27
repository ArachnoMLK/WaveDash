#!/usr/bin/env node
// Packs a plugin folder into a .wdsh file (ZIP archive): node tools/wdsh-pack.mjs <folder> [output.wdsh]
// The folder must contain manifest.json and the script named by "entry" (main.js by default). No dependencies.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import zlib from 'node:zlib'

const { deflateRawSync } = zlib
// zlib.crc32 only exists in recent Node versions: fall back to a home-made computation for older ones.
const TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = zlib.crc32 ?? ((buf) => { let c = 0xffffffff; for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 })

const dir = resolve(process.argv[2] ?? '')
if (!process.argv[2]) { console.error('Usage: node tools/wdsh-pack.mjs <folder> [output.wdsh]'); process.exit(1) }

const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
const entry = manifest.entry ?? 'main.js'
const out = process.argv[3] ?? `${manifest.id}-${manifest.version}.wdsh`
const files = [['manifest.json', readFileSync(join(dir, 'manifest.json'))], [entry, readFileSync(join(dir, entry))]]

// Minimal ZIP writing: local headers, central directory, end of archive. Fixed date for reproducible archives.
const DOS_TIME = 0, DOS_DATE = (1 << 5) | 1                                   // 1980-01-01
const parts = [], central = []
let offset = 0
for (const [name, data] of files) {
  const nameBuf = Buffer.from(name), comp = deflateRawSync(data), crc = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8)
  local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26)
  parts.push(local, nameBuf, comp)
  const c = Buffer.alloc(46)
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10)
  c.writeUInt16LE(DOS_TIME, 12); c.writeUInt16LE(DOS_DATE, 14); c.writeUInt32LE(crc, 16)
  c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42)
  central.push(c, nameBuf)
  offset += 30 + nameBuf.length + comp.length
}
const cd = Buffer.concat(central)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
writeFileSync(out, Buffer.concat([...parts, cd, end]))
console.log(`${out} created (${files.length} files: ${files.map(([n]) => n).join(', ')})`)
