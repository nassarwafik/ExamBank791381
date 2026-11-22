# Read-cost baseline: one teacher's reads versus everyone's data (PERF-1)

Phase 12E-A measured the three hottest read paths and 12E-B gave two of them a per-class index (`read-cost-baseline-12e.md`).
PERF-1 measures the next tier: routes a teacher opens many times a day that still **list a whole prefix and download every
document in it**, then keep the teacher's own. Nothing in this phase changes code, storage, response shapes or behaviour.

Guard: `api/tests/read-cost-tenancy-noise-p1.test.js` (real handlers, real in-memory container, `tests/helpers/read-cost.js`).
It is a **BASELINE**: it pins today's scaling on purpose. A phase that adds class-scoped reads for these routes replaces those
expectations together with that change and its proof. `PERF1_PRINT=1` prints the table below.

## What was measured

Teacher A: one class, 10 students, 4 published assignments, every submission present, a gradebook scheme over the 4 assignments.
Each **other** teacher has the same shape: 1 class, 10 students, 4 assignments, 40 submissions. The body of teacher A is checked
identical for 0, 5 and 20 other teachers (tenancy holds; nothing of another teacher appears). Cold is a new instance (empty
ETag-verified document cache); warm is the next request on the same instance.

| Route (teacher A) | Whole prefixes downloaded | Cold reads, 0 / 5 / 20 other teachers | Added per other teacher | Warm reads at 20 |
|---|---|---|---|---|
| `GET /api/class-gradebook?classId=…` («سجل العلامات») | users | 58 / 108 / 258 | +10 (their students) | 8 |
| `GET /api/class-gradebook?…&resource=sources` | assignments | 5 / 25 / 85 | +4 (their assignments) | 1 |
| `GET /api/reports?type=class` | users, assignments | 56 / 126 / 336 | +14 | 2 |
| `GET /api/reports?type=overview` | users, classes, assignments | 55 / 130 / 355 | +15 | 0 |

Other teachers' submissions are never downloaded by these four routes (only teacher A's own submission folders are listed and
read), and the number of listings does not grow. The growth is linear: 5 teachers add exactly a quarter of what 20 add.

**Formula (cold, these routes):** `downloads = own documents + U_other·[users scanned] + C_other·[classes scanned] + A_other·[assignments scanned]`.

## What it means at school scale

Illustration only, not a measurement of production: 30 teachers × 150 students and 40 assignments a year each is 4 500 user
documents and 1 200 assignment documents a year; the assignments accumulate across years. On a cold instance, one gradebook open
downloads all 4 500 user documents, and one reports overview downloads every user, class and assignment ever stored. A warm
instance avoids the downloads (the cache verifies each ETag against the listing), but still lists every prefix on every request.
The cache holds at most 20 000 documents / 32 MB per storage account (`api/src/lib/etag-doc-cache.js`). Beyond that it evicts,
and warm requests turn cold again.

## Other whole-platform scans found by reading the code (not measured here)

| Where | What it reads on each request |
|---|---|
| `api/src/functions/manage-students.js` (student list with assignments) | every assignment document and a listing of **every submission name** on the platform |
| `api/src/lib/pending-grading.js` («بانتظار التصحيح») | every assignment document and a listing of every submission name |
| `api/src/lib/teacher-analytics-core.js` | every assignment, class and user document, and every submission name |
| `api/src/functions/assignment-results.js`, `assignment-item-analysis.js` | every user document, to build one class's roster |
| `api/src/functions/reports.js` `type=filters`, `teacher-achievement-feed.js`, `project-tracker.js` | every class document |

A submission-name listing returns at most 5 000 names per page, so it costs one round trip per 5 000 submissions on the
platform, and it grows with every school year that stays in storage.

## Recommended follow-up (each is its own reviewed phase)

1. **Before any code: confirm the 12E-B index is AUTHORITATIVE in production.** Until the owner activates it
   (`assignment-index-control`, `read-cost-baseline-12e.md` §"Phase 12E-B AFTER"), the student dashboard and teacher Today still
   scan every assignment.
2. **A membership-safe roster read per class.** This removes the largest term, users: +10 reads per other teacher in this
   fixture, and the whole student body in production. The existing roster index (`classroom.studentIds`,
   `api/src/lib/class-roster-index.js`) **cannot** be used as it is. By its own rule it is a display cache that never decides
   membership; the user documents decide. A design that keeps the user documents authoritative but reads only the candidates is
   needed, for example the index ids downloaded by name, each still checked with `isStudentClassMember`, plus a reconciliation for
   students the index misses. Any design here is reviewed against the tenancy and identity rules of `AGENTS.md` §10.
3. **Assignments by class for teacher views.** The 12E-B index carries published ids only. Gradebook sources and reports also need
   closed assignments, so they need either an index of every reportable status or a per-teacher listing. That is a design decision
   for the owner, because reportability is grading semantics.
4. **Submission folders instead of the global submission listing** in `manage-students` and `pending-grading`: list
   `platform/submissions/<assignmentId>/` for the teacher's own assignments only.

Each step must keep tenancy, fail closed on an unreadable or untrusted index (as 12E-B does), and replace the matching BASELINE
expectation in the guard with the new measured formula.
