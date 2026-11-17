# Class gradebook — «سجل العلامات الصفي» (Phases GB0–GB7)

**Status:** GB0 (this design record). No code yet. Each later phase is its own branch and pull request, with exact-head CI,
an independent review and the owner's manual merge (`AGENTS.md` §3, §13).

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
| D5 | **Two new capabilities:** `grades.book.view` (read the gradebook) and `grades.scheme.manage` (edit the scheme, enter manual marks, record excused / zero decisions). How they reach existing teachers is settled in GB2 (§6, open point O1). | GB2 |
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
| 6 | Project: a grade exists | the project grade (0–100) | yes |
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
| `GET ?classId=` | `grades.book.view` | the scheme, the columns, the rows (values, states, category and final with status), the warnings, and the ETags |
| `scheme.save` | `grades.scheme.manage` | validate and save the scheme (`If-Match`) |
| `entries.save` | `grades.scheme.manage` | manual scores and decisions, up to 300 items, each with `expected` (stale guard) |
| `sources` | `grades.book.view` | the class's reportable assignments and projects that can be picked |

The route's authority checks:

- **The teacher session and tenancy:** the teacher reads and writes only their own classes.
- **An archived class is read-only:** reading is allowed, writing is refused.
- **Storage errors:** a storage error answers 503 and is never treated as an empty gradebook.
- **Reads:** the route reads **only the submissions of the assignments named in the scheme**, never every assignment of the
  platform. It reads them through the ETag document cache, with `mapConcurrent`.
- **What the route never returns:** answer keys, per-question grades, codes or passwords. Its output is marks and states only.

### 4.6 User interface

The gradebook is a «سجل العلامات» tab inside the class page.

1. **The scheme builder (GB3).**
   - One card per category, holding the category's title and weight.
   - Items are added with a picker that lists the class's published assignments and exams, its projects, and «عمود يدوي».
   - Each item has a weight field.
   - A sum indicator on each card and for the whole scheme: green at 100, red otherwise, with «توزيع بالتساوي».
   - Saving shows the draft state when a sum is not 100.
2. **The gradebook table (GB4).**
   - **Columns:** grouped under a band per category, as in the owner's example. Each column header shows the item's title and
     weight. After its items comes the category's total column, and the final column comes last.
   - **Layout and colours:** the student column is sticky. The cell states of §4.3 each have a colour and a text label; the
     label is shown, not the colour alone.
   - **Filters:** الكل / ناقص / بانتظار التصحيح.
   - **Drill-down:** a click on an assignment cell opens that student's review in the assignment page (the existing drill target).
   - **Export and print:** export to Excel (RTL, with a status column) and print.
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
| **GB2** | The route (§4.5), the capabilities (D5, O1) and the audit | capability declaration and the route sweep; tenancy; 409 on a stale write; 503 on a storage error; reads limited to the assignments in the scheme |
| **GB3** | The scheme builder UI | component tests; the bundle guard |
| **GB4** | The gradebook table, the drill-down, the export and print | component tests; accessibility (labels, not colour alone) |
| **GB5** | Manual columns, the excused / zero decisions, the column actions | stale guard; audit; **mutation proof** on «no zero without a decision» |
| **GB6** (optional) | Approving a term (a frozen snapshot with its audit) and showing the gradebook to students | tests that a withheld mark never reaches a student |
| **GB7** | Performance (a class of 40 students × 30 columns) and the final review | measured read count and time |

Every phase runs the minimum set of `AGENTS.md` §12: `npm test`, `npm run lint`, `npx tsc -b`, `npm run build` and
`git diff --check`. No phase touches the Runner or the official grading path. The gradebook only **reads** grading results.

## 6. Open points (settled in the phase named)

- **O1 (GB2): how the new capabilities reach existing teachers.** The presets in `api/src/lib/access/presets.js` are built from
  `TEACHER_CAPABILITIES` (for example `legacy-full` is «every teacher capability»). So adding a capability to the registry also
  adds it to every published preset version that is built this way. Those versions are meant never to change. GB2 must:
  1. check whether the registry has an established way to add a capability (a new preset version, as `full-teaching` v2 did, or
     an accepted addition to the existing versions);
  2. present the choice to the owner before implementing it.

  Under `observe` mode nothing is refused either way. Under `enforce`, a teacher without the capability does not see the
  gradebook until the owner grants it.
- **O2 (GB4): where the tab lives.** The gradebook belongs to the class page, but the class page may not offer tabs. GB4 reads the
  class page's current layout and keeps the existing navigation conventions.
- **O3 (GB6): a term approval.** A frozen snapshot is the only gradebook value ever stored. Its form (per term, per scheme
  revision) is designed in GB6, if the owner opens that phase.
