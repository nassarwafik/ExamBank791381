# Class gradebook — «سجل العلامات الصفي» (Phases GB0–GB7)

**Status:**
- **Merged:** GB0 (nassarwafik/ExamBank791381#660), GB1, the computation engine (nassarwafik/ExamBank791381#662), and GB2, the route
  (nassarwafik/ExamBank791381#663).
- **In review:** GB3, the scheme builder (nassarwafik/ExamBank791381#664).
- **In progress:** GB4, the table of marks, on `feature/gb4-gradebook-table`.

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
| D7 | **Scheme templates** (copy one class's scheme to another class) are a later feature, after GB4. | after GB4 |

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

### 4.7 Safety invariants (enforced by tests and mutation proof)

1. A missing, pending, unclassified or missing-source cell never contributes a zero. Only a recorded `zero` decision does.
2. A result that is not `final` never counts.
3. Weights are never rescaled silently. A sum that is not 100 means a draft and no final.
4. One teacher never reads or writes another teacher's class, and a storage error is never read as «no data».
5. A stale write is refused (`409`) and never overwrites the newer value.
6. GB6 only: a student never sees a gradebook value that depends on a mark withheld by its results release.

## 5. Phases

| Phase | Scope | Specific evidence |
|---|---|---|
| **GB0** | This design record | none (documentation only) |
| **GB1** | `api/src/lib/gradebook/` with scheme validation (§4.2) and computation (§4.3), pure | unit tests for every state of §4.3 and the example of §4.4. **Mutation proof** on invariants 1–3 (for example: a missing cell counted as 0, a pending result counted, no draft on a sum of 99). |
| **GB2** | The route (§4.5), its capability declaration (O1), the project-column evidence (state 6b) and the audit | capability declaration and the route sweep; tenancy; 409 on a stale write; 503 on a storage error; reads limited to the assignments in the scheme |
| **GB3** | The scheme builder UI | component tests; the bundle guard |
| **GB4** | The gradebook table, the drill-down, the export and print | component tests; accessibility (labels, not colour alone) |
| **GB5** | Manual columns, the excused / zero decisions, the column actions | stale guard; audit; **mutation proof** on «no zero without a decision» |
| **GB6** (optional) | Approving a term (a frozen snapshot with its audit) and showing the gradebook to students | tests that a withheld mark never reaches a student |
| **GB7** | Performance (a class of 40 students × 30 columns) and the final review | measured read count and time |

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
- **O3 (GB6): a term approval.** A frozen snapshot is the only gradebook value ever stored. Its form (per term, per scheme
  revision) is designed in GB6, if the owner opens that phase.
