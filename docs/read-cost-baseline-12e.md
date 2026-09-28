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
