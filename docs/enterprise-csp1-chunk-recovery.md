# CSP-1: question chunk recovery under the application's Content-Security-Policy

Phase 21E.3 recovers, in place, a question whose JavaScript chunk failed to load (`src/recoverableLazy.ts`,
`docs/enterprise-ux-premium-21e3.md`). For a failed **shared dependency** it inserts a runtime `<script type="importmap">` that
redirects the retry graph to fresh copies. The design was measured on a minimal Vite build **without** a Content-Security-Policy
(21E.3 §3.2).

The application's policy (D2, `scripts/content-security-policy.ts`) allows inline scripts only by hash. The browser therefore
refuses every runtime import map. CSP-1 measures what that breaks, makes the runtime stop asking for what the policy forbids, and
records the limit honestly. **The policy is not weakened.**

## 1. What was measured (production build of `849a4c0`, Chromium, `scripts/check-student-exam-browser-21e3.mjs`)

| Failure | Before CSP-1 |
|---|---|
| The question's own entry stub fails (`HotspotResponse`, harness default) | Recovered in place: the entry is imported as `<entry>?r=1.` directly. The import map the runtime inserts is not needed, and the browser blocks it, so there is **one `client.csp_violation` per recovery**. |
| A shared dependency fails (`HotspotView`, `VisualCanvas`) | **Not recoverable in place.** The map is blocked, so `<entry>?r=1.` imports the poisoned originals again and fails. All three retries end on «ما زال التحميل متعذّرًا», with a CSP violation each time. The question comes back only after a page reload, which a strict attempt never offers. The 21E.3 record's "dependency 58 / 58" no longer holds on today's build. |

Grading stays safe in both cases. The page reports the question to the server (`renderFailures`, 21E.3 §16), and the server holds
it for the teacher instead of grading the blank as 0.

## 2. Why the policy is not changed

An import map is an inline script, so it needs `'unsafe-inline'` or a per-response nonce:
- `'unsafe-inline'` is ignored by CSP 3 browsers whenever a hash is present. Using it means dropping the hash, which reopens
  every inline-script injection the policy blocks today.
- A nonce needs a fresh value in every response. The static host serves one `index.html` with the policy in a `<meta>`, so there
  is no per-response nonce.
- An external import map (`<script type="importmap" src>`) is not supported by browsers.

Weakening the policy to rescue a rare recovery path would trade a security property for an availability one that already has a
safe fallback. It is not done.

## 3. The change (`src/recoverableLazy.ts`, step 4b of the model)

- **`inlineScriptsBlockedByCsp(doc)`** reads the page's own policy `<meta>`. The directive is `script-src-elem`, else
  `script-src`, else `default-src`. `'unsafe-inline'` counts only without a hash, nonce or `'strict-dynamic'`. Any one enforcing
  policy is enough.
- **Under such a policy the runtime never inserts an import map.**
  - A remap that needs none is imported directly as `<entry>?r=<g>.`, as before. That is the entry alone, reaching no recovered
    module.
  - Any other remap is refused **before** anything is imported or marked in flight (`recovery-blocked`). The card keeps the safe
    options («ما زال التحميل متعذّرًا», «إعادة المحاولة», and the reload where the attempt allows one).
- **Without such a policy** (no meta, or a policy that allows inline scripts), the 21E.3 model is unchanged. All 56 earlier unit
  tests pass untouched.

## 4. Evidence

**Fail-first**: `src/recoverableLazy.21e3.test.tsx`, two new `CSP-1` blocks with 13 tests. All 13 failed on `849a4c0`:
- the 10 policy cases failed because `inlineScriptsBlockedByCsp` did not exist;
- *entry failure*: `expected 1 to be +0`, because an import map was inserted;
- *dependency failure*: the remapped import ran under the policy, so the component rendered instead of the card;
- *later graph*: the futile `LabelDiagramResponse…?r=2.` import was made.

All 69 tests in the file pass on the head.

**Mutations** (unit suite, file restored byte-for-byte, SHA-256 verified):

| Id | Planted defect | Outcome | Killed by |
|---|---|---|---|
| M1 | detection always "not blocked" | KILLED | 10 tests (policy table, the three runtime cases) |
| M2 | a multi-module remap is not refused | KILLED | dependency failure: refused at once |
| M3 | reaching a recovered module is not refused | KILLED | a later graph that would need a recovered module mapped |
| M4 | the import map is still inserted under the policy | KILLED | entry failure: no import map (and one more) |
| M5 | `'unsafe-inline'` honoured beside a hash | KILLED | 3 policy cases |

**Chromium**: the harness gains **I1**, no Content-Security-Policy violation during the whole journey (a
`securitypolicyviolation` listener from the first script). In the shared-dependency mode, **A4d** replaces A4: the card stays with
the safe options, and no remapped script is requested.

| Build | Mode | Viewports | I1 | A4 / A4d | A8 |
|---|---|---|---|---|---|
| baseline `849a4c0` | entry | desktop | **FAIL** | A4 PASS | PASS |
| baseline `849a4c0` | dependency | desktop, phone | **FAIL** | A4d **FAIL** (a `?r=` script requested) | **FAIL** (`HotspotResponse?r=1.` requested, never evaluated) |
| this phase | entry | desktop, 150 %, 200 %, phone | PASS | A4 PASS | PASS |
| this phase | dependency | desktop, 150 %, 200 %, phone | PASS | A4d PASS | PASS |

After the reconciliation with `main` (`ea96c4e`, which brought #689's A5 fix), the head build passes **84 / 84** in entry mode
and **83 / 84** in dependency mode, at all four viewports. The merge changed no application source, only the harness and a doc.

One harness check is reported, not changed: **E3** (phone, label touch targets) fails in dependency mode on the baseline and on
this phase alike. The label-diagram question shares the failed `VisualCanvas` chunk, so it cannot render in that mode. That is
the limit recorded in §1.

## 5. What remains

- **A failed shared dependency is still not recoverable in place.** The planned follow-up, **CSP-2**, makes that failure unlikely
  instead of recoverable. When an attempt starts, it would warm the HTTP cache with the chunks the exam's question types need,
  using plain `fetch` (`connect-src 'self'`). A failed warm-up fetch does not poison the module map. It is worth doing only if
  production serves `assets/` with a cacheable `Cache-Control`. `public/staticwebapp.config.json` sets none for them today, so
  this must be measured first.
- A policy delivered only as an HTTP header is not visible to `inlineScriptsBlockedByCsp`. The application has none today; if
  one is added, the detection must learn about it, otherwise the runtime would insert the map again and be refused, as before
  CSP-1.
