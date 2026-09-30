# SmartSim packages (v1) — build, package, upload

A **SmartSim package** is a ZIP archive (extension `.smartsim` or `.zip`) that a teacher uploads once and then pins to any
number of «محاكاة تفاعلية» questions. The platform runs it inside a sandboxed iframe on the student's device, stores the
learner's state as the answer, restores it on return and hands it to manual review. The uploaded code never grades.

## Layout

```
manifest.json            required, at the archive root (see manifest.schema.json)
dist/index.html          required entry (any name, but inside dist/ and an .html file)
dist/**                  everything that executes or renders: .html .css .js .mjs .json .svg .png .jpg .jpeg .gif .webp .woff2 .txt
source/**                optional, IGNORED (never stored, never served) — keep it for provenance if you like
README.md, thumbnail     optional, ignored
```

Only `dist/` executes. TypeScript / React / Vite projects must be **prebuilt**: the platform never runs `npm`, `tsc` or
`vite`, and a package whose entry is missing (source only) is refused with `ENTRY_MISSING`.

## Identity and versions

* `packageId` — a stable identifier for the simulator (`^[a-z][a-z0-9-]{1,63}$`). Never changes.
* `packageVersion` — a positive integer. **Bump it for any content change.** Uploading the same version with different
  bytes is refused: «هذه النسخة موجودة بمحتوى مختلف. أنشئ إصدارًا جديدًا للمحاكي، مثل v2.» Nothing is ever overwritten; every
  version stays retrievable (a published exam keeps working after you upload v2).
* `packageHash` — computed by the server (SHA-256 of the exact uploaded bytes). A question stores
  `{ packageId, packageVersion, packageHash, runtimeVersion }` — never "latest".
* `runtimeVersion` / `responseSchemaVersion` — the host contract (`1`) and the state contract (`1`). Distinct from the
  platform question type `simulation@1`.

## Limits (server-enforced)

| limit | value |
|---|---|
| archive | 15 MB |
| unpacked runtime set | 30 MB |
| one file | 10 MB |
| files | 500 |
| compression ratio | 100× (bomb protection) |
| state per answer | 64 KB of JSON, depth ≤ 32, finite numbers only |

Also refused: `../`, absolute, drive and UNC paths, NUL bytes, symlinks, duplicate or case-colliding paths, nested archives,
anything not on the file-type allow-list inside `dist/` (no `.exe .dll .so .sh .bat .ps1 .jar .py .php .wasm .map`), and
**external resources**: `<script src="https://…">`, external stylesheets / images / fonts / iframes / `<base href>`,
`fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `importScripts`. The sandbox blocks all of these anyway
(`connect-src 'none'`); the upload check just tells you early.

## Runtime environment

Your page is served from `/api/simulators/runtime/<packageId>/<version>/<sha256>/<path>` with
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: cross-origin`,
`Access-Control-Allow-Origin: *`, `Cache-Control: no-cache` for HTML / SVG documents (immutable for every other asset) and
this CSP, where `<package-prefix>` is your package's exact runtime path:

```
sandbox allow-scripts; default-src 'none'; script-src <package-prefix> 'unsafe-inline';
style-src <package-prefix> 'unsafe-inline'; img-src <package-prefix> data:; font-src <package-prefix>;
media-src <package-prefix>; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none';
form-action 'none'; frame-ancestors 'self'
```

Your page is sandboxed twice: by the host iframe (`sandbox="allow-scripts"`) and by the `sandbox allow-scripts` CSP
directive on the HTTP response, which also applies when the runtime URL is opened directly. Either way it runs with an
opaque origin: no cookies, no `localStorage` / `sessionStorage` / IndexedDB, no access to the parent document, no popups, no
top navigation, no form submission, no modal dialogs, no downloads, no network. Only files from your own package can be
loaded, so use relative asset URLs (`./assets/…`). Classic scripts, ES modules (including Vite's `crossorigin` entry, static
chunks and dynamic `import()`), stylesheets, images and fonts are verified to load in headless Chromium. `fetch` cannot read
your own JSON files (`connect-src 'none'`), so bundle data into your JS.

## The protocol (SmartSimBridgeV1)

Every message is `{ protocolVersion: 1, instanceId, type, payload }` sent with `postMessage(…, "*")`.

| direction | type | payload |
|---|---|---|
| sim → host | `SMARTSIM_READY` | `{}` — once, when your listener is attached (`instanceId` may be `null` here) |
| host → sim | `SMARTSIM_INIT` | `{ protocolVersion, instanceId, scenario, publicConfig, savedState, disabled }` — remember `instanceId`; restore `savedState` |
| sim → host | `SMARTSIM_STATE_CHANGED` | `{ state }` — plain JSON, bounded; stored as the answer |
| host → sim | `SMARTSIM_RESTORE_STATE` | `{ state }` |
| host → sim | `SMARTSIM_SET_DISABLED` | `{ disabled }` — read-only after submit / end / in review |
| sim → host | `SMARTSIM_REQUEST_RESET` | `{}` — the host answers with `SMARTSIM_RESET` and clears the saved state |
| host → sim | `SMARTSIM_RESET` | `{}` — return to the initial state and emit `SMARTSIM_STATE_CHANGED` |
| sim → host | `SMARTSIM_ERROR` | `{ code, message }` — short, no secrets |
| sim → host | `SMARTSIM_RESIZE` | `{ height }` — optional, clamped to 240–1400 px |

The host ignores (never applies) any message whose `instanceId` does not match, whose `protocolVersion` is not `1`, whose
type is unknown or whose payload is malformed (functions, NaN, prototype keys, > 64 KB). Scores, `passed` flags or any
other grading claim inside the state are ignored: in Phase 16B-A every simulation answer goes to manual review.

`sdk-v1.js` wraps the protocol in ~4 KB (`SmartSim.connect({...})`); `templates/react-vite/source/src/smartsim.ts` is the
typed twin. Both are conveniences — the protocol above is the contract.

## Templates and example

* `templates/vanilla-single-file/` — Template A: one HTML file with inline style + script.
* `templates/react-vite/` — Template B: React + TypeScript + Vite **source** with the build recipe that emits `dist/`.
* `../../examples/smartsim/counter/` — the reference package used by the platform's own end-to-end test.
* `AI_SIMULATOR_SPEC.md` — paste-ready specification for generating a simulator with an AI assistant.

## Authoring in the exam builder

1. Add a question of type «محاكاة تفاعلية».
2. «رفع محاكاة» (drag & drop or pick a file) → the server report lists ✓ checks, warnings (e.g. `source/` ignored) and
   blockers with codes; a passing package is pinned to the question immediately.
   «من المكتبة» lists your uploaded packages (title, `packageId@version`, hash prefix, size, date) and their versions.
3. «معاينة المحاكاة» opens exactly the student host (same sandbox, same URL) with a state inspector outside the frame.
4. Finalization / review refuses a question without a pinned package, with a malformed reference, or whose package is not
   present in storage. Published revisions keep the exact identity; a later upload never changes a live exam.
