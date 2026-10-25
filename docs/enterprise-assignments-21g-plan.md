# Phase 21G — Assignments: enterprise workflow and teacher tenancy

**Status:** 21G.0–21G.7 implemented (21G.0–21G.6 merged, 21G.6 as nassarwafik/ExamBank791381#331; 21G.7 in review on branch
`claude/nifty-clarke-k0wlid`). Each phase: exact-head CI, independent review and the owner's manual merge (`AGENTS.md` §3, §13).

**Baseline:** `origin/main` `080c4df4` (merge of PR #326, the Exam Studio).

**Owner direction:** make the assignments workspace enterprise-grade, with enterprise UX. Report first, then implement the
approved plan.

---

## 1. Owner decisions

| # | Decision | Applied as |
|---|---|---|
| D1 | Start with the teacher page | 21G.2–21G.6 rebuild the teacher workspace first; the student side follows the same rules later |
| D2 | Grade release is a per-assignment setting | 21G.5 |
| D3 | After students start, only the title and instructions can be edited | 21G.0 `updateDetails` |
| D4 | One copy per class when an assignment goes to several classes | 21G.6 |
| D5 | **Each teacher has their own classes, materials and students** (full tenancy across the platform) | 21G.0, §3 |

## 2. Roadmap

| Phase | Scope |
|---|---|
| **21G.0** | Safety: teacher tenancy across the platform, edit title / instructions, draft by default, window validation |
| 21G.1 | Extract the assignments controller from `AssignmentsPanel.tsx` (no behaviour change) |
| 21G.2 | Assignments home: KPIs, progress cards, time status, all classes, **light list** (moved here from 21G.0, see §5) |
| 21G.3 | Full-width assignment page with tabs and distribution |
| 21G.4 | Professional gradebook: one status per student, bulk actions, mobile cards, per-question grid |
| 21G.5 | Grading flow: next student, grade release setting (D2) |
| 21G.6 | Creation wizard; one copy per class (D4) |
| 21G.7 | Reports, reminders, visual and accessibility gate |

## 3. Teacher tenancy (21G.0)

### Model

One authority, `api/src/lib/teacher-tenancy.js`, decides "may this teacher see or change this document":

- **Tenant.** In multi-user mode (`BUILDER_USERS`; a session whose signed `am` claim is `multi-user`) the tenant is the token
  subject. Legacy single-password mode has one shared identity: no tenant, nothing stamped or filtered, behaviour unchanged.
- **Owner stamp.** A document created by a tenant carries `ownerId`. Class-bound data (students, assignments, submissions,
  messages, projects, reports, analytics, photos) is accessible exactly when its **class** is; a student created in a class also
  carries the class's `ownerId`. `ownerId` never changes after creation, so one pre-check per request is enough.
- **Not found, not forbidden.** Another teacher's resource is answered exactly like a missing one (same status, same body).
- **Pre-tenancy data.** A document without `ownerId` belongs to `LEGACY_DATA_OWNER` when that server setting names a teacher
  subject. While it is unset, unowned documents stay **shared** (visible to every teacher, as before). Nothing is ever claimed
  silently; saved exams keep the 21F.0 claim-on-save rule (D2 of 21F) only while `LEGACY_DATA_OWNER` is unset.
- **Question bank.** The official generated bank (sources `791381-20xx` / `791367-20xx`, exam codes 791381 / 791367) is the shared
  library every teacher reads. Every other question (entered by hand, imported from a file) belongs to the teacher who added it:
  `ownerId` on the question and on its index entry (`api/src/lib/bank-tenancy.js`).

### Operator note: `LEGACY_DATA_OWNER`

Classes, students, assignments, saved exams, templates and bank questions created before 21G.0 have no owner. Once more than one
teacher signs in with `BUILDER_USERS`, the owner (the operator) decides who owns that data by setting the API application setting
`LEGACY_DATA_OWNER` to that teacher's `BUILDER_USERS` key (for example `teacher-author`). Agents never change Azure settings
(`AGENTS.md` §2, §11); this is an operator step. Until it is set, the old data stays visible to every teacher.

### Endpoint registry

`api/tests/tenancy-registry-21g0.test.js` classifies **every** module that calls `requireBuilderAuth` exactly once, and requires
the guard's evidence in every class-scoped and teacher-owned one. A new endpoint without a decision fails the root suite.

| Class | Endpoints | Rule |
|---|---|---|
| Class-scoped | classes, students, assignments, assignment progress (21G.2), results, review, item analysis, coding regrade / bulk retry, reports, Today hub, achievement feed, messages, project tracker, legacy 794589 route, live game sessions, analytics (and AI analytics), student photos | the class decides |
| Teacher-owned | saved exams, save artifact, templates, assessment presets, simulators, mesh assets, teacher profile, live challenges, audit history, bank questions / select / replace / summary / generate-exam / question availability, bank import, import upload / fetch-url / analyze | the owner decides |
| Shared by design | exam library (official), exam governance and its inbox (a review workflow across teachers), learning materials catalog, learning study / training (course content) | everyone |
| Operator | assignment-index control, build-bank-2025, classify-bank-batch, classify-question-preview, import-html-exam, inspect-html, storage-status | **need an admin role** (open item, §6) |
| Stateless | AI composer / author / scenario / instruction analysis / quality fix / structured fix / question action / image, number-conversion preview, exam-request interpretation | no stored teacher data |

Student-facing endpoints (`student-*`, `platform-session`, `coding-run`) are untouched: a student only ever reaches their own class.

## 4. Other 21G.0 changes

- **Edit title and instructions** (D3): API action `updateDetails`; only those two fields change; archived assignments are
  read-only; menu item «تعديل العنوان والتعليمات» with a dialog.
- **Draft by default:** «نشر مباشرة» is off in the composer; the hint says what the choice means for students.
- **Window validation:** a deadline at or before the opening time, or an unreadable date, blocks «إنشاء الواجب» at its field
  (`role=alert`, `aria-invalid`, `aria-describedby`); a deadline in the past is a non-blocking warning.
- **Defects found and fixed on the way:**
  - the saved-exam list (100) and template list (150) capped the number of **examined** blobs across all teachers, so a teacher
    whose documents sorted late saw nothing; the page now counts the teacher's own documents within a 2,000 scan bound;
  - two templates saved in the same millisecond with titles the slug reduces alike got the same blob name (the second overwrote
    the first, across teachers too); the name now carries a random part;
  - a template load of a missing blob answered 500; it now answers 404 «القالب غير موجود.».

## 5. Deviation from the plan

*Resolved in 21G.2 (§9): the light list shipped as an ETag-verified summary cache, which needs no write path to change.*

The **light assignment list** (a summary index instead of downloading every assignment document) moved from 21G.0 to 21G.2.
Doing it safely needs a per-class summary that every write path (create, status, attempts, timing, details, archive, restore,
purge) keeps in step, with a self-healing read; the 21G.2 home rebuilds the list and its data needs anyway. Tenancy already limits
what a teacher receives; the remaining cost is server-side reads.

## 6. Known limitations and open items

- **Operator tools need an admin role.** They rewrite platform-wide state (the bank index, the assignment-index switch), so
  filtering them per teacher would drop other teachers' data. Until a role exists, any signed-in teacher can call them.
- **Identity numbers stay globally unique** across teachers (a student identity is a platform identity); only the duplicate
  message is generic, so it never reveals another teacher's student or class.
- **Saved-exam ids** are client-generated; a collision with another teacher's exam id is refused with 403 (21F.0 behaviour), which
  tells the caller the id exists.
- **Audit history** is filtered to the teacher's own actions within the existing read window (`HARD_MAX`).
- `generate-exam`, `bank-summary`, `exam-question-availability` and the import handlers have no dependency seam; their filters
  are covered by the registry guard and by code review, not by handler tests. The shared helpers they call are tested.
- Governance stays shared by design (reviewers act on other teachers' exams).

## 7. Implementation record and evidence (21G.0)

Commits (normal commits on `claude/nifty-clarke-k0wlid`): `1a53d9da` core, `151d433d` derived data, `b56e2143` lint fix,
`23e23548` question bank, `1033b470` content / imports / 794589 / registry, `1f85b249` + `87e255d3` mutation campaign and test
fix, `5454c33d` draft default and window validation, `b6b51ed8` edit title and instructions, `bb728fb4` this record, `aeccd920` the
row-menu test update the full suite found.

### Fail-first (tests copied into a detached worktree of `080c4df4`)

| Test file | Head | Baseline `080c4df4` |
|---|---|---|
| `api/tests/teacher-tenancy-21g0.test.js` | 19 / 19 | 18 fail; the legacy-mode case passes (a **pin**) |
| `api/tests/bank-tenancy-21g0.test.js` | 8 / 8 | 8 fail (7 assertions; the import case fails on the then-missing export) |
| `api/tests/content-tenancy-21g0.test.js` | 5 / 5 | 5 fail |
| `api/tests/assignment-details-21g0.test.js` | 4 / 4 | 3 fail (400 unknown action); the validation case passes (a **pin**) |
| `src/AssignmentsPanel.ux5.test.tsx` (composer, edit) | 24 / 24 | composer case fails (no window alert); edit case fails (no menu item) |
| `src/assignments/assignmentWindow.21g0.test.tsx` | 7 / 7 | new module (not applicable) |
| `api/tests/tenancy-registry-21g0.test.js` | 3 / 3 | guard (not applicable) |

### Mutation (`node scripts/mutate-21g.mjs g0`)

32 mutants, **32 KILLED**, every file restored byte-for-byte (sha256), `git status` clean. G0-M11 (review gate removed) first
**SURVIVED**: the test asked for a paper that did not exist, so every teacher got 404. The test now seeds a real submission; the
isolated re-run is KILLED. The 21F campaign's F0-M4 now targets the owner check where it lives after 21G.0.

| Id | Planted defect | Result |
|---|---|---|
| G0-M1–M5 | no tenant; owner comparison removed; `LEGACY_DATA_OWNER` ignored; no owner stamp; student stamp ignored | KILLED |
| G0-M6–M14 | class list / class actions / students / assignment actions / create in another class / paper review / messages / reports / 794589 unguarded | KILLED (M11 after the test fix) |
| G0-M15–M23 | bank list / change / dangling heal / re-used key / index owner / official sharing / insert / replace / duplicate check | KILLED |
| G0-M24–M29 | template list / load / delete; saved-exam page counting; saved exams ignore legacy owner; template name collision | KILLED |
| G0-M30–M32 | archived assignment editable; empty title accepted; title edit rewrites instructions | KILLED |

### Validation

Recorded per head in the PR; the exact-head rule (`AGENTS.md` §6) applies to the final head only.

### Deployment tier

Tier 1 (local tests) only. Nothing deployed; no Azure setting changed; `LEGACY_DATA_OWNER` is not set by any agent.

## 8. Implementation record and evidence (21G.1)

**Scope:** no behaviour change. `src/AssignmentsPanel.tsx` held the whole workspace in one 497-line component (state, requests,
rules and layout). It is now the 81-line view; the logic moved unchanged into:

| File | Holds |
|---|---|
| `src/assignments/useAssignmentsController.ts` | list and master scope, create, every assignment action, the sequenced results read, gradebook and row actions, item analysis, coding bulk retry, the 12B drill-in, the focus discipline of the non-modal areas |
| `src/assignments/useAssignmentComposer.ts` | content source (open exam / saved exam / 791381 library), library browser, composer fields |
| `src/assignments/assignmentsView.ts` | pure rules: master scope, `rowGrading` (shared resolver), gradebook rows, item-analysis order and summary, the drill view (`drillViewFor`) |
| `src/assignments/assignmentsApi.ts` | the one request helper and date formatting |

The view owns the three focus anchors (refs) and passes them in, so the controller's result holds no refs (the React Compiler lint
otherwise flags every read of it). These are the pieces 21G.2–21G.6 build on.

**Source guards follow the code.** Two guards read the panel's source text. They now read the files the code moved to, with the
same assertions: the ux5 accessibility guard (rowGrading through the shared resolver, `useConfirm`, the purge typed-title body, the
impact-first archive), and the single-grading-resolver guard (the view file must delegate; the panel and the controller join the
no-local-rule surfaces). `scripts/mutate-21e2.mjs` G1-filtered-rows targets the new export line.

| Evidence | Result on `23d91d20` |
|---|---|
| Existing AssignmentsPanel / drill / lifecycle / export / timing / review / coding suites | pass with no change to their test files (245 tests in 20 files, guards included) |
| New: `assignmentsView.21g1`, `assignmentsApi.21g1`, `useAssignmentsController.21g1` | 11, 3 and 2 tests |
| Full root suite + build | 1,045 files / 13,096 tests; initial JS 114.1 KB gzip (budget 125 KB) |
| tsc / lint | clean / 125 (the panel's four effect warnings now sit in the hooks) |
| Real Chromium, list / detail / composer at 1440 and 390 px against the 21G.0 head | identical except the clock-dependent date text, which differs the same way between two runs of one build |
| Mutation `node scripts/mutate-21g.mjs g1` | 14 mutants, **14 KILLED** (G1-M13 first SURVIVED: the create() window guard sits behind a disabled button, so no view test reached it; the hook test now does, isolated re-run KILLED); 21E2 G1-filtered-rows re-run: KILLED |

Fail-first does not apply (no defect fixed; a refactor is proven by the unchanged suites). Deployment tier: 1 (local) only.

## 9. Implementation record and evidence (21G.2)

### What shipped

- **Light list** (`api/src/lib/assignment-summary-cache.js`). `GET /api/assignments` reads one blob listing plus
  `platform/assignment-index/summary-cache.json`, and downloads only the documents whose ETag changed. A cached summary is served
  only for the exact ETag it was computed from, so a change by any writer is seen at once. No write path needed to change; the
  cache is never an authority. `SUMMARY_VERSION` in `manage-assignments.js` invalidates it when `summary()` changes shape.
- **Progress** (`GET /api/assignment-progress`, `api/src/lib/assignment-progress.js`). For each published assignment of the
  teacher's active classes it returns expected / submitted / not submitted / pending review / graded / live / average / last
  submission. It uses the Today hub's scoped read and the gradebook's own rules; a parity test checks the figures against the
  gradebook's stats.
- **Home** (`src/assignments/assignmentsHome.ts`, `AssignmentsHomeKpis.tsx`, rows in `AssignmentList.tsx`):
  - every class by default;
  - a KPI strip: open now / closing within 48 h, pending review, live attempts, and the submission rate of the open assignments;
  - per published row: a time status (scheduled / open / closing soon / closed, with an Arabic duration), pending and live
    counts, and a submission bar;
  - time-filter chips with counts. They join the master scope, so a detail they hide closes.
  An unavailable progress read shows «—» and «تعذر تحميل التقدم», never zero.

The progress route was first named `/api/assignments-overview` and renamed so that no `/api/assignments` prefix matcher mistakes it
for a list read.

### Evidence

| Check | Result |
|---|---|
| `assignment-summary-cache-21g2` | 8 / 8. A repeated list downloads 0 documents; the same case on the 21G.1 head downloads all 3 |
| `assignment-progress-21g2` | 4 / 4, including parity with the `assignment-results` stats and a graded student with a live second attempt |
| `assignmentsHome.21g2`, `AssignmentsPanel.home.21g2` | 7 / 7, 4 / 4 |
| Existing suites | ux5 expectations changed only for the two intended changes: the extra boot read, and the all-classes default |
| Full root suite + build on `ae3e0431` | 1,049 files / 13,119 tests; initial JS 114.1 KB gzip |
| Earlier full run on `5f1e885c` | 2 failures. (1) Raw colours in `assignments-pro.css`, fixed in `ae3e0431`. (2) A 3D plot-viewer test unrelated to this phase, which failed while another test run competed for CPU and passed alone (11 / 11) |
| tsc / lint | clean / 125 |
| Mutation `node scripts/mutate-21g.mjs g2` | 16 mutants, **16 KILLED**. G2-M8 first SURVIVED (no fixture student had both a completed and a live attempt); after the fixture fix the isolated re-run is KILLED |
| Real Chromium at 1440 / 390 px | no horizontal overflow. The capture found an empty band in the phone toolbar and two Arabic count phrasings, both fixed in `69f9d760` |

Fail-first applies to the defects fixed on the way only: the token-only CSS guard failed on `5f1e885c` and passes on `ae3e0431`.
Deployment tier: 1 (local) only.

## 10. Implementation record and evidence (21G.3)

### What shipped

- **A full-width page.** «فتح» replaces the list and the KPI strip with the assignment's page (`AssignmentDetail.tsx`,
  layout class `is-page`). The list stays mounted but `hidden`, so «العودة إلى الواجبات» returns focus to the opener once the list
  is shown again. The page header carries the same action menu as the row (`AssignmentActionMenu`), since the row is hidden.
- **Three sections**: «الطلاب» (the gradebook, the default), «نظرة عامة» and «تحليل الأسئلة». The UX-5 guard forbids
  `role="tablist"`, so they are an `aria-pressed` button group named «أقسام الواجب». Switching is client-side. The item analysis
  is read once, on its first visit. Every new opening, including a drill from Today, starts on the gradebook.
- **Overview** (`AssignmentOverview.tsx`, model in `assignmentPage.ts`), built from the gradebook rows the page already holds,
  with no extra request:
  - score distribution in five bands. **Grading safety:** only FINAL latest results are counted; a result waiting for manual
    review is provisional, counted apart («لا يشمل … بانتظار التصحيح») and never drawn as a score;
  - where every student stands (graded / pending review / in an attempt now / not submitted), each student in exactly one part;
  - the settings (window, attempts, duration, policy, questions, instructions) with their three editors, hidden for an archived
    assignment.
  The charts are plain HTML bars inside `ChartCard`, one hue, each with a named figure and a table view.

### Defects found on the way (real browser and full suite only)

| Defect | Found by | Fix |
|---|---|---|
| The hidden list stayed visible beside the page: `.eb-assign-list{display:flex}` overrode the `hidden` attribute | the `hiddenAttribute` guard, full root suite on `13b5a748` (1 failed / 13,128) | `.eb-assign-list[hidden]{display:none}` in `536b25ab` |
| The gradebook's status badges were squashed into a 14 px strip: the new status bar reused `.eb-status-stack`, a class the gradebook already owns | the real-Chromium capture | renamed to `.eb-status-bar`, plus a stylesheet guard: the subject of every 21G.3 selector names a class new to the block. Restoring the old name fails the guard with `['.eb-status-stack']` (`3d03e22d`) |

happy-dom applies no CSS, so neither defect could be seen by the panel tests.

### Evidence

| Check | Result |
|---|---|
| `assignmentPage.21g3` | 5 / 5: band edges (49.9 / 50 / 64 / 65 / 89.5 / 90 / 100 / 120), pending reviews kept out, the server's grading status preferred, one part per student |
| `AssignmentsPanel.page.21g3` | 6 / 6: the page replaces the list and the KPIs, focus returns to «فتح», the overview needs no request, the header menu, the analysis read once, a drill onto an open page, the stylesheet guard |
| Existing suites | ux5, r7 and drill-12b changed only for the intended layout: the menu is reached from the page header, the close button is now «العودة إلى الواجبات», analysis is a section, and the row's «فتح» is queried while hidden |
| Full root suite + build on `f1ec1972` | 1,051 files / 13,130 tests, all passed; build passed, initial JS 114.1 KB gzip (budget 125 KB) |
| tsc / lint | clean / 125 |
| Mutation `node scripts/mutate-21g.mjs g3` | 11 mutants, **11 KILLED**. G3-M6 (a new opening keeps the previous section) first SURVIVED: the only tested path closed the page, which already resets the section. The drill-onto-an-open-page test kills it in the isolated re-run |
| Real Chromium at 1440 / 390 px | no horizontal overflow on the gradebook or the overview; the gradebook table is 1,110 px wide on desktop (611 px beside the list in 21G.2); five distribution rows on both widths |

Fail-first applies to the two defects above only (the guards failed before their fixes). Deployment tier: 1 (local) only.

## 11. Implementation record and evidence (21G.4)

### What shipped

- **One status per student** (`src/assignments/gradebookStatus.ts`). The row showed a lifecycle badge and a grading badge side by
  side; it now shows one. Grading comes first, through the shared resolver: a final result stays «نهائي» while a newer attempt
  runs. A student without a graded result is described by the live attempt in its own lifecycle words («قيد المحاولة»,
  «مسودة», «متوقفة مؤقتًا»); otherwise «لم يسلّم». The lifecycle stays as a short note only when it adds something
  («انتهى الوقت», «أنهى المعلم المحاولة», a live attempt beside a grade). The live-attempt detail lines are unchanged.
- **Row selection and bulk actions.** A checkbox in the name cell, «تحديد كل الطلاب الظاهرين» (indeterminate when partial), and
  a bulk bar with «منح محاولة إضافية» and «تمديد الموعد» (one deadline for every ticked student). A bulk action is the SAME
  per-student request as the row action (`allowRetry`, `setDueAtOverride`), sent once per ticked visible row in the visible
  order, each answer merged as that student's authoritative snapshot. Every student is reported: the ones that failed are named
  with the server's reason and stay ticked for a retry. A search, a filter, another assignment or closing the page clears the
  selection, so a bulk action never reaches a row the teacher cannot see ticked. Leaving the page stops a run and releases its
  busy state. No selection on an archived assignment. No API change: the per-student routes keep every authority and audit check.
- **Sticky header, phone cards.** The gradebook scrolls inside a bounded area (`min(72vh, 820px)`) with its header in view
  (no `z-index`: the 21E stacking guard holds). On a phone each student is a card built from the same table (sorting, actions
  and tests stay one path), with the sort buttons kept as chips.
- **Per-question grid** in «تحليل الأسئلة» (`QuestionGrid.tsx`, model in `questionGrid.ts`).
  `GET /api/assignment-item-analysis` also returns `students[]`: each member's latest attempt, one cell per question.
  - **Grading safety:** a question waiting for the teacher (manual review, a technical hold) or for automatic coding execution
    is `{state:"pending"}` with NO score, never the provisional mark. A missing grade is `{state:"none"}`.
  - `questionAutoGradingPending(attempt, questionId)` in `official-grading.js` is the attempt-level `autoGradingPending` rule
    for one question; a composite part counts for its question.
  - The grid uses one hue deepening with the mark, at the distribution's band edges (`bandOf`, now shared). Every cell prints
    its mark, so colour is never the only channel. «بانتظار» sits on a hatched cell, and the student column stays in view.

### Defect found on the way (real browser only)

The phone cards spilled past the page: `.students-table` sets `min-width: 620px`, which the card layout inherited. The card rule now
sets `min-inline-size: 0` (`837b252e`), pinned by the style test and by mutant G4-M16.

### Evidence

| Check | Result |
|---|---|
| `gradebookStatus.21g4` | 4 / 4: grading first, pending names its manual marks, live lifecycle words, notes only when they add something |
| `questionGrid.21g4` | 2 / 2: band edges as a share of the question's marks, pending never banded, missing «—» |
| `AssignmentsPanel.gradebook.21g4` | 9 / 9: one status, selection and its clearing, bulk grant (one failure named and kept ticked, snapshots merged), bulk deadline, the run stopping when the page is left (after a success and after a failure), no selection when archived, the grid, the styles |
| `assignment-item-grid-21g4` (API) | 3 / 3: one row per submitted student (latest attempt), pending without a score (manual review and open coding execution), the per-question coding rule incl. a composite part |
| Existing suites | `ux5` and `grading` (AL) changed only for the intended one-status row; the ux5 source guards follow the label code into `gradebookStatus.ts` (and forbid score-based rules there too); the 21G.3 style guard stops at the 21G.4 block, which restyles the gradebook on purpose |
| Full root suite + build on `0cc70c0c` (same tree as the validated pre-rebase `e8b841bf`) | 1,055 files / 13,148 tests: 1 failure, unrelated (below); build passed, initial JS 114.1 KB gzip |
| tsc / lint | clean / 125 |
| Mutation `node scripts/mutate-21g.mjs g4` | 16 mutants, **16 KILLED**. G4-M4 (the loop-top stop check removed) first SURVIVED: the check after a successful answer already ended the run; the new failed-request test kills it in the isolated re-run. `g3` re-run in full after G3-M2 / G3-M6 were re-pointed: 11 / 11 KILLED |
| Real Chromium at 1440 / 390 px | no horizontal overflow on the gradebook, the selection, the analysis grid or the overview; phone cards 322 px inside a 322 px column |

**The unrelated failure.** `src/questionTypes/coding.17e-b.test.tsx` failed once in the full run and passes alone (28 / 28). Its
secrecy pattern contains `9\.17` (a hidden weight canary), and the real-clock `expectedStartedAt` of that run was
`…:10:59.173Z`, which contains «9.17». The failure depends on the clock, not on this phase. Proposed fix (not in this PR): pin
the clock in that test, or make the weight canary a string no timestamp can contain.

Fail-first applies to the phone-card defect only. Deployment tier: 1 (local) only.

## 12. Implementation record and evidence (21G.5)

### What shipped

- **Moving between students in the review** (`src/assignments/reviewNav.ts`, `AssignmentReview.tsx`).
  - Controls: «→ الطالب السابق», «الطالب التالي ←», «الطالب التالي بانتظار التصحيح», the position («الطالب 3 من 8»), and
    «حفظ والانتقال إلى التالي بانتظار التصحيح».
  - Order: the gradebook's current sort, over every student with a submitted attempt, so a search or filter never strands the
    review. «التالي بانتظار التصحيح» wraps round and never names the current student.
  - Keys `]` `[` `N` by physical key, so any keyboard layout works (Arabic included). They never fire while typing in a field or
    with a modifier.
  - Every switch goes through the same unsaved-edits guard as closing; nothing is auto-saved. «حفظ والانتقال» moves only after a
    successful save.
- **Results release (owner decision D2)** (`api/src/lib/results-release.js`), a per-assignment `resultsRelease`:
  - The three modes: `immediate` (the default, and every assignment stored before 21G.5), `afterDue` (from `dueAt`), and
    `manual` (`resultsReleasedAt`, set by the teacher).
  - **Enforced by the server.** Until release, score, percentage, manual-review marks and teacher feedback leave no student
    surface. That covers:
    - the submission state: the latest result, every attempt, and every write response;
    - the dashboard: the assignment's result, `latestScore` / `latestPercentage`, the averages, Strength and medals;
    - medal posts in the achievement feed, including reactions to them;
    - `assignment_reviewed` notifications, which appear, with their original time, once released.
  - The client learns only `resultsVisible:false`, the mode and, for `afterDue`, the date. Fail closed: an unknown mode or an
    unreadable date withholds.
  - Teacher actions: `setResultsRelease` (any time; changing the mode clears a manual publication, so switching back to
    «يدويًا» never surprises with a release) and `releaseResults` (manual mode only; publish or withdraw, confirmed). An archived
    assignment is read-only. Both are audited.
  - The summary carries the setting, so `SUMMARY_VERSION` is now 2.
  - Teacher UI: the composer's «متى يرى الطلاب نتائجهم», and in «نظرة عامة» where results stand, the mode and the manual
    publish. The page header names the mode.
  - Student UI: the ONE resolver `scoreWithheld` treats an unreleased result as withheld and says when it will show. The result
    card and task card show the reason and a dash, never a zero. Medals and the Today hub skip such a result.
  - Student-facing field names avoid «lease», which the coding leak guard rightly forbids. The two public-key allowlists gain
    `resultsVisible`, `resultsVisibility` and `resultsVisibleAt`: a boolean, a mode word and a due date.

### Evidence

| Check | Result |
|---|---|
| `results-release-21g5` (API) | 9 / 9: the rule (incl. fail-closed), each-assignment-once gating helper, create / summary / both actions incl. archived, and every student surface withheld then released |
| `reviewNav.21g5`, `AssignmentReview.nav.21g5` | 3 / 3, 5 / 5: order and wrap, buttons, physical keys (not while typing), the guard both ways, save-then-move only on success, no nav = unchanged |
| `resultsRelease.21g5`, `AssignmentsPanel.grading.21g5` | 4 / 4, 2 / 2: the teacher's words, the student resolver and task card (no mark, no zero), portal medals, the review moving through the real panel, the mode change and confirmed publish |
| Existing suites | `ux5` (create body gains `resultsRelease:"immediate"`), `assignment-summary-cache-21g2` (SUMMARY_VERSION 2), the two coding public-key allowlists (three release fields); `ux7a`'s finalized-only medal guard kept verbatim |
| Full root suite + build on `582d25dc` | 1,060 files / 13,171 tests, all passed; initial JS 114.1 KB gzip |
| tsc / lint | clean / 125 |
| Mutation `node scripts/mutate-21g.mjs g5` | 23 mutants, 22 KILLED, 1 EQUIVALENT: G5-M10 (the dashboard medal loop's own release check removed) cannot change the output, because `withholdResult` already removed the percentage the medal tier is read from; the check stays as defence in depth |
| Real Chromium at 1440 / 390 px | no horizontal overflow; the review header shows the position and the three student controls; «نظرة عامة» shows the release state, the mode and «نشر النتائج للطلاب» |

Fail-first: not applicable, as no defect was fixed. Deployment tier: 1 (local) only.

## 13. Implementation record and evidence (21G.6)

### What shipped

- **The creation wizard** (`src/assignments/assignmentWizard.ts`, `AssignmentComposer.tsx`).
  - Five steps:
    - «المحتوى»: the exam, a search in my exams, «معاينة المحتوى», and the title and instructions;
    - «الصفوف»;
    - «المواعيد»: the window, attempts and duration;
    - «القواعد»: the attempt policy, the results release and publishing;
    - «المراجعة»: exactly what each copy will carry.
  - Navigation:
    - The stepper is a numbered list of current / done buttons with `aria-current="step"` and no tab roles, as the UX-5 guard
      requires.
    - Moving back is always free. Moving forward passes only through valid steps; the reasons are shown under the stepper.
    - Focus moves to each step's heading.
    - A blocking window issue stops «المواعيد»; a deadline already past only warns.
- **One copy per class (owner decision D4).**
  - The SAME create request is sent once per chosen class, in order. The server's create, authority and tenancy checks are
    unchanged.
  - Every class is reported. A class that succeeded leaves the selection, so a retry can never create a second copy there. A
    class that failed stays chosen, and the wizard stays open on its review.
  - The first active class is chosen once when the classes arrive, and again when the wizard opens after a full create. It is
    never re-ticked while the teacher is choosing.

### Evidence

| Check | Result |
|---|---|
| `assignmentWizard.21g6` | 6 / 6: each step's blocking reasons (a past deadline only warns), the first blocked step, forward jumps only through valid steps, the copy count, the review rows |
| `AssignmentsPanel.wizard.21g6` | 4 / 4: search and preview in the real panel, three copies with one failure named and kept chosen, a retry creating only it, going back keeps every value, never re-ticking (even when the classes reload), a reopened wizard choosing the first class |
| Existing suites | `ux5` (composer walk and master-scope), `lifecycle` (class targets), `assignmentWindow.21g0`, `attemptPolicy.7a` and `useAssignmentsController.21g1` follow the steps or `classIds`. The same assertions hold: the exact create body, focus, non-modal |
| Full root suite + build on `730b4ffc` | 1,062 files / 13,181 tests, all passed; initial JS 114.1 KB gzip |
| tsc / lint | clean / 124 |
| Mutation `node scripts/mutate-21g.mjs g6` | 10 mutants, **10 KILLED**. G6-M9 (the default class re-filled whenever the selection is empty) first SURVIVED: the effect depends on the class list, which no test reloaded. The new test reloads it with every class unticked, and also found that a wizard reopened after a full create had no class chosen, now restored on opening. KILLED in the isolated re-run |
| Real Chromium at 1440 / 390 px | no horizontal overflow; five steps; the classes step with two classes ticked; the review with «إنشاء الواجب (نسختان)» |

Fail-first applies to the reopened-wizard gap only; the new test failed before `730b4ffc`. Deployment tier: 1 (local) only.

## 14. Implementation record and evidence (21G.7)

### What shipped

- **Excel export** (`src/reports/xlsx.ts`): a real `.xlsx` workbook with no new dependency.
  - It is the Office Open XML parts in a STORED zip, with CRC-32.
  - The sheet is right-to-left, with a bold header row.
  - Numbers are written as numbers and text as inline strings. There is **no formula element at all**, so «=SUM(…)» stays text
    (no formula injection).
  - Characters XML forbids are dropped, and a non-finite number is an empty cell.
  - openpyxl reads it as right-to-left, with the header bold, «=SUM» as text and numbers as numbers.
- **PDF export** (`src/reports/printReport.ts`): a print-ready A4 landscape, right-to-left report printed from a hidden same-origin
  iframe. The browser's «حفظ بصيغة PDF» shapes Arabic correctly, which a JavaScript PDF library would not.
  - Every cell is escaped.
  - The report fails cleanly when the browser offers no print, and the frame is removed after printing.
  - Both new exports are built from the SAME rows as the CSV (`gradebookCsvRows`) and carry every student even while the screen is
    searched. The PDF adds the page's counts. Neither ever carries answers, keys or teacher feedback.
- **Reminders** («تذكير من لم يسلّم», «تذكير المحددين»): `POST /api/assignment-results {action:"remindStudents"}`.
  - Who receives one: a personal `assignment_reminder` goes to each class member (or each ticked one) who has not submitted and can
    still submit: published, open, and not closed for them by the same `timerState` as their page.
  - At most one per student per assignment per day, through a dated dedupe key.
  - `studentIds` are validated, and another class's student is never reached.
  - The action is audited and tenancy-guarded like every assignment action.
  - The student's bell reads «تذكير من المعلم — لم تسلّم «…» بعد · آخر موعد …».
  - It is triggered by the teacher. An automatic reminder would need a scheduled job, which is a deployment change, so it is left
    to the owner.
- **Visual and accessibility gate**:
  - Method: axe-core 4.10.2 (WCAG 2.1 A/AA) plus a layout check, run on eight screens at 390 / 834 (touch) and 1180 / 1440 px. The
    screens are the home, the page's three sections, the review, and three wizard steps. axe was downloaded into the scratchpad as
    a measuring tool, not a project dependency.
  - Found: `listitem` (the blocking reasons were a list with `role=status`); `scrollable-region-focusable` (the question analysis
    table); and touch targets under 44 px on the touch sizes.
  - Fixed: the status is now a region around the list; the table frame is a named, focusable region; on a coarse pointer every
    workspace and review control gets 44 px, and a selection box 24 px (the WCAG 2.2 AA minimum).
  - **After: 32 / 32 checks, 0 violations, no horizontal overflow, no target below its minimum.**

### Evidence

| Check | Result |
|---|---|
| `xlsx.21g7` | 4 / 4: CRC-32 equal to Node's zlib, the zip read independently (central directory, local headers, every CRC), the parts, RTL / numbers / inline strings / no `<f>`, escaping and dropped characters |
| `printReport.21g7` | 4 / 4: RTL A4 landscape, every cell escaped (an `<img onerror>` name stays text), no teacher feedback, the same columns and rows as the CSV, the iframe printed and removed, a clean failure without print, the reminder notification on the client |
| `assignment-reminders-21g7` (API) | 4 / 4: only eligible members, once per day, `studentIds` limited and validated, draft / archived / not-yet-open / closed remind nobody, another teacher gets 404, the type is personal only |
| `AssignmentsPanel.reports.21g7`, `a11yGate.21g7` | 3 / 3, 4 / 4: both reminder buttons (confirmed, exact bodies, counts), no reminder on a draft, Excel and PDF of every student while searched, the gate's markup and touch rules |
| Full root suite + build on `51567ba2` (tree-identical to `b86f1f35` after moving onto the merge of #331) | 1,067 files / 13,200 tests, all passed; initial JS 114.1 KB gzip |
| tsc / lint | clean / 124 |
| Mutation `node scripts/mutate-21g.mjs g7` | 16 mutants, **16 KILLED** on the first run: reminder eligibility, the daily dedupe, a draft reminding, unvalidated `studentIds`, another class reached, an Excel formula, unescaped Excel / PDF cells, a wrong CRC, LTR, the frame left behind, both axe fixes, and Excel / PDF exporting the filtered subset. G1-M12 was re-pointed (the panel now builds the same rows twice) and is KILLED |
| Gate (Chromium + axe) | 32 / 32 clean after the fixes; before them, 2 axe rules and the touch targets above |

Fail-first applies to the gate's findings: axe reported them on the 21G.6 build, and they are absent on this head. Deployment tier:
1 (local) only.

## 15. QA-3 — a duration change applies to new attempts only

The post-merge QA of `main` (`c244cbab`) found that the timing dialog's promise, «تغيير مدة المحاولة يسري على المحاولات الجديدة فقط، ولا يعيد ضبط
محاولة مؤقتة بدأت بالفعل» (`AssignmentList.tsx`), was not kept by the server.

- **Defect.** `updateTiming` writes the new `durationMinutes` on the assignment, and `timerState` read that CURRENT value for the
  running attempt.
  - Changing 0 → 30 minutes ended a running untimed attempt. After 90 minutes of work, `saveDraft` answered 409 «انتهى وقت المحاولة»,
    `finalizeTimedOutAttempt` closed the attempt as `timedOut`, and the answers since the last autosave were lost.
  - Changing 60 → 0 removed the deadline of a running timed attempt: `saveDraft` still answered 200 five hours later.
  - A paused untimed attempt resumed after 0 → 30 got a zero-length running deadline.
- **Fix.** A running attempt keeps the timing it started with, through `attemptDurationMinutes` in `assignment-availability.js`.
  - `startAttempt` stamps `activeAttempt.durationMinutes` (0 = untimed). The legacy untimed lazy start stamps 0.
  - `timerState`, and the resume path in `student-submission.js`, read the duration in this order:
    1. the stamp;
    2. otherwise a valid server `endsAt`, which only a timed start writes (its own minutes);
    3. otherwise the assignment's duration, exactly as before.

    So a timed attempt whose `endsAt` was lost still derives its deadline from `startedAt` and fails closed (B2A, unchanged and still
    pinned by `attempt-lifecycle-b2a.test.js` / `teacher-attempt-controls-b2b.test.js`).
  - New attempts use the new duration.
- **Evidence.** `api/tests/attempt-duration-change-qa3.test.js` has 8 tests on the real handlers under a fake clock.
  - **Fail-first on `5a65444a`.** Run there, three tests failed:
    - 0 → 30: `expected 409 to be 200`;
    - 60 → 0: `expected 200 to be 409`;
    - the paused attempt resumed after 0 → 30 got `runEndsAt` stamped (`expected '2026-10-24T10:00:00.000Z' to be undefined`).

    The three controls passed on the baseline: 60 → 30 not shortened, the next attempt uses the new duration, and the lost-`endsAt`
    fail-closed case.
  - **Pins.** The legacy no-stamp timed attempt and the stamp written at start were added with the fix.
  - **Mutations.** 6 mutants, all KILLED:
    - the stamp ignored;
    - `endsAt` ignored;
    - `timerState` or resume reading the current setting;
    - the stamp not written;
    - a 0 stamp read by truthiness.

    The files were restored byte-for-byte (sha256).
- **Limitation.** An untimed attempt that was already running when this deploys has no stamp and no `endsAt`, so it still follows the
  assignment's duration until it ends. Every attempt started afterwards is protected.

## 16. QA-8 — the same attempt open on two devices never silently loses answers

Finding #8 of the post-merge QA of `main` (`c244cbab`).

- **Defect.** `saveDraft` replaced the whole server draft with whatever snapshot arrived. A student with the attempt open on two
  devices (or two tabs) answered q1 on device A; device B, still holding the older copy, autosaved it and erased q1 with a 200.
  The timed-out finalize then graded the reduced draft. The client already adopted a newer server draft when it was clean, but a
  device with its own unsaved edits kept them and overwrote the other device's work on its next save.
- **Fix — server (`student-submission.js`).**
  - Every write of the server draft (`saveDraft`, and `pauseAttempt` with answers) advances `draftRevision`. The state and the
    save reply carry it.
  - A whole-draft write that sends `expectedDraftRevision` asserts the draft it was composed from. When another device has saved
    since, the write is refused with `409 { code: "DRAFT_STALE" }` and nothing is written. `submit` asserts it too, so a stale
    device never grades its older copy. A malformed value fails closed.
  - A request without the field (a bundle cached from before this change) is accepted exactly as before.
- **Fix — client (`StudentExamPage.tsx`, `student/exam/draftMerge.ts`).**
  - The page keeps the revision and the answers of the server draft it is based on, sends the revision on every save, submit and
    pause, and adopts the revision each save returns.
  - On `DRAFT_STALE` it re-reads the authoritative state. While it is still the same writable attempt, it merges per question: the
    server's newer draft, plus only the questions this page changed since its base (a cleared answer is removed). It then saves the
    merged draft against the new base. An autosave merge is silent. A blocked submit or pause is not resent: the merged draft is
    saved and the student sees «حُفظت إجابات لهذه المحاولة من جهاز أو نافذة أخرى، ودُمجت مع إجاباتك هنا. راجع إجاباتك ثم أعد
    المحاولة.»
  - When the attempt changed or closed, the ordinary 409 reconciliation applies, as before.
- **Evidence.** `api/tests/draft-revision-two-devices-qa8.test.js` (8, real handler under a fake clock) and
  `src/StudentExamPage.draftRevision.qa8.test.tsx` (7: 4 real-page flows and 3 merge unit tests).
  - **Fail-first on `46ba9297`.** 11 of the 15 QA-8 tests failed, among them the QA probe: device B's stale save answered 200 and
    the timeout graded `{}`. The 3 merge unit tests and the "server without a revision" page test passed (new module / unchanged
    behaviour).
  - **Mutations** (shared PR-A campaign, A1–A13): the server check removed; the revision not advanced; submit or pause not
    checked; a malformed base accepted; a missing field treated as stale; the page not sending or not adopting its base; the merge
    dropping local edits, re-applying untouched questions or not removing a cleared answer; a stale autosave or submit not merged.
    All KILLED (A1 was first an invalid mutant and was re-planted). Files restored byte-for-byte (sha256).
- **Limitation.** A device still running a bundle from before this change sends no revision and keeps the old behaviour until it
  reloads. Two devices editing the SAME question keep the value of the device that saves last.

## 17. QA-14 … QA-18 — access and retry edges on the student side

Findings #14–#18 of the post-merge QA of `main` (`c244cbab`).

| # | Where | Defect | Fix |
|---|---|---|---|
| 14 | `student-submission.js` `submit` + `StudentExamPage.tsx` | On a legacy untimed assignment (no attempt identity), a network retry of the same submit recorded a second attempt. | The page sends a `submitKey`: one per submit of one draft (attempt context + revision + generation), re-sent unchanged when the student retries. The server returns the result of the attempt that key was recorded with (200, `replay: true`) and writes nothing. The check runs before the write gate and again under the CAS, for two in-flight copies. A new draft revision is a new submit with a new key. A modern attempt's retry now replays too, instead of a 409. |
| 15 | `achievement-feed.js` | An archived class's feed still took reactions. | The feed stays readable as a record (`readOnly: true`); a reaction is refused with 403. |
| 16 | `student-project-tracker.js` + `StudentProjectPanel.tsx` | An archived class's project was shown with self-report controls that the server then refused. Keeping it readable is the intended behaviour: it is the student's record. | The reply flags `readOnly: true` for a non-active class. The page shows «الصف مؤرشف — المشروع للعرض فقط.» and offers no «أنجزت», «تراجع» or group control. The server still refuses a direct write. |
| 17 | `student-submission.js` GET | An unpublished assignment's timing (due date, duration) reached any student of the class who knew its id. | A non-published assignment is readable only as the student's own history (an existing submission of an archived task); otherwise it is 404. |
| 18 | `student-submission.js`, `student-assignment.js`, `coding-run.js` | A student and an assignment that both lacked a `classId` matched (`"undefined" === "undefined"`). | Membership needs a real `classId` on both sides. |

**Existing tests updated deliberately.**
- `StudentExamPage.ux7b1.test.tsx` and `ux7b2.test.tsx`: the submit body now also carries `submitKey` (32 hex).
- `StudentSelfReport.p2.test.tsx`: the archived-class case now expects the read-only view (no control, the note, nothing
  written). The server-side refusal of a direct write is pinned in `access-edges-qa14-18.test.js`.
- `legacy-794589-convergence-r33.test.js` and `fixtures/r33-golden.json`: a reviewed golden change (REFRESHED_BY_QA16). Exactly
  one entry was refreshed, `SG.s8` (the archived class's student), and its only change is `readOnly: true`, pinned by invariant B12.

**Evidence.**
- Tests:
  - `api/tests/access-edges-qa14-18.test.js`: 11 tests on the real handlers;
  - `src/StudentExamPage.submitKey.qa14.test.tsx`: 2 page tests;
  - the updated P2 test.
- **Fail-first on `46ba9297`:** 10 failed.
- **Mutations E1–E12:** all KILLED. E2 (the CAS replay check removed) first SURVIVED and was killed by an added test: two submits
  with the same key in flight at once. Files were restored byte-for-byte (sha256).

## 18. QA round 2, phase 1 — the due date closes an untimed attempt (QA2-2)

Finding #2 of QA round 2 on `main` (`36dc60e9`).

- **Defect.** An untimed attempt (the default continuous policy) left open past the assignment's due date was neither writable
  (the assignment is closed) nor finalizable: `finalizeTimedOutAttempt` answered «لم تنتهِ مدة المحاولة بعد» because an untimed
  attempt never expired. The answers the student saved before the due date were graded only if the teacher ended the attempt by
  hand; until then the student stayed «قيد التنفيذ» and the teacher saw «لم يسلّم».
- **Fix — server (`assignment-availability.js` `timerState`).** A running untimed attempt is expired once the due date has passed,
  and its effective end is then the due date — the rule a paused attempt already followed. Before the due date nothing changes (no
  end, nothing to count down, writable); without a due date it never expires. The existing timeout finalization then grades the
  server draft (`endReason: "timedOut"`, `endedAt` = the due date), and a teacher ending it records it as timed out.
- **Fix — client (`StudentExamPage.tsx`).** The page finalizes an expired attempt whatever its kind (it used to test `timed` or
  `paused` first). Against a server without this change nothing differs: such a server never reports an untimed attempt expired.
- **Evidence.** `api/tests/qa2-phase1-login-untimed.test.js` (QA2-2 block, 4 tests on the real handlers) and
  `src/StudentExamPage.untimedDue.qa2.test.tsx` (2 page tests). Fail-first on `36dc60e9`: 3 failed (finalize refused, teacher end not
  timed out, the page never finalized); the 3 pins passed (before the due date, without a due date, a non-expired page). Mutations
  P3–P6 (expiry removed, no end date, expiry ignoring the due date, the page testing `timed` again): all KILLED.

## 19. QA round 2, phase 2 — a legacy timed attempt keeps its identity check (QA2-6)

Finding #6 of QA round 2 on `main` (`36dc60e9`).

- **Defect.** `isModernAttempt` read the assignment's CURRENT duration. On a legacy model-0 TIMED assignment set to untimed while an
  attempt runs, the attempt is still timed (QA-3 keeps its own timing) but the identity check was skipped, so a stale tab's submit for
  the previous attempt landed on the running one as a new attempt scored 0 that used up an attempt.
- **Fix (`student-submission.js`).** The check also asks the running attempt's own duration (`attemptDurationMinutes`). A legacy untimed
  assignment with no running timed attempt still submits without an identity, as before.
- **Evidence.** `api/tests/qa2-phase2-grading.test.js` (QA2-6 block, 3 tests). Fail-first on `edffc7df`: the stale submit returned 200;
  the 2 pins passed. Mutation Q14 (the attempt's own timing ignored): KILLED.

## 20. QA round 2, phase 3 — governance ownership, archive vs start, draft revision on clear (QA2-7, QA2-8, QA2-11)

Findings #7, #8 and #11 of QA round 2 on `main` (`36dc60e9`).

- **QA2-7 — governance never takes over another teacher's saved exam (`exam-governance.js`).** Governance stays shared between teachers
  by design (§3), but a SAVED exam belongs to the teacher who saved it. Teacher B enabling governance on teacher A's saved exam id took
  it over: A's next assignment silently used B's published content and key, or was refused `NO_PUBLISHED_REVISION`. `enable` now loads
  `exams/<examId>.json` and refuses another teacher's saved exam like a missing one (404, tenancy rule). An exam id nobody saved, and
  every action on an exam its owner put under governance, are unchanged. A governance record created before this change is not rewritten.
- **QA2-8 — an archived class never holds a member's open attempt (`student-submission.js` startAttempt, `manage-classrooms.js`).** The
  archive and a start write DIFFERENT documents, so the archive's pending-work check could pass just before the attempt was written. Each
  side now writes, then reads the other's state: a start re-reads the class inside its write and again after it commits (withdrawing the
  attempt it just created, untouched, if the class was archived meanwhile: 403); the archive re-checks pending work after it commits and
  withdraws itself (its own lifecycle fields restored, only if nothing changed them since: 409 PENDING_GRADING). At least one side always
  sees the other.
- **QA2-11 — clearing the draft advances `draftRevision`.** Submit, timeout finalization, integrity exit and the teacher's end cleared the
  draft without advancing the revision, so on a legacy untimed assignment (no attempt identity) a second device holding the submitted
  draft's revision passed the QA-8 check and graded its older copy as a new attempt.
- **Evidence.** `api/tests/qa2-phase3-authority.test.js` (QA2-7, QA2-8, QA2-11 blocks). Fail-first on `0a649737` and mutations R1–R6,
  R10, R11: see the phase-3 pull request (all KILLED).
