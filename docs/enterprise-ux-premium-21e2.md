# Phase 21E.2 — Enterprise teacher workspace and structured exam builder UX

Design record for Phase 21E.2 (Tadris+ — التعليم المتكامل). It builds on the 21E.0 audit, roadmap and quality gates in
`docs/enterprise-ux-premium-21e.md` (§3 findings T-2 … T-9, §5 roadmap row 21E.2, §8 gate) and on the 21E.1 records
(`docs/enterprise-ux-premium-21e1.md`, `docs/enterprise-ux-premium-21e1-slice2.md` once PR #300 is merged). It follows the
owner's Design Excellence Standard and Visual Quality Gate. Independent review required. Owner merge only.

> **Status of this record:** part 1 of the phase, proposed for review while PR #300 (21E.1 slice 2) is open. Every item that
> does not depend on #300 is implemented, tested and certified below, together with the premium workspace pass (W). The builder
> integration (A toolbar wiring, B overlay dialog, D inline issues, E section reorder names, F builder save labels) edits #300's
> files, so it ships as a separate follow-up PR after #300 merges into `main` (§9); it is prepared and tested, not included here.

## 1. Baseline, branch and dependencies

| Item | Value |
|---|---|
| Baseline (`origin/main`) | `b8a65f16a2877a99a4adf4f24c74cb7687f7ae41` — merge of PR #299 (21E.1 slice 1) |
| `main` moved | to `4907255177f7625d7cb9f9e31e4594519447dd6d` (PR #301, a Runner test only); reconciled by the normal merge `11d91ea`, no conflicts |
| Branch | `feature/phase-21e2-teacher-enterprise-ux` (normal commits only; no rebase, no force-push) |
| Open dependency | PR #300 (21E.1 slice 2, head `dd795f3`): it edits `StructuredExamBuilder.tsx`, `ExamSectionEditor.tsx`, `structured-builder.css`, `App.tsx`, `design-tokens.css`, `ConfirmDialog.tsx`, `ExamCoverEditor.tsx`, `TeacherAppShell.tsx`, `IconButton.tsx`, `.gitignore`, `api/tests/ux2-shell-foundation.test.js` |
| Files shared with #300 that this branch already changes | `.gitignore` (two harness-output lines; union-merge) and `api/tests/ux2-shell-foundation.test.js` (one entry added to the ActionMenu-importer pin: the new toolbar imports the shared primitive). Reconciled by a normal merge keeping both sides; no assertion is loosened |
| Parallel window | Phase 21E.3 (student exam) — no file of it is touched |

## 2. Scope

Teacher-facing only: the structured builder and its overlay, the teacher authoring editors, the teacher dashboard, the
gradebook and result exports, teacher-specific UI components, and the visual pass on the teacher workspace (dashboard, today hub,
navigation). Not changed: grading semantics, exam JSON schemas, question
version families, API contracts, authentication, storage, SmartSim / chemistry / presentation engines, student-exam files.

## 3. Acceptance criteria (21E.0 §8 gate for 21E.2, refined by the phase instruction)

| # | Criterion | Evidence | Status |
|---|---|---|---|
| A | Builder toolbar ≤ 8 visible actions at 1280 px with an overflow menu; icons, not emoji; keyboard, Escape, focus return; responsive at 1280×900 / 853×600 / 640×450 / 390×844; not sticky on short viewports | `builder/BuilderToolbar.21e2.test.tsx`; Chromium `PART=builder` | component + tests done; wiring after #300 |
| B | Builder overlay is a true dialog surface: `role="dialog"`, title, focus containment, Escape through the unsaved guard, focus return; safe with nested dialogs / menus | `ui/useModalSurface.21e2.test.tsx`; Chromium | hook + tests done; wiring after #300 |
| C | ≥ 5 high-usage editors on the shared Field frame with `aria-invalid` / `aria-describedby` | `fieldFrame.21e2.test.tsx` (19) | **done** |
| D | Issues next to their question with a live region; summary click reveals the question below the sticky toolbar | `builder/inlineIssues.21e2.test.tsx`; Chromium | building blocks done; wiring after #300 |
| E | Reorder buttons name the section / question they move | `builderIconButtons.8e7.test.tsx` | questions **done**; sections after #300 |
| F | One save-label table (guard on the listed strings) | `teacher/saveLabels.guard.21e2.test.ts` | **done** outside #300 files; builder + App.tsx after #300 |
| G | Gradebook / assignment-results CSV export reusing `reports/csv.ts` | `teacher/teacherExports.21e2.test.ts`, `AssignmentsPanel.export.21e2.test.tsx`, Chromium downloads | **done** |
| H | Dashboard charts carry an accessible data table without changing analytics | `TeacherDashboard.chartTables.21e2.test.tsx`, Chromium | **done** |
| W | Premium teacher workspace: consistent tiles, accents, elevation and states; Arabic-first type; phone layouts; no data change | `premiumWorkspace.21e2.test.tsx` (8); Chromium workspace part | **done** |

## 4. Implementation

### G — gradebook and assignment-results CSV

- `src/teacher/teacherExports.ts` (new, pure): `gradebookCsvRows`, `assignmentResultsCsvRows`, `csvDateTime`, `maskedStudentCode`,
  `exportFilename`. Encoded and downloaded only by `src/reports/csv.ts` (`downloadCsv`: UTF-8 BOM, CRLF, every cell quoted,
  formula-injection guard on the first meaningful character).
- «تصدير سجل العلامات (CSV)» in the gradebook (`assignments/Gradebook.tsx`, wired in `AssignmentsPanel.tsx`): **every** student of
  the authoritative results, not the searched / filtered subset; disabled while busy or empty.
- «تصدير نتائج الواجب (CSV)» in the dashboard assignment drill (`TeacherDashboard.tsx`).
- Stable columns (exported constants); rows ordered by Arabic name, then code, then id (independent of the on-screen sort);
  a missing value is an empty cell, never `0` / `NaN`; local `YYYY-MM-DD HH:mm` timestamps.
- **Privacy.** The student code is the national identity / login number (`manage-students`: `code = identityNumber`). A file never
  carries it in full: the gradebook export carries «•••••» + its last four characters (the dashboard's `maskIdentity`; a text
  cell, so spreadsheets keep leading zeros), the dashboard drill (which shows no code) exports none. Never exported: answers,
  answer keys, teacher feedback, attempt epochs, internal ids. No data leaves the browser; no API change.

### H — accessible dashboard charts

- `src/ui/ChartCard.tsx` gains two additive props: `empty` (plain-text empty state instead of figure + table) and `after`
  (content rendered after the figure, outside `role="img"`). Existing consumers (reports, projects) are unchanged.
- `src/teacher/dashboardChartTables.ts` (new, pure): for each of the five charts the SAME text summary as before (now the
  figure's accessible name) and a data table built from exactly the series the chart draws (trend: points with an average;
  topics: the ten plotted). `fmtPct` moved here unchanged.
- `TeacherDashboard.tsx`: the five chart articles are ChartCards; chart components only draw the canvas; the class picker is an
  operable list outside the figure. Chart.js datasets, KPI totals and the existing analytics CSV are byte-for-byte unchanged
  (the existing `TeacherDashboard.test.tsx` parity tests pass unmodified).

### C — the shared Field frame on five editors

- `src/ui/Field.tsx` (`Field`, `FieldGroup`), `src/ui/fieldContext.ts`, `src/ui/field.css` (lazy, token-only): visible label bound
  to the control, optional help, inline error; `aria-describedby` = help + error, `aria-invalid` only while the error is shown.
  An error shows after the teacher leaves the field, when the question reveals its issues (`FieldRevealContext`), or always on
  request. `touchKey` resets the visited state when a row list changes size (rows stay mounted, focus stays).
- Field messages come from `src/teacher/questionFieldIssues.ts`, which mirrors the canonical rules (EMPTY_TEXT, MARKS_PROBLEM,
  MISSING_OPTIONS, MISSING_ANSWER, MISSING_FIELDS, MATCH_INCOMPLETE_PAIR) or calls the canonical `numericResponse` validator. A
  parity test enumerates inputs and proves a field is invalid exactly when the finalization rule fires.
- The five editors, selected by measured usage (library `api/src/data/exam-library`: multipleChoice 550, matching 40,
  open/shortAnswer 17; fixtures: numericResponse 15; every question has the header): **question header** (text, marks, display
  number), **multiple choice**, **matching**, **short answer**, **numeric response**.
- **Compound freeze.** `compoundFreeze.20d` F-12 pins the compound@1 part editors' DOM ("never a test to update"). The frame is
  therefore opt-in: `QuestionComposer` receives `framed` from the structured builder only, and passes it to the body editor;
  compound / composite parts and the Live Challenge composer keep their markup byte-for-byte.
- Saved data representation is unchanged: the framed editors emit the same patches as the legacy adapter.

### F — one save vocabulary

- `src/teacher/saveLabels.ts`: `saveDraft` «حفظ مسودة», `saveExam` «حفظ الامتحان» (legacy flat editor), `saveChanges`
  «حفظ التغييرات», `finalizeExam` «اعتماد نهائي», `saveGradingDecision` «حفظ واعتماد التصحيح», `saveExtension`, `saveReopen`,
  `saving` «جارٍ الحفظ…». Distinct operations keep distinct labels; an approval keeps «اعتماد».
- Applied to: grading review, assignment dialogs (max attempts, timing — a bare «حفظ» became «حفظ التغييرات»), gradebook row
  editors, student dialogs and forms («حفظ التعديلات» → «حفظ التغييرات»), bank question form, project stage settings.
- Guard `src/teacher/saveLabels.guard.21e2.test.ts`: the listed literals may not appear elsewhere in teacher UI source (JSX text
  or a whole quoted string, optionally after an icon glyph). Reviewed exceptions: the compact per-stage score button (contextual
  aria-label); the two shared SmartSim answer workspaces. **Temporary:** the builder and `App.tsx` sites until #300 merges.

### E — contextual reorder names (part)

- Question reorder: «نقل السؤال N للأعلى / للأسفل» (N = the display number, else the position). Framed MCQ options and matching
  pairs name the option / pair they act on. Disabled states and ordering semantics unchanged.

### A / B / D — building blocks ready for the builder integration

- `src/builder/BuilderToolbar.tsx` + `builder-toolbar.css`: identity row (exit, title, counts, status chips) and an action row with
  at most eight buttons — exit, undo, redo, «إضافة أسئلة» (menu), preview, «المزيد» (menu), save draft, finalize. Labels collapse to
  icons below 768 px (names kept, 44 px targets). Sticky only at ≥ 768 px wide **and** ≥ 600 px tall.
- `src/ui/useModalSurface.ts`: focus into the labelled surface, Tab wraps, Escape calls the caller's exit path (the unsaved guard
  decides), every key is left to an `aria-modal` layer stacked above, focus returns to the opener.
- `src/builder/issueIndex.ts`, `InlineIssues.tsx`, `useIssueAnnouncer.ts`, `builder-issues.css`: the finalization decision's own
  issues regrouped by question / section / exam (never re-validated), a per-question labelled list with a text severity, and a
  polite announcement on settled count changes only.
- `src/ui/ActionMenu.tsx`: Tab from a menu item closes the menu and continues after the trigger (wrapping inside a modal scope);
  `.eb-menu-panel` paints at `calc(var(--eb-z-modal) + 1)` so a menu opened inside the builder overlay is visible.
- `src/icons.tsx`: `IconUndo`, `IconRedo`, `IconSave`, `IconCompass`.

### W — premium teacher workspace (dashboard, today hub, navigation)

Token-only CSS plus two markup additions; no value, name, order or data source changes.

- `ui/StatCard.tsx`: an optional decorative `icon` (an `aria-hidden` chip beside the label). Without it the markup is unchanged
  (pinned). The tone accent is a straight 3 px `::before` bar along the top edge, clipped by the radius; the coloured
  inline-start border used to bend round the rounded corners.
- Dashboard (`TeacherDashboard.tsx`, `dashboard-pro.css`): the four headline KPIs carry icons. The three secondary KPIs become
  compact rows (label and hint at the start, value at the end). Attention cards get the same straight accent bar. Elevation and
  spacing are unified. On phones the headline tiles sit in two columns.
- A CSS leak is fixed in scope: `assignments-pro.css` sets every `.eb-stat-grid.is-secondary` to two columns on narrow screens,
  squeezing the dashboard's third tile. The dashboard scopes its own one-column rule; `assignments-pro.css` is untouched.
- Today hub (`TeacherTodayHub.tsx`, `teacherToday.css`): the six quick actions are an even tile grid (2 / 3 / 6 columns) with tinted
  icon chips, replacing a ragged wrap of outline buttons. The 44 px phone target pin is kept.
- Navigation (`shell.css`): the active destination is a tinted pill with a 3 px inline-start indicator. The solid primary stays as
  the fallback where `color-mix` is unsupported. The sidebar has a quiet depth gradient; page and section titles are bold.

## 5. Alternatives considered

| Decision | Chosen | Rejected and why |
|---|---|---|
| Field frame vs compound freeze | opt-in `framed` from the structured builder | recapturing the F-12 digest (an owner-authorized act only; compound@1 must not move) |
| Field validation source | field view of the canonical rules + parity test | a second validator (could disagree with finalization) |
| Identity in exports | mask in the gradebook, drop in the drill | export in full (privacy), drop everywhere (homonyms become indistinguishable) |
| Menu layer | `calc(var(--eb-z-modal) + 1)` | a new `--eb-z-popover` token now (`design-tokens.css` is edited by #300; can follow after the merge) |
| Overlay dialog | a hook on the existing full-screen overlay | moving the builder into the `Dialog` card primitive (a page-sized editor, its own scroll container and toast layer) |
| Toolbar semantics | a labelled `group` of buttons + two disclosure menus | `role="toolbar"` (implies a roving-tabindex arrow-key model the builder does not implement) |

## 6. Evidence (head before the #300 integration)

- **Full root suite:** 929 files, 12,054 tests passed (baseline `b8a65f1`: 920 files, 11,991 tests).
- **Lint** 0 errors, 125 warnings (= baseline 125); `tsc -b` clean; `git diff --check` clean.
- **Bundle:** initial JS 110.1 → 110.2 KB gzip (+64 B: the preload manifest naming the new lazy chunks; no new code in the
  initial graph); initial CSS 34.9 → 35.0 KB gzip (the menu layer rule and two small rules in always-loaded sheets); the Field,
  toolbar and issue styles are lazy.
- **Fail-first:** the changed and new tests copied into a detached worktree of `b8a65f1`: 25 failed / 88 passed (new modules fail
  at import on the baseline); all pass on the head.
- **Mutation:** `scripts/mutate-21e2.mjs` — 38 mutants, **38 KILLED**, 0 survived, 0 timeouts, sources SHA-256 restored. The
  first run (29 mutants) left 2 survivors, which became two new tests.
- **Chromium** (`scripts/capture-visual-gate-21e2.mjs PART=results`, production build, real teacher routes, local API mock): 28/28
  at 1280×900, 853×600 @1.5, 640×450 @2, 390×844 touch — chart tables by keyboard, both CSV downloads (bytes, BOM, header, masked
  identity, formula guard, no private fields), touch targets, no horizontal overflow; 0 page errors.

**Workspace pass (W) and the reconciled head `6514f1a`:**

- **Fail-first:** `premiumWorkspace.21e2.test.tsx` fails 7 of 8 on `11d91ea`. The eighth test pins the unchanged StatCard markup
  without an icon.
- **Chromium** (`scripts/capture-visual-gate-21e2-workspace.mjs`, production builds, the same four viewports): 28/28 checks on this
  build, 8/28 on `main` (the new rules are absent), 0 page errors. Checks cover:
  - KPI and quick-action column counts per viewport;
  - straight accent bars;
  - four `aria-hidden` icons;
  - the tinted active navigation with its indicator;
  - no horizontal overflow.
- **Full validation** on the tree of `6514f1a` plus this record:
  - root suite 930 files, 12,062 tests passed;
  - lint 0 errors, 125 warnings (baseline); `tsc -b` clean; `git diff --check` clean;
  - build and bundle guard pass: initial JS 110.2 KB gzip, initial CSS 35.4 KB gzip (+0.4 KB: the workspace rules in
    always-loaded sheets).

## 7. Independent adversarial review of the first implementation

Six reviewers (CSV, chart tables, Field frame, save vocabulary, modal surface / toolbar, CSS), two skeptics per finding.
Confirmed and fixed: identity number in the drill CSV (P2); leading-zero loss in Excel (P3); framed option / pair inputs shrank
to ~250 px (P2, measured in Chromium); visited state moved to another pair after a delete (P3); visited state survived a type
change (P3); numeric format hint attached to the unit field (P3); Live Challenge showed exam-finalization errors (P3); toolbar
menus would open under the builder overlay (P1); «تنبيه:» broke mid-word (P3); icon-only undo / redo 38 px on phones (P3).
Plausible and fixed: MCQ with no options hid MISSING_OPTIONS; the save guard skipped whole folders; Tab left an open menu.
Refuted findings that still pointed at the later wiring were fixed proactively (gated finalize hover contrast, open-menu state,
Escape while saving — to be gated in the wiring).

## 8. Risks and limitations (so far)

- The builder integration is not done until #300 merges; the 200 % / toast case, the dialog surface and inline issues are
  certified only after that.
- `useModalSurface` relies on every layer above the builder being `aria-modal` (true for Dialog, ConfirmDialog, the preview, all
  lazy panels) or an ActionMenu.
- The masked identity keeps the last four characters; two students with the same name and the same last four digits remain
  ambiguous in the file (they are unambiguous on screen).
- The Field frame covers top-level questions of the five editors; compound / composite parts keep the frozen markup.
- W: the tinted navigation pill needs `color-mix` (all current evergreen browsers). Older engines keep the previous solid pill.
  The unscoped `assignments-pro.css` rule stays as it is; only the dashboard is protected from it.
- W was reviewed by its author only (the per-slice delivery of the owner's sprint); it changes no behaviour.

## 9. Part 2 — the builder integration (follow-up PR, branch `feature/phase-21e2b-builder-integration`)

Built on part 1 after #300 merged: part 1's branch was reconciled with `main` `31f4008` by the normal merge `aa3f0ca` (one
`.gitignore` union). Part 2 starts from `aa3f0ca`.

### What is wired

- **A — toolbar.** `StructuredExamBuilder` renders `BuilderToolbar`:
  - the visible actions are exactly «رجوع» · «تراجع» / «إعادة» · «إضافة أسئلة» (menu) · «معاينة الامتحان» · «المزيد» (menu) · save
    draft · finalize;
  - the menus hold the same handlers as before: «إضافة أسئلة» has the bank and the AI authoring entries; «المزيد» has the
    explorer, blueprint, coverage, policy, readiness, governance, presets, studio and surface lab;
  - the blueprint count badge, save state, final, media wait and gates stay visible as status text;
  - #300's delete / «تراجع» / toast / focus reveal are unchanged (their suites pass, updated only to open the menu that now holds
    a tool).
- **B — overlay dialog.**
  - App's `.structured-builder-overlay` is `role="dialog"` + `aria-modal`, named by the toolbar's heading (`sb-builder-title`).
  - `useModalSurface` moves focus in, wraps Tab, and returns focus to the opener.
  - Escape takes the existing exit path, so the unsaved-changes guard decides. **While a save is in flight Escape does nothing**,
    like the disabled «رجوع»; the first wiring missed this, and the new test caught it.
  - A menu, dialog or toast above the builder keeps Escape for itself.
- **F — save labels.**
  - The builder's draft / finalize / saving labels and App's legacy save button read `SAVE_LABELS`.
  - The guard's three temporary "pending #300" exceptions are removed.
- **Tests.**
  - `src/builder/toolbarTestActions.ts` (test-only) reaches a tool the way a teacher does: open the menu, find the item. Absence
    checks open both menus, so a closed menu cannot pass vacuously.
  - Sixteen builder, governance, AI, preset, scenario and surface-lab test files use it. No expectation was loosened: a test that
    clicked «📚 …» on the toolbar now clicks the same item in its menu.
  - Three more (`media`, `mediaSave`, `reliability`) change only exact button names, which lost their emoji («👁 معاينة الامتحان» →
    «معاينة الامتحان», «💾 حفظ مسودة» → «حفظ مسودة», «✓ اعتماد نهائي» → «اعتماد نهائي», «→ رجوع» → «رجوع»).
  - `GovernancePanel.14b` (AGENTS.md §12's documented timing-sensitive file) changes only in how it opens the governance panel,
    which now sits in «المزيد». Its 409 conflict-alert test is untouched.
  - New: `src/StructuredExamBuilder.toolbarWiring.21e2b.test.tsx` (9 tests), for the eight actions, the menu placement, the named
    dialog, Escape (nothing unsaved / unsaved / saving / inside a menu) and the save labels.
  - One test (`coverage` › accessibility) asserted focus returning to the opener: the opener is now the «المزيد» trigger, as the
    ActionMenu contract says.

### Not in part 2 (still open)

- **D — inline issues** next to their question, with a live region and summary links. The building blocks shipped in part 1, but
  wiring them changes the finalization panel; this needs its own slice.
- **E — section reorder names.** Question reorder names shipped in part 1.

### Evidence

Measured so far (the full exact-head evidence goes in the PR):

- `src/StructuredExamBuilder.toolbarWiring.21e2b.test.tsx`: 9/9 on this branch; **9/9 fail on `aa3f0ca`** (no wiring). "Escape
  while saving" also failed on the first wiring (`onExit` called once) before the gate was added.
- Builder-related suites (builder, AI authoring / composer, scenario, presets, governance, function surfaces, App) pass; lint 125
  warnings (baseline), 0 errors; `tsc -b` clean.
- Chromium `PART=builder` on the scratch build: 40/40 checks against 10/40 on the #300 build. Toolbar height: desktop 300 → 106 px,
  150 % 350 → 106 px; not sticky at 200 % and on phones.

## 10. Premium Visual Redesign — slice 1: the structured exam builder

Owner direction (2026-10-12): visible, high-quality UI before 2026-10-14, presentation only, with a resource-efficient workflow.
This slice is stacked on part 2 (`c932f318`), because it styles the same builder.

**What changed** (one new sheet, `src/builder/builder-premium.css`, imported last by `StructuredExamBuilder.tsx`; no markup, behaviour,
exam JSON, grading, persistence or engine change):

- **Canvas:** a tinted page (`--eb-primary-050` → `--eb-bg`) with the builder in a centred column (max 1200 px), so cards read as
  cards.
- **Toolbar:** a floating glass bar. The exam title reads as the page heading (20 px bold) and stays identifiable as a field:
  - at rest, a dashed underline in `--eb-placeholder`, 4.76:1 (WCAG 1.4.11; the old full border was 1.4:1);
  - on hover and focus, the full border.
- **Sections:** the primary card. Each has a header band, a 4 px accent edge on the start side, a filled «القسم n» badge and a
  24 px section title (same underline rule).
  - The grading rule is a panel: segmented choices plus an info callout for the rule's explanation.
- **Questions:** lighter nested cards with a header strip, a 32 px gradient number badge and quiet icon buttons.
  - Icon buttons are 36 px, and 44 px on touch screens (`pointer: coarse`).
  - The meta row (number, marks, section) sits in a compact panel.
- **Question-type summary (`qt-meta`)** is now a chip row. `questionTypes.css` is not loaded in the builder chunk, so on every
  question the type, version, grading mode and capabilities rendered as a bare `<dl>` list (visible in the BEFORE capture).
- **Secondary actions** are tonal pills, no longer dashed: dashed read as "draft / unavailable". «+ إضافة قسم» is a full-width
  drop-zone card.
- **Phones and 200 % zoom:** tighter padding and smaller headings. Reduced motion removes transitions; forced colours keep the
  accent and field borders.

**What it must never do** (pinned by `src/builder/builderPremium.21e2p1.test.ts`, 11 tests):

- pad the overlay, since the 21E.1 slice 2 toast reserve owns `padding-block-end`;
- position the toolbar;
- drop the card focus outline;
- clip card content;
- use literal colours or physical left / right.

Three planted defects confirm the guards bite: overlay padding, toolbar `position`, and the focus outline. Each was KILLED, with
the file restored byte-for-byte.

**Evidence** (local, this head):

- **Chromium harness** `PART=builder`: 40/40 checks on both BEFORE (`c932f318`) and AFTER builds, at 1280×900, 853×600 @1.5,
  640×450 @2 and 390×844 touch; 0 page errors.
  - Dialog, menus, Escape guard, toast placement, sticky rule and overflow are unchanged.
  - Screenshots are not committed (harness output stays out of git, AGENTS.md §5); before / after composites are attached to the
    PR.
- **Static checks:** `tsc -b` clean; lint 125 warnings (baseline), 0 errors; `npm run build` with the bundle guard passed;
  `git diff --check` clean.
- **Full root suite** (2 CPUs, container TZ `Asia/Jerusalem`): 12,302 / 12,308 passed. The six failures are environmental and
  were all reproduced or cleared:
  - four student save-time assertions expect UTC and pass with `TZ=UTC`, as CI runs;
  - `phase8b` passed on re-run;
  - `surfacePlotUi.21da4` › rotate / zoom times out at 5 s on this machine **on the baseline as well** (5.6 s, 5.3 s).
  - Exact-head CI is the arbiter.

**Also in this slice** (documentation only):

- the 21E.1 slice 2 record's contrast table listed four old `--eb-muted` ratios against the wrong tokens (erratum with the
  recomputed values);
- the plan records the owner's ratification at the merge of #300: the `--eb-muted` value-change rule and F3 open-when-instructions.
  F3's code is unchanged.

**Next slices** (each separately reviewable):

1. the question editors' inner forms (options, tables, media);
2. the navigator and finalization panels;
3. the teacher dashboard and lists in the same visual language.
