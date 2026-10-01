import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Emits the PREBUILT dist/ the platform serves: relative asset URLs, everything bundled, no source maps.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "../dist", emptyOutDir: true, sourcemap: false, assetsInlineLimit: 8192, modulePreload: { polyfill: false } }
});
