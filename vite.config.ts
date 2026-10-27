/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import { contentSecurityPolicyPlugin } from './scripts/content-security-policy.ts'

// https://vite.dev/config/
export default defineConfig({
  // D2 — the built index.html carries the application's Content-Security-Policy (scripts/content-security-policy.ts).
  plugins: [react(), contentSecurityPolicyPlugin()],
  // Phase L.6a — in the deployed app a learning module body comes ONLY from the API (src/learning/content/moduleBodySource.ts →
  // moduleBodySource.server.ts). Under Vitest that one module resolves to the authored-content loader instead, so suites that read
  // the real book need no server; the API transport is tested on its own. Never applies to `vite build`.
  resolve: process.env.VITEST
    ? { alias: [{ find: /^.*\/content\/moduleBodySource$/, replacement: fileURLToPath(new URL('./src/learning/content/moduleBodySource.bundled.ts', import.meta.url)) }] }
    : undefined,
  // QA2 4c — agent sessions keep scratch git worktrees under .claude/worktrees (full copies of the repository); the root suite must
  // never collect their tests as a second, stale copy of this one. Everything else keeps Vitest's defaults.
  test: {
    exclude: [...configDefaults.exclude, '**/.claude/worktrees/**'],
    // happy-dom 21 stopped loading iframe documents by default ("Iframe page loading is disabled"); the print reports / login cards
    // (a same-origin about:blank iframe) and the SmartSim bridge tests (an iframe's contentWindow) rely on the version 20 behaviour.
    environmentOptions: { happyDOM: { settings: { enableIframePageLoading: true } } },
  },
  build: {
    rollupOptions: {
      // Content hashes in emitted file names use base-36 (0-9a-z, 8 characters ≈ 41 bits) instead of base-64. The initial bundle's
      // lazy-import tables carry ~250 hashed names; base-64 ones are near-random bytes that gzip cannot shrink and that re-roll whenever
      // a lazy chunk changes, which moved the measured initial graph by ±15 bytes around a budget it met by 8. Code is unchanged.
      output: { hashCharacters: 'base36' },
    },
  },
})
