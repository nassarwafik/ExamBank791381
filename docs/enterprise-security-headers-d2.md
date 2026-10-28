# D2 — security headers (item 4) and dependency hygiene (item 6)

Two gaps found by the project survey:

| # | Gap | Change |
|---|---|---|
| 4 | The web app sent no security headers at all: no Content-Security-Policy, no `nosniff`, no framing rule, no HSTS. An injected script (a sanitizer bypass, a compromised dependency) would have run with the full session; the app could be framed by any site. | A strict CSP in the built `index.html`, and static security headers on every response (`public/staticwebapp.config.json`). |
| 6 | No Dependabot and no `npm audit`. The survey's audit found a **critical** advisory in a shipped dependency (DOMPurify inside the Monaco editor) and **high** ones in the API (`sharp`, `source-map-js`). | Advisories fixed inside the allowed version ranges; a CI audit gate on shipped dependencies; Dependabot version updates. |

## 1. Content-Security-Policy

**Where.** A `<meta http-equiv="Content-Security-Policy">` inserted by a Vite plugin into the **built** `index.html` only
(`scripts/content-security-policy.ts`, wired in `vite.config.ts`).

- **Not a global header.** In `staticwebapp.config.json` a global CSP would also reach `/api/*`. The simulator runtime
  (`api/src/lib/smartsim/runtime-headers.js`) and the mesh assets route send their own, stricter policies, and a second policy
  can only narrow them, so it could break the sandboxed simulators.
- **Not in dev.** The dev server's hot reload needs inline scripts. The source `index.html` therefore stays policy-free.
- **The browser-harness pages are untouched.** They are test fixtures, not the product.

**The policy**, from an inventory of `src/` and of the built assets:

```
default-src 'self'; script-src 'self' 'sha256-<dark-mode bootstrap>'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self';
worker-src 'self' blob:; child-src 'self' blob:; frame-src 'self'; manifest-src 'self'; object-src 'none';
base-uri 'self'; form-action 'self'; upgrade-insecure-requests
```

**Why each part:**

- **Scripts.** There is one inline script, the dark-mode bootstrap in `index.html`, allowed by its exact hash. The hash is computed
  at build time, so editing that script updates it. There is no `eval` / `new Function` anywhere in the built code; the only match
  in `dist/` is a sentence in the simulator build specification. All other scripts are same-origin chunks.
- **Styles** need `'unsafe-inline'`: React `style` attributes and the Monaco editor's injected `<style>` elements. This only allows
  CSS, never script.
- **Images:**
  - same-origin files and `/api/question-image` (a signed same-origin URL);
  - `data:` for sanitized SVG question media and inline icons;
  - `blob:` for the profile-photo preview.
  - No question can load an external image (`src/questionMedia.ts` rejects external references).
- **Requests.** Every `fetch` goes to `/api/*` on the same origin. Push subscriptions go through the browser, not `connect-src`.
- **Workers:**
  - the service worker (`/sw.js`);
  - the Monaco editor worker, a same-origin chunk;
  - `blob:` is only Monaco's own fallback for a cross-origin worker URL, which never happens here.
- **Frames.** The simulator runtime (`/api/simulators/runtime/…`) is same-origin and sandboxed by its own policy.
- **`frame-ancestors`** cannot be set in a meta tag. Framing is limited by the `X-Frame-Options` header below.

**Gate.** `npm run check:csp` (`scripts/check-csp-meta.mjs`) runs inside `npm run build`. It requires:

- exactly one policy meta, before every script and stylesheet;
- no `'unsafe-eval'`;
- `script-src` limited to `'self'` plus the exact hash of every inline script in the page;
- `object-src 'none'`.

**Real-browser proof** (Chromium, local, on the D2 build):

- the app shell and all 22 browser-harness pages served under this policy (Monaco editor, ECharts / Chart.js, three.js scenes,
  chemistry and physics labs, mesh models, the grading workspace, the UX gallery): **0 violations, 0 page errors**;
- the CI browser gates, which run the production build over the real API, all passed under the policy: the learning reader,
  classes and students, the 10 project journeys, plus the brand / PWA (service worker) and code-editor checks;
- **negative control:** the same page with the hash removed made Chromium block the bootstrap script, reporting exactly the
  hash the build computes.

**Measuring tools.** 13 browser-gate scripts injected axe-core with `page.addScriptTag({ content })`, which is an inline
`<script>`. The policy rightly blocks that. They now inject it with `page.evaluate(source)`, which runs through the DevTools
protocol and is not subject to the page's CSP. The policy stays in force for everything the application does during those journeys.

## 2. Static security headers

`public/staticwebapp.config.json` → `globalHeaders`:

| Header | Value | Why |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | A response is never re-interpreted as script or HTML |
| `X-Frame-Options` | `SAMEORIGIN` | Other sites cannot frame the app (clickjacking). Not `DENY`: the app frames its own simulator runtime |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Paths and query strings (signed URLs, ids) never leave the origin |
| `Strict-Transport-Security` | `max-age=31536000` | Browsers use HTTPS only for a year. No `preload`: that is an owner decision about the domain |
| `Permissions-Policy` | camera, microphone, geolocation, payment, USB, serial, Bluetooth, MIDI off; `fullscreen=(self)` | Features the app never uses stay off. The learning reader keeps full screen |
| `Cross-Origin-Opener-Policy` | `same-origin` | A page opened from another site cannot script the app's window |

There is deliberately no global CSP / CORP / COEP. `api/tests/smartsim-runtime-isolation-16b-a-rf.test.js` still guards that
the simulator runtime's isolation never relies on the application's headers.

## 3. Dependencies

**Advisories fixed** (lockfiles regenerated with npm; versions stay inside the declared ranges):

| Package | Where | Severity | Before → after |
|---|---|---|---|
| dompurify (inside monaco-editor, which pins 3.4.15) | web bundle | critical | 3.4.15 → 3.4.17 via `overrides` |
| sharp | API | high | 0.35.4 → 0.35.5 |
| source-map-js (via postcss) | API, build | high | 1.2.1 → 1.2.2 |
| sanitize-html | API | moderate | 2.17.7 → 2.18.1 |
| vite, vitest (+ rolldown, @vitest/*) | development | high / moderate | vite 8.2.2 → 8.3.5, vitest 4.1.11 → 4.1.12 |

- **After the fix:** `npm audit --omit=dev` reports 0 for both packages, and `npm audit` for the API reports 0.
- **Left open:** `happy-dom` (the test DOM, development only, high). Its fix is a major version (20 → 21) that could change how about
  1,000 UI test files behave, so it is left for its own Dependabot pull request.
- **Tooling note:** npm 10.9 (bundled with Node 22) crashes on this tree (`Cannot read properties of null (reading 'edgesOut')`,
  an arborist peer-set bug) for any install or update. The lockfiles were regenerated with npm 11 (`npx npm@11 install
  --package-lock-only`). They stay lockfileVersion 3 and install with the CI's npm 10 (`npm ci` verified for both packages).

**Audit gate.** `.github/workflows/dependency-audit.yml` runs `npm audit --omit=dev --audit-level=high` for the web app and the API.

- **What fails it:** a high or critical advisory in a shipped dependency.
- **What it reports:** development-only advisories are listed in the job summary but do not fail it.
- **When it runs:** on PRs that change a dependency manifest, on every push to `main`, and weekly, because new advisories appear
  without any code change.

**Dependabot** (`.github/dependabot.yml`):

- weekly version updates for the web app and the API, plus monthly updates for the workflows' actions;
- minor and patch updates are grouped into one pull request per directory; major updates come one by one;
- every update is an ordinary PR, which never auto-merges.
- **deferrals decided by the owner on the first round (2026-10-27)**, kept as `ignore` rules and pinned by a test:
  - **TypeScript 7** (#466): a native rewrite without the JavaScript compiler API that `scripts/build-shared-finalization.mjs` uses.
    The repository stays on 6 until a planned migration phase.
  - **React / react-dom minor versions** (#465): React 19.3 grew the initial JS graph by about 8 KB gzip, over the 125 KB budget.
    **Lifted:** the React 19.3 upgrade moved the builder's conversion / preset helpers (`examBuilderState` and its imports) out of
    the initial graph (126.9 → 115.3 KB gzip with React 19.3.1; the budget is unchanged), and the ignore rule was removed.
  - **pdf-parse v2** (#464): a different API (`require()` returns an object, not a function), so the bump would break PDF import at
    runtime while CI stayed green. `api/tests/pdf-extract-real.test.js` now parses a real PDF through the installed library.

## 4. Owner steps (GitHub settings; nothing here is applied by an agent)

1. **Settings → Code security → Dependabot alerts: Enable**, and **Dependabot security updates: Enable**. The alerts
   cover the whole dependency graph between the weekly runs.
2. **Dependabot PRs have no access to repository secrets.** Their `Build and Deploy Job` (PR preview) fails. That is expected
   and is not a code failure; the Quality Gate is the meaningful check. Two options:
   - store the Static Web Apps token as a **Dependabot secret** with the same name, so they get previews (they then use
     preview-environment slots);
   - keep it as is.
3. When a site the app must use is added (a font CDN, an embedded video host), its origin is added in
   `scripts/content-security-policy.ts` with its reason. `script-src` is never loosened.

## 5. Evidence

See the PR: fail-first on the baseline, the D2 unit tests, the mutation campaign, the real-browser runs and exact-head CI.
