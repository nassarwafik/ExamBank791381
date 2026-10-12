# Phase 21E — Enterprise UX Premium: audit, architecture, roadmap and foundation (21E.0)

Product: Tadris+ — التعليم المتكامل. Repository contract: `AGENTS.md`. Baseline for this record: `origin/main` = `51517c3`
(PR #296 merged and deployed). Stage 21E.0 = this document, the measured baselines, the roadmap and **one** low-risk
foundation fix (focus-ring tokens, §7). Nothing else in the product changes in 21E.0.

Out of scope for every 21E stage: the Chemistry D.3 work (PR #297, branch `feature/phase-21d-d3-chemistry-lab`), grading
semantics, exam schemas, question version families, APIs, storage, security boundaries, and the approved Tadris+ artwork.

---

## 1. Method and evidence

- Static audit of `src/**` (438 non-test `.tsx` files, 76 CSS files, 55 115 lines of TSX) with `file:line` evidence
  gathered by four independent read-only sweeps (design system and shell · teacher surfaces · student surfaces and
  SmartSim presentation · accessibility, RTL, motion, contrast and certification infrastructure).
- Measured baselines on the head (§2): production build and bundle guard, source CSS totals, the three UI Chromium
  certifications with screenshots, and a render-performance probe of the production build in headless Chromium
  (`scripts/measure-render-baseline-21e.mjs`, new tooling, read-only).
- Every finding below carries a severity (**S1** defect that blocks or misleads a user or breaks accessibility ·
  **S2** inconsistency with visible user impact · **S3** polish) and a regression-risk class for the fix (**H/M/L**).

## 2. Measured baselines (head `51517c3`)

| Measure | Value | Source |
|---|---|---|
| Initial JS graph | **9 files, 109.9 KB gzip** (budget 125 KB) | `npm run build` → `scripts/check-bundle-budget.mjs` |
| Initial CSS | **1 file, 34.9 KB gzip**; lazy presentation / rich-content CSS 5.8 KB | same |
| Source CSS | 76 files, **670 KB** uncompressed; `App.css` 3 301 lines, `platform.css` 1 115 | `wc` |
| Login route, desktop 1280×900 (median of 3) | first contentful paint **172–180 ms** (two runs), DOMContentLoaded 73–79 ms, 19 requests, 135 DOM nodes | `scripts/measure-render-baseline-21e.mjs` |
| Login route, phone 390×844 with 4× CPU throttle | first contentful paint **440–444 ms**, DOMContentLoaded 221–236 ms | same |
| Chromium certifications (UI) | builder overlay **49/49**, grading workspace **40/40**, brand/PWA **27/27**, code editor **41/41** | `scripts/check-*-browser*.mjs` |
| Root test suite | 909 files; one documented timing-sensitive test (`src/GovernancePanel.14b.test.tsx`) and one load-sensitive 3D suite (`src/functionSurfaces/surfacePlotUi.21da4.test.tsx`) observed flaky under full-suite load in the session container | `npm test` |

## 3. Audit findings

### 3.1 Design system and shell (S1–S3)

| # | Finding | Evidence | Sev | Risk |
|---|---|---|---|---|
| DS-1 | **`--eb-focus` (a box-shadow value) used as a colour** in 16 declarations, and `--eb-focus-ring` nested inside another outline once. Because the token *is* defined, the declaration becomes invalid at computed-value time and the property falls to its initial value: **no keyboard focus ring** on the coding editor, coding template, inline cloze, network-CLI terminal, visual (hotspot / label) controls, AI composer, presentation studio; the visual question's **selected-shape stroke, draft outline, cursor ring and resize-handle background are not painted at all**. | `src/coding/coding.css:11,63,148,171`, `coding/codingTemplate.css:12,22`, `inlineCloze/inlineCloze.css:12`, `networkCli/networkCli.css:8`, `visual/visual.css:9,12,15,19,22,24,27`, `aiComposer/ai-composer.css:7`, `presentation/presentation-studio.css:9`; proven in Chromium (§7) | **S1** | L — **fixed in 21E.0** |
| DS-2 | Two button systems with equal weight: `eb-button` (270 uses, 73 files) and `sb-btn` (178 uses, 30 files) plus `sb-icon-btn`/`sb-mini-btn` (186) and ~30 feature one-offs; `App.css` restyles the bare `button` element globally six times. | `ui/ui.css:109-123`, `structured-builder.css`, `App.css:43,50,2216,2462,2692,2818` | S2 | M |
| DS-3 | **No toast / transient-notice primitive**; `--eb-z-toast` is defined and never used. Success feedback is inline (`platform-error` ×59, `sb-banner*` ×38, `platform-notice` ×12, `role="alert"` ×132). | `design-tokens.css:97`, grep | S2 | L (additive) |
| DS-4 | **No table primitive**: 46 files render `<table>` with ~30 class names; captions / `scope` / `aria-sort` coverage differs per table (Gradebook: no caption, 2 `aria-sort`; Dashboard tables: no `scope`). | `assignments/Gradebook.tsx:74`, `TeacherDashboard.tsx:538,545,592`, `bank/ExamBankPage.tsx:255`, `BankQuestionPicker.tsx:148` | S2 | M |
| DS-5 | Nine loading-state implementations and two spellings of the loading copy («جارٍ تحميل…» ×154 vs «جارٍ التحميل» ×14); `eb-skeleton` is dead CSS. | `platform.css:193,650,964`, `studentexam-pro.css:14`, `visual/visual.css:38`, `App.css:28-29,1693` | S2 | L |
| DS-6 | 33 bespoke `*-empty` states beside the shared `EmptyState` (22 importers). | `TeacherDashboard.tsx:118-187`, `learning/*` | S3 | L |
| DS-7 | Token drift in legacy sheets: 2 297 hex colours, 471 px font sizes, 97 `!important`; `App.css` and `platform.css` use **zero** spacing tokens (136 and 213 raw px declarations) and are not covered by the token guard. | `api/tests/ux2-shell-foundation.test.js:77-192` lists only the `*-pro` sheets | S2 | M (guard first, migrate per stage) |
| DS-8 | Undefined tokens referenced: `--eb-fs-15`, `--eb-fs-18`, `--eb-fs-sm`, `--eb-text-muted`, `--eb-warning`, `--eb-r-md`, `--eb-primary-soft`, `--eb-measure`, `--eb-ink-soft`; `--eb-font-mono` used 27× (10 without fallback) and never defined; ~8 different monospace stacks. | `projects/performance.css:42`, `learning/activities/activities.css:263`, `studentexam-pro.css`, grep | S2 | L |
| DS-9 | 32 distinct breakpoint values (documented set: 640/768/1024/1280); teacher shell switches at 1024/1280, student shell at 720/767. | `shell.css:129,143`, `platform.css:355,385` | S3 | M |
| DS-10 | Font-size tokens are px (`--eb-fs-12: 12px` …), so the user's browser default font size is ignored (zoom still works); no `html { font-size }` base; 65 declarations at 9–11 px. | `design-tokens.css:75-77` | S2 | M |
| DS-11 | Internal phase label leaks to teachers: eyebrow «Manual Review · Phase 2.0D» in the grading workspace. | `src/AssignmentReview.tsx:194` | S3 | L |
| DS-12 | `src/ui` primitives without tests: `SectionHeader`, `StatCard`, `StatusBadge`, `EmptyState`, `useFocusTrap`, `useBodyScrollLock`. | `src/ui/*` | S3 | L |

### 3.2 Teacher workspace and exam builder

| # | Finding | Evidence | Sev | Risk |
|---|---|---|---|---|
| T-1 | `App.tsx` is **7 911 lines** and still hosts the legacy flat builder (≈ lines 5884–7860), eagerly in the main chunk; the structured builder is lazy. | `App.tsx:50,5884-7860` | S2 | H (split only behind tests) |
| T-2 | Builder toolbar: 15–17 flat actions with emoji glyphs, two button classes (`sb-btn` toolbar, `eb-button` footer), no grouping / overflow; the builder overlay has **no `role="dialog"`, no focus trap, no Escape**. | `StructuredExamBuilder.tsx:514-552`, `App.tsx:7876` | S2 | M |
| T-3 | **12 native dialogs** remain (`window.confirm` ×11, `window.prompt` ×1) while `useConfirm` exists (17 files): inside one builder, `ExamSectionEditor` / `ExamCoverEditor` / `QuestionMediaEditor` use `window.confirm` and the parent uses `useConfirm`. Deleting a single question or section asks nothing; bulk delete asks. | `App.tsx:3432,4147,4396,4451,5170,5304,6817`, `ExamSectionEditor.tsx:95`, `ExamCoverEditor.tsx:47,55`, `QuestionMediaEditor.tsx:86,112`, `StructuredExamBuilder.tsx:355,598,602` | S2 | L–M |
| T-4 | Save-label drift: «حفظ مسودة», «حفظ الامتحان», «حفظ التغييرات», «حفظ التعديلات», «حفظ», «حفظ واعتماد التصحيح», «حفظ التمديد» (duplicated in 5 files). | `StructuredExamBuilder.tsx:545`, `App.tsx:7783`, `PresentationStudio.tsx:360`, `bank/ExamBankPage.tsx:400`, `AssignmentList.tsx:97` | S3 | L |
| T-5 | 29 production question types; **no common field frame** for editors (label / help / error): `<label>` counts range 0–30 per editor, seven different issue containers (`vq-issues`, `cmp-editor-issues`, `cloze-issues`, `ncli-ok`, `or-field-error`, `sb-media-error`, builder list); only `RubricEditor` has `aria-invalid` + `aria-describedby`. | `questionTypes/registryTypes.ts:9`, `openResponse/RubricEditor.tsx:17-22` | S2 | M |
| T-6 | Builder error banners have no live region; issues are one global list, not next to the question. | `StructuredExamBuilder.tsx:555-571` | S2 | L |
| T-7 | Three CSV implementations; **gradebook and assignment results have no export**. | `reports/csv.ts:24`, `TeacherDashboard.tsx:406-441`, `TeacherPlatform.tsx:617-626` | S2 | L |
| T-8 | Dashboard charts have `role="img"` with no data-table fallback; `ChartCard` (which has one) is used only by reports and projects. | `TeacherDashboard.tsx:120-156`, `ui/ChartCard.tsx:48-59` | S2 | L |
| T-9 | Reorder buttons «أعلى»/«أسفل» carry no question / section context in their accessible names. | `ExamSectionEditor.tsx:81-82`, `StructuredQuestionEditor.tsx:68-69` | S3 | L |
| T-10 | All `*-pro.css` sheets load globally for every user (teacher and student). | `App.tsx:70-81` | S3 | M |

### 3.3 Student experience, exam delivery, notifications, PWA

| # | Finding | Evidence | Sev | Risk |
|---|---|---|---|---|
| S-1 | **No per-question error boundary** in the exam: the student and SmartSim registries use plain `React.lazy`; a renderer chunk that fails mid-exam reaches the root boundary and replaces the page with «تم تحديث الموقع». Teacher review already uses `lazyWithRetry`. | `questionTypes/studentRegistry.tsx:7`, `trustedSim/smartSimUiRegistry.ts:1`, `StudentQuestionCard.tsx:100`, `main.tsx:22`, `ErrorBoundary.tsx:58` | **S1** | M |
| S-2 | Timer threshold crossings (5 min / 1 min) are colour-only; `role="timer"` is never announced by design. | `ExamTopBar.tsx:11-25`, `examTimer.ts:22-27` | S2 | L |
| S-3 | Save status is a polite live region that announces every edit cycle (pending → saving → saved). | `student/exam/SaveStatus.tsx:19` | S2 | L |
| S-4 | After attempt start and after submit, focus is not moved (scroll only); result `<h1>` is not focusable; four error banners lack `role`. | `StudentExamPage.tsx:381-384,629,666,676,715,723` | S2 | L |
| S-5 | **No skip link on student shells** (teacher shell has one); `question-jump-bar` nav is unlabelled. | `StudentShell.tsx:28`, `StudentMessagesPage.tsx:164`, `StudentGamesPage.tsx:28`, `App.tsx:6847` | S2 | L |
| S-6 | LTR isolation gaps: legacy CLI fill answer (`direction:ltr` without `unicode-bidi`), teacher review `<pre>` of legacy answers with no `dir`, physics SVG units / expressions («(J)», «θ = …°», «R1 = … Ω»), «Tadris+» in the install card without `<bdi>`, the notification grade «8/10». | `QuestionField.tsx:57`, `studentexam-pro.css:141`, `AssignmentReview.tsx:194`, `physicsLab/LabScene.tsx:39,107,217`, `pwa/InstallAppCard.tsx:44-45`, `notificationPresentation.ts:50` | S2 | L |
| S-7 | Touch targets below 44 px on phones: CLI input 32, reactions 32, notification actions 36, chem cells 40, cloze inputs 40, visual chips 40. | `studentexam-pro.css:142`, `studentportal-pro.css:198`, `notifications.css:26,33`, `chem.css:72`, `inlineCloze.css:9-10`, `visual.css:31` | S2 | L |
| S-8 | Fixed px heights that clip at 200 % text scaling: network-CLI 320/240 px, learning CLI 260/220, topology review 280, SmartSim 220; px line-heights in shell / notifications. | `networkCli.css:10,50`, `learning/cli/cli.css:33,57`, `network-topology.css:51`, `smartsim.css:13`, `shell.css:77,111`, `notifications.css:66` | S2 | L |
| S-9 | Grids with px minimums not wrapped in `min(100%, …)` overflow at narrow widths or high zoom. | `mesh-model.css:22,51,74`, `net2.css:29`, `questionTypes.css:10` | S2 | L |
| S-10 | Notification bell / install entry use `student-topbar-link` instead of `IconButton`; the shared top-bar button style lives in the games sheet; dates use `toLocaleString("ar")` (Arabic-Indic digits) while the exam page uses Western digits; «امتحان» vs «واجب» mixed. | `NotificationBell.tsx:108-116`, `games/games.css:19`, `notificationPresentation.ts:18,33,54-58` | S3 | L |
| S-11 | Offline page uses `system-ui`, raw `#2563eb` and px sizes (not the token sheet). | `public/offline.html:11-17` | S3 | L |
| S-12 | Grading workspace on phones stacks 13 summary cards before the first question; attempt tabs wrap awkwardly (screenshot `07-phone.png` of the grading harness). | `src/AssignmentReview.tsx`, `review-workspace.css` | S2 | L |

### 3.4 Accessibility, motion, contrast, RTL

| # | Finding | Evidence | Sev | Risk |
|---|---|---|---|---|
| A-1 | The outline guard scans only top-level `src/*.css`; nine `outline:none` rules in subfolders are unchecked, and `.chem-atom` / `.chem-bond` have no visible replacement. | `api/tests/ux2-shell-foundation.test.js:17`, `chemistryStructure/chem.css:52` | S2 | L (guard) — **chem.css is 21D-D territory: coordinate with the owner** |
| A-2 | Reduced motion: the global safety net is not scoped to the user's explicit «on», and **no CSS reacts to `data-eb-motion="off"`**; a duplicate hook exists. | `App.css:35-37`, `smartsim/dynamic/usePrefersReducedMotion.ts`, `motionPreference.ts:46` | S2 | L |
| A-3 | `#94a3b8` as body-text colour (≈ 2.6:1) in 9 places; `--eb-warn-tx` on `--eb-warn-bg` is borderline (≈ 4.8:1); status colours used as text (≈ 3.2–3.3:1). | `App.css:160,301,458,2932`, `platform.css:655,754,777,814`, `reader.css:236`, `activities.css:180` | S2 | L |
| A-4 | Physical CSS properties remain in `platform.css` (12), `App.css` (8), `networkCli.css`, `codingTemplate.css`. | `platform.css:170,275,499,695,733,741,754,808,1077`, `App.css:497,625,815,1145,1359,1380,1548,2249` | S3 | L |
| A-5 | Authoring drag in the network topology diagram has no keyboard alternative. | `networkTopology/TopologyDiagram.tsx:78` | S2 | M |
| A-6 | No axe, no `@testing-library/user-event`, no browser-side accessibility checks (focus visibility, landmarks, contrast) in any certification script. | `package.json`, `scripts/check-*.mjs` | S2 | L |
| A-7 | The login hero copy still reads «منصة الامتحانات والتدريب الذكي لشبكات الاتصال» under the Tadris+ mark (screenshot `01-login-desktop.png`) — product wording, owner decision. | `src/App.tsx` login hero | S3 | L |

### 3.5 UX acceptance audit on `main` `66b8a9f` — findings F1–F20 (2026-10-11)

A read-only acceptance audit of the merged 21E.0 / PR #298 state (production build, real API handlers on in-memory storage,
seeded synthetic data, Chromium 1194 + axe-core 4.10.3; viewports 390×844, 768×1024, 1280×900, 853×600 @1.5, 640×450 @2)
ranked twenty findings. The owner's audit document is the source; this table keeps every finding, its stage and its status in
the repository so no phase loses one. Statuses are updated by the PR that changes them.

| # | Problem (measured) | Severity | Who it hurts | Stage | Status |
|---|---|---|---|---|---|
| F1 | Structured-builder toolbar is sticky and wraps (17 controls, 12 with emoji, nothing collapses): 700 px = 83 % of a 390×844 phone, 400 px = 89 % at 200 %, 300 px = 33 % of 1280×900; the first question editor starts at y = 985 on a phone | Critical on phones / 200 %; High on desktop | Teachers | **21E.2** | open. Measured again in 21E.1 slice 2: toolbar bottom 716 / 844 px on a phone and 416 / 450 px at 200 %. Since slice 2 the undo toast (bottom of the builder, 10 s, pausable, closable) **overlaps the only strip left below the toolbar** there: at 200 % the 62 px toast (y 372–434) overlaps the toolbar's last row by 44 px and covers «معاينة الامتحان», «حفظ مسودة» and «اعتماد نهائي» while it is shown (10 s, paused while the pointer rests on it); on a 390×844 phone the toast (y 757–844) sits below the 716 px toolbar bottom and covers the only strip left, where a revealed heading lands (y 732). Focus after a deletion is placed just below the toolbar (slice 2 R1), which is the best position the current toolbar allows. Acceptance (from the audit): sticky bar ≤ 64 px at 390×844 before and after scrolling; ≤ 15 % of the viewport at 640×450 @2; ≤ 8 visible actions on one row and ≤ 72 px at 1280×900; every toolbar control ≥ 44×44 px on phones; first question editor within the first phone screen; no emoji in toolbar button names; **and, added by slice 2: the undo toast never overlaps the sticky bar or a focused control at 390×844 and 640×450 @2.** The same toast overlap occurs at 731×514 @1.75 and 320×640 (independent review of PR #300). Review Fix 3 keeps the room for the toast only while a toast is shown, so without a toast the end of the builder is `main`'s again. |
| F2 | Keyboard focus hidden under the student exam's sticky bottom navigation (WCAG 2.4.11): fully hidden stops 6 (phone), 4 (desktop), 2 (150 %), 3 (200 %) of 109 | High | Keyboard and switch users | 21E.3 | open (tested fix: `scroll-padding-block` from the bar heights) |
| F3 | Student exam details panel cannot collapse; screen readers hear "collapsed" (WCAG 4.1.2) | High | Every student | 21E.1 | **fixed in 21E.1 slice 2 (PR #300)**: `.iex-details-panel[hidden]{display:none}` + bug-class guard; owner decision: open by default when the assignment has instructions (or the exam has general instructions), collapsed otherwise |
| F4 | First question starts at the bottom of the phone screen (text y = 750, first answer y = 1072 at 390×844; nothing at 200 %); position written six times | High | Students on phones / 200 % | 21E.3 | open; the F3 owner decision keeps the panel open when instructions exist, so F4's compact position line must also handle the open panel |
| F5 | CLI-blank focus ring 1.18–2.26:1 on the dark terminal (WCAG 1.4.11) | High | Network exams | 21E.3 | open |
| F6 | `--eb-muted` `#64748b` fails 4.5:1 on tints (axe nodes: student home 18, results 10, classes 3, grading 2, dashboard 1, lab 1) | High | Everyone | 21E.1 | **fixed in 21E.1 slice 2 (PR #300)**: token `#475569` + contrast test; ~103 hard-coded `#64748b` copies remain for 21E.6 |
| F7 | Assignments opens on an empty class and says there are none | High | Teachers with 2+ classes | 21E.2 | open |
| F8 | Result screen makes «بدء محاولة جديدة» the primary action; provisional 0 % headline | Medium–High | Students | 21E.3 | open |
| F9 | Text too small, no type scale (48 % of text < 13 px on the student home; 11 builder sizes) | Medium | Everyone; eye comfort | 21E.1 tokens, 21E.6 | open (slice 2 sets the toast message at 16 px / body line height) |
| F10 | Multiple-answer options show two indicators (checkbox + round pick) | Medium | Students | 21E.3 | open |
| F11 | SmartSim and lab controls ignore the exam theme's focus ring (23 CSS files hard-code ring colours) | Medium | Students in themed exams | 21E.5; guard part 21E.1 | open (guard part moved to 21E.3 / 21E.5: it touches the SmartSim frame) |
| F12 | Student home lists every assignment twice; 16 buttons named only «ابدأ الحل» | Medium | Students, screen-reader users | 21E.3 | open |
| F13 | Dates render reversed in RTL text (`<bdi dir="ltr">` missing in 9 of 10 uses) | Medium | Students | 21E.3 | open |
| F14 | Focus stays on `<body>` after «ابدأ الامتحان» and «تسليم الآن» | Medium | Screen-reader users | 21E.3 | open (planned) |
| F15 | A new structured exam shows an error and «تغييرات غير محفوظة» before any edit | Low–Medium | Teachers | 21E.2 | open |
| F16 | Phone menu loses focus after Escape | Low | Keyboard users | 21E.1 | **fixed in 21E.1 slice 2 (PR #300)**: focus returns to «القائمة» after Escape, backdrop and close |
| F17 | Dashboard 11.4 phone screens; 4 canvas charts without names | Medium | Teachers | 21E.4 | open |
| F18 | Gradebook table wider than its panel at 1280 px; no caption | Low | Teachers | 21E.4 | open |
| F19 | Exam cover: «ابدأ الامتحان» below the first phone screen | Low | Students | 21E.3 | open |
| F20 | Builder mixes two button systems, 17 button styles, 10 radii, 19 emoji buttons | Medium | Teachers | 21E.2 | open |

Keep (the audit's "what already works"): draft save «✓ محفوظ» in 0.3 s and announced; builder dialogs with safe defaults;
student preview closes on Escape and returns focus; table editor labelled; student autosave «تم الحفظ» announced politely;
question list modal returns focus; review screen focuses its heading; submit confirmation defaults to «متابعة الحل»; no
horizontal overflow and no page errors on any of the 16 screens at 150 % and 200 %.

## 4. Architecture principles for 21E

1. **One namespace, one ring, one layer stack.** All new CSS uses `--eb-*` tokens only; the canonical focus ring is
   `outline: var(--eb-focus-ring); outline-offset: var(--eb-focus-offset)`; z-layers come from `--eb-z-*`.
2. **Guards before migrations.** Every stage first adds or widens a guard (token-only, no native dialogs, focus-token
   types, breakpoint set, undefined tokens), then migrates one surface under it. A guard that would fail on #297's files
   is scoped or deferred until #297 merges.
3. **Primitives are extended, never forked.** New shared pieces land in `src/ui` with tests: `Toast` (uses
   `--eb-z-toast`, `role="status"`), `DataTable` frame (caption, `scope`, `aria-sort`, overflow wrapper), `Field` frame
   (label / help / error with `aria-invalid` + `aria-describedby`, generalised from `RubricEditor`), `LtrIsland`
   (`<bdi dir="ltr">` for code, numbers, units, IPs, formulas), `Skeleton`/`Loading` with one copy.
4. **RTL-first with explicit LTR islands.** Logical properties only; every code / number / unit / IP / formula string
   passes through the island component or `unicode-bidi: isolate`.
5. **Bundle stability.** Initial graph stays ≤ 109.9 KB gzip + 1 KB per stage (hard budget remains 125 KB); nothing new
   enters the Student Portal static closure; `App.tsx` work only moves code behind existing lazy edges.
6. **Backward compatibility.** No API, storage, schema, URL, service-worker cache name or stored-document change in any
   stage. Existing class names stay; new ones are additive.
7. **Evidence.** Each stage ships fail-first tests where a defect is fixed, targeted suites, a Chromium harness with
   screenshots at 1280×900 and 390×844 (plus 200 % text scaling where layout is touched), exact-head CI, and a PR
   preview before review.

## 5. Roadmap (refined from the audit)

| Stage | Scope (small, independently reviewable) | Primary findings | Bundle | Risk |
|---|---|---|---|---|
| **21E.0** (this PR) | Audit, baselines, roadmap, risk matrix, quality gates; **foundation fix**: focus-token misuse + guard + Chromium certification; render-baseline tool | DS-1 | 0 | L |
| **21E.1** Design system and shell consistency | `Toast` primitive + `--eb-z-toast` wired; replace the 12 native dialogs with `useConfirm` (+ the missing single-delete confirmations); widen guards: no `window.confirm/alert/prompt`, no undefined `--eb-*` references, breakpoint allow-list (640/768/1024/1280) for *new* sheets, outline guard over `src/**/*.css` with an explicit allow-list; define `--eb-font-mono`; remove the phase-label eyebrow (DS-11); student skip link; `IconButton` for bell / install entry | DS-3, DS-8, DS-11, T-3, S-5, S-10, A-1 (guard part), A-2 | ≤ +1 KB | L–M |
| **21E.2** Teacher workspace and exam builder | **Audit F1 (critical on phones / 200 %: the sticky toolbar fills the screen and, since 21E.1 slice 2, the undo toast overlaps the strip it leaves — §3.5), F7, F15, F20.** Builder toolbar grouping (primary / secondary / overflow via `ActionMenu`), icon set from `icons.tsx` instead of emoji, builder overlay becomes a true dialog surface (role, trap, Escape via the existing unsaved guard), `Field` frame adopted by the 5 most-used editors, inline per-question issues with a live region, reorder button names with context, save-label vocabulary (one table), gradebook / results CSV export reusing `reports/csv.ts`, `ChartCard` for dashboard charts | T-2, T-4, T-5, T-6, T-7, T-8, T-9 | 0 (lazy chunks) | M |
| **21E.3** Student exam-taking experience | Per-question error boundary with retry (`lazyWithRetry` in both registries), focus moves on start / submit / result, timer threshold announcements (polite, once per threshold), save-status announcement throttled to state changes that matter, 44 px targets on phones for the listed controls, LTR islands for CLI / physics units / notification grade / install card brand, fixed-height clipping removed (max-height in `rem` or `min()` wrappers) | S-1, S-2, S-3, S-4, S-6, S-7, S-8, S-9 | ≤ +1 KB | M; **from the RF1 real-page review (§7.2):** collapse the exam details panel by default after question 1 and tighten the section header so the question is the primary focus on desktop, `scroll-padding` for the fixed bottom navigation so a newly focused control is never under it, short visual-question hint with an expandable keyboard guide |
| **21E.4** Grading, results and analytics | `DataTable` frame for Gradebook / Dashboard / Bank / Picker (caption, scope, sort), grading workspace phone layout (summary cards collapsed into a disclosure, attempt tabs as a segmented control), teacher review `<pre>` answers isolated LTR, dashboard empty states on `EmptyState`, contrast fixes for the listed muted colours | DS-4, DS-6, S-12, A-3, S-6 (review part) | 0 | M |
| **21E.5** SmartSim and interactive-question presentation | One loading / fallback / reduced-motion contract for every interactive family (table in §3.3 of the student audit): shared `InteractiveFrame` (loading copy, WebGL / canvas fallback message, boundary, `data-eb-motion` honoured), keyboard alternative for topology authoring drag, grids wrapped in `min(100%, …)` | S-1 (SmartSim side), S-9, A-2, A-5 | 0 | M — **touches shared renderers; sequence after #297 merges** |
| **21E.6** Accessibility, responsive UX and final certification | Token migration of `platform.css` and `App.css` behind the widened guard (colours, spacing, physical→logical), `*-pro.css` loaded per surface, breakpoints consolidated, 200 % text-scaling certification of every shell, browser-side accessibility checks (focus visibility, landmarks, contrast) added to the harness runner, final Chromium certification sweep and the 21E close-out record | DS-2, DS-7, DS-9, DS-10, T-10, A-4, A-6 | ≤ −2 KB (CSS) | M–H (large diffs; split per sheet) |

Sequencing rule: 21E.1 → 21E.2 and 21E.3 may run in parallel windows (disjoint files, see §6) → 21E.4 → 21E.5 (after #297)
→ 21E.6. Each stage is one branch, one PR, reconciled with `main` by normal merge before review.

## 6. Regression-risk matrix — shared components and cross-PR dependencies

| Shared module | Used by (teacher) | Used by (student) | Stage that touches it | Mitigation |
|---|---|---|---|---|
| `src/StudentQuestionCard.tsx` | ExamPreview, StructuredExamSection, PresentationStudio, CompoundQuestion | StudentExamPage, student/exam/*, learning/training/*, games/liveChallenge/* | 21E.3 (boundary), 21E.5 | existing suites for every importer + both Chromium exam harnesses |
| `presentation/PresentationRoot.tsx`, `richContent/*` | ExamPreview, PresentationStudio, editor | StudentExamPage, CompositeResponse | 21E.5 only | presentation model tests; no visual change without screenshots |
| `questionTypes/studentRegistry.tsx`, `trustedSim/smartSimUiRegistry.ts` | — | every interactive question | 21E.3 (`lazyWithRetry`), 21E.5 | registry tests; chunk names unchanged (bundle guard signatures) |
| `src/ui/Dialog`, `useConfirm`, `EmptyState`, `StatusBadge` | most teacher dialogs | QuestionNavigatorDialog, AvatarPickerDialog, StudentExamPage, StudentPortal | 21E.1 (additive only) | `ui/dialog.test.tsx`; no prop removal |
| `src/visual/visual.css`, `coding/*.css`, `inlineCloze/*.css`, `networkCli/*.css`, `aiComposer/*.css`, `presentation/presentation-studio.css` | authoring editors | student responses | **21E.0** (focus tokens only) | guard test + Chromium 81/81; **not touched by #297** (verified against `origin/feature/phase-21d-d3-chemistry-lab`) |
| `src/design-tokens.css`, `src/index.css` | all | all | 21E.1 (`--eb-font-mono` addition; slice 2: `--eb-muted` value `#64748b` → `#475569` for audit F6 + the additive `--eb-placeholder`, see `docs/enterprise-ux-premium-21e1-slice2.md`), 21E.6 | token guard; additive tokens only, except value changes that raise contrast and carry their own contrast test (this exception was written by PR #300 for its own `--eb-muted` change — an owner decision to confirm at its merge) |
| `scripts/check-bundle-budget.mjs`, `.gitignore`, `.github/workflows/*` | — | — | **#297 edits these** | 21E stages never edit the bundle script; `.gitignore` additions are single lines (union-merge) |
| `chemistryStructure/chem.css`, `chemistryReactions/rxn.css`, `src/chemistry/**` | — | chemistry SmartSims | **none in 21E** until #297 merges; A-1's chem part is handed to the owner | — |
| `App.tsx` (legacy builder, routing, login) | all | all | 21E.1 (native dialogs → `useConfirm`, 7 sites), 21E.2 (overlay role), 21E.6 | each site gets a focused test; no routing change |
| `api/tests/ux2-shell-foundation.test.js` (guard) | — | — | 21E.1 (widen), 21E.6 | widen with allow-lists, never loosen |

Cross-PR dependency on **#297**: it changes `.gitignore`, `scripts/check-bundle-budget.mjs`, a workflow file and the
chemistry lab; 21E.0 adds one `.gitignore` line and one new script — union-mergeable, no shared code. 21E.5 is sequenced
after #297 because it would otherwise change shared SmartSim presentation that #297 certifies.

## 7. Foundation slice implemented in 21E.0 — focus-ring tokens (DS-1)

**Defect.** `--eb-focus` is `0 0 0 4px rgba(37,99,235,.16)` (a box-shadow). Sixteen declarations used it as a colour
and one nested the complete `--eb-focus-ring` inside `3px solid …`. With the variable defined, `var()` substitutes the
shadow value, the declaration is invalid at computed-value time, and the property takes its *initial* value — never the
hex fallback. Keyboard users therefore had **no focus ring** on the coding editor (plain and rich), coding template,
inline cloze, network-CLI terminal, visual-question overlay / markers / zone buttons / chips, AI composer and
presentation studio; in visual questions the selected shape's stroke, the draft outline, the cursor ring and the
resize handle's background were not painted.

**Fix (17 declarations, 7 sheets, token-only).** Every focus rule now uses the canonical ring
(`outline: var(--eb-focus-ring); outline-offset: var(--eb-focus-offset)`; the inset code view keeps a negative offset,
the template input keeps its 1 px offset). The four selection accents use the warn (amber) colour token, which was the
intended fallback hue. No markup, behaviour, API or bundle change (initial CSS 34.9 KB gzip, unchanged).

**Fail-first evidence.**
- Guard `src/designSystem/focusRingTokens.guard.test.ts` on the unmodified sheets: 17 offenders listed
  (`coding/coding.css:11,63,148,171`, `coding/codingTemplate.css:12,22`, `inlineCloze/inlineCloze.css:12`,
  `networkCli/networkCli.css:8`, `presentation/presentation-studio.css:9`, `visual/visual.css:9,12,15,19,22,24,27`,
  `aiComposer/ai-composer.css:7`); 5/5 on the head.
- Chromium `scripts/check-focus-ring-browser-21e0.mjs` (`browser-harness/focus-ring-21e0.*`) on a detached worktree of
  `51517c3`: **40 of 81 checks fail** — every probed control reads `outline-style: none, 0px` after a real Tab key press,
  `stroke: none` on the selected shape and draft, `border-top-style: none` on the cursor, `rgba(0,0,0,0)` on the
  handle, at 1280×900 and 390×844. On the head: **81/81**, ring 2 px `rgb(37,99,235)` at 5.17:1 on the surface.
- Neighbouring certifications unchanged: grading workspace 40/40, code editor 41/41.

**Guard kept for every later stage.** The guard scans `src/**/*.css`: `--eb-focus` only inside `box-shadow` (or a
scoped redefinition), `--eb-focus-ring` only as a complete outline value, pins on the nine fixed selectors, and real
colour tokens on the four visual accents.

### 7.1 Review Fix 1 — the ring inside a themed exam (independent UX review, P1)

**Two different situations, which the first version of this section conflated.**

| Where the control renders | Before 21E.0 | After the 21E.0 migration (head `a8ef36f`) | After RF1 |
|---|---|---|---|
| Legacy / teacher surfaces outside `.exam-presentation` (coding editor, AI composer, presentation studio, visual editors, the student page of an exam without a presentation) | **no ring** (invalid declaration → `outline-style: none`) | canonical 2 px ring in the platform primary | unchanged (2 px platform ring) |
| Controls with their own focus rule inside a **themed** exam (`PresentationRoot` → `.exam-presentation`): inline-cloze input and dropdown, hotspot overlay and markers (certified by the RF1 harness); label-diagram zones and chips, coding run button / stdin / code view (same token, not in the harness) | **3 px ring in the preset primary already worked**: the control's own declaration was invalid, so the scoped `.exam-presentation :focus-visible { outline: 3px solid var(--xp-primary) }` rule applied | **regressed to the 2 px platform-blue ring**, in every preset including high contrast | 3 px ring in the preset primary restored |
| Generic controls inside a themed exam (navigation, submit, text areas, selects without their own rule) | 3 px preset ring | 3 px preset ring (never changed) | unchanged |
| Legacy multiple-choice option inside a themed exam (`.iex-option:focus-within`, a pre-21E.0 canonical-ring rule from 17F-B1) | 2 px platform-blue ring (pre-existing) | 2 px platform-blue ring | 3 px preset ring (fixed by the same scoped token) |

**Root cause.** `--eb-focus-ring: 2px solid var(--eb-primary)` is declared on `:root`, where its `var(--eb-primary)` is
substituted; the custom property then inherits into `.exam-presentation` *already resolved* to the platform blue. The
scope's `--eb-primary: var(--xp-primary)` override therefore recolours nothing that reads `--eb-focus-ring`, and the
migrated per-control rules (equal specificity, later in the cascade than the scoped generic rule) win with 2 px blue.
This is why the high-contrast preset showed the platform-default blue instead of its black ring.

**Fix (one declaration, scoped).** `src/presentation/presentation.css`, inside `.exam-presentation { … }`:
`--eb-focus-ring: 3px solid var(--xp-primary);`. Every rule that reads the ring token now resolves to the exam's own
ring inside the scope; nothing outside `.exam-presentation` changes (the teacher studio `.xp-studio` keeps the canonical
ring), the generic scoped rule and the 17 migrated declarations are untouched, and the guard still passes (a scoped
redefinition of the ring token is a complete outline value).

**Evidence (real Chromium, `scripts/check-exam-focus-ring-browser-21e0-rf1.mjs`,
`browser-harness/exam-focus-ring-21e0-rf1.*`).** The harness mounts the real `PresentationRoot` around the real
`StudentQuestionCard` (inline cloze, hotspot with one placed point, legacy multiple choice) for the `highContrast`,
`default` and `classicPaper` presets plus a reference button outside the root; after a real Tab key press it reads the
computed outline of each control (style, width, colour, offset, contrast on the preset surface), at 1280×900 and 390×844.

| Head | Result | Inside the themed exam (cloze input, dropdown, overlay, marker, option) |
|---|---|---|
| `14f94b1` (`main`, before 21E.0) | 117/129 | cloze / hotspot: 3 px in the preset primary (black at 21:1 in high contrast); the option: 2 px `rgb(37,99,235)` (pre-existing) |
| `a8ef36f` (21E.0 before RF1) | **69/129** | every probed control: `solid 2px rgb(37, 99, 235)` in all three presets — the high-contrast exam shows the platform blue |
| RF1 head | **129/129** | every control: `solid 3px`, colour = preset primary (`rgb(0,0,0)` at 21:1; `rgb(29,78,216)` at 6.7:1; `rgb(31,41,55)` at 14.4:1), offset 2 px; the reference button outside the root keeps `solid 2px rgb(37,99,235)` |

Vitest regression `src/presentation/examFocusRing.21e0rf1.test.tsx` (fail-first on `a8ef36f`: the scoped token pin
fails, 5 of 6 pass; 6/6 on the head) pins the scoped redefinition, the untouched generic rule, the `--eb-primary`
re-pointing, and that the real root hands the ring `#000000` (high contrast) and `#1D4ED8` (default) through
`--xp-primary` only — JSON can never set the ring token. The original 21E.0 certification stays at 81/81 and the guard at
5/5 on the RF1 head.

### 7.2 Visual Quality Gate evidence for this PR (owner's Design Excellence Standard)

The owner's standard requires, for every UX PR, before / after screenshots of the **actual pages**, desktop and mobile
plus 200 % scaling, a visual review, one real workflow, documented improvements and shortcomings, and the independent
reviewer's four passes. `scripts/capture-visual-gate-21e0.mjs` (certification only) drives the **real production build**
in real Chromium through the real student workflow — session → student portal → open the assignment → themed exam
(`PresentationRoot`, high-contrast and default presets) → type a cloze blank and choose the dropdown by keyboard → place
a hotspot point by pointer and reach the marker by Tab → choose an option with Space → autosave feedback → next page —
with a local mock of the student API (the Vitest payload shapes; no token, nothing deployed). Runs: `LABEL=before` on the
build of `a8ef36f`, `LABEL=after` on the build of `cac0c84`; viewports 1280×900, 390×844 at 2×, and 640×450 at 2×
(= 200 % scaling); reduced motion honoured. Evidence page (screenshots + computed-style tables + review + shortcomings):
<https://claude.ai/artifact/U28W9Pir3ipphMZkPRk8Mo> (private to the owner; PR #298).

| Real page, control reached with Tab | Before `a8ef36f` (both presets, all viewports) | After `cac0c84` high contrast · default |
|---|---|---|
| cloze input, cloze dropdown, hotspot marker, multiple-choice option | `solid 2px rgb(37, 99, 235)` | `solid 3px rgb(0, 0, 0)` · `solid 3px rgb(29, 78, 216)` |
| horizontal overflow at 390 px and at 200 % | none | none (scrollWidth = clientWidth) |
| autosave feedback after each answer | «تم الحفظ · آخر حفظ: hh:mm:ss» | same |

**Visual review (C).** Interaction clarity restored: one focus language inside the exam, the ring in the exam's own
colour (black at 21:1 in high contrast, navy at 6.7:1 in the default preset), the platform ring unchanged outside.
Hierarchy, alignment, whitespace and readability are unchanged by this PR.

**Remaining shortcomings observed on the real page (E), scheduled, not fixed here (scope control):**

- **Question below the fold on desktop** — at 1280×900 the title bar, progress card, open details panel, section heading
  and section-status card push question 1's controls to y ≈ 830 of 900 (S-ST-NEW-1 → 21E.3: collapse the details panel
  by default after the first question; tighten the section header).
- **Focused control at the edge of the fixed bottom navigation** — Chromium scrolls a newly focused control only
  minimally into view, so it can sit partly under the sticky navigation (visible in the desktop cloze screenshots, before
  and after) (S-ST-NEW-2 → 21E.3: `scroll-padding-bottom` / `scroll-margin` equal to the navigation height).
- **Permanent instruction text on visual questions** — the hotspot keyboard hint takes three lines on phones above the
  image (S-ST-NEW-3 → 21E.3: short hint plus an expandable «كيف أستخدم لوحة المفاتيح؟»).
- **Chrome share at 200 %** — title bar + bottom navigation use about a quarter of the viewport height; nothing is
  clipped (→ 21E.6 responsive certification).

**Independent reviewer passes requested (F):** FUNCTIONAL, ACCESSIBILITY, VISUAL QUALITY, REGRESSION — recorded in the PR.

## 8. Acceptance criteria and measurable quality gates per stage

Common to every stage (exact head): `npm test` green (documented flaky policy applies), lint 0 errors, `tsc -b`, build,
bundle guard within the stage's bundle line of §5, `git diff --check`, PR preview created, Chromium harness of the
stage passing with screenshots at 1280×900 and 390×844, and **no change** to any file of an open PR from another window.

**Owner's Visual Quality Gate (mandatory for every UX PR, from 21E.0 RF1 on).** Before requesting merge: (A) before /
after screenshots of the **actual affected pages** (real production build driven through the real route, not only a
component harness); (B) desktop and mobile evidence plus 200 % scaling where relevant; (C) a written review of visual
hierarchy, alignment, whitespace, readability, colour harmony, interaction clarity and user effort; (D) at least one real
teacher or student workflow demonstrated end to end; (E) documented usability improvements and remaining shortcomings;
(F) independent reviewer sign-off as FUNCTIONAL / ACCESSIBILITY / VISUAL QUALITY / REGRESSION passes. A serious visual,
accessibility or workflow regression blocks merge even when CI is green. `scripts/capture-visual-gate-21e0.mjs` is the
reference capture tool (real build + local mock of the student API); later stages extend it with the teacher routes.
Design principles the gate checks against: premium but restrained visual design (exact approved logo, navy / teal /
restrained neutrals, one typography / spacing / radius / elevation system, no gradients or shadow noise), eye comfort
(readable Arabic type, WCAG AA, clear but calm focus and error states, 150 % / 200 % scaling without clipping),
teacher-first productivity, student-first exam experience (the question and answer area as the primary focus, no large
headers or permanent instruction panels pushing questions below the fold), responsiveness and accessibility (keyboard,
screen-reader semantics, contrast, touch targets, RTL with isolated LTR, reduced motion).

| Stage | Gate (measurable) |
|---|---|
| 21E.0 | `focusRingTokens.guard` 5/5; focus-ring Chromium 81/81 (baseline 41/81); initial JS 109.9 KB; CSS 34.9 KB; grading 40/40; code editor 41/41 |
| 21E.1 | `window.confirm/alert/prompt` count in `src/**` = **0** (guard); undefined `--eb-*` references = 0 (guard); `--eb-z-toast` used by `src/ui/Toast`; outline guard covers `src/**/*.css` with allow-list ≤ 9 entries; student shells have a skip link (test); phase-label eyebrow absent (test); Toast announced via `role="status"` (test) |
| 21E.2 | Builder toolbar ≤ 8 visible actions at 1280 px with an overflow menu (Chromium); sticky bar ≤ 64 px at 390×844 and ≤ 15 % of the viewport at 640×450 @2, the undo toast never overlapping the sticky bar or a focused control there (audit F1, §3.5); builder overlay has `role="dialog"`, trap and Escape (tests + Chromium); ≥ 5 editors on the `Field` frame with `aria-invalid`/`aria-describedby` (test); issues rendered next to the question with a live region; gradebook CSV export exists (test); dashboard charts carry a data table (test); one save-label table (guard on the listed strings) |
| 21E.3 | Per-question boundary: a failing lazy chunk shows a retry card, exam state intact (test + Chromium); focus lands on the heading after start / submit / result (tests); timer announcements exactly once per threshold (test); save-status announcements ≤ 1 per state change (test); listed phone targets ≥ 44 px (guard); LTR islands for CLI / units / grade / brand (tests); no `max-height` in px on the listed answer surfaces (guard); 200 % text-scaling screenshot of the exam page with no clipped text |
| 21E.4 | Four tables on `DataTable` with caption, `scope`, `aria-sort` (tests); grading phone layout: first question visible within one viewport height at 390×844 (Chromium); review `<pre>` isolated (test); muted-text contrast ≥ 4.5:1 for the listed selectors (extend the UX-2 contrast test) |
| 21E.5 | Every interactive family has loading copy, fallback, boundary and reduced-motion through `InteractiveFrame` (registry test); topology authoring keyboard path (test); grids use `min(100%, …)` (guard); existing SmartSim Chromium certifications unchanged |
| 21E.6 | `platform.css` and `App.css` under the token guard (0 hex, 0 raw spacing in migrated blocks; ratchet per PR); breakpoints ⊆ {640, 768, 1024, 1280} for all non-feature sheets (guard); per-surface CSS loading with initial CSS ≤ 30 KB gzip; browser-side a11y checks (focus visibility, landmarks, contrast) in the harness runner; 200 % scaling certification of teacher and student shells |

## 9. Implementation plan for the next slice (21E.1)

1. Branch from `main` after this PR merges; baseline gate per `AGENTS.md` §4.
2. Guards first (fail-first): native-dialog guard (expects 0, fails on the 12 sites), undefined-token guard, widened
   outline guard with the 9-entry allow-list.
3. `src/ui/Toast.tsx` + `useToast` (role="status", `--eb-z-toast`, reduced-motion aware) with tests; no consumer yet
   beyond the dialogs migrated in step 4 (success notices).
4. Replace the 12 native dialogs with `useConfirm` / a `useInputDialog` for the single `window.prompt`; add the missing
   single-delete confirmations; one focused test per site.
5. Student skip link, `IconButton` for the bell and install entry, remove the phase-label eyebrow, define `--eb-font-mono`.
6. Chromium harness for the migrated dialogs (on top, Escape, Tab), screenshots; full validation; PR with this record's
   §8 gate filled in.

## 10. Known limitations of 21E.0

- The render-performance probe measures the unauthenticated login route of a locally served production build; it is a
  relative baseline (same tool, same container), not a field metric.
- The audit's counts are grep-based and exclude test files; a few one-off class names may be undercounted.
- Device coverage (Windows / Android / iOS installed app) remains the owner's manual checklist from PR #296.
- 21E.0 fixes only DS-1 (and, with RF1, the ring regression it caused inside themed exams); every other finding is
  scheduled, not fixed.
- The RF1 harness covers the inline-cloze, hotspot and multiple-choice controls inside a themed exam; the coding,
  network-CLI and label-diagram controls inherit the same scoped token (same cascade, same rule shape) but are certified
  only by the static 21E.0 harness outside the exam scope.
