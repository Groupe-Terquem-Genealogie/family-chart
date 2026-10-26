import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Bundle genea_visu : code métier (genea/src) + family-chart modifié + d3, en un seul IIFE
// copié dans intranet.root/genea_visu/ par genea/deploy.mjs.
export default defineConfig({
  root: resolve(__dirname, '..'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'GeneaVisu',
      formats: ['iife'],
      fileName: () => 'genea-visu.js',
    },
    rollupOptions: { output: { assetFileNames: 'genea-visu.[ext]' } },
  },
  test: {
    environment: 'jsdom',
    include: ['genea/tests/**/*.test.ts'],
    setupFiles: [resolve(__dirname, 'tests/setup.ts')],
  },
})
