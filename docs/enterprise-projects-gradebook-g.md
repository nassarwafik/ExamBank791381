# Projects — professional grade entry (Phases G1–G3)

**Owner direction (2026-10-23).**
- **The request:** in Projects → the students' progress, let the teacher enter each student's data as rows: the topics done, whether
  the student did them, and the grade. The plan has to be professional, the way established programs do it.
- **The plan:** proposed before any code and approved on 2026-10-23 with its five recommendations:

| | Decision |
|---|---|
| D1 | A score typed in the matrix approves the stage when «اعتماد المرحلة عند حفظ العلامة» is on: the same switch as the student profile, ON by default, remembered per device. |
| D2 | One save bar with the unsaved changes marked, not a save per cell. |
| D3 | One track at a time, with all its groups. |
| D4 | The student profile's accordions are replaced by the compact table (G2). |
| D5 | The export carries scores and statuses, not the teacher's notes (G3). |

**The phases.** Each one is a branch and a pull request:
- **G1:** the class matrix.
- **G2:** the compact student table.
- **G3:** export to Excel and the per-cell history.

## What already existed (read from the code before planning)

- **«التقييم الجماعي» → «جدول العلامات» (P4)** was a students × stages grid of **one group**:
  - spreadsheet keys and a paste from Excel;
  - one page save (`score.bulk`, up to 300 items, each with a stale guard);
  - a score never changed a status.
- **The student profile (8C, P8)** saves row by row, with Enter to the next stage and the approve-on-save switch.
- **The server** already supports:
  - a stage done without a score (approved, counted in progress, 0 in the grade, no zero written);
  - `progress.bulk` (one status for up to 300 pairs);
  - all totals computed server-side.
- **What was missing:**
  - one place to enter «منجز» and the grade together across a whole track;
  - the weighted grade beside the entries;
  - column actions and filters;
  - the compact student table, the export and the history (G2, G3).

---

# Phase G1 — The class matrix

G1 branches from `main` `26226fa7` (#429) as `feature/g1-project-gradebook-matrix`.

## G1.1 What the teacher gets

«التقييم الجماعي» → «جدول العلامات» becomes the class matrix. The changes are all in `src/projects/ProjectScoreGrid.tsx`.

**Layout:**
- **The whole track by default.** It opens on «كل المجموعات», with each group's title as a band over its columns. One group can
  still be chosen, as before.

**Each cell:**
- **A score and a «منجز» decision.** Beside the score field is a toggle (✓). Space in the field toggles it too; a score never holds
  a space.
- **Approve on save (D1).** With the switch on, a cell that gets a score shows the approval before saving, and the save approves the
  stage. A cleared score never approves. An explicit decision on the cell wins: a new score can be saved as «not done» with one tap.
  With the switch off, a score never changes a status, exactly as P4.
- **Reopening.** The toggle on an approved stage reopens it to «قيد التنفيذ».
- **States in form:** approved (green), waiting for review (blue), marked by the student (amber), unsaved (border), invalid (dashed).

**Column and row tools:**
- **The column menu (⋮).** It offers: mark the stage done for the students shown; fill their *empty* scores with one value (a dialog,
  0–100, Arabic digits accepted; a saved or typed score is never overwritten); clear their scores. Each only creates unsaved changes
  for review: nothing is written before «حفظ العلامات», and «تجاهل التغييرات» undoes all of them.
- **Filters:** الكل / بانتظار الاعتماد (a stage ready for review or marked by the student) / بلا علامة (a stage without a score).
- **The end of every row** shows the server's progress · grade, re-read after each save. The matrix never computes a grade.

**Saving and leaving:**
- **One save bar (D2):** «حفظ العلامات (N)», where N counts the changed cells, scores and decisions together.
- **Leaving** with unsaved changes (a «منجز»-only change included) asks first, as before.

## G1.2 How a save writes

The save makes these requests, in order. The existing actions are reused, so there is no new endpoint:
1. **`score.bulk`** with every changed score, in chunks of 300. Each item carries the score the matrix showed (`expected`), so a
   cell another write changed meanwhile is refused as stale, keeps the teacher's value and names the server's.
2. **`progress.bulk`** with `status: "approved"` for the cells to approve, then with `status: "in_progress"` for the cells to reopen,
   in chunks of 300. **A cell whose score failed sends no status**: its whole change stays for the retry.

**The authority rules** are those of every other write:
- the teacher's tenancy;
- class membership;
- an active stage;
- an archived class is read-only;
- a repeated write changes nothing (`noChange`).

After a status write, the workspace re-reads the global «بانتظار الاعتماد» counts (`onReadyChanged`).

**The board read** (`GET resource=board`) gains one field per student: `summary: { overallProgress, grade }`.
- It is computed by the same `core.buildStudentSummary` → `performance.buildProjectPerformanceSummary` pair as the student cards
  (`resource=students`), so the two always agree.
- It is additive. The P1 / P4 tests are unchanged and pass.

**The switch is shared.** It moves to `src/projects/approveOnSave.ts` and is read by the student profile and the matrix: one key,
`eb.projects.approveOnSave`, ON unless set to `"0"`.

## G1.3 Safety rules kept

- **The server alone computes** progress and the weighted grade.
- **An empty cell is never a zero.** «منجز» without a score is an approval with no score written.
- **A cleared score never approves.**
- **Writes are idempotent and stale-guarded.** A failed score never lets its approval through.
- **The archived class** shows scores and ✓ with no input, toggle, menu or save bar.

## G1.4 Usability details found in the browser

- **A cell under a sticky column.** At 390 px with touch, the «منجز» toggle and the score field are 44 px targets, so cells are
  wider. A cell the keyboard moved to could slide under the sticky student column, where a tap reached the column, not the cell. The
  scrolling region now keeps room for the sticky header and columns (`scroll-padding`), so a focused or scrolled-to cell stays
  clear of them. On a phone, the totals column scrolls with the grid instead of sticking, so the cells keep their width.
- **A gap under the group bands.** The band row now has a fixed height, and the stage header sticks exactly under it, so no row
  shows through while the grid scrolls.

## G1.5 Edit set

- **`src/projects/ProjectScoreGrid.tsx`:** the matrix.
- **`src/projects/scoreGrid.ts`:** `gridStatusChanges` (which cells a save approves or reopens) and `gridRowMatches` (the filters),
  as pure functions.
- **`src/projects/approveOnSave.ts`** (new): the shared switch. **`src/projects/ProjectStudentDetail.tsx`** reads it.
- **`src/projects/ProjectBulkReview.tsx`:** `BoardStudent.summary`, and `onStatusChanged` wired to `onReadyChanged`.
- **`api/src/functions/project-tracker.js`:** the board's `summary`.
- **`src/projects-pro.css`:** the matrix styles. They use tokens only (both themes; the dark audit stays at 0) and give 44 px
  targets on touch.
- **`src/projects/projectGradebookMatrix.g1.test.tsx`** (new).
- **`src/projects/ProjectScoreGrid.p4.test.tsx`:** it now pins the switch **off**, where a score never changes a status. The new file
  pins it on.
- **`scripts/check-project-matrix-browser-g1.mjs`** (new): the matrix in real Chromium.
- **`scripts/capture-visual-baseline-ux-r.mjs`:** a `board` fixture and the `project-matrix` page.
- **`docs/ux-r/visual-changes.json`:** `project-matrix` declared.
- **`api/tests/ux2-shell-foundation.test.js`:** the matrix is added to the pinned list of files that use the shared `ActionMenu`.
  The guard's rule is unchanged: one definition, no copies. It now names one more real user of that menu.
- **`.gitignore`:** `.harness-g1/` (the browser check's output, never committed).
- **This document.**

## G1.6 Evidence

This is a feature, not a defect fix, so fail-first is not required. The new tests were still run against the baseline, to
show that they test the new behaviour and not something that already existed.

- **On `main` `26226fa7`:** `src/projects/projectGradebookMatrix.g1.test.tsx` (copied alone into a detached worktree of the
  baseline) fails **13 / 13**. For example:
  - `s1: expected undefined to deeply equal { overallProgress: 10, grade: 4 }` (the board has no summary);
  - `gridStatusChanges is not a function`;
  - `Unable to find an accessible element with the role "switch" and name "اعتماد المرحلة عند حفظ العلامة"`.
- **On the head:** 13 / 13 pass.
- **The existing tests are unchanged** except one: `ProjectScoreGrid.p4.test.tsx` now sets the switch **off** in a `beforeEach`,
  because P4's rule «a score never changes a status» now holds with the switch off. The new file pins the switch on. Every P4
  assertion is kept as it was.
- **In real Chromium** (production build, the real handler in process, 390 / 1024 / 1440 px):
  - `scripts/check-project-matrix-browser-g1.mjs`: **34 / 34** checks pass. They cover the whole track and its bands, typing a
    score with the switch on, Space for «منجز», reopening, the column menu, the filters, the save order and the stored
    documents, no horizontal page overflow, and axe (no serious or critical violation).
  - `scripts/check-project-score-grid-browser-p4.mjs` (the P4 gate, unchanged): **37 / 37**.
- **The visual gate** (`scripts/ux-visual-gate.mjs`, base `main` vs head, 210 captures per theme): the only page that changes is
  `project-matrix`, in both themes, and it is declared in `docs/ux-r/visual-changes.json`.

## G1.7 Mutation proof

`$S/mutate-g1.mjs` (scratch, not committed) plants each defect, runs the four suites that cover the matrix
(`projectGradebookMatrix.g1`, `ProjectScoreGrid.p4`, `ProjectApproveOnSave.p8`, `api/tests/project-bulk-review-p1`) and restores
the file byte-for-byte (SHA-256 checked) in a `finally`. `git status` was clean of mutants afterwards.

| Id | Planted defect | Outcome | Killed by |
|---|---|---|---|
| M1 | the board carries no `summary` | KILLED | g1 › the board carries the server's summary; opens on the whole track |
| M2 | the board's grade is not the cards' grade | KILLED | g1 › each student's progress and weighted grade equal the student cards' figures |
| M3 | a new score approves with the switch off | KILLED | p4 › typing … ONE score save; g1 › a new score approves only with the switch on |
| M4 | a cleared score approves | KILLED (after strengthening) | g1 › a new score approves only with the switch on … |
| M5 | an explicit decision does not win over the implied approval | KILLED | g1 › the pure decisions; a cleared score never approves … |
| M6 | «بانتظار الاعتماد» ignores a stage the student marked | KILLED | g1 › filters: waiting = … |
| M7 | statuses are written before the scores | KILLED | g1 › switch ON … THEN the stage approved; a score that fails (stale) … |
| M8 | a status is sent for a cell whose score failed | KILLED | g1 › a score that fails (stale) keeps its approval unsent |
| M9 | Space types into the cell instead of marking it done | KILLED | g1 › switch OFF: Space marks a stage done … |
| M10 | «تعبئة» overwrites saved scores | KILLED | g1 › the column menu creates unsaved changes only |
| M11 | a «منجز»-only change is not unsaved work | KILLED | g1 › a «منجز»-only change is unsaved work |
| M12 | the matrix keeps its own switch, not the profile's | KILLED | g1 › turning the switch off here turns it off for the student profile too |
| M13 | an archived class shows the «منجز» toggles | KILLED | p4 › an archived class …; g1 › an archived class … |
| M14 | the «بانتظار الاعتماد» counts are not re-read after a status write | KILLED | g1 › switch OFF: Space marks a stage done … |

**M4 survived the first campaign.** Both tests of a cleared score cleared a stage that was already approved, so the «not yet
approved» condition hid the planted defect.
- **The fix:** the pure test now also clears a scored stage that is still «قيد التنفيذ».
- **The re-run:** M4 alone is then **KILLED**.

No timeouts. **14 / 14 killed.**

## G1.8 Local validation

These were run on the final tree of the branch.

**The root suite** (`npx vitest run`): 1211 files, **14439 / 14440** tests pass.
- **The one failure** is unrelated to this phase: `src/AppEvaluationFinish.9g.test.tsx` › «G3/G5 the last student (s4) …» timed out
  at 5000 ms.
- **The same file times out on `main` `26226fa7`** in this container. Run alone four times on each side:
  - on `main`, three of the four runs failed by timeout;
  - on the head, also three of the four failed.
- **It passed** in the branch's previous full run, and it passes on `main` in CI.
- Per `AGENTS.md` §12 it is not patched here, and the exact-head CI decides.

**The two guards** that failed in the previous full run were caused by this phase and are fixed:
- `api/tests/ux2-shell-foundation.test.js`: the ActionMenu users list, see the edit set.
- `src/shell/sidebarContentSpacing.guards.test.ts`: the phone rule now uses the logical shorthand
  `scroll-padding-inline: 10rem 0`, with the same computed values.
- Both files pass, 69 / 69.

**Static checks:**
- `npm run lint`: 0 errors, and no warning in a file this phase adds.
- `npx tsc -b`: clean.
- `npm run build`: the bundle guard passed.
- `git diff --check`: clean.

**Theme checks:**
- `node scripts/ux-dark-audit.mjs`: 0 unanswered in 102 sheets.
- `node scripts/ux-color-inventory.mjs`: 719, unchanged.

**Real Chromium:**
- `check-project-matrix-browser-g1.mjs`: 34 / 34.
- `check-project-score-grid-browser-p4.mjs`: 37 / 37.

**The visual gate** (210 captures per theme, base `main` vs head): light **PASS** and dark **PASS**. The only change is the
declared `project-matrix`.

**Not run:** the Runner suites, because nothing under `runner/` and nothing in official grading changed.

## G1.9 Known limitations and what comes next

- **The browser checks do not run in CI.** The project browser checks (P4 and the new G1) run locally; they are not referenced by a
  workflow, like the other project browser scripts. Wiring them into CI is a governance change, proposed for its own small pull
  request.
- **Coming next:**
  - **G2:** the compact student table replaces the profile's accordions.
  - **G3:** the export of scores to Excel and the per-cell history.
