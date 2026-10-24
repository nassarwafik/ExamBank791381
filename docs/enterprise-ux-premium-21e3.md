# Phase 21E.3 — Enterprise student exam experience and accessibility

Design record for Phase 21E.3 (Tadris+ — التعليم المتكامل): the student exam-taking experience. It builds on the 21E.0 audit
and roadmap in `docs/enterprise-ux-premium-21e.md` (§3.3 S-1…S-8, §4 the 21E.3 row, §7.2 S-ST-NEW-1…3) and follows the
repository contract in `AGENTS.md`. Independent review required. Owner merge only.

> **Status: implemented — independent review required.**
> - §1–§4 were written before PR #300 merged; no production file changed until then.
> - PR #300 merged as `31f4008`. The branch was reconciled with a normal merge (`bfed05c`) and the phase implemented in
>   `50d72be`.
> - Mutation survivors were closed in `cb98b57` and `13d4912`. `4f014ec` changed tooling only.
> - §7–§11 carry the implementation and its evidence.
> - The independent review of `92f4326` failed the PR (four blockers: the focus reveal scrolled the page between a pointer
>   press and its release). **Review Fix 1 (§12)** corrects them and the other introduced findings. Statements that the
>   review found inaccurate are corrected where they stand and marked *(corrected in Review Fix 1, §12)*.
> - The read-only re-review of `eb174d1` (four reviewers) returned PASS in three areas and FAIL in one (recovery: focus after
>   a successful retry could land on an answer control, P1). **Review Fix 2 (§13)** corrects it and the other introduced P2 /
>   P3 findings; corrections are marked *(corrected in Review Fix 2, §13)*.

---

## 1. Baseline and prerequisite

| Item | Value |
|---|---|
| `origin/main` at assignment and at the time of this record | `b8a65f16a2877a99a4adf4f24c74cb7687f7ae41` (merge of PR #299) |
| PR #300 (21E.1 slice 2) | open, head `dd795f3ea33d5dccb02b6e3631fc051c65d3dded`, not merged |
| Root suite on `b8a65f1`, before any change | `npm test`: **920 files, 11,991 tests passed, 0 failed** |
| Production build on `b8a65f1` | bundle guard passed; initial JS **8 files, 110.1 KB gzip** (budget 125 KB); initial CSS 34.9 KB gzip |
| Chromium | 141.0.7390.37 (headless, `/opt/pw-browsers/chromium-1194`), Playwright 1.56.1 |
| `origin/main` adopted for the implementation | `31f40086e4740984ee1f7cb7c90aee7869301d5a` (merge of PR #300; it also carries PR #301, a Runner test only) |
| Reconciliation merge | `bfed05c` = normal merge of `31f4008` into `b329c68`; one `.gitignore` conflict resolved as the union of both additions |
| Root suite on `31f4008` (clean detached worktree) | `npx vitest run`: **937 files, 12,205 tests passed, 0 failed** |
| Production build on `31f4008` | bundle guard passed; initial JS **8 files, 113,118 B gzip (110.5 KB)**; initial CSS **35,797 B gzip** |

## 2. Route map (student exam runtime)

`StudentPortal` (task card «ابدأ») → `StudentExamPage` (lazy student chunk) → start gate (`.iex-start-card`, or
`StructuredExamCover` when a cover is enabled) → `startAttempt` + exam body fetch → paged answering:

| Region | Component | Notes |
|---|---|---|
| Sticky top bar | `student/exam/ExamTopBar.tsx` | back, title, context, timer chip (`role="timer"`, not live) |
| Progress row | `StudentExamPage.tsx` + `student/exam/SaveStatus.tsx` | position, navigator trigger, progress bar, **the only live region** (save state) |
| Details | `student/exam/ExamDetailsDisclosure.tsx` | default-open rule owned by PR #300 (owner decision F3) |
| Current question | `StudentQuestionCard.tsx` / `StructuredExamSection.tsx` (`StructuredSectionQuestion`) | registered types render through `questionTypes/studentRegistry.tsx`; SmartSim workspaces through `trustedSim/smartSimUiRegistry.ts` |
| Sticky bottom bar | `student/exam/ExamBottomNavigation.tsx` | السابق / التالي / مراجعة الإجابات (never submits) |
| Navigator / review | `QuestionNavigatorDialog.tsx`, `ExamReviewScreen.tsx` | the review's «تسليم الامتحان» calls the page's `submit()` (ConfirmDialog, offline guard, pre-submit save) |
| Result | result card in `StudentExamPage.tsx` | score / pending state, teacher feedback, next attempt |

## 3. Audit — measured on the baseline

Real Chromium against the production build of `b8a65f1`, driven by `scripts/check-student-exam-browser-21e3.mjs` (this
phase's certification harness; local mock of the student API with student-sanitized payloads, a timed attempt that crosses
the 5-minute threshold a few seconds after start, a controlled HTTP 503 on the hotspot renderer chunk). Two runs: with the
chunk failure (`LABEL=before`, desktop) and without it (`FAIL_COUNT=0 LABEL=before-nofail`, four viewports) so that every
later step of the workflow is measured too.

| Id | Finding | Baseline measurement | Severity |
|---|---|---|---|
| S-1 | A renderer chunk that fails to load reaches the **root** `ErrorBoundary`: the whole exam (top bar, answers on screen, navigation, save status) is replaced by «تم تحديث الموقع». Both registries use plain `React.lazy`. | exam unmounted, root boundary shown, console `[ErrorBoundary] {code: chunk-load}`; only a full page reload remains | **S1** |
| S-1b | **Chromium caches a failed dynamic import.** A second `import()` of the same URL rejects at once without any request. A retry that merely re-renders a lazy component can never recover. | probe: 2 `import()` calls → 1 request, both rejected | design constraint |
| S-1c | `lazyWithRetry`'s automatic full reload is unsafe **inside** an exam: in strict mode a reload is a page exit that ends the attempt (pagehide → strict exit), and in other modes it can drop the newest unsaved edit. | code reading: `StudentExamPage.tsx` strict-exit handlers | design constraint |
| S-4 | No focus move after the major transitions. | after start (keyboard Enter on «بدء المحاولة»): `activeElement = <body>` at every viewport; after submit: `<body>`; the result `<h1>` is not focusable | S2 |
| S-2 | Timer thresholds are colour only. | no announcement at the 5-minute crossing (live-region log empty for «دقائق») | S2 |
| S-3 | The visible save label **is** the live region, so every edit is announced three times. | live-region log per answer: «تغييرات غير محفوظة» → «جارٍ الحفظ...» → «تم الحفظ · آخر حفظ: …» | S2 |
| S-8 | Nothing reserves scroll clearance for the sticky bars: a control reached with Tab can sit under the bottom navigation. | 1280×900: the focused radio of Q1 at y 812–840 and the focused answer textarea at y 800–940, both under the bottom bar; 640×450 (200 %): the focused CLI blank at y 376–408 under the bottom bar | S2 |
| S-7 | Touch targets below 44 px on a phone (390×844, touch). | CLI blank 187×**32**; cloze dropdown 109×**40**; label chips 74×**40**; label dropdowns 110×**40**; label zone buttons 52×**40**; notification header action 44 on phones but **36** at ≥ 768 px (coarse-pointer tablets) | S2 |
| S-6 | LTR isolation gaps. | install card «تثبيت Tadris+» is drawn **«+Tadris»** (visual-order probe: «+» left of «T»); CLI fill `<pre>` / blanks carry CSS `direction:ltr` but no `dir="ltr"`; the notification grade «8.5/10» renders in order (number + separator resolve as one run) but is not isolated | S2 |
| S-8b | px heights on answer surfaces: network-CLI screen `max-height: 320px` (240 px ≤ 480 px wide); SmartSim debug `pre` 220 px (teacher debug only). | code reading | S3 |
| S-ST-NEW-1 | With the panel collapsed, question 1's heading starts at y 524 (desktop) / 582 (phone). PR #300 makes the panel open by default when instructions exist (owner decision), which pushes it further down by the panel height (200 px desktop, 274 px phone for this fixture). | measured | S3 |
| S-ST-NEW-3 | Visual questions begin with a 2-line keyboard paragraph. | `visual/HotspotView.tsx` `.vq-note` | S3 |

Not reproduced: horizontal page overflow (none at any viewport); the review screen already focuses its heading.

### 3.1 Owner decisions (recorded after the audit review)

| # | Decision |
|---|---|
| D1 | Exam details: keep the PR #300 rule exactly — open when meaningful instructions exist, collapsed otherwise. **No automatic collapse after question 1.** |
| D2 | Chemistry: the periodic-table cells move to Phase 21E.5. No change to chemistry or SmartSim engine files. |
| D3 | Physics RTL: fix the direction of equations and units in the student UI only, when possible without touching equations or simulation accuracy, with real RTL / LTR tests. |
| D4 | Highest priority: recover a question after a JavaScript load failure **without reloading the exam**; prove `?r=n` in Chromium on a production build; restrict the URL to the application's own trusted assets (never an external file); prove no double evaluation of side-effecting modules and no loss of answer state. |
| D5 | Student safety: **no automatic reload** of the exam page; recovery never loses answers, never ends a strict attempt, never repeats a save or submit request. |
| D6 | Production code stays unchanged until PR #300 merges; then a normal merge of the latest `main` into this branch, then development per `AGENTS.md`. |
| D7 | Evidence: Chromium at every viewport, fail-first tests, mutations for the critical cases, exact-head CI. |

### 3.2 Recovery-mechanism probe (Vite production build, Chromium 141)

Before touching the product, the `?r=n` mechanism was exercised on a minimal Vite + React production build that reproduces the
app's chunk shapes (`__vitePreload` with JS `modulepreload` + CSS dependencies, two `lazy()` wrappers of one chunk, a chunk
shared by two entries). Module-scope counters record how many times each module is evaluated. The probe lives in the
scratch area only (it is not shipped); the real-app proof is the 21E.3 harness on the production build of the head.

| Scenario | Observation | Consequence for the design |
|---|---|---|
| Entry chunk returns 503 once | error `TypeError: Failed to fetch dynamically imported module: <origin>/assets/A-….js`; a re-arm that imports `A-….js?r=1` renders the component; **A evaluated once**; a second `lazy()` of the same chunk (named export) resolves to the **same** `?r=1` record (still one evaluation); the typed answer outside the boundary is intact | in-place recovery works; the retry number must be **per chunk URL, shared by every wrapper**, so wrappers never create two instances |
| A shared dependency chunk returns 503 once | the error names the **entry** URL (not the dependency); the failed dependency stays in the module map for the page's lifetime, so `A?r=1`, `A?r=2` and an unrelated entry `B` that also imports it all fail; the dependency is requested only once | not recoverable in place — after one failed retry the card must say so and offer only safe options (§5 A); retries must be bounded |
| A CSS dependency fails | Vite throws `Error("Unable to preload CSS for <url>")` (not a chunk error); re-running the factory renders the component **without** its stylesheet; re-adding `<link rel=stylesheet href="<path>?r=1">` (validated same-origin `/assets/*.css`) restores it | handle the CSS case explicitly |
| URL taken from the browser error | only `Failed to fetch dynamically imported module:` / `error loading dynamically imported module:` messages carry a URL; Safari's message carries none | accept the URL only when it parses, is same-origin, matches `^<BASE>assets/[A-Za-z0-9._-]+\.js$` (no sub-path, no query kept); otherwise re-run the original factory — never import anything derived from data |

**Dependency recovery with a scoped import map.** A second probe (`A → mid → leaf`, plus `B → mid` and `C → leaf`, every
module counting its evaluations) showed that Chromium 141 accepts an import map inserted after start-up when its rules are
**scoped to referrers that have not resolved anything yet**: a `<script type="importmap">` whose scopes are the retry URLs
(`A?r=1.`, `mid?r=1.`, …) redirects only the retry graph to fresh copies of the poisoned modules, and never touches the rest of
the application. Three design errors were found and fixed by measurement before any product code was written:

| Version | Scenario | Measured | Fix |
|---|---|---|---|
| v1 — remap every module first requested by the failed attempt | entry only fails; later `B` (original) imports `mid` / `leaf` | `mid` and `leaf` **evaluated twice** (the healthy originals were never poisoned, so `B` evaluated them while the retry had evaluated the `?r` copies) | remap only modules whose original record can never evaluate |
| v2 — remap failed preloads + entry + every static-import ancestor of a failed module | `B` after `A` recovered | `mid`, `leaf` re-mapped to `?r=2.` → evaluated twice | a recovered module keeps its recovered URL for every later graph |
| v2 | `mid` and `leaf` both fail | `leaf` never remapped (the search stopped at the failed `mid`) → endless failure | read the imports of failed modules too |
| **v3 (adopted)** | leaf fails (503 and dropped connection), A first or B first; entry only; two failed levels twice | **every module evaluated exactly once in every scenario**; each failed view recovered in place; no page error | — |

The static edges come from the chunk header (`import … from "./x.js"`, `import "./x.js"`, `export … from "./x.js"`, after
Vite's optional `const __vite__mapDeps=…` line and `/* empty css */` comments; nothing after the first other token). On the
production build of `b8a65f1` this header parser matches the full-text cross-check on **all 348 chunks (1,081 edges, 0
mismatches)**.

### 3.3 Lazy-module audit (multi-agent, adversarially verified)

Every `lazy()` / `import()` reachable from `StudentExamPage` was mapped by four parallel analysts (registries, SmartSim,
card / page pieces), each risk claim checked by an adversarial verifier, then a completeness critic swept the static exam
closure (283 files). Results that change the design:

| Finding | Consequence |
|---|---|
| Registry entries for hotspot, label diagram and open response are 67–72-byte re-export stubs; the real code is a shared chunk (`HotspotView`, `VisualCanvas`, `OpenResponseView`) | entry-only `?r=n` cannot recover them → dependency recovery (above) is required |
| `coding@1` / `coding@2` share one chunk; `RichPrompt` has six lazy wrappers **and** a static importer (always evaluated before the exam renders); `CodeStimulusView` / `ScenarioView` have lazy and static importers | one module-level state per chunk URL; never retry a module of the static student closure (`RichPrompt`, `RichContentRenderer`, `StudentQuestionCard`, `studentAttemptContext`, `index`, `react`, runtime) — they cannot fail inside the exam. *(Corrected in Review Fix 1, §12: this audit also listed `trustedSimPlugins` and `smartSimUiRegistry`, but both load lazily with the SmartSim / composite question, so they can fail inside a running exam. Keeping them on the deny-list made most SmartSim dependency failures unrecoverable. They were removed from `NEVER_REMAP`; their single evaluation rests on the remap rule, measured by the harness.)* |
| Module-scope side effects with **medium / high** duplication impact: `trustedSimPlugins` (nine registrations), `studentAttemptContext` (two contexts), `monacoEngine` (`globalThis.MonacoEnvironment`), `echartsEngine` / `echartsAdvanced` (extension installs) | `studentAttemptContext`, `monacoEngine` and the ECharts engines are in the static closure or behind a module's own `import()` and are never a remap target (deny-list + build guard). `trustedSimPlugins` is remapped only while its original record can never evaluate (a failed fetch), so it is still evaluated once *(corrected in Review Fix 1)* |
| `CompoundQuestion` renders registered part renderers outside `StudentQuestionCard`; `SectionShellHeader` (presentation mode) renders outside the planned page section; `AssessmentActivityHost` is a plain lazy | boundary at every renderer host; the section shell gets **its own** `section` boundary beside the page boundary, not inside it *(corrected in Review Fix 1: the record said the page boundary encloses it)*; every exam-path lazy uses the recoverable loader |
| Any error that reaches the root boundary unmounts `StudentExamPage`; in a strict attempt the unmount fires the strict exit (`StudentExamPage.tsx` pagehide / unmount handlers) and the attempt **ends** | an outer exam-surface boundary inside the page keeps the page (and its answers, autosave and strict state) mounted |
| `DataChart`'s own fallback tells the student to reload the page | the copy must not suggest a reload during a strict attempt (D5) |
| Monaco grammar loaders reject unhandled; a stalled (not failed) import never rejects | no global `unhandledrejection` / `vite:preloadError` hooks; never retry on a stall (show a calm slow-loading status at most) |

## 4. Risk analysis

| Risk | Where | Mitigation in this phase |
|---|---|---|
| A recovery path that reloads the page ends a strict attempt or drops an edit | per-question recovery | never auto-reload inside the exam; a manual reload is offered only when every answer is server-confirmed **and** the policy is not strict |
| A retry that re-imports a module creates a second instance of it | cache-busted import | only a chunk whose load **failed** (never evaluated) is re-requested; one retry URL per chunk shared by all wrappers; its static imports resolve to the already-loaded shared chunks (same module records) — measured in §3.2 |
| A failed shared dependency can never load again in this page | browser module map | scoped import-map remap of the failed modules and their ancestors only (§3.2 v3); when the browser cannot merge a late import map, or the network is still down, the card offers only safe options (continue with other questions; a manual reload only when every answer is server-confirmed and the attempt is not strict) |
| A remap evaluates a module a second time | remap set | only modules whose original record can never evaluate are remapped; recovered modules are reused; attempts are serialized; deny-list of side-effecting shared modules; measured per module in Chromium (§3.2) and re-measured on the app build |
| An error card leaks internals or the answer key | fallback UI and logs | fixed Arabic copy only; the production log carries the fixed code + an allow-listed error name (the `ErrorBoundary` rule) |
| Recovery schedules a save / submit, or loses an answer | page state | answers live in the page, outside the boundary; a failure or a retry never touches them (request counts are measured) |
| Focus moves while typing / on autosave / on a timer tick | focus contract | focus is requested only by explicit transitions (a counter, like the existing navigation contract) |
| Timer announced repeatedly (rerender, resync, resume, reload) | announcer | once per attempt identity and threshold, remembered per tab; pure, unit-tested |
| «تم الحفظ» announced before the server confirmed it | save announcer | announcements are derived from `deriveSaveState` (server-confirmed revision) only |
| Bigger touch targets break the exam layout | CSS | scoped to coarse pointers / phone widths and to the listed student controls; measured with real bounding boxes and screenshots |
| Bidi controls leak into saved answers | LTR islands | semantic `dir="ltr"` / `<bdi>` in markup only; no control characters in any string |
| Initial JS grows | bundle | all new code in the lazy student / question chunks; bundle guard and the ≤ +1 KB target checked on the head |
| Overlap with other windows | files | Window 2 (21E.2) owns teacher files; chemistry / SmartSim engines untouched; shared renderers only for the listed student-side fixes |

## 5. Design (implemented in `50d72be`)

**A — per-question fault isolation (model v3 of §3.2).**
- `src/recoverableLazy.ts` — `recoverableLazy(chunkName, factory)`:
  - The first load is the unchanged factory, so the normal path is byte-for-byte today's behaviour.
  - On a retry it first re-calls the original factory. This costs nothing in Chromium and recovers browsers that do not
    cache failures without any remap.
  - Only then, serialized page-wide, it builds the remap set, inserts one scoped import map and imports `<entry>?r=<g>.`
    (the trailing dot keeps scope prefixes unique). The remap set is: the entry, the modulepreload links that failed, and
    every static-import ancestor of a failed or already-recovered module.
  - *Review Fix 1 (§12):* the remap is used only when the rejection carries Chromium's wording ("Failed to fetch
    dynamically imported module"), the engine measured to keep a failed module failed for the page's lifetime. Every
    step is bounded in time (source read 15 s, import 20 s, stylesheet 15 s). A recovery that would need a module still in
    flight is refused (`recovery-busy`) instead of waiting, so one stalled recovery never blocks the others. *(Corrected in
    Review Fix 2, §13: the queue is still shared, so a stalled recovery delays a later one by up to its bounds; a chain of
    slow source reads could add up to minutes. All source reads of one recovery are now bounded together, 30 s.)*
  - On success every remapped module is recorded as recovered and reused by every later graph.
  - The entry URL is accepted only from a `TypeError` whose message names a same-origin `<BASE>assets/<chunkName>-<8 base36>.js`.
  - Remap and source-read URLs are validated the same way, and the deny-list is never remapped.
  - CSS failures re-link a validated `?r=` stylesheet. *(Review Fix 1: **every** failed stylesheet of the load is re-linked,
    and the retry fails closed if one of them still fails — the question never renders without its stylesheet.)*
    *(Review Fix 2 limited the re-link to the loader's own stylesheets. Review Fix 3, §14: Vite links a shared stylesheet only
    for the first load that needs it, so "own" missed a stylesheet another loader requested first. A retry now re-links and
    awaits **every** stylesheet that failed in the page, each bounded; it fails closed only if one of the loader's own is still
    down. A first load in a page where a stylesheet already failed re-links it first. A sibling that shares a stylesheet that
    stays down can still render without it; see §14.6.)*
  - No global error hooks, no reload, no `lazyWithRetry` inside the exam.
- `src/student/exam/QuestionErrorBoundary.tsx` around every renderer host: the `StudentQuestionCard` body, the
  `CompoundQuestion` parts and the composite parts. The page boundary in `StudentExamPage` covers the current page,
  scenario and section context; the presentation section shell has its own `section` boundary beside it *(corrected in
  Review Fix 1)*. An outer exam-surface boundary keeps `StudentExamPage` mounted. Review Fix 1 adds a `review` boundary
  around the review screen, a `part` boundary around the shared scenario, and `stem` / `inline` / `block` boundaries
  around rich-content leaves (§12).
- Fallback: «تعذّر عرض هذا السؤال الآن», with reassurance that other answers are kept, and «إعادة المحاولة».
- After a failed retry in a running exam, the fallback suggests continuing with other questions. It shows
  «إعادة تحميل الصفحة» **only** when every answer is server-confirmed and the attempt is not strict.
- A build guard asserts that every declared chunk name exists, exports `default`, and that the header parser matches
  every chunk. *(Review Fix 1: it now also ties each declared name to its import path, reads `NEVER_REMAP` from the source
  and rejects any declaration on it, and requires at least 50 declarations — §12.)*

**B — focus.** A focus-request counter joins the existing navigation focus contract: start / resume / next attempt / cover
start → the question heading; submit / timeout / strict end → the result heading (`tabIndex=-1`). Visible focus styling on
the programmatic targets.

**C — timer.** A pure threshold module (5 min, 1 min; once per attempt identity; a jump past both announces only the lower;
remembered per tab) and one polite page announcer. Time computation, expiry and submission untouched.

**D — save status.** The visible label is unchanged but no longer live; the announcer says only: offline, save failed
(retries exhausted), and recovery to saved after a problem state.

**E / F / G.**
- Coarse-pointer / phone 44 px minimums on the listed student controls. Chemistry periodic-table cells are deferred to
  21E.5 (D2).
- `dir="ltr"` / `<bdi>` islands for CLI, the notification grade and the install-card brand. Physics equations and units
  are isolated in the student scene markup only, with no change to equations or simulation values (D3).
- `scroll-padding` for the sticky bars. *(Replaced in Review Fix 1: the root scroll padding doubled the element scroll
  margins, and the focus-in reveal scrolled the page between a pointer press and its release. A keyboard-intent reveal
  replaces both — §12.)*
- rem / `min()` instead of px max-heights on the answer surfaces.

**H.**
- A short visual-question hint plus an expandable «كيف أستخدم لوحة المفاتيح؟».
- A tighter section context.
- The PR #300 details rule is kept exactly: open when meaningful instructions exist, collapsed otherwise, and **no
  automatic collapse after question 1** (D1).

## 6. Acceptance tests (planned — see §8 for the implemented tests)

| # | Requirement | Test |
|---|---|---|
| 1–3 | failed renderer → card → retry; other questions usable; answers survive | `recoverableLazy` unit tests; `StudentExamPage` with a renderer that fails, then loads; Chromium harness A1–A4 |
| 4 | no extra save / submit | request counts in the page test and the harness (A5, B3) |
| 5 | focus after start / submit / result | page tests (`document.activeElement`); harness B1–B2 |
| 6–7 | 5 / 1-minute announcements, once | pure module tests (boundaries, jumps, rerenders, resume, reload) + page test with fake timers; harness C1 |
| 8 | calm save announcements | page test over the full cycle; harness D1 |
| 9 | touch targets | CSS guard + harness E1–E4 (phone bounding boxes) |
| 10 | LTR isolation | component tests (`dir`, `<bdi>`) + Chromium visual-order probe |
| 11 | details disclosure keeps the PR #300 rule | existing UX-7b-1 cases kept green |
| 12 | clearance at 640×450 | harness G1–G2 at all viewports |
| 13 | keyboard-only workflow | harness: start, answer, navigate, review and submit by keyboard |
| 14 | no leak | fallback text and logged payload asserted free of URLs, messages, answers |

## 7. Implementation

All new code sits in the lazy student and question chunks. The initial graph gains nothing but the shared recovery
helper, which the registries import (§8.5).

| Area | Files | What changed |
|---|---|---|
| A — recovery runtime | `src/recoverableLazy.ts` (new) | Model v3 of §3.2. Exports `recoverableLazy(name, factory)`, which recovers in place with a remap, and `retryableLazy(name, factory)`, for shared chunks without a `default` export, which only re-runs its factory. *(Review Fix 1: `retryableLazy` could never recover in Chromium, which caches the failed import. It is replaced by `recoverableSharedLazy(name, factory)`, which remaps like `recoverableLazy` and then picks the one export tagged `Module` whose `default` is a component — §12.)* Also exports `rearmFailedLoads()`, `trustedAssetUrl`, `parseStaticImports`, `remapSet` and `NEVER_REMAP`. The only computed `import()` in `src/` is the `importUrl` of the browser environment, and it is reached only with validated URLs (§9). |
| A — boundaries | `src/student/exam/QuestionErrorBoundary.tsx`, `src/student/exam/questionRecovery.ts` (new) | Variants: question, part, page, section and exam. A stem boundary falls back to the plain question text. Retry re-arms the failed loaders and moves focus to the page heading; if the retry fails again, focus returns to «إعادة المحاولة». *(Review Fix 1: a stem shows the plain text **with** a compact notice and retry, never silently; a retry re-arms only that card's own loaders; focus follows the recovered part, and a late failure takes focus only if it was still on the card — §12.)* «إعادة تحميل الصفحة» appears only after a failed retry, when every answer is server-confirmed and the policy is not strict. The log carries only `{ code }`. |
| A — hosts | `StudentExamPage.tsx`, `StudentQuestionCard.tsx`, `CompoundQuestion.tsx`, `questionTypes/student/CompositeResponse.tsx` | Boundaries cover the exam surface (keeping the page mounted), the page (section shell, scenario, section context), the question stem, the code stimulus, the answer area, compound parts and composite parts. |
| A — loaders | `questionTypes/studentRegistry.tsx`, `trustedSim/smartSimUiRegistry.ts`, `richContent/RichContentRenderer.tsx`, `AssessmentActivityContext.tsx`, `StructuredExamSection.tsx`, `StudentQuestionCard.tsx` | `lazy(() => import("literal"))` becomes `recoverableLazy("ChunkName", () => import("literal"))`. Every import stays a literal repository path, and plugin identities and version families are unchanged. `coding@1` and `coding@2` share one `CodingResponse` loader, as they already shared one chunk. Only the SmartSim UI registry's loaders changed; no engine file did (D2). |
| A — copy | `charts/DataChart.tsx` | The chart's fallback no longer tells the student to reload the page (D5). *(Review Fix 1: this applies inside the exam only; teacher and portal surfaces keep the original reload advice.)* |
| B — focus | `StudentExamPage.tsx`, `studentexam-pro.css` | On a screen change (never from «loading»), the exam screen focuses the page heading without scrolling the page (`preventScroll`, then `scrollIntoView({block:"nearest"})`). The result and strict-end screens focus the `h1` (`tabIndex=-1`, `.iex-result-title`) and scroll to the top. Typing, autosave and timer ticks never move focus. Visible focus ring, no `outline:none`. |
| C — timer | `student/exam/examAnnouncements.ts` (new), `StudentExamPage.tsx` | `timerAnnouncement(remainingMs, announced)` covers 5 min and 1 min; a jump past both thresholds announces only the lower one. Thresholds are remembered per attempt in `sessionStorage` (`timerNoticeKey`), so re-renders, resyncs, resumes and reloads never repeat them. One polite announcer (`role=status`, `aria-live=polite`, `aria-atomic`) is updated imperatively, with no React state. |
| D — save | `examAnnouncements.ts` (`saveAnnouncement`), `student/exam/SaveStatus.tsx` | The visible label is no longer a live region. The announcer speaks only for offline, failure after retries, and recovery to «تم الحفظ» after a problem. |
| E — touch | `studentexam-pro.css`, `visual/visual.css`, `inlineCloze/inlineCloze.css`, `notifications/notifications.css`, `studentportal-pro.css` | `(pointer: coarse)` and phone-width minimums of 44 × 44 px for CLI blanks, cloze controls, label chips and dropdowns, label zone buttons, and the notification header action at every width. |
| F — LTR | `QuestionField.tsx`, `ui/ltrIsland.ts` (new), `notifications/NotificationBell.tsx`, `pwa/InstallAppCard.tsx`, `pwa/InstallAppEntry.tsx`, `pwa/InstallGuidanceViews.tsx`, `physicsLab/LabScene.tsx` | CLI `<pre dir="ltr">` and blanks `dir="ltr"`. The grade «8.5/10» and the brand «Tadris+» are wrapped in `<bdi dir="ltr">` (markup only; no control characters in any string). The Arabic physics bar-chart title uses SVG `direction="rtl"` with `textAnchor="end"`; equations, units and simulation values are untouched (D3). |
| G — clearance | `studentexam-pro.css`, `networkCli/networkCli.css`, `StudentExamPage.tsx` | `:root:has(.iex-bottom-nav)` gets scroll padding of 72 px (top) and 96 px (bottom). A focus-in reveal scrolls a focused control that is partly under a sticky bar, because Chromium does not scroll a partly visible element on focus. *(Replaced in Review Fix 1: this reveal also ran for focus caused by a mouse press or a touch and moved the control between press and release, which corrupted answers (the four blockers). The root scroll padding is removed, and `student/exam/keyboardReveal.ts` reveals only focus that a navigation key caused — §12.)* The network-CLI screen uses `min(20rem, 55vh)` (`min(15rem, 50vh)` at ≤ 480 px) instead of px heights. |
| H — friction | `visual/HotspotView.tsx`, `visual/LabelDiagramView.tsx`, `visual/visual.css`, `studentexam-pro.css` | A one-line hint plus `<details class="vq-keyboard-guide">` «كيف أستخدم لوحة المفاتيح؟», referenced by `aria-describedby`. Tighter `.iex-section-context`. The details disclosure keeps the PR #300 rule unchanged (D1). |
| Guards | `scripts/check-bundle-budget.mjs` | `checkChunkRecovery`: every `recoverableLazy` name must exist as a built chunk with a `default` export, and none may be on `NEVER_REMAP`. *(Corrected in Review Fix 1: at `92f4326` the guard did not read `NEVER_REMAP`, did not tie the name to its import path, and had no minimum count. All three are now enforced — §12.)* The chunk-header parser (`STATIC_IMPORT_HEADER_SOURCE`, shared with the runtime) must match a full-text scan on every chunk. |
| Evidence tooling | `scripts/check-student-exam-browser-21e3.mjs`, `scripts/mutate-21e3.mjs` (new) | The Chromium certification harness (§8.3) and the focused mutation campaign (§8.4). |

Nothing in grading, hidden-answer protection, submission identity, attempt policy, the save / submit requests or server
persistence changed. No API file changed, and the Runner is untouched.

## 8. Evidence

### 8.1 Fail-first (executed against the defective baseline)

The head's tests were copied into a detached worktree of `31f4008` (dependencies symlinked) and run there. Afterwards the
worktree was restored, and `git status` there is clean.

| Test file (head) | On `31f4008` | On the head | Representative failing assertion on the baseline |
|---|---|---|---|
| `src/StudentExamPage.ux21e3.test.tsx` (15) | **13 failed**, 2 passed | 15 passed | A (5 cases): the injected renderer error escapes the page uncaught (`Error: internal detail: expectedAnswer=42 at …`), so the exam is gone and there is no card. Others: `Unable to find an element by: [data-testid="exam-announcer"]` (C, D); `expected <body>… to be <h1>` (result focus); `expected '' to contain 'iex-page-heading'` (start focus); `expected null to be 'ltr'` (CLI); `expected "vi.fn()" to be called 1 times, but got 0 times` (reveal) |
| `src/StudentQuestionCard.stem21e3.test.tsx` (1) | **1 failed** | 1 passed | `expected "error" to be called with arguments: [ '[QuestionErrorBoundary]', … ]`: the failing stem escapes the card |
| `src/StudentExamPage.ux7b1.test.tsx` (23, 3 cases updated) | **3 failed** | 23 passed | the save label is the live region on the baseline (`expected null to be 'exam-announcer'`) |
| `src/StudentExamPage.reliability.test.tsx` (29, case 16 updated) | **1 failed** | 29 passed | `16: exactly ONE polite live region (the page announcer, 21E.3)` |
| `src/pwa/InstallAppCard.6a.test.tsx` (43, brand matcher updated) | **5 failed** | 43 passed | the brand is not a `<bdi dir="ltr">` island |
| `src/recoverableLazy.21e3.test.tsx`, `src/student/exam/exam21e3.units.test.tsx` | cannot load (the modules are new) | 54 + 18 passed | not counted as fail-first |

Two cases pass on the baseline and are **pins**, not fail-first evidence:
- «a page that opens directly on the questions does not move focus»;
- «typing and the autosave that follows never move focus».

«an untimed exam never announces time» fails on the baseline only because the announcer does not exist there. It is
behaviourally a pin of silence.

### 8.2 Validation on the head

This is the final tree: the head's production code and tests, plus this record and the mutation-script output change. It
was run locally on the 4-core container. CI results on the exact head are in the pull request.

| Check | Command | Result |
|---|---|---|
| C1 root suite | `npx vitest run` | **941 files, 12,294 tests passed, 0 failed**. The baseline `31f4008` has 937 / 12,205, so this phase adds 4 files and 89 tests. |
| C2 lint | `npm run lint` | 0 errors, **125 warnings (= baseline)**. The warning set is identical except two baseline `exhaustive-deps` messages in `StudentExamPage.tsx` that list the same names in another order. |
| C3 typecheck | `npx tsc -b` | clean |
| C4 / C5 build + bundle guard | `npm run build` | passed (§8.5) |
| C6 Runner unit | `npm --prefix runner test` | 407 passed, 0 failed (no Runner file changed) |
| C11 diff-check | `git diff --check`, `git diff origin/main --check` | clean |

One intermittent failure was observed in an earlier full run on `4f014ec`: `src/phase8b.test.tsx` «100 loaded → 30 newest;
… focus on the first new row» (`expected 'BODY' to be 'TR'`).
- It is Phase 8B code. The component (`AuditHistoryPanel`) imports nothing this phase changed.
- It passed 3 of 3 isolated runs, and it passed in the final full run above.
- It is already recorded as a load-timing intermittent in `docs/enterprise-interactive-charts-21a1.md`.
- It is not patched here (AGENTS.md §12).

### 8.3 Chromium certification (production builds, Chromium 141, `scripts/check-student-exam-browser-21e3.mjs`)

Viewports:
- `desktop` 1280×900;
- `desktop-150pct` 853×600 @1.5 (a 1280×900 screen at 150 %);
- `desktop-200pct` 640×450 @2 (200 %);
- `phone` 390×844 @2, touch.

The mock student API uses student-sanitized payloads. The timed attempt crosses 5 minutes during the run. Every served
JS module ends with an evaluation counter, and a navigation marker detects any reload.

| Scenario (failure injected) | Viewports | `31f4008` | Head |
|---|---|---|---|
| `entry`: the hotspot renderer entry chunk returns 503 once | 4 | desktop **7/18**. The root `ErrorBoundary` replaces the exam (`[ErrorBoundary] {code: chunk-load}`), and A1–A4 and B–G fail. A5–A9 pass only vacuously, because nothing recovers. | **76/76** |
| `dependency`: the shared `HotspotView` and `VisualCanvas` chunks fail (the error names the entry) | desktop, phone | not recoverable on the baseline (§3.2) | **40/40** |
| `css`: the `VisualCanvas` stylesheet fails | desktop | — | **18/18**; the recovered question has its stylesheet (A5b) |
| `strict`: a strict attempt with the `HotspotView` failure | desktop, phone | — | **40/40**; no reload action, and the attempt is not ended |
| `stilldown`: the entry answers 503 to its first 3 requests, retry URLs included | desktop | — | **18/18**. Two retries fail: the card says «ما زال التحميل متعذّرًا», focus stays on «إعادة المحاولة», and the manual «إعادة تحميل الصفحة» appears only because every answer is saved and the attempt is not strict. The third retry recovers in place. There is no automatic retry and no reload. |
| no failure (the rest of the workflow) | 4 | **48/76**. B1, B2, C1, D1 and F1 fail at every viewport; G1 fails at desktop; E1–E3 fail on the phone. A2 cannot apply without a failure. | (covered by the rows above) |

The checks in every scenario on the head are:
- **A**: the exam stays mounted; a card that leaks no internals; other answers kept; retry renders the question; its
  stylesheet is present; no save, submit or start caused by the failure; no reload; every recovery URL is a same-origin
  `/assets/<name>-<hash>.(js|css)?r=<n>.`; **no module evaluated twice and every recovered chunk evaluated once**; only
  start, save and submit requests.
- **B**: focus on the question heading after start and on the result heading after submit; exactly one submit.
- **C1**: the 5-minute announcement exactly once.
- **D1**: no announcement for each pending, saving and saved cycle.
- **F1**: the CLI island.
- **G**: the focused textarea is not under the bottom navigation; no horizontal overflow.
- **E** (phone): CLI, cloze, label and notification controls ≥ 44×44.

Measured values, baseline → head:

| Measure | `31f4008` | Head |
|---|---|---|
| focus after start (keyboard), every viewport | `<body>` | `h2.iex-page-heading` |
| focus after submit, every viewport | `<body>` | `h1.iex-result-title` (top 59–63 px) |
| focused answer textarea, 1280×900 | y 800–940, **under the bottom navigation** | y 570–710, clear |
| focused CLI blank, 640×450 (200 %) | y 376–408, **under the bottom navigation** | y 204–236, clear |
| phone CLI blank / cloze select / label chip / label select / zone button | 187×32 / 109×40 / 74×40 / 110×40 / 52×40 | 187×44 / 109×44 / 74×44 / 110×44 / 52×44 |
| polite announcements in the run | every save label change, three per edit, and no timer announcement | «تنبيه: بقيت 5 دقائق…» once; nothing for the ordinary save cycle |
| horizontal overflow | none | none |

Screenshots (15 per viewport and scenario, from the portal to the result) are kept with the harness output (`HARNESS_OUT`,
which is not committed). The handoff report lists the ones reviewed.

### 8.4 Mutation campaign (`scripts/mutate-21e3.mjs`, AGENTS.md §9)

The campaign runs in isolation; no other test run was active. It has 36 mutants across 9 production files, and each runs
its named suites. Every file is restored byte-for-byte (sha256-verified, also on interruption), and `git diff` on the
mutated files is clean afterwards.
- Run 1 (`50d72be`): **31 killed, 5 survived** (R15, R16, B05, B06, P03). Each survivor was a finding, and each was closed
  by a stronger test in `cb98b57`.
- B06 survived once more because the stem test matched the Suspense fallback, which shows the same text. The test now
  waits for the real failure (`13d4912`).
- Final run on `4f014ec`: **36 / 36 KILLED, 0 survived, 0 timeout, restored: true**. The mutated sources are byte-identical
  on the final head (sha256 checked against the ledger).

| Id | Planted defect | Outcome | Killed by (first failing case; total failing) |
|---|---|---|---|
| R01-origin | URL validator: the same-origin check removed | KILLED | `recoverableLazy.21e3.test.tsx` › refuses another origin (6) |
| R02-query | URL validator: a query string accepted | KILLED | `recoverableLazy.21e3.test.tsx` › refuses a query (3) |
| R03-chunk-name | URL validator: the chunk-name match removed | KILLED | `recoverableLazy.21e3.test.tsx` › refuses a different chunk name when one is required, and css for js (3) |
| R04-hash-shape | URL validator: hash widened to `[0-9A-Za-z]{6,}` | KILLED | `recoverableLazy.21e3.test.tsx` › refuses a short hash (2) |
| R05-assets-prefix | URL validator: the `<base>assets/` prefix check removed | KILLED | `recoverableLazy.21e3.test.tsx` › refuses outside assets (3) |
| R06-typeerror-only | entry URL taken from any error, not only a `TypeError` | KILLED | `recoverableLazy.21e3.test.tsx` › ignores an Error (not a TypeError) (1) |
| R07-no-ancestors | remap set: static-import ancestors of a failed module dropped | KILLED | `recoverableLazy.21e3.test.tsx` › a failed leaf brings its ancestors on the path, never the healthy side branch (4) |
| R08-healthy-remapped | remap set: every module of the graph remapped (healthy ones too) | KILLED | `recoverableLazy.21e3.test.tsx` › the entry alone when nothing below it failed (5) |
| R09-recovered-remapped | remap set: already recovered modules remapped again | KILLED | `recoverableLazy.21e3.test.tsx` › a recovered module is not remapped again, but a plain importer of it is (2) |
| R10-no-settled-reuse | a recovered URL is not reused by later wrappers / graphs | KILLED | `recoverableLazy.21e3.test.tsx` › two wrappers of one chunk and a later graph reuse the recovered URL: one evaluation, no second generation (1) |
| R11-never-remap-ignored | the `NEVER_REMAP` deny-list ignored | KILLED | `recoverableLazy.21e3.test.tsx` › a module that must never be evaluated twice refuses the remap (no import, the card stays) (1) |
| R12-no-original-first | a retry skips the original factory and remaps at once | KILLED | `recoverableLazy.21e3.test.tsx` › entry failure: the retry re-calls the original, then imports <entry>?r=1. under a map scoped to the retry URL only (2) |
| R13-map-unscoped | import-map scopes keyed by the original URL instead of the `?r=<g>.` URL | KILLED | `recoverableLazy.21e3.test.tsx` › entry failure: the retry re-calls the original, then imports <entry>?r=1. under a map scoped to the retry URL only (3) |
| R14-no-css-relink | a failed stylesheet is not re-linked before the retry | KILLED | `recoverableLazy.21e3.test.tsx` › a CSS dependency failure re-links a validated ?r= stylesheet, then re-calls the original (no JS remap) (1) |
| R15-shape-unchecked | a recovered module without a component `default` accepted | KILLED | `recoverableLazy.21e3.test.tsx` › a recovered module that is not a component fails closed (1) |
| R16-retryable-remaps | `retryableLazy` (shared chunk) allowed to remap | KILLED | `recoverableLazy.21e3.test.tsx` › retryable (shared chunk without default): a retry never imports another URL (1) |
| B01-no-rearm | «إعادة المحاولة» does not re-arm the failed loaders | KILLED | `student/exam/exam21e3.units.test.tsx` › chunk failure → card (no internals) → «إعادة المحاولة» → the question renders; the failed React.lazy is replaced (1) |
| B02-log-leaks | the boundary log carries the error message | KILLED | `StudentExamPage.ux21e3.test.tsx` › shows a recovery card for THAT question; the exam, the other questions and the answers stay; no save / submit; nothing leaks (2) |
| B03-reload-before-retry | «إعادة تحميل الصفحة» offered before any retry | KILLED | `StudentExamPage.ux21e3.test.tsx` › after a failed retry the card offers a reload ONLY when everything is saved and the attempt is not strict (1) |
| B04-no-reset-on-new-question | the card does not reset for another question (`resetKey`) | KILLED | `student/exam/exam21e3.units.test.tsx` › a new question (resetKey) starts clean; a custom fallback replaces the card (1) |
| B05-no-focus-anchor | retry does not move focus to the question heading | KILLED | `StudentExamPage.ux21e3.test.tsx` › «إعادة المحاولة» renders the question again in place (no reload); focus returns to the question heading (1) |
| B06-whole-card-boundary | a failing rich stem renders nothing instead of the plain text | KILLED | `StudentQuestionCard.stem21e3.test.tsx` › shows the plain question text instead, keeps the answer area, and leaks nothing (1) |
| P01-reload-in-strict | reload offered in a strict attempt | KILLED | `StudentExamPage.ux21e3.test.tsx` › strict attempt: never a reload action, and the card says not to leave the page (1) |
| P02-reload-unsaved | reload offered while an answer is not server-confirmed | KILLED | `StudentExamPage.ux21e3.test.tsx` › an answer not yet confirmed by the server: no reload action after a failed retry (the edit could be lost) (1) |
| P03-focus-on-open | focus moved when the page opens directly on the questions | KILLED | `StudentExamPage.ux21e3.test.tsx` › a page that opens directly on the questions (legacy untimed) does not move focus (1) |
| P04-no-result-focus | no focus on the result heading after submit / end | KILLED | `StudentExamPage.ux21e3.test.tsx` › submitting focuses the result heading (exactly one submit) (1) |
| P05-no-start-focus | no focus on the question heading after start | KILLED | `StudentExamPage.ux21e3.test.tsx` › opening the page never moves focus; starting the attempt focuses the question heading (1) |
| P06-reveal-always | the focus-in reveal scrolls every focused control | KILLED | `StudentExamPage.ux21e3.test.tsx` › partly under the bottom navigation → revealed with the least scrolling; a visible control and typing never scroll (1) |
| P07-timer-no-memory | timer thresholds not remembered per attempt | KILLED | `StudentExamPage.ux21e3.test.tsx` › crossing 5 minutes is announced once; nothing every second; nothing before the threshold (2) |
| A01-timer-repeat | a threshold announced again on every tick | KILLED | `StudentExamPage.ux21e3.test.tsx` › crossing 5 minutes is announced once; nothing every second; nothing before the threshold (3) |
| A02-timer-early | a threshold announced a minute early | KILLED | `StudentExamPage.ux21e3.test.tsx` › crossing 5 minutes is announced once; nothing every second; nothing before the threshold (2) |
| A03-save-noisy | «تم الحفظ» announced after every ordinary save | KILLED | `StudentExamPage.ux21e3.test.tsx` › an ordinary edit is silent; going offline is announced; saving again after it is announced (3) |
| A04-label-live-again | the visible save label made a live region again | KILLED | `StudentExamPage.reliability.test.tsx` › 16: exactly ONE polite live region (the page announcer, 21E.3); the save label itself is not live (4) |
| L01-cli-not-isolated | the CLI `<pre>` loses `dir="ltr"` | KILLED | `StudentExamPage.ux21e3.test.tsx` › the command block and its blanks carry dir=ltr; the typed value is stored as typed (no bidi control character) (1) |
| L02-physics-title-ltr | the Arabic physics title loses `direction="rtl"` / `textAnchor="end"` | KILLED | `student/exam/exam21e3.units.test.tsx` › the notification grade, the install brand and the physics energy title are isolated in their components (1) |
| L03-island-drops-bdi | the LTR island helper drops the `<bdi>` | KILLED | `pwa/InstallAppCard.6a.test.tsx` › declined → the calm note AND the manual guidance (never masked); can be hidden; a later prompt works again (6) |

### 8.5 Bundle

Exact gzip (level 9) bytes, using the bundle guard's rules: the static closure of `index.html`'s module entry.

| | `31f4008` | Head | Δ |
|---|---|---|---|
| Initial JS (8 files) | 113,118 B (110.5 KB) | 113,107 B (110.5 KB) | **−11 B** (target ≤ +1 KB) |
| Initial CSS (1 file) | 35,797 B (35.0 KB) | 36,015 B (35.2 KB) | +218 B |
| Bundle guard | pass | pass; chunk recovery: 54 recoverable chunks emitted once with a `default` export; header parser matched 348/348 chunks (1,083 static edges) | |

## 9. Governance: the owner-authorized C32 exception

Phase 17A's guard C32 (`api/tests/coding-guards-17a.test.js`) and its 17B restatement (`api/tests/coding-guards-17b.test.js`)
forbid any non-literal `import()` in production source: no data-derived module may ever execute in the browser. In-place
recovery of a dependency needs exactly one computed import, of `<validated entry>?r=<g>.`. On 2026-10-12 the owner chose
"Narrow C32 exception" over the alternatives, which were to keep only entry-level retry or to drop in-place recovery. The
exception is:

| Item | Rule |
|---|---|
| Scope | One exemption: `src/recoverableLazy.ts`, pattern "non-literal dynamic import" (17A) / "non-literal import" (17B). Every other file and every other primitive stays forbidden, and the invariant over the rest of `src/` and `api/src/` is unchanged. |
| Pin (17A) | A test asserts that the exception list is exactly one entry and that the module contains exactly one non-literal `import()`, the environment's `importUrl: url => import(url)`. It also asserts that the importer has exactly two call sites, `env.importUrl(hit)` (an already recovered URL) and `env.importUrl(url(entry))`, and that the URL validator keeps its exact rules: same origin, no credentials, query or fragment, `<base>assets/<name>-<8 base36>.(js|css)`, rebuilt as `origin + pathname`. |
| Behavioural proof | `src/recoverableLazy.21e3.test.tsx` covers the URL matrix (other origin, credentials, query, fragment, sub-path, traversal, encoded separators, wrong extension, wrong hash shape, wrong chunk name, `javascript:`, `data:`, `blob:`) and shows that no unvalidated URL reaches the importer, the import map, a source read or a stylesheet. Mutants R01–R05 and R13 (§8.4) are killed. |
| Equivalent literal lazy (CM18, M17 and the per-type pins) | `recoverableLazy("Name", () => import("literal"))` is accepted where `lazy(() => import("literal"))` was required. The literal path is the same, and the guards now also require the declared chunk name to match it. The build guard checks that every declared name is a real chunk with a `default` export. *(Review Fix 1: `recoverableSharedLazy("Name", () => import("literal"))` is the same shape for a shared chunk, which must have **no** `default` export. It replaces `retryableLazy`; the computed import, its two call sites and the URL validator are unchanged.)* |

## 10. Limitations, risks and deferrals

| Item | Status |
|---|---|
| Safari / WebKit | The rejection carries no URL, so there is no remap. A retry re-runs the original factory, which recovers a browser that does not cache failures. Otherwise the card stays, with the safe options only. Not measured here: no WebKit in this environment. |
| Firefox | The message wording is recognised (`error loading dynamically imported module: <url>`), but the harness ran in Chromium only. Late import-map merging is newer in Firefox, and an older engine falls back to the safe card. *(Review Fix 1, finding 7: single evaluation under a remap depends on the browser keeping a failed module failed, which is measured only for Chromium. The remap is therefore used only for Chromium's wording; in Firefox a retry re-runs the original factory and never imports a second copy.)* |
| Older Chromium (no late import-map merge) | The remapped attempt fails closed, giving the same safe card with no reload. |
| A stalled (never-settling) chunk load | It is never retried, because a retry would race a load that may still evaluate. The Suspense loading state remains. A stalled **recovery** step is bounded (Review Fix 1): after its limit the card returns, and the modules it touched stay "in flight", so any recovery that would need one of them is refused rather than loading a second copy. A late success is still recorded. |
| Modules of the static student closure (`NEVER_REMAP`) | They cannot fail inside a running exam because they load before it. If one did, the graph is refused (`recovery-refused`) and the safe card stays. *(Corrected in Review Fix 1: `trustedSimPlugins` and `smartSimUiRegistry` were on this list but are not in the static closure; they were removed. The list is now `index`, `rolldown-runtime`, `react`, `StudentPortal`, `StudentQuestionCard`, `studentAttemptContext`, `RichPrompt`, `RichContentRenderer`, `PresentationRoot`, `monacoEngine`, `echartsEngine`, `echartsAdvanced`, and the build guard checks it.)* |
| Network still down | Measured by the `stilldown` scenario. While loads keep failing, the card stays and offers only the safe options. A strict attempt never gets a reload action (`strict` scenario and P01), and no attempt gets one while offline (Review Fix 1). *(Corrected in Review Fix 1: the record said "there are no automatic retries". One exists: once the page has recovered a module, a **first** load that fails with a cached failure goes straight to the bounded, serialized remap, so a graph that shares the recovered module loads without a card. It never reloads and never repeats. Every other retry is the student's.)* |
| `codingRunClient` capabilities | A capabilities answer of "unavailable" stays cached for the exam-page session. This is Phase 17B behaviour; a failed request is not cached. Recovering the coding renderer chunk does not refresh the cached answer. Unchanged in this phase. |
| Chemistry periodic-table cells (44 px) | Deferred to Phase 21E.5 (D2). No chemistry or SmartSim engine file was changed. |
| Physics equations and units | Only the student-scene title direction changed. Equations, units and simulation values are untouched (D3); a wider review of physics bidi is left to a later phase. |
| A question that can never render, then submitted (review finding 85, **owner decision needed**) | If a renderer never recovers (for example a permanent 404 after a redeploy, Safari, or a refused remap) and the student submits, the question is sent as unanswered, the same as a skip. The server grades it as it grades any unanswered question; this behaviour pre-dates the phase (finding 86). Before this phase the same failure replaced the whole exam with the root card (corrected in Review Fix 2: in a non-strict attempt that card offered a reload that resumed the attempt; a strict attempt ended through the strict exit). Distinguishing "could not render" from "skipped" needs a submission-contract and grading change (for example a `reviewRequired` marker), which this phase is not allowed to make (no API, grading or question-contract change). It is disclosed here for an owner decision; AGENTS.md §10 prefers teacher review for this case. |
| Exam-surface card hides the exam chrome (finding 14) | The outer `exam` boundary catches only errors that escape the page, review, section and part boundaries; its children are statically loaded chrome (top bar, progress, bottom navigation, navigator). If it ever catches, the card replaces the chrome, so a strict untimed attempt has no submit path until «إعادة المحاولة» succeeds. Before this phase the same error unmounted the page and, in strict mode, ended the attempt. Kept as a P2 risk: moving the chrome outside the boundary would send its own errors to the root boundary (strict exit). |
| Announcer and status wording (findings 30, 31) | The strict-ended `h1` takes focus inside the existing `role=status` section (info). Outside the exam page, a card's `role=status` is inserted already filled and may not be spoken (info; the exam page uses the settled page announcer). Both left as info. |
| Teacher and portal reach (findings 43, 49) | `RichContentRenderer` and the `StudentQuestionCard` chunk are also used by teacher previews and the portal, so the recovery runtime and the boundary reach those surfaces. Review Fix 1 makes them neutral there: general wording, no exam-only advice, the chart keeps its reload advice, and coarse-pointer sizes are scoped to `.interactive-exam-page`. |

## 11. Handoff

| Item | State |
|---|---|
| Baseline | `31f40086e4740984ee1f7cb7c90aee7869301d5a`. `origin/main` was unchanged at the last fetch before the handoff, so no further reconciliation was needed. |
| Branch | `feature/phase-21e3-student-enterprise-ux`, normal commits only: no amend, rebase or force-push. |
| Head proposed for merge, exact-head CI, PR preview tier | Stated in the pull request body, which names the head SHA, the workflows, their run attempts and conclusions, and whether the `Build and Deploy Job` created a preview. |
| Deployment | Tiers 1–2 (local and CI). Tier 3 only if the workflow's preview job succeeds on the head. No production deployment, no Runner deployment, and no Azure, secret or DNS change. |
| Merge | **Owner manual merge only, after an independent review. Auto-merge OFF.** |

What the independent reviewer should probe first:
1. `src/recoverableLazy.ts`: every path from browser text to `importUrl`, the import map, `fetchText` and `<link>`. All of
   them must pass through `trustedAssetUrl`.
2. The remap set on a real graph. Run the harness with `FAIL="<chunk prefix>:js"` against any shared chunk, and check A8,
   which proves single evaluation.
3. That the recovery card cannot offer a reload in a strict attempt or with unconfirmed answers. Mutants P01, P02 and B03
   cover this, along with the `strict` scenario.
4. That the announcer stays quiet: there must be no announcement for the ordinary save cycle and no repeated timer
   threshold (D1, C1, A01–A03, P07).
5. *(Review Fix 1)* That nothing scrolls between a pointer press and its release, at any zoom, for any answer type, and
   that a control reached with the keyboard is still revealed. Re-run the harness with `POINTER=1` and the reviewers'
   GAP-1 / GAP-2 probes (§12.4).
6. *(Review Fix 2)* That after a successful «إعادة المحاولة» focus is never on an answer control: retry with the keyboard and
   press ordinary keys (ArrowDown, Space, Enter) — no answer may change (§13.3). That a card's retry is never held up by another
   question's stylesheet outage, and that a press right after a Tab never meets a moving page.

## 12. Review Fix 1

The independent read-only review of `92f4326` reported **FAIL — do not merge**: four blockers, nine majors (two pairs
report the same defect) and a list of minor and informational findings (the numbers below are the review's finding ids). Review Fix 1 corrects every introduced
blocker and major and the safe minors. It also corrects the inaccurate statements of this record (marked in place) and
closes the mutation gap on the serialization queue. Everything else is listed in §12.7 with its severity and rationale.

| Item | Value |
|---|---|
| Head reviewed | `92f4326f944510337b59802cb7d562c29a777868` |
| `origin/main` | `31f40086e4740984ee1f7cb7c90aee7869301d5a`, unchanged at every fetch of this phase, so no reconciliation was needed |
| Branch | `feature/phase-21e3-student-enterprise-ux`, normal commits only (no amend, rebase or force-push) |
| Commits | `3becc98` implementation and tests; `b293c4a` tests that close the mutation survivors of the first campaign run, and the guard-compliant heading indicator; the following commit carries this record |

### 12.1 Root cause of the blockers

Chromium moves focus on `mousedown` (and on the touch that becomes a click), **before** `mouseup` and `click`. The
21E.3 focus-in reveal scrolled the page whenever the focused element was partly under a sticky bar, and it did so for
focus caused by a pointer too. The root `scroll-padding` then added to the distance. The page therefore moved **while the
button was still down**:

- the hotspot point, the 3D part, the chart bar and the graph curve were read at the scrolled position, or the click
  landed on another element (blockers 51, 69, 70 and majors 71, 72);
- a button whose press started over it was released over something else, so its click was lost (major 73: SmartSim
  «حفظ القياس»; major 77: coding «تشغيل»);
- in a native textarea (coding@3 template gaps, coding@1 native editor), 1–2 px of hand movement during the scroll became
  a multi-line selection that the next key replaced; autosave then stored the truncated code (blocker 76).

`:focus-visible` cannot tell a pointer focus from a keyboard focus here. Measured in Chromium 141: a `textarea` or an
`input` focused by a mouse click **or** a touch tap matches `:focus-visible` (a focusable `div` or a `button` does not).
These are exactly the coding fields of blocker 76, so the reveal follows the input device instead: it tracks the last
key and pointer events itself.

**Fix — keyboard-intent reveal (`src/student/exam/keyboardReveal.ts`).**
1. Only a navigation key (Tab, arrows, Home, End, PageUp, PageDown) arms a reveal. One key press explains at most one focus
   change.
2. Any `pointerdown`, `mousedown` or `touchstart` cancels it, and nothing is revealed while a pointer is down (released
   by `pointerup`, `pointercancel`, `mouseup`, `touchend`, `touchcancel`, `dragend` or a window blur).
3. The reveal runs after a frame and re-checks that no pointer went down since and that the element still has focus.
4. It scrolls by the exact obscured distance plus an 8 px gap (`revealDelta`), instantly when reduced motion is requested.
   *(Corrected in Review Fix 2, §13: always instantly — a smooth scroll kept moving the page under a press that followed the
   Tab within ~100 ms.)*
5. The root `scroll-padding` is removed: it doubled the element scroll margins (finding 55). Entering the questions
   focuses the heading without scrolling, jumps to the top instantly, then reveals the heading (finding 80).

Programmatic focus (start, result, retry) still uses its own `preventScroll` + reveal. *(Review Fix 2: until §13's instant
reveal, a press within ~100 ms of a Tab could still land during that Tab's smooth scroll.)* A pointer press never scrolls the
page; a keyboard user still gets the control revealed above the bottom navigation at every zoom.

### 12.2 Findings and fixes

Severity: P0 = blocker, P1 = major, P2 = minor, P3 = nit / info.

| Review id | Sev | Finding | Fix | Evidence |
|---|---|---|---|---|
| 51, 70, 74 | P0 | hotspot point shifted by the reveal (also composite parts, drag) | keyboard-intent reveal (§12.1) | RF1-P1/P2 (mouse and touch, fail-first); harness PTR1 (52/52); GAP-1 matrix (`cphot`, `cpdrag`) |
| 69 | P0 | 3D viewer saves the wrong named part | same | GAP-1 matrix (`mp`) |
| 76 | P0 | coding textarea: press + 2 px drag becomes a selection, the next key deletes code | same | harness PTR4 (2 px drag → caret, no selection, no scroll); GAP-2 `probe-tpl`, `probe-native1` |
| 71, 72 | P1 | chart bar and function-graph clicks lost | same | GAP-1 matrix (`ch1`, `fg1`, `fgp`) |
| 73, 77 | P1 | partly covered buttons lose their click (SmartSim save, coding Run) | same | GAP-1 matrix (`plsave`); GAP-2 `probe-runbtn` |
| 51 (label) | P1 | label-zone press dropped at 200 % | same | harness PTR3 at every viewport |
| 1 | P1 | a transient failure of a rich-stem leaf (formula, chart, graph, 3D) silently drops that content | `inline` / `block` boundaries in `RichContentRenderer` around every lazy leaf: a formula falls back to its source text, a block to a compact card, each with its own retry; the rest of the stem stays rich | `RichContentRenderer.rf1.test.tsx` (fail-first); B10 |
| 13, 22 | P2 | a stem that falls back to plain text announced «تعذّر عرض هذا السؤال الآن» | `stem` variant: the plain text plus a compact note «تعذّر عرض التنسيق» and «إعادة تحميل التنسيق», no question-level announcement | `StudentQuestionCard.stem.rf1.test.tsx` (fail-first); B06, B10 |
| 18, 33, 52, 56 | P1 | keyboard instructions removed from the accessible description while the guide is collapsed (Chromium omits closed `<details>` content) | an always-present visually hidden copy (`id="<hint>-keys"`) outside the `<details>` is referenced by `aria-describedby`; the guide shows the same text | `exam21e3.units` (fail-first); Chromium accessibility tree (§12.4) |
| 32, 45 | P1 | grade isolation reordered dates and CIDR addresses in teacher messages | isolation only for `assignment_reviewed` previews and only for the last grade value (`GRADE_LTR` refuses dates, versions and addresses) | RF1-U6 (fail-first, with a control); L04, L05 |
| 10, 19, 63 | P2 | a retry that fails later steals focus and drops keystrokes | the button takes focus back only if focus was on the card and is now on `body` (React remounted the card) | RF1-U1 (fail-first); B07 |
| 17, 24, 81, 47 | P2 | retry focus went to the page heading, to `body`, or off-screen | focus follows the recovered part: its first focusable control, else the part itself; the page / exam / review variants use the page anchor *(replaced in Review Fix 2, §13: focus on an answer control let the next ordinary key record an answer; focus now lands on the boundary's own line just before the part)* | `ux21e3` A2 (updated, fail-first), RF1-U2, RF1-U3 (fail-first); B05 |
| 23, 65 | P2 | after a failed retry the guidance (strict: «لا تغادر صفحة الامتحان») was neither announced nor linked | announced through the page announcer and referenced by the retry button's `aria-describedby` | RF1-P7 (fail-first); B09 |
| 12, 20 | P2 | a timer threshold marked as announced while nothing was spoken | thresholds are recorded only after the announcer delivered them, and only on the questions screen | RF1-P5 (fail-first); P07 (P10 is equivalent, §12.5) |
| 21 | P2 | a live region filled in the frame it is inserted may not be spoken | the announcer waits 400 ms after it is attached before the first message | RF1-P6 (fail-first); P11 |
| 27 | P2 | the last announcement stayed readable in browse mode | the announcer clears 8 s after a message | RF1-P10 (fail-first); P12 |
| 64 | P2 | reload offered while offline | `reloadAllowed` also requires `online` | RF1-P4 (fail-first); P08 |
| 2, 3 | P2 | only the first failed stylesheet re-linked; a failed re-link ignored (A5b failed) | every failed stylesheet of the load is re-linked; the retry fails closed if one still fails *(Review Fix 2: only the loader's own stylesheets — another question's outage no longer blocks this retry)* | RF1-R1/R2 (fail-first); R18, R19; harness `css-twice` 18/18 (`92f4326`: 17/18) |
| 4 | P2 | `NEVER_REMAP` premise false for `trustedSimPlugins` and `smartSimUiRegistry` | removed from the list; the build guard reads the list from the source | `recoverableLazy.21e3` (updated), guard G02 |
| 5, 9 | P2 | the code stimulus (`retryableLazy`) could never recover in Chromium | `recoverableSharedLazy`: the same remap, then the one `Module` export whose `default` is a component | `recoverableLazy.21e3` shared pick tests; R16, R24 |
| 6 | P2 | one stalled recovery blocked every later one | bounded steps; overlapping recoveries refused (`recovery-busy`); a late success still recorded | RF1-R3 (fail-first); R20, R21 |
| 7, 68 | P2 | single evaluation relies on the browser caching failed fetches (not established for Firefox) | the remap is used only for Chromium's cached-failure wording; other engines re-run the original factory only | RF1-R5 (fail-first); R22 |
| 39 | P2 | removing the remap serialization queue survived every test | RF1-R4 drives two concurrent recoveries of one failed shared module and asserts one generation | R17 KILLED (it was the review's surviving mutant) |
| 40, 41 | P2 | guard did not read `NEVER_REMAP`, did not tie names to imports, had no minimum | `recoveryDeclarations` parses each declaration's shape, name ↔ import base name, `NEVER_REMAP` from source, ≥ 50 declarations, shared chunks without `default` | `check-bundle-budget.rf1.test.mjs` (6); G01–G03 |
| 46, 48 | P2 | student exam wording and no reload outside the exam; chart reload advice removed everywhere | `general` scope outside the exam: neutral copy, reload after a failed retry; the chart keeps its reload advice outside the exam | RF1-U4 (fail-first), `DataChartRetry.21a1` back to its `main` expectation (fail-first); B11 |
| 53 | P2 | the harness could not observe pointer interaction with partly covered controls | `POINTER=1` mode: real mouse / touch presses on partly covered controls at every viewport and motion setting | harness PTR1–PTR6 |
| 55 | P2 | scroll clearance counted twice | root `scroll-padding` removed | `exam21e3.units` CSS case (fail-first) |
| 80 | P2 | after start at 150 % / 200 % with motion, the heading ended off-screen | instant top scroll, then reveal | RF1-P3 (fail-first); P09 |
| — (review screen) | P2 | a failing review screen hid the exam chrome | `review` boundary with «العودة إلى الأسئلة» | RF1-P8 (fail-first) |
| 8 | P3 | `isComponent` accepted a React element | only functions and memo / forward_ref / lazy types | RF1-R6 (fail-first); R23 |
| 25, 34 | P3 | the guide's `<summary>` lost its disclosure marker | `display: list-item`, 44 px minimum height | RF1-U7 (fail-first) |
| 26 | P3 | coarse rule lowered the CLI blank width | coarse rule sets only `min-height` | RF1-U7 (fail-first) |
| 38, 50 | P3 | coarse-pointer sizes reached teacher editors | rules scoped to `.interactive-exam-page` | RF1-U7 (fail-first) |
| 44 (first half) | P3 | test hygiene: `window.location` not restored | restored after each test in both page suites; RF1-U1 stubs `fetch` so a remap source read never reaches the network | — |
| 54 | P3 | the pointer-focus bar was drawn over the first Arabic glyph | an underline below the heading text instead of an inset bar (no `outline:none`: the UX-2 focus guard forbids it, and Chromium draws no outline without `:focus-visible`) | RF1-U7 (fail-first); UX-2 guard |
| 57 | P3 | label guide told students to Tab forward to the zone | the guide says the label bank comes after the zones and to return with Shift+Tab | RF1-U8 (fail-first) |
| 66, 82 | P3 | record said "no automatic retries" and that the page boundary encloses the section shell | corrected in §10 and §3.3 / §5 | — |
| 84 | P3 | a stylesheet failure logged as `runtime` | logged as `chunk-load` | RF1-U10 (fail-first); B12 |

### 12.3 Fail-first (executed against `92f4326`)

The head's test files were copied into a detached worktree of `92f4326` (dependencies symlinked) and run there.

| Test file (head) | On `92f4326` | On the head | Representative failing assertion on `92f4326` |
|---|---|---|---|
| `src/StudentExamPage.rf1.test.tsx` (12) | **10 failed**, 2 passed | 12 passed | RF1-P1/P2: the page scrolled during a mouse / touch press (`expected "vi.fn()" to not be called at all, but actually been called 1 times`); RF1-P3: `expected 'smooth' to be 'auto'`; RF1-P4: the reload button is offered offline; RF1-P5: `expected '' to contain 'أقل من 5 دقائق'`; RF1-P8: the whole exam card replaced the review; RF1-P10: `expected undefined to be truthy` (no clear timer) |
| `src/StudentExamPage.ux21e3.test.tsx` (3 cases updated) | **3 failed** | passed | retry focus went to the page heading instead of into the recovered question (`expected <h2 …> to be <input …>`); the keyboard reveal did not use the measured `scrollBy` (`expected "vi.fn()" to be called 1 times, but got 0 times`) |
| `src/recoverableLazy.rf1.test.tsx` (7) | **6 failed**, 1 passed | 7 passed | RF1-R1: only one of two failed stylesheets re-linked (`expected [ Array(1) ] to deeply equal [ …(2) ]`); RF1-R2: the part rendered without its stylesheet; RF1-R3: a disjoint recovery never completed while an earlier one stalled; RF1-R6: an element accepted as a component |
| `src/recoverableLazy.21e3.test.tsx` (3 cases updated) | **3 failed** | passed | `trustedSimPlugins` refused instead of remapped (`expected true to be false`); a shared chunk (namespace export, no `default`) did not recover; `pickShared is not a function` |
| `src/student/exam/rf1.units.test.tsx` (16) | **13 failed**, 3 passed | 16 passed | RF1-U1: focus taken from the field being typed in (`expected <button …> to be <input aria-label="البند الآخر">`); RF1-U6: `expected [ '12/10' ] to deeply equal []` and `[ '1.0/24', '0.0/8' ]` for addresses; RF1-U8: no Shift+Tab step; RF1-U10: `[{ code: 'runtime' }]` for a stylesheet failure |
| `src/student/exam/exam21e3.units.test.tsx` (4 cases updated) | **4 failed** | passed | the keys only inside the closed `<details>` (`expected <details …> to be null`); root `scroll-padding` present; the stem fallback is silent; the bell isolates every preview |
| `src/StudentQuestionCard.stem.rf1.test.tsx` (1) | **1 failed** | 1 passed | no notice and no retry next to the plain stem |
| `src/richContent/RichContentRenderer.rf1.test.tsx` (1) | **1 failed** | 1 passed | a failing formula drops the whole rich stem |
| `src/charts/DataChartRetry.21a1.test.tsx` (back to its `main` expectation) | **1 failed** | 1 passed | the chart's reload advice was removed outside the exam |
| `scripts/check-bundle-budget.rf1.test.mjs` (6), `src/student/exam/keyboardReveal.rf1.test.tsx` (5) | cannot load (the guard ran its build check on import and lacked the new exports; the reveal module is new) | 6 + 5 passed | not counted as fail-first |

**42 cases fail on `92f4326` and pass on the head.** Cases that pass on `92f4326` are **pins**, not fail-first evidence:
- RF1-P1/P2 «the same field reached with Tab IS revealed» (the keyboard control);
- RF1-P9 «online but unconfirmed: no reload» (it guards the new `online` term; written to kill mutant P02);
- RF1-R4 «two concurrent recoveries of one failed shared module: one generation» (written to kill R17, the review's surviving serialization mutant);
- RF1-U5 «repeated activation starts one retry», RF1-U9 «a card's retry depends only on its own loaders», and the control sentence of RF1-U6.

The keyboard-reveal unit tests (`keyboardReveal.rf1.test.tsx`) were written after the fix to kill mutants K01, K02 and K05, which survived the first campaign run (§12.5).


### 12.4 Chromium evidence (production build of the head, Chromium 141)

The reviewers' probes (GAP-1, GAP-2, accessible description) ran on the production build of `3becc98`. The final head's
build differs from it in **one CSS declaration**: `outline:none` was removed from the `:focus:not(:focus-visible)` heading
rule (`b293c4a`). After the content hashes in file names are normalised, every JavaScript module of the two builds is
identical. The certification harness, in pointer mode and in every failure scenario, was **re-run on the final head's
build** (§12.6).

**Certification harness, new pointer mode (`POINTER=1`).** Real mouse presses (desktop, 100 / 150 / 200 %) and touch presses
(phone 390×844, touch), with reduced and normal motion. Each control is placed half under a sticky bar before the press.
The release is held for 90 ms, and PTR4 adds a 2 px drag.

| Check | `92f4326` | Head |
|---|---|---|
| PTR1 hotspot press under the bottom bar / under the top bar: no scroll, point recorded where pressed | fails at every viewport (phone: 3 of 4) | pass |
| PTR2 keyboard-guide `<summary>` half covered: the press opens it, no scroll | fails at 150 % and 200 % | pass |
| PTR3 label zone half covered: the press assigns the selected label | fails at 200 % | pass |
| PTR4 textarea press with a 2 px drag: a caret, no selection, no scroll | fails at 150 % and 200 % | pass |
| PTR5 Tab to a partly covered textarea still reveals it (keyboard) | pass | pass |
| PTR6 no save / submit / start other than the student's own answers | pass | pass |
| **Total** | **27 / 52** | **52 / 52** |

**Failure scenarios (unchanged checks A–G of §8.3, plus Review Fix 1 checks).**

| Scenario | Viewports | Head |
|---|---|---|
| `entry` (hotspot renderer entry chunk 503 once) | desktop 100 / 150 / 200 %, phone | **76 / 76** |
| `dependency` (shared `HotspotView` / `VisualCanvas` chunks fail) | desktop 100 / 200 %, phone | **58 / 58** |
| `css` (the `VisualCanvas` stylesheet fails) | desktop 100 / 150 % | **36 / 36** |
| `css-twice` (the stylesheet also fails on its first re-link) | desktop | **18 / 18** (`92f4326`: 17 / 18 — A5b, the question rendered without its stylesheet) |
| `strict` (strict attempt with the `HotspotView` failure) | desktop 100 / 200 %, phone | **58 / 58** |
| `stilldown` (503 for the first 3 requests, retry URLs included) | desktop 100 / 150 % | **36 / 36** |

**The reviewers' probes, re-run unchanged on the head.**
- **GAP-1 pointer matrix** (`pointer-probe.mjs`): 12 pointer-driven answer types — chart bar, function-graph curve and point, 3D scene and mesh part, physics bob drag and «حفظ القياس», network drag, categorization, composite hotspot click and drag, composite network. Each is run at 100 / 150 / 200 % and on a phone, with the control under the top and under the bottom bar, in both motion settings: **192 cases**.
  - *(Corrected in Review Fix 2, §13 — this bullet said "every case recorded the intended answer", which overstated it.)* On the head there was no probe error, and every recorded answer equals the base build's or is better. In 64 cases neither build records an answer: the probe does not read the bob, network and composite-network drag answers (48); 12 desktop function-graph point clicks are lost to the pre-existing hover dot (finding 75); and 4 phone taps on «حفظ القياس» land on the bottom navigation in both builds.
  - Against the pre-phase base `31f4008` (the reviewers' run): 168 identical. Of the 24 differences, 4 are base timeouts (3D part at 200 %) where the head saved the intended part. The other 20 are composite hotspot points that differ in the third decimal: the head's worst error is **0.0030** of the image (`92f4326`: **0.7395**). *(Corrected: base's own worst error against its own targets is 0.0024, so the head is not more accurate than base; both are under 0.3 % of the image.)* *(Source, cited in Review Fix 3, §14: the base run's `review/gap-1/run-base/cases.jsonl` in the Review Fix 1 evidence — 32 hotspot cases, the Euclidean distance between `intended` and the last recorded point, in image fractions; worst 0.0024, case `cphot`, phone, top, reduced motion. The reviewer's per-row comparison file, at 3 decimals and against the head's targets, gives 0.0052 for base and 0.0029 for the head.)*
  - Against `92f4326`: 66 differ, all of them answers that `92f4326` lost or corrupted.
  - The page scroll at `pointerdown` equals the scroll at `click` in every case except the physics bob drag pressed under the **top** bar (and, at 200 %, under the bottom bar). There the base build shows the identical change: pre-existing lab behaviour.
- **GAP-2 coding probes**. Each coding control is placed half under the bottom navigation and pressed with the mouse.
  - `probe-tpl.mjs`, coding@3 template gap, with 2 × 1 px of hand movement while the button is held (the blocker 76 reproduction): 100 / 150 / 200 %, both motion settings, holds of 120 and 200 ms. **12 / 12 cases: 0 characters lost, page scroll 0, the key inserted on the pressed line.** `92f4326` lost 33 characters (120 ms) or 13 (200 ms), and base lost 0. Without movement (holds 0 / 120 / 400 ms): 18 / 18, 0 lost.
  - `probe-native1.mjs`, coding@1 native editor at 560×450 @2 and 390×844 @3, with the same movement: **4 / 4, 0 characters lost, scroll 0** (`92f4326` lost 33).
  - `probe-runbtn.mjs`, a click on «تشغيل», 60 % of the button visible: coding@1 **12 / 12** and coding@3 **12 / 12** sent exactly one run request, with scroll 0 and the release on the button. `92f4326` ran in only 3 / 12 (coding@1) and 0 / 4 (coding@3).
- **Accessible description** (`ax-app.mjs`, Chromium accessibility tree, guide collapsed): the hotspot `role=application` and the label-zone buttons now include the keyboard steps at 100 / 150 / 200 %. On `92f4326` only the one-line instruction was exposed (findings 18 / 33 / 52 / 56).



### 12.5 Mutation campaign (`scripts/mutate-21e3.mjs`, AGENTS.md §9)

The campaign was rewritten for the review-fix sources: **64 mutants across 12 files**. Each runs its named suites, and every
file is restored byte-for-byte (sha256-verified, also on interruption). It ran in isolation; no other test run used the
same files.

| Run | Tree | Result |
|---|---|---|
| 1 | `3becc98` (62 mutants) | 57 killed, **5 survived**: P02, P10, K01, K02, K05. Restored: true. |
| — | survivors analysed | **P02** was a real gap. The offline term added to `reloadAllowed` masked the existing "unsaved" test, so RF1-P9 now holds an online but unconfirmed save. **K01, K02, K05**: the focus-time check and the frame-time re-check were each tested only together; one test per layer was added. **P10** is **equivalent**: the announcer is rendered only by the questions-screen return (every other screen returns earlier), so `announce()` returns false and nothing is recorded. The screen check is defence in depth. The script now lets a mutant state why it is equivalent; such a mutant is still planted and run, and reported as `equivalent` with the reason. |
| 2 (targeted) | working tree of `b293c4a` | P02, K01, K02, K05 and the two new mutants (P12, B12) **KILLED**; P10 **EQUIVALENT**. Restored: true. |
| **Final** | **`b293c4a`** (64 mutants) | **63 KILLED, 1 EQUIVALENT (P10), 0 survived, 0 invalid, 0 timeout. Restored: true**; `git diff` on the mutated files is clean. |

The review's surviving mutant on the serialization queue (finding 39) is **R17**, now KILLED by RF1-R4.

| Id | Planted defect | Outcome | Killed by (first failing case; total failing) |
|---|---|---|---|
| R01-origin | URL validator: the same-origin check removed | KILLED | `recoverableLazy.21e3.test.tsx` › refuses another origin (7) |
| R02-query | URL validator: a query string accepted | KILLED | `recoverableLazy.21e3.test.tsx` › refuses a query (3) |
| R03-chunk-name | URL validator: the chunk-name match removed | KILLED | `recoverableLazy.21e3.test.tsx` › refuses a different chunk name when one is required, and css for js (3) |
| R04-hash-shape | URL validator: hash widened to `[0-9A-Za-z]{6,}` | KILLED | `recoverableLazy.21e3.test.tsx` › refuses a short hash (2) |
| R05-assets-prefix | URL validator: the `<base>assets/` prefix check removed | KILLED | `recoverableLazy.21e3.test.tsx` › refuses outside assets (3) |
| R06-typeerror-only | entry URL taken from any error, not only a `TypeError` | KILLED | `recoverableLazy.21e3.test.tsx` › ignores an Error (not a TypeError) (1) |
| R07-no-ancestors | remap set: static-import ancestors of a failed module dropped | KILLED | `recoverableLazy.21e3.test.tsx` › a failed leaf brings its ancestors on the path, never the healthy side branch (4) |
| R08-healthy-remapped | remap set: every module remapped (healthy ones too) | KILLED | `recoverableLazy.21e3.test.tsx` › the entry alone when nothing below it failed (5) |
| R09-recovered-remapped | remap set: recovered modules remapped again | KILLED | `recoverableLazy.21e3.test.tsx` › a recovered module is not remapped again, but a plain importer of it is (3) |
| R10-no-settled-reuse | a recovered URL not reused by later wrappers / graphs | KILLED | `recoverableLazy.21e3.test.tsx` › two wrappers of one chunk and a later graph reuse the recovered URL: one evaluation, no second generation (1) |
| R11-never-remap-ignored | the `NEVER_REMAP` deny-list ignored | KILLED | `recoverableLazy.21e3.test.tsx` › a module of the static student shell is refused (defence in depth: no import, the card stays) (1) |
| R12-no-original-first | a retry skips the original factory and remaps at once | KILLED | `recoverableLazy.21e3.test.tsx` › entry failure: the retry re-calls the original, then imports &lt;entry&gt;?r=1. under a map scoped to the retry URL only (3) |
| R13-map-unscoped | import-map scopes keyed by the original URL | KILLED | `recoverableLazy.21e3.test.tsx` › entry failure: the retry re-calls the original, then imports &lt;entry&gt;?r=1. under a map scoped to the retry URL only (3) |
| R14-no-css-relink | a failed stylesheet not re-linked before the retry | KILLED | `recoverableLazy.21e3.test.tsx` › a CSS dependency failure re-links a validated ?r= stylesheet, then re-calls the original (no JS remap) (3) |
| R15-shape-unchecked | a module without a component `default` accepted | KILLED | `recoverableLazy.21e3.test.tsx` › a recovered module that is not a component fails closed (2) |
| R16-shared-no-pick | the shared loader takes `default` instead of picking the `Module` export | KILLED | `recoverableLazy.21e3.test.tsx` › review fix 1 (R1-5): a shared chunk (namespace export, no default) recovers through its one namespace export (1) |
| R17-no-serialization | the remap queue removed (recoveries run concurrently) — the review's surviving mutant | KILLED | `recoverableLazy.rf1.test.tsx` › the second remap reuses the first's recovered copy of the shared module (1) |
| R18-css-relink-fail-open | a stylesheet re-link that fails is ignored | KILLED | `recoverableLazy.rf1.test.tsx` › a re-link that fails again fails the retry: the part does not render without its stylesheet (1) |
| R19-css-first-only | only the first failed stylesheet recorded | KILLED | `recoverableLazy.rf1.test.tsx` › every failed stylesheet is re-linked before the retry (not only the one the error names) (1) |
| R20-inflight-ignored | an overlapping recovery is not refused | KILLED | `recoverableLazy.rf1.test.tsx` › a disjoint recovery completes while an earlier one stalls; an overlapping one is refused; the late success is recorded (1) |
| R21-no-import-bound | the retry import is unbounded | KILLED | `recoverableLazy.rf1.test.tsx` › a disjoint recovery completes while an earlier one stalls; an overlapping one is refused; the late success is recorded (1) |
| R22-remap-any-browser | the remap used for any browser wording (not only a cached failure) | KILLED | `recoverableLazy.rf1.test.tsx` › Firefox wording: the retry re-calls the original only, never imports another URL (1) |
| R23-element-accepted | any object with `$$typeof` accepted as a component | KILLED | `recoverableLazy.rf1.test.tsx` › the load fails (re-armable) instead of handing React an element as a component type (1) |
| R24-shared-pick-ambiguous | an ambiguous shared namespace accepted | KILLED | `recoverableLazy.21e3.test.tsx` › review fix 1: a shared chunk whose namespace export is ambiguous (or missing) fails closed (1) |
| B01-retry-loads-nothing | «إعادة المحاولة» retries no loader | KILLED | `student/exam/exam21e3.units.test.tsx` › chunk failure → card (no internals) → «إعادة المحاولة» → the question renders; the failed React.lazy is replaced (5) |
| B02-log-leaks | the boundary log carries the error message | KILLED | `StudentExamPage.ux21e3.test.tsx` › shows a recovery card for THAT question; the exam, the other questions and the answers stay; no save / submit; nothing leaks (3) |
| B03-reload-before-retry | «إعادة تحميل الصفحة» offered before any retry | KILLED | `StudentExamPage.ux21e3.test.tsx` › after a failed retry the card offers a reload ONLY when everything is saved and the attempt is not strict (1) |
| B04-no-reset-on-new-question | the card does not reset for another question | KILLED | `student/exam/exam21e3.units.test.tsx` › a new question (resetKey) starts clean; a stem fallback keeps the text WITH a notice and a retry (never silent) (1) |
| B05-no-focus-follow | after a successful retry focus does not follow the recovered part | KILLED | `StudentExamPage.ux21e3.test.tsx` › «إعادة المحاولة» renders the question again in place (no reload); focus moves into the recovered question (3) |
| B06-stem-card-not-text | a failing stem shows the full card instead of its text | KILLED | `StudentQuestionCard.stem.rf1.test.tsx` › visible notice + retry, the answer area stays, and the announcer does not claim the question failed (2) |
| B07-refocus-steals | a failed retry always takes focus | KILLED | `student/exam/rf1.units.test.tsx` › the student moves to another field and types while the retry is loading: focus and keystrokes stay there (1) |
| B08-retry-every-loader | a card's retry retries every failed loader of the page | KILLED | `student/exam/rf1.units.test.tsx` › outside the exam (no provider): focus lands on the recovered part's first control, not <body> (4) |
| B09-guidance-not-describing | the after-retry guidance is not linked to the button | KILLED | `StudentExamPage.rf1.test.tsx` › strict attempt: «لا تغادر صفحة الامتحان» is announced and linked to the focused action (2) |
| B10-stem-silent | a stem falls back to plain text silently | KILLED | `StudentQuestionCard.stem.rf1.test.tsx` › visible notice + retry, the answer area stays, and the announcer does not claim the question failed (2) |
| B12-css-failure-logged-runtime | a stylesheet failure logged as `runtime` | KILLED | `student/exam/rf1.units.test.tsx` › «Unable to preload CSS» and a recovery refusal are chunk-load; any other error is runtime (1) |
| B11-student-wording-everywhere | exam wording in every context | KILLED | `student/exam/exam21e3.units.test.tsx` › a new question (resetKey) starts clean; a stem fallback keeps the text WITH a notice and a retry (never silent) (2) |
| P01-reload-in-strict | reload offered in a strict attempt | KILLED | `StudentExamPage.rf1.test.tsx` › strict attempt: «لا تغادر صفحة الامتحان» is announced and linked to the focused action (2) |
| P02-reload-unsaved | reload offered while an answer is not server-confirmed | KILLED | `StudentExamPage.rf1.test.tsx` › the save of the newest edit keeps failing while online: after a failed retry there is no reload action (1) |
| P03-focus-on-open | focus moved when the page opens on the questions | KILLED | `StudentExamPage.ux21e3.test.tsx` › a page that opens directly on the questions (legacy untimed) does not move focus (1) |
| P04-no-result-focus | no focus on the result heading | KILLED | `StudentExamPage.ux21e3.test.tsx` › submitting focuses the result heading (exactly one submit) (1) |
| P05-no-start-focus | no focus on the question heading after start | KILLED | `StudentExamPage.rf1.test.tsx` › after «بدء المحاولة» the last page scroll is instant (2) |
| P07-timer-no-memory | timer thresholds not remembered per attempt | KILLED | `StudentExamPage.ux21e3.test.tsx` › crossing 5 minutes is announced once; nothing every second; nothing before the threshold (2) |
| P08-reload-offline | reload offered while offline | KILLED | `StudentExamPage.rf1.test.tsx` › after a failed retry, offline with nothing unsaved: guidance to continue, no reload action (1) |
| P09-transition-smooth | entering the questions uses a smooth scroll | KILLED | `StudentExamPage.rf1.test.tsx` › after «بدء المحاولة» the last page scroll is instant (1) |
| P10-timer-off-screen | timer effect runs outside the questions screen | EQUIVALENT | survives by design: the announcer exists only on the questions screen, so `announce()` returns false elsewhere (defence in depth); RF1-P5 covers the rule |
| P12-announcer-never-cleared | a delivered message is never cleared | KILLED | `StudentExamPage.rf1.test.tsx` › RF1-P10: a delivered message is cleared again after ANNOUNCEMENT_CLEAR_MS (nothing stale to read in browse mode) (1) |
| P11-announcer-no-settle | the first message written in the frame the announcer is inserted | KILLED | `StudentExamPage.rf1.test.tsx` › the first message is written only after the announcer has settled (not in the frame it was inserted) (1) |
| K01-reveal-pointer-focus | focus-time guard removed (any focus revealed) | KILLED | `student/exam/keyboardReveal.rf1.test.tsx` › focus-time guard: a programmatic focus with no key at all, or after a stale key press, never scrolls (2) |
| K02-reveal-while-pointer-down | focus while a pointer is down is revealed | KILLED | `student/exam/keyboardReveal.rf1.test.tsx` › focus-time guard: focus that happens while a pointer is down never scrolls, even if the pointer is released before the frame (1) |
| K03-reveal-any-key | any key arms a reveal | KILLED | `student/exam/keyboardReveal.rf1.test.tsx` › reveals only keyboard-caused focus; pointer focus, a held pointer and a stale key press never scroll (1) |
| K04-reveal-not-consumed | one key press reveals several focus changes | KILLED | `student/exam/keyboardReveal.rf1.test.tsx` › reveals only keyboard-caused focus; pointer focus, a held pointer and a stale key press never scroll (1) |
| K05-reveal-no-frame-recheck | the frame-time re-check removed | KILLED | `student/exam/keyboardReveal.rf1.test.tsx` › frame-time re-check: an element that lost focus before the frame is not revealed (1) |
| A01-timer-repeat | a threshold announced again on every tick | KILLED | `StudentExamPage.ux21e3.test.tsx` › crossing 5 minutes is announced once; nothing every second; nothing before the threshold (3) |
| A02-timer-early | a threshold announced a minute early | KILLED | `student/exam/exam21e3.units.test.tsx` › nothing above 5 minutes, at expiry or for an invalid value (1) |
| A03-save-noisy | «تم الحفظ» announced after every ordinary save | KILLED | `StudentExamPage.ux21e3.test.tsx` › an ordinary edit is silent; going offline is announced; saving again after it is announced (3) |
| A04-label-live-again | the visible save label made a live region again | KILLED | `StudentExamPage.reliability.test.tsx` › 16: exactly ONE polite live region (the page announcer, 21E.3); the save label itself is not live (4) |
| L01-cli-not-isolated | the CLI `<pre>` loses `dir="ltr"` | KILLED | `StudentExamPage.ux21e3.test.tsx` › the command block and its blanks carry dir=ltr; the typed value is stored as typed (no bidi control character) (1) |
| L02-physics-title-ltr | the physics title loses its RTL direction | KILLED | `student/exam/exam21e3.units.test.tsx` › the notification grade, the install brand and the physics energy title are isolated in their components (1) |
| L03-island-drops-bdi | the LTR island helper drops the `<bdi>` | KILLED | `pwa/InstallAppCard.6a.test.tsx` › declined → the calm note AND the manual guidance (never masked); can be hidden; a later prompt works again (7) |
| L04-grade-any-preview | grade isolation on every notification preview | KILLED | `student/exam/exam21e3.units.test.tsx` › the notification grade, the install brand and the physics energy title are isolated in their components (1) |
| L05-grade-unbounded | grade pattern matches dates and addresses | KILLED | `student/exam/rf1.units.test.tsx` › الاختبار القادم يوم 12/10/2026 (3) |
| G01-guard-name-unchecked | guard: declared name not tied to its import | KILLED | `scripts/check-bundle-budget.rf1.test.mjs` › a name that is not the imported file's base name fails (the runtime would never recover it) (1) |
| G02-guard-neverremap-unread | guard: `NEVER_REMAP` not enforced | KILLED | `scripts/check-bundle-budget.rf1.test.mjs` › a NEVER_REMAP name may not be declared recoverable, and every NEVER_REMAP name must exist in the build (1) |
| G03-guard-no-minimum | guard: no minimum declaration count | KILLED | `scripts/check-bundle-budget.rf1.test.mjs` › fewer than the minimum number of declarations fails (a vacuous guard) (1) |

### 12.6 Validation, Chromium re-run and bundle on the final tree

| Check | Command | Result |
|---|---|---|
| Root suite | `npx vitest run` (= `npm test`) on `b293c4a` | **948 files, 12,344 tests passed, 0 failed** (`92f4326`: 941 / 12,294; `main` `31f4008`: 937 / 12,205) |
| Lint | `npm run lint` | 0 errors, **125 warnings: the same warning set as `92f4326`** (line numbers aside) |
| Typecheck | `npx tsc -b` | clean |
| Build + bundle guard | `npm run build` | passed. «Chunk recovery: 57 declarations / 55 recoverable chunk(s) emitted once (1 shared); NEVER_REMAP 12 names all present; header parser matched 350/350 chunks (1093 static edges)» |
| Runner unit | `npm --prefix runner test` | 407 passed, 0 failed (no Runner file changed) |
| Whitespace | `git diff --check`, `git diff origin/main --check` | clean |
| Chromium harness on the final build | `scripts/check-student-exam-browser-21e3.mjs` | pointer **52 / 52**, entry **76 / 76**, dependency **58 / 58**, css **36 / 36**, css-twice **18 / 18**, strict **58 / 58**, stilldown **36 / 36** |

In the failure scenarios, the only console errors are the injected failures' own logs:
`[QuestionErrorBoundary] {code: chunk-load}` (a stylesheet failure is now `chunk-load` too) and React's report of the caught
stylesheet preload error. There is no other page or console error.

The first full run, on the tree of `3becc98` plus the survivor tests, found one real failure, caused by this fix:
`api/tests/ux2-shell-foundation.test.js` forbids `outline:none` in `studentexam-pro.css`, and the new heading rule had
added one. The declaration was redundant and is removed in `b293c4a`; the guard is unchanged.

Answer serialization, autosave, submission and strict attempts are unchanged:
- No answer, save, submit, attempt or grading code changed.
- No API, Runner, workflow, dependency or lockfile changed.
- The existing reliability, UX-7b-1, strict and save suites pass, and this fix did not change their expectations.
- The harness counts only start, save and submit requests, with exactly one submit (A5 / A9, PTR6).

**Bundle** (exact gzip level 9, the guard's rules):

| | `31f4008` (`main`) | `92f4326` | Final |
|---|---|---|---|
| Initial JS (8 files) | 113,118 B | 113,107 B | **113,146 B** (+28 B against `main`; target ≤ +1 KB) |
| Initial CSS (1 file) | 35,797 B | 36,015 B | **36,067 B** |

### 12.7 Remaining findings (not fixed in this phase)

| Review id | Sev | Finding | Reproduction | Rationale |
|---|---|---|---|---|
| 85 (and pre-existing 86) | P2, **owner decision** | A question that can never render is submitted as unanswered and graded like a skip | permanent 404 of a renderer chunk (or Safari, or a refused remap) → submit → the API grades the question as unanswered | Telling "could not render" apart from "skipped" needs a submission-contract and grading change, for example a `reviewRequired` marker for teacher review (AGENTS.md §10 prefers it). This phase may not change the API, grading or question contracts. Before this phase the same failure ended the exam. Disclosed in §10 for the owner. |
| 14 | P2 | When the outer `exam` card shows, the exam chrome (timer, navigation, review / submit) is hidden | an error thrown by the statically loaded chrome itself | Every lazy renderer, the page, the review and the section shell are caught by inner boundaries first. Moving the chrome outside the boundary would send its errors to the root boundary, which in strict mode ends the attempt. Disclosed in §10. |
| 30 | P3 info | The strict-ended `h1` takes focus inside an existing `role=status` section | end a strict attempt | Pre-existing `role=status` markup. The focus move (B) is required; restructuring the section is left to a later accessibility pass. |
| 31 | P3 info | Outside the exam page, a card's `role=status` is inserted already filled | a recovery card in a teacher preview | Outside the exam there is no page announcer. The card text is in the DOM and its retry button is focusable. |
| 43, 49 | P3 info | The recovery runtime and the boundary reach teacher and portal surfaces through `RichContentRenderer` and `StudentQuestionCard` | open a teacher preview | Neutral there by design (§10, "Teacher and portal reach"). |
| 44 (second half) | P3 nit | The 17A exception-list pin asserts a list that the same file defines | read `api/tests/coding-guards-17a.test.js` | API tests are outside this fix's scope; the behavioural proof is `recoverableLazy.21e3.test.tsx` (§9). |

Pre-existing findings that were not introduced by this PR stay out of scope and unchanged: 11, 15, 16, 29, 35, 36, 37, 42,
58, 60, 61, 62, 75, 78, 79, 83, 86, 87. Two of them change as a side effect of the fix:
- 28 / 59: the fixed 72 px root clearance no longer exists, and the keyboard reveal measures the real top bar. *(Corrected in Review Fix 2: navigation still positions the heading with `scrollIntoView({block:"start"})` and its 72 px `scroll-margin`, so with a two-line exam title the heading can land 6–18 px under the top bar at 150 % / 200 % — pre-existing, unchanged.)*
- 67: the same as 84, fixed.

Not measured: Safari / WebKit and Firefox (no engine in this environment; §10), and real assistive-technology output. The
accessible descriptions were read from Chromium's accessibility tree, not from a screen reader.

## 13. Review Fix 2

A new read-only adversarial review of the exact head `eb174d1` ran with four independent reviewers, each in its own detached
worktree:

| Area | Verdict | Introduced findings |
|---|---|---|
| Pointer / touch / keyboard input integrity | PASS | 1 × P2, 2 × P3 |
| Accessibility, announcements, RTL, zoom, teacher wording | PASS | 2 × P2, 5 × P3 |
| Governance, test integrity, evidence accuracy | PASS | 2 × P2 (PR body, a missing test), 3 × P3 |
| Recovery runtime and boundaries | **FAIL** | **1 × P1**, 1 × P2, 4 × P3 |

The reviewers re-ran the evidence of §12 and confirmed it, except where noted below. Confirmed:
- every former blocker is fixed in Chromium;
- 42 fail-first cases;
- 63 mutants killed and 1 equivalent;
- harness, GAP-2, bundle and exact-head CI;
- no weakened test.

Review Fix 2 corrects every introduced P1 and P2, and every P3 that was safe to fix. The design record statements found
inaccurate are corrected in place and marked *(corrected in Review Fix 2, §13)*.

| Item | Value |
|---|---|
| Head reviewed | `eb174d1fb6982929b5e7e81e40ea2817852d8a21` |
| `origin/main` | `31f40086e4740984ee1f7cb7c90aee7869301d5a` while fixing; it moved to `0e7adec` (PR #302) before the final review, and the branch was reconciled (§13.7) |
| Commits | `9eca00e` fixes and tests; `54e0c05` the announcer test that closes mutant P13; the following commit carries this record |

### 13.1 Findings and fixes

| Reviewer · id | Sev | Finding | Fix | Evidence |
|---|---|---|---|---|
| Recovery RR-1 | **P1** | After a successful retry, focus went to the recovered part's first control (a radio, the hotspot overlay, the answer field, or the next part's field). The student's next ordinary key then recorded an answer they never chose: 32 / 32 runs in Chromium. | Focus now lands on a short, non-interactive line the boundary itself renders just before the recovered part («تم تحميل هذا الجزء.», `tabindex=-1`). It is visually hidden inside a formula, so the sentence is not broken. The next Tab enters the part. The line stays until another question is shown, because removing it on blur would move content between a pointer press and its release. A page-, exam- or review-level card puts focus on the page heading. *(Review Fix 3, §14: once focus leaves the line it is hidden from assistive technology, in place; and nothing scrolls to the line or the heading, except after a keyboard retry during which the page did not scroll and nothing was pressed.)* | `StudentQuestionCard.focus.rf2` and `focus2.rf2` (multiple choice and open question with a code stimulus, then ordinary keys: no answer recorded; formula retry: not `<body>`); RF1-U2 and ux21e3 A2 updated (not the answer control); mutants B13 and B14 |
| Accessibility RR-1, RR-4 | P2, P3 | After a formula retry, focus fell to `<body>`; after a code-stimulus retry, focus went to the next field | same fix | same tests |
| Recovery RR-4 | P3 | A recovered review card lost focus: the anchor was the question heading | `focusAnchor` uses the review heading on the review screen and reports whether it could focus | RF2-P2; mutant P16 |
| Recovery RR-2 | P2 | One stylesheet that stays down blocked every other card's retry (the relink was page-wide and fails closed) | Each loader records the stylesheets its own loads requested (Vite rejects on the first failing one; others report later). Its retry re-links and awaits only those. *(Changed in Review Fix 3, §14: this missed stylesheets that another loader requested first.)* | RF2-R1; mutants R25 and R27 |
| Recovery RR-3 | P3 | Total recovery time was unbounded: a chain of slow source reads held the shared queue (186 s measured) | All source reads of one recovery are bounded together (`total`, 30 s); the statement in §5 is corrected | RF2-R2; mutant R26 |
| Pointer RR-PTR-1 | P2 | The reveal's smooth scroll kept running under a pointer press made 30–110 ms after the Tab: a shifted hotspot point, or a template-gap press turned into a selection | The reveal is always instant | keyboard-reveal test (instant); ux21e3 G updated; mutant K06 |
| Pointer RR-PTR-3 | P3 | In coding focus mode (a fixed overlay), Tab scrolled the page underneath | Nothing is revealed inside a fixed-position layer | keyboard-reveal test (fixed layer); mutant K07 |
| Accessibility RR-2 | P2 | Grade isolation still reordered teacher titles in reviewed-assignment notices that carry no composed grade («اختبار Unit 1/2» drawn as "1/2 Unit") | `presentNotification` returns the grade it composed, and the bell isolates only when one exists | `NotificationBell.grade.rf2` (rendered bell); mutants L04 and L06 |
| Accessibility RR-3 | P3 | Two announcements in the same frame: the first was never heard, yet a timer threshold was recorded as delivered | `student/exam/examAnnouncer.ts`: a queue holds each message ≥ 1.5 s (`ANNOUNCEMENT_GAP_MS`) before the next. `onDelivered` runs at the message's own write; a message still queued when the region leaves runs `onDropped`, which clears the page's timer key so the notice is said later (governance GOV-4). | `examAnnouncer.rf2` (settle, gap, clear, drop); RF2-P1 (timer and offline notices a gap apart); mutants P11–P15 |
| Accessibility RR-5 | P3 | A chart in the section instructions said «… من السؤال» | Neutral block wording («تعذّر عرض هذا الجزء من المحتوى الآن») | — |
| Accessibility RR-6 | P3 | The hidden keyboard steps were read twice in browse mode while the guide was open | The hidden copy is `aria-hidden`. A node referenced by `aria-describedby` still feeds the description (checked in Chromium's accessibility tree, §13.3). | `exam21e3.units`, RF1-U8; mutant V01 |
| Governance GOV-2 | P2 | The in-exam branch of the chart copy (D5) had no test | `DataChartRetry.rf2`: in an exam (strict) the chart fallback names no reload | pin; mutant D01 |
| Governance GOV-1 | P2 | The PR body still described `92f4326` | Rewritten for the final head (exact-head CI, finding-85 decision request) | PR #303 |
| Governance GOV-3 | P3 | §12.4 and the `eb174d1` commit message overstated GAP-1 ("192 / 192 intended answers") and the base error ordering | Corrected in §12.4. The commit message cannot be amended (history is never rewritten); this record is the correction. | — |
| Governance GOV-5 | P3 | Shared mutation backup file; leaked temp dirs; the bundle guard skipped when run through a symlinked path | Per-checkout backup; the guard tests clean up; the guard compares real paths | guard test (symlink); mutant G05 |
| Recovery RR-5 | P3 | The bundle guard could not see an aliased loader (`const rl = recoverableLazy`) | Any reference to the loaders other than an import or the literal call fails the guard | guard test (alias); mutant G04 |
| Recovery RR-6 | P3 | The finding-85 disclosure overstated the base: a non-strict attempt was resumable through the root card's reload | Corrected in §10 and §12.7 | — |

### 13.2 Fail-first (executed against `eb174d1`)

The head's new and changed test files were copied into a detached worktree of `eb174d1` and run there. **13 cases fail on
`eb174d1` and pass on the head.** Each failing assertion is the defect itself:

| Case | Failing assertion on `eb174d1` |
|---|---|
| multiple choice + code stimulus, after retry | `expected true to be false` (focus on a radio) |
| open question + code stimulus, after retry | `expected <textarea> not to be <textarea>` (focus in the answer field) |
| formula retry | `expected <body> not to be <body>` |
| ux21e3 A2, RF1-U2 | `expected <input> not to be <input>` (focus on the answer control) |
| RF2-P2 review card | `expected <body> to be <h2 …review…>` |
| RF2-P1 timer + offline notice | `expected 0.43 to be greater than or equal to 1000` (ms between the two writes) |
| RF2-R1 another card's stylesheet | the retried part never rendered (it waited for that stylesheet) |
| RF2-R2 slow source chain | the disjoint recovery never rendered within the window |
| bell grade island | `expected <bdi dir="ltr"> to have a length of +0 but got 1` (a teacher title split) |
| exam21e3 bell source check | the isolation was not gated on a composed grade |
| guard alias | `expected [] to have a length of 1` |
| guard through a symlink | `expected +0 not to be +0` (exit 0 without checking) |

Pins, which pass on `eb174d1`:
- `DataChartRetry.rf2`: the in-exam chart copy was already right; the test guards D5.
- The examAnnouncer unit tests cannot load there (the module is new). Their page-level counterpart, RF2-P1, is fail-first.

*(Corrected in Review Fix 3, §14 — governance GOV2-2, evidence under-reported: the run above predates commit `9eca00e` and used
earlier test files, without `keyboardReveal.rf1.test.tsx`. Re-run with the final test files on `eb174d1`, **19 cases fail**. The
6 not listed above: ux21e3 G (`smooth` received, `auto` expected), the hotspot `aria-hidden` check (`exam21e3.units`), RF1-U8
`aria-hidden`, and three in `keyboardReveal.rf1`. `eb174d1` requires a `reducedMotion` option that the final file no longer
passes, so that file was also run with the option supplied (`() => false`): the original reveal test (`behavior: "auto"`
expected, `"smooth"` received), the instant test and the fixed-layer test fail on the defect itself, and the focus-time guard
passes. The fixes for RR-PTR-1, RR-PTR-3 and RR-6 therefore have fail-first evidence as well.)*

### 13.3 Chromium evidence (production build of `9eca00e`, Chromium 141)

`54e0c05` adds only a unit test, and this record changes no code, so the build is the final head's.

| Check | Result |
|---|---|
| Certification harness (`check-student-exam-browser-21e3.mjs`) | pointer **52 / 52**, entry **76 / 76**, dependency **58 / 58**, css **36 / 36**, css-twice **18 / 18**, strict **58 / 58**, stilldown **36 / 36**. The only console errors are the injected failures' own logs. |
| Recovery reviewer: multiple choice + code stimulus (`focusmc.mjs`) | focus after the retry is on `p.iex-q-recovered` «تم تحميل هذا الجزء.»; ArrowDown chooses nothing; no save (`eb174d1`: the first radio, and ArrowDown saved option 2) |
| Recovery reviewer: hotspot renderer retry, then Enter (`focushs.mjs`) | focus on the line; no marker, no save (`eb174d1`: a point at (0.5, 0.5) was saved) |
| Recovery reviewer: focus target rate (`focusrate.mjs`, 8 runs × 4 modes: key / click, immediate / delayed) | **32 / 32** on the line (`eb174d1`: 32 / 32 on the first radio) |
| Accessibility reviewer: code-stimulus part retry (`p9-part-focus.mjs`) | focus on the line, not in the stimulus' neighbour field |
| Accessibility reviewer: formula retry (`p3-failures.mjs`) | focus on the formula's visually hidden line (`SPAN.eb-visually-hidden tabindex=-1`), never `<body>`; a failed retry keeps focus on «إعادة المحاولة» with the guidance as its description |
| Accessibility reviewer: same-moment notices (`p6-collision-stem.mjs`) | the timer notice written at +1,658 ms and the recovery card at +3,158 ms (**1,500 ms apart**); the threshold is recorded once (`eb174d1`: the card replaced the timer notice 2 ms later in the same frame) |
| Accessibility reviewer: bell bidi (`p5-bidi.mjs`) | titles with fractions are not isolated («اختبار Unit 1/2», «الإصدار v1.2/3», «Quiz 3/4» render as written); only composed grades (9/10, 18.25/20) are islands; the visual order equals the plain text |
| Pointer reviewer: Tab, then a press 0–800 ms later on the hotspot (`tabclick.mjs`, 56 runs, 4 viewports, both motion settings) | **0** runs with scroll during the press; worst point error 0.0019 (`eb174d1`: 21 / 52 runs scrolled during the press, worst error 0.4629) |
| Pointer reviewer: Tab into the coding@3 gap, then a press 30–250 ms later with 2 × 1 px movement (`probe-tabtpl.mjs`, 24 runs) | **0** characters lost, no scroll during the press (`eb174d1`: 10 characters lost at 30 ms) |
| Pointer reviewer: Tab cycling in coding focus mode (`fm.mjs`) | the page under the overlay does not move (`eb174d1`: −62 px at 150 %) |
| Accessible description (`ax-app.mjs`, guide collapsed) | the hotspot `role=application` and the label zones still carry the keyboard steps with the hidden copy `aria-hidden`, at 100 / 150 / 200 % |


### 13.4 Mutation campaign (80 mutants, AGENTS.md §9)

The campaign covers 80 mutants across 16 files. It adds announcer, focus, runtime, keyboard-reveal, bell, chart, visual and
guard mutants for every Review Fix 2 rule, and moves the announcer mutants to `examAnnouncer.ts`.

| Run | Tree | Result |
|---|---|---|
| 1 | `9eca00e` | 78 killed, P10 equivalent, **1 survived: P13** (gap removed from the wait computation). The existing test queued both messages at once, where the post-write reschedule also holds the gap. The realistic case, a message arriving 2 ms after the previous one was written (the re-review's E1), now has its own test (`54e0c05`). |
| 2 (targeted) | `54e0c05` | P11–P15 KILLED |
| **Final** | **`54e0c05`** | **79 KILLED, 1 EQUIVALENT (P10), 0 survived, 0 invalid, 0 timeout. Restored: true**; `git diff` on the mutated files is clean |

| Id | Planted defect | Outcome | Killed by (first failing case; total failing) |
|---|---|---|---|
| R01-origin | URL validator: the same-origin check removed | KILLED | `recoverableLazy.21e3.test.tsx` › refuses another origin (7) |
| R02-query | URL validator: a query string accepted | KILLED | `recoverableLazy.21e3.test.tsx` › refuses a query (3) |
| R03-chunk-name | URL validator: the chunk-name match removed | KILLED | `recoverableLazy.21e3.test.tsx` › refuses a different chunk name when one is required, and css for js (3) |
| R04-hash-shape | URL validator: hash widened to `[0-9A-Za-z]{6,}` | KILLED | `recoverableLazy.21e3.test.tsx` › refuses a short hash (2) |
| R05-assets-prefix | URL validator: the `<base>assets/` prefix check removed | KILLED | `recoverableLazy.21e3.test.tsx` › refuses outside assets (3) |
| R06-typeerror-only | entry URL taken from any error, not only a `TypeError` | KILLED | `recoverableLazy.21e3.test.tsx` › ignores an Error (not a TypeError) (1) |
| R07-no-ancestors | remap set: static-import ancestors of a failed module dropped | KILLED | `recoverableLazy.21e3.test.tsx` › a failed leaf brings its ancestors on the path, never the healthy side branch (4) |
| R08-healthy-remapped | remap set: every module remapped (healthy ones too) | KILLED | `recoverableLazy.21e3.test.tsx` › the entry alone when nothing below it failed (5) |
| R09-recovered-remapped | remap set: recovered modules remapped again | KILLED | `recoverableLazy.21e3.test.tsx` › a recovered module is not remapped again, but a plain importer of it is (3) |
| R10-no-settled-reuse | a recovered URL not reused by later wrappers / graphs | KILLED | `recoverableLazy.21e3.test.tsx` › two wrappers of one chunk and a later graph reuse the recovered URL: one evaluation, no second generation (1) |
| R11-never-remap-ignored | the `NEVER_REMAP` deny-list ignored | KILLED | `recoverableLazy.21e3.test.tsx` › a module of the static student shell is refused (defence in depth: no import, the card stays) (1) |
| R12-no-original-first | a retry skips the original factory and remaps at once | KILLED | `recoverableLazy.21e3.test.tsx` › entry failure: the retry re-calls the original, then imports &lt;entry&gt;?r=1. under a map scoped to the retry URL only (3) |
| R13-map-unscoped | import-map scopes keyed by the original URL | KILLED | `recoverableLazy.21e3.test.tsx` › entry failure: the retry re-calls the original, then imports &lt;entry&gt;?r=1. under a map scoped to the retry URL only (3) |
| R14-no-css-relink | a failed stylesheet not re-linked before the retry | KILLED | `recoverableLazy.21e3.test.tsx` › a CSS dependency failure re-links a validated ?r= stylesheet, then re-calls the original (no JS remap) (3) |
| R15-shape-unchecked | a module without a component `default` accepted | KILLED | `recoverableLazy.21e3.test.tsx` › a recovered module that is not a component fails closed (2) |
| R16-shared-no-pick | the shared loader takes `default` instead of picking the `Module` export | KILLED | `recoverableLazy.21e3.test.tsx` › review fix 1 (R1-5): a shared chunk (namespace export, no default) recovers through its one namespace export (1) |
| R17-no-serialization | the remap queue removed (recoveries run concurrently) — the review's surviving mutant | KILLED | `recoverableLazy.rf1.test.tsx` › the second remap reuses the first's recovered copy of the shared module (1) |
| R18-css-relink-fail-open | a stylesheet re-link that fails is ignored | KILLED | `recoverableLazy.rf1.test.tsx` › a re-link that fails again fails the retry: the part does not render without its stylesheet (1) |
| R19-css-first-only | only the first failed stylesheet recorded | KILLED | `recoverableLazy.rf1.test.tsx` › every failed stylesheet is re-linked before the retry (not only the one the error names) (1) |
| R20-inflight-ignored | an overlapping recovery is not refused | KILLED | `recoverableLazy.rf1.test.tsx` › a disjoint recovery completes while an earlier one stalls; an overlapping one is refused; the late success is recorded (1) |
| R21-no-import-bound | the retry import is unbounded | KILLED | `recoverableLazy.rf1.test.tsx` › a disjoint recovery completes while an earlier one stalls; an overlapping one is refused; the late success is recorded (1) |
| R22-remap-any-browser | the remap used for any browser wording (not only a cached failure) | KILLED | `recoverableLazy.rf1.test.tsx` › Firefox wording: the retry re-calls the original only, never imports another URL (1) |
| R23-element-accepted | any object with `$$typeof` accepted as a component | KILLED | `recoverableLazy.rf1.test.tsx` › the load fails (re-armable) instead of handing React an element as a component type (1) |
| R25-css-relink-page-wide | a retry re-links every failed stylesheet of the page (not its own) | KILLED | `recoverableLazy.rf2.test.tsx` › the hotspot's stylesheet stays down; the code stimulus (a JS failure) retries without re-linking or waiting for it (1) |
| R26-no-total-bound | no bound on all source reads of one recovery | KILLED | `recoverableLazy.rf2.test.tsx` › each read is under its own bound but the recovery is cut at `total`; a disjoint recovery is not held behind it (1) |
| R27-own-css-unrecorded | a load's requested stylesheets not recorded as its own | KILLED | `recoverableLazy.rf1.test.tsx` › every failed stylesheet is re-linked before the retry (not only the one the error names) (1) |
| R24-shared-pick-ambiguous | an ambiguous shared namespace accepted | KILLED | `recoverableLazy.21e3.test.tsx` › review fix 1: a shared chunk whose namespace export is ambiguous (or missing) fails closed (1) |
| B01-retry-loads-nothing | «إعادة المحاولة» retries no loader | KILLED | `student/exam/exam21e3.units.test.tsx` › chunk failure → card (no internals) → «إعادة المحاولة» → the question renders; the failed React.lazy is replaced (5) |
| B02-log-leaks | the boundary log carries the error message | KILLED | `StudentExamPage.ux21e3.test.tsx` › shows a recovery card for THAT question; the exam, the other questions and the answers stay; no save / submit; nothing leaks (3) |
| B03-reload-before-retry | «إعادة تحميل الصفحة» offered before any retry | KILLED | `StudentExamPage.ux21e3.test.tsx` › after a failed retry the card offers a reload ONLY when everything is saved and the attempt is not strict (1) |
| B04-no-reset-on-new-question | the card does not reset for another question | KILLED | `student/exam/exam21e3.units.test.tsx` › a new question (resetKey) starts clean; a stem fallback keeps the text WITH a notice and a retry (never silent) (1) |
| B05-no-focus-follow | after a successful retry focus does not follow the recovered part | KILLED | `StudentExamPage.rf1.test.tsx` › «إعادة المحاولة» on the review card: the review returns and focus is on «مراجعة الإجابات», never <body> (4) |
| B13-focus-on-answer-control | after a recovery focus goes to the part's first control (answer control) | KILLED | `StudentExamPage.ux21e3.test.tsx` › «إعادة المحاولة» renders the question again in place (no reload); focus moves to the recovered question's line, never an answer contro (2) |
| B14-no-landing-line | no landing line after a recovery | KILLED | `StudentExamPage.ux21e3.test.tsx` › «إعادة المحاولة» renders the question again in place (no reload); focus moves to the recovered question's line, never an answer contro (5) |
| B06-stem-card-not-text | a failing stem shows the full card instead of its text | KILLED | `StudentQuestionCard.stem.rf1.test.tsx` › visible notice + retry, the answer area stays, and the announcer does not claim the question failed (2) |
| B07-refocus-steals | a failed retry always takes focus | KILLED | `student/exam/rf1.units.test.tsx` › the student moves to another field and types while the retry is loading: focus and keystrokes stay there (1) |
| B08-retry-every-loader | a card's retry retries every failed loader of the page | KILLED | `student/exam/rf1.units.test.tsx` › outside the exam (no provider): focus lands on the «تم تحميل هذا الجزء.» line just before the recovered part — not <body>, not its inp (4) |
| B09-guidance-not-describing | the after-retry guidance is not linked to the button | KILLED | `StudentExamPage.rf1.test.tsx` › strict attempt: «لا تغادر صفحة الامتحان» is announced and linked to the focused action (2) |
| B10-stem-silent | a stem falls back to plain text silently | KILLED | `StudentQuestionCard.stem.rf1.test.tsx` › visible notice + retry, the answer area stays, and the announcer does not claim the question failed (2) |
| B12-css-failure-logged-runtime | a stylesheet failure logged as `runtime` | KILLED | `student/exam/rf1.units.test.tsx` › «Unable to preload CSS» and a recovery refusal are chunk-load; any other error is runtime (1) |
| B11-student-wording-everywhere | exam wording in every context | KILLED | `student/exam/exam21e3.units.test.tsx` › a new question (resetKey) starts clean; a stem fallback keeps the text WITH a notice and a retry (never silent) (2) |
| P01-reload-in-strict | reload offered in a strict attempt | KILLED | `StudentExamPage.rf1.test.tsx` › strict attempt: «لا تغادر صفحة الامتحان» is announced and linked to the focused action (2) |
| P02-reload-unsaved | reload offered while an answer is not server-confirmed | KILLED | `StudentExamPage.rf1.test.tsx` › the save of the newest edit keeps failing while online: after a failed retry there is no reload action (1) |
| P03-focus-on-open | focus moved when the page opens on the questions | KILLED | `StudentExamPage.ux21e3.test.tsx` › a page that opens directly on the questions (legacy untimed) does not move focus (1) |
| P04-no-result-focus | no focus on the result heading | KILLED | `StudentExamPage.ux21e3.test.tsx` › submitting focuses the result heading (exactly one submit) (1) |
| P05-no-start-focus | no focus on the question heading after start | KILLED | `StudentExamPage.rf1.test.tsx` › after «بدء المحاولة» the last page scroll is instant (2) |
| P07-timer-no-memory | timer thresholds not remembered per attempt | KILLED | `StudentExamPage.ux21e3.test.tsx` › crossing 5 minutes is announced once; nothing every second; nothing before the threshold (2) |
| P08-reload-offline | reload offered while offline | KILLED | `StudentExamPage.rf1.test.tsx` › after a failed retry, offline with nothing unsaved: guidance to continue, no reload action (1) |
| P09-transition-smooth | entering the questions uses a smooth scroll | KILLED | `StudentExamPage.rf1.test.tsx` › after «بدء المحاولة» the last page scroll is instant (1) |
| P10-timer-off-screen | timer effect runs outside the questions screen | EQUIVALENT | survives by design: the announcer exists only on the questions screen, so `announce()` returns false elsewhere (defence in depth); RF1-P5 covers the rule |
| P12-announcer-never-cleared | a delivered message is never cleared | KILLED | `StudentExamPage.rf1.test.tsx` › RF1-P10: a delivered message is cleared again after ANNOUNCEMENT_CLEAR_MS (nothing stale to read in browse mode) (2) |
| P11-announcer-no-settle | the first message written in the frame the announcer is inserted | KILLED | `StudentExamPage.rf1.test.tsx` › the first message is written only after the announcer has settled (not in the frame it was inserted) (4) |
| P13-announcer-no-gap | a message may replace the previous one at once (no gap) | KILLED | `student/exam/examAnnouncer.rf2.test.ts` › a message that arrives just after another one was written waits for the rest of the gap (it never replaces it at once) (1) |
| P14-announcer-drop-silent | a dropped message reports nothing | KILLED | `student/exam/examAnnouncer.rf2.test.ts` › leaving the page drops what is still queued: onDropped, never onDelivered; announcing without a region queues nothing (1) |
| P15-announcer-drop-delivered | a dropped message reported as delivered | KILLED | `student/exam/examAnnouncer.rf2.test.ts` › leaving the page drops what is still queued: onDropped, never onDelivered; announcing without a region queues nothing (1) |
| P16-review-anchor | a recovered review card anchors on the (absent) question heading | KILLED | `StudentExamPage.rf1.test.tsx` › «إعادة المحاولة» on the review card: the review returns and focus is on «مراجعة الإجابات», never <body> (1) |
| K01-reveal-pointer-focus | focus-time guard removed (any focus revealed) | KILLED | `student/exam/keyboardReveal.rf1.test.tsx` › focus-time guard: a programmatic focus with no key at all, or after a stale key press, never scrolls (2) |
| K02-reveal-while-pointer-down | focus while a pointer is down is revealed | KILLED | `student/exam/keyboardReveal.rf1.test.tsx` › focus-time guard: focus that happens while a pointer is down never scrolls, even if the pointer is released before the frame (1) |
| K03-reveal-any-key | any key arms a reveal | KILLED | `student/exam/keyboardReveal.rf1.test.tsx` › reveals only keyboard-caused focus; pointer focus, a held pointer and a stale key press never scroll (1) |
| K04-reveal-not-consumed | one key press reveals several focus changes | KILLED | `student/exam/keyboardReveal.rf1.test.tsx` › reveals only keyboard-caused focus; pointer focus, a held pointer and a stale key press never scroll (1) |
| K06-reveal-smooth | the keyboard reveal scrolls smoothly | KILLED | `StudentExamPage.ux21e3.test.tsx` › Tab to a field partly under the bottom navigation → the smallest scroll clear of the bar; typing and a visible field never scroll (3) |
| K07-reveal-fixed-layer | the reveal also runs inside a fixed-position layer | KILLED | `student/exam/keyboardReveal.rf1.test.tsx` › review fix 2: nothing is revealed inside a fixed-position layer (a full-screen editor covers the bars) (1) |
| K05-reveal-no-frame-recheck | the frame-time re-check removed | KILLED | `student/exam/keyboardReveal.rf1.test.tsx` › frame-time re-check: an element that lost focus before the frame is not revealed (1) |
| A01-timer-repeat | a threshold announced again on every tick | KILLED | `StudentExamPage.ux21e3.test.tsx` › crossing 5 minutes is announced once; nothing every second; nothing before the threshold (3) |
| A02-timer-early | a threshold announced a minute early | KILLED | `student/exam/exam21e3.units.test.tsx` › nothing above 5 minutes, at expiry or for an invalid value (1) |
| A03-save-noisy | «تم الحفظ» announced after every ordinary save | KILLED | `StudentExamPage.ux21e3.test.tsx` › shows a recovery card for THAT question; the exam, the other questions and the answers stay; no save / submit; nothing leaks (4) |
| A04-label-live-again | the visible save label made a live region again | KILLED | `StudentExamPage.reliability.test.tsx` › 16: exactly ONE polite live region (the page announcer, 21E.3); the save label itself is not live (4) |
| L01-cli-not-isolated | the CLI `<pre>` loses `dir="ltr"` | KILLED | `StudentExamPage.ux21e3.test.tsx` › the command block and its blanks carry dir=ltr; the typed value is stored as typed (no bidi control character) (1) |
| L02-physics-title-ltr | the physics title loses its RTL direction | KILLED | `student/exam/exam21e3.units.test.tsx` › the notification grade, the install brand and the physics energy title are isolated in their components (1) |
| L03-island-drops-bdi | the LTR island helper drops the `<bdi>` | KILLED | `pwa/InstallAppCard.6a.test.tsx` › declined → the calm note AND the manual guidance (never masked); can be hidden; a later prompt works again (7) |
| L04-grade-any-preview | grade isolation without a composed grade | KILLED | `notifications/NotificationBell.grade.rf2.test.tsx` › titles with fractions stay as written; only the composed grade (the last x/y) is a <bdi dir=ltr> (2) |
| L06-grade-not-exposed | the presentation does not expose the composed grade | KILLED | `notifications/NotificationBell.grade.rf2.test.tsx` › titles with fractions stay as written; only the composed grade (the last x/y) is a <bdi dir=ltr> (1) |
| V01-keys-read-twice | the hidden keyboard steps are not aria-hidden | KILLED | `student/exam/exam21e3.units.test.tsx` › the hotspot instruction is one line; the guide is collapsed yet still describes the image for screen readers (1) |
| D01-chart-reload-in-exam | the chart's in-exam copy advises a reload | KILLED | `charts/DataChartRetry.rf2.test.tsx` › engine import fails during an exam (strict or not): the table opens, the message names no reload, there is no retry button (1) |
| L05-grade-unbounded | grade pattern matches dates and addresses | KILLED | `student/exam/rf1.units.test.tsx` › الاختبار القادم يوم 12/10/2026 (3) |
| G01-guard-name-unchecked | guard: declared name not tied to its import | KILLED | `scripts/check-bundle-budget.rf1.test.mjs` › a name that is not the imported file's base name fails (the runtime would never recover it) (1) |
| G02-guard-neverremap-unread | guard: `NEVER_REMAP` not enforced | KILLED | `scripts/check-bundle-budget.rf1.test.mjs` › a NEVER_REMAP name may not be declared recoverable, and every NEVER_REMAP name must exist in the build (1) |
| G04-guard-alias-unchecked | guard: aliased loader references accepted | KILLED | `scripts/check-bundle-budget.rf1.test.mjs` › `const rl = recoverableLazy; rl(...)` fails the guard; imports, comments and literal calls do not (1) |
| G05-guard-symlink-skip | guard: skipped when run through a symlinked path | KILLED | `scripts/check-bundle-budget.rf1.test.mjs` › node <symlinked repo>/scripts/check-bundle-budget.mjs runs the checks (here: no dist → it fails) instead of exiting 0 silentl (1) |
| G03-guard-no-minimum | guard: no minimum declaration count | KILLED | `scripts/check-bundle-budget.rf1.test.mjs` › fewer than the minimum number of declarations fails (a vacuous guard) (1) |


### 13.5 Validation and bundle

| Check | Result |
|---|---|
| Root suite, `npx vitest run` on `54e0c05` | **954 files, 12,361 passed, 1 failed** (12,362) |
| The one failure | `src/AppShell.lazyDashboard.8e.test.tsx` (Phase 8E teacher shell). It waits 1 s for a lazily loaded teacher chunk, which took longer in this container. It passes with a longer wait, fails identically on `main` `31f4008` here (also reported by the governance reviewer), and was green in CI on `eb174d1`. *(Corrected in Review Fix 3, §14: it does import modules this phase changed — `TeacherPlatform` → `AssignmentsPanel` → `ExamPreview` → `StudentQuestionCard` → the boundary, the loader and the registry — inside the lazy chunk it waits for. The conclusion stands: it fails identically on `main` and is green in CI.)* It is not patched here (AGENTS.md §12: no widened timeouts); CI on the exact head is reported in the PR. |
| Lint | 0 errors, 125 warnings. Same set as `92f4326`; two messages list the same dependency names in another order. Moving the announcer into a module first raised 7 "refs during render" warnings; wrapping its methods in `useCallback` removed them. |
| Typecheck | `npx tsc -b` clean |
| Build + bundle guard | passed: 57 declarations / 55 recoverable chunks, NEVER_REMAP 12, 350 / 350 chunks; the alias check finds no reference outside an import or a literal call |
| Runner unit | 407 / 407 (no Runner file changed) |
| Whitespace | `git diff --check`, `git diff origin/main --check` clean |
| Initial JS / CSS (gzip 9) | **113,134 B** (`main` 113,118 B, +16 B) / **36,084 B** |



### 13.6 Remaining findings after Review Fix 2

| Id | Sev | Finding | Rationale |
|---|---|---|---|
| 85 | P2, **owner decision** | An unrenderable question is submitted as unanswered | Unchanged: it needs a submission / grading contract change (§10). |
| 14 | P2 | The exam-level card hides the chrome | Unchanged (§12.7). |
| Pointer RR-PTR-2 | P3, accepted | A Tab pressed while a mouse button is held is never revealed (the summary stayed 22 px under the bar) | This is the rule "nothing is revealed while a pointer is down", which protects every press. The next Tab reveals. |
| Pointer RR-PTR-4 | P3, pre-existing | With a two-line exam title, the heading after navigation lands 6–18 px under the top bar at 150 % / 200 % | Navigation positioning is unchanged; the base behaves identically (corrected in §12.7). |
| Pointer RR-PTR-5 | P3 info, pre-existing | React error #185 in automated burst typing under heavy CPU load (head 4 / 37 runs, base 2 / 18) | Not introduced and not root-caused here; it needs its own investigation. |
| Accessibility RR-7 | P3 info | After one formula retry, other formulas of the same stem keep their own notices | A consequence of per-card retry (a card retries only its own loaders); each has a working retry. |
| 30, 31, 43 / 49, 44 (second half) | info | as §12.7 | Unchanged. |
| Page wiring of `onDropped` | P3 | The page clears its timer key when a queued notice is dropped. The unit test covers `onDropped`, but no page test reaches the screen change (questions → gate → questions within 400 ms). | The announcer contract is unit-tested; the page wiring is one line, read in review. |

Also not measured: Safari / WebKit, Firefox, and real screen-reader speech (as §12.7).

### 13.7 Reconciliation with `main` (AGENTS.md §7)

At the fetch before the final review, `origin/main` had moved from `31f4008` to
**`0e7adeca45890cd7889478abfef730fb2dcd3bae`**, the merge of PR #302 (Phase 21E.2, the teacher workspace).

| Item | Value |
|---|---|
| Merge | `de0cef4`: a normal merge of `origin/main` into this branch. One conflict, `.gitignore`, resolved as the union of both additions. No other file is changed on both sides. No generated file is involved. |
| Typecheck / lint | `npx tsc -b` clean. Lint 0 errors and 125 warnings, the **same set as the new `main`**. |
| Build + bundle guard | Passed: 57 declarations / 55 recoverable chunks, NEVER_REMAP 12, header parser **352 / 352** chunks (1,103 edges). Initial JS **113,206 B** (new `main` 113,170 B, **+36 B**); initial CSS **36,564 B** (new `main` 36,278 B). |
| Root suite | **964 files, 12,432 passed, 1 failed**: the same `AppShell.lazyDashboard.8e` timing test, which fails identically on `0e7adec` in this container (§13.5) |
| Mutation | The 16 mutated sources are byte-identical to the final ledger (sha256), so the 80-mutant result (79 killed, 1 equivalent) stands for the reconciled head |
| Chromium harness on the reconciled build | pointer **52 / 52**, entry **76 / 76**, dependency **58 / 58**, css **36 / 36**, css-twice **18 / 18**, strict **58 / 58**, stilldown **36 / 36**. The only console errors are the injected failures' own logs. |

The reconciliation changed no measured outcome of this phase.

## 14. Review Fix 3

A new read-only adversarial review of the exact head `593fd47` ran with three independent reviewers, each in its own detached
worktree:

| Area | Verdict | Introduced findings |
|---|---|---|
| Governance, test integrity, evidence accuracy | PASS | 3 × P3 (record wording and evidence) |
| Recovery runtime, boundaries, focus after recovery | PASS | 3 × P2, 3 × P3 |
| Pointer / touch / keyboard input integrity and accessibility | PASS (one P2 the reviewer asked to fix or put to the owner) | 1 × P2, 2 × P3 |

The reviewers confirmed the Review Fix 2 evidence (exact-head CI on `593fd47`, the 80-mutant ledger, the Chromium harness, the
P1 fix: 396 ordinary key presses after a recovery changed no answer). Review Fix 3 fixes every introduced P2 and P3 that was
safe to fix; the rest is listed with its rationale in §14.6.

| Item | Value |
|---|---|
| Head reviewed | `593fd47f682c458619c46138bb94f3f28adbbe09` |
| `origin/main` | `0e7adec` at the review; it moved to **`88ed87c`** (PR #308, the premium 3D viewer, and PR #309, documentation) while fixing, and the branch was reconciled (§14.7) |
| Commits | `2159f0f` (RR2-1 to RR2-5: code, tests, mutation script) · `83690db` (merge of `origin/main`, §14.7) · `df60dc2` (input F-1 to F-3, RF3-R5, RF2-P1) · `afeeee1` (a lint-clean RF3-U5) · `62a884b` (the release wait is capped at 60 s) · `3e3d9e6` (the keyboard-only reveal, §14.1) · `52bcc2e` (the in-place corrections) · `7811d44` (the B15 needle) · the following commit carries this record |

### 14.1 Findings and fixes

| Reviewer · id | Sev | Finding | Fix | Evidence |
|---|---|---|---|---|
| Recovery RR2-3 | P2 (the owner's first rule) | A recovery that completed after the student scrolled away jumped the page to the landing line. A click in the following moments recorded a different option: 7 / 8 timed runs, and 3 / 3 spaced runs. The same jump happened on `eb174d1`. | Nothing scrolls after a recovery. The line is focused with `preventScroll` only; so is the page or review heading of a page-level card (its unconditional `revealElement` call is removed). The recovery context keeps a `reveal` hook, documented in `questionRecovery.ts` as keyboard-only: it is used only by the exception at the end of this cell. *(Corrected after the review of `75eaba2`, RR3-5: this cell said the context no longer had a `reveal` hook.)* The page's keyboard reveal skips the headings and the line, so a navigation key pressed while the retry loaded (PageDown, End, arrows) no longer causes the jump either; on `593fd47` that path jumped to the line and recorded option 4 instead of 12 or 13. A retried component now renders in **one commit**: the lazy wrapper used to show its empty fallback for one commit first. That changed the page height twice; scroll anchoring compensated only the first change, and the option under a still pointer moved (found by the Review Fix 3 probes, §14.3). **One exception, for WCAG 2.4.11:** with no reveal at all, the focused line was left under the bottom navigation in 8 / 32 runs of the landing-line probe. So after a retry activated with the **keyboard** (click `detail` 0), during which the page did **not scroll** and **nothing was pressed**, the focused line or heading is brought clear of the bars by the page's instant reveal (no provider: the nearest scroll), never while a pointer is down. The student is then still where they pressed Enter, as after a Tab. A pointer retry, a scroll or any press while the retry loaded keeps the strict rule. | RF3-P1 (scrolled while loading, plus a navigation key), RF3-P4 (pointer retry, review heading), RF3-U4 (outside the exam), RF3-U5 (one commit), RF3-P5 / RF3-U12 (the keyboard exception), RF3-U10 (pointer retry: none), RF3-U11 (a press meanwhile: none); mutants B15, B16, B23–B26, K08, P19, P20, P21, R34 |
| Recovery RR2-1 | P2 (Review Fix 2 regression) | A retried card rendered without its own stylesheet when another loader had requested that stylesheet first. Vite links a shared stylesheet only once, so the later loader never recorded it as its own, and Review Fix 2 re-linked only "own" stylesheets. | A retry re-links and awaits **every** stylesheet that failed in the page, each within the stylesheet bound, and concurrent loads share one link per stylesheet. It still fails closed only when one of the loader's own stylesheets is still down, so another card's outage never blocks it (RR-2 stays fixed). | RF3-R1, RF2-R1 (updated, below), RF3-R4; mutants R28, R30, R31, R32, R33 |
| Recovery RR2-2 | P2 (this phase's in-place model) | A sibling question that shares a failed stylesheet rendered without it and showed no card. | A first load in a page where a stylesheet already failed re-links it first (bounded; it never fails the load, because the stylesheet is not known to be this loader's). *(Corrected after the review of `75eaba2`, RR3-2 / RR3-5: "bounded" was the 15 s stylesheet bound, paid by every first load in the page while a re-link stalled, including loads that do not use that stylesheet; since §15 a first load waits at most 3 s, `firstCss`, and retries keep the full bound.)* The reviewer's reproduction A (open the hotspot, then the label diagram) now renders the label diagram styled. Loads that start together, before the failure is known, are the residual (§14.6). | RF3-R2 (two cases); mutant R29 |
| Recovery RR2-4 | P3 | The landing line sits inside the rich stem, which names the answer controls (`aria-labelledby`), so the radio group's name included «تم تحميل هذا الجزء.» until another question was shown. | Once focus leaves the line it gets `aria-hidden="true"`. It keeps its place, so nothing moves; while it has focus it is read. | RF3-U3; Chromium accessibility tree (§14.3); mutants B17, B18 |
| Recovery RR2-5 | P3 | Three reviewer mutants survived: M3 (a successful retry may take focus after the student moved), M5 (the same for a page-level card), M6 (no reload gate while submitting or pausing). | Tests for each: a successful retry while the student moved to another field; a page-level card while the student moved; the reload action while a pause, or a submit, is in flight. | RF3-U1, RF3-U2, RF3-P2, RF3-P3; mutants B19 (M3, both layers together), B20 (M5), P17 and P18 (M6) |
| Recovery RR2-6 | P3 info | On a slow but working network (every source read about 9 s), the 30 s total bound fails the first press; the second press renders from cache. | Not changed: the bound is the RR-3 fix, and it fails safe (§14.6). | — |
| Governance GOV2-1 | P3 | §13.5 said the failing `AppShell.lazyDashboard.8e` test imports nothing this phase changed. | Corrected in place: it reaches `StudentQuestionCard` through the teacher platform; the conclusion stands. | — |
| Governance GOV2-2 | P3 | §13.2 under-reported the fail-first evidence (an earlier run, without `keyboardReveal.rf1`). | Corrected in place: 19 cases fail on `eb174d1` with the final test files; the `reducedMotion` artefact is explained. | re-run logs |
| Governance GOV2-3 | P3 | The §12.4 figure 0.0024 had no reproducible source. | The source is cited in place and recomputed from it. | — |
| Input F-1 | P2 (the owner's rule on press and release) | A retry that completed **during a press** scrolled the page under the finger or pointer: on touch, Chromium moves focus only at the end of a tap, and a mouse press on an option `<label>` leaves focus on `<body>`, which the card read as "still on the card"; it then focused the line and revealed it. Phone touch, notice above the viewport: 0 / 6 correct (2 wrong options, 4 taps lost); mouse on option labels: 10 / 12 clicks lost; hotspot taps at phone / 150 % / 200 %: 6 / 6 lost. Present since Review Fix 1. | That reveal is gone (RR2-3; the keyboard-only exception of §14.1 never applies when anything was pressed). In addition, a card never changes the layout or moves focus while a pointer or finger is down in the page or a native drag is in progress: it waits for the release, so a press in progress ends on the layout it started on (`student/exam/pointerHold.ts`; passive capture listeners installed when the boundary first catches an error; a touch scroll keeps the finger down until the last `touchend`). *(Corrected after the review of `75eaba2`, RR3-5: this cell said "anywhere", but the version reviewed missed a native drag, whose pointer Chromium cancels at `dragstart` (RR3-1), and a press that began before the first retry (RR3-3); both are fixed in §15. A press inside an embedded frame is not seen by the page (§15.6).)* The wait is capped at 60 s, a safety net for a release the page never saw (any later press and release also ends it); the cap is long because a real press can be long, such as a drag in the physics lab or around a 3D model (a 10 s cap let the reviewer's held press see the swap). A press outside the card since «إعادة المحاولة» means the student moved on: focus is not taken. | RF3-U6 (mouse), RF3-U7 (touch), RF3-U9 (a 45 s press is still waited for); the reviewer's race probes on the final build (§14.3); mutants B21, B22, H01, H02 |
| Input F-2 | P3 (in-place recovery) | With the card or notice in view, the recovered part's height change moved the content during a press even without a scroll (phone touch: option index 3 saved instead of 1). | The same wait: the layout no longer changes between press and release. What remains is a press that *starts* after the swap but was aimed before it (§14.6). | as F-1 |
| Input F-3 | P3 (WCAG 2.4.7) | After a formula retry, focus lands on a visually hidden line: no visible focus indicator. | `ui.css`: a focused hidden recovery line outlines the recovered part that follows it (keyboard focus only, like every focus ring). The line leaves the stem's name once focus moves (RR2-4). | RF3-U8; mutant C01 |
| Input test gap | P3 | RF2-P1 asserted a 1000 ms gap, not the 1.5 s constant | It now asserts `ANNOUNCEMENT_GAP_MS` less 50 ms of real-timer jitter; `examAnnouncer.rf2` pins the exact gap with a clock. | — |

Changed expectation, with its reason (AGENTS.md §12): RF2-R1 asserted that another card's stylesheet was "neither re-linked nor
awaited". That detail was the Review Fix 2 design that caused RR2-1. Its rule is kept: the other card's outage never fails this
retry, and a re-link that hangs only delays it within the stylesheet bound (a second case). The test now also asserts the
re-link itself.

### 14.2 Fail-first (executed against `593fd47`)

The final test files were copied into a detached worktree of `593fd47` and run there. `rf3.units` imports the new
`pointerHold` module, which does not exist there, so it ran as a copy without that import and without RF3-U9 (which tests only
that module). **14 cases fail on `593fd47` and pass on the head.** Each failing assertion is the defect itself:

| Case | Failing assertion on `593fd47` |
|---|---|
| RF3-P1 scrolled while the retry loaded, plus a navigation key | `scrollBy` called 2 times (the reveal, then the keyboard reveal) |
| RF3-P4 a pointer retry of the review card | `scrollBy` called 1 time (the heading revealed) |
| RF3-U4 far from the viewport, scrolled meanwhile (no provider) | `scrollIntoView` called 1 time |
| RF3-U10 a pointer retry far from the viewport | `scrollIntoView` called 1 time |
| RF3-U11 a keyboard retry with a press on the card meanwhile | `scrollIntoView` called 1 time |
| RF3-U5 one commit | `expected 2 to be 1` (the empty fallback committed again) |
| RF3-U3 landing line after Tab | `expected null to be 'true'` (`aria-hidden` never set) |
| RF3-U6 a mouse press elsewhere during the completion | `Unable to find [data-testid="question-recovery"]`: the card was replaced while the button was down |
| RF3-U7 a finger down (touch scroll) during the completion | the same, during the touch |
| RF3-U8 visible focus for a hidden line | the `ui.css` rule does not exist |
| RF3-R1 stylesheet requested by another loader | `expected [] to deeply equal [VisualCanvas…css]` (no re-link on the retry) |
| RF3-R2 first load after a stylesheet failed | `expected [] to deeply equal [VisualCanvas…css]` (no re-link) |
| RF3-R4 concurrent loads share one re-link | `expected [] to have a length of 1` (no re-link at all) |
| RF2-R1 (updated) | `expected [] to deeply equal [css, css]` (no re-link) |

Pins and gap tests that pass on `593fd47` (their value is the mutants they kill, §14.4): RF3-U1, RF3-U2, RF3-U12, RF3-P2,
RF3-P3, RF3-P5 (`593fd47` always revealed), RF3-R2 (still down), RF3-R3, RF3-R5, the RF2-R1 hang case and RF2-P1. RF3-U9 cannot
load there (new module). Logs: `failfirst-593fd47-final2.log` and `failfirst-593fd47-units2.log` with the session evidence.

### 14.3 Chromium evidence (production build of the Review Fix 3 tree, Chromium 141)

All on a production build of the code-final head `3e3d9e6` (the documentation commits change no shipped file), Chromium 141,
run one after another with nothing else on the machine. The reviewers' own probes were re-run unchanged, except
`anchored.mjs` (its patch targets re-pointed to this build's minified names) and `race-hold.mjs` (a copy of `race.mjs` that holds
the press for 15 s instead of until the card goes away).

| Probe | Runs | `593fd47` (reviewers) | Final build |
|---|---|---|---|
| Repository harness `scripts/check-student-exam-browser-21e3.mjs` | 7 modes | all green | pointer **52 / 52**, entry **76 / 76**, dependency **58 / 58**, css **36 / 36**, css-twice **18 / 18**, strict **58 / 58**, stilldown **36 / 36**; console errors are only the injected failures' `{code: chunk-load}` logs |
| Input F-1 `race3` (multiple choice; formula retry completes during a touch / mouse press; phone, 150 %, 200 %; card 30 / 140 px above the bar; leads 600 / 150 / 60 ms) | 36 + 36 control | phone touch 0 / 6 correct (2 wrong options, 4 taps lost) | **36 / 36** intended option saved (control 36 / 36); 0 scrolls and 0 px content shift during the press; focus never moved during the press |
| Input F-1 `race2` (hotspot part below a retrying label-diagram part; card 0 / 40 / 120 px above the bar) | 54 | touch 6 / 6 taps lost | **54 / 54** points saved, 0 scrolls during the press, worst error 0.0055 of the image (one pixel of the phone layout) |
| `race-hold` (press held 15 s on text while the retry completes; touch pan on the phone) | 6 held + 8 idle | the card was replaced under the press | the card stays for the whole press and is replaced after the release; 0 scrolls during the press; focus is not taken |
| Recovery RR2-3 `scrollaway` (wheel away, then a click at the unchanged pointer) | 4 | 4 / 4 the jump put the stimulus under the pointer, nothing saved (and 7 / 8 wrong options in the reviewer's timed variant) | **4 / 4** the option under the pointer is the one saved (scroll anchoring adjusts for the recovered height above) |
| `scrollaway2` (3-line and 1-line stimulus, wheel 100–600 px, keyboard and mouse retry) | 20 | 3 / 3 option 4 saved instead of 7, 9 or 12 | 16 / 20 the same option saved; **4 / 4 others with the card still in view**: the recovered height moved the content once and the click landed between options, recording nothing (§14.6) |
| `keyaway2` (Enter, then PageDown / End / arrows while the retry loads; 1-, 3- and 18-line stimulus) | 9 | PageDown / End: jump to the line, option 4 saved instead of 12 / 13 | 7 / 9 the same option saved; 2 / 9 with the card in view landed on a gap or on the stimulus (no answer recorded) |
| Landing line `line.mjs` (part / question, keyboard / pointer, 4 zooms × 2 motion settings) | 32 | 32 / 32 pass | **32 / 32** pass; 0 saves from ordinary keys; 0 layout shifts; the focused line is **clear of both bars in 32 / 32** (8 / 32 were under the bottom navigation before the keyboard-only reveal) |
| Accessible name (`rf3probe`, formula and chart inside the stem) | 2 | the group name included «تم تحميل هذا الجزء.» | the line is read while focused; after Tab the group's name is the stem alone, and the line keeps its place |
| `focusall` (every boundary variant; key, click, delayed; then ordinary keys) | 36 (396 keys) | focus on the line 36 / 36, no answer changed | the same: focus on the line or the heading 36 / 36, 0 answers changed, 0 saves |
| `anchored` (page and exam cards) | 4 | heading focused | heading focused; no line |
| `movedaway` (typing in another field while the retry completes) | 2 | — | focus and all typed characters kept, saved exactly; no line |
| `cssshare` (shared stylesheets) | 5 scenarios | A, C unstyled; B unstyled | A (first load of a sibling) and C (a retry that needs a stylesheet another loader requested) render styled; F (another card's stylesheet stays down) does not block, the card whose own stylesheet stays down fails closed; B (two parts loading together) is the residual (§14.6); every module evaluated once |

### 14.4 Mutation campaign (107 mutants, AGENTS.md §9)

`scripts/mutate-21e3.mjs` in a clean detached worktree of the code-final head `3e3d9e6`, nothing else running, in two batches
(54 + 53, each under the session's two-hour limit). B15 was reported **invalid** ("needle count 0": its needle predated the
keyboard-only reveal); `7811d44` re-points it and it was re-run alone there. The 18 mutated sources are byte-identical in every
run and on the final head (sha256).

| Run | Mutants | Killed | Equivalent | Survived | Timeout | Invalid | Restored |
|---|---|---|---|---|---|---|---|
| batch A (`3e3d9e6`) | 54 | 53 | 0 | 0 | 0 | 1 (B15) | yes, `git status` clean |
| batch B (`3e3d9e6`) | 53 | 52 | 1 (P10, with its reason) | 0 | 0 | 0 | yes, `git status` clean |
| B15 re-run (`7811d44`) | 1 | 1 | 0 | 0 | 0 | 0 | yes |
| **Total** | **107 across 18 files** | **106** | **1** | **0** | **0** | **0** | |

Earlier runs of this round, superseded by later fixes: on `2159f0f`, stopped after 40 mutants because the input reviewer's F-1
changed the boundary — in it **R27 survived** (a stylesheet the load requested but the error did not name was no longer treated as
the loader's own once every failed stylesheet is re-linked), a real gap that RF3-R5 now closes; on `df60dc2` / `afeeee1`, 102
mutants: 101 killed, P10 equivalent.

New and changed mutants of this round, with the test that killed each one:

| Id | What was planted | Killed by |
|---|---|---|
| R27 | the stylesheets a load requested are not recorded as its own | RF3-R5 |
| R28 | a retry re-links only its own failed stylesheets (Review Fix 2) | RF3-R1, RF2-R1 |
| R29 | no re-link on a first load after a stylesheet failed | RF3-R2, RF2-R1 |
| R30 | any failed stylesheet fails the retry | RF2-R1 |
| R31 | re-links not awaited | RF3-R1, RF1-R1 |
| R32 | concurrent loads not sharing one re-link | RF3-R4 |
| R33 | a finished re-link never cleared (no later re-link) | RF3-R1, RF2-R1 |
| R34 | a retried component suspends once more (empty fallback commit) | RF3-U5 |
| B15 | an unconditional scroll to the line after a recovery | RF3-P1, RF3-U4, RF3-U10, RF3-U11 |
| B16 | the line focused without `preventScroll` | RF3-P1 |
| B17 | the line never `aria-hidden` | RF3-U3 |
| B18 | the line never goes quiet on blur | RF3-U3 |
| B19 | focus taken after the student moved (both layers: `onCard` and the idle check) | RF3-U1 |
| B20 | a page-level card takes focus after the student moved | RF3-U2 |
| B21 | the card swapped during a press (no wait for the release) | RF3-U6, RF3-U7 |
| B22 | a press elsewhere since the retry ignored | RF3-U6, RF3-U7 |
| B23 | a pointer retry treated as a keyboard retry (reveal) | RF3-U10, RF3-P4 |
| B24 | reveal although the page scrolled while the retry loaded | RF3-P1, RF3-U4 |
| B25 | reveal although something was pressed while the retry loaded | RF3-U11 |
| B26 | no reveal after a keyboard retry during which nothing moved | RF3-P5, RF3-U12 |
| H02 | the release wait capped at 10 s (a long press sees the swap) | RF3-U9 |
| H01 | a finger not tracked (only the pointer, which a touch scroll cancels) | RF3-U7 |
| C01 | no visible focus for a hidden line | RF3-U8 |
| K08 | the keyboard reveal does not skip the line and the headings | RF3-P1 |
| P17 | reload offered while pausing | RF3-P2 |
| P18 | reload offered while submitting | RF3-P3 |
| P19 | the page heading scrolled into view after a recovery | RF3-P4 |
| P20 | the page heading focused without `preventScroll` | RF3-P4 |
| P21 | the page's reveal skips the headings but not the line | RF3-P1 |

Retired: R25 of Review Fix 2 ("re-link every failed stylesheet") is now the intended behaviour. Needles that the fix changed were
updated for R14, R18, B04 and K01. The script writes each run's ledger to `artifacts/phase-21e3/mutation-ledger.json` (not committed).

### 14.5 Validation and bundle

| Check | Result |
|---|---|
| Root suite, `CI=true npx vitest run`, code-final tree `3e3d9e6` | **968 files, 12,471 passed, 1 failed** (12,472) |
| The one failure | `src/AppShell.lazyDashboard.8e.test.tsx`, the 1 s wait for the lazy dashboard chunk (§13.5, as corrected). It **fails identically on `main` `88ed87c`** in this container (`Unable to find … جارٍ تحميل لوحة المتابعة...`) and is not patched here (AGENTS.md §12). An earlier full run of this round, on `df60dc2`, also had `GovernancePanel.14b` time out once under load (a 1 s `findByRole`); it passed 7 / 7 alone at once and in this final run; this branch changes no governance file. |
| Lint | `npm run lint`: 0 errors, 125 warnings, **the same set as `main` `88ed87c`** (two messages list the same dependency names in another order). A counter reassigned during render in RF3-U5 had added one warning; `afeeee1` replaced it with a spy. |
| Typecheck | `npx tsc -b` clean |
| Build + bundle guard | passed: 57 declarations / 55 recoverable chunks, `NEVER_REMAP` 12, header parser 352 / 352 chunks (1,103 edges) |
| Runner unit | `npm --prefix runner test`: **407 / 407** (no Runner file changed) |
| Whitespace | `git diff --check` and `git diff origin/main --check` clean |
| Initial JS / CSS (gzip 9, the guard's initial graph) | **113,212 B** (`main` `88ed87c` 113,167 B, **+45 B**; budget 125 KB) / **36,591 B** (`main` 36,278 B) |
| Exact-head CI | reported in the PR for the final head (this record is its last commit) |

### 14.6 Remaining findings after Review Fix 3

*(Superseded by §15.6 after the second round: the in-view recovery height residual below did record a different option in the
input reviewer's runs and is narrowed by the press guard, §15.1.)*

| Id | Sev | Finding | Rationale |
|---|---|---|---|
| 85 | P2, **owner decision** | An unrenderable question is submitted as unanswered | Unchanged: it needs a submission / grading contract change (§10). |
| 14 | P2 | The exam-level card hides the chrome | Unchanged (§12.7). |
| RR2-2 remainder | P2 | Two loads that start together share a stylesheet that fails: the one that did not request it renders without it and shows no card (a compound question with a hotspot part and a label part). It is styled as soon as any card's retry, or a later first load, re-links the stylesheet. A sibling also stays unstyled while the stylesheet is still down. | Vite's preload helper does not tell a loader which already-linked stylesheets it needs, so the runtime cannot know the dependency and cannot fail that loader closed without failing unrelated loaders (the RR-2 regression). Fixing it needs the build's chunk → stylesheet map at run time. In the reviewer's runs no wrong answer was recorded: pointer clicks outside the image are rejected and the zone buttons record what was pressed. |
| In-view recovery height | P3, inherent to in-place recovery | When the card is still in view and the recovered part has a different height, the content below it moves once, after any press in progress has been released. A press that *starts* in the moment after the swap but was aimed at the old layout can land elsewhere (Review Fix 3 probes: an 18-line code stimulus replacing a visible card put the stimulus where option 4 was; a 1-line one put a gap there). Identical on `593fd47`. | This is the student's own retry changing the part they are looking at, like any part that loads in view (the code stimulus already appears this way on a first load). Scroll anchoring keeps the content stable for changes above the viewport; a compensating scroll for changes in view would move the recovered part away from the student instead. |
| RR2-6 | P3 info | A slow but working network can need a second press | Fails safe; the bound is the RR-3 fix. |
| Pointer RR-PTR-2, RR-PTR-4, RR-PTR-5; accessibility RR-7; 30, 31, 43 / 49, 44 | P3 / info | as §13.6 | Unchanged. |
| Input info | info, pre-existing | A 4 px hand movement during a press in a code field turns the press into a native text selection and loses one typed character (16 / 16 runs; `31f4008`: 12 / 12). Hotspot pages carry a second polite region (`vq-status`), unchanged from `main`. | Not introduced; no scroll is involved. |

Also not measured: Safari / WebKit, Firefox, and real screen-reader speech.

### 14.7 Reconciliation with `main` (AGENTS.md §7)

At the fetch during Review Fix 3, `origin/main` had moved from `0e7adec` to **`88ed87c7ad17603d7052acc218a19342ba2edc0c`**:
PR #308 (`8a1dd87`, the premium 3D viewer: `Interactive3DView`, its CSS, a SmartSim host style, a viewer test and harness, a
design record) and PR #309 (`88ed87c`, the platform UX audit, documentation only).

| Item | Value |
|---|---|
| Merge | `83690db`: a normal merge of `origin/main` into this branch. No conflict; no file is changed on both sides; no generated file is involved. *(Its commit message names only `8a1dd87` (PR #308): `main` moved to `88ed87c` (PR #309) during that same fetch, and the merge brought in both. Commit messages are never amended; this record is the correction.)* |
| Validation after the merge | everything in §14.3–§14.5 ran on the reconciled tree |
| Measured outcomes | none changed by the merge: the harness counts, the bundle guard (352 / 352 chunks) and the lint set (equal to `main` `88ed87c`) |

## 15. Review Fix 3, second round (review of `75eaba2`)

A new read-only adversarial review of the exact head `75eaba2` ran with three independent reviewers, each in its own detached
worktree:

| Area | Verdict | Findings |
|---|---|---|
| Governance, test integrity, evidence accuracy | PASS | 1 × P3 (PR wording), 4 × info |
| Recovery runtime, boundaries, focus after recovery | **FAIL** (one P2, RR3-1) | 1 × P2, 4 × P3, 2 × info |
| Pointer / touch / keyboard input integrity and accessibility | PASS | 4 × P3 / info (one introduced, as a trade-off), 1 × info |

Both pointer reviewers found the same defect independently: the press wait ended during a native drag (RR3-1 = RR3-IN-1). Every
P2 and every P3 that touches the owner's first rule ("never record an answer different from the student's actual interaction")
is fixed in this round, including two the reviewers rated P3 / info because the record called them residual: a click aimed just
before an in-view recovery recorded a **different option** (RR3-IN-4), and so did a click aimed just before a late first load
appeared (RR3-2). The rest is listed with its rationale in §15.6.

| Item | Value |
|---|---|
| Head reviewed | `75eaba22895c949161959572d2b85b6a34b56ed8` |
| `origin/main` | `88ed87c` at the review and at every fetch of this round: no reconciliation was needed |
| Commits | `963a182` (RR3-1 to RR3-4) · `04f543e` (§14.1 corrected in place, RR3-5) · `ec70ba1` (the press guard, RR3-IN-4) · `bbdb8dc` (a late first load settles, RR3-2) · the following commit carries this section |

### 15.1 Findings and fixes

| Reviewer · id | Sev | Finding | Fix | Evidence |
|---|---|---|---|---|
| Recovery RR3-1 = input RR3-IN-1 | **P2** (the owner's first rule; the input reviewer rated it P3) | The recovery swap still happened **during a native drag** of a label chip. Chromium fires `pointercancel` right after `dragstart` and sends no `pointerup` / `mouseup` until the drop, and `pointerHold` counted `pointercancel` as the release. A label diagram below a retrying code stimulus: zone 3 moved 199 px down while the chip was held, and the drop recorded zone 1 in **10 / 10** runs (control: zone 3, 5 / 5). The input reviewer's `dnd`: 12 / 12 drops lost with the card in view (the zone moved 343–420 px). Identical on `593fd47`: it came with in-place recovery and the F-1 fix missed it. | A native drag is a press from `dragstart` until `drop` / `dragend` (`963a182`). A drag whose drop the page never saw ends at the next pointer move with no button down; a lifted finger (`pointerup` of a touch pointer) ends the touch; the window losing focus ends every press. | RF3-U14, RF3-U15, RF3-U18; Chromium `dragswap2`, `dragswap3`, `dnd` (§15.3); mutants H03, H04, H05 |
| Input RR3-IN-4 | P3 / info (reviewer) — treated as a defect here: it records a different option | A click aimed while the formula notice was in view and pressed **50–180 ms after the swap** saved option 2 or 3 instead of 1 in **12 / 12** runs (200 %, 390 px at 1× and 3×; keyboard and mouse retries alike). The press started after the swap, so the release wait could not help. §14.6 had described this residual as gaps and lost clicks only. | **The press guard** (`ec70ba1`, `pointerHold.guardPresses`): for 400 ms after the layout changed in view (the replaced card intersected the viewport, or the keyboard-only reveal actually scrolled), a press that *starts* was aimed at the old layout — nobody sees a change and re-aims that fast — so its `pointerdown`, `pointerup`, `click` and drag are stopped before the page sees them. A lost press, never a different answer. A keyboard activation (click `detail` 0) is never stopped; a press that started earlier was already waited for and is not affected; a card far above the viewport (scroll anchoring keeps the content still) arms nothing. | RF3-U20, RF3-U21, RF3-U22; Chromium `kbmouse` (§15.3); mutants S01–S10 |
| Recovery RR3-2 | P3 (introduced by Review Fix 3) — its consequence is treated as a defect here | A first load waited for the re-link of every stylesheet that failed in the page, up to the 15 s stylesheet bound, even for a part that does not use that stylesheet: a code stimulus appeared after **15,057 ms** (332 ms on `593fd47`) and the options already shown jumped 128 px. A click 60 ms after it appeared, aimed at option 5, **saved option 3**; a press spanning the appearance was lost. | `963a182`: a first load waits at most **3 s** (`firstCss`) and never fails on it; a retry keeps the full bound. `bbdb8dc`: a first load that appears late — it waited for a failed stylesheet, or it took the recovery path in a page that already recovered a module it shares — resolves only once **no press is in progress**, and the presses that start in the next 400 ms are guarded (`env.settleLate`, `pointerHold.settleLatePart`). A plain first load is unchanged. | RF3-R6, RF3-R7, RF3-U23; Chromium `firststall`, `firststall2`, `firststall3` (§15.3); mutants R29, R35–R40, H07, H08 |
| Recovery RR3-3 | P3 (introduced by Review Fix 3) | The press listeners were installed on the first retry, so a press already in progress (the mouse held on «إعادة المحاولة» while Enter activates it) was invisible: the card swapped and the page scrolled 48 px while the button was held. | The listeners are installed when the boundary first catches an error, and no reveal follows a retry that started while a pointer was down. | RF3-U13; Chromium `keyreveal` E; mutants B27, B28 |
| Recovery RR3-4 | P3 (test gaps) | Reviewer mutants survived: X1 (the pointer guard of the keyboard-only reveal), X2 (the heading reveal after a keyboard retry of a page card), X3 (the token check after the release wait), X4 (the 60 ms settle after a release), X7 (window blur ends a press). X5 and X6: equivalent, by the reviewer's own reading. | A test for each. X1 also exposed that a page-level card focused its heading while a pointer was down after the swap: it now waits for the release, and a press after the retry cancels the reveal. | RF3-U16 (X3), RF3-U17 (X4), RF3-U18 (X7), RF3-U19 (X1, X2); mutants B29, B30, B31, H05, H06 |
| Recovery RR3-5 | P3 (record) | §14.1 contradicted the code three times: "the recovery context no longer has a `reveal` hook"; a card never changes the layout "while a pointer or finger is down anywhere"; a first load's re-link is "bounded" (it was 15 s, unrelated loads included). The input reviewer made the same point about "anywhere" and "a drag" (code comment and §14.1). | Corrected in place in §14.1, each with a marker (`04f543e`); the `pointerHold` comment names drags and the frame limit. | — |
| Recovery RR3-6 | info (pre-existing, identical on `593fd47`) | A retry whose original import stalls shows «جارٍ إعادة المحاولة…» for 60 s or more; the header comment said every step was bounded. | The header comment of `recoverableLazy.ts` now says that this first step is the browser's own import and is not bounded. Not changed: the student can still move to other questions; bounding the browser's own import would need a second copy of the module (never allowed, RR-1). | — |
| Recovery RR3-7 | info (by design) | The keyboard-only reveal moves content under a hovering, not pressed, mouse (the option under it went from 8 to 6; the swap alone moves it to 7). | Kept (the disclosed WCAG 2.4.11 exception of §14.1). A press that starts within 400 ms of a reveal that scrolled is now guarded, so the moved content cannot take a press aimed before it moved. | RF3-U22; mutant S07 |
| Input RR3-IN-2 | P3 / info (pre-existing) | A press inside the sandboxed simulation frame is invisible to the page: a formula in the stem recovered during an in-frame drag and the frame moved 11 px (100 %) / 44 px (150 %) under the press, 4 / 4. A press on page text: 4 / 4 waited. | Not changed (§15.6). | Chromium `iframe3` (§15.3) |
| Input RR3-IN-3 | P3 (introduced by Review Fix 3, as a trade-off) | After a keyboard retry during which the student **scrolled** (wheel), the focused landing line is left where it is: off-screen or under the top bar, in 8 / 8 runs. On `593fd47` the page jumped back to it. | Not changed; put to the owner (§15.6). | Chromium `revealgeom` (§15.3) |
| Input RR3-IN-5 | info | Presses the tracking cannot see, by reading the code: a press before the first retry; a window blur during a hold; a `mouseup` swallowed by a native context menu (the card can show «جارٍ إعادة المحاولة…» for up to 60 s); a press longer than 60 s. | The first is RR3-3 (fixed). A context menu's lost `mouseup` now ends at the next pointer move with no button down. A blur ends a press on purpose: its release is never delivered. The 60 s cap is the documented safety net. | RF3-U13, RF3-U15, RF3-U18 |
| Governance GOV3-2 | P3 | The PR body's Review Fix 2 section still said "13 cases" without a correction marker. | The PR body now carries the marker (19 with the final test files, §13.2). | — |
| Governance GOV3-1, GOV3-3, GOV3-4, GOV3-5 | info | The `83690db` message (corrected in §14.7); kill lists that include a test failing only as a knock-on of module state; one unrelated local timeout under load; the conditional no-scroll rule is disclosed. | No change needed. GOV3-3: the new `pointerHold` state is asserted directly where a knock-on was possible (RF3-U20 checks that a cancelled drag leaves no press in progress); `rf3b` and `rf3c` are separate files so each starts with fresh module state. | — |

What the press guard costs: a press that starts within 400 ms after an in-view recovery, or after a late part appeared, does
nothing, even if it was aimed at the new layout. That needs a person to see the change, re-aim and press within 400 ms; the
student sees that nothing was selected and presses again. Keyboard activation is never affected.

### 15.2 Fail-first

Each fix's tests were run against the commit before it, in a clean detached worktree (the test files copied in, removed after):

| Against | Case | Failing assertion there |
|---|---|---|
| `75eaba2` (shipped sources identical to `7811d44`) | RF3-R6 a first load while a failed stylesheet's re-link stalls | `Unable to find an element with the text: stimulus` (held for the whole 400 ms test bound) |
| | RF3-U13 held on «إعادة المحاولة», then Enter | `Unable to find [data-testid="question-recovery"]`: the card was replaced under the held button |
| | RF3-U14 `dragstart`, then `pointercancel` | the same, during the drag |
| | RF3-U15 a drop the page never saw | the same (the drag was never a press) |
| | RF3-U19 a press after the swap of a page-level card | `expected 'السؤال 2 من 3' not to be 'السؤال 2 من 3'`: the heading was focused while the pointer was down |
| `963a182` | RF3-U20 a press right after an in-view swap | `expected "vi.fn()" to not be called at all, but actually been called 1 times` (the option's `pointerdown`) |
| | RF3-U22 a press right after a reveal that scrolled | the same |
| `ec70ba1` | RF3-R7 a first load after a stylesheet failed | `expected "vi.fn()" to be called 1 times, but got 0 times` (`settleLate`) |
| | RF3-R7 a first load that took the recovery path | the same |
| | RF3-U23 the browser runtime, a press in progress | `expected <p></p> to be null`: the late part appeared under the press |

**10 cases fail on the defect and pass on the head.** Pins and gap tests that pass before their fix (their value is the mutants
they kill): RF3-U16, RF3-U17, RF3-U18, RF3-U19 (keyboard), RF3-U21. The defects of `963a182` and `ec70ba1` are the same on
`75eaba2` (the reviewers measured them there). Logs: `failfirst-75eaba2.log`, `failfirst-963a182-guard.log`,
`failfirst-ec70ba1-late.log` with the session evidence.

### 15.3 Chromium evidence
Production builds of this round's code commits, Chromium 141, one probe at a time. The owner's closure directive stopped the
full re-run of the §14.3 probe set on this head; the probes below are the ones that measure this round's fixes. The rest of §14.3
was last measured on `3e3d9e6` and is **not re-run on this head**.

| Probe | Build | Runs | `75eaba2` (reviewers) | This round |
|---|---|---|---|---|
| Repository harness `scripts/check-student-exam-browser-21e3.mjs` | `bbdb8dc` | 2 modes | all green | pointer **52 / 52**, entry **76 / 76** (the other five modes stopped by the directive; last green on `3e3d9e6`, §14.3) |
| Input `kbmouse` (click aimed during a formula retry, pressed 40 / 120 / 250 ms after the expected completion; 200 %, 390 px at 1× and 3×; keyboard and mouse retries) | `ec70ba1` | 18 | **12 / 18 a different option saved** (option 2 or 3 for 1) | **0 different options**: the 6 presses at +40 ms (before the swap) saved the option aimed at; the 12 at +120 / +250 ms (45–180 ms after the swap, as measured in the keyboard arm) did nothing (no answer recorded) |
| Input `dnd` (a label chip dragged onto a zone while the card above recovers; drag and click modes; the reviewer's `tall` and `tall150` viewports; release −400 to +600 ms around the completion) | `ec70ba1` | 16 | 12 of 18 drag runs lost the drop: every run with the card in view and the swap during the drag (the zone moved 343–420 px) | **16 / 16** saved as aimed; **0 swaps during a press** (the swap waits for the drop) |
| Recovery `firststall` (the stylesheet's re-link stalls; when does the code stimulus appear?) | `bbdb8dc` | 1 | 15,057 ms | **3,098 ms** (`firstCss`) |
| Recovery `firststall2` "after" (click 60 ms after the late stimulus appeared, aimed at option 5) | `bbdb8dc` | 1 | **option 3 saved** | nothing recorded (the press is guarded) |
| `firststall3` (a copy of `firststall2` whose press starts just before the 3 s appearance: 2.90 / 3.00 / 3.05 s, released 150 ms after) | `bbdb8dc` | 3 | (15 s variant: the press was lost) | **3 / 3 option 5 saved**: the stimulus waited for the release |

### 15.4 Mutation (AGENTS.md §9)
The full campaign was not re-run on this head: the owner's closure directive excludes a broad mutation campaign. The last full
campaign is §14.4 (107 mutants on `3e3d9e6`: 106 killed, P10 equivalent, 0 survived). This round's mutants, each run alone in a
clean detached worktree of its commit with `scripts/mutate-21e3.mjs ONLY=…` (files restored byte-for-byte, `git status` clean):

| Mutants | What was planted | Commit | Result | Killed by |
|---|---|---|---|---|
| S01–S10 | no guard after an in-view swap; a guard for any card (out of view too); keyboard clicks stopped; click / pointerdown not stopped; a guard that never ends; a reveal that scrolled arms nothing; a drag not cancelled; a cancelled drag left in progress; a zero window | `ec70ba1` | **10 / 10 killed** | RF3-U20, RF3-U21, RF3-U22 |
| R36–R40, H07, H08 | a late first load not settled; the late flag never set; the recovery-path first load not settled; a retry settled by the runtime too; the browser environment without `settleLate`; no wait for the release; no guard after a late part | `bbdb8dc` | **7 / 7 killed** | RF3-R7, RF3-U23 |
| H03–H06, B27–B31, R35 | the `963a182` fixes (drag, stale press, blur, settle, early listeners, held start, heading during a press, later press, stale retry, first-load bound) | `963a182` | **defined, not run** (closure directive) | their tests fail first on `75eaba2` (§15.2) |

The script now holds 134 mutants (§14.4's 107, plus the 27 above).

### 15.5 Validation and bundle
| Check | Result |
|---|---|
| Focused suites on `bbdb8dc` (`src/student/exam`, `StudentExamPage*`, `recoverableLazy*`, `StudentQuestionCard*`, `presentationFreeze*`, `CompoundQuestion*`, `richContent`, `StructuredExam*`, `questionTypes`) | **90 files, 1,360 / 1,360 passed** |
| Root suite and Runner unit suite | **not re-run locally on this head** (closure directive); the root suite runs in CI's Quality Gate on the exact head (reported in the PR) |
| Lint | `npm run lint`: 0 errors, **125 warnings**, the same count as `main` `88ed87c` (none in a changed file) |
| Typecheck | `npx tsc -b` clean |
| Build + bundle guard (`bbdb8dc`) | passed: 57 declarations / 55 recoverable chunks, `NEVER_REMAP` 12, header parser 352 / 352 chunks (1,103 edges) |
| Initial JS / CSS (gzip 9) | **113,201 B** (`main` `88ed87c` 113,167 B, +34 B) / 36,591 B |
| Whitespace | `git diff --check` clean |
| Exact-head CI | reported in the PR for the final head |

### 15.6 Remaining findings after the second round

| Id | Sev | Finding | Rationale |
|---|---|---|---|
| 85 | P2, **owner decision** | An unrenderable question is submitted as unanswered | Unchanged: it needs a submission / grading contract change (§10). |
| 14 | P2 | The exam-level card hides the chrome | Unchanged (§12.7). |
| RR2-2 remainder | P2 | Two loads that start together share a stylesheet that fails: the one that did not request it renders without it (§14.6). When such a stylesheet comes back after a first load stopped waiting for it (3 s), the part restyles in place, which can move the content once more. | Unchanged (§14.6): the runtime cannot know which already-linked stylesheets a loader needs without the build's chunk → stylesheet map. |
| In-view recovery height | P3, narrowed | A press that starts more than 400 ms after an in-view recovery, but was aimed before it, can still land on the moved content. | Within 400 ms the press is now stopped (RR3-IN-4). Later, the change has been on screen long enough to be seen; holding presses longer would lose deliberate ones. |
| RR3-IN-3 | P3, **owner decision** | After a keyboard retry during which the student scrolled the page, the focused line is left where it is (off-screen or under the top bar, 8 / 8). | The owner's first rule outranks WCAG 2.4.11 here. A reveal after the student scrolled is the RR2-3 jump (a click after it recorded a different option, 7 / 8). The reviewer's suggestion, a reveal on the first key press, would make PageDown / End / arrows jump back to the line, which is the `keyaway` path RR2-3 fixed. The next Tab moves focus to the following control, which the page reveals; assistive technology reads the line when it gets focus. The owner may choose otherwise. |
| RR3-IN-2 | P3 / info | A press inside the sandboxed simulation frame is invisible to the page; a recovery can move the frame under it (11 / 44 px). | The page cannot observe input in a separate, sandboxed document. A heuristic (the window losing focus to the frame) sees neither the start nor the end of the press, and it would hold every recovery while a keyboard student works in the frame. Pre-existing with in-place recovery. |
| RR3-6 | info, pre-existing | A retry whose original import stalls keeps «جارٍ إعادة المحاولة…» | The browser's own import; the student can move on (comment corrected). |
| RR3-IN-5 | info | A press longer than 60 s sees the swap; a window blur ends a press | The 60 s cap is the safety net for a lost release; a blur's release is never delivered. |
| RR2-6 | P3 info | A slow but working network can need a second press | Fails safe; the bound is the RR-3 fix. |
| Pointer RR-PTR-2, RR-PTR-4, RR-PTR-5; accessibility RR-7; 30, 31, 43 / 49, 44 | P3 / info | as §13.6 | Unchanged. |
| Input info | info, pre-existing | A 4 px hand movement during a press in a code field turns it into a text selection (§14.6). | Not introduced; no scroll is involved. |

Also not measured: Safari / WebKit, Firefox, real screen-reader speech (including whether a click synthesized by assistive
technology has `detail` 0, which decides whether its retry counts as keyboard), a native touch drag on a real device, forced
colours, and presses longer than 60 s.

### 15.7 Closure and handoff

The owner's closure directive ended development on this PR after the late-first-load fix: no further review round, agent
campaign or broad mutation campaign ran on this head. The owner states that the assessment-integrity fix preserved at `725c676`
(`integration/phase-21e3-assessment-integrity`) must still be integrated before this PR can merge; it is **not** part of this
PR's head, and this branch does not copy it (AGENTS.md §7). Ownership of the PR passes to the QA review session.

Independent review required. Owner merge only.

## 16. Assessment-integrity fix — an unrecoverable question renderer

Owner decision after the final independent review of `593fd47`: a question that fails to render because of an infrastructure or
chunk-loading failure must never silently receive a zero as if the student chose not to answer. On `593fd47` the recovery card
protected the answers, but a question whose card never recovered was listed on the review screen as a plain «غير مُجاب», the submit
confirmation said nothing, the submit body carried nothing, and the server graded the blank as 0 — a final grade published without
anyone knowing the student could not see the question.

### 16.1 Root cause and chosen policy

The client never told the server *why* a question had no answer, and the server had no state between "answered" and "blank". The
fix follows AGENTS.md §10 (fail closed → retryable technical state → teacher review → explicit teacher decision) with the mechanism
the platform already uses for a compile error and a key-less table: the question is **held** (score 0, `manualReview: true`) so the
attempt is `pendingReview` until the teacher decides — never an automatic zero, never a client-chosen score.

The report is **untrusted input that can only move a grade toward the teacher**: it never awards marks, never changes another
question, never raises a score. A forged report at worst routes a blank to the teacher, who sees the reason beside the answer and
decides. The server verifies every entry against the published exam and the stored answers before holding anything.

### 16.2 Contract (additive, backward compatible)

| Where | Field | Rule |
|---|---|---|
| Client → `saveDraft` / `pauseAttempt` / `submit` | `renderFailures: [{ questionId, code }]`, `code ∈ {chunk-load, runtime}` | Sent only while something is reported, or once more empty to clear a record the server holds; an exam without any failure sends the historical body byte-for-byte. |
| Submission document | `draftRenderFailures` | The normalized report saved with the draft (cleared by an empty report, consumed by every finalization). |
| Completed attempt | `renderFailures: { [questionId]: { code, held, reportedAt } }` | The verified record. `held` is decided by the server. |
| Question grade | `technicalFailure: { code, reason: "renderFailure" }` + `manualReview: true`, `score: 0` | Only when held. Stays on record after the teacher's override. |
| Student `pub()` / gradebook rows / review `attempt` | `technicalHolds: n` | Count only (omitted when 0); never a code, URL or message. |
| Teacher review question | `renderFailure: { code, held, reportedAt }` | Beside `autoGrade`; the UI explains the reason and the resolution path. |

`api/src/lib/render-failures.js` owns the rules: `normalizeRenderFailures` (questions of the published exam only, registered codes,
one per question, bounded, prototype keys refused) and `applyRenderFailureHolds` (held = no admitted answer AND marks > 0 AND, in a
`firstNAnswered` section, the quota is not already met; a firstN section without an explicit maximum grows by the held marks, as
`gradeExam` itself derives it; totals through the ONE canonical `rebuildAttemptGrades`). Grading call sites: `submit` (the submit's
own report wins; absent ⇒ the draft record), `finalizeTimedOutAttempt`, `finalizeIntegrityExit`, the teacher's `endActiveAttempt`.

Client: `src/student/exam/renderFailures.ts` (the pure record: live / sticky entries per question, `shown` clears a previous visit's
sticky entries only — ordering-safe against a child card that fails in the same commit), `QuestionErrorBoundary` reports a material
card's failure / recovery / unmount and a page card's clean mount; `StudentExamPage` keeps the record beside the answers, syncs the
server record with one ordinary `saveDraft` of the same revision when the set changes, shows «تعذّر عرضه» in the navigator and the
review screen (counted apart from «غير مُجاب»), appends the explicit Arabic warning to the submit confirmation, and explains the hold
on the result screen. `AssignmentReview` shows the reason and the resolution path; the gradebook row carries a badge.

### 16.3 Fail-first (executed against `593fd47`)

| Test file | On `593fd47` | On the head |
|---|---|---|
| `api/tests/render-failure-hold-21e3.test.js` | 10 failed (held question graded 0 / final; no record; drafts carry nothing), 1 pin passed (legacy body unchanged) | 11 passed |
| `src/student/exam/reviewUnavailable.21e3.test.tsx` | 3 failed (`pageStatus` → `unanswered`; review counts 2 blanks; navigator label missing) | 3 passed |
| `src/student/exam/renderFailures.21e3.test.tsx` | module missing (file failed to resolve) | 7 passed |
| `src/StudentExamPage.renderFailure.21e3.test.tsx` | 2 failed (no report in the bodies, counted as a blank), 1 pin passed (historical body) — executed on a detached worktree of `593fd47` | 3 passed |
| `src/AssignmentReview.technicalHold.21e3.test.tsx` | 2 failed (no notice, no counter), 1 pin passed (ordinary attempt) — same worktree | 3 passed |

Security cases covered by the API test: a report on an answered question changes nothing; unknown ids / codes / shapes / prototype
keys / non-arrays are dropped and never stored; a report never raises a score; duplicates and oversize collapse; the draft record is
cleared by an empty report and consumed by timeout / strict exit / teacher end; a submit's own report overrides the draft record;
first-N quota met ⇒ no hold, not met ⇒ held and awardable; a teacher override resolves the hold to a final grade.

### 16.4 Validation, security and Chromium

Related API suites (submission, timer, attempt policy, results, review, grading status, canonical rebuild parity, archive lifecycle,
composite review, coding guards 17A/17B/17C, compile review): 208 passed; the whole `api/tests` directory: 277 files / 4,295 passed.
Client suites around the change (StudentExamPage, student/exam, assignments, AssignmentReview, StudentPortal, question types, rich
content, recoverableLazy, grading status): 107 files / 1,301 passed. `npx tsc -b` clean; lint 0 errors / 125 warnings (the same
count as before); `npm run build` + bundle guard passed (initial JS 110.5 KB gzip, chunk recovery 57 / 55, NEVER_REMAP 12 present);
`git diff --check` clean. `src/recoverableLazy.ts` and the 17A / 17B guards are untouched (the C32 exception stays exactly as
ratified).

Chromium 141 (production build of this head, mock API, Arabic, desktop / 200 % / phone-touch): **46 / 46**, 0 page errors —
student: RTL, draft sync carries the report with the answers untouched, navigator «السؤال 2 — تعذّر عرضه» (6.01:1 contrast, keyboard
focus ring), review «مُجاب 2 · غير مُجاب 1 · تعذّر عرضه 1» with the note, no overflow, the submit dialog with the warning, the submit
body `renderFailures: [{h1, chunk-load}]`, the result screen's explanation; recovery after a retry: record `[1] → [0]`, no marker, no
warning, no field, final; teacher: gradebook badge, review notice (reason, no auto-zero, mark here or a retry, `role="note"`,
6.01:1), counter, pending status, and the mark saved through the existing `saveReview` override.

### 16.5 Remaining risks

- The report is a client claim; the server verifies what it can (exam membership, no stored answer, quota) and routes the rest to the
  teacher. A student who deliberately leaves a question blank and forges a report gains nothing but a teacher's look at that blank.
- A material card that fails and then the student navigates away stays «تعذّر عرضه» until the question is shown again; the draft
  sync carries that state, so a time-out or strict exit holds it. Showing the question again clean clears it.
- Stem / block failures count as material (the student may have lost a chart or formula); an answered question is never held, so a
  degraded-but-answerable question still grades normally and the teacher only sees the information.

### 16.6 Integration onto Review Fix 3

The fix was developed on `593fd47` (+ a reconciliation merge of `main@8a1dd87`, `ae0ff18`) as `7f6f318`, integrated onto the Review
Fix 3 head `df60dc2` as `725c676` (one import-block conflict in `QuestionErrorBoundary.tsx`, resolved as the union), and finally
merged onto the closed Review Fix 3 head `f08912a` with the same single conflict and the same resolution: the pointer-hold imports of
Review Fix 3 (`pointerIsDown`, `guardPresses`, `SHIFT_GUARD_MS`) and the failure-reporting imports both kept; every other hunk merged
automatically. Review Fix 3's recovery protections (pointer hold, press guard, quiet landing line, keyboard-only reveal) and the
failure reporting coexist in the same lifecycle methods: `componentDidMount` / `componentWillUnmount` / the `resetKey` branch only gained
the `reportShown` / `reportEnd` calls. `src/recoverableLazy.ts` carries only Review Fix 3's own changes; the 17A / 17B guards are untouched.

### 16.7 Review Fix 4 — P1 and P2 of the independent review of `0546504`

| Finding | Fix | Fail-first |
|---|---|---|
| **P1** the failure-sync marked the report synced before the save; offline / exhausted saves were never retried and the finalize actions carried nothing, so a time-out, strict exit or teacher end after an offline chunk failure graded a plain blank | `StudentExamPage.tsx`: `failureSyncRef` is set only by a CONFIRMED save (`saveDraftSnapshot` success, the key captured at request time); `recoverAndSave` (reconnect / manual retry) also saves when the confirmed report differs from the current one; `finalizeTimedOutAttempt` / `finalizeIntegrityExit` bodies carry `...failureField()` (never answers). `student-submission.js`: both finalize branches take the request's report when present (verified exactly like a submit's — toward the teacher only), else the draft record | `StudentExamPage.renderFailure.21e3.test.tsx` «Review Fix 4 (P1)» failed on the unfixed page (no saveDraft with the report after reconnect); `render-failure-hold-21e3.test.js` «P1» failed on `0546504` (timeout graded q2 as a plain 0) |
| **P2** every reported unanswered question in a first-N section was held while `counted < requiredAnswers`, and a derived (no explicit max) section maximum grew by each held question | `render-failures.js` `quotaOpen` consumes the open slots: at most `requiredAnswers − counted` reported questions are held, in exam order; the derived maximum grows only by those | `render-failure-hold-21e3.test.js` «P2» failed on `0546504` (q3 held, totalMarks 6) |

Also updated: the `ux7b1` source pin of the timeout body (`{action:"finalizeTimedOutAttempt",...failureField()}`, plus an assertion that the
body never carries answers). Focused validation: affected API suites + guards 17A/17B/17C and the StudentExamPage / student-exam suites
(390 passed after the pin update); lint 0 errors / 125 warnings; `tsc` clean; build + bundle guard passed (110.5 KB gzip); Chromium
integrity harness (desktop) 16 / 16. The P3 findings of the review are left open by the owner's closure directive.

## 17. QA-1 follow-up — a render-failure hold on a hidden-test coding question

Found by the post-merge QA of `main` `c244cbab`. Section 16's hold already held an unanswered coding question. Official coding
grading then overwrote that hold.

- **The defect.** `planCodingGrading` builds one target per counted hidden-test coding question. For a target with no answer it
  applied the automatic "no answer" result: `applyGrade(grade, 0, false)`, which sets `manualReview: false`. It did this after
  `applyRenderFailureHolds` had held the same question.
  - The hold became a final academic 0, and the attempt was published as `gradingStatus: "final"`.
  - Affected paths: submit, the timed-out finalize, the teacher's `endActiveAttempt`, a composite@1 coding part, and a teacher force
    regrade.
  - This violates AGENTS.md §10: no zero because of an infrastructure failure.
- **The fix.** In `api/src/lib/coding/official-grading.js`, `buildTarget` checks the attempt's server-verified hold record
  (`attempt.renderFailures[questionId].held === true`; for a composite child, its composite's record).
  - When the question is held, the target still completes with the factual `no-answer` evidence, because there is nothing to run.
  - The grade then stays with the teacher (`holdForReview`: score 0, `manualReview: true`), so the attempt stays `pendingReview`.
  - Unchanged: an unheld blank is still the automatic 0. A report with `held: false` changes nothing. An answered question is
    dispatched as before.
- **Evidence.** `api/tests/render-failure-hold-coding-qa1.test.js`, 8 tests, run on the real handlers over the in-memory store:
  - **Fail-first:** run against `c244cbab`, the 5 hold tests fail on `manualReview` (received `false`) and the 2 controls pass.
  - **Pin:** the 8th test (a stored `held: false` report regrades to the automatic 0) passes on the baseline too.
  - **Mutation:** 5 mutants of the new guard (never held, always held, composite key not mapped, `held: false` treated as held,
    the held branch finalizing), all KILLED. The file was restored byte-for-byte (sha256).
