import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  // Core and Main run as separate processes but share electron-vite's Node build, so each has its own entry.
  main: {
    build: {
      outDir: resolve(__dirname, 'out'),
      emptyOutDir: false,
      rollupOptions: {
        input: {
          'main/index': resolve(__dirname, 'src/main/index.ts'),
          'core/index': resolve(__dirname, 'src/core/index.ts'),
        },
      },
    },
  },
  // The sandboxed CommonJS preload cannot use ESM output.
  preload: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/main/preload.ts'),
        output: { format: 'cjs' },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
  },
})
