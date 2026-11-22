# Class gradebook — «سجل العلامات الصفي» (Phases GB0–GB7)

**Status:** GB0–GB9, GB6a and GB6b merged (GB9, #687). GB10 (building the scheme from a description with AI, §4.11) in review.

| Phase | Pull request |
|---|---|
| GB0 — design record | nassarwafik/ExamBank791381#660 |
| GB1 — validation and computation engine | nassarwafik/ExamBank791381#662 |
| GB2 — route, capabilities, project evidence | nassarwafik/ExamBank791381#663 |
| GB3 — scheme builder | nassarwafik/ExamBank791381#664 |
| GB4 — table of marks | nassarwafik/ExamBank791381#669 |
| GB5 — manual marks and decisions | nassarwafik/ExamBank791381#671 |
| GB7 — performance and final review | nassarwafik/ExamBank791381#672 |
| GB6a — approval, lock, reopen, the student read (server) | nassarwafik/ExamBank791381#675 |
| GB6b — approval buttons for the teacher, «علاماتي» for the student | nassarwafik/ExamBank791381#679 |
| GB8 — copy a scheme from another class (D7) | nassarwafik/ExamBank791381#685 |
| GB9 — «علامة يرصدها المعلم» made clear in the builder | nassarwafik/ExamBank791381#687 |
| GB10 — «بناء المخطط بالذكاء الاصطناعي» (§4.11) | `claude/inspiring-knuth-ub53oi` |
| Hotfixes met on the way | nassarwafik/ExamBank791381#661 (a date-bound test), nassarwafik/ExamBank791381#666 (phone page switch starts at the top) |

Each phase is its own branch and pull request, with exact-head CI, an independent review and the owner's manual merge
(`AGENTS.md` §3, §13).

**Baseline:** `origin/main` `1950f8f0` (merge of PR #658).

**Owner direction (2026-11-17).**
- **The request:** for every class, the teacher defines how the class's final mark is calculated:
  - the share of each part (category) in the final mark;
  - which assignments, exams and projects count in each part, and the weight of each one inside its part.
- **The result:** a table with the class's students as rows; the chosen items as columns grouped under their part, each with its
  weight; the total of each part; and the final mark.
- **The plan:** proposed before any code and approved on 2026-11-17 with all its recommendations (§2).

---

## 1. The owner's example

The owner's example (an image of four tables) defines three parts. Each part's item weights add up to 100 %.

| Part (category) | Weight in the final | Items and their weight inside the part |
|---|---|---|
| علامة الشهري | 20 % | الوظيفة 1 10 · التدريب 2 15 · امتحان 1 25 · امتحان 2 25 · امتحان 3 25 |
| علامة الفصل 1 | 40 % | الوظيفة 1 20 · التدريب 2 10 · امتحان 1 15 · امتحان 2 30 · امتحان 3 25 |
| علامة الفصل 2 | 40 % | الوظيفة 1 5 · التدريب 2 15 · امتحان 1 25 · امتحان 2 25 · امتحان 3 30 |
| **العلامة النهائية** | 100 % | الشهري 20 · الفصل 1 40 · الفصل 2 40 |

The first column of the example's final table is labelled «الوظيفة 1 20%». It is read as «علامة الشهري 20%», the part it stands for.

This example becomes a fixture of the GB1 tests, with its numbers worked by hand (§4.4).

## 2. Owner decisions (approved 2026-11-17)

| # | Decision | Applied in |
|---|---|---|
| D1 | **The latest final attempt counts** when an assignment allows several attempts. This is what the assignment gradebook already shows (`assignment-results.js`, `latestResult`). | GB1 |
| D2 | **Nothing becomes a zero by itself.** A student who did not submit shows «—». A zero exists only through the teacher's explicit, recorded decision. The decision can be made for one cell, or for every non-submitter of one column at once («اعتبار غير المسلِّمين صفرًا»). | GB1, GB5 |
| D3 | **Three sources of a column:** a class assignment or exam, a class project (its 0–100 project grade) and a **manual column**, for a paper exam whose marks the teacher types in. | GB1, GB5 |
| D4 | **Teacher only at first.** Students do not see the gradebook. Showing it to students is a later, optional phase (GB6), and it must respect each assignment's results release. | GB2, GB6 |
| D5 | ~~Two new capabilities, `grades.book.view` and `grades.scheme.manage`.~~ **Superseded by O1 (2026-11-18): no new capability.** Reading the gradebook needs `assignments.assignment.view`; editing the scheme, the manual marks and the excused / zero decisions needs `assignments.grading.grade`; project columns also need `projects.tracker.view` (§4.5, §6). | GB2 |
| D6 | **Rounding at display only.** Every value is computed at full precision. The table shows one decimal, the precision the assignment and report averages already use (`toFixed(1)`). An integer final mark is not adopted now. | GB1, GB4 |
| D7 | **Scheme templates** (copy one class's scheme to another class) are a later feature, after GB4. Designed in GB8 (§4.9): a copy from one of the teacher's classes, assignments matched by the same exam. | GB8 |

## 3. What already exists (read from the code before planning)

| What | Where | Used for |
|---|---|---|
| Assignment results: `score`, `totalMarks`, `percentage` (late deduction already applied), per attempt | `api/src/functions/assignment-results.js` (`resultFields`) | the value of an assignment column |
| Grading status `notSubmitted` / `pendingReview` / `final`, read-time only | `api/src/lib/grading-status.js` (`deriveGradingStatus`) | only a **final** result counts |
| The reportable-assessment predicate: published, or archived after being published | `api/src/lib/assignment-lifecycle.js` (`isReportableAssessment`) | which assignments the scheme may pick |
| The project grade 0–100, computed by the server from the project's own weights | `api/src/lib/project-tracker/performance.js` | the value of a project column |
| The class's projects | `api/src/lib/project-tracker/class-programs.js` (`classHasProject`) | which projects the scheme may pick |
| The class roster (exclude archived; keep login-disabled), the same one reports use | `api/src/functions/reports.js` (`rosterFrom`, `svc.studentBelongsToClass`) | the gradebook's rows |
| The results-release setting (`immediate` / `afterDue` / `manual`), fail closed | `api/src/lib/results-release.js` | GB6: a student never learns a withheld mark through the gradebook |
| Teacher tenancy | `api/src/lib/teacher-tenancy.js` | a teacher reads and edits only their own classes |
| Capability registry, presets, route declarations | `api/src/lib/access/capabilities.js`, `presets.js`, `route-capabilities.js` | D5 |
| ETag-verified listing cache | `api/src/lib/classes-students-read-cache.js` | reading the class's documents cheaply |
| Excel export (RTL) and print | `src/teacher/teacherExports.ts`, `downloadXlsx`, `printReport` | GB4 |
| The project grade matrix: one save bar, stale guard per cell, the matrix never computes a grade | `src/projects/ProjectScoreGrid.tsx`, `docs/enterprise-projects-gradebook-g.md` | GB4/GB5 UX conventions |

**What is missing:** a per-class scheme, a computation that combines the sources, manual columns, recorded excused / zero
decisions, and the table itself.

## 4. Design

### 4.1 Storage

There is no database and no migration (`AGENTS.md` §1). Two new JSON documents per class are created only when a teacher first
saves:

- **`platform/gradebooks/<classId>/scheme.json`:** the scheme. It is written with `If-Match` (the ETag), so two saves never
  overwrite each other. A stale write answers `409`. The document carries a `revision` that grows by one on each save.
- **`platform/gradebooks/<classId>/entries.json`:** the manual marks and the teacher's decisions. It is kept separate from the
  scheme so that typing marks never conflicts with editing weights. It is also written with `If-Match`, and each item carries
  the value the teacher saw (`expected`), as in `score.bulk`.

```json
{
  "schemaVersion": 1, "classId": "c1", "revision": 7,
  "categories": [
    { "categoryId": "monthly", "title": "علامة الشهري", "weight": 20,
      "items": [
        { "itemId": "i1", "weight": 10, "source": { "kind": "assignment", "assignmentId": "a12" } },
        { "itemId": "i2", "weight": 15, "source": { "kind": "project", "projectCode": "794589" } },
        { "itemId": "i3", "weight": 25, "source": { "kind": "manual", "title": "امتحان ورقي", "maxScore": 20 } }
      ] }
  ],
  "updatedAt": "2026-11-17T10:00:00.000Z", "updatedBy": "teacher-id"
}
```

```json
{
  "schemaVersion": 1, "classId": "c1", "revision": 3,
  "cells": {
    "i3": { "s1": { "score": 17, "at": "…", "by": "…" } },
    "i1": { "s4": { "decision": "excused", "at": "…", "by": "…" },
            "s5": { "decision": "zero",    "at": "…", "by": "…" } }
  }
}
```

**Identifiers:** `classId`, `itemId`, `categoryId` and student ids are blob-name / key segments. They accept only the safe-id
alphabet already used for classes.

**Audit:** every save of either document writes an audit record (`api/src/lib/audit-log.js`) that names the change. Records are
kept 400 days and never deleted automatically (D17).

### 4.2 Validation of a scheme (server-side; the UI only mirrors it)

- 1–10 categories, and 1–40 items per category.
- **Weights:** each weight is a finite number with at most two decimals. Each category weight is above 0 and at most 100, and so
  is each item weight.
- **Sums:** the category weights add up to 100, and each category's item weights add up to 100, with a tolerance of 0.01.
- **A scheme whose sums are not 100 is saved as `status: "draft"`** and has no final mark. The server never rescales weights
  itself. The UI offers «توزيع بالتساوي», which the teacher clicks.
- **An assignment source** must belong to the class and be reportable when it is saved.
- **A project source** must be one of the class's projects.
- **A manual source** has a title and a `maxScore` from 1 to 1000.
- **The same assignment or project may appear only once in a scheme.** A second use is refused with a message naming where it
  already is.
- Titles are trimmed plain text, at most 80 characters for a category and 120 for a manual column.

### 4.3 Computation (server only; one pure module)

Module: `api/src/lib/gradebook/compute.js`, with no I/O. The route feeds it the scheme, the entries, the roster, each
assignment's submissions and each project's grades. The UI displays what it returns and **never computes a grade**, as the
project matrix already does.

For each student and each item, the value is resolved **in this order**:

| # | State | Shown | Counted |
|---|---|---|---|
| 1 | Teacher decision `excused` | «معفى» | no — its weight is shared among the other counted items of its category |
| 2 | Teacher decision `zero` | 0 (marked as a decision) | yes, as 0 % |
| 3 | Manual column with a typed score | the score / `maxScore` | yes |
| 4 | Assignment: latest attempt is `final` (D1) | its `percentage` (late deduction included) | yes |
| 5 | Assignment: latest attempt is `pendingReview` (includes the compile-error `reviewRequired` route and technical holds) | «بانتظار التصحيح» | **no** — the final mark becomes provisional |
| 6 | Project: the student's project is **complete** (every required, active stage approved) | the project grade (0–100), the project tracker's own number | yes |
| 6b | Project: started but not complete (GB2) | «بانتظار التصحيح» | **no** — a partial running total is not a final mark; the final becomes provisional |
| 7 | Nothing submitted, no manual score, no decision | «—» | **no** — the final mark becomes incomplete |
| 8 | Source missing (the assignment was purged, or the project left the class) | «مصدر مفقود» | **no** — a warning on the column, never a zero |
| 9 | Anything the module cannot classify | «غير محدد» | **no** — fail closed (`AGENTS.md` §10) |

States 2 and 1 come first because a recorded teacher decision outranks the raw evidence. An attempt finalized *after* a `zero`
decision does not erase the decision. The cell shows both values, and the teacher chooses which one stands (GB5).

**The formulas** use full precision. `p` is an item's percentage (0–100) and `w` its weight:

```
category(s) = Σ p·w over the counted items / Σ w over the counted items      (no counted item ⇒ no category value)
final(s)    = Σ category(s)·W over the categories / 100                      (W = category weight)
```

- **Excused items** leave both sums of their category. This is how their weight is shared among the remaining items.
- **A student with every item excused in a category** gets no value for that category. The final is then computed over the other
  categories with their weights rescaled (Σ W of the categories that have a value), and it is marked «معدَّل».
- **The status of the final** is `complete` (every item counted or excused), `provisional` (something is pending review) or
  `incomplete` (some «—», missing source or unclassified cell).
- **While the final is not `complete`, it is still shown**, computed over what is counted so far, with its status. It is shown
  this way so the teacher sees where the student stands. It is never presented as a final result, and the export carries the
  status column.

### 4.4 The owner's example, worked

The example is worked for one student in the «علامة الشهري» category:

- **The student's items:** الوظيفة 1 80 %, التدريب 2 90 %, امتحان 1 70 %, امتحان 2 60 %, امتحان 3 100 %.
- **The category:** (80·10 + 90·15 + 70·25 + 60·25 + 100·25) / 100 = (800 + 1350 + 1750 + 1500 + 2500) / 100 = **79.0**.
- **If الوظيفة 1 is excused:** (1350 + 1750 + 1500 + 2500) / 90 = **78.9** (78.888…).
- **The final, with the semester categories at 85.0 and 72.5:** (79·20 + 85·40 + 72.5·40) / 100 = **78.8**.

GB1 pins these values, and the full three-table example, in its tests.

### 4.5 API

There is one route, `api/src/functions/class-gradebook.js`. Its actions are declared one by one in `route-capabilities.js`:

| Action | Capability | Does |
|---|---|---|
| `GET ?classId=` | `assignments.assignment.view` | the scheme, the columns, the rows (values, states, category and final with status, each with its one-decimal `display`), the warnings, and the ETags |
| `GET ?classId=&resource=sources` | `assignments.assignment.view` | the class's reportable assignments and projects that can be picked |
| `scheme.save` | `assignments.grading.grade` | validate and save the scheme. The body carries the `etag` the scheme was opened with (`null` for a new one): a different one is `409 STALE_SCHEME` |
| `entries.save` | `assignments.grading.grade` | manual scores and decisions (`value`: `{ score }`, `{ decision }` or `null` to clear), 1–300 items, each with `expected`. A cell changed elsewhere is returned in `stale` and kept; any invalid item refuses the whole request |

**Project columns (O1).** A session without `projects.tracker.view` never reads project progress: its project cells are `withheld`,
`sources` lists no project, and saving a scheme with a project column, or an entry on one, is refused.

The route's authority checks:

- **The teacher session and tenancy:** the teacher reads and writes only their own classes.
- **An archived class is read-only:** reading is allowed, writing is refused.
- **Storage errors:** a storage error answers 503 and is never treated as an empty gradebook.
- **Reads:** the route reads **only the submissions of the assignments named in the scheme**, never every assignment of the
  platform. It reads them by name, with bounded concurrency (`mapConcurrent`); the roster comes through the ETag document cache.
- **What the route never returns:** answer keys, per-question grades, codes or passwords. Its output is marks and states only.

### 4.6 User interface

The gradebook is a «سجل العلامات» panel under the selected class in «الصفوف والطلاب», after «المواد التعليمية لهذا الصف» (O2, settled in
GB3). It is its own lazy chunk (`src/gradebook/LazyClassGradebook.tsx`), so the Teacher Platform chunk carries only the wrapper.

1. **The scheme builder (GB3).** The panel shows the scheme's parts with their weights and whether it is complete or a draft; «إنشاء
   مخطط العلامات» / «تعديل مخطط العلامات» opens the builder dialog.
   - **Parts:** one card per category, holding the category's title and weight.
   - **Items:** added with a picker that lists the class's published assignments and exams and its projects (a source already used is not
     offered), or as a manual column (title and an integer maximum, 1–1000). Each item has a weight field and can be moved or removed.
   - **Weights:** typed as text; Arabic-Indic digits and «٫» are accepted.
   - **Sums:** a sum line on each card and for the whole scheme, written in text («✓ صحيح» / «يجب أن يكون 100»), never colour alone, with
     «توزيع بالتساوي» (hundredths that add up to exactly 100; the teacher presses it, nothing is rescaled silently).
   - **Problems:** a structural problem blocks the save, with its reason beside the part, before any request.
   - **Drafts:** when a sum is not 100 the button reads «حفظ كمسودة» and the page explains that no final mark is computed.
   - **Conflicts:** the save is made over the version the dialog opened (`etag`). A 409 keeps the teacher's draft and offers «إعادة
     التحميل».
   - **Leaving:** closing with unsaved changes asks first.
   - **Read-only:** an archived class, or a teacher without `assignments.grading.grade`, sees the builder read-only.
   - **Access:** a teacher without `assignments.assignment.view` gets no panel and no request (presentation only; the server enforces).
2. **The gradebook table (GB4).**
   - **Columns:** grouped under a band per category, as in the owner's example. Each column header shows the item's title and
     weight. After its items comes the category's total column, and the final column comes last.
   - **Layout and colours:** the student column is sticky. The cell states of §4.3 each have a colour and a text label; the
     label is shown, not the colour alone.
   - **Filters:** الكل / ناقص / بانتظار التصحيح.
   - **Drill-down:** a click on an assignment cell opens that student's review in the assignment page (the existing drill target).
   - **Export and print:** export to Excel (RTL, with a status column), CSV and print. All three are built from the same rows as the
     table (`exportTable`), so they say exactly what the table says: numbers as numbers, states as words.
   - **As built (GB4):**
     - **Where:** the table sits in the «سجل العلامات» panel under the scheme summary (`src/gradebook/GradebookTable.tsx`, pure model
       `gradebookTable.ts`).
     - **Values:** every value is the server's `display` (one decimal); the UI computes no mark.
     - **Final mark:** it shows its status in words (مؤقتة / ناقصة / معدَّلة / المخطط مسودة).
     - **Totals:** a category with nothing counted shows «—», or «معفى» when every item was excused.
     - **Filters:** «ناقصة» and «بانتظار التصحيح» follow the final mark's status.
     - **Layout:** the table scrolls sideways inside its own named region, so the page never overflows.
     - **Legend:** a «معاني الخانات» note explains the states.
     - **Drill-down:** an assignment cell is a button that opens the existing drill target
       `{ assignmentId, mode: "student", studentId }`; a manual column is plain text.
3. **Manual marks and decisions (GB5).** The conventions of the project matrix apply:
   - one save bar, «حفظ العلامات (N)»;
   - the column menu: «اعتبار غير المسلِّمين صفرًا», «إعفاء», «مسح»; each one only creates unsaved changes until the teacher saves;
   - leaving the page with unsaved changes asks first.
   - **As built (GB5):**
     - **Reading:** `GET` also returns `entries`, the teacher's stored values per column and student (a score or a decision, never who /
       when). It covers the scheme's columns and the roster only, and never a withheld project column. The page edits what it saw, and
       each saved item carries that value as `expected`.
     - **Editing:** «تعديل العلامات» turns the table into its edit mode, under a save bar. Every cell has a decision (بلا قرار / معفى /
       صفر). A manual column also has a score field, out of its maximum, that accepts Arabic digits. A decision wins over a typed score.
     - **Unsaved changes:** an edit that comes back to the stored value disappears. Unsaved cells say «غير محفوظ». An invalid score
       blocks the save, with its reason.
     - **Column actions** («اعتبار غير المسلِّمين صفرًا», «إعفاء غير المسلِّمين», «مسح قرارات العمود») apply to the students shown. The
       first two touch **only** cells with nothing: the server says «missing», and the teacher has no decision and no typed score there,
       saved or not. A result, a result awaiting the teacher, a typed score or a decision is never replaced (mutation-proven, U1–U3).
     - **After a save:** the gradebook is read again. Applied edits leave the draft. An edit whose cell changed elsewhere stays, now over
       the server's value, which it shows («تغيّر في مكان آخر: …»); nothing is overwritten unseen.
     - **Unsaved work:** the unsaved edits belong to their class. Leaving the edit mode with unsaved edits asks first, and so does
       closing the page.
     - **The zero conflict:** in the view, a zero decision with a result under it shows both («0 (قرار) · تسليم 80»). The teacher keeps it
       or clears it.

### 4.7 Safety invariants (enforced by tests and mutation proof)

1. A missing, pending, unclassified or missing-source cell never contributes a zero. Only a recorded `zero` decision does.
2. A result that is not `final` never counts.
3. Weights are never rescaled silently. A sum that is not 100 means a draft and no final.
4. One teacher never reads or writes another teacher's class, and a storage error is never read as «no data».
5. A stale write is refused (`409`) and never overwrites the newer value.
6. GB6 only: a student never sees a gradebook value that depends on a mark withheld by its results release.
7. GB6 only: a part is approved only when complete (no pending, missing, missing-source, unclassified or withheld cell), and what a
   student sees is the frozen snapshot of approved parts: their own row, never a live value.

### 4.8 GB6 — approving a part and the final mark (owner decisions 2026-11-18)

**The owner's decisions.**
- **Per part.** The teacher approves each part (category) on its own («اعتماد الجزء»), then the final mark once every part is approved.
- **Locked; reopening is explicit.** An approved part cannot be edited. Reopening it is a separate action with a written reason
  (3–300 characters). It is kept in the approvals history and in the audit log (400 days, D17).
- **Students see approved parts only:** their own items and part mark, and the final mark once it is approved.

**Two safety rules, announced before the code (AGENTS.md §10).**
1. **No approval of an incomplete part.** Every student's every cell must be a mark (`graded`), the teacher's «صفر» or «معفى».
   A result awaiting review, a missing submission, a missing typed mark, a missing source, an unclassified cell or a withheld
   project column blocks it. Approval never turns any of them into a zero; the teacher decides cell by cell (GB5).
2. **No approval while results are hidden.** Every assignment in the part must have its results released to students now
   (`resultsReleased`, fail closed: an unknown mode or an unreadable assignment blocks).

**Storage.** `platform/gradebooks/<classId>/approvals.json` (read-modify-write with retry; a corrupt document is a 503 everywhere,
never read as «nothing approved», never overwritten):

```
{ schemaVersion: 1, classId, revision,
  parts: { <categoryId>: { approvedAt, approvedBy, schemeRevision,
                           snapshot: { categoryId, title, weight, items: [{ itemId, weight, source, title }],
                                       students: { <studentId>: { value, allExcused?, cells: { <itemId>: { state, percent? } } } } } } },
  final: null | { approvedAt, approvedBy, schemeRevision, snapshot: { weights: { <categoryId>: W }, students: { <studentId>: { value, adjusted? } } } },
  history: [ { action, categoryId?, at, by, reason? } ]          (the last 100; the audit log keeps every one) }
```

The snapshot is computed by the **same** `buildGradebook` as the table (the route's one computation), so what is approved is exactly
what the teacher saw. It is the only gradebook value ever stored, and the only one a student reads.

**Actions** (`POST /api/class-gradebook`; capability `assignments.results.release` — approving is publishing results):

| Action | Body | Refusals |
|---|---|---|
| `part.approve` | `categoryId`, `schemeRevision` | `STALE_SCHEME` (another revision), `PART_NOT_FOUND`, `PART_NOT_READY` with `issues`, `CLASS_ARCHIVED`. A repeated approval is `200 unchanged` and writes nothing. |
| `part.reopen` | `categoryId`, `reason` | `REASON_REQUIRED`, `NOT_APPROVED`, `FINAL_APPROVED` (reopen the final first) |
| `final.approve` | `schemeRevision` | `FINAL_NOT_READY`: `SCHEME_DRAFT`, `PARTS_NOT_APPROVED`, `PART_DRIFT`, `PART_WITHHELD`, `FINAL_INCOMPLETE`; `APPROVALS_CHANGED` |
| `final.reopen` | `reason` | `REASON_REQUIRED`, `NOT_APPROVED` |

**The lock.**
- `entries.save` refuses any cell of an approved part (`409 PART_APPROVED`, all or nothing).
- `scheme.save` refuses a change to an approved part's columns: its item ids, weights and sources, a manual column's maximum
  included, or its removal (`409 PART_APPROVED`). Its title and the parts' weights stay editable until the final is approved.
- An approved final refuses every scheme change (`409 FINAL_APPROVED`).

**Drift.** The gradebook still reads live sources: a regrade in the assignment page or a student who joins or leaves the class can
change a value after the approval. The page then shows `drift: { structure, students }` for that part or the final, and the final
cannot be approved over a drifted part. The approved value stays frozen. It reaches students only through reopen → approve again.
A part with a column this teacher may not see has `students: null` (unknown, never «unchanged»). A write racing an approval within
the same instant is reported as drift the same way.

**The teacher's read** adds `approvals` (approved parts with their drift, the final, the last 20 history entries without who) and
`readiness` (for each part not yet approved, and for the final: `ready` and the `issues` with counts), so the page can say why the
button is disabled.

**The student's read:** `GET /api/student-gradebook`.
- **Session:** the hardened student session (`requireActiveStudentSession`). An anonymous request, a forged token, or a disabled or
  archived account is `401`. `no-store`.
- **Classes:** the student's own (home and shared).
- **For each class with an approved part:** the parts, with their title, weight, the student's own cells and part mark (rounded for
  display, D6); and the final once approved.
- **Never:** another student's row, a part not approved, or who approved.
- **Results release, checked at every read:** a part whose assignment's results are hidden again is withheld, and the final with it.

**Cost.** One more document per teacher read (`approvals.json`; the GB7 repeat-open budget becomes class + scheme + entries +
approvals + the scheme's assignments). The student read: per class, the class and its approvals, plus the approved parts'
assignments for the release check.

**The pages (GB6b).**
- **The teacher: «اعتماد العلامات»**, under the table (`src/gradebook/GradebookApprovals.tsx`). One row per part and one for the final
  mark, with the reasons and the actions below. The server's `readiness` and `approvals` are only put in words
  (`approvalsView.ts`); nothing is decided on the page.
  - **Approved:** «✓ معتمد» with the date, and any change since, in words: «تغيّرت علامات N من الطلاب بعد الاعتماد … يرى الطلاب
    العلامات المعتمدة». A change that cannot be checked is said too, never shown as «unchanged».
  - **Not approved:** «جاهز للاعتماد», or «غير جاهز للاعتماد» with what to fix. For example: incomplete cells and how many students
    they concern, results not yet released by column title, or the parts still to approve.
  - **«اعتماد الجزء» / «اعتماد العلامة النهائية»** asks first, saying what students will see and what gets locked. It sends the scheme
    revision the teacher saw.
  - **«إعادة الفتح»** opens a dialog that needs a reason (3–300 characters). While the final is approved, a part's reopen waits for the
    final («أعد فتح العلامة النهائية أولًا»).
  - **«سجل الاعتماد»:** newest first, with the reason of each reopen.
  - **When the actions pause:** unsaved mark edits pause them, because an approval takes the stored values, not the unsaved ones.
  - **Who sees no action:** a teacher without `assignments.results.release` and an archived class see the statuses with no action.
- **The lock on the page.**
  - In «تعديل العلامات», an approved part's columns offer no decision, score or column menu, and its band says «✓ معتمد». The edit
    button disappears once every part is approved.
  - The scheme builder names the locked parts. An approved final opens it read-only.
  - The server refuses all of these on its own (409).
- **The student: «علاماتي»**, in the «التقدم» view after «تقدّمي» (`src/student/StudentGradebook.tsx`).
  - **Each approved part:** its title, its share of the final mark, its total, and each item's mark in words (the number, «0» for the
    teacher's zero, «معفى»). A state that is not a mark is never shown as a number.
  - **The final:** shown once approved; otherwise «العلامة النهائية لم تُعتمد بعد».
  - **Several classes:** each is named.
  - **When nothing shows:** nothing approved, a failed read or an expired session shows no section, like the project panel.
  - **When it reads:** once when the portal opens, like every other section (UX-S2: switching views reads nothing). The portal's
    opening reads are six instead of five, pinned in `StudentPortal.ux7a.test.tsx` and `StudentPortal.learningMaterials.test.tsx`.

### 4.9 GB8 — copying a scheme from another class (D7; owner decisions 2026-11-21)

**The owner's decisions.**
- **Copy from a class, not saved templates.** In a class's scheme builder, «نسخ من صف آخر» offers the teacher's other classes that
  have a scheme, archived ones included (last year's scheme is a good start). There is no new stored document.
- **An assignment column is matched by the same exam.** It maps to the target class's assignment made from the same exam
  (`sourceExamId`).

**The reads** (`GET /api/class-gradebook`; reading needs `assignments.assignment.view`; saving is the existing `scheme.save`):
- **`resource=copy-classes`:** the teacher's other classes with a scheme: name, school year, archived or not, part and column counts,
  newest scheme first. Another teacher's class is never listed.
- **`resource=copy&from=<classId>`:** the proposal (`api/src/lib/gradebook/copy.js`, pure). Nothing is written.
  - **A source the teacher may not see:** another teacher's class is `404 SOURCE_NOT_FOUND`, and nothing of it is read.
  - **Bad requests:** a class without a scheme is `404 SOURCE_HAS_NO_SCHEME`; the same class or a malformed id is `400`.

**The mapping.**
- **Parts:** titles and weights are copied as they are.
- **Manual columns:** title and maximum are copied as they are.
- **An assignment column** maps to the ONE reportable assignment of the target class with the same non-empty `sourceExamId`.
  Otherwise it is not copied and is listed with why:
  - `NO_MATCH`: none;
  - `AMBIGUOUS`: several, with the candidates named;
  - `SOURCE_MISSING`: the source assignment is gone, or does not belong to the source class;
  - `DUPLICATE`: the match is already used by another column.
- **Only the two classes' own assignments are used:** never a third class's, never another teacher's.
- **A project column** is copied when the target class has that project and the teacher holds `projects.tracker.view`. Otherwise
  it is listed (`PROJECT_NOT_IN_CLASS` / `WITHHELD`).
- **Nothing is rescaled (invariant 3):** a part that lost a column keeps the other weights. The scheme is then a draft until the
  teacher adds the replacement.
- **No ids travel with the proposal:** the page gives every part and column a new id, so a copied column never inherits marks stored
  under an id of the target's older scheme.

**The page.** «نسخ من صف آخر» sits at the top of the builder.
- **Flow:** pick a class → «نسخ». Replacing a scheme already in the builder asks first.
- **After the copy:** the builder shows the copied scheme and a notice: «نُسخ مخطط «…»: N من الأعمدة», with each column that was not
  copied, its part, weight and reason.
- **Saving:** nothing is saved before «حفظ».
- **When the copy is not offered:** on a read-only scheme (an archived class, no grading access) or a locked one (an approved part).

### 4.10 GB9 — a part with no exam: «علامة يرصدها المعلم» (owner feedback 2026-11-21)

**What the owner met.** Building a «الحضور والمشاركة» part, the builder seemed to require an exam.
- **Why it seemed so:** the first control in a part was «إضافة واجب أو امتحان أو مشروع». The way to add a mark the teacher enters,
  the manual column, sat below it under «عمود يدوي (امتحان ورقي مثلًا)», which reads as «a paper exam» only.
- **What already worked:** the server and the computation already supported a part made only of manual columns. This was a wording and
  layout problem.

**The change (presentation only; storage and rules unchanged):**
- **One term everywhere:** the manual column is now «علامة يرصدها المعلم». It is used in the builder, the item type («يرصدها المعلم»),
  the save messages (client and server), the edit bar and the copy panel.
- **Two equal boxes:** each part offers «من المنصة: واجب أو امتحان أو مشروع» and «علامة يرصدها المعلم (بلا واجب على المنصة)» side by
  side; on a phone they stack.
  - **The help line:** «للحضور والمشاركة والامتحان الورقي، وكل علامة تضعها بنفسك. ترصدها بعد الحفظ من «تعديل العلامات»».
  - **Suggested titles:** «الحضور والمشاركة», «الحضور», «المشاركة», «امتحان ورقي». A click only fills the title field.
- **The empty part says it:** «… أضف واجبًا أو امتحانًا من المنصة، أو علامة يرصدها المعلم بنفسه مثل الحضور والمشاركة».
- **A phone layout fix met on the way:** the text input's own width could make the box wider than the dialog (measured 325 px of
  content in a 298 px box at 390 px). The boxes' rows and fields now shrink to the box.

### 4.11 GB10 — «بناء المخطط بالذكاء الاصطناعي» (owner request and decisions 2026-11-22)

**The request.** A button in the scheme builder opens a window. The teacher describes the distribution of the final mark in words, and
AI builds the scheme: the parts and their shares, the columns of each part and their weights, chosen from the class's assignments.

**The plan** was reported before any code and approved on 2026-11-22 with all its recommendations:
- **Capabilities:** `assignments.grading.grade` (changing the scheme, O1) **and** `examBuilder.ai.use` (the owner's switch for AI
  authoring). No new capability.
- **Provider:** the configured OpenAI client (`quality-fix-ai-client.js`, strict structured output, no SDK retries), as for the
  question author. No new provider and no new key.
- **An assignment the teacher names that the class does not have** is listed («ما لم يُعثر عليه»). It is never turned into a manual
  column by itself. A manual column is proposed only for what the teacher describes as one (attendance, participation, a paper exam).
- **A proposal replaces the builder's draft** after the teacher confirms, like a GB8 copy. Editing the current scheme by a description
  («اجعل الفصل الثاني 50%») is a later phase (GB10c), designed after the owner has tried this one.

**The rule: the AI proposes, the teacher saves.** Nothing is written by the AI route. The proposal fills the builder; the teacher
reviews it and saves with the existing «حفظ» (`scheme.save`: its validation, its stale guard and its audit).

**The route** — `POST /api/gradebook-scheme-ai` `{ classId, description }` (`api/src/functions/gradebook-scheme-ai.js`):
- **Order of the checks, all before any provider call:**
  1. the teacher session;
  2. `assignments.grading.grade`, then `examBuilder.ai.use`, asked one after the other (a list in the registry means «any of»);
  3. the input: a safe `classId`, a description of 1–2000 characters;
  4. tenancy (another teacher's class is `404 CLASS_NOT_FOUND`, and nothing of it is read);
  5. an archived class is `409 CLASS_ARCHIVED`;
  6. a scheme an approval locks (an approved part or final) is `409 SCHEME_LOCKED`; a corrupt approvals document is `503`.
- **Rate limit:** `withAiRateLimit("gradebook-scheme-ai", "ai-general", …)` at registration (D3), so a refused request takes one
  token from the caller's own bucket and nothing else.
- **Answers:** `200 { ok: true, proposal }`; `200 { ok: false, code: "AI_NO_SCHEME" | "AI_RESPONSE_MALFORMED", message }`;
  `502 AI_PROVIDER_FAILED` (the provider's own text never reaches the teacher); `504 AI_TIMEOUT` (25 s); `502 AI_RESPONSE_INVALID`
  (below). The description is never logged.

**What the model is shown** (`api/src/lib/gradebook/ai-proposal.js`, pure):
- the teacher's description, inside delimiters, as text and not as instructions;
- the class's sources — the ONE list the builder offers (`api/src/lib/gradebook/class-sources.js`, shared with
  `resource=sources`):
  - each under an opaque reference: `A1`, `A2`… for the assignments and exams, the oldest first, so «الامتحان الأول» reads naturally;
    `P1`… for the projects, listed only when the session holds `projects.tracker.view`;
  - with its title, total marks and publication date;
  - at most the 150 newest assignments, and the prompt says when some were left out.
- **Never:** an assignment id, a project code, a student, a mark, the class's name, or anything of another class.

**What the server does with the answer** (strict JSON schema; every value judged again here):
- **Sources:** an item's reference must be one of the references shown, used once in the scheme. An invented one is listed
  (`UNKNOWN_SOURCE`), a second use is listed (`DUPLICATE`). Only a shown reference can become a column.
- **Manual columns:** title cleaned (120 characters at most). The maximum is only the one the teacher stated (1–1000); a missing one
  is listed (`MANUAL_MAX_MISSING`) and never invented, because a wrong maximum would give every mark typed later a wrong percentage.
- **Weights** (invariant 3: nothing is rescaled):
  - `stated` — the teacher's number is kept as it is, even when the list does not reach 100 (the scheme is then a draft and the
    builder says so);
  - `equalShare` — «بالتساوي», «الباقي بالتساوي», or no weight given: computed HERE, in hundredths, from what the valid stated weights
    leave of 100, the remainder going to the first ones (the builder's «توزيع بالتساوي» rule). The model's own arithmetic is ignored.
    Nothing left → no weight;
  - `suggested` — a weight the model chose because the teacher asked it to; named in the notes.
  - An invalid weight (0, over 100, more than two decimals) becomes **no weight**: an empty field the teacher must fill, which blocks
    «حفظ». It is never coerced.
  - The shares are computed over every column the model listed, so a column that could not be built keeps its weight in the list,
    and the others are not redistributed (the GB8 rule).
- **Limits:** ten parts and forty columns a part, like the builder; the rest is dropped with a note.
- **What the model could not find** is listed with the titles of the candidates it named, and only of references that exist.
- **Notes:** the server adds its own notes (equal shares, suggested weights, no remainder, a part without a title) to the model's
  assumptions (six at most).
- **Defence in depth:** before answering, the proposal (with temporary ids) must pass the server's own `validateScheme` for this
  class. Otherwise it is `502 AI_RESPONSE_INVALID`: the AI can never propose what «حفظ» would refuse for a structural reason.
- **No ids travel** with the proposal: the page gives every part and column a new one, as for a GB8 copy.

**The page** (`src/gradebook/SchemeAiDialog.tsx`, loaded on its first opening):
- **The button:** «بناء المخطط بالذكاء الاصطناعي» sits beside «نسخ من صف آخر». It is not offered on a read-only scheme, a locked one,
  or to a teacher without `examBuilder.ai.use` (presentation only: the server asks again).
- **The window:**
  - a help text, three example descriptions (a click fills the field), and the field (2000 characters, with a counter);
  - the privacy line: only the description and this class's assignment titles are sent, no student names and no marks;
  - «اقترح المخطط».
- **On success:** replacing a non-empty draft asks first. The builder then shows the proposal and a notice:
  - «بنى الذكاء الاصطناعي N من الأقسام وM من العناصر»;
  - each mention not built, with why and «ربما تقصد: …»;
  - the notes and assumptions.
  A weight still to type is an empty field.
- **On a refusal:** «لم أفهم من الوصف…», a rate limit or a provider failure keeps the window open with the server's message.

## 5. Phases

| Phase | Scope | Specific evidence |
|---|---|---|
| **GB0** | This design record | none (documentation only) |
| **GB1** | `api/src/lib/gradebook/` with scheme validation (§4.2) and computation (§4.3), pure | unit tests for every state of §4.3 and the example of §4.4. **Mutation proof** on invariants 1–3 (for example: a missing cell counted as 0, a pending result counted, no draft on a sum of 99). |
| **GB2** | The route (§4.5), its capability declaration (O1), the project-column evidence (state 6b) and the audit | capability declaration and the route sweep; tenancy; 409 on a stale write; 503 on a storage error; reads limited to the assignments in the scheme |
| **GB3** | The scheme builder UI | component tests; the bundle guard |
| **GB4** | The gradebook table, the drill-down, the export and print | component tests; accessibility (labels, not colour alone) |
| **GB5** | Manual columns, the excused / zero decisions, the column actions | stale guard; audit; **mutation proof** on «no zero without a decision» |
| **GB6a** | Approval per part and of the final, lock, reopen with a reason, the student read (§4.8) | tests that an incomplete or unreleased part is never approved and that a student sees only their frozen approved row; **mutation proof** (§8) |
| **GB6b** | The teacher's approval buttons and locked display; the student's «علاماتي» | component tests; the bundle guard |
| **GB9** | «علامة يرصدها المعلم» made clear in the builder (§4.10) | a part with no assignment built and saved through the real builder; layout measured at 390 px and 1440 px |
| **GB8** | Copying a scheme from another class (D7, §4.9) | tenancy (another teacher's class never read); match by the same exam; nothing rescaled; new ids; **mutation proof** (§8) |
| **GB7** | Performance (a class of 40 students × 30 columns) and the final review | measured read count and time |
| **GB10** | «بناء المخطط بالذكاء الاصطناعي» (§4.11): the pure proposal module, the route, its two capabilities and rate limit, the window | what the model is shown (no id, student, mark or other class); every refusal before any provider call; nothing written; weights never rescaled; **mutation proof** (§8) |

Every phase runs the minimum set of `AGENTS.md` §12: `npm test`, `npm run lint`, `npx tsc -b`, `npm run build` and
`git diff --check`. No phase touches the Runner or the official grading path. The gradebook only **reads** grading results.

## 6. Open points (settled in the phase named)

- **O1 (GB2) — settled 2026-11-18: reuse the assignment capabilities.** The presets in `api/src/lib/access/presets.js` are built
  from `TEACHER_CAPABILITIES` (`legacy-full` and both `full-teaching` versions), and a teacher's capabilities are computed from the
  preset on every read. Adding a capability would therefore change already-published preset versions, which are meant never to
  change, and no capability has been added since the registry was created (no precedent). The owner chose the option that changes
  no preset: `assignments.assignment.view` to read, `assignments.grading.grade` to write, and `projects.tracker.view` in addition for
  project columns. D5 is superseded. Every teacher who grades assignments can use the gradebook at once, in both modes.
- **O2 — settled in GB3: where the gradebook lives.** The class page offers no tabs: the selected class's content is a sequence of
  panels (the roster, then «المواد التعليمية لهذا الصف»). The gradebook is the next panel, «سجل العلامات», under the same convention. GB4
  adds the table of marks to it.
- **O3 — settled 2026-11-18 (GB6): approval per part, locked, students see approved parts only.** Designed in §4.8.

## 7. GB7 — performance at 40 students × 30 columns

Measured by `api/tests/class-gradebook-perf-gb7.test.js`, which runs the real route over the in-memory container with a fixed 4 ms
latency on every download and listing:
- **The class:** 40 students and 30 columns (28 assignments with every submission present, and 2 manual columns).
- **What is checked:** all 40 final marks against an independent computation.

| | Before GB7 (`main` `fcdc9db7`) | After GB7 |
|---|---|---|
| First open: wall time | 755 ms (columns read one after another) | **166 ms** (columns read concurrently) |
| First open: submission downloads | 1 120 | 1 120 (each read once) |
| Repeat open, nothing changed: downloads | ~1 190 (every submission again) | **31** (class, scheme, entries, 28 assignment documents); **0 submissions** |
| One submission changed | 1 120 downloads again | **1** download, and its new mark is shown at once |

**How:**
- **Concurrent columns:** the assignment columns are read concurrently, within the platform's read concurrency.
- **The shared document cache:** their submissions go through the ETag-verified cache already used by «الصفوف والطلاب» and the Reports
  Center (`classes-students-read-cache`). Each assignment's submissions are listed on every request, so nothing is stale. A
  submission is downloaded only when it is new or its ETag changed.
- **Roster only:** only the roster's students are downloaded. A submission left by a student who is no longer in the class is listed
  but never read.

**Mutation proof (route):** P1 (the missing-source check), P2 (the roster filter) and P3 (the concurrency) are each KILLED. P2
survived the first run and was killed after the test recorded a non-roster submission.

**Limits:**
- The cache holds at most 32 MB (LRU, shared with the other readers). A larger school re-downloads what was evicted: still correct,
  only slower.
- The first open of a class still reads every submission once (1 120 here).

## 8. Final review and handover

**Safety invariants and their proof:**

| Invariant (§4.7) | Proven by |
|---|---|
| Nothing becomes a zero by itself; only a recorded decision is a zero | GB1 M1, M2; GB5 U1–U3; GB2 G16 |
| A result that is not final never counts | GB1 M3, M9, M11, M12; GB2 G15 |
| Weights are never rescaled silently | GB1 M4, M5, M14 |
| Tenancy, capability, archived read-only, storage errors as 503 | GB2 G1–G4, G14; P9-B1 route sweep |
| A stale write never overwrites | GB2 G5, G6; GB5 U4, U5 |
| Project data only with `projects.tracker.view` | GB2 G7, G8, G13; GB5 U8 |
| Reads limited to the scheme's assignments and the roster | GB2 G11; GB7 P1, P2 |
| GB6: a part is approved only when complete, never with a result awaiting review or a missing cell | GB6a G6-1, G6-2, G6-20; GB6b U6-7 |
| GB6: a student never sees a mark withheld by its results release; a corrupt approvals document is a 503 | GB6a G6-3, G6-9, G6-11, G6-22, G6-23 |
| GB6: a student sees only their own frozen approved row, never a live value or another row | GB6a G6-10; GB6b U6-1, U6-8 |
| GB6: an approved part is locked; reopening is explicit, with a reason | GB6a G6-5–G6-8, G6-17; GB6b U6-2, U6-5, U6-6, U6-11 |
| GB6: a change after the approval is reported, never hidden | GB6a G6-13, G6-14, G6-16, G6-24; GB6b U6-9, U6-10 |

**Mutation total:** 18 (GB1) + 16 (GB2) + 8 (GB5) + 3 (GB7) = **45 planted defects, 45 KILLED**. Four survived a first run (GB2 G7, GB5 U3,
GB7 P2, and none in GB1). Each was killed by a stronger test, and none was declared equivalent.

**With GB6:** 45 + 26 (GB6a) + 12 (GB6b) = **83 planted defects**.
- **81 KILLED.**
- **G6-12, equivalent:** it survived because the same columns and cells always give the same mark, so the comparison it removed was
  redundant. That comparison was deleted from the code.
- **G6-18, a double guard:** it removes one of two idempotency guards, and the other guard still answers the same, so it survives.
  Removing both (G6-18+) is killed.

**GB8 mutation proof:** 11 planted, 11 KILLED (one, M8-4, after a new test).
- **Planted:**
  - an ambiguous match taken as the first;
  - the source class's tenancy removed, and the list's tenancy removed;
  - a source column's assignment from another class accepted;
  - a duplicate match allowed;
  - withheld project columns copied;
  - target assignments not limited to the class;
  - copied ids reused;
  - a replace without asking;
  - the copy offered on a locked scheme;
  - a weight changed.
- **The survivor:** M8-4 survived the first run. It is now killed by «a stored source column pointing at another class's assignment
  is «gone»».
- **Restore:** files restored byte-for-byte, SHA-256 checked.

**GB6a mutation proof** (`api/src/lib/gradebook/approval.js`, `class-gradebook.js`, `student-gradebook.js`, the capability registry).
- **Planted:** 26 defects (G6-1 … G6-25, plus G6-18+). Among them: a pending or missing cell counted as final, the release check
  dropped, each lock removed, the reason not required, a student shown a hidden-release part or another student's row, a corrupt
  approvals document read as empty, drift blind to cells or to new students, the final approved without every part or despite
  drift, the capability weakened, `no-store` dropped.
- **Result:** all killed except three on the first run.
  - G6-13 (drift blind to a cell whose change leaves the part mark equal) was killed by a new test.
  - G6-12 (drift blind to the part mark) was equivalent: the same columns and cells give the same mark. The redundant comparison was
    removed from the code rather than kept.
  - G6-18 (one of the two idempotency guards removed) survived because the atomic guard inside the write answers the same. Removing
    both (G6-18+) is killed.

**GB6b mutation proof** (the pages): 12 planted, 12 KILLED.
- **Planted:**
  - a non-mark shown as «0» to a student;
  - an approved part's columns left editable;
  - approving without asking;
  - unsaved edits not pausing the actions;
  - an empty reason accepted;
  - a part reopenable under an approved final;
  - approval offered on a part that is not ready;
  - an empty answer shown as a section;
  - drift hidden;
  - unknown drift shown as unchanged;
  - an approved final's scheme left editable;
  - approval offered without `assignments.results.release`.
- **Restore:** files restored byte-for-byte, SHA-256 checked.

**What the teacher has:** in «الصفوف والطلاب» → the selected class → «سجل العلامات»:
- **The scheme:** parts and weights, and the assignments, projects and manual columns in each part.
- **The table:** every state written in words, each part's total, and the final mark with its status.
- **Navigation and export:** a drill to an assignment's review, and Excel / CSV / print.
- **Editing:** manual marks and «معفى» / «صفر» decisions, with column actions limited to non-submitters.
- **Approval (GB6):** each part, then the final mark, once complete and released. The part is then locked, and reopening it needs a
  reason. Students see the approved parts in «التقدم» → «علاماتي».
- **Copying a scheme (GB8):** «نسخ من صف آخر» in the builder. Assignments are matched by the same exam, and what cannot be copied is
  listed.

**Postponed or open, for the owner:**
- **Repository follow-ups met on the way, outside this feature:**
  - **The Exam Studio's step circles — fixed.** They rendered a few edge pixels two ways from one capture to the next, on `main`
    itself, and failed the visual gate with no change on #669, #679 and others. The cause was Chromium drawing a round badge at a
    fractional position differently from one session to the next. Fixed in the capture harness by #681 (UX-R19b-fix3:
    deterministic-raster flags), which was measured stable.
    - **#680 closed unmerged:** it was a parallel fix for the same defect, giving the stepper its own compositing layer, and became
      redundant once #681 was merged.
  - **The Static Web App's preview-environment limit** refused the PR previews of #666, #669, #675 and #679. A slot was free again on
    2026-11-21 (#680's preview was created). Closing stale PRs or removing old preview environments frees one.
  - **`web-push` 4.0** (Dependabot #655) is ESM-only, and its upgrade failed the push test. It is done in its own change
    (`feature/web-push-4`), recorded in `docs/enterprise-breakdown-push-d4.md` §7. The minor updates of #654 are merged.
