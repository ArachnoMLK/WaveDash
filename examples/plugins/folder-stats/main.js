// Plugin d'exemple : lit un dossier choisi par l'utilisateur (permission « folder »).
// `host.files.list()` ne renvoie que les fichiers du dossier choisi (pas de sous-dossiers, pas de liens symboliques).
var plugin = {
  // Facultatif : valide la saisie et donne un nom d'affichage au compte.
  resolve: async function (ctx) {
    const parts = ctx.inputs.folder.split(/[\\/]/).filter(Boolean)
    return { externalId: ctx.inputs.folder, displayName: parts[parts.length - 1] || ctx.inputs.folder }
  },

  // Obligatoire : renvoie les métriques actuelles (clés déclarées dans manifest.json), et éventuellement des éléments.
  refresh: async function (ctx) {
    const files = host.files.list()                       // [{ name, size, mtime }] triés du plus récent au plus ancien
    const total = files.reduce(function (sum, f) { return sum + f.size }, 0)
    host.log(files.length + ' fichiers trouvés')
    return {
      metrics: { files: files.length, size_mb: total / (1024 * 1024) },
      items: files.slice(0, 50).map(function (f) {
        return { id: f.name, title: f.name, ts: f.mtime, fields: { size_kb: Math.round(f.size / 1024) } }
      })
    }
  }
}
