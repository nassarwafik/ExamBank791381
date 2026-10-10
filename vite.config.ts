import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Content hashes in emitted file names use base-36 (0-9a-z, 8 characters ≈ 41 bits) instead of base-64. The initial bundle's
      // lazy-import tables carry ~250 hashed names; base-64 ones are near-random bytes that gzip cannot shrink and that re-roll whenever
      // a lazy chunk changes, which moved the measured initial graph by ±15 bytes around a budget it met by 8. Code is unchanged.
      output: { hashCharacters: 'base36' },
    },
  },
})
