// Example plugin: reads a folder chosen by the user ("folder" permission).
// `host.files.list()` only returns the files of the chosen folder (no subfolders, no symbolic links).
var plugin = {
  // Optional: validates the input and gives the account a display name.
  resolve: async function (ctx) {
    const parts = ctx.inputs.folder.split(/[\\/]/).filter(Boolean)
    return { externalId: ctx.inputs.folder, displayName: parts[parts.length - 1] || ctx.inputs.folder }
  },

  // Required: returns the current metrics (keys declared in manifest.json), and optionally items.
  refresh: async function (ctx) {
    const files = host.files.list()                       // [{ name, size, mtime }] sorted newest to oldest
    const total = files.reduce(function (sum, f) { return sum + f.size }, 0)
    host.log(files.length + ' files found')
    return {
      metrics: { files: files.length, size_mb: total / (1024 * 1024) },
      items: files.slice(0, 50).map(function (f) {
        return { id: f.name, title: f.name, ts: f.mtime, fields: { size_kb: Math.round(f.size / 1024) } }
      })
    }
  }
}
