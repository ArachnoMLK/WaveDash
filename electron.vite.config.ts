import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Trois cibles : processus principal, preload (pont sécurisé) et interface React.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } },
    // Deux points d'entrée : l'appli, et le processus séparé qui exécute les plugins (out/main/pluginHost.js).
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts'), pluginHost: resolve('src/main/plugins/pluginHost.ts') } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } }
  }
})
