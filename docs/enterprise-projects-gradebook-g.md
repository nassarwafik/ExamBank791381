# Projects — professional grade entry (Phases G1–G3, G4b, G4)

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
  - **G2:** the compact student table replaces the profile's accordions — delivered below.
  - **G3:** the export of scores to Excel and the per-cell history.

# Phase G2 — The student's stage table

G2 branches from `main` `b8ae5869` (#430) as `feature/g2-project-student-table`.

## G2.1 What the teacher gets

«تقدّم الطلاب» → a student's profile. The collapsible stage sections are gone (D4). The stages of the selected track are **one
table**, with each group as a section row that counts its approved stages («n/N منجزة»). The columns are
الموضوع | منجز؟ | العلامة من 100 | الموزونة | الحالة | ⋮. The changes are all in `src/projects/ProjectStudentDetail.tsx`.

**Each row is a matrix cell (G1), for one student:**
- **A score and a «منجز» decision.** The toggle (✓) marks the stage done or reopens it; Space in the score field toggles it too.
- **Approve on save (D1).** With «اعتماد المرحلة عند حفظ العلامة» on (the same shared switch, ON by default, remembered per
  device), a typed score shows the approval before saving and the save approves the stage. A cleared score never approves. An
  explicit decision wins. With the switch off, a score never changes a status (the 8C / 9B rule).
- **A stage the student marked** shows ✓ and «حدّدها الطالب». A typed score confirms it (the P8 rule); the toggle left on writes
  nothing; turned off, it reopens the stage.
- **The weighted value** («الموزونة») is the server's `performance.stageValues` — contribution / maximum, with «عند الاعتماد»
  while the score is not counted. The table never computes a value or a grade.
- **The status** column keeps the badge and the «حدّدها الطالب» badge; the row's tint follows the status; an unsaved change and an
  invalid value are marked by the field's border and named in the legend, never by colour alone.

**Keyboard:** Enter moves to the next topic (Shift+Enter back), the arrows move up and down, Space toggles «منجز», Escape restores
the row. Nothing is written until the save bar.

**One save bar (D2):** «حفظ التغييرات (N)» — N counts the stages with a change (a score and a decision on the same stage count
once) — and «تجاهل التغييرات». An invalid value blocks the save and is named («صحّح علامة واحدة: العلامة رقم من 0 إلى 100.»). The
notice after a save says what happened: «حُفظت N علامة، اعتُمدت A مرحلة، أُعيدت R مرحلة إلى قيد التنفيذ», and «وتعذر حفظ F
(مُعلَّمة في الجدول)» when a row failed.

**The row menu (⋮ «إجراءات المرحلة»):**
- «التفاصيل والملاحظة»: a dialog with the stage's description, its score, its value in the project and the teacher's note,
  which has its own «حفظ الملاحظة» (a note is never part of the bar).
- «مسح العلامة»: an unsaved change the bar carries («تجاهل التغييرات» undoes it).
- «لم يبدأ» and «جاهز للفحص»: the two workflow statuses the toggle does not cover, written at once.

**Phones:** below 768 px a row becomes a card — the topic, then «منجز» + the score + the menu, then the value + the status — and the
targets are 44 px on touch.

**Unchanged:** the hero, the summary, the evaluation card, the timeline, Evaluation Focus Mode (9E: the focused stage's field
is found by `[data-stage-id] input[data-stage-score]`), the queue (9F), the final-session panel (9G), the sibling navigation with
its unsaved-changes confirmation (P4 — it now counts decisions and notes too), and the archived class: scores and ✓ as text, no
field, toggle, switch or save bar, and the details dialog shows the note as text.

## G2.2 How a save writes

The same order as the matrix (G1.2), over one student:
1. **`score.bulk`** with every changed score, in chunks of 300, each with the score the row showed (`expected`). A stale cell is
   refused by the server, keeps the teacher's value and names the server's on its row.
2. **`progress.bulk`** `approved`, then `in_progress`, in chunks of 300. **A stage whose score failed sends no status.**
3. **`GET resource=student`**: the profile is re-read, so the weighted values, the grade, the evaluation and the history on screen
   are the server's. Then `onChanged`, and `onReadyChanged` after any status write.

A note and the two menu statuses stay the canonical single `progress.update` (`mutationBody`), serialized, double-submit guarded
and bound to the (project, class, student) they were made for — the 8C rules. The component carries only the two bulk action
literals; `mutationBody` builds every single write.

## G2.3 Safety rules kept

- **The server alone computes** values, grades and the evaluation; the table shows what it re-read.
- **An empty cell is never a zero.** «منجز» without a score is an approval with no score written.
- **A cleared score never approves;** an invalid value never leaves the browser.
- **Writes are stale-guarded and idempotent;** a failed score never lets its status through.
- **A save in flight disables the fields and the toggles**, so no edit can race an earlier response (the 8C-2b concern no longer
  has a path for scores; for notes the rule is unchanged and still tested).
- **A save, a note or a status of a previous selection never lands on the current one**, and never leaves its fields disabled.
- **Two activations in one tick send one write** (the save bar keeps a ref beside its state).
- **The archived class** exposes no mutation control at all.

## G2.4 The shared helper

`gridStatusChanges` (`src/projects/scoreGrid.ts`) now treats a student's unconfirmed mark as not yet approved by the teacher
when it decides the implied approval: a score typed on such a stage confirms it (the P8 rule), the toggle left on writes
nothing, and turned off it reopens the stage. The matrix (G1) gets the same behaviour, so the profile and the matrix agree. The
G1 tests are unchanged and pass; the G2 pure test pins the rule.

## G2.4b Layout details found in the captures

- **A flex cell leaves the table.** The first capture showed the status badge under «الموزونة» and the menu under «الحالة»: the
  topic, value and status cells had `display:flex`, which takes a cell out of the table's columns. On desktop they stay table
  cells and their parts are spaced inline; flex is used only inside the phone card, where a row is a grid.
- **The status stripe follows the reading direction.** It was an inset shadow, drawn on the left in RTL (the end of the row). It
  is now `border-inline-start`, so it marks the start of every row in both directions and on the phone card.

## G2.5 Edit set

- **`src/projects/ProjectStudentDetail.tsx`:** the table, the save bar, the row menu and the details dialog. The focus mode, the
  queue and the final panel are unchanged.
- **`src/projects/scoreGrid.ts`:** the confirm rule (G2.4).
- **`src/projects-pro.css`:** the 8C row block is replaced by the G2 table block (tokens only, both themes, 44 px targets, the
  phone card). The dark audit stays at 0 and the colour inventory at 719.
- **`src/projects/projectStudentTable.g2.test.tsx`** (new): 14 tests over the real handler.
- **The migrated suites.** The profile's tests addressed the old markup (a spinbutton per row, a save and an approve button per
  row, the «تفاصيل» disclosure, the status menu, the group's `aria-expanded`). Each is rewritten to the table — a textbox per
  row, the «منجز» toggle, the save bar, the row menu, the details dialog — keeping every invariant that still exists:
  `ProjectStudentDetail.8c` (27 → 26 tests), `ProjectApproveOnSave.p8` (8), `ProjectStudentDetail.focus.9e`,
  `ProjectStudentDetail.queue.9f`, `ProjectStudentDetail.finish.9g`, `projectEvaluation.9b`, `ProjectWorkspace.ux6`,
  `projectPerformance`, `StudentSelfReport.p2`, `ProjectCondensed.p7`, `ProjectScoreGrid.p4` and the `projects.ux-r10` guard.
  Five App-level suites drive the same profile through App and are migrated the same way: `AppEvaluationQueue.9f` and
  `AppEvaluationFinish.9g` (their mocks answer `score.bulk`; the profile reads they count include the one re-read of the same
  student after its save, never a move), `AppProjectsReady.8e`, `AppProjectsReady.ux6` (the ready-count refresh after
  «منجز» + the save bar, never after a score or a note) and `actionMenu.globalFirstClick` (the row menu opens on the first
  click, focus on its first item, no scroll).
- **`scripts/check-project-approve-on-save-browser-p8.mjs`:** the real-Chromium P8 gate, over the table's save bar.
- **`docs/ux-r/visual-changes.json`:** `project-profile` declared.
- **This document.**

### Tests whose subject no longer exists (owner decisions D2 / D4) and what replaces them

| Old test | Why it cannot stay | The invariant that replaces it |
|---|---|---|
| 8C-1 «saving stage A sends score.set … stage B is untouched» | there is no save per row | one `score.bulk` with the changed cell; Escape dropped B's draft; the value, summary and history show after the re-read |
| 8C-1 «approving sends ONLY the status» (the approve button) | the button is the «منجز» toggle | the toggle + the bar send `progress.bulk` without a score |
| 8C-1 «Enter saves that stage and moves focus» | Enter never writes (G2) | Enter moves without writing; the bar sends every draft in one write, in table order |
| 8C-1 «button-save keeps focus on the field» | the fields are disabled during the save | after the save the bar is empty and the field shows the canonical value |
| 8C-2 «an invalid score is rejected by the SERVER» | the table never sends an invalid value | it is caught before any write, named on the row and in the bar; the server's own rejection stays pinned by the API tests of `score.bulk` |
| 8C-2b «score: type 70, hold, edit to 82» | a score field is disabled while its save is in flight | the field is disabled during the save (no edit can be lost); the note case is unchanged |
| 8C-2b «an unchanged draft still clears … an empty draft is not savable» | emptying a saved score is now a clear | emptying a saved score is a change the bar carries (`score: null`, `expected` set) |
| 8C-3 «a switch of project / class drops a queued write» (a queued score) | scores are no longer queued single writes | the same for the queued single writes (the menu statuses) |
| P8 «حفظ واعتماد … ONE progress.update carrying both» | the save is the bar | `score.bulk` then `progress.bulk approved`; the audits are the same two actions |
| P8 «Enter in the score field does the same» | Enter never writes | a `ready_for_review` stage gets the score and the approval in the same save; Enter only moves |
| P8 «the row's save AND approve are busy» | one bar | the field, the toggle, the switch and the bar are busy; a double click sends once |
| 9B G1 «no reload of the profile» | the profile is re-read on purpose (the values are the server's) | exactly one re-read per save |
| 9B G4 «B stays editable while A's save is in flight» | one write for both | A and B ride one write; every field is disabled meanwhile; a second click is guarded |
| P2 «the «تأكيد» button confirms the student's mark» | no confirm button | the stage shows as «منجز» + «حدّدها الطالب»; a typed score confirms it on save (the P8 rule) |
| P7 «اعتماد approves the merged stage» | no approve button | «منجز» + the bar approve it (`progress.bulk`) |
| UX-6a «aria-expanded groups, the status menu, the approve button» | no disclosure, one row menu, the toggle | the group section rows, the row menu's statuses (`progress.update`), «منجز» + the bar (`progress.bulk`) |

## G2.6 Evidence

This is a feature, not a defect fix, so fail-first is not required. The new tests were still run against the baseline, to show
that they test the new behaviour and not something that already existed.

- **On `main` `b8ae5869`:** `src/projects/projectStudentTable.g2.test.tsx` (copied alone into a detached worktree of the
  baseline) fails **14 / 14** — the pure test included, because the confirm rule of G2.4 did not exist. For example:
  - `Unable to find an accessible element with the role "table"`;
  - the pure decisions: `expected [] to deeply equal [ { key: 's|a', … to: 'approved', implied: true } ]`.
- **On the head:** 14 / 14 pass.
- **Two defects found while migrating the 8C suite were fixed before the campaign**, and each has its test and its mutant: two
  activations of the save in one tick sent two `score.bulk` writes (M5), and a save still in flight when the teacher moved to
  another student left the new student's fields disabled (M6).
- **In real Chromium** (production build, the real handler in process, 390 / 1024 / 1440 px):
  - `scripts/check-project-approve-on-save-browser-p8.mjs`: **36 / 36** — the switch ON and its target, a typed score shown as
    «منجز», one `score.bulk` then one `progress.bulk` and the stored document, the switch off remembered and a score-only
    save, no horizontal overflow, axe (no serious or critical violation).
  - `scripts/check-project-matrix-browser-g1.mjs` (the G1 gate, unchanged): **34 / 34**.
- **The visual gate** (`scripts/ux-visual-gate.mjs`, base `main` `b8ae5869` vs head, 210 captures per theme): light
  **PASS**, dark **PASS**. The only page that changes is `project-profile`, declared in `docs/ux-r/visual-changes.json`.

## G2.7 Mutation proof

`$S/mutate-g2.mjs` (scratch, not committed) plants each defect, runs the six suites that cover the table
(`projectStudentTable.g2`, `ProjectStudentDetail.8c`, `ProjectApproveOnSave.p8`, `projectEvaluation.9b`, `ProjectScoreGrid.p4`,
`projectGradebookMatrix.g1`) and restores the file byte-for-byte (SHA-256 checked) in a `finally`. `git status` was clean of
mutants afterwards.

| Id | Planted defect | Outcome | Killed by |
|---|---|---|---|
| M1 | a score typed on a stage the student marked does not confirm it | KILLED | p8 › a stage the student marked …; g2 › the pure decisions |
| M2 | statuses are written before the scores | KILLED | p8 › is visible and on …; a stage waiting for review … |
| M3 | a status is sent for a stage whose score failed | KILLED (after strengthening) | g2 › a score that fails (stale) … |
| M4 | the profile is not re-read after the save | KILLED | p8 › is visible and on …; 8c › saving stage A … |
| M5 | two activations in one tick send two saves | KILLED | 8c › two activations in the SAME tick … |
| M6 | a selection change leaves the previous save's busy state | KILLED | 8c › a slow save for the previous student … |
| M7 | Enter writes instead of moving to the next topic | KILLED | p8 › a stage waiting for review …; 8c › Enter … |
| M8 | Escape does not restore the row | KILLED | 8c › saving stage A … (Escape dropped B's draft) |
| M9 | «مسح العلامة» creates no change | KILLED | p8 › clearing a score never approves |
| M10 | a cleared score approves | KILLED | p8 › clearing a score never approves; g2 › the pure decisions |
| M11 | an archived class shows the score field | KILLED | 8c › 8C-4 archived class … |
| M12 | a typed score approves even with the switch off | KILLED | p8 › the switch OFF …; 8c › saving a score never approves |
| M13 | a save's result lands on another selection | KILLED | 8c › a slow save for the previous student … |
| M14 | the ready counts are not re-read after a status write | KILLED | p8 › is visible and on …; 8c › «منجز» sends ONLY the status |
| M15 | moving to a sibling never asks about unsaved changes | KILLED | p4 › an unsaved score in the profile is confirmed before moving |
| M16 | the save bar does not block an invalid value | KILLED (after strengthening) | g2 › an invalid value blocks the save … |

**Two survived the first campaign.** M3: the stale test's failing cell was already approved, so no status was due for it; the test
now also reopens that cell, and asserts that no `in_progress` write is sent for it. M16: with one invalid cell alone the bar is
already empty, so the mutant was equivalent there; the test now types a valid value beside the invalid one and asserts the bar
stays blocked and nothing is sent. Both are killed alone afterwards. 16 / 16 are killed, with no timeouts.

## G2.8 Local validation

These were run on the final tree of the branch.

**The root suite** (`npx vitest run`): 1212 files, **14455 / 14456** tests pass.
- **The one failure** is unrelated to this phase: `src/AppProjectsReady.ux6.test.tsx` › «status mutation …» cannot find the project
  workspace region within Testing Library's 1000 ms wait, while opening the hub card. That step comes before anything this phase
  changed.
- **The same test fails the same way on `main` `b8ae5869`** in this container (the original file, run in the baseline worktree).
  A temporary local copy with a longer wait, deleted afterwards, passes 3 / 3, including the migrated part. It passes on `main`
  in CI. Per `AGENTS.md` §12 it is not patched here, and the exact-head CI decides.
- **The first full run** also showed the five App-level suites still using the old markup (16 tests). They are migrated (G2.5).

**Static checks:**
- `npm run lint`: 0 errors, and no warning in a file this phase adds.
- `npx tsc -b`: clean.
- `npm run build`: the bundle guard passed.
- `git diff --check`: clean.

**Theme checks:**
- `node scripts/ux-dark-audit.mjs`: 0 unanswered in 102 sheets.
- `node scripts/ux-color-inventory.mjs`: 719, unchanged.

**Real Chromium:**
- `check-project-approve-on-save-browser-p8.mjs`: 36 / 36.
- `check-project-matrix-browser-g1.mjs`: 34 / 34.

**The visual gate** (210 captures per theme, base `main` vs head): light **PASS** and dark **PASS**. The only change
is the declared `project-profile`.

**Not run:** the Runner suites, because nothing under `runner/` and nothing in official grading changed.

## G2.9 Known limitations and what comes next

- **The browser checks still do not run in CI** (see G1.9).
- **A note is its own write.** The teacher's note is saved from the details dialog, not by the bar, so the bar's count never
  includes it; moving to a sibling still asks when a note is unsaved.
- **Coming next — G3:** the export of scores to Excel (without the teacher's notes, D5) and the per-cell history from the row
  menu («سجلّ التغييرات») — delivered below.

# Phase G3 — The export and the history

G3 branches from `main` `19754ab9` (#433) as `feature/g3-project-export-history`.

## G3.1 What the teacher gets

**«تصدير إلى Excel»** sits in the class matrix's controls («التقييم الجماعي» → «جدول العلامات»). It downloads one `.xlsx` file of
the class's saved project scores. The file opens directly in Excel and reads right to left.
- **Heading rows:** the project, the class (with its year) and the export date, then one empty row.
- **One bold column row:** the student, the last four characters of the student code (as every teacher export), then two
  columns per active stage of **every track** — its score from 100 and its status — then the progress % and the weighted grade.
- **One row per student,** in Arabic order.
- **What a cell holds:**
  - A stage with no score is an **empty cell, never «0»**; a saved 0 stays 0.
  - A stage the student marked carries «(حدّدها الطالب)».
  - The progress and the grade are the server's (`summary`); nothing is computed in the browser.
- **What the file never holds:** a teacher note (D5), a full student code, an unsaved draft, a formula.
  - An unsaved change in the matrix is named in the notice: «الملف يحمل العلامات المحفوظة فقط؛ لديك N تغيير لم يُحفظ بعد.»
- **An archived class can still export** (a read).

**«سجلّ التغييرات»** joins the student table's row menu (Phase G2), for active and archived classes. It opens a dialog with every
stored change of that stage, newest first. Each entry is one line in words («وُضعت العلامة 91 / 100», «تغيّرت العلامة من 91 /
100 إلى 93 / 100», «مُسحت العلامة (كانت 40 / 100)», «الحالة: من «لم يبدأ» إلى «تم الاعتماد»», «تأكيد المعلم لما حدّده الطالب»,
«حدّدها الطالب كمنفّذة», «عُدّلت ملاحظة المعلم»). Under it are the date and time, and who made the change: «أنت», «معلم آخر» or
«الطالب». The dialog reads the server each time it opens, so a save since the last opening shows. An empty history says so; a
failed read offers «إعادة المحاولة».

## G3.2 The API (additive)

- **`GET resource=board`** gains `title` (the project), `className` and `schoolYear`, to head the exported file. Nothing else in the
  board changes; it never carried a note.
- **`GET resource=stage-history&classId&studentId&stageId`** (new, a read):
  - **Same gates as `resource=student`:** the teacher's own class enrolled in the project, the student a member of that class
    (404 otherwise). An unknown stage or a missing parameter is a 400.
  - **It works on an archived class** (`readOnly: true` in the body).
  - **It reads the whole document.** It returns that stage's events (at most 200, newest first), so an event older than the
    profile's newest 50 (`STUDENT_HISTORY_LIMIT`) is still listed.
  - **Each event carries only** its type, its time, the status or score it moved from and to, `verified` for a confirmed mark,
    and `by` ("you" | "teacher" | "student"). Another account's id never leaves the server. The history never stored a note's
    text, so none can be returned.
- **The audit of the single-save path.** `progress.update` now records `details.via: "progress.update"` on its
  `project.stage.approve` / `status_change`, `project.stage.note` and `project.stage.score` events. The score actions and both
  bulk actions already named their path, so every change's origin is now known.

**The reviewed golden change (R33).** `api/tests/fixtures/r33-golden.json` pins the route audits of six `progress.update`
scenarios: `G794589.update.approve`, `.status`, `.noteOnly`, `.lazyCreateEmptyClass`, `G899373.update.approve` and
`G883589.update.status`. Their only change is the added `via` (`REFRESHED_BY_G3`). The new invariant B10 asserts that exactly
these entries carry a stage audit, and that each carries `via: "progress.update"`. The status, body and storage of every scenario
are unchanged.

## G3.3 Safety rules kept

- **The server alone computes** progress and the grade; the export copies the board's figures.
- **An empty cell is never a zero.** The export leaves a missing score empty.
- **No private text leaves the tracker.** There are no notes in the board, the export or the history, and no other account's id
  in the history.
- **No write.** Both features are reads; the archived class keeps them.
- **No formula injection.** The shared writer emits text as inline strings and has no formula element (pinned by the G3 suite).

## G3.4 Found in the browser

- **Arabic download names need a UTF-8 locale on the machine.** In this container (`LANG` empty), headless Chromium stored the
  file as «download». With `LANG=C.UTF-8` it keeps «TadrisPlus-علامات-المشروع-….xlsx». The shared assignments exports behave the
  same way, so this is a property of the browser process, not of the page. The G3 browser check launches Chromium with a UTF-8
  locale.
- **A menu opened during a scroll closes.** `ActionMenu` closes on a page scroll (A-F2). Playwright's own scroll-into-view could
  still be moving the page when it clicked the row's ⋮ at 390 px. The check brings the row into view and lets the page settle
  first, as a teacher's tap on a visible row would.
- **One line per change.** In the first capture the history's date, text and author wrapped together on a phone. Each entry is now
  the change on one line, with the date · who under it.

## G3.5 Edit set

- **`api/src/functions/project-tracker.js`:** `via` on the `progress.update` audits, the board's names and `resource=stage-history`
  (`stageHistoryEvents`).
- **`src/projects/scoreExport.ts`** (new): `projectScoresRows`, the export's rows.
- **`src/projects/stageHistory.ts`** (new): the history's types and words.
- **`src/projects/ProjectScoreGrid.tsx`:** «تصدير إلى Excel».
- **`src/projects/ProjectBulkReview.tsx`:** the board type's additive names.
- **`src/projects/ProjectStudentDetail.tsx`:** «سجلّ التغييرات» in the row menu and its dialog.
- **`src/projects-pro.css`:** the history list (tokens only, inside the G2 block).
- **`src/projects/projectExportHistory.g3.test.tsx`** (new): 13 tests.
- **The menu lists pinned by earlier suites** now include «سجلّ التغييرات» (`ProjectStudentDetail.8c`, `ProjectWorkspace.ux6`,
  `projectStudentTable.g2`, `actionMenu.globalFirstClick`); each assertion is otherwise unchanged.
- **`api/tests/legacy-794589-convergence-r33.test.js` and `api/tests/fixtures/r33-golden.json`:** the reviewed golden change
  (G3.2).
- **`scripts/check-project-export-browser-g3.mjs`** (new): the export and the history in real Chromium.
- **`docs/ux-r/visual-changes.json`:** `project-matrix` declared (the new button).
- **`.gitignore`:** `.harness-g3/`.
- **This document.**

## G3.6 Evidence

This is a feature, not a defect fix, so fail-first is not required. The new tests were still run against the baseline.
- **On `main` `19754ab9`:** the suite cannot import its new modules. With only `scoreExport.ts` and `stageHistory.ts` copied in,
  **9 of 13 fail**, for example:
  - `expected [ undefined, undefined, undefined ] to deeply equal [ 'مشروع 899373', 'العاشر أ', '2026' ]`;
  - `expected 400 to be 404` (no `stage-history` resource);
  - `Unable to find … role "button" and name "تصدير إلى Excel"`;
  - `Unable to find … name "سجلّ التغييرات"`.
  The 4 that pass are the pure tests of the two copied modules.
- **On the head:** 13 / 13 pass.
- **In real Chromium** (production build, the real handler in process, 390 px touch and 1440 px):
  `scripts/check-project-export-browser-g3.mjs`, **36 / 36**. It covers the downloaded file's name, ZIP parts, RTL sheet, title,
  class, every student once, the scores as numbers, and the absence of notes, full codes and formulas. It also covers the history
  dialog's order, words and author, no horizontal overflow, and axe on the matrix and the open dialog.

## G3.7 Mutation proof

`$S/mutate-g3.mjs` (scratch, not committed) plants each defect, runs `projectExportHistory.g3`, the R33 convergence suite,
`projectGradebookMatrix.g1`, `projectStudentTable.g2` and `project-bulk-review-p1`, and restores the file byte-for-byte (SHA-256
checked) in a `finally`.

| Id | Planted defect | Outcome | Killed by |
|---|---|---|---|
| M1 | an empty score is exported as 0 | KILLED | g3 › one row per student … never 0 |
| M2 | the student's own mark is not named in the export | KILLED | g3 › one row per student … |
| M3 | the export carries only the track on screen | KILLED | g3 › writes the saved scores of the whole class (every track) |
| M4 | an archived class cannot export | KILLED | g3 › an archived class can still export |
| M5 | unsaved changes are not named when exporting | KILLED | g3 › an unsaved change is not exported and is named |
| M6 | the board carries a teacher note | KILLED | g3 › the board carries … never a teacher note |
| M7 | the board carries no class / project names | KILLED | g3 › the board carries the project title and the class name |
| M8 | stage-history mixes in other stages' events | KILLED | g3 › stage-history: every event of THAT stage … |
| M9 | stage-history keeps only the newest 50 events of the document | KILLED | g3 › … even beyond the profile's newest 50 |
| M10 | stage-history is oldest first | KILLED | g3 › … newest first |
| M11 | stage-history exposes the actor's id | KILLED | g3 › … no id, no note text |
| M12 | every change is reported as the viewer's | KILLED | g3 › … who as you / teacher / student |
| M13 | stage-history skips the membership gate | KILLED | g3 › stage-history is membership-gated … |
| M14 | progress.update's approval audit does not name its path | KILLED | r33 › golden parity (G794589.update.approve, …) and B10 |
| M15 | the history dialog is not re-read when opened again | KILLED | g3 › … a save since shows on the next opening |

15 / 15 killed, with no timeouts. `git status` was clean of mutants afterwards.

## G3.8 Local validation

These were run on the final tree of the branch.

**The root suite** (`npx vitest run`): 1213 files, **14461 / 14470** tests pass. The 9 failures are in two files, both unrelated
to this phase:
- **`src/AppEvaluationFinish.9g.test.tsx`** (3): container timeouts at 5000 ms. The same file fails the same way on `main`
  `19754ab9` in this container (run twice on each side), and it passes on `main` in CI. Per `AGENTS.md` §12 it is not patched
  here.
- **`src/interactive3d/engine.21d.test.tsx`** (6): the 3D viewer, which this phase does not touch. It timed out under the full
  run's load. Alone, it passes **31 / 31** on the head and on `main`.

**Static checks:** `npm run lint` (0 errors, no warning in a file this phase adds), `npx tsc -b` (clean), `npm run build` (bundle
guard passed), `git diff --check` (clean).

**Theme checks:** `node scripts/ux-dark-audit.mjs` (0 unanswered in 102 sheets), `node scripts/ux-color-inventory.mjs` (719,
unchanged).

**Real Chromium:** `check-project-export-browser-g3.mjs`, 36 / 36.

**The visual gate** (210 captures per theme, base `main` vs head): light **PASS** and dark **PASS**. The only change is the
declared `project-matrix`. A one-off flake on `phone/studio-setup` was identical on its re-capture.

**Not run:** the Runner suites, because nothing under `runner/` and nothing in official grading changed.

## G3.9 Known limitations

- **The browser checks still do not run in CI** (see G1.9). G-CI closed this.
- **The matrix has no per-cell history.** A cell's history is reached from the student's profile (the row menu); the matrix
  cells carry no menu. G4b closes this.
- **The history names the teacher only as «أنت» or «معلم آخر».** It never resolves another account's name.

# Phase G-CI — The project browser checks in CI

G-CI branches from `main` `358610f9` (#434) as `feature/ci-project-browser-checks`. It closes the limitation G1.9 (and G2.9 /
G3.9) left open: the project tracker's real-browser checks ran only locally.

## What runs

**`.github/workflows/projects-browser-g.yml`** («Projects Real Chromium Gate») runs on every pull request that touches the
project code or API, the app shell, `src/ui/**`, the browser harness, a project check or the workflow itself. It has one job: one
production build, then the eight existing checks, each as its own step.

| Step | Script | Checks on `main` `358610f9` (local) |
|---|---|---|
| P3 — the student marks a stage in one tap | `check-project-student-one-tap-browser-p3.mjs` | 42 / 42 |
| P4 — «جدول العلامات» and the profile's neighbours | `check-project-score-grid-browser-p4.mjs` | 37 / 37 |
| P6 — the teacher sees and confirms the students' own marks | `check-project-attention-browser-p6.mjs` | 39 / 39 |
| P7 — condensed stages | `check-project-condensed-browser-p7.mjs` | 31 / 31 |
| P8 — approve on save in the student table | `check-project-approve-on-save-browser-p8.mjs` | 36 / 36 |
| P10 — the project card header | `check-project-hero-browser-p10.mjs` | 24 / 24 |
| G1 — the class matrix | `check-project-matrix-browser-g1.mjs` | 34 / 34 |
| G3 — the Excel export and the stage history | `check-project-export-browser-g3.mjs` | 36 / 36 |

The eight took about two minutes together, after the build.

**How it is built.** It mirrors the existing browser gates (`learning-reader-browser-l8.yml`, `classes-students-browser-u1.yml`):
the same tools (`playwright-core@1.55.0`, `axe-core@4.10.2` installed outside the project, the runner's Google Chrome), the
same `contents: read` permission, and an artifact with every check's record and screenshots.
- **Every step after the build runs** even when an earlier one failed (`if: ${{ !cancelled() }}`), so one red check never hides
  another. Any red step fails the job.
- **No step is softened.** No `continue-on-error`, and no check is skipped or loosened.

## The guard

**`scripts/projects-browser-ci.test.mjs`** (part of the root suite, C1) keeps the workflow honest:
- every `scripts/check-project-*-browser-*.mjs` has its own step;
- no `continue-on-error`;
- every step runs after an earlier failure;
- each step writes to its own output folder;
- the path filter covers the checks, the project code and API, the harness and the workflow.

A new project browser check that is not wired in fails the root suite.

**Mutation proof.** Each planted weakening was caught, and the workflow was restored byte-for-byte (SHA-256 checked):

| Id | Planted weakening | Outcome |
|---|---|---|
| M1 | a check is dropped from the workflow | KILLED |
| M2 | a step is softened with `continue-on-error` | KILLED |
| M3 | a step stops after an earlier failure | KILLED |
| M4 | the checks leave the path filter | KILLED |
| M5 | the artifact drops `include-hidden-files` | KILLED |

## Governance

This adds a gate and weakens none. No existing workflow, job, test or threshold changes. The validation matrix gains C16
(`docs/development/validation-matrix.md`). No dependency is added to the project: the tools are installed in `/tmp/pw` on the
runner, as the other browser gates do. Nothing is deployed.

## Fix 1 — what the first CI run found

The gate's first run on `ddd59375` (run `40094093364`) passed seven checks and every G3 check but one, and it showed two faults:
- **G3 `history dialog @390`: axe `color-contrast` on a `.eb-timeline-date`.** The dialog fades in (`ebFadeIn`, `--eb-dur`
  0.18 s), and the runner reached axe while the fade was still running, so the muted date was measured at a partial opacity.
  The settled dialog passes (locally at both widths, and on CI at 1440 px).
  - **Reproduced:** freezing the fade part-way gives the same finding. Slowing it so that it outlasts the check's own delay
    fails `ddd59375` at both widths.
  - **Fix:** the G3 `axe()` helper now lets every finite animation finish before it measures; an endless one never blocks. With
    the same slowed fade, the fixed script passes. The full rule set still runs, only on the settled screen; no rule, impact
    level or threshold changed.
- **The artifact uploaded nothing.** `actions/upload-artifact@v4` skips hidden folders by default, and `.harness-projects/` starts
  with a dot. The step now sets `include-hidden-files: true`, as the 21dd gates do, and the guard asserts it (M5).

# Phase G4b — A cell's history from the class matrix

G4b branches from `main` `38db902e` (#435) as `feature/g4b-matrix-stage-history`. It closes the limitation in G3.9: a cell's
history could only be reached from the student's profile.

## G4b.1 What the teacher gets

«التقييم الجماعي» → «جدول العلامات» (the class matrix).
- **«سجلّ الخلية»** joins the matrix's controls. The last cell the teacher focused (tapped, clicked or reached with the keyboard)
  is the matrix's **active cell**.
  - The button names the active cell for assistive technology, for example «سجلّ تغييرات الخلية: أحمد — BK01».
  - It opens that student's stage history.
  - It is disabled before a cell is chosen, and again once the active cell is no longer shown: a filter can hide its student,
    and another track or group can hide its stage.
- **Shift+F10, or the context-menu key, in a cell** opens its history directly. The help line above the matrix names the shortcut.
- **In an archived class** the cells are read-only, and each one is a button that opens its own history. The read is allowed on an
  archived class, as in G3.
- **The dialog:**
  - It is the student table's dialog (G3), now one shared component, `src/projects/StageHistoryDialog.tsx`.
  - The same read (`resource=stage-history`), words and authors («أنت» / «معلم آخر» / «الطالب»). It never shows a note's text.
  - In the matrix its title also names the student: «سجلّ تغييرات المرحلة BK01 — … · أحمد».
- **Nothing in the matrix changes when the dialog opens.** Unsaved drafts, the save bar and the filters stay as they were.

## G4b.2 Safety rules kept

- **A read only.** No write path, no API change and no stored-document change. The history comes from G3's membership-gated
  `resource=stage-history`.
- **Read at each opening, never cached.** A new opening shows «جارٍ تحميل سجلّ التغييرات...» until its own read answers; it never
  shows the previous cell's events. A response for an earlier opening, another cell or a closed dialog is dropped.
- **No grade is computed in the browser**, and no draft is saved or discarded by opening a history.

## G4b.3 Edit set

- **`src/projects/StageHistoryDialog.tsx`** (new): the dialog, moved from `ProjectStudentDetail.tsx`. It owns the read, the stale
  guard and the retry.
- **`src/projects/ProjectStudentDetail.tsx`:** uses the shared dialog. Its row menu item, title and behaviour are unchanged; the
  G3 suite still passes unchanged.
- **`src/projects/ProjectScoreGrid.tsx`:**
  - the active cell and «سجلّ الخلية»;
  - Shift+F10 / the context-menu key;
  - an archived cell becomes a button;
  - the help line names the shortcut.
- **`src/projects-pro.css`:** the archived cell button (tokens only; 44 px on touch).
- **Tests and checks:**
  - `src/projects/projectMatrixHistory.g4b.test.tsx` (new, 6 tests);
  - `scripts/check-project-matrix-history-browser-g4b.mjs` (new), a step in `projects-browser-g.yml`.
- **`docs/ux-r/visual-changes.json`:** `project-matrix` declared. **`.gitignore`:** `.harness-g4b/`.

## G4b.4 Evidence

- **The new suite:** 6 / 6, over the real tracker handler. Each test shows:
  1. the focused cell's history opens, for that student only and with that title, and then another row's;
  2. Shift+F10 and the context-menu key work, and the drafts are kept;
  3. the button is disabled when a filter hides the student or a track hides the stage;
  4. an archived cell is a button;
  5. a new opening never shows the previous cell's events while it reads;
  6. a late response for an earlier opening is dropped.
- **Against the baseline's app code** (`src/` and `api/` identical to `38db902e`), the new suite fails 6 / 6: there is no
  «سجلّ الخلية», Shift+F10 opens nothing, and an archived cell is not a button.
- **Kept green:** the G3 suite (13 / 13) and the G1 matrix suite.
  - **Found by G1:** a G1 test pins the archived cell's ✓ as «منجز». The icon keeps that label inside the new button.
- **Real Chromium** (`check-project-matrix-history-browser-g4b.mjs`, 390 px touch and 1440 px): **23 / 23**. It checks:
  - the button is disabled before a cell is chosen, is a 44 px touch target, and names the cell;
  - the dialog's title, order, authors and missing note text;
  - Shift+F10 on another student's cell, and the focus returning to the cell;
  - no sideways scroll, and axe on the open dialog and on the matrix.

  Re-run on the head, P4 (37), P8 (36), G1 (34) and G3 (36) still pass.

## G4b.5 Mutation proof

| Id | Planted defect | Outcome | Killed by |
|---|---|---|---|
| M1 | the button opens the first shown student's history, not the chosen cell's | KILLED | g4b › opens the focused cell's history … |
| M2 | another track no longer hides the active cell's stage | KILLED | g4b › the button is disabled once the active cell is no longer shown … |
| M2b | a filter no longer hides the active cell's student | KILLED | same |
| M3 | Shift+F10 / the context-menu key does nothing | KILLED | g4b › Shift+F10 or the context-menu key … |
| M4 | a focused cell does not become the active cell | KILLED | g4b › opens the focused cell's history … |
| M5 | an archived cell does not open its history | KILLED | g4b › in an archived class every cell is a button … |
| M6 | a late response for an earlier opening is kept | KILLED | g4b › a response for an earlier opening is dropped … |
| M7 | a new opening shows the previous cell's events | KILLED | g4b › a new opening never shows the previous cell's history … |
| M9 | the matrix's title does not name the student | KILLED | g4b › opens the focused cell's history … |
| M10 | the student table reads another student's history | KILLED | g3 › lists the stage's changes … |

10 / 10 killed, with no timeouts. Files were restored byte-for-byte (SHA-256 checked in a `finally`), and `git status` showed only
the phase's own changes afterwards.
- **A planned cache mutant was dropped as not a real cache:** closing the dialog already changes its inputs, so the next opening
  reads again either way.
- **A first M2 survived as an equivalent mutant.** The check it removed was redundant: the stage lookup already disabled the
  button. The redundant check was deleted, and M2 now targets the stage lookup itself.

## G4b.6 Known limitations

- **No right-click menu on a cell.** It would replace the browser's own copy and paste menu in the score field. The keyboard
  shortcut and the controls button cover the same need.
- **The history still names teachers only as «أنت» or «معلم آخر»** (as in G3).

# Phase G4 — Import scores from Excel

G4 branches from `main` `c0ffcfc6` (#437) as `feature/g4-project-score-import`. It brings scores back from the file
«تصدير إلى Excel» writes (G3), edited by the teacher in Excel.

G4b (#438) merged into `main` during G4, as `bf0c365f`. G4 took it in with a normal merge commit. Both phases add to the matrix's
controls, its state and its dialogs, and the merge keeps both: «سجلّ الخلية» and «استيراد من Excel» sit side by side, and both
browser checks are steps of the projects gate. Every check below was re-run on the merged tree.

## G4.1 Owner decisions (2026-10-24)

| Id | Question | Decision |
|---|---|---|
| D-G4a | An empty score cell in the file | The saved score stays as it is. A score is cleared in the matrix, never by an import. |
| D-G4b | A value that is not a score from 0 to 100 | That cell only is left out and named in the preview; the rest imports. |
| D-G4c | How a row finds its student | The name AND the last four characters of the student code, both as the export writes them. |
| D-G4d | Approval of an imported score | As the matrix's «اعتماد المرحلة عند حفظ العلامة» switch says, like a typed score. |

## G4.2 What the teacher gets

«التقييم الجماعي» → «جدول العلامات» → **«استيراد من Excel»** (beside «تصدير إلى Excel»; not in an archived class).
1. **Pick a file.** It is read in the browser; nothing is sent while reading.
2. **The preview** («استيراد العلامات من Excel») names:
   - how many scores will be filled, per track;
   - how many student rows and score columns were read;
   - the values equal to the saved scores (no change), and the empty cells that keep their saved score;
   - what approve-on-save will do;
   - any unsaved changes already in the matrix: they stay, and the file replaces only the cells it overlaps;
   - every row or cell left out, with its row number and why: no matching student, more than one matching student, the same
     student in two rows, or not a score from 0 to 100;
   - columns whose stage this project does not have (ignored).
3. **«تعبئة الجدول (n)»** puts the scores into the matrix as **unsaved drafts**, marked like typed ones, and nothing is written yet.
   «حفظ العلامات» saves them exactly as typed scores are saved:
   - `score.bulk` with each cell's expected value, so a score changed on the server since the import is refused as stale and
     named;
   - then `progress.bulk` for the approvals the switch implies.

## G4.3 Safety rules kept

- **No new write path, no API change, no stored-document change.** The import only fills drafts. The server validates every
  score again, and the stale guard and the approve-on-save rules are the G1 ones.
- **No guessing:**
  - a row that matches no student, or more than one, is never imported;
  - when two rows name one student, neither is imported;
  - an empty cell never clears a score (D-G4a);
  - an invalid value never becomes a score (D-G4b).
- **The reader (`src/reports/xlsxRead.ts`) is bounded and inert:**
  - a 5 MB file limit, a 20 MB limit for each part once inflated (checked on the declared size and while inflating), and a cap on
    the rows and columns read;
  - an encrypted entry, an unknown compression method or a missing part is an error with a message, never an empty sheet;
  - formulas are never evaluated: only cached values are read, and a value starting with «=» is text;
  - no external reference or entity is resolved: the XML is scanned as text;
  - no dependency is added. DEFLATE parts use the platform's `DecompressionStream`.

## G4.4 Edit set

- **`src/reports/xlsxRead.ts`** (new): `readXlsxRows`. It reads the first worksheet by its relationship, shared and inline strings
  (phonetic runs left out) and numbers, in STORED (this repository's writer) and DEFLATE (Excel, LibreOffice, Google Sheets) parts.
- **`src/projects/scoreImport.ts`** (new): `planScoreImport`, a pure function from the file's rows and the server's board to the
  changes and the problems.
- **`src/projects/ProjectScoreGrid.tsx`:** the button, the file input, the preview dialog, and applying the plan as drafts.
- **`src/projects-pro.css`:** the preview lists (tokens only).
- **`src/projects/projectScoreImport.g4.test.tsx`** (new): 12 tests, over the real tracker handler for the matrix ones.
- **`scripts/check-project-score-import-browser-g4.mjs`** (new) and its step in `projects-browser-g.yml`.
- **`docs/ux-r/visual-changes.json`:** `project-matrix` declared. **`.gitignore`:** `.harness-g4/`.

## G4.5 Evidence

- **The new suite: 12 / 12.**
  - **The reader:**
    - the export's own file reads back cell for cell;
    - Excel's way of saving reads too: DEFLATE parts, shared strings, prefixed namespaces, a phonetic run, an entity, and the first
      sheet found by its relationship;
    - a file that is not a workbook, an encrypted one, an unknown method, an over-large declared part and an over-large file each
      fail with their message.
  - **The plan:**
    - it matches on the name and the code's last four, padding a number code;
    - an empty cell, an unchanged value and invalid values behave as decided;
    - a wrong code, an ambiguous name and a duplicated row import nothing;
    - a file that is not the export is refused.
  - **The matrix:**
    1. it previews, fills the drafts and saves them (`score.bulk` → `progress.bulk`, approved), and nothing is written by
       reading or filling;
    2. with the switch off, only scores are saved, and the invalid value and the unknown row are named;
    3. a score changed on the server after the import is refused as stale at save;
    4. cancelling changes nothing, a non-workbook file says so, and an existing draft stays;
    5. an archived class has no import.
- **Fail-first:** against `main`'s app code, with only the two new modules copied in, the 4 matrix tests fail (there is no import
  input). The 8 that pass are the copied modules' own tests and the archived-class test, which pins existing behaviour.
- **Real Chromium** (`check-project-score-import-browser-g4.mjs`, 390 px touch and 1440 px): **19 / 19**. The check:
  - downloads the export and edits it like a teacher: a new score, «١٢٠», and a row for a student who is not in the class;
  - saves it back with DEFLATE parts and shared strings, as Excel does;
  - imports it through the matrix's own file chooser and previews it (one score; the two problems named; nothing written);
  - fills the drafts, saves (`score.bulk` → `progress.bulk`) and checks the stored score and status;
  - checks axe on the preview, no sideways scroll, and the 44 px touch target.

  P4 (37), P8 (36), G1 (34) and G3 (36) still pass.

## G4.6 Mutation proof

| Id | Planted defect | Outcome | Killed by |
|---|---|---|---|
| M1 | an empty cell clears the saved score (D-G4a) | KILLED | g4 › matches by name AND the code's last four … |
| M2 | a row matches by name only (D-G4c) | KILLED | g4 › a name with a wrong code … import nothing |
| M3 | a number above 100 is accepted (D-G4b) | KILLED | g4 › an empty cell leaves the saved score … |
| M4 | two rows for one student are both imported | KILLED | g4 › a name with a wrong code … |
| M5 | a row matching two students imports the first | KILLED | g4 › a name with a wrong code … |
| M6 | a number code is not padded back to four digits | KILLED | g4 › matches by name AND the code's last four … |
| M7 | the reader does not inflate DEFLATE parts | KILLED | g4 › reads what Excel writes back … |
| M8 | the reader trusts a part's declared size (no bomb limit) | KILLED | g4 › anything else fails with a message … |
| M9 | the reader ignores the encryption flag | KILLED | g4 › anything else fails with a message … |
| M10 | the reader keeps phonetic runs in shared strings | KILLED | g4 › reads what Excel writes back … |
| M11 | the file is applied without a preview | KILLED | g4 › previews, fills the matrix as unsaved drafts … |
| M12 | applying drops the drafts already in the matrix | KILLED | g4 › cancel changes nothing … an existing draft stays … |
| M13 | an archived class can import | KILLED | g4 › an archived class has no import |

13 / 13 killed, with no timeouts. Files were restored byte-for-byte (SHA-256 checked in a `finally`), and `git status` showed only
the phase's own changes afterwards.

## G4.7 Known limitations

- **Only `.xlsx`.** A CSV or an old `.xls` file is refused with a message. The export is `.xlsx`, and Excel keeps that format when
  it saves.
- **The first worksheet only,** where the export writes.
- **Scores only.** The status columns of the export are not read: a stage is approved by the approve-on-save switch, or by
  «منجز» in the matrix.
- **The code is matched on its last four characters,** as the export writes it. Two students with the same name and the same last
  four are not told apart, and are reported, never guessed.

## QA-21 / QA-22 — the score import never coerces or guesses silently

Findings #21 and #22 of the post-merge QA of `main` (`c244cbab`).

| # | Where | Defect | Fix |
|---|---|---|---|
| 21 | `src/reports/xlsxRead.ts` | A cell shown as «85%» (stored 0.85) was imported as 0.85. A TRUE cell became the score 1. A formula with no saved value was read as an empty cell. Values past row 5000 (or column 500) were dropped, all without a word. | The reader reads `xl/styles.xml`: a cell whose number format is a percentage (built-in 9 / 10, or a custom code with an unquoted, unescaped «%») is read as the number it shows (85). TRUE / FALSE stay the text «TRUE» / «FALSE», so the plan reports them as «ليست علامة من 0 إلى 100». A formula without a saved value, and a value past the bounds, stop the read with an error naming the problem. An empty styled cell far away is still harmless. |
| 22 | `src/projects/scoreImport.ts` | A score column was mapped to the first «· X» of its header, so a track title containing «·» sent the scores to the wrong stage. | Every «· X» in the header is a candidate. The column belongs to a stage only when exactly one candidate is a stage id of this board; none, or more than one, is reported as an unknown column. The exporter's own headers map as before. |

**Evidence.**
- `src/reports/xlsxRead.qa21.test.ts`, 10 tests (real workbooks built as Excel writes them, and the real planner).
- **Fail-first on `46ba9297`:** 6 failed. The 4 pins passed: a quoted «%» format, a workbook without styles, a TRUE value through the
  planner, and the exporter's own header.
- **Mutations F1–F10:** all KILLED. These covered:
  - percent handling removed (built-in, custom, or quoted «%»);
  - booleans as 1 / 0;
  - a silent formula skip;
  - a silent drop past the bounds, or the bounds checked before the value;
  - the first «· X» taken, or an ambiguous header guessed.

  Files were restored byte-for-byte (sha256).

## QA round 2, phase 1 — a text formula that saved an empty result (QA2-13)

Finding #13 of QA round 2 on `main` (`36dc60e9`), a regression of QA-21.

- **Defect.** QA-21 stops the read on a formula with no saved value, but it also treated a text formula that saved an EMPTY result
  (`=IF(x="","",x)`: `t="str"` with `<v></v>` or `<v/>`) as unsaved, so any template using such a formula could not be imported.
- **Fix (`src/reports/xlsxRead.ts`).** A text formula that has a `<v>` element saved its value, the empty string: an empty cell, as
  before QA-21. A formula with no `<v>` at all, or a number formula with an empty value, still stops the read and names the cell.
- **Evidence.** One test added to `src/reports/xlsxRead.qa21.test.ts`. Fail-first on `36dc60e9`: failed. Mutations P7 (no exception)
  and P8 (any formula with a `<v>` accepted): KILLED.
