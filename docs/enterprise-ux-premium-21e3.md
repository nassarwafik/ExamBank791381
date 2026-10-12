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
| `coding@1` / `coding@2` share one chunk; `RichPrompt` has six lazy wrappers **and** a static importer (always evaluated before the exam renders); `CodeStimulusView` / `ScenarioView` have lazy and static importers | one module-level state per chunk URL; never retry a module of the static student closure (`RichPrompt`, `RichContentRenderer`, `StudentQuestionCard`, `studentAttemptContext`, `trustedSimPlugins`, `smartSimUiRegistry`, `index`, `react`, runtime) — they cannot fail inside the exam |
| Module-scope side effects with **medium / high** duplication impact: `trustedSimPlugins` (nine registrations), `studentAttemptContext` (two contexts), `monacoEngine` (`globalThis.MonacoEnvironment`), `echartsEngine` / `echartsAdvanced` (extension installs) | all are in the static closure or behind a module's own `import()`; never a remap target (deny-list + build guard) |
| `CompoundQuestion` renders registered part renderers outside `StudentQuestionCard`; `SectionShellHeader` (presentation mode) renders outside the planned page section; `AssessmentActivityHost` is a plain lazy | boundary at every renderer host, page boundary encloses the section shell, every exam-path lazy uses the recoverable loader |
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
  - On success every remapped module is recorded as recovered and reused by every later graph.
  - The entry URL is accepted only from a `TypeError` whose message names a same-origin `<BASE>assets/<chunkName>-<8 base36>.js`.
  - Remap and source-read URLs are validated the same way, and the deny-list is never remapped.
  - CSS failures re-link a validated `?r=` stylesheet.
  - No global error hooks, no reload, no `lazyWithRetry` inside the exam.
- `src/student/exam/QuestionErrorBoundary.tsx` around every renderer host: the `StudentQuestionCard` body, the
  `CompoundQuestion` parts and the composite parts. The page boundary in `StudentExamPage` covers the current page,
  including the section shell, scenario and section context. An outer exam-surface boundary keeps `StudentExamPage`
  mounted.
- Fallback: «تعذّر عرض هذا السؤال الآن», with reassurance that other answers are kept, and «إعادة المحاولة».
- After a failed retry in a running exam, the fallback suggests continuing with other questions. It shows
  «إعادة تحميل الصفحة» **only** when every answer is server-confirmed and the attempt is not strict.
- A build guard asserts that every declared chunk name exists, exports `default`, and that the header parser matches
  every chunk.

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
- `scroll-padding` for the sticky bars.
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
| A — recovery runtime | `src/recoverableLazy.ts` (new) | Model v3 of §3.2. Exports `recoverableLazy(name, factory)`, which recovers in place with a remap, and `retryableLazy(name, factory)`, for shared chunks without a `default` export, which only re-runs its factory. Also exports `rearmFailedLoads()`, `trustedAssetUrl`, `parseStaticImports`, `remapSet` and `NEVER_REMAP`. The only computed `import()` in `src/` is the `importUrl` of the browser environment, and it is reached only with validated URLs (§9). |
| A — boundaries | `src/student/exam/QuestionErrorBoundary.tsx`, `src/student/exam/questionRecovery.ts` (new) | Variants: question, part, page, section and exam. A stem boundary falls back to the plain question text. Retry re-arms the failed loaders and moves focus to the page heading; if the retry fails again, focus returns to «إعادة المحاولة». «إعادة تحميل الصفحة» appears only after a failed retry, when every answer is server-confirmed and the policy is not strict. The log carries only `{ code }`. |
| A — hosts | `StudentExamPage.tsx`, `StudentQuestionCard.tsx`, `CompoundQuestion.tsx`, `questionTypes/student/CompositeResponse.tsx` | Boundaries cover the exam surface (keeping the page mounted), the page (section shell, scenario, section context), the question stem, the code stimulus, the answer area, compound parts and composite parts. |
| A — loaders | `questionTypes/studentRegistry.tsx`, `trustedSim/smartSimUiRegistry.ts`, `richContent/RichContentRenderer.tsx`, `AssessmentActivityContext.tsx`, `StructuredExamSection.tsx`, `StudentQuestionCard.tsx` | `lazy(() => import("literal"))` becomes `recoverableLazy("ChunkName", () => import("literal"))`. Every import stays a literal repository path, and plugin identities and version families are unchanged. `coding@1` and `coding@2` share one `CodingResponse` loader, as they already shared one chunk. Only the SmartSim UI registry's loaders changed; no engine file did (D2). |
| A — copy | `charts/DataChart.tsx` | The chart's fallback no longer tells the student to reload the page (D5). |
| B — focus | `StudentExamPage.tsx`, `studentexam-pro.css` | On a screen change (never from «loading»), the exam screen focuses the page heading without scrolling the page (`preventScroll`, then `scrollIntoView({block:"nearest"})`). The result and strict-end screens focus the `h1` (`tabIndex=-1`, `.iex-result-title`) and scroll to the top. Typing, autosave and timer ticks never move focus. Visible focus ring, no `outline:none`. |
| C — timer | `student/exam/examAnnouncements.ts` (new), `StudentExamPage.tsx` | `timerAnnouncement(remainingMs, announced)` covers 5 min and 1 min; a jump past both thresholds announces only the lower one. Thresholds are remembered per attempt in `sessionStorage` (`timerNoticeKey`), so re-renders, resyncs, resumes and reloads never repeat them. One polite announcer (`role=status`, `aria-live=polite`, `aria-atomic`) is updated imperatively, with no React state. |
| D — save | `examAnnouncements.ts` (`saveAnnouncement`), `student/exam/SaveStatus.tsx` | The visible label is no longer a live region. The announcer speaks only for offline, failure after retries, and recovery to «تم الحفظ» after a problem. |
| E — touch | `studentexam-pro.css`, `visual/visual.css`, `inlineCloze/inlineCloze.css`, `notifications/notifications.css`, `studentportal-pro.css` | `(pointer: coarse)` and phone-width minimums of 44 × 44 px for CLI blanks, cloze controls, label chips and dropdowns, label zone buttons, and the notification header action at every width. |
| F — LTR | `QuestionField.tsx`, `ui/ltrIsland.ts` (new), `notifications/NotificationBell.tsx`, `pwa/InstallAppCard.tsx`, `pwa/InstallAppEntry.tsx`, `pwa/InstallGuidanceViews.tsx`, `physicsLab/LabScene.tsx` | CLI `<pre dir="ltr">` and blanks `dir="ltr"`. The grade «8.5/10» and the brand «Tadris+» are wrapped in `<bdi dir="ltr">` (markup only; no control characters in any string). The Arabic physics bar-chart title uses SVG `direction="rtl"` with `textAnchor="end"`; equations, units and simulation values are untouched (D3). |
| G — clearance | `studentexam-pro.css`, `networkCli/networkCli.css`, `StudentExamPage.tsx` | `:root:has(.iex-bottom-nav)` gets scroll padding of 72 px (top) and 96 px (bottom). A focus-in reveal scrolls a focused control that is partly under a sticky bar, because Chromium does not scroll a partly visible element on focus. The network-CLI screen uses `min(20rem, 55vh)` (`min(15rem, 50vh)` at ≤ 480 px) instead of px heights. |
| H — friction | `visual/HotspotView.tsx`, `visual/LabelDiagramView.tsx`, `visual/visual.css`, `studentexam-pro.css` | A one-line hint plus `<details class="vq-keyboard-guide">` «كيف أستخدم لوحة المفاتيح؟», referenced by `aria-describedby`. Tighter `.iex-section-context`. The details disclosure keeps the PR #300 rule unchanged (D1). |
| Guards | `scripts/check-bundle-budget.mjs` | `checkChunkRecovery`: every `recoverableLazy` name must exist as a built chunk with a `default` export, and none may be on `NEVER_REMAP`. The chunk-header parser (`STATIC_IMPORT_HEADER_SOURCE`, shared with the runtime) must match a full-text scan on every chunk. |
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
| Equivalent literal lazy (CM18, M17 and the per-type pins) | `recoverableLazy("Name", () => import("literal"))` is accepted where `lazy(() => import("literal"))` was required. The literal path is the same, and the guards now also require the declared chunk name to match it. The build guard checks that every declared name is a real chunk with a `default` export. |

## 10. Limitations, risks and deferrals

| Item | Status |
|---|---|
| Safari / WebKit | The rejection carries no URL, so there is no remap. A retry re-runs the original factory, which recovers a browser that does not cache failures. Otherwise the card stays, with the safe options only. Not measured here: no WebKit in this environment. |
| Firefox | The message wording is recognised (`error loading dynamically imported module: <url>`), but the harness ran in Chromium only. Late import-map merging is newer in Firefox, and an older engine falls back to the safe card. |
| Older Chromium (no late import-map merge) | The remapped attempt fails closed, giving the same safe card with no reload. |
| A stalled (never-settling) chunk load | It is never retried, because a retry would race a load that may still evaluate. The Suspense loading state remains. |
| Modules of the static student closure (`NEVER_REMAP`) | They cannot fail inside a running exam because they load before it. If one did, the graph is refused (`recovery-refused`) and the safe card stays. |
| Network still down | Measured by the `stilldown` scenario. While loads keep failing, the card stays and offers only the safe options. A strict attempt never gets a reload action (`strict` scenario and P01). There are no automatic retries; the student retries when ready. |
| `codingRunClient` capabilities | A capabilities answer of "unavailable" stays cached for the exam-page session. This is Phase 17B behaviour; a failed request is not cached. Recovering the coding renderer chunk does not refresh the cached answer. Unchanged in this phase. |
| Chemistry periodic-table cells (44 px) | Deferred to Phase 21E.5 (D2). No chemistry or SmartSim engine file was changed. |
| Physics equations and units | Only the student-scene title direction changed. Equations, units and simulation values are untouched (D3); a wider review of physics bidi is left to a later phase. |

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

Independent review required. Owner merge only.
