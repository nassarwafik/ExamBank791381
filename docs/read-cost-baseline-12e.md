# Read-cost baseline (Phase 12E-A)

These are the storage operations per request on the three hottest read paths, measured at the commit that adds this
file. Each number was produced by the **real** handler running over the **real** in-memory blob container
(`listBlobsFlat`, `download`, `upload`), counted by `api/tests/helpers/read-cost.js`. A 404 download still counts as
one round trip. Nothing in this phase changes storage, response shapes or behaviour.

Guards: `api/tests/read-cost-student-dashboard-12e.test.js`, `read-cost-teacher-today-12e.test.js` and
`read-cost-notifications-12e.test.js`. The tests marked **BASELINE** pin today's scaling on purpose. Phase 12E-B is
expected to change them, so update them only together with that change.

## Student dashboard — `GET /api/student-dashboard`

**Algorithm**
1. Session: read the student document.
2. Read the class document.
3. `listJson("platform/assignments/")`: **one listing, then a download of every assignment document** in every class,
   including drafts and archived ones.
4. Keep the published assignments of the student's class.
5. Read one submission per kept assignment, with bounded concurrency; a missing one is a 404.
6. Fixed reads: practice, study and game-results documents, plus the class projects (none in the fixtures).

**Variables**
- `A_total`: all stored assignment documents.
- `P_class`: published assignments of this student's class.
- `K`: fixed documents. `K = 5` for a class without projects: user, class, practice, study, games.

**Formula (measured)**

    lists     = 1
    downloads = K + A_total + P_class
    uploads   = 0   (stage milestone and recognition injected; they are separate authorities)

| Fixture | A_total | P_class | lists | assignment downloads | submission reads | total downloads |
|---|---|---|---|---|---|---|
| S0 | 0 | 0 | 1 | 0 | 0 | 5 |
| S1 | 1 | 1 | 1 | 1 | 1 | 7 |
| S10 | 10 | 10 | 1 | 10 | 10 | 25 |
| S50 | 50 | 50 | 1 | 50 | 50 | 105 |
| S-OTHER (3 own + 100 other class + 5 drafts + 5 archived) | 113 | 3 | 1 | 113 | 3 | 121 |
| BASELINE P_class=1, A_total=1 / 10 / 100 | 1 / 10 / 100 | 1 | 1 | 1 / 10 / 100 | 1 | 7 / 16 / 106 |

**Trend:**
- Assignment **metadata** reads grow with `A_total`, the global scan. One class assignment plus 100 unrelated ones
  costs 100 extra downloads for an identical response.
- Submission reads grow with `P_class` only. Drafts, archived assignments and other classes never trigger a submission
  read.

## Teacher Today — `GET /api/teacher-today`

**Algorithm**
1. `listJson` of assignments, classes and users, in parallel: three listings, and every document of each is downloaded.
2. Keep published assignments of **active** classes.
3. For each kept assignment, list its submission folder (`platform/submissions/<id>/`) and download every document in
   it, with bounded concurrency.
4. The unread-messages summary and the project-evaluation sources are separate optional blocks. They were stubbed in
   the measurement and are not part of these numbers.

**Variables**
- `A_total`, `C_total`, `U_total`: all assignment, class and user documents.
- `P_active`: published assignments of active classes.
- `S_active`: submission documents in those folders.

**Formula (measured)**

    lists     = 3 + P_active
    downloads = A_total + C_total + U_total + S_active
    uploads   = 0

| Fixture | A | C | U | P_active | S_active | lists | downloads |
|---|---|---|---|---|---|---|---|
| T0 (empty) | 0 | 0 | 0 | 0 | 0 | 3 | 0 |
| T1 | 1 | 1 | 3 | 1 | 2 | 4 | 7 |
| T10 (10 × 3 submissions) | 10 | 1 | 3 | 10 | 30 | 13 | 44 |
| T-MANY-ARCHIVED (1 published + 30 archived + 10 drafts) | 41 | 1 | 3 | 1 | 2 | 4 | 47 |
| T-MANY-OTHER/INACTIVE (1 active + 40 in an archived class) | 41 | 2 | 6 | 1 | 2 | 4 | 51 |
| BASELINE fixed relevant set + 0 / 10 / 100 archived | 1 / 11 / 101 | 1 | 3 | 1 | 2 | 4 | 7 / 17 / 107 |

**Trend:**
- The assignment, class and user scans grow with `A_total`, `C_total` and `U_total`.
- Submission-folder listings grow with `P_active`, and submission downloads grow with `S_active`.
- Drafts, archived assignments and assignments of archived classes are downloaded by the global assignment scan, but
  **never** cause a submission-folder listing or a submission download.

## Notification Center — `GET /api/student-notifications`

This path is **not** a global assignment-scan problem today, and the guards keep it that way:
- It never lists `platform/assignments/`. It lists only the student's own event streams and the Phase 5D message
  streams.
- It reads one assignment document per **distinct** assignment among the classified events, cached per request. Twelve
  events about one assignment cost one read; five distinct assignments cost five.
- Unrelated historical assignments do not change its operations: 0 and 300 stored assignment documents produce an
  identical list and download sequence.
- Its bounds are unchanged: `EVENT_SCAN_LIMIT = 1000` classified events per stream, and `CENTER_LIMIT = 10` preview
  items.

## Safe observability

Each successful request emits one count-only info event. Only finite, non-negative numbers pass `lib/read-cost-log.js`,
and a logger failure never fails the request. The public responses are unchanged.

- `student.dashboard.read_cost` has these fields: `assignmentDocsScanned`, `publishedClassAssignments` and
  `submissionReads`.
- `teacher.today.read_cost` has these fields: `assignmentDocsScanned`, `classDocsScanned`, `userDocsScanned`,
  `publishedActiveAssignments`, `submissionFolderListings` and `submissionDocsLoaded`.

## Phase 12E-B target (not implemented here)

- **Student dashboard:** assignment metadata reads should depend on the student's **class assignment set**, not on
  every historical assignment in every class. Concretely, the `A_total` term should become a function of that class's
  assignments, and the BASELINE fixtures (`P_class = 1`, `A_total = 1 / 10 / 100`) should no longer grow.
- **Teacher Today:** assignment and submission work should depend on the **active, relevant classes** and their
  relevant assignment set, not on old, unrelated assignment history. The BASELINE fixture with a fixed relevant set and
  0 / 10 / 100 historical assignments should no longer grow with that history.

No storage design is prescribed by these measurements beyond that target.

---

# Phase 12E-B AFTER — published assignment class index

Everything above this line is the **12E-A BEFORE** measurement, kept unchanged for comparison. The 12E-B guards in
`read-cost-student-dashboard-12e.test.js` and `read-cost-teacher-today-12e.test.js` replace the 12E-A **BASELINE**
guards. They measure every scenario twice with the real handler over the real in-memory container: once **cold** (no
class index yet, the first request after deploy) and once **warm** (steady state). Cold and warm numbers are reported
separately and are never averaged.

## Index storage shape

One JSON document per class:

    platform/assignment-index/classes/<classId>.json
    { "schemaVersion": 1, "classId": "<classId>", "ready": true,
      "publishedAssignmentIds": ["<assignmentId>", ...], "updatedAt": "<ISO time>" }

- `publishedAssignmentIds` is a de-duplicated, sorted set of safe ids.
- `ready: true` means the set is **complete**: a reader may trust it instead of scanning. A writer that adds a pointer
  to an absent index creates it with `ready: false`, so an index is only ever made ready by a bootstrap that has seen
  the full legacy scan.
- A missing, unreadable, malformed, wrong-class, wrong-schema or `ready: false` document is treated as **cold**.
- Class ids that are not safe ids (`/^[A-Za-z0-9_-]{1,128}$/`) are never indexed. Their readers always scan.
- The index carries only ids. It contains no title, mark, student, submission or answer content.

Code: `api/src/lib/class-assignment-index.js`. Writers: `api/src/functions/manage-assignments.js` only (the writer
audit found no other code that writes assignment documents).

## Student dashboard — `GET /api/student-dashboard` (AFTER)

**Steady state (warm, ready class index)**
1. Session and class document, as before.
2. Read the class index: **one** download.
3. Download each pointed-to assignment and re-validate it (exists, `status` is published, `classId` matches).
4. Submission reads and fixed reads, unchanged.

    lists     = 0
    downloads = K + 1 + P_class + P_class
    uploads   = 0

**Cold bootstrap (first request for the class)**

    lists     = 1   (the legacy platform/assignments/ scan, once)
    downloads = K + 1 index read + A_total + 1 bootstrap CAS read + P_class
    uploads   = 1   (the class index, written with ready: true)

| Fixture | A_total | P_class | BEFORE lists / downloads | AFTER cold lists / downloads / uploads | AFTER warm lists / downloads |
|---|---|---|---|---|---|
| S0 | 0 | 0 | 1 / 5 | 1 / 7 / 1 | 0 / 6 |
| S1 | 1 | 1 | 1 / 7 | 1 / 9 / 1 | 0 / 8 |
| S10 | 10 | 10 | 1 / 25 | 1 / 27 / 1 | 0 / 26 |
| S50 | 50 | 50 | 1 / 105 | 1 / 107 / 1 | 0 / 106 |
| S-OTHER (3 own + 100 other class + 5 drafts + 5 archived) | 113 | 3 | 1 / 121 | 1 / 123 / 1 | 0 / 12 |
| P_class=1, A_total = 1 / 10 / 100 / 1000 | 1 … 1000 | 1 | 1 / 7, 16, 106, — | 1 / 9, 18, 108, 1008 / 1 | **0 / 8 each** |
| 1 published + 100 drafts/archived in the **same** class | 101 | 1 | — | 1 / 109 / 1 | **0 / 8** |

**Warm assignment metadata reads no longer depend on `A_total`.** They equal `P_class`, the class's published set.
Drafts and archived assignments of the same class also cost nothing, because only published ids are indexed.

## Teacher Today — `GET /api/teacher-today` (AFTER)

**Steady state (warm, every active class indexed)**
1. `listJson` of classes and users, in parallel: **two** listings, unchanged. There is no assignment listing.
2. For each **active** class, read its class index: `C_active` downloads.
3. Download each pointed-to assignment and re-validate it.
4. Submission-folder listing and downloads per published assignment, unchanged.

    lists     = 2 + P_active
    downloads = C_total + U_total + C_active + P_active + S_active
    uploads   = 0

**Cold bootstrap (at least one active class without a ready index)**

    lists     = 2 + 1 + P_active   (ONE legacy scan per request, shared by every cold class)
    downloads = C_total + U_total + 2·C_active + A_total + S_active
    uploads   = C_active           (one index per cold active class; archived classes are never bootstrapped)

| Fixture | BEFORE lists / downloads | AFTER cold lists / downloads / uploads | AFTER warm lists / downloads | Warm assignment docs |
|---|---|---|---|---|
| T0 (empty) | 3 / 0 | 2 / 0 / 0 | 2 / 0 | 0 |
| T1 | 4 / 7 | 4 / 9 / 1 | 3 / 8 | 1 |
| T10 (10 × 3 submissions) | 13 / 44 | 13 / 46 / 1 | 12 / 45 | 10 |
| T-MANY-ARCHIVED (1 published + 30 archived + 10 drafts) | 4 / 47 | 4 / 49 / 1 | 3 / 8 | 1 |
| T-MANY-OTHER/INACTIVE (1 active + 40 in an archived class) | 4 / 51 | 4 / 53 / 1 | 3 / 12 | 1 |
| Fixed relevant set + 0 / 10 / 100 historical | 4 / 7, 17, 107 | — | **3 / 8 each** | **1 each** |

**Teacher Today still scans classes and users in Phase 12E-B.** `C_total` and `U_total` remain linear terms of every
request. Only the global assignment scan was removed from its steady state.

## Why a false-positive pointer is safe

A pointer can outlive its assignment's published state: an un-publish, archive or purge removes the pointer only
**after** the change commits, and that removal is best-effort (a failure logs `assignment.index.cleanup_failed` and
the operation still succeeds). Readers never trust a pointer. They download the document and keep it only if it
exists, its status is `published`, its `classId` is the index's class and its id is a safe id. A stale pointer
therefore costs one extra download and never shows a draft, archived, deleted or foreign assignment. It does not
trigger a fallback scan either.

## Why a successful publish cannot become a false negative

- **Strict ensure first.** Every transition into `published` (create as published, `setstatus` → published,
  restore of a previously published assignment) adds the pointer with an ETag compare-and-swap **before** the
  assignment document commits. If the ensure fails (for example, a persistent conflict), the operation returns 503 and
  the assignment stays unpublished: the index can never be behind a committed publish.
- **`setstatus` is serialized.** It now runs under the per-assignment lease (`withAssignmentLock`), like archive,
  restore and purge. A delayed un-publish removal therefore cannot erase the pointer of a re-publish that raced it.
- **Bootstrap is a union.** A bootstrap merges the scanned ids into the **current** index with a CAS, so a pointer
  that a concurrent publish added between the scan and the bootstrap write is kept. A failed bootstrap leaves the
  index cold (logged as `assignment.index.bootstrap_failed`) and is retried on the next request.
- **Deployment window.** An instance still running pre-12E-B code during a swap could publish without writing a
  pointer. An idempotent re-publish (`setstatus` published → published) runs the strict ensure again and repairs it.

## Safe observability (AFTER)

The events stay count-only and best-effort. The response bodies are unchanged: no new response field.

- `student.dashboard.read_cost` adds `assignmentIndexReads`, `assignmentIndexesBootstrapped` and
  `globalAssignmentScans`. `assignmentDocsScanned` now counts the assignment documents actually loaded (`A_total` cold,
  `P_class` warm).
- `teacher.today.read_cost` adds the same three fields, with the same meaning for `assignmentDocsScanned`.

## Notification Center (AFTER)

Unchanged. It never listed `platform/assignments/`, and its 12E-A guards pass unmodified.

## What remains unoptimized

- **Teacher Today** still lists and downloads every class document and every user document on every request.
- **Teacher Today** still lists each published assignment's submission folder and downloads every submission in it.
- `GET /api/assignments` (the teacher assignment list) still lists `platform/assignments/` globally.
- The **first** request per class after deploy pays one legacy scan (`A_total` downloads) to bootstrap its index.
- Reports, analytics, results and review paths are untouched by this phase.
