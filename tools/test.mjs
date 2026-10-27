// Automated tests: each tests/*.test.ts is compiled by esbuild, then run by Electron in Node mode
// (same Node version as the app, and better-sqlite3 built for Electron loads). Usage: npm test [filter]
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..'), outDir = process.env.WAVEDASH_TEST_OUT ?? join(root, 'out', 'tests')
const filter = process.argv[2] ?? ''
const diag = process.env.WAVEDASH_TEST_DIAG === '1'
const files = readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.ts') && f.includes(filter))
rmSync(outDir, { recursive: true, force: true })
await build({
  entryPoints: files.map((f) => join(root, 'tests', f)), outdir: outDir, bundle: true, platform: 'node', format: 'cjs', target: 'node20',
  outExtension: { '.js': '.cjs' }, sourcemap: 'inline', logLevel: 'warning',
  alias: { '@shared': join(root, 'src', 'shared'), electron: join(root, 'tests', 'stubs', 'electron.ts') },
  external: ['better-sqlite3', 'quickjs-emscripten'],
  // Diagnostic: each file reports what is still open after its tests (see tests/stubs/diag.js).
  banner: diag ? { js: readFileSync(join(root, 'tests', 'stubs', 'diag.js'), 'utf8') } : undefined
})
const electron = join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
// One file at a time: with the 12 files in parallel, the Node 20 test runner (Electron's) sometimes froze
// on Windows (4 runs out of 30 on the owner's PC, 0 out of 20 file by file). WAVEDASH_TEST_CONC=n to change it.
// WAVEDASH_TEST_DIAG=1: without forced exit, each file lists what is still open after its tests (tests/stubs/diag.js).
// A stuck test fails after 3 min instead of hanging everything (e.g. on GitHub); a file whose tests are done closes
// even if a connection or a timer is still open (seen intermittently on GitHub). On GitHub, failures become annotations.
const reporters = process.env.GITHUB_ACTIONS
  ? ['--test-reporter=spec', '--test-reporter-destination=stdout', `--test-reporter=${pathToFileURL(join(root, 'tools', 'gh-reporter.mjs')).href}`, '--test-reporter-destination=stdout']
  : []
const r = spawnSync(electron, ['--test', '--test-timeout=180000', `--test-concurrency=${process.env.WAVEDASH_TEST_CONC ?? 1}`, ...(diag ? [] : ['--test-force-exit']), ...reporters, ...files.map((f) => join(outDir, f.replace(/\.ts$/, '.cjs')))],
  { stdio: 'inherit', cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WAVEDASH_ROOT: root } })
process.exit(r.status ?? 1)
