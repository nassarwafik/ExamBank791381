# Phase 21E.3 — Enterprise student exam experience and accessibility

Design record for Phase 21E.3 (Tadris+ — التعليم المتكامل): the student exam-taking experience. It builds on the 21E.0 audit
and roadmap in `docs/enterprise-ux-premium-21e.md` (§3.3 S-1…S-8, §4 the 21E.3 row, §7.2 S-ST-NEW-1…3) and follows the
repository contract in `AGENTS.md`. Independent review required. Owner merge only.

> **Status: audit and design (pre-implementation).** The phase's prerequisite, Phase 21E.1 slice 2 (PR #300, which owns the
> exam-details default in `StudentExamPage.tsx` and a rule in `studentexam-pro.css`), was still open when this record was
> written. No production file is changed until PR #300 has landed on `main`; the implementation sections (§5 onward) are
> added with the implementation commits.

---

## 1. Baseline and prerequisite

| Item | Value |
|---|---|
| `origin/main` at assignment and at the time of this record | `b8a65f16a2877a99a4adf4f24c74cb7687f7ae41` (merge of PR #299) |
| PR #300 (21E.1 slice 2) | open, head `dd795f3ea33d5dccb02b6e3631fc051c65d3dded`, not merged |
| Root suite on `b8a65f1`, before any change | `npm test`: **920 files, 11,991 tests passed, 0 failed** |
| Production build on `b8a65f1` | bundle guard passed; initial JS **8 files, 110.1 KB gzip** (budget 125 KB); initial CSS 34.9 KB gzip |
| Chromium | 141.0.7390.37 (headless, `/opt/pw-browsers/chromium-1194`), Playwright 1.56.1 |

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

## 4. Risk analysis

| Risk | Where | Mitigation in this phase |
|---|---|---|
| A recovery path that reloads the page ends a strict attempt or drops an edit | per-question recovery | never auto-reload inside the exam; a manual reload is offered only when every answer is server-confirmed **and** the policy is not strict |
| A retry that re-imports a module creates a second instance of it | cache-busted import | only a chunk whose load **failed** (never evaluated) is re-requested; one retry URL per chunk shared by all wrappers; its static imports resolve to the already-loaded shared chunks (same module records) — measured in §3.2 |
| A failed shared dependency can never load again in this page | browser module map | bounded retries; the card then offers only safe options (continue with other questions; a manual reload only when every answer is server-confirmed and the attempt is not strict) |
| An error card leaks internals or the answer key | fallback UI and logs | fixed Arabic copy only; the production log carries the fixed code + an allow-listed error name (the `ErrorBoundary` rule) |
| Recovery schedules a save / submit, or loses an answer | page state | answers live in the page, outside the boundary; a failure or a retry never touches them (request counts are measured) |
| Focus moves while typing / on autosave / on a timer tick | focus contract | focus is requested only by explicit transitions (a counter, like the existing navigation contract) |
| Timer announced repeatedly (rerender, resync, resume, reload) | announcer | once per attempt identity and threshold, remembered per tab; pure, unit-tested |
| «تم الحفظ» announced before the server confirmed it | save announcer | announcements are derived from `deriveSaveState` (server-confirmed revision) only |
| Bigger touch targets break the exam layout | CSS | scoped to coarse pointers / phone widths and to the listed student controls; measured with real bounding boxes and screenshots |
| Bidi controls leak into saved answers | LTR islands | semantic `dir="ltr"` / `<bdi>` in markup only; no control characters in any string |
| Initial JS grows | bundle | all new code in the lazy student / question chunks; bundle guard and the ≤ +1 KB target checked on the head |
| Overlap with other windows | files | Window 2 (21E.2) owns teacher files; chemistry / SmartSim engines untouched; shared renderers only for the listed student-side fixes |

## 5. Design (to be implemented after PR #300 lands)

**A — per-question fault isolation.** `src/recoverableLazy.ts`: a lazy component whose loader can be re-armed after a
failure; for a chunk-load failure the fresh loader re-imports the same chunk URL with a retry query (`?r=<n>`), taken from
the browser's own error and accepted only when it is same-origin, under `/assets/` and a `.js` file; any other failure
re-runs the original factory. Used by both registries and the card's own lazy pieces (chunk names unchanged).
`src/student/exam/QuestionErrorBoundary.tsx` around the question body in `StudentQuestionCard` (flat, structured, compound,
composite; student and teacher preview) and around the current page in `StudentExamPage` (scenario / section-context
lazies). Fallback: «تعذّر عرض هذا السؤال الآن», reassurance that other answers are kept, «إعادة المحاولة»; after a failed
retry in a running exam, continue with other questions and — only when all answers are saved and the attempt is not strict
— «إعادة تحميل الصفحة».

**B — focus.** A focus-request counter joins the existing navigation focus contract: start / resume / next attempt / cover
start → the question heading; submit / timeout / strict end → the result heading (`tabIndex=-1`). Visible focus styling on
the programmatic targets.

**C — timer.** A pure threshold module (5 min, 1 min; once per attempt identity; a jump past both announces only the lower;
remembered per tab) and one polite page announcer. Time computation, expiry and submission untouched.

**D — save status.** The visible label is unchanged but no longer live; the announcer says only: offline, save failed
(retries exhausted), and recovery to saved after a problem state.

**E / F / G.** Coarse-pointer 44 px minimums on the listed controls; `dir="ltr"` / `<bdi>` islands; `scroll-padding` for
the sticky bars; rem / `min()` instead of px max-heights on the answer surfaces.

**H.** Short visual-question hint + an expandable «كيف أستخدم لوحة المفاتيح؟»; tighter section context; the PR #300 details
rule preserved (open when instructions exist, collapsed otherwise).

## 6. Acceptance tests (planned)

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
