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
guards. They measure the real handlers over the real in-memory container in three modes, reported separately and never
averaged:

- **MIGRATING**: the index authority has not been activated. This is the state right after deployment.
- **AUTHORITATIVE, COLD**: the first request per class after activation, which reconciles the class index.
- **AUTHORITATIVE, WARM**: the steady state.

## Index storage shape

One control document and one index document per class:

    platform/assignment-index/control.json
    { "schemaVersion": 1, "state": "authoritative" | "migrating", "epoch": "<random id>", "updatedAt": "<ISO time>" }

    platform/assignment-index/classes/<classId>.json
    { "schemaVersion": 1, "classId": "<classId>", "ready": true, "epoch": "<random id>",
      "publishedAssignmentIds": ["<assignmentId>", ...], "updatedAt": "<ISO time>" }

- `publishedAssignmentIds` is a de-duplicated, sorted set of safe ids. The index carries only ids: no title, mark,
  student, submission or answer content.
- A class index is **trusted** only when the control is `authoritative`, the index is `ready`, and its `epoch` equals
  the control epoch.
- A missing, unreadable or malformed control, or any `state` other than `authoritative`, means **migrating**.
- A missing, unreadable, malformed, wrong-class, unready or other-epoch class index is never trusted.
- A writer that adds a pointer to an absent index creates it with `ready: false` and no epoch.
- Class ids that are not safe ids (`/^[A-Za-z0-9_-]{1,128}$/`) are never indexed. Their readers always scan.

Code: `api/src/lib/class-assignment-index.js`. Writers: `api/src/functions/manage-assignments.js` only (the writer
audit found no other code that writes assignment documents). Authority switch: `api/src/functions/assignment-index-control.js`.

## The mixed-version problem, and the authority contract

A pre-12E-B writer that is still alive can publish without touching the index. That includes an old instance during
the swap, a long-running invocation, or a preview or staging environment built from older code. Its only trace is the
assignment blob, which no reader can see without the global scan. So nothing in storage can prove that such a writer
has stopped, and no timer can either.

The review reproduced this on the first 12E-B build:
1. A reader bootstrapped `ready: true`.
2. A legacy writer published assignment X.
3. Every later warm reader missed X.

That build fails `assignment-index-mixed-version-12e-b.test.js` part A.

The contract that closes the window:

1. **Migrating (the default):** readers use the legacy global scan, the exact pre-12E-B read path, which is correct
   whatever code publishes. Readers neither read nor write class indexes. Writers still ensure pointers strictly
   before publishing.
2. **Activation:** an explicit operator assertion that no pre-index writer can publish against this storage any more.
   It is `POST /api/assignment-index-control {operation: "activate", confirm: "no-pre-index-writers"}`, builder-only
   and audited. Every activation mints a **fresh random epoch**. It is a single CAS write, so there is no multi-step
   state that a restart could leave half-done.
3. **Reconcile:** in authoritative mode, a class whose index is not trusted is served from ONE legacy scan per
   request. Its index is then CAS-merged (union) with `ready: true` and the epoch that was read **before** that scan
   started. Because the scan began after activation, it saw every legacy publish, since those all committed before
   activation. The union keeps every pointer a 12E-B writer ensured concurrently.
4. **Deactivation** (back to migrating) is always safe. Do it before any rollback to pre-index code. Re-activating
   afterwards mints a new epoch, so every class index is reconciled again before it is trusted.
5. **Final authority validation (per request).** A result derived from epoch E is returned only if a control read
   taken **after** all of its index and scan work still says authoritative with the **same** epoch E. Epochs are
   random and never reused, so an equal epoch means the authority did not change at any point in between. Otherwise
   the result is discarded and the work is redone under the state that final read returned: migrating means one
   legacy scan, and a new epoch means a new authoritative attempt. After 3 superseded attempts
   (`AUTHORITY_ATTEMPTS`), the request fails safe to ONE legacy scan, so authority churn can never loop.

**Linearization rule.**
- A publish or authority transition that completes **after** the final validation may be missing from this
  response: the GET is ordered before it.
- A transition that completed **before** the final validation can never leave this response on a superseded epoch.
  That covers a legacy publish after a deactivation, or a publish followed by a re-activation.
- A migrating or fail-safe response is the legacy scan, ordered at its scan.

**Invariant.** A reader skips the scan for class C only if control is authoritative with epoch E both before and after
its work (the final validation), and C's index is ready with epoch E. That index was produced by a reconcile whose scan started after activation E. The scan therefore
contains every assignment that a pre-index writer published, because all such publishes happened before activation E.
The index then only grows by union: every pointer that a 12E-B writer ensured before committing a publish is kept.
So every successfully published assignment of C is in the index, or C is served from a scan.

## Student dashboard — `GET /api/student-dashboard` (AFTER)

Every request reads the control document first. An authoritative result also needs the final validation read, so it
takes 2 control reads in total. A migrating result takes 1.

    MIGRATING             lists = 1   downloads = K + 1 + A_total + P_class                  uploads = 0
    AUTHORITATIVE, WARM   lists = 0   downloads = K + 2 + 1 index + P_class + P_class        uploads = 0
    AUTHORITATIVE, COLD   lists = 1   downloads = K + 2 + 1 index + A_total + 1 CAS read + P_class
                                                                                            uploads = 1 (the class index)

| Fixture | A_total | P_class | BEFORE (12E-A) lists / downloads | MIGRATING lists / downloads | COLD lists / downloads / uploads | WARM lists / downloads |
|---|---|---|---|---|---|---|
| S0 | 0 | 0 | 1 / 5 | 1 / 6 | 1 / 9 / 1 | 0 / 8 |
| S1 | 1 | 1 | 1 / 7 | 1 / 8 | 1 / 11 / 1 | 0 / 10 |
| S10 | 10 | 10 | 1 / 25 | 1 / 26 | 1 / 29 / 1 | 0 / 28 |
| S50 | 50 | 50 | 1 / 105 | 1 / 106 | 1 / 109 / 1 | 0 / 108 |
| S-OTHER (3 own + 100 other class + 5 drafts + 5 archived) | 113 | 3 | 1 / 121 | 1 / 122 | 1 / 125 / 1 | 0 / 14 |
| P_class=1, A_total = 1 / 10 / 100 / 1000 | 1 … 1000 | 1 | 1 / 7, 16, 106, — | 1 / 8, 17, 107, 1007 | 1 / 11, 20, 110, 1010 / 1 | **0 / 10 each** |
| 1 published + 100 drafts/archived in the **same** class | 101 | 1 | — | 1 / 108 | 1 / 111 / 1 | **0 / 10** |

**In the authoritative steady state, assignment metadata reads no longer depend on `A_total`.** They equal `P_class`.
Drafts and archived assignments of the same class also cost nothing, because only published ids are indexed.
Migrating costs exactly the 12E-A path plus the one control read. The authoritative steady state pays two control reads,
the one before the work and the final validation.

## Teacher Today — `GET /api/teacher-today` (AFTER)

Let `X = 1` if there is an active class, else `0`. With at least one active class, the control is read first. An
authoritative result is confirmed by the final validation read, so it takes `2X` control reads.

    MIGRATING             lists = 2 + X + P_active   downloads = C + U + X + X·A_total + S_active                     uploads = 0
    AUTHORITATIVE, WARM   lists = 2 + P_active       downloads = C + U + 2X + C_active + P_active + S_active           uploads = 0
    AUTHORITATIVE, COLD   lists = 2 + X + P_active   downloads = C + U + 2X + 2·C_active + X·A_total + S_active        uploads = C_active

A cold request runs ONE legacy scan for every cold class. Archived classes are never reconciled.

| Fixture | BEFORE lists / downloads | MIGRATING lists / downloads | COLD lists / downloads / uploads | WARM lists / downloads | Warm assignment docs |
|---|---|---|---|---|---|
| T0 (empty) | 3 / 0 | 2 / 0 | 2 / 0 / 0 | 2 / 0 | 0 |
| T1 | 4 / 7 | 4 / 8 | 4 / 11 / 1 | 3 / 10 | 1 |
| T10 (10 × 3 submissions) | 13 / 44 | 13 / 45 | 13 / 48 / 1 | 12 / 47 | 10 |
| T-MANY-ARCHIVED (1 published + 30 archived + 10 drafts) | 4 / 47 | 4 / 48 | 4 / 51 / 1 | 3 / 10 | 1 |
| T-MANY-OTHER/INACTIVE (1 active + 40 in an archived class) | 4 / 51 | 4 / 52 | 4 / 55 / 1 | 3 / 14 | 1 |
| Fixed relevant set + 0 / 10 / 100 historical | 4 / 7, 17, 107 | 4 / 8, 18, 108 | — | **3 / 10 each** | **1 each** |

**Teacher Today still scans classes and users in Phase 12E-B.** `C_total` and `U_total` remain linear terms of every
request. Only the global assignment scan was removed, and only from its authoritative steady state.

## Why a false-positive pointer is safe

A pointer can outlive its assignment's published state. An un-publish, archive or purge removes the pointer only
**after** the change commits, and that removal is best-effort: a failure logs `assignment.index.cleanup_failed` and the
operation still succeeds. Readers never trust a pointer. They download the document and keep it only if:
- it exists;
- its status is `published`;
- its `classId` is the index's class;
- its id is a safe id.

A stale pointer therefore costs one extra download. It never shows a draft, archived, deleted or foreign assignment,
and it never triggers a fallback scan.

## Why a successful publish cannot become a false negative

- **Pre-index writers:** covered by the authority contract above. Until activation, readers scan. After activation,
  an index is trusted only once a scan that started after activation has been merged into it.
- **Strict ensure first (12E-B writers).** Every transition into `published` adds the pointer with an ETag
  compare-and-swap **before** the assignment document commits. That covers create as published, `setstatus` →
  published, and restore of a previously published assignment. If the ensure fails, the operation returns 503 and the
  assignment stays unpublished.
- **`setstatus` is serialized.** It runs under the per-assignment lease (`withAssignmentLock`), like archive, restore
  and purge. A delayed un-publish removal therefore cannot erase the pointer of a re-publish that raced it.
- **Reconcile is a union.** A reconcile merges the scanned ids into the **current** index with a CAS, so a pointer a
  concurrent publish added between the scan and the write is kept. A failed reconcile leaves the index untrusted
  (logged as `assignment.index.bootstrap_failed`) and the next request retries it.

## Safe observability (AFTER)

The events stay count-only and best-effort. The response bodies are unchanged: no new response field.

- `student.dashboard.read_cost` adds these fields: `assignmentIndexReads`, `assignmentIndexesBootstrapped`,
  `globalAssignmentScans`, `assignmentIndexAuthoritative` (0 or 1) and `assignmentIndexAuthorityChanges` (superseded
  attempts in this request). `assignmentDocsScanned` counts the assignment
  documents actually loaded.
- `teacher.today.read_cost` adds the same five fields.
- An authority change logs `assignment.index.control_changed` (operation and state only) and records an audit event.

## Notification Center (AFTER)

Unchanged. It never listed `platform/assignments/`, and its 12E-A guards pass unmodified.

## What remains unoptimized

- **Until the operator activates the index authority**, both hot paths keep the 12E-A cost, plus one control read.
- **After activation**, the first request per class pays one legacy scan (`A_total` downloads) to reconcile its
  index. Every re-activation repeats this once per class.
- **Teacher Today** still lists and downloads every class document and every user document on every request.
- **Teacher Today** still lists each published assignment's submission folder and downloads every submission in it.
- `GET /api/assignments` (the teacher assignment list) still lists `platform/assignments/` globally.
- Reports, analytics, results and review paths are untouched by this phase.
