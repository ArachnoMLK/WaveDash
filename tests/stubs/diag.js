// Mode diagnostic (WAVEDASH_TEST_DIAG=1) : 3 s après les tests d'un fichier, liste ce qui l'empêche de se fermer
// (connexions, minuteries…). La minuterie est « unref » : elle ne retient pas le processus elle-même.
require('node:test').after(() => {
  setTimeout(() => {
    const handles = (process._getActiveHandles?.() ?? []).map((h) => {
      const n = h?.constructor?.name ?? typeof h
      if (n === 'Socket') return `Socket ${h.remoteAddress ?? ''}:${h.remotePort ?? ''} local ${h.localPort ?? ''} détruit=${h.destroyed}`
      if (n === 'Server') return `Server ${JSON.stringify(h.address?.())}`
      if (n === 'Timeout') return `Timeout ${h._idleTimeout} ms : ${String(h._onTimeout).replace(/\s+/g, ' ').slice(0, 160)}`
      return n
    })
    const reqs = (process._getActiveRequests?.() ?? []).map((r) => r?.constructor?.name)
    console.error(`[diag] ${require('node:path').basename(process.argv[1] ?? '')} encore ouvert : ${JSON.stringify(process.getActiveResourcesInfo())} | ${JSON.stringify(handles)} | requêtes ${JSON.stringify(reqs)}`)
  }, 3000).unref()
})
