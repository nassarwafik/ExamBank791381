# Batch 4 — data integrity (bank writes, recovery draft, class create)

Three defects from the full-project audit that lose or expose data. Fixes only; no new feature.

## D1 — whole-document overwrites of the shared bank index and source documents

**Defect.** Four routes read a whole shared document, worked, then uploaded the whole document back, so whatever another request saved in between was erased:

| Route | Documents | Window |
|---|---|---|
| `import-html-exam` | `index/questions-index.json` | between the index read and the upload |
| `build-bank-2025` | the same index | the same |
| `classify-bank-batch` | the index (main save and the "repair" pass), `sources/<id>.json` | the AI call (seconds) |
| `classify-question-preview` | the index, `sources/791381-2025.json` | the AI call |

What was lost:
- **another source's index entries:** those questions can no longer be selected for an exam;
- **a teacher's edit of a question** in the classified source.

**Fix.** `api/src/lib/bank-index-writes.js` applies each route's own change to the **current** document inside one CAS round (`mutateJsonWithRetry`: ETag-conditional, retried on conflict):

- `replaceSourceInIndex(container, sourceId, entries, now)`: replaces only that source's entries and keeps every other entry and field. Used by the import and the 2025 rebuild.
- `updateIndexEntries(container, ids, apply, now)`: re-applies a per-entry change by question id. Used by both classification routes, and by the batch route's repair pass.
- `updateSourceQuestions(container, sourceBlob, ids, apply, now)`: the same for the source document. A missing source is an error, never an empty document written in its place.

The classification itself is plain assignment, so applying it to the in-memory copy (for the response) and again to the current document gives the same result. A route still writes its **own** source document whole (the import and the rebuild replace their source by design).

Helpers left unused by this change were removed: `readExistingIndex` (×2), `downloadBlobText` (×2), `streamToBuffer`, `uploadJson` (×2) and a stale `INDEX_BLOB`.

## D2 — the legacy builder's recovery draft in shared browser storage

**Defect.** The legacy builder autosaved the whole unsaved exam, **answer keys included**, under one fixed `localStorage` key (`ExamBank791381-Recovery-V1`). The key was shared by every teacher on the browser and kept after logout. On a shared school computer:
- another teacher was offered the draft, and could save it as their own;
- anyone could read the answer key from the browser's storage.

**Fix.** `src/legacyRecoveryDraft.ts`, used by `src/App.tsx`:
- the draft key is per teacher: `ExamBank791381-Recovery-V2:<teacherId>`. The teacher id is the one the structured builder's backups already use (`teacherProfile.teacherId`);
- before the teacher is known, no draft is read or written;
- logout deletes the teacher's draft;
- the old draft under the shared key is deleted, because it cannot be attributed to any teacher;
- every storage access is best-effort, so blocked storage never breaks the builder.

## D3 — a class created twice

**Defect.**
- **Two submits in one tick:** «إنشاء الصف» guarded double submits only with a React state flag, so two clicks in the same tick both sent a create.
- **Retries:** a retry after a lost response created the class again.

**Fix.**
- **Client** (`TeacherPlatform.createClass`):
  - one `requestKey` per form submission, from the existing `newRequestKey()`;
  - the same key is kept for a retry after a failure, and a new one is made after a success;
  - a synchronous in-flight ref makes a double click send one request.
- **Server** (`manage-classrooms` create):
  - with a key matching `^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$`, the class id is `cls-` plus the first 32 hex characters of `sha256(tenant + "\u0000" + key)`;
  - the class is written **create-only**. A repeat (sequential or concurrent) answers `200` with `duplicate: true` and the same class, and writes or audits nothing more;
  - another teacher's identical key gives a different class;
  - a malformed key → `400`;
  - **without a key** (older clients) the id stays random, as before.

## Tests

| File | What |
|---|---|
| `api/tests/bank-index-cas-d1.test.js` (7) | The import, the 2025 rebuild, batch classification (main save and repair) and single classification, each with a concurrent write injected at the exact window. The concurrent entry or edit survives next to the route's own change. Also: re-import replaces its own entries (pin); helper semantics |
| `src/legacyRecoveryDraft.d2.test.tsx` (3, real `App`) | A colleague's draft is never offered, while the teacher's own is; the shared-key draft is deleted and never offered; logout deletes the draft |
| `src/legacyRecoveryDraft.test.ts` (1) | Per-teacher keys; nothing without a teacher; blocked storage never throws |
| `api/tests/class-create-idempotent-d3.test.js` (5) | Sequential and concurrent repeats give one class, one audit; another teacher's key is a different class; malformed keys → 400; no key → a new class each time (pin) |
| `src/TeacherPlatform.createClass.d3.test.tsx` (2, real `TeacherPlatform`) | A double click sends one create with a key; a retry reuses the key; the next class gets a new key |

**Updated deliberately:** `src/TeacherPlatform.ux4.test.tsx`. The create-class request parity now includes `requestKey`.

**Fail-first** on `791f8118`: **14 of 17** fail; the other 3 are pins. The new-module unit file is not counted.

| Defect | Failing assertion on the baseline |
|---|---|
| D1 (6) | the concurrent entry is missing: `expected [ '791381-2025-d1-1' ] to include 'other-1'`; the teacher's edit is lost: `expected 'النص الأصلي' to be 'نص عدّله المعلّم'` |
| D2 (3) | the shared draft is offered to another teacher: `expected <div class="recovery-draft-bar">…</div> to be null`; the per-teacher draft is never found (the wait for it times out) |
| D3 (5) | a repeat creates a second class (different ids); malformed keys are accepted (`expected 200 to be 400`); a double click sends two creates (`… to have a length of 1 but got 2`) |

The batch commit message miscounts this as "15 of 19 (4 pins)". The figures above are the correct ones.

## Mutation proof

Each mutant was applied, the relevant suites were run, and the file was restored byte-for-byte (hash-verified; the tree was clean afterwards). **19 / 19 KILLED.**

| Id | Planted defect | Killed by |
|---|---|---|
| L1 | the index keeps only the writing source | import test; re-import pin |
| L2 | per-entry updates hit the wrong entries | batch test; repair test |
| L3 | a missing source is written as a new document | helper test |
| L4 | source questions are never updated | batch test; single test |
| C1 | batch: the index is not updated | batch test |
| C2 | batch: the source is not saved | batch test |
| C3 | batch: the index repair is not saved | repair test |
| P1 | single: the source is not saved | single test |
| P2 | single: the index is not updated | single test |
| R1 | the draft key ignores the teacher | unit test; colleague test |
| R2 | the old shared draft is kept | shared-key test |
| R3 | logout keeps the draft | logout test |
| R4 | a draft is read or written with no teacher | unit test |
| K1 | the class id ignores the teacher | other-teacher test |
| K2 | a keyed create overwrites instead of create-only | repeat test; concurrent test |
| K3 | a malformed key is accepted | 400 test |
| K4 | client: no synchronous in-flight guard | double-click test |
| K5 | client: a retry gets a new key | retry test |
| K6 | client: the key is reused for the next class | next-class test |

## Known limits

- D2: a teacher's own unsaved draft is deleted on logout, by design. The draft is a crash or reload safety net within a session, not storage across sessions.
- D3: older clients that send no key keep the old behaviour; the current client always sends one.
- The audit's "pending-grading guard is check-then-act" race in the classes routes is not part of this batch.
