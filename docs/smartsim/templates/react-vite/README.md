# Template B — React + TypeScript + Vite simulator

The platform NEVER runs `npm`, `tsc` or `vite`. You build locally and upload the **prebuilt `dist/`**; `source/` may travel in
the archive for reference but is ignored (never stored, never served).

```sh
cd source
npm install
npm run build            # → ../dist  (see vite.config.ts: build.outDir = "../dist", base = "./")
cd ..
zip -r ../my-react-simulator.smartsim manifest.json dist source
```

Package layout after the build:

```
manifest.json
dist/index.html          ← entry (relative asset URLs: base "./")
dist/assets/*.js|*.css
source/…                 ← optional, ignored
```

Rules the validator enforces: relative asset paths only (`base: "./"`), no external scripts / styles / fonts / images
(bundle everything; fonts as `.woff2` inside dist; images inline or inside dist), no `fetch` / `XMLHttpRequest` / `WebSocket`
/ `EventSource` (the sandbox has no network anyway), no source maps (`build.sourcemap: false`), no `.wasm`.
Bump `packageVersion` in `manifest.json` for every changed build.
