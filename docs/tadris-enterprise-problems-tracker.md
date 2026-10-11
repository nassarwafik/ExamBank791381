# Tadris+ — enterprise problems tracker

Permanent traceability for the owner's `Problems.pdf` (5 pages) and the approved rebranding to **Tadris+** (`التعليم المتكامل`).
One row per issue; every claim links to code, tests and the PR that carries it. Status values: `open`, `in PR`, `verified`
(verified = the acceptance tests ran on the exact PR head and the result is recorded in the PR body).

| ID | PDF page | Title | Severity | PR | Status |
|---|---|---|---|---|---|
| BUG-001 | 1 | Exam import → «رجوع» does nothing until a draft is saved | High (teacher blocked, work appears lost) | PR A — #293 | verified (Chromium 49/49 on the PR head; exact-head CI green) |
| BUG-002 | 1 | Eight editor toolbar actions "do not respond" | High (features unreachable) | PR A — #293 | verified (Chromium 49/49 on the PR head; exact-head CI green) |
| UX-003 | 2–4 | Enterprise teacher grading workspace | High (usability) | PR B — #294 | in PR — RF1 applied (attempt-switch guard, edit-preserving reload, review modes); Chromium + happy-dom re-certified |
| FEATURE-004 | 3 | Student notification after a grade change | Medium | PR C — #295 | merged (`7c155ff`; RF1 `a10075f`: dedupe key binds the committed transition, withheld coding marks never ride the event, `cleanScore(null)` no longer reads as 0; API certification 7/7 + RF1 8/8, client 3/3) |
| BRAND-005 | 4–5 | Complete Tadris+ branding | Medium | PR D — #296 | in PR (contract test + Chromium 27/27 on the production build) |
| PWA-006 | 4–5 | Installed-app name and icon (desktop / Android / iOS) | Medium | PR D — #296 | in PR (manifest / icons certified in Chromium; device checklist pending with the owner) |

---

## BUG-001 — Exam import: Back navigation

| Field | Value |
|---|---|
| Source | `Problems.pdf` page 1 |
| Original requirement | After importing an exam and reaching the editor, «رجوع» must work without first pressing «حفظ مسودة». Unsaved changes are never silently discarded; the existing confirmation flow is used; Cancel keeps the teacher in the editor; confirmed navigation returns to the previous screen; Save Draft keeps working; imported content stays intact. |
| Actual behaviour (baseline `6a61005`) | Pressing «→ رجوع» right after «فتح في باني الامتحان» appears to do nothing. Keyboard focus silently moves, page scrolling stops (`body.style.overflow = hidden`), Escape "fixes" it. After «💾 حفظ مسودة» the button works. |
| Reproduction | Teacher → «📥 استيراد امتحان منظّم» → open the import in the builder → press «→ رجوع». Real-browser reproduction: `scripts/check-builder-overlay-browser.mjs` on the baseline fails 14/47 checks (see fail-first evidence below). |
| Root cause | A **stacking-order defect**, not a navigation defect. `App.tsx` mounts the builder inside `.structured-builder-overlay` (`src/App.css`, `position:fixed; z-index:900`, opaque). «رجوع» calls `requestExit()` → `confirmLeaveUnsaved()` (`src/StructuredExamBuilder.tsx:274-289`), which opens the project `ConfirmDialog` through `src/ui/Dialog.tsx`: a portal into `document.body` with `.eb-dialog-root { z-index: var(--eb-z-modal) }` and `--eb-z-modal: 70` (`src/design-tokens.css`). Both are direct children of `<body>`, so the opaque overlay (900) paints over the confirmation (70). An imported exam is opened through the history authority as `"unsaved"` (`examHistory.ts:47-49`: no saved checkpoint → `dirty`), so the guard fires on the first «رجوع»; Save Draft commits a checkpoint (`commitSavedExamHistory`) → not dirty → no dialog → exit works. The guard logic itself was correct. |
| Affected routes / components | Teacher platform → structured builder overlay (`src/App.tsx:7874`), `src/StructuredExamBuilder.tsx` («رجوع», recovery dialog, bulk-delete confirm, preset-replace confirm), `src/ui/Dialog.tsx`, `src/ui/ConfirmDialog.tsx`. Same mechanism for a new exam («🧱 امتحان منظّم جديد») and for a saved exam once edited. |
| Fix (PR A) | New design token `--eb-z-overlay: 60` (`src/design-tokens.css`) between the shell layers (nav 30 / drawer 40 / toast 50) and the modal layer (70). `.structured-builder-overlay` now uses `var(--eb-z-overlay,60)` (`src/App.css`). No change to navigation, history or guard logic. The teacher's manual-review modal (`.review-overlay`, `src/platform.css`, previously `z-index:1000`) had the same defect for its coding-regrade confirmation and uses the same token. |
| Acceptance tests | Unit (CSS layer contract, fail-first): `src/structuredBuilderOverlay.layers.test.ts` — on baseline `6a61005`: `AssertionError: expected 900 to be less than 70`; on the head: 5/5 pass. Real Chromium (`scripts/check-builder-overlay-browser.mjs`, harness `browser-harness/builder-overlay.*`, production builder + production overlay shell + production stylesheets, exam really imported through `parseStructuredExamJson` and opened `"unsaved"`): hit tests (`document.elementFromPoint`) and real pointer clicks on the confirmation; «البقاء في المحرر» keeps the editor and the import; «الخروج دون حفظ» closes the builder and returns to the previous screen with the import still held by the owner (`dirty`); body scroll released; Save Draft → «رجوع» leaves without a dialog; keyboard (Enter opens, initial focus on «البقاء», Escape stays); phone 390×844 touch. Baseline: 33/47 pass (all 14 failures are the hidden dialog). Head: 49/49 pass. |
| Not done on purpose | No auto-save and no silent discard on exit; browser Back is unaffected because the app has no router (navigation is React state; `popstate` is not used anywhere), so there is no browser-history regression to fix or test. |

## BUG-002 — Editor action buttons

| Field | Value |
|---|---|
| Source | `Problems.pdf` page 1 |
| Original requirement | «إضافة من بنك الأسئلة», «سؤال بالذكاء الاصطناعي», «سيناريو بالذكاء الاصطناعي», «المؤلف الذكي», «إدارة النشر والإصدارات», «القوالب الأكاديمية», «العرض والتصميم», «مختبر الدوال 3D» must open their working feature; unavailable capabilities must not be misleading clickable controls; returning from a tool preserves questions, unsaved edits, exam identity and navigation state. |
| Actual behaviour (baseline) | Every button opens its dialog (state set, chunk lazy-loaded, dialog mounted with focus trap and scroll lock) **underneath** the opaque builder overlay. Visible cues were only the `is-active` toolbar state on three buttons; a second click did nothing (already open); Escape closed the invisible dialog. |
| Per-button trace (all in `src/StructuredExamBuilder.tsx`) | 1 `📚 إضافة من بنك الأسئلة` → `setPickerOpenFor(exam.examId)` → `BankQuestionPicker` (Dialog). 2 `✨ سؤال بالذكاء الاصطناعي` → `setAiOpenFor` → `aiAuthoring/AiQuestionAuthorDialog`. 3 `✨ سيناريو بالذكاء الاصطناعي` → `setAiScenarioOpenFor` → `aiAuthoring/AiScenarioAuthorDialog`. 4 `🧠 المؤلف الذكي للامتحان` → `setComposerOpenFor` → `aiComposer/AiExamComposerDialog`. 5 `🗂 إدارة النشر والإصدارات` → `setGovernanceOpen` → `GovernancePanel`. 6 `📋 القوالب الأكاديمية` → `setPresetsOpen` → `presets/PresetLibraryPanel`. 7 `🎨 العرض والتصميم` → `setStudioOpen` → `presentation/PresentationStudio` («استوديو العرض»). 8 `🧮 مختبر الدوال 3D` → `setSurfaceLabOpen` → `functionSurfaces/Surface3DLab`. Buttons 1–6 render only when `App.tsx` supplies the matching service (`bankPicker`, `aiAuthor`, `aiAuthor.authorScenario`, `aiAuthor.composeExam`, `governance`, `presets`), and `App.tsx:2831-2900` always supplies all of them; 7–8 always render. None requires a saved exam id (imports get `EXAM-import-…` ids). Nothing is permission-gated client-side; the services call authenticated API routes when used. Ruled out: no-op handlers, missing parent props, `<form>` submit, `pointer-events`, failed lazy chunks (they would throw to the error boundary). |
| Root cause | Identical to BUG-001: `.structured-builder-overlay` (900) over `.eb-dialog-root` (70). Also hides: مخطط الامتحان, تحليل المخطط, سياسات الجودة, the bulk-classify dialog, the narrow-screen navigator and the local-recovery dialog («نسخة غير محفوظة», which has no close button — invisible and un-dismissable except by Escape). |
| Fix (PR A) | The same `--eb-z-overlay` token (see BUG-001). No button is removed or disabled: every one of the eight opens a real, working, previously shipped and tested feature once visible. |
| Acceptance tests | `scripts/check-builder-overlay-browser.mjs`: for each of the eight actions — the button is offered and enabled, its dialog mounts, a hit test on the dialog title lands inside the dialog (painted on top), the close button is clicked with a real pointer, and the builder still holds the imported exam with exactly its two questions (no duplicates, same identity). Baseline: all eight "painted on top" checks fail (hit lands on `header.sb-toolbar`, `div.sb-issues`, `input.sb-input`, …) and the close button cannot be clicked. Head: 32/32 BUG-002 checks pass. The existing happy-dom suites for every dialog (bank picker, AI author / scenario / composer, governance 14A/14B, presets 15A, presentation studio 20D1, surface lab 21B) keep passing unchanged. |

## UX-003 — Enterprise teacher grading workspace

| Field | Value |
|---|---|
| Source | `Problems.pdf` pages 2–4 |
| Current actual behaviour | `src/AssignmentReview.tsx` renders every question of the attempt in one long modal (`.review-overlay`), with the student answer and the reference answer in a two-column grid, no filter for pending manual grading, no per-question navigation, and status conveyed mostly by colour. |
| Expected behaviour | Exam-style review of each question (same/adapted renderer as the student exam), trusted reference answer for authorized teachers, correct / incorrect / partial / pending treatments with text + icon, a prominent «يحتاج إلى تصحيح يدوي» filter plus الكل / بانتظار التصحيح / تم التصحيح / إجابة صحيحة / إجابة خاطئة / إجابة جزئية, previous / next navigation, navigator, pending / completed counts, mark + feedback entry, unsaved-change protection, final summary, responsive RTL layout. Server-authoritative grades, existing manual-review semantics, `all` / `firstNAnswered` rules, audit trail and permissions preserved. |
| Affected | `src/AssignmentReview.tsx`, `api/src/functions/assignment-review.js` (GET projection and `saveReview`), `src/review-pro.css`, `src/platform.css`. |
| Fix (PR B) | Presentation-only workspace on top of the unchanged review API: state engine `src/review/reviewQuestionState.ts` (server projection only; pending never incorrect; typed marks provisional), filters with counts incl. the prominent «يحتاج إلى تصحيح يدوي», navigator rail / disclosure, previous / next / next-pending, exam-style choice rendering with the teacher-only key in text, readable choice keys, unsaved-change guard on close. Design record: `docs/enterprise-grading-workspace-ux003.md`. |
| Acceptance tests | `src/review/reviewQuestionState.test.ts` (13), `src/review/reviewWorkspace.ux003.test.tsx` (7, real component + fake API), the 21 pre-existing AssignmentReview suites unchanged; real Chromium `scripts/check-grading-workspace-browser.mjs` 32/32 (desktop / laptop / tablet / phone, hit tests, pointer, keyboard, save round-trip, confirmation on top). |
| Status | in PR — PR B |

## FEATURE-004 — Student notification after a grade change

| Field | Value |
|---|---|
| Source | `Problems.pdf` page 3 |
| Current actual behaviour | `api/src/functions/assignment-review.js` already records an `assignment_reviewed` notification event (`recordEventSafely`, dedupe-keyed) when a save is "meaningful"; the student bell (`src/notifications/*`) lists it. The message does not state the updated grade in the requested form («تم تحديث علامتك في امتحان «…»، وأصبحت علامتك 89/100.»), and the trigger / idempotency / publication-policy behaviour has to be certified against the acceptance list (changed → notify; failed save → none; same grade twice → none; retry → none; unauthorized → none; pending manual grading completed → notify under the publication policy; the notification opens the permitted result). |
| Fix (PR C — #295) | The existing idempotent `assignment_reviewed` event carries the updated `score` / `totalMarks` (own student only, sanitised); the teacher review and the automatic coding grader pass them; the bell reads «تم تحديث علامتك في امتحان «…»، وأصبحت علامتك 89/100.» (+ «(التصحيح لم يكتمل بعد)» / «مع ملاحظة جديدة من المعلم.»). Design record: `docs/enterprise-grade-change-notification-f004.md` (PR C). |
| Acceptance tests | `api/tests/grade-change-notification-f004.test.js` (7 scenarios through the real handlers), `src/notifications/notificationCenter.6d.test.tsx` FEATURE-004 wording. |
| Status | merged — PR C #295 (`7c155ff`), Review Fix 1 `a10075f` applied before merge |

## BRAND-005 / PWA-006 — Tadris+ identity

| Field | Value |
|---|---|
| Source | `Problems.pdf` pages 4–5; approved assets `TadrisPlus_Brand_Assets.zip` (full logo 1254², icon crop 748², icons 16/32/48/180/192/256/512, maskable 192/512). |
| Current actual behaviour | Product name "ExamBank 791381" / "ExamBank" / "ExamBank 2.0" in `index.html`, `public/manifest.webmanifest`, `public/offline.html`, `src/App.tsx` login headings, `src/shell/TeacherAppShell.tsx`, `src/shell/StudentShell.tsx`, `src/pwa/*` install / push cards, `src/meshModels/MeshModel3DView.tsx`, API AI prompts; icons under `public/pwa/` are the old mark. Manifest `id: "./"` and `start_url` / `scope` must be preserved for a safe upgrade of existing installations. |
| Fix (PR D — #296) | `src/brand.ts` as the one source of the visible name; approved icon set under `public/pwa` (RGBA tiles for `any` / favicons 16-32-48, opaque full-bleed maskable 192/512 re-centred at 72 % so 0 px fall outside the circular safe zone, Apple 180); manifest `name` / `short_name` Tadris+, navy theme / background, `id` / `start_url` / `scope` unchanged, icon URLs versioned (`?v=tadris1`); SW offline cache v2; shells, login, install surfaces, offline page, exports and AI prompt context renamed. Design record + migration analysis + device checklists: `docs/enterprise-tadris-branding-pwa.md` (PR D). |
| Acceptance tests | `src/brand.tadris.test.ts` (identity, PNG kinds / sizes, decoded maskable safe-area count, manifest identity); updated pins in brand.10a / serviceWorker.6a / InstallAppCard.6a / StudentShell / StudentPortal.ux7a / TeacherDashboard / teacherIdentity / ux2-shell-foundation; real Chromium on the production build `scripts/check-brand-pwa-browser.mjs` 27/27. Windows / Android / iOS installation not observed in the session — manual checklist handed to the owner. |
| Status | in PR — PR D (#296) |

---

## Evidence conventions

- "Baseline" = `origin/main` at `6a61005244f60173285b0d0a50ed70a118b97527` (PR #292 merged), CI green on that SHA.
- Real-browser evidence is produced by `scripts/check-*-browser*.mjs` scripts with `PLAYWRIGHT_CORE_DIR` and `CHROMIUM_PATH` set (see `docs/development/validation-matrix.md` §5); results and screenshots are written under the script's `HARNESS_OUT` folder, which is git-ignored, and summarised in the PR body.
