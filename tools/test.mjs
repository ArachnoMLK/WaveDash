// Tests automatiques : chaque tests/*.test.ts est compilé par esbuild, puis exécuté par Electron en mode Node
// (même version de Node que l'appli, et better-sqlite3 compilé pour Electron se charge). Usage : npm test [filtre]
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
  // Diagnostic : chaque fichier signale ce qui reste ouvert après ses tests (voir tests/stubs/diag.js).
  banner: diag ? { js: readFileSync(join(root, 'tests', 'stubs', 'diag.js'), 'utf8') } : undefined
})
const electron = join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
// Un fichier à la fois : avec les 12 fichiers en parallèle, le lanceur de tests de Node 20 (celui d'Electron) se figeait parfois
// sous Windows (4 suites sur 30 sur le PC du propriétaire, 0 sur 20 fichier par fichier). WAVEDASH_TEST_CONC=n pour changer.
// WAVEDASH_TEST_DIAG=1 : sans sortie forcée, chaque fichier liste ce qui reste ouvert après ses tests (tests/stubs/diag.js).
// Un test bloqué échoue au bout de 3 min au lieu de suspendre tout (ex. sur GitHub) ; un fichier dont les tests sont finis se ferme
// même s'il reste une connexion ou une minuterie ouverte (vu par intermittence sur GitHub). Sur GitHub, les échecs deviennent des annotations.
const reporters = process.env.GITHUB_ACTIONS
  ? ['--test-reporter=spec', '--test-reporter-destination=stdout', `--test-reporter=${pathToFileURL(join(root, 'tools', 'gh-reporter.mjs')).href}`, '--test-reporter-destination=stdout']
  : []
const r = spawnSync(electron, ['--test', '--test-timeout=180000', `--test-concurrency=${process.env.WAVEDASH_TEST_CONC ?? 1}`, ...(diag ? [] : ['--test-force-exit']), ...reporters, ...files.map((f) => join(outDir, f.replace(/\.ts$/, '.cjs')))],
  { stdio: 'inherit', cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WAVEDASH_ROOT: root } })
process.exit(r.status ?? 1)
