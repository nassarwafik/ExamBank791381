# Security fix B1 — blob-name traversal through request ids

## Defect

The Azure storage SDK resolves `.` / `..` path segments in a blob name **before** the request is sent:

| Name given to the SDK | Blob actually addressed |
|---|---|
| `platform/feed/A/../../users/A2.json` | `platform/users/A2.json` |
| `sources/../platform/classes/A.json` | `platform/classes/A.json` |
| `../../raw/x.json` (from container `bank`) | `x.json` in container **`raw`** |

Three routes placed an unvalidated request value in a blob name:

| Route | Value | Who | Effect on `main` `18d66eff` |
|---|---|---|---|
| `achievement-feed` (student reaction) | `postId` | any student | adds a `reactions` field to, and rewrites, any JSON document (another student's user document, another class's post, the bank index …) |
| `teacher-achievement-feed` (reaction / note) | `postId`, `classId` | any teacher | writes a note or a reaction on another teacher's class posts, and notifies that teacher's student with the note text |
| `import-html-exam` | `sourceId`, `examCode`, `variant` | any teacher | replaces any document: one call with `sourceId=../platform/classes/A` replaced class A's document with an exam source document (status 200) |

## Fix

- **`api/src/lib/blob-names.js` (new)**:
  - `isSafeSegment(value)`: a request value used in a blob name is one segment. It is non-empty and bounded, is never `.` or `..`, and has no `/`, `\` or control character.
  - `assertSafeBlobName(name)`: no `.` / `..` segment, `\` or control character in a whole name.
  - `installBlobNameGuard()`: wraps the SDK's `ContainerClient` name-taking factories (`getBlobClient`, `getBlockBlobClient`, `getAppendBlobClient`, `getPageBlobClient`) **once for the whole API process**. Every route is covered, including the routes that build their own SDK clients, and the SDK's internal paths such as `deleteBlob`. An unsafe name throws `UNSAFE_BLOB_NAME` (`httpStatus` 400, Arabic message).
  - Loaded by `lib/platform-storage.js` and by the three routes. Azure Functions loads every function module into one worker process, so one load guards them all.
- **The three routes** validate their ids first and answer `400` with an Arabic message before any read or write:
  - `achievement-feed`: `postId` must be a safe segment.
  - `teacher-achievement-feed`: `classId` must match the existing safe-id pattern and `postId` must be a safe segment. As a second check, a post whose stored `classId` differs from the class asked for is never changed (`404`).
  - `import-html-exam`: `sourceId` (supplied or derived), `examCode` and `variant` must be safe segments. They name `sources/<sourceId>.json`, `html/<sourceId>.html` and the embedded images `<examCode>/<year>/<variant>/…`.
- **Ordinary ids are unchanged.** Feed post ids such as `asg_s1`, `project_899373_rank_gold_s1` and `game_live_…`, and source ids such as `791381-2025`, all pass. A name such as `a/..b/c.json` is not a dot segment and still passes.

Out of scope here, in later batches:
- who may call the operator routes (batch 2);
- the import route writing without CAS (batch 4).

## Tests

**`api/tests/blob-name-traversal-b1.test.js` (8 tests).** The in-memory container resolves dot segments exactly like the SDK, so the attacks are real in the test. It covers:
- student `../` post ids → 400, nothing written; a normal reaction still works (pin);
- teacher B through `../A/…`, `../../users/…` or a `../classes/A` class id → 400, nothing written, no notification; a post whose stored class differs → 404; the teacher's own note and reaction still work (pin);
- import with a `../` `sourceId`, `examCode` or `variant` (with or without a safe `sourceId`) → 400 before any storage access; the class and the official source stay untouched;
- the SDK guard on all four factories and `deleteBlob`: dot segments, `\` and control characters are refused, ordinary names pass;
- the guard is loaded by the storage layer and by each route.

**Fail-first** on `18d66eff`: **6 of 8 fail** (the two pins pass):
- `../../users/A2: expected 200 to be 400`;
- `{"action":"setNote","classId":"B","postId":"../A/x_A1",…}: expected 200 to be 400`;
- `expected 200 to be 404`;
- `{"sourceId":"../platform/classes/A"}: expected 200 to be 400`;
- the SDK accepts `platform/feed/A/../../users/A1.json`;
- the guard is not loaded.

A probe on the same baseline confirmed that the import call **replaced `platform/classes/A.json`** with a source document.

## Mutation proof

Each mutant was applied, the B1, teacher-feed scope, achievement-events and 6D notification suites were run, and the file was restored byte-for-byte (hash-verified). **11 / 11 KILLED.**

| Id | Planted defect | Killed by |
|---|---|---|
| G1 | the SDK guard is never installed | SDK guard test |
| G2 | the guard lets `..` through | SDK guard test |
| G3 | the guard lets `\` through | SDK guard test |
| G4 | a segment may contain `/` | student test; teacher test |
| S1 | the student route accepts any post id | student test |
| T1 | the teacher route accepts any post id | teacher test |
| T2 | the teacher route accepts any class id | teacher test |
| T3 | a post of another class is changed under a safe id | stored-class test |
| I1 | the import accepts any source id | import test |
| I2 | the import checks only an explicit `sourceId` | import test (a safe `sourceId` with a `../` `examCode` / `variant`) |
| P1 | the storage layer does not load the guard | load test |

I2 survived the first round: every case derived `sourceId` from `examCode`. `examCode` and `variant` also name the embedded images, so two cases with a safe `sourceId` were added, and I2 is now KILLED.
