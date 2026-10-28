// Player bank: export and import of .wdbank files, the exchange format of the test phase.
// A .wdbank file is gzipped JSON holding only extracted records (never replay files); every row is validated again on import.
import { readFileSync, statSync, writeFileSync } from 'fs'
import { basename } from 'path'
import { gunzipSync, gzipSync } from 'zlib'
import { sanitizePlayerRecord } from '@shared/plugin'
import * as db from './db'

export const BANK_FORMAT = 'wdbank'
const MAX_FILE = 64 * 1024 * 1024, MAX_JSON = 512 * 1024 * 1024, SOURCE_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/

/** Writes every local record (what this PC read itself) to a .wdbank file. Imported records are not re-exported. */
export function exportBank(path: string, appVersion: string): { rows: number } {
  const sources = db.bankRecordsOf('local')
  const rows = sources.reduce((n, s) => n + s.rows.length, 0)
  writeFileSync(path, gzipSync(JSON.stringify({ format: BANK_FORMAT, version: 1, app: appVersion, exportedAt: Date.now(), sources })))
  return { rows }
}

export interface BankImportResult { file: string; added: number; known: number; rejected: number; error?: string }

/** Reads a .wdbank file and merges its records; a game already known is not duplicated. */
export function importBank(path: string): BankImportResult {
  const file = basename(path), out: BankImportResult = { file, added: 0, known: 0, rejected: 0 }
  try {
    if (statSync(path).size > MAX_FILE) return { ...out, error: 'too_large' }
    const json = gunzipSync(readFileSync(path), { maxOutputLength: MAX_JSON }).toString('utf8')
    const doc = JSON.parse(json) as { format?: unknown; version?: unknown; sources?: unknown }
    if (doc.format !== BANK_FORMAT || doc.version !== 1 || !Array.isArray(doc.sources)) return { ...out, error: 'format' }
    for (const s of doc.sources as { source?: unknown; rows?: unknown }[]) {
      if (!s || typeof s.source !== 'string' || !SOURCE_RE.test(s.source) || !Array.isArray(s.rows)) continue
      const rows = []
      for (const raw of s.rows) { const r = sanitizePlayerRecord(raw); if (r) rows.push(r); else out.rejected++ }
      const added = db.savePlayerRecords(s.source, rows, `import:${file.slice(0, 80)}`)
      out.added += added; out.known += rows.length - added
    }
    return out
  } catch {
    return { ...out, error: 'format' }
  }
}
