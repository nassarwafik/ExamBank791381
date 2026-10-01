# Counter — the reference SmartSim v1 package

The smallest complete simulator: `manifest.json` + a single-file `dist/index.html` that speaks SmartSimBridgeV1 directly
(READY → INIT → STATE_CHANGED on every click; RESTORE / RESET / SET_DISABLED honoured). It is the package used by the Phase
16B-A vertical proof (`src/smartsim/counterE2E.16b-a.test.tsx`).

Build the archive (any ZIP tool works; the platform reads standard ZIP):

```sh
cd examples/smartsim/counter && zip -r ../counter.smartsim manifest.json dist
```

Upload it from a simulation question («رفع محاكاة»), or pick it later from the Simulation Library. Bump `packageVersion`
before re-uploading changed content — the same version with different bytes is refused by design.
