import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync } from 'fs'

const root = resolve(__dirname, '..')
const web = (f: string) => resolve(__dirname, 'web', f)
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))

// The same renderer as desktop, plus electron/main.ts and preload.ts running
// in the page: Electron and Node swapped for android/web/ at build time.
export default defineConfig({
  root,
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __dirname: '"/"' },
  plugins: [react(), { name: 'android-entry', transformIndexHtml: { order: 'pre', handler: (h) => h.replace('/src/main.tsx', '/android/web/boot.ts') } }],
  resolve: {
    alias: [
      { find: /^electron(-updater)?$/, replacement: web('electron.ts') },
      { find: /^fs\/promises$/, replacement: web('fsPromises.ts') },
      { find: /^fs$/, replacement: web('fs.ts') },
      { find: /^path$/, replacement: web('path.ts') },
      { find: /^child_process$/, replacement: web('stubs.ts') },
      { find: /^pdfkit$/, replacement: web('pdfkit.ts') },
    ],
  },
  esbuild: { legalComments: 'inline' },
  build: {
    outDir: resolve(__dirname, 'app/src/main/assets/web'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 8000,
  },
})
