// Lecteur ZIP minimal et prudent : lit uniquement en mémoire, n'extrait jamais sur le disque.
// Protections : taille d'archive et d'entrée plafonnées (anti « zip bomb »), noms suspects refusés, CRC vérifié.
import { inflateRawSync } from 'zlib'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()

export function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export class ZipError extends Error {}
export interface ZipLimits { maxArchive: number; maxEntries: number; maxEntryBytes: number }
const DEFAULTS: ZipLimits = { maxArchive: 5 * 1024 * 1024, maxEntries: 100, maxEntryBytes: 1024 * 1024 }

/** Retourne le contenu décompressé des entrées pour lesquelles `wanted(nom)` est vrai. */
export function readZip(buf: Buffer, wanted: (name: string) => boolean, limits: Partial<ZipLimits> = {}): Map<string, Buffer> {
  const L = { ...DEFAULTS, ...limits }
  if (buf.length > L.maxArchive) throw new ZipError('archive_too_large')
  if (buf.length < 22) throw new ZipError('not_a_zip')

  // Fin de l'archive (EOCD), cherchée à reculons.
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new ZipError('not_a_zip')
  const count = buf.readUInt16LE(eocd + 10), cdOffset = buf.readUInt32LE(eocd + 16)
  if (count > L.maxEntries) throw new ZipError('too_many_entries')
  if (count === 0xffff || cdOffset === 0xffffffff) throw new ZipError('zip64_unsupported')

  const out = new Map<string, Buffer>()
  let o = cdOffset
  for (let n = 0; n < count; n++) {
    if (o + 46 > buf.length || buf.readUInt32LE(o) !== 0x02014b50) throw new ZipError('corrupt')
    const flags = buf.readUInt16LE(o + 8), method = buf.readUInt16LE(o + 10), crc = buf.readUInt32LE(o + 16)
    const csize = buf.readUInt32LE(o + 20), usize = buf.readUInt32LE(o + 24)
    const nlen = buf.readUInt16LE(o + 28), elen = buf.readUInt16LE(o + 30), clen = buf.readUInt16LE(o + 32), lho = buf.readUInt32LE(o + 42)
    if (o + 46 + nlen > buf.length) throw new ZipError('corrupt')
    const name = buf.toString('utf8', o + 46, o + 46 + nlen)
    o += 46 + nlen + elen + clen

    // Noms refusés : chemins absolus, remontées de dossier, antislash, octet nul.
    if (name.includes('\0') || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..')) throw new ZipError('unsafe_name')
    if (name.endsWith('/') || !wanted(name)) continue
    if (out.has(name)) throw new ZipError('duplicate_entry')
    if (flags & 1) throw new ZipError('encrypted')
    if (usize > L.maxEntryBytes) throw new ZipError('entry_too_large')
    if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== 0x04034b50) throw new ZipError('corrupt')
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28)
    if (start + csize > buf.length) throw new ZipError('corrupt')
    const raw = buf.subarray(start, start + csize)
    let data: Buffer
    if (method === 0) data = Buffer.from(raw)
    else if (method === 8) {
      try { data = inflateRawSync(raw, { maxOutputLength: L.maxEntryBytes + 1 }) } catch { throw new ZipError('entry_too_large') }
    } else throw new ZipError('unsupported_method')
    if (data.length !== usize || crc32(data) !== crc) throw new ZipError('corrupt')
    out.set(name, data)
  }
  return out
}
