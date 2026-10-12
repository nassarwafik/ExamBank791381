# Phase 21E.1 — Enterprise design system and shell consistency · slice 1: one accessible confirmation path

Design record for the first 21E.1 slice (Tadris+ — التعليم المتكامل). It builds on the 21E.0 audit, roadmap and quality gates
in `docs/enterprise-ux-premium-21e.md` (merged with PR #298) and follows the owner's Design Excellence Standard and Visual
Quality Gate recorded there (§8). Independent review required. Owner merge only.

## 1. Baseline and dependencies

| Item | Value |
|---|---|
| Baseline (`origin/main`) | `66b8a9f481d9110611b3b803409a1dceaef96604` — merge of PR #298 (21E.0) on top of `14f94b1` (merge of PR #297, Chemistry D.3) |
| Post-merge state of the baseline | Quality Gate, production Build and Deploy and Runner workflows green on `66b8a9f` (runs 38160874823, 38160874897) |
| Dependencies | none open: #297 and #298 are merged; this PR targets `main` directly and carries no 21E.0 commit of its own |
| Branch | `claude/elegant-albattani-1im7iq-21e1` (rebuilt on `66b8a9f`; the slice prepared while #298 was open was re-applied, not cherry-picked from another window) |

## 2. The selected improvement and why

**Finding T-3 (21E.0 audit, S2):** twelve confirmations in the teacher workflow still used the browser's native dialogs
(`window.confirm` ×11, `window.prompt` ×1) although the platform has one accessible confirmation (`useConfirm` →
`ConfirmDialog`). A native dialog is unstyled, left-to-right with English «OK / Cancel» buttons on an Arabic page, blocks the
whole browser, ignores the design tokens, the focus ring and the dialog layer, offers no safe default for destructive actions,
and cannot be certified in the harness. The marks-distribution choice asked the teacher to type «1» or «2» into a prompt.

| Site (baseline line) | Teacher action | After |
|---|---|---|
| `App.tsx:3432` | export with preflight warnings | «ملاحظات قبل التصدير» — «التصدير رغم ذلك» / «العودة للمراجعة» |
| `App.tsx:4147` | delete a saved exam | danger — «حذف الامتحان» / «إبقاء الامتحان» (focus starts on keep) |
| `App.tsx:4396` | delete a question (legacy editor) | danger — «حذف السؤال» / «إبقاء السؤال» |
| `App.tsx:4451` | auto-distribute marks (`window.prompt("1"/"2")`) | a small dialog with three real buttons: «إلغاء» / «توزيع متساوٍ» / «حسب الصعوبة» |
| `App.tsx:5170` | delete a saved template | danger — «حذف القالب» / «إبقاء القالب» |
| `App.tsx:5304` | apply AI general instructions to the exam | «تطبيق التعليمات العامة على الامتحان» — «تطبيق التعديلات» / «إلغاء» |
| `App.tsx:6817` | general-instructions template over existing text | «استبدال التعليمات العامة» — «استبدال التعليمات» / «إبقاء التعليمات» |
| `ExamSectionEditor.tsx:95` | section-instructions template over existing text | «استبدال تعليمات القسم» — «استبدال التعليمات» / «إبقاء التعليمات» |
| `ExamCoverEditor.tsx:47` | cover template over edited fields | «استبدال حقول الغلاف» — «استبدال حقول الغلاف» / «إبقاء الحقول» |
| `ExamCoverEditor.tsx:55` | cover-instructions template over existing text | «استبدال نص التعليمات» — «استبدال التعليمات» / «إبقاء التعليمات» |
| `QuestionMediaEditor.tsx:86` | generate an AI image over an existing image | danger — «إنشاء واستبدال» / «إبقاء الصورة» |
| `QuestionMediaEditor.tsx:112` | remove a question image | danger — «إزالة الصورة» / «إبقاء الصورة» |

Why this slice first: highest visible impact on every teacher who edits an exam, lowest risk (the gating order of every call
site is unchanged: `if (!(await confirm(...))) return;` replaces `if (!window.confirm(...)) return;`), uses the existing shared
component, independently testable in happy-dom and Chromium, no data, API, grading, schema or routing change.

**Deliberately not in this slice** (scope control): the single-delete confirmations T-3 also mentions (the structured builder
has undo; the better pattern is an undo toast — proposed for slice 2, §8), the Toast primitive, the undefined-token guard, the
student skip link, `IconButton` for the bell / install entry and the phase-label eyebrow (all slice 2–3).

## 3. Acceptance criteria (measurable)

1. `window.confirm` / `window.alert` / `window.prompt` / bare `alert()` / `prompt()` in product code under `src/`: **0** (guard
   `src/designSystem/nativeDialogs.guard.test.ts`, fails on all 12 sites at the baseline).
2. Every migrated confirmation is the shared dialog: `role="dialog"`, `aria-modal="true"`, RTL, Arabic title and labels; Escape
   and the keep button change nothing and return focus to the opener; the confirm button applies the change; a destructive
   confirmation starts with focus on the safe choice (tests + Chromium).
3. No native dialog fires in Chromium for the migrated flows; the dialog paints on top (real hit test) and fits the visible area
   at 390 / 820 / 1280 px, at 150 % / 200 % / 400 % (320 CSS px) desktop zoom, at 200 % root font size, on a touch tablet at
   150 %, and on a phone with 150 % / 200 % page zoom (260 / 195 CSS px); decision buttons ≥ 44 px on touch, ≥ 24 px with a
   mouse (WCAG 2.5.8).
4. Initial JS graph **≤ +1 KB gzip** over the baseline (the 21E.1 bundle line of the roadmap) and the dialog layer is **not** in
   the initial graph (bundle guard).
5. Lint 0 errors, `tsc -b`, full root suite, build + bundle guard, `git diff --check`; exact-head CI green and PR preview created.
6. The owner's Visual Quality Gate (A–F) on the real teacher pages (§6).

## 4. Implementation (minimal, reviewable)

- **Call sites** — the twelve native calls become `await confirm({ title, message, confirmLabel, cancelLabel, tone })` with
  Arabic labels that name the action («حذف الامتحان», «إبقاء الصورة»); the marks prompt becomes a three-button `Dialog`. Handlers
  that awaited nothing before are now `async`; the gating order is unchanged. `QuestionMediaEditor.onGenerate` re-checks its
  single-flight guard after the confirmation (a second click while the dialog was open cannot start a second generation).
- **Bundle-neutral confirmation for the startup module.** `App.tsx` is in the initial bundle; importing `useConfirm` and
  `Dialog` there pulled the dialog layer (Dialog, focus trap, close button: 3.2 KB) into the initial graph (+2.9 KB net, 9 → 14
  files). The promise logic of `useConfirm` moved unchanged into `src/ui/useConfirmState.ts`; `useConfirm` keeps its exact
  contract for its 20+ consumers (all in lazy chunks); the new `src/ui/useDeferredConfirm.tsx` returns the same shape and loads
  `ConfirmDialog` on the first confirm; `App.tsx` uses it and loads its marks `Dialog` lazily. Both lazy imports keep the one-shot
  stale-chunk deployment recovery (`lazyWithRetry`, inventoried in `src/deploymentRecovery.inventory.11d.test.ts`).
  `ConfirmDialog.tsx` gains a default export (additive). Result: initial JS **110.1 KB** vs **109.9 KB** (+0.2 KB), 8 files.
- **Bundle guard (stricter).** `scripts/check-bundle-budget.mjs` now refuses any initial-graph file that carries the dialog layer
  (`eb-dialog-backdrop`). The 21E.0 risk matrix said 21E stages would not edit the bundle script — that rule existed to avoid
  conflicts with PR #297, which has since merged; this edit only adds a check.
- **Dialog reachability below 320 CSS px (found by this slice's certification).** On a phone with 150–200 % page zoom the
  page-wide `min-width: 320px` widens the layout viewport past the visible area; the fixed dialog root spanned it, so the RTL
  dialog's left part — the confirm button — was outside the reachable area (no pan could reach it; even an automated click
  failed). `.eb-dialog-root { max-inline-size: 100vw; }` keeps every dialog inside the visible area; at ≥ 320 px it changes
  nothing. This affects every in-page dialog of the product (it pre-dated 21E.1) and would otherwise have been inherited by the
  twelve migrated flows, which the native dialogs never had.
- **Touch targets.** `.eb-dialog-foot .eb-button` is 44 px on touch widths (≤ 767 px) and on any coarse pointer (a touch tablet).

## 5. Evidence

### 5.1 Fail-first (baseline `66b8a9f`)

| Proof | Baseline | Head |
|---|---|---|
| `nativeDialogs.guard.test.ts` | lists the 12 sites; 2 of 3 tests fail | 3/3 |
| `sharedConfirm.21e1.test.tsx` (cover, section, media flows) | 4 of 4 flow tests fail (no shared dialog; `window.confirm` called) | 6/6 (incl. 2 for `useDeferredConfirm`) |
| `App.sharedConfirm.21e1.test.tsx` (real App, teacher session: saved exam, template, question, marks, general-instructions template) | 5 of 5 fail; each flow calls the native dialog with its old text (`confirm: هل تريد حذف الامتحان المحفوظ…`, `prompt: اختر طريقة التوزيع…`) | 5/5 (same POST bodies as before on confirm; nothing sent on keep / Escape) |
| `scripts/check-shared-confirm-browser-21e1.mjs` (Chromium) | exits on the first flow: a native `confirm` fires, the shared dialog never appears | **84/84** |
| bundle guard on the first, eager version of this slice | FAILS: `Dialog-*.js (initial) contains the dialog layer` (112.8 KB, 14 files) | passes (110.1 KB, 8 files) |
| dialog-root cap removed (mutant, file restored byte-for-byte, hash-verified) | **81/84**: at 260 / 195 CSS px the dialog is not fully visible; at 195 px the confirm button cannot be hit | 84/84 |

### 5.2 Validation on the head

Build closure (dist of the head): `ConfirmDialog-*.js` and `Dialog-*.js` are in the static closure of `TeacherPlatform`,
`StructuredExamBuilder` and `StudentPortal` (all lazy), and in no initial-graph file. Recorded in the PR (exact-head local runs
and CI): full root suite, lint, `tsc -b`, build + bundle guard, `git diff --check`,
the 21E.0 focus-ring certification (unchanged files), the shared-confirm certification, the teacher-page visual gate capture.

## 6. Visual Quality Gate (owner's standard) — teacher pages

`scripts/capture-visual-gate-21e1.mjs` drives the **real production build** through a real teacher session (stored token
validated by `/api/platform-session`) against a local mock of the teacher API (the payload shapes App.tsx reads; no token,
nothing deployed, service workers blocked). Before = build of `66b8a9f`, after = build of the head. Viewports: 1280×900,
390×844 touch, 640×450 at 2× (= 200 %), and 195×422 at 4× (a phone at 200 % page zoom; bank page only).

**D — the workflow:** builder landing → saved exams → delete by keyboard (Enter on «حذف», Escape keeps) → delete a template
(keep) → new structured exam → section-instructions template over typed text → leave the builder (unsaved-changes guard) →
open the saved exam in the legacy editor → delete a question (Enter on the focused safe choice keeps it) → distribute marks
(«حسب الصعوبة» → «✓ تم توزيع العلامات حسب الصعوبة») → exam bank page → delete a saved exam (Escape keeps).

| Measure | Before `66b8a9f` | After head |
|---|---|---|
| Teacher flows that open a native browser dialog (desktop, phone, 200 %) | 6 of 6 (5 `confirm`, 1 `prompt`) | 0 — all shared dialogs |
| Destructive dialogs opening on the safe choice | — (native: browser default) | 3 of 3 («إبقاء الامتحان», «إبقاء القالب», «إبقاء السؤال») |
| Focus returned to the opener after closing | — | every flow, every viewport |
| Dialog buttons on a 390 px touch phone | 40 px | 44 px (every dialog) |
| Bank-page dialog at 195 CSS px | x −117…187 in a 195 px visible area; confirm «حذف» unreachable | x 8…187; fully visible; confirm reachable |
| Page / console errors | 0 | 0 |

**C — visual review.** One dialog language across builder, editor and bank page (title, message, a primary or danger
action, a quiet keep action); buttons name the action instead of the browser's «OK» / «Cancel»; Arabic right-aligned, the
marks dialog isolates the question count; desktop centered dialog, phone bottom sheet. **E — remaining shortcomings observed
on the real pages (not fixed here):** below 320 CSS px the teacher shell's menu button, the bank tabs and the row actions are
covered (same before and after; 21E.6); the structured builder's toolbar stacks about fourteen full-width actions on phones and
the legacy builder's AI card pushes saved exams below the fold on desktop (21E.2); single question / section deletion still
asks nothing (slice 2, undo toast). **F —** FUNCTIONAL / ACCESSIBILITY / VISUAL QUALITY / REGRESSION passes requested from the
independent reviewer in the PR.

## 7. Regression-risk assessment

| Area | Risk | Why it is contained | Proof |
|---|---|---|---|
| Gating order of the 12 confirmations | L | identical `if (!ok) return` structure; async handlers return before any state change on cancel | focused tests per surface; Chromium flows |
| `useConfirm` contract (20+ consumers) | L | same return shape and semantics; logic moved verbatim into `useConfirmState` | `src/ui/dialog.test.tsx` (unchanged) + full suite |
| First confirmation in `App.tsx` loads a chunk | L | **Corrected in slice 2:** the builder landing is rendered by `App.tsx` itself, not by `TeacherPlatform`, so the first App.tsx confirmation there (e.g. deleting a saved exam) DID fetch the `ConfirmDialog` chunk on the click (the independent review measured ~356 ms with nothing painted on a throttled profile). While it loads nothing renders and the caller keeps awaiting; stale-chunk recovery via `lazyWithRetry`. Slice 2 warms the chunk on idle once a teacher session is validated (`src/ui/confirmPrefetch.ts`, `docs/enterprise-ux-premium-21e1-slice2.md`) | `useDeferredConfirm` tests; deployment-recovery inventory; slice-2 throttled first-confirm measurement |
| `.eb-dialog-root` width cap | L | at ≥ 320 CSS px `inset: 0` is already ≤ 100vw (no change); below it the dialog becomes reachable | Chromium 84/84 at 8 viewports; mutant 81/84 |
| Coarse-pointer 44 px buttons | L | only taller decision buttons on touch devices | Chromium touch-tablet case |
| Bundle script edit | L | additive check; existing checks untouched | guard passes on baseline and head, fails on the eager variant |
| Student exam, grading, schemas, auth, storage, chemistry | none | not touched | full suite |

## 8. Proposal for the next 21E.1 slice

**Slice 2 — feedback you can trust and undo:** the `Toast` primitive (`role="status"`, `--eb-z-toast`, reduced-motion aware,
lazy like the dialog layer) and its first consumers: «تم حذف السؤال — تراجع» for single question / section deletion in the
structured builder (the T-3 gap, using the existing undo history instead of another confirmation), and the save / publish
notices that today appear inline far from the action. Guards: the undefined-token guard (DS-8, incl. `--eb-font-mono`) and the
outline guard widened to `src/**/*.css`. Same gate: before / after on the real builder at desktop, phone and 200 %.

## 9. Known limitations

- Below 320 CSS px the **page** behind a dialog is still wider than the screen (page-wide `min-width: 320px`, `src/index.css`);
  the dialog itself is now fully visible. The page-wide minimum belongs to 21E.6 (responsive certification).
- The service worker does not cache app chunks (it only serves the offline page). If a teacher lost the connection after
  loading the app shell but before any teacher page loaded the dialog chunk, an App.tsx confirmation could not open: the
  action is then simply not taken (never a silent destructive default). *Erratum (slice 2):* this section first said the teacher
  landing page loads that chunk; it does not (the landing is App.tsx's own view). Slice 2 prefetches it on idle after the teacher
  session is validated, which narrows this window to "lost the connection within the first idle moment after sign-in".
