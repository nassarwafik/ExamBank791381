import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Phase L.6a — in the deployed app a learning module body comes ONLY from the API (src/learning/content/moduleBodySource.ts →
  // moduleBodySource.server.ts). Under Vitest that one module resolves to the authored-content loader instead, so suites that read
  // the real book need no server; the API transport is tested on its own. Never applies to `vite build`.
  resolve: process.env.VITEST
    ? { alias: [{ find: /^.*\/content\/moduleBodySource$/, replacement: fileURLToPath(new URL('./src/learning/content/moduleBodySource.bundled.ts', import.meta.url)) }] }
    : undefined,
  build: {
    rollupOptions: {
      // Content hashes in emitted file names use base-36 (0-9a-z, 8 characters ≈ 41 bits) instead of base-64. The initial bundle's
      // lazy-import tables carry ~250 hashed names; base-64 ones are near-random bytes that gzip cannot shrink and that re-roll whenever
      // a lazy chunk changes, which moved the measured initial graph by ±15 bytes around a budget it met by 8. Code is unchanged.
      output: { hashCharacters: 'base36' },
    },
  },
})
