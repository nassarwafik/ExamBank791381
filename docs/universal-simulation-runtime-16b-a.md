# Phase 16B-A — Universal Simulation Package Runtime

Secure `.smartsim` / ZIP upload, sandboxed runtime, immutable versioning, the SmartSimBridgeV1 state bridge and the
Simulation Library foundation. Baseline `6bb3b97d0456b632c2406392d13f3eb90e5bd419` (PR #229 merged, run #861 green).

## 1. Two identities, never confused

| identity | owner | where it lives | example |
|---|---|---|---|
| **runtime identity** — the question TYPE | platform code (16A catalog) | `presentationType: "simulation"`, `questionTypeVersion: 1` → `simulation@1` | one production row in `src/questionTypeCatalog.ts` |
| **package identity** — the teacher's upload | the teacher | `question.simulation = { packageId, packageVersion, packageHash, runtimeVersion, entry?, title?, scenario?, publicConfig? }` | `counter-sim@1` + `sha256:…` |

A question persists the **exact** reference. `"latest"` is not a valid version, hash or resolution rule anywhere (client
validator, shared server validator, runtime route, availability gate, package store). The production catalog now has **16**
types; `simulation` is `interactive`, `manual` grading, `compoundPart: false` (V1 decision, §9), `responseKinds: ["simulation"]`.

## 2. Package format (SmartSim v1)

`manifest.json` at the root + `dist/` (the only executable set). `source/`, `README.md`, thumbnails are ignored
(never stored, never served). Single-file HTML (inline style/script) and prebuilt React/Vite dist are both supported; the
platform never runs `npm`, `tsc`, `vite` or any Node code from a package (architecture guard). Manifest contract:
`src/smartsimManifest.ts` (`validateSmartSimManifest`, compiled into the shared server build), JSON Schema in
`docs/smartsim/manifest.schema.json`. Entry must be a safe relative path inside `dist/`; `../`, absolute, drive, UNC,
backslash, NUL and every URL scheme (`http(s)`, `file`, `data`, `javascript`, `blob`) are refused (`ENTRY_UNSAFE`).

## 3. Server validation pipeline (`api/src/lib/smartsim/`)

`zip-reader.js` — dependency-free central-directory parser; every member inflated through `zlib.inflateRawSync` with
`maxOutputLength` (a size lie or a bomb is refused before memory is spent); CRC verified; ZIP64 / encryption / spanned
archives refused. `package-validator.js` — in order: archive size → ZIP magic → directory parse → per-entry safety
(traversal / absolute / UNC / NUL / backslash → `PATH_TRAVERSAL`; symlink mode bits → `SYMLINK_NOT_ALLOWED`; duplicates incl.
`./` prefixes and case collisions → `DUPLICATE_PATH`; `.zip` / `.smartsim` members → `NESTED_ARCHIVE`; file-type
allow-list for `dist/**` → `UNSUPPORTED_FILE_TYPE`; declared sizes → `FILE_TOO_LARGE` / `PACKAGE_TOO_LARGE`; per-member ratio →
`ZIP_BOMB`; count → `TOO_MANY_FILES`) → bounded inflate of the runtime set → overall ratio → `manifest.json`
(`MANIFEST_MISSING` / `MANIFEST_INVALID` + the shared manifest codes) → entry (`ENTRY_OUTSIDE_DIST` / `ENTRY_MISSING` /
`ENTRY_NOT_HTML`) → external-resource scan of HTML / JS / CSS / SVG (`EXTERNAL_RESOURCE` with the offending path: external
`script/link/img/iframe/base/...` URLs, `//cdn`, CSS `url(https://…)`/`@import`, `fetch(`, `XMLHttpRequest`, `WebSocket`,
`EventSource`, `sendBeacon`, `importScripts`, service workers). `SOURCE_IGNORED` is a warning. The hash is
`sha256:` + SHA-256 of the exact uploaded bytes (never client-supplied). Limits: archive 15 MB, unpacked 30 MB, file
10 MB, 500 files, ratio 100×, manifest 64 KB. `mime-map.js` is the explicit allow-list
(`.html .htm .css .js .mjs .json .svg .png .jpg .jpeg .gif .webp .woff2 .txt`) and the strict served MIME.

## 4. Storage (`package-store.js`) — immutable, content-addressed, teacher-owned

```
simulators/packages/<sha256 hex>/metadata.json      validated record (identity, entry, files, sizes, capabilities)
simulators/packages/<sha256 hex>/package.smartsim   exact uploaded bytes (audit; never served)
simulators/packages/<sha256 hex>/dist/<path>        the runtime set — the only blobs the runtime route serves
simulators/owners/<ownerHash>/<packageId>/<version>.json   the owner's (id, version) → hash binding
```

Dedicated prefix (not `raw/`, not the import pipeline, never inside exam JSON). `ownerHash = sha256("smartsim-owner:" +
auth.sub)[0..32]` — never echoed. Rules proven by tests: same id / version / identical bytes → `exists` (no second write);
same id / version / different bytes → **409 `VERSION_HASH_CONFLICT`** («هذه النسخة موجودة بمحتوى مختلف. أنشئ إصدارًا جديدًا
للمحاكي، مثل v2.»), stored package untouched; V1 stays byte-for-byte retrievable after V2; Teacher B cannot list, read
versions of, or conflict with Teacher A's identity (B's identical identity is B's own record; identical bytes are one
hash-addressed package for everyone). Metadata and owner records are create-only (`ifNoneMatch: "*"`); a lost race is
re-read and reconciled. There is **no delete** (immutable retention; §12).

## 5. Endpoints (`api/src/functions/simulators.js`)

| route | auth | notes |
|---|---|---|
| `POST /api/simulators/upload` | builder | raw binary body, `x-file-name` (`.smartsim` / `.zip` only), content-length precheck (413), empty body 400, validation failure 400 `{ report }`, conflict 409, created 201 / exists 200 `{ package, report }` |
| `GET /api/simulators` | builder | the caller's packages (never the owner hash or sub) |
| `GET /api/simulators/{packageId}` | builder | the caller's versions (404 for another owner) |
| `GET /api/simulators/runtime/{packageId}/{packageVersion}/{hash}/{*assetPath}` | **public by design** | see below |

The runtime route validates the identity **before** any storage access: id pattern, positive integer version (`latest` →
404), 64-hex hash, safe decoded asset path (no `..`, no `%2F` tricks, no trailing slash / listing). The stored record must
match id **and** version for that hash (V1's hash under V2's version → 404). `metadata.json`, `package.smartsim` and
anything outside `dist/` are never served. Responses (`runtime-headers.js`, revised by the Independent Review Fix, §15):
strict MIME; `Cache-Control: no-cache` for executable documents (HTML / SVG) and `public, max-age=31536000, immutable` for
content-addressed sub-resources; `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer`;
`Cross-Origin-Resource-Policy: cross-origin`; `Access-Control-Allow-Origin: *` (never with credentials); and

```
Content-Security-Policy: sandbox allow-scripts; default-src 'none'; script-src <origin><package-prefix> 'unsafe-inline';
  style-src <prefix> 'unsafe-inline'; img-src <prefix> data:; font-src <prefix>; media-src <prefix>; connect-src 'none';
  frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'
```

`<prefix>` is the exact `…/runtime/<id>/<version>/<sha256>/` path — never `'self'`. 404 responses carry
`Cache-Control: no-store`, `nosniff`, `no-referrer` and `Content-Security-Policy: sandbox; default-src 'none';
frame-ancestors 'none'`. The main application CSP / `staticwebapp.config.json` / `index.html` are untouched (test-pinned). Route inventory: `simulatorRuntime` is classified
`PUBLIC_BY_DESIGN` with its rationale (content-addressed capability, no enumeration); the three others answer 401 anonymously.
Student availability comes from the published exam's exact reference — no teacher ownership check at student runtime.

## 6. Sandbox host (`src/smartsim/SimulationSandboxHost.tsx`) — the ONE host

Used by students (`StudentQuestionCard` → lazy `SimulationResponse`), by the teacher preview (`ExamPreview` renders the same
card) and by the editor's «معاينة المحاكاة» (`mode="preview"` adds a state inspector **outside** the frame). Contract:

* `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" title="محاكاة تفاعلية…">` — nothing else in `sandbox`:
  no `allow-same-origin` (opaque origin → no parent DOM, cookies, `localStorage`, token), no popups / top navigation /
  forms / modals / downloads / pointer lock / presentation / storage access. No `srcdoc`.
* `src` is always `runtimeAssetUrl(validatedReference, entry)` on the same origin; a malformed reference renders the
  `PACKAGE_REFERENCE_INVALID` panel and **no iframe**.
* Message policy: `event.source === iframe.contentWindow` **and** `instanceId` match (READY may carry `null`) **and**
  `protocolVersion === 1` **and** an allowed sim→host type **and** a well-formed payload; everything else is ignored.
  `STATE_CHANGED` goes through `normalizeSimulationState` (§7); `STATE_TOO_LARGE` shows a panel and keeps the last valid
  state; other malformed states are dropped silently.
* READY handshake with timeout (15 s; `READY_TIMEOUT` panel + «إعادة المحاولة» remounts the frame with a new instance id).
  `INIT` payload is exactly `{ protocolVersion, instanceId, scenario, publicConfig, savedState, disabled }` — no student
  identity, no exam data, no other answers, no credentials (test-pinned by key set).
* `disabled` → `SET_DISABLED`; an external saved-state change (hydration / resume) → `RESTORE_STATE`; `REQUEST_RESET` →
  `RESET` + `onStateChange(null)`; `RESIZE` clamped to 240–1400 px; `SMARTSIM_ERROR` → safe Arabic panel (message rendered
  as text, code only). Emission is debounced (150 ms) below the page's own 800 ms autosave debounce.
* Telemetry seam `onError({ packageId, packageVersion, errorCode })` — never state, never student data.

**Origin model (browser-verified, §15):** uploaded code is sandboxed TWICE and independently — by the iframe attribute
`sandbox="allow-scripts"` and by the HTTP response header `Content-Security-Policy: sandbox allow-scripts`. Either one alone
gives the document an opaque (`"null"`) origin: no parent DOM, no application `localStorage` / `sessionStorage` /
IndexedDB / cookies, no popups, no top / parent navigation, no forms, no modals. The HTTP sandbox is what protects a runtime
URL that is opened directly, bookmarked or navigated to outside `SimulationSandboxHost`; headless Chromium proves it for
HTML and SVG documents, and proves that even a frame deliberately weakened with `allow-same-origin` still yields an opaque
origin. The CSP then limits loads to the package's own prefix and blocks every network API. What the package *can* still
do: consume CPU / memory inside its document and post messages that the host filters.

## 7. Answer contract (`src/smartsimState.ts`, shared build)

`{ kind: "simulation", state: JsonValue }`. `normalizeSimulationState` deep-copies into plain JSON and refuses with ONE
code: `STATE_TOO_LARGE` (> 64 KB UTF-8), `STATE_TOO_DEEP` (> 32), `STATE_NON_FINITE`, `STATE_NOT_JSON` (functions, symbols,
undefined, class instances / DOM nodes), `STATE_FORBIDDEN_KEY` (`__proto__`, `constructor`, `prototype`), `STATE_CYCLE`.
The same function runs in the host **and** on the server (`api/src/lib/draft-answers.js` → `saveDraft` and `submit`
drop a rejected simulation answer instead of storing it). `answered()` / `isResponseAnswered` mirror: a non-empty object /
array (or a non-null primitive) counts; `null` / `{}` / missing fail closed. Autosave, restore, attempt resume, submit and
review all flow through the **existing** `StudentExamPage` answers pipeline — no new persistence path.

## 8. Grading authority

`simulation@1` is registered on the server with a zero-authority grader: `score 0, manualReview true, correct false` for
every response, including states that smuggle `score`, `passed`, `correct` or `SMARTSIM_SCORE`. Uploaded JavaScript never
grades officially. `question.answer` is **reserved** for the 16B-B assertion engine (defaults leave it absent; the editor
never writes it). The sanitizer keeps `simulation.{packageId, packageVersion, packageHash, runtimeVersion, entry, title,
scenario, publicConfig}` byte-for-byte, blanks `answer`, and additionally strips secret-named keys smuggled into `scenario`
/ `publicConfig` (`expectedState`, `answerKey`, `hint`, …) through the 16A universal projection.

## 9. Authoring, finalization, governance

* `newQuestion("simulation")` → `questionTypeVersion: 1`, no package, no answer. The registered validator returns
  `SIM_PACKAGE_MISSING` / `SIM_PACKAGE_ID_INVALID` / `SIM_PACKAGE_VERSION_INVALID` / `SIM_PACKAGE_HASH_INVALID` /
  `SIM_RUNTIME_UNSUPPORTED` / `SIM_ENTRY_UNSAFE` / `SIM_SCENARIO_INVALID` / `SIM_PUBLIC_CONFIG_INVALID` — all BLOCKING in
  `examQuality` → `evaluateExamFinalization` (client and the shared server build).
* Review submission (`exam-governance.js`, `in-review`) additionally requires every pinned package to **exist in storage**
  with exactly that id / version / hash / runtimeVersion → otherwise `422 SIMULATION_PACKAGE_UNAVAILABLE`
  (`examSimulationAvailabilityIssues`; deps-injectable). Review → approve → publish never substitutes a package: the
  revision carries the exact reference and the runtime route only serves that hash.
* `compoundPart: false` (V1): a simulation is a whole question; the validator refuses it as a part
  (`TYPE_NOT_COMPOUND_CAPABLE`). Reason: one sandbox per question keeps state, reset and review unambiguous; lifting this is a
  16B-B+ decision.
* Duplicate / move / move-to-section / clone / undo / redo / save / reload preserve `simulation` byte-for-byte (snapshot
  history; `mergePatch`). Presets never copy package binaries: a preset instantiates an exam with **zero** questions, so no
  reference and no binary travels (audited; `PresetLibraryPanel` untouched).
* Editor (`SimulationEditor.tsx`, lazy): selected identity (`packageId@version`, hash prefix, runtime), «من المكتبة»
  (title, id@version, hash prefix, size, file count, date, status; «اختيار»), «رفع محاكاة» (drag & drop + click, `accept`
  `.smartsim,.zip`, progress, factual report «✓ اجتازت فحوص الحزمة», blockers vs warnings with codes, conflict message with
  no overwrite option, «إعادة المحاولة»), «معاينة المحاكاة» (the same host in preview mode inside the shared Dialog),
  «نسخ مواصفات بناء محاكي» (copies `simulatorSpecText.ts`), and the standing explanation that TS/React must be prebuilt.
  Without an injected service (App-owned `simulations` prop → `SimulationServiceContext`) the actions are not offered.
  The Builder never receives a token: `App` builds the service over its request helper and an XHR upload with the same
  auth headers (`simulationClient.ts`, loaded on demand).

## 10. SDK, docs, templates, example

`docs/smartsim/README.md` (format, limits, protocol table, authoring flow), `AI_SIMULATOR_SPEC.md` (paste-ready brief +
learning-goal addendum), `manifest.schema.json`, `sdk-v1.js` (~4 KB, dependency-free, `SmartSim.connect`),
`templates/vanilla-single-file/`, `templates/react-vite/` (source + `vite.config.ts` emitting `../dist`, typed
`smartsim.ts`), `examples/smartsim/counter/` (the E2E package). The protocol is the authority; the SDK is a convenience.

## 11. Tests (fail-first on `6bb3b97d`, all six suites failed at import — `scratchpad/16b-a/fail-first-6bb3b97.log`)

| suite | covers |
|---|---|
| `api/tests/smartsim-package-validator-16b-a.test.js` | S2–S17: manifest, vanilla + React dist acceptance, source-only refusal, non-ZIP, traversal, absolute/UNC/NUL, symlink, oversize archive, size lie / bomb / ratio, too many files, duplicates, nested archives, allow-list, external resources, hash determinism |
| `api/tests/smartsim-store-16b-a.test.js` | S18–S21 + runtime: idempotent / conflict / V1 after V2 / never latest, runtime-set-only persistence, owner isolation, auth + precheck, serving headers + CSP + refusals, availability |
| `api/tests/smartsim-guards-16b-a.test.js` | architecture guards (no eval / new Function / vm / child_process / npm / vite / tsc; no external origin; no URL from exam JSON; S35 no subject branch; bridge carries no identity; uploaded bytes never in `src/`), shared-build parity, S13/SM13 zero authority, S23 sanitizer, header contract, governance gate, draft bounding |
| `src/smartsim/bridge.16b-a.test.tsx` | S24–S32: sandbox attributes, URL builder refusals, READY/INIT key set, timeout panel, source / instanceId / protocol / type / payload policy, oversized state, error panel, resize clamp, request-reset, disabled, preview ≡ student, pure parser + normalizer |
| `src/questionTypes/simulation.16b-a.test.tsx` | S1 catalog row, registry, answer kind, S22 exact identity, S33 finalization refusals, S34 duplicate / move / clone / undo / redo, palette 16 + editor flows (library, upload, rejected report, conflict, retry, preview, copy spec), student card + sanitizer |
| `src/smartsim/counterE2E.16b-a.test.tsx` | the vertical: upload → store → pin → availability → served entry with CSP → real `StudentExamPage` → package script executed in `node:vm` wired to the real host → click ×3 → autosave `{kind:"simulation", state:{count:3}}` → unmount → remount → restore 3 → server grader zero authority |
| `api/tests/smartsim-runtime-isolation-16b-a-rf.test.js` | Independent Review Fix: HTTP sandbox tokens on every asset type, forbidden tokens, exact CSP directive set, CORP / ACAO, document vs asset caching, inert 404s, main-app headers unchanged, route classification unchanged, identity pinning unchanged, production iframe tokens |
| `api/tests/smartsim-browser-16b-a-rf.test.js` | Independent Review Fix, **real headless Chromium** over the production upload + runtime handlers: B1 single-file bridge, B2 multi-file (classic JS + CSS + image), B3 Vite-shaped module graph + the React fixture, B4 direct navigation (HTML + SVG), B5 escapes framed and direct, B6 weakened-frame defense in depth, M8 header-fidelity guard |

Adjusted pins: palette 15 → 16 (`authoring.16a`), catalog order `[...LEGACY, ...WAVE1, "simulation"]`
(`questionTypeCatalog.16a`), `simulatorRuntime` in `PUBLIC_BY_DESIGN` (route inventory).

## 12. Limitations and honest scope

* Browser enforcement is proven in **headless Chromium only** (the engine available here and on the CI runner); Firefox /
  Safari behaviour of `CSP: sandbox`, CORP and module CORS is expected to match the specifications but is not exercised by
  tests. The student-side E2E still drives the counter script in `node:vm` (happy-dom does not execute iframe scripts); the
  isolation properties are proven separately by the real-browser suite.
* The real-browser suite needs a Chromium / Chrome binary: it is **required** in CI (`CI=true`) and with
  `SMARTSIM_REQUIRE_BROWSER=1`; on a machine without any browser it reports a skip instead of passing silently.
* Packages still share the application's registrable domain. The opaque origin removes every same-origin privilege, but
  CPU / memory use and resource-timing side channels remain possible, as for any sandboxed frame; see §15 for the
  dedicated-origin hardening path.
* `'unsafe-inline'` for `script-src` is granted for every served document in V1 (single-file packages need it; a Vite
  `index.html` may too). It does not widen isolation (`connect-src 'none'`, opaque origin); a per-package strict mode is
  the lever `buildRuntimeHeaders({ singleFile: false })` already exposes.
* No delete / hide of packages (immutable retention by design); no organization sharing; no upload by URL / GitHub / iframe
  URL; no simulation as a compound part; manual review only (no assertions) — 16B-B.
* The external-resource scan is a heuristic (defense in depth): it can flag a library that mentions `fetch(`, and the
  real-browser escape package deliberately evades it; the HTTP + iframe sandbox and the CSP are the real boundary.
* `connect-src 'none'` also stops a package from `fetch`ing its own JSON files; data must be bundled into the JS.

## 13. Mutation campaign (SM1–SM20)

| mutation | targeted suites | result | first failing test | tree after revert | verdict |
|---|---|---|---|---|---|
| SM1 — validator: path traversal no longer refused | smartsim-package-validator-16b-a.test.js | 2 failed / 16 passed (18) | `S7 rejects path traversal entries (../, dist/../../x, backslash variants) 9ms` | clean | **killed** |
| SM2 — validator: symlink entries accepted | smartsim-package-validator-16b-a.test.js | 1 failed / 17 passed (18) | `S9 rejects symbolic-link entries 9ms` | clean | **killed** |
| SM3 — validator: nested archives accepted | smartsim-package-validator-16b-a.test.js | 1 failed / 17 passed (18) | `nested archives and executable / unknown file types are rejected; the allow-list is explic` | clean | **killed** |
| SM4 — mime map: unknown file types served as text/plain (allow-list disabled) | smartsim-package-validator-16b-a.test.js, smartsim-store-16b-a.test.js | 1 failed / 24 passed (25) | `nested archives and executable / unknown file types are rejected; the allow-list is explic` | clean | **killed** |
| SM5 — validator: compression-ratio (zip bomb) check removed | smartsim-package-validator-16b-a.test.js | 1 failed / 17 passed (18) | `S11 rejects an oversized expanded package (declared AND actual sizes; a bomb-like ratio; a` | clean | **killed** |
| SM6 — validator: duplicate detection case-sensitive only | smartsim-package-validator-16b-a.test.js | 1 failed / 17 passed (18) | `S13 rejects duplicate normalized paths (exact duplicates, ./ prefixes and case collisions)` | clean | **killed** |
| SM7 — validator: external-resource scan disabled | smartsim-package-validator-16b-a.test.js | 2 failed / 16 passed (18) | `external script / stylesheet / image / fetch / WebSocket / EventSource / base href are blo` | clean | **killed** |
| SM8 — validator: packageHash derived from the manifest packageId instead of the bytes | smartsim-package-validator-16b-a.test.js, smartsim-store-16b-a.test.js | 4 failed / 21 passed (25) | `the packageHash is the SHA-256 of the exact uploaded bytes (never client-supplied); identi` | clean | **killed** |
| SM9 — store: same identity + different bytes overwrites the owner binding (no conflict) | smartsim-store-16b-a.test.js | 1 failed / 6 passed (7) | `S18 same id / version / identical bytes is idempotent (exists, same hash, no second write)` | clean | **killed** |
| SM10 — runtime route: serves by hash only (version / id mismatch ignored) | smartsim-store-16b-a.test.js | 2 failed / 5 passed (7) | `S20 V1 remains retrievable byte-for-byte after V2 is uploaded; the runtime never resolves ` | clean | **killed** |
| SM11 — store: runtime assets resolved from the package root (metadata.json / archive servable) | smartsim-store-16b-a.test.js | 2 failed / 5 passed (7) | `the store persists ONLY the runtime file set (manifest + dist/**) as immutable blobs under` | clean | **killed** |
| SM12 — headers: connect-src 'none' dropped from the runtime CSP | smartsim-store-16b-a.test.js, smartsim-guards-16b-a.test.js, counterE2E.16b-a.test.tsx | 3 failed / 17 passed (20) | `serves exact stored assets with strict MIME, immutable cache, CSP and security headers; re` | clean | **killed** |
| SM13 — grader: simulation@1 trusts a score reported inside the state | smartsim-guards-16b-a.test.js, counterE2E.16b-a.test.tsx | 2 failed / 11 passed (13) | `simulation@1 grades to score 0 / manualReview true for every response, including states th` | clean | **killed** |
| SM14 — shared reference validator: a string version ("latest") is accepted | simulation.16b-a.test.tsx, smartsim-guards-16b-a.test.js | 1 failed / 26 passed (27) | `validateSimulationReference refuses 'latest', non-integer versions, malformed hashes, unsu` | clean | **killed** |
| SM15 — host: messages accepted from any window (source check removed) | bridge.16b-a.test.tsx | 1 failed / 16 passed (17) | `S28 — a message from a DIFFERENT window (not the iframe) is ignored even with the right in` | clean | **killed** |
| SM16 — bridge: instanceId no longer checked for sim→host messages | bridge.16b-a.test.tsx | 2 failed / 15 passed (17) | `S29 — wrong instanceId, wrong / missing protocolVersion, unknown type, host→sim types echo` | clean | **killed** |
| SM17 — host: sandbox widened with allow-same-origin | bridge.16b-a.test.tsx, simulation.16b-a.test.tsx | 4 failed / 28 passed (32) | `renders exactly one iframe with sandbox='allow-scripts' only, no allow-same-origin / popup` | clean | **killed** |
| SM18 — host: state applied without normalizeSimulationState (raw state trusted) | bridge.16b-a.test.tsx | 2 failed / 15 passed (17) | `S30 — malformed payloads are ignored: missing state, functions, non-finite numbers, protot` | clean | **killed** |
| SM19 — governance: package-availability gate removed from review submission | smartsim-guards-16b-a.test.js | 1 failed / 11 passed (12) | `in-review with a pinned reference whose package is NOT in storage → 422 SIMULATION_PACKAGE` | clean | **killed** |
| SM20 — draft pipeline: oversized / malformed simulation states stored as-is | smartsim-guards-16b-a.test.js | 1 failed / 11 passed (12) | `normalizeDraftAnswers keeps a bounded simulation state and drops an oversized / non-JSON o` | clean | **killed** |

**20 / 20 killed** after one strengthening: SM5 (per-member compression-ratio check removed) first SURVIVED because the archive-wide ratio check caught the only bomb fixture; S11 gained a case with a bomb-like member hidden next to a 200 KB incompressible member (archive-wide ratio ≈ 1.7×), which the narrowed check alone catches — SM5 re-run: killed. Campaign 1: fingerprint before: 8df16323aac5f4bb · fingerprint after: 8df16323aac5f4bb — one mutant at a time · targeted suites · shared build regenerated for shared-TS mutants · revert · fingerprint (md5 of `git status --short` + `git diff` + untracked md5s). · SM5 re-run: fingerprint before: 0df57b8385a3f91d · fingerprint after: 0df57b8385a3f91d — one mutant at a time · targeted suites · shared build regenerated for shared-TS mutants · revert · fingerprint (md5 of `git status --short` + `git diff` + untracked md5s). — one mutant at a time · targeted suites · shared build regenerated for the shared-TS mutant (SM14) · revert · fingerprint identical after every mutant (md5 of `git status --short` + `git diff` + untracked md5s).


## 15. Independent Review Fix — HTTP-level isolation of uploaded code (RF1 / RF2)

Reviewed head `6d8e22acbb8b286b9466b79995d80ea1dc56c482`; baseline `main` `6bb3b97d0456b632c2406392d13f3eb90e5bd419`.

**RF1 root cause (CRITICAL).** Uploaded HTML / JS / SVG is served from the application origin by a public route. The only
thing that removed its origin was the iframe attribute `sandbox="allow-scripts"` — a property of the *embedding*, not of
the resource. Opened directly (link, bookmark, typed URL, `window.open` from elsewhere) the same URL ran as an ordinary
top-level page of the application origin: headless Chromium on the reviewed head reported `self.origin =
"http://127.0.0.1:<port>"`, read the application's `localStorage` / `sessionStorage` / cookie, opened a modal `alert`, and an
SVG asset did the same.

**RF2 root cause (BLOCKER).** A sandboxed document has an opaque origin, so every request it makes — including for its own
package's `app.js`, `style.css` or images — is cross-origin. `Cross-Origin-Resource-Policy: same-origin` made Chromium block
them (`net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`, `blockedReason: corp-not-same-origin`), and module scripts / `crossorigin`
CSS (the shape Vite emits) failed CORS with `Origin: null` (`corsError: MissingAllowOriginHeader`). Multi-file and
React/Vite packages therefore never ran in a real browser; the earlier `node:vm` proof could not see this.

**Also found by the browser proof:** `img-src 'self'` let a framed simulator send an image request to any application
URL (`/escape-img-app` reached the server); fetch directives are now scoped to the exact package prefix.

**Remediation (`api/src/lib/smartsim/runtime-headers.js`, `api/src/functions/simulators.js`, runtime responses only):**

| header | before | after | why |
|---|---|---|---|
| `Content-Security-Policy` | no `sandbox`; fetch directives `'self' <prefix>` | `sandbox allow-scripts` on EVERY runtime response; fetch directives `<prefix>` only; `worker-src 'none'` added | RF1: the response sandboxes itself, so direct navigation keeps an opaque origin; `'self'` admitted every app script, every other package and beacons |
| `Cross-Origin-Resource-Policy` | `same-origin` | `cross-origin` | RF2: an opaque-origin document is cross-origin to its own assets |
| `Access-Control-Allow-Origin` | — | `*` (no credentials) | RF2: module scripts, fonts and `crossorigin` CSS are CORS loads with `Origin: null` |
| `Cache-Control` (HTML / SVG) | `public, max-age=31536000, immutable` | `no-cache` | a security-header change must reach the next load; a year-long cache would pin the old headers |
| `Cache-Control` (other assets) | immutable | immutable (unchanged) | content-addressed |
| 404 responses | `no-store`, `nosniff` | + `no-referrer`, `CSP: sandbox; default-src 'none'; frame-ancestors 'none'` | inert even if navigated to or framed |

Why relaxing CORP / adding ACAO is safe here: the runtime assets are already public by design (§5); URLs are immutable and
content-addressed; the route exposes no archive, metadata or owner data; no credentials are ever allowed; the CSP still
restricts what executes and what may be loaded; `frame-ancestors 'self'` still restricts embedding; and the HTTP sandbox
protects direct navigation. The application's own CSP / CORP are unchanged. The iframe keeps `sandbox="allow-scripts"`;
`allow-same-origin` is **not** added (with same-origin uploaded code, `allow-scripts allow-same-origin` would let the frame
remove its own sandbox).

**Real-browser proof** (`api/tests/smartsim-browser-16b-a-rf.test.js`, headless Chromium over the DevTools protocol;
packages uploaded through the production upload handler and served over real HTTP by the production runtime handler; the
host frames them with the sandbox tokens parsed from `SimulationSandboxHost.tsx`):

| case | proves |
|---|---|
| B1 single-file | inline JS runs framed; READY → INIT → STATE_CHANGED with the host instance id; `savedState` restored; `postMessage` origin `"null"`; no `localStorage` / `sessionStorage` / cookie / parent DOM |
| B2 multi-file | classic external JS, external CSS (computed width) and an image (natural width) load and run inside the opaque sandbox; no blocked runtime request |
| B3 Vite-shaped dist | `crossorigin` module entry, static chunk import, dynamic `import()`, `crossorigin` CSS all execute; the repository React fixture's module script runs |
| B4 direct navigation | the HTML entry and an SVG asset opened top-level run their scripts but report `self.origin === "null"`; `localStorage` throws `SecurityError`; no application secret is readable |
| B5 escapes | framed and top-level: no popup, no top / parent navigation, no form submission, no `fetch` (app or other origin), no beacon, no image to the app or another origin, no modal — the server request log records none of them |
| B6 defense in depth | a frame deliberately given `allow-same-origin` still produces an opaque origin because of the HTTP sandbox |
| M8 guard | every header the browser receives equals the production `runtimeHandler` output; the harness never sets a security header |

Fail-first on `6d8e22a` (tests unchanged afterwards except two test-defect corrections made on the reviewed head *before*
any production change, recorded in `scratchpad/16b-a/rf/`): **12 failed · 9 passed (21)** — RF1 (B4 ×2, B5 direct: dialog
opened), RF2 (B2 `corp-not-same-origin`, B3 `MissingAllowOriginHeader`), the `img-src 'self'` beacon (B5 framed) and the
header contract (sandbox, exact directives, CORP / ACAO, caching, 404). After the fix: **22 passed (22)** including B6.

**Mutation campaign RF-M1…RF-M8** (focused suites: RF isolation, RF browser, bridge, store; one mutant at a time):

| mutation | result (RF isolation + RF browser + bridge + store suites) | failing tests (first) | tree after revert | verdict |
|---|---|---|---|---|
| RF-M1 — remove the HTTP CSP `sandbox` directive | 7 failed / 39 passed (46) | `serves exact stored assets with strict MIME, immutable cache, CSP and security headers; refuses`<br>`CSP has a `sandbox` directive whose tokens are EXACTLY ['allow-scripts'] on every asset type (H`<br>`the header builder itself applies the sandbox for single-file and prebuilt packages alike (it i` | clean | **killed** |
| RF-M2 — add `allow-same-origin` to the HTTP sandbox | 7 failed / 39 passed (46) | `serves exact stored assets with strict MIME, immutable cache, CSP and security headers; refuses`<br>`CSP has a `sandbox` directive whose tokens are EXACTLY ['allow-scripts'] on every asset type (H`<br>`no forbidden sandbox token (allow-same-origin / top-navigation / popups / forms / modals / down` | clean | **killed** |
| RF-M3 — restore the incompatible `Cross-Origin-Resource-Policy: same-origin` | 4 failed / 42 passed (46) | `Cross-Origin-Resource-Policy is `cross-origin` (an opaque-origin document is cross-origin to ev`<br>`serves exact stored assets with strict MIME, immutable cache, CSP and security headers; refuses`<br>`B2 — multi-file package: classic external JS, external CSS and an image all load and execute in` | clean | **killed** |
| RF-M3b — drop `Access-Control-Allow-Origin` (module scripts / fonts need it from an opaque origin) | 3 failed / 43 passed (46) | `serves exact stored assets with strict MIME, immutable cache, CSP and security headers; refuses`<br>`Cross-Origin-Resource-Policy is `cross-origin` (an opaque-origin document is cross-origin to ev`<br>`B3 — Vite-shaped dist: crossorigin module entry, static chunk import, dynamic import() and cros` | clean | **killed** |
| RF-M4 — remove `connect-src 'none'` | 2 failed / 44 passed (46) | `serves exact stored assets with strict MIME, immutable cache, CSP and security headers; refuses`<br>`fetch directives name ONLY the exact package prefix ('self' would admit every application scrip` | clean | **killed** |
| RF-M5 — widen `frame-ancestors` to any origin | 2 failed / 44 passed (46) | `serves exact stored assets with strict MIME, immutable cache, CSP and security headers; refuses`<br>`fetch directives name ONLY the exact package prefix ('self' would admit every application scrip` | clean | **killed** |
| RF-M6 — weaken the iframe sandbox (allow-same-origin on the production host) | 4 failed / 42 passed (46) | `the production iframe keeps `sandbox="allow-scripts"` only — the fix is NOT `allow-same-origin``<br>`renders exactly one iframe with sandbox='allow-scripts' only, no allow-same-origin / popups / t`<br>`mode='preview' renders the SAME iframe contract (sandbox, src, referrerpolicy) plus a debug sta` | clean | **killed** |
| RF-M7 — bypass the exact id / version / hash route binding | 3 failed / 43 passed (46) | `package identity pinning is unchanged: only the exact (packageId, positive-integer version, sha`<br>`S20 V1 remains retrievable byte-for-byte after V2 is uploaded; the runtime never resolves lates`<br>`serves exact stored assets with strict MIME, immutable cache, CSP and security headers; refuses` | clean | **killed** |
| RF-M8 — browser fixture serves MOCKED headers instead of the production runtime headers | 7 failed / 39 passed (46) | `M8 guard — the browser sees EXACTLY the production runtime headers (the harness serves through `<br>`B3 — Vite-shaped dist: crossorigin module entry, static chunk import, dynamic import() and cros`<br>`B4 — DIRECT top-level navigation to the runtime HTML entry: scripts run, but the document is an` | clean | **killed** |

fingerprint before `32059a12090db218` · after `32059a12090db218`.

**Dedicated simulator origin (future hardening, not required for V1).** A separate registrable domain (e.g. a
`*.usercontent` host) would also remove same-site cookie scope and some side channels and would make the sandbox a second
rather than the primary line. It needs a new deployment / DNS / certificate dependency, so it is not introduced here: with
the HTTP CSP sandbox, an opaque origin is enforced for every runtime document regardless of how it is loaded, which closes
RF1 for V1. The runtime URL builder (`src/smartsim/runtimeUrl.ts`) and `buildRuntimeHeaders` are the two places a future
dedicated origin would change.

## 14. 16B-B handoff

Generic Simulation Assertion & Grading Engine: `question.answer.assertions[]` over the stored state (JSON-path equality,
ranges, sets, sequences), an authoritative server grader registered for a **new** version family per the 16A rule (every
version 1..N implemented), teacher-visible expected-state authoring behind the sanitizer, partial credit through the
existing `partialCredit` capability, and the `singleFile: false` CSP mode for packages that declare no inline scripts.
16B-C (AI authoring assistant) builds on `AI_SIMULATOR_SPEC.md`; subject packages (16B-D…G) are plain SmartSim packages.
