# Phase 14A — Server-Authoritative Versioning & Publishing Governance

Baseline: `6918ce114a16d1886918b7f9f82ce76658094d15` (merge of PR #225 / Phase 13C-C; post-merge run #842 green).
Branch: `feature/14a-server-publishing-governance`. One PR. Auto-merge OFF. DO NOT MERGE.

Before 14A the platform's notion of "published" was **the browser saving an exam whose object says `status: "final"`**.
After 14A the **server owns** the exam revision history, the lifecycle transitions, the publication identity and the
immutable published snapshot. `StructuredExam.status` remains a compatibility / authoring hint; the governance manifest
(`lifecycleState`, `publishedRevisionId`) is the publishing authority for governed exams. This is a governance phase, not a
Builder feature.

## 1. Baseline gate

| Check | Result |
|---|---|
| `origin/main` | `6918ce114a16d1886918b7f9f82ce76658094d15` — verified with `git fetch` before branching; re-verified before commit and push |
| PR #225 | merged (`merge_commit_sha = 6918ce1…`); `auto_merge: null` |
| Post-merge CI / deploy | run #842 (`push`, `6918ce11…`): completed / success |
| Working tree | clean; no merge / rebase / cherry-pick in progress |
| Branch | created from the exact baseline; one PR; nothing merged |

## 2. Audit (before any implementation)

### 2.1 Structured exam authority
| Item | Finding |
|---|---|
| `src/examTypes.ts` | `StructuredExam.status?: "draft" \| "final"` is a plain field on the exam object the browser edits and posts; nothing on the server interprets it as authority. |
| `useStructuredExamHistory` / `examHistory` (13A) | the one in-browser edit authority (undo / redo / dirty / saved reconciliation). It knows nothing about publication. |
| `toSavedStructuredExam` | refreshes totals / timestamps, drops the top-level `questions[]`; keeps every other field including `status`. |
| autosave / recovery (13A) | teacher-scoped local backups of the working copy — never a publication record. |
| copy / import | `structuredExamCopy` gives a new `examId`; the import wizard opens an unsaved structured exam. Neither carries any approval history. |

### 2.2 Finalization authority (13C-C)
`examQuality.validateStructuredExam` → `assessmentBlueprintCoverage.evaluateBlueprintCoverage` → `assessmentQualityPolicy.validateAssessmentQualityPolicy` →
`assessmentQualityGates.evaluateAssessmentQualityGates` → `examFinalization.evaluateExamFinalization` → `structuredSavePolicy.runStructuredSave`.
The Builder's `اعتماد نهائي` re-checks the latest committed exam; App's `saveStructuredExam` runs the same authority on the exact
snapshot (second-line guard). **All of it runs in the browser.** The server had no finalization check at all: a request
`{ kind: "exam", exam: { …, status: "final" } }` was persisted verbatim (minus cleaning).

### 2.3 Persistence
| Item | Finding |
|---|---|
| `api/src/functions/save-exam-artifact.js` | `POST` → `cleanExam` (sections canonical, history / redo cleared, bank assets durable-only) → **overwrite** `exams/<examId>.json` (`uploadData … overwrite: true`); `savedAt` / `updatedAt` are server timestamps; no versioning, no history, no lifecycle. The handler was an inline closure (not unit-testable). |
| `api/src/functions/manage-saved-exams.js` | `GET` lists ≤100 blobs under `exams/`; `load` hydrates bank URLs at read time; `delete` removes the blob. |
| Blob layout | container `bank`: `exams/<examId>.json` (working copy), `templates/…`, `platform/assignments/<id>.json`, `platform/submissions/…`, `platform/audit/…` (one immutable blob per audit event, no reader-side authority). |
| Bank assets | `bank-asset-hydrate.js`: durable identity `{ id, origin: "bank", blobName, contentType }` persisted; signed `/api/question-image?…&exp&sig` minted at delivery only. |
| Optimistic concurrency | `platform-storage.js` already offers `downloadJsonWithEtagOrNull`, `uploadJsonConditional` (If-Match / If-None-Match `*`), `mutateJsonWithRetry`, `isConcurrencyConflict`; used by class indexes and the assignment lock — **not** by exam saving. |

### 2.4 Authentication
`api/src/lib/builder-auth.js`: HMAC-signed teacher session (`ver 2`, `role: "teacher"`, `sub`, `iat/exp`, `sv`); `requireBuilderAuth(request)`
→ `{ ok, user }`. `auth.user.sub` is the authenticated actor identity (`BUILDER_USER_CODE`, default `"builder"`).
**Honest limitation:** there is ONE teacher/builder account model. There is no institutional Reviewer / Approver directory,
no roles table, no per-user record beyond the code the teacher logged in with. Phase 14A therefore introduces
*capabilities* resolved on the server from identity + configuration, not fake users (see §9).

### 2.5 Assignments — exact path
1. `AssignmentsPanel` chooses a source: the **live** `currentExam` object from the App, a saved exam loaded through
   `/api/saved-exams` (`action: "load"`), or a 791381 library item. The chosen object is posted **in full** as
   `examSnapshot` in `POST /api/assignments { action: "create", … }`.
2. `manage-assignments.create` → `cleanExam(b.examSnapshot)` (deep copy + bank normalization) → `examOfficialStats` →
   stores `platform/assignments/<assignmentId>.json` with `examSnapshot` **inside the document**. That stored copy is
   the authority for that assignment from then on.
3. Later exam edits do **not** affect an existing assignment (the snapshot is a copy) — but the snapshot's *origin* was
   whatever the browser held, published or not.
4. Students read `GET /api/student-assignment/{id}` → `a.examSnapshot` → `hydrateBankAssets` → `sanitizeExamForStudent`;
   grading (`student-submission`, `assignment-results`, `assignment-review`) reads the same `examSnapshot`.

Conclusion: the snapshot mechanism is sound; the missing piece was **which content may become a snapshot for a governed exam**.

## 3. Authority model

```
                       ┌──────────────── browser (Builder) ────────────────┐
  working copy  ───►   exams/<examId>.json      (generic artifact endpoint; no authority)
                       │  StructuredExam.status = compatibility / authoring hint
                       └───────────────────────────────────────────────────┘
                                          │  explicit enable / create-revision (exam body, canonicalized on the server)
                                          ▼
  exam-governance/<examId>/manifest.json   ◄── ETag CAS ── lifecycleState · stateVersion · latest/review/approved/publishedRevisionId
              │                    │
              │ create-only        │ create-only
              ▼                    ▼
  revisions/<revisionId>.json    events/<seq>-<eventId>.json      (immutable)
  revision-meta/<n>-<id>.json    (immutable, listing never loads bodies)
                                          │
                                          ▼  manifest → publishedRevisionId → revision (fail closed)
  platform/assignments/<id>.json  { examSnapshot = revision.exam, source: { kind: "governed-revision", revisionId, … } }
                                          │
                                          ▼  student-exam-sanitize (unchanged)
  student
```

- **Legacy exam** (no manifest): everything behaves exactly as before. Reading, saving or opening it never creates a
  governance blob; an old `status: "final"` is never reported as approved or published.
- **Governed exam** (manifest exists): the manifest is the publishing authority; the working copy is still saved through
  the generic endpoint, but content becomes authoritative only when captured into an immutable revision.

## 4. Manifest contract (`exam-governance/<examId>/manifest.json`)

```
{ schemaVersion: 1; examId; lifecycleState: "draft" | "in-review" | "approved" | "published"; stateVersion: number;
  latestRevisionId; latestRevisionNumber; latestContentHash;
  reviewRevisionId?; reviewRevisionNumber?; approvedRevisionId?; approvedRevisionNumber?; approvedAt?; approvedBy?;
  publishedRevisionId?; publishedRevisionNumber?; publishedAt?; publishedBy?;
  createdAt; updatedAt; createdBy; lastTransition: { type, at, by, requestId, fromState?, toState? };
  revisions: [{ revisionId, revisionNumber }];        // the lineage (ids only) — O(1) authority, no blob listing
  eventCount: number;                                 // next event sequence = eventCount after the transition
  commands: [{ requestId, type, at, stateVersion, result }] }   // idempotency ring (last 64); never returned to clients
```
`validateManifest` fails closed: unknown state, non-integer version, missing latest revision, a pointer outside the lineage, a
state without its pointer (in-review ⇒ reviewRevisionId, approved ⇒ approvedRevisionId, published ⇒ publishedRevisionId).

## 5. Immutable revisions and content hash

```
revisions/<revisionId>.json  = { schemaVersion: 1; examId; revisionId ("rev-" + uuid); revisionNumber (monotonic);
                                 createdAt; createdBy; sourceRevisionId?; contentHash; exam }
revision-meta/<n>-<id>.json  = the same without `exam` + { title, questionCount, totalMarks }
```
- Written with `If-None-Match: *` (`uploadJsonConditional(…, null)`): an attempt to write an existing name is
  `409 IMMUTABLE`. No API action deletes or rewrites a referenced revision. A revision written for a `createRevision`
  whose manifest CAS then lost the race was never referenced by any authority version; that leftover is removed by the
  server itself (`discardUnreferenced`) — not an author operation.
- **Canonicalization (§7)**: `api/src/lib/exam-canonical.js → canonicalizeExamContent` — deep copy; governance-looking /
  runtime-analytics root fields stripped (`governance`, `lifecycleState`, `stateVersion`, `*RevisionId`, `publishedAt/By`,
  `contentHash`, `qualityGateReport`, `finalizationDecision`, `coverageReport`, …); `normalizeBankAssetsForStorage` (durable
  identity only — never `exp`/`sig`); `sections[].questions[]` the only tree (top-level `questions[]` dropped); per-question
  `history`/`redoStack` cleared; legacy flat exams keep `questions[]`. `save-exam-artifact.cleanExam` now **delegates to it**
  (plus `updatedAt`), so there is one cleaner, not two.
- **Content hash (§8)**: `contentHashOf(canonicalExam)` = SHA-256 hex over `stableStringify(canonicalExam)` — object keys
  sorted recursively, array order kept, `undefined` dropped like `JSON.stringify`. Computed **on the server** over the
  canonical form; it refuses input carrying a signed bank URL or a governance root field. Identical content ⇒ identical
  hash (a `createRevision` whose hash equals `latestContentHash` creates nothing). The hash is integrity evidence, not identity.

## 6. Lifecycle state machine (server, `exam-governance-model.js`)

| From \ To | draft | in-review | approved | published |
|---|---|---|---|---|
| draft | — | ✓ submit (server finalization gate) | ✗ | ✗ |
| in-review | ✓ return | — | ✓ approve (binds reviewRevisionId) | ✗ |
| approved | ✓ return | ✗ | — | ✓ publish (binds approvedRevisionId) |
| published | ✓ new draft lineage (publication untouched) | ✗ | ✗ | — |

- `draft`: editable; the working copy may diverge from the publication. `createRevision` is allowed only here.
- `in-review`: the exact `reviewRevisionId` is frozen. Content changes ⇒ return to draft ⇒ new revision ⇒ new cycle.
- `approved`: the exact reviewed revision. No modified content inherits the approval.
- `published`: `publishedRevisionId` is immutable history; `published → draft` begins a new editable lineage and keeps the
  publication (and every assignment pinned to it) intact; a later publication supersedes it for *new* assignments only.
- A client never chooses a target state: `transition()` validates `(from, to)` against the table; unknown states are `400`.

## 7. Server-authoritative finalization (§15–§17)

`draft → in-review` loads the **stored** revision named by `revisionId` (which must equal `latestRevisionId`, else
`409 REVISION_MISMATCH`) and runs `api/src/lib/server-finalization.js → evaluateServerFinalization` on it. A client body,
a client `canFinalize` flag or a client decision object is ignored. A blocked decision is `422 FINALIZATION_REFUSED` with
counts only (`structuralErrors`, `qualityBlockers`, `policyBlockers`, `blockerIds`) — never the exam body.

**One canonical source, not a third implementation.** The API is CommonJS and cannot import the app's TypeScript, so
`scripts/build-shared-finalization.mjs` compiles `src/examFinalization.ts` and its whole chain (`examQuality`,
`assessmentBlueprintCoverage`, `assessmentQualityPolicy`, `assessmentQualityGates`, `assessmentBlueprint`,
`examBuilderState`, `examPreviewModel`, `examCover`, `examStructure`, `answerState`, `studentQuestionTypes`, types) to
`api/src/lib/shared-finalization/*.js` (committed; 16 files). `api/tests/shared-finalization-drift-14a.test.js`
regenerates into a temp dir on every run and fails on the first differing byte; the build refuses to reach a React / UI
module. To make the chain React-free, `answered()` and the student question shape types were extracted verbatim into the
pure `src/answerState.ts` / `src/studentQuestionTypes.ts` (re-exported by `StudentQuestionCard`, so every importer is unchanged).
`src/serverFinalization.parity.14a.test.ts` pins identical decision objects on 14 representative cases (valid; structural
error; warning-only gate; triggered blocker; malformed `enabled` fails closed — Review Fix 1; missing `enabled`; disabled
rule; disabled policy; capScore official marks; firstNAnswered; compound part marks; broken Blueprint reference enabled /
disabled; unsupported policy schema).

## 8. Optimistic concurrency and idempotency (§9–§10)

- Every mutation carries `expectedStateVersion`. Mismatch ⇒ `409 STALE_STATE` before anything is written. The manifest is
  written with `If-Match: <etag>` (`uploadJsonConditional`); a lost race (412) ⇒ `409 STALE_STATE`; `enable` uses
  `If-None-Match: *` ⇒ `409 ALREADY_GOVERNED`. There is **no** `mutateJsonWithRetry` in the authority: a stale transition is
  never re-applied to a newer state (guarded).
- Every mutation carries `requestId` (≤128 chars). The manifest's `commands` ring records completed commands inside the
  same CAS write, so a retry of the SAME command replays its outcome (`replayed: true`, no new revision / event / publish)
  while a DIFFERENT command reusing the id is `409 REQUEST_ID_CONFLICT`. Failed / stale / forbidden commands record nothing.
- Write order for a revision-creating command: revision + meta (create-only) → manifest CAS → event (create-only). A CAS
  loss discards the never-referenced revision; a stale conflict therefore emits no event and leaves no lineage change.

## 9. Capabilities (§20–§22)

`api/src/lib/exam-governance-capabilities.js → resolveGovernanceCapabilities(auth.user, process.env)`:
- identity must be the authenticated builder payload (`role: "teacher"`, non-empty `sub`); anything else ⇒ `[]`;
- **unconfigured deployment (today's production):** every authenticated teacher holds `author, review, approve, publish`
  — reported as `capabilitySource: "default-single-teacher"` and shown in the UI. This is stated honestly: there is one
  account model and no institutional separation yet (Phase 14B);
- `GOVERNANCE_CAPABILITIES='{"default":[…],"users":{"<sub>":[…]}}'` gives distinct subjects distinct capabilities
  (`capabilitySource: "configured"`); unknown names dropped; malformed JSON ⇒ baseline (normal Builder use never breaks);
- per action: enable / create-revision / submit-review ⇒ `author`; approve ⇒ `approve`; publish ⇒ `publish`;
  return-to-draft ⇒ `author|review` (from in-review), `author|approve` (from approved), `author` (from published).
Nothing in a request body (`role`, `capabilities`, `governanceRole`) is read. No teacher is hard-coded as approver; no fake users.

## 10. Audit trail (§23–§24)

`events/<seq>-<eventId>.json = { schemaVersion: 1; eventId; examId; type; revisionId?; fromState?; toState?; actorId; occurredAt; requestId; sequence }`
— one create-only blob per successful mutation, `actorId` / `occurredAt` from the server, types
`governance-enabled · revision-created · submitted-for-review · returned-to-draft · approved · published`. Events reference
revision ids; the event factory has no exam field (guarded); no token / password / signed URL / answer key can appear.
Failed, stale or forbidden commands emit nothing. There is no edit / delete path.

## 11. API (`/api/exam-governance`, §25–§26)

`GET ?examId=` → status. `POST { action, examId, … }`: `status · revisions · revision · events · published · enable ·
create-revision · submit-review · return-to-draft · approve · publish`. Mutations need `requestId` + `expectedStateVersion`
(`enable` / `create-revision` also `exam`). Builder session required (anonymous / student / invalid token ⇒ 401);
capabilities from the server; `403` capability, `404` not governed / missing revision, `409` stale / illegal / conflict
(with the authoritative manifest attached), `422` server finalization refused. `commands` never leave the server.
`/api/save-exam-artifact` keeps saving working copies and templates; it strips governance-looking root fields and can
mutate neither manifest, revisions, `publishedRevisionId` nor approval state (tested).

## 12. Assignments (§28–§32)

`manage-assignments.create`: if `examSnapshot.examId` has a manifest, `resolveGovernedExamSource` loads
**manifest → publishedRevisionId → immutable revision** (fail closed) and that revision becomes the snapshot; the browser
body is ignored; the assignment records `source: { kind: "governed-revision", examId, revisionId, revisionNumber, contentHash }`.
No published revision ⇒ `409 NO_PUBLISHED_REVISION`, nothing stored. Missing / corrupt reference ⇒
`409 PUBLISHED_REVISION_UNAVAILABLE` — never the latest draft. Legacy exams: unchanged. Publishing a later revision touches
no existing assignment (the snapshot is a copy pinned to its revision); a new assignment binds the new publication.
Students keep receiving the pinned snapshot through the unchanged sanitizer; `source` is not part of the student payload.

## 13. Builder UI (§33–§40)

`🗂 إدارة النشر والإصدارات` (lazy `GovernancePanel`, offered only when the App passes a `GovernanceService` — the builder
never receives a token): lifecycle state (`مسودة · قيد المراجعة · معتمد · منشور`), current revision number + short id,
published revision, last transition, the actor's capabilities and their source, revision history (number, id, author, time,
short SHA-256, roles from the manifest pointers, questions / marks, `عرض`), audit timeline, capability-gated actions
(`تفعيل إدارة النشر · إنشاء إصدار من النسخة الحالية · إرسال للمراجعة · إرجاع إلى المسودة · اعتماد · نشر · إنشاء نسخة تحرير جديدة`).
`إرسال للمراجعة` first shows the 13C-C readiness panel with `متابعة إرسال للمراجعة`; the server re-validates the exact
revision. A `409` shows «تغيرت حالة الامتحان في الخادم منذ فتح هذه الصفحة. تم تحديث الحالة؛ راجعها قبل إعادة المحاولة.»,
refreshes the authoritative state and never retries by itself. One status read on open, refresh after mutations, explicit
`↻ تحديث الحالة` — no polling. The revision viewer is read-only (`data-readonly`): identity, metadata, roles, a content
outline, `معاينة كاملة`; no editing, Blueprint, policy, bulk or bank controls. «اعتماد نهائي» keeps meaning authoring
readiness; «نشر» means server-governed publication. New revisions are created from the latest *committed* exam (13A ref).

## 14. Student security (§31)

Students never receive the manifest, audit trail, reviewer identity, capabilities, unpublished revisions, Blueprint or
Quality Policy: the student endpoints have no governance import, the governance API requires the builder session, and the
assignment snapshot passes through the unchanged `sanitizeExamForStudent`.

## 15. Backward compatibility (§3, §27, §30, §50)

| Exam | Behaviour |
|---|---|
| legacy saved exam / structured non-governed / `status: "draft"` / `status: "final"` | loads, saves, assigns exactly as before; `status` is unchanged as an authoring hint; **no** governance blob is created by reading, opening or saving; no dirty / history entry on open; no network migration |
| governed | manifest = publishing authority; working copy still saved through the generic endpoint; assignments bind the published revision |

## 16. Tests

Fail-first: Recorded on `6918ce114a16d1886918b7f9f82ce76658094d15` (`scratchpad/14a/fail-first-6918ce1.log`): the nine 14A suites → **9 files failed / no tests ran** — every suite fails at import (`Cannot find module …/exam-governance-model.js`, `…/exam-canonical.js`, `…/exam-governance.js`, `…/functions/exam-governance.js`, `…/server-finalization.js`, `…/build-shared-finalization.mjs`, `./examGovernance`), i.e. the baseline has G1 no manifest, G2 no immutable revision storage, G3 no transition engine, G4 no CAS on exam state, G5 no immutable governance events, G6 no server finalization check, G7 no publish authority, G8 no assignment pinning, G9 no governance UI, G10 no capability enforcement. After implementation: 10 suites / 98 tests green (guards suite added after the fail-first run).

| Suite | Covers |
|---|---|
| `api/tests/exam-governance-model-14a.test.js` | G3 state machine (every legal / illegal pair, injected targets), event vocabulary, blob namespace + id validation, manifest contract + fail-closed validation |
| `api/tests/exam-canonical-14a.test.js` | §7 canonical form (sections only, history cleared, durable bank identity, governance root fields stripped, legacy flat unchanged, `cleanExam` == canonical + updatedAt), §8 stable stringify + SHA-256 (order-independent, signed-URL-independent, content-sensitive, refuses non-canonical) |
| `api/tests/exam-governance-14a.test.js` | G1 manifest (opt-in, legacy reads create nothing, old status:final never published), G2 immutability (r1 bytes stable, create-only, identical content → no revision), G3 transitions incl. return-to-draft semantics, G4 CAS (stale, ETag race via the memory container hook, stale publish, mandatory version), idempotency (replay / conflict / required id), G6 server finalization gate (stored revision, client flag ignored, injectable authority), G7 approve/publish binding + spoofed actor / time / role, published loader fail-closed (P17), legacy coexistence, G5 audit events (one per mutation, ids only, create-only, paginated readers), G10 capability resolver |
| `api/tests/exam-governance-function-14a.test.js` | HTTP contract: 401 for anonymous / student / invalid tokens, status without side effects, full lifecycle through actions, 409 with authoritative manifest, 422 counts only, configured capabilities (403 vs approver subject), §26 artifact endpoint has no governance authority |
| `api/tests/manage-assignments-governance-14a.test.js` | G8 pinning: refused without publication, snapshot = server revision (browser body ignored) + `source`, later draft / publication never rewrite an assignment, new assignment binds new publication, student receives the pinned old revision sanitized, legacy unchanged |
| `api/tests/exam-governance-guards-14a.test.js` | §52 source / security guards (no `exam.status` authority, no client pointers / roles, create-only + conditional writes only, no fallback, no delete path, students never reach governance, events without bodies, governed assignments from the server revision, no automatic 409 retry / no canFinalize on the client) |
| `api/tests/shared-finalization-drift-14a.test.js` | the committed server build is byte-identical to a fresh compile of `src/examFinalization.ts`; no React / UI module reachable |
| `src/serverFinalization.parity.14a.test.ts` | §47 frontend / server identical decisions on 14 representative cases + expected verdicts + counts-only summary |
| `src/examGovernance.test.ts` | vocabulary, action availability per state × capability, revision roles from pointers, display helpers |
| `src/GovernancePanel.14a.test.tsx` | G9 UI: no button without a service, status / revisions / timeline from the server (not exam.status), draft actions + readiness confirm → exact transition args, capability gating, 409 conflict message + refresh + no retry, published → read-only viewer (`data-readonly`, no inputs / editing controls) + new draft lineage, legacy → explicit enable only |

Focused regression (13A history / autosave / reliability, 13B bank insertion + races + hydration, 13C-A Blueprint, 13C-B coverage, 13C-C policy / gates / Review Fix 1 / finalization / save policy / persistence / sanitizer, grader, official marks, saved exams, assignments lifecycle + concurrency + index + attempts, student exam runtime, preview, secret-key parity, all 14A suites): **48 files / 621 tests passed** (`scratchpad/14a/focused.log`).

## 17. Mutation proofs P1–P24

Each mutation applied alone → the nine 14A suites (87 tests) → exact failure recorded → reverted → tree fingerprint compared.

| # | Mutation | Result | First failing test |
|---|---|---|---|
| P1 | trust `exam.status === "final"` as published | **2 failed** · tree clean | × the lifecycle authority never reads exam.status; the panel derives state from the server manifest only |
| P2 | allow client `publishedRevisionId` to bind publication | **3 failed** · tree clean | × publication and approval bind only the manifest's own pointers — no client revision id in the approve / publish paths |
| P3 | overwrite an existing revision blob (unconditional write) | **3 failed** · tree clean | × revision / event blobs are written create-only and the manifest only through a conditional (ETag) write; no unconditional uploadJson in the authority |
| P4 | remove ETag / CAS protection on the manifest | **2 failed** · tree clean | × revision / event blobs are written create-only and the manifest only through a conditional (ETag) write; no unconditional uploadJson in the authority |
| P5 | allow a stale transition (skip expectedStateVersion) | **3 failed** · tree clean | × correct expectedStateVersion succeeds; a stale one is 409 STALE_STATE and mutates nothing (no event, no revision) |
| P6 | permit draft → published | **5 failed** · tree clean | × illegal transitions are refused with 409 and mutate NOTHING (draft→approved, draft→published, in-review→published, approved→in-review) |
| P7 | approve a client-supplied exam body instead of the stored review revision | **3 failed** · tree clean | × approve binds reviewRevisionId; a client exam body / revisionId is ignored — P7 |
| P8 | publish a client-supplied revision instead of `approvedRevisionId` | **2 failed** · tree clean | × publication and approval bind only the manifest's own pointers — no client revision id in the approve / publish paths |
| P9 | trust client actor id | **2 failed** · tree clean | × actor identity and timestamps are server values: the function builds the actor from auth.user.sub and the lib stamps nowOf(deps) |
| P10 | trust client timestamp | **2 failed** · tree clean | × actor identity and timestamps are server values: the function builds the actor from auth.user.sub and the lib stamps nowOf(deps) |
| P11 | trust client governance capability | **1 failed** · tree clean | × capabilities are enforced per action from the server actor, never from the request — P11 |
| P12 | skip server finalization validation | **4 failed** · tree clean | × draft → in-review is refused (422) when the SERVER finalization decision blocks; the client's canFinalize flag is ignored — P12/P13 |
| P13 | use the frontend `canFinalize` flag sent in the body | **1 failed** · tree clean | × draft → in-review is refused (422) when the SERVER finalization decision blocks; the client's canFinalize flag is ignored — P12/P13 |
| P14 | mutate the published revision when a new draft is saved | **4 failed** · tree clean | × return to draft from in-review / approved / published keeps the published revision intact and clears review/approval pointers |
| P15 | assignment uses the latest revision instead of the published one | **2 failed** · tree clean | × resolveGovernedExamSource: legacy → {governed:false}; governed+published → the exact revision; governed unpublished → error |
| P16 | a new publication rewrites the old assignment snapshot | **3 failed** · tree clean | × a later draft and a later publication never rewrite an existing assignment; a NEW assignment binds the NEW publication — P15/P16 |
| P17 | missing published revision falls back to the draft | **2 failed** · tree clean | × the published loader never falls back to the latest / draft revision |
| P18 | duplicate requestId creates a duplicate revision / event | **2 failed** · tree clean | × retrying the SAME completed command replays the result: no duplicate revision, no double increment, no duplicate event, no double publish — P18 |
| P19 | reading a legacy exam silently creates governance | **1 failed** · tree clean | × a legacy exam has no governance: status is not governed and reading it creates NO blob |
| P20 | audit event stores the complete exam body | **2 failed** · tree clean | × one event per successful mutation with server actor/time and requestId; events reference revision ids and never carry the exam body, tokens or answer keys — P20 |
| P21 | a student / anonymous request can use governance (auth removed) | **1 failed** · tree clean | × anonymous, student and invalid tokens are rejected with 401; nothing is written |
| P22 | signed bank image URL hashed / persisted as durable identity | **3 failed** · tree clean | × createRevision requires draft state, the author capability and a matching exam id; the exam body is canonicalized (signed bank URLs never persisted) |
| P23 | the published revision is deleted by a normal author operation | **5 failed** · tree clean | × return to draft from in-review / approved / published keeps the published revision intact and clears review/approval pointers |
| P24 | governance state derived from UI state (`exam.status`) instead of the server manifest | **5 failed** · tree clean | × the lifecycle authority never reads exam.status; the panel derives state from the server manifest only |

Tree fingerprint before `afb79dc3674fde57` → after `afb79dc3674fde57` (identical); every mutation applied alone, reverted, re-fingerprinted.

## 18. Validation

| Check (PR head — the single commit on `feature/14a-server-publishing-governance`) | Result |
|---|---|
| `npx tsc -b` | tsc exit: 0 |
| `npm test` | **541 passed (541) files / 6510 passed (6510)** |
| `npm run build` | build exit: 0 |
| `npm run check:bundle` | initial JS graph 12 files, 118.7 KB gzip (budget 125 KB) — baseline `6918ce1` (fresh worktree): 12 files, 119.3 KB gzip (budget 125 KB) → **delta -0.6 KB**; lazy chunks: `examGovernanceClient` 0.67 KB gzip, `FinalizationPanel` 1.44 KB gzip, `GovernancePanel` 4.09 KB gzip, `examFinalization` 9.35 KB gzip; check:bundle exit: 0 |
| `npm run lint` | lint exit: 0 — 99 findings on baseline (fresh worktree at `6918ce1`) vs 99 on head; finding-for-finding IDENTICAL (line numbers aside): **ZERO new warnings** |

## 19. Phase 14B boundary and non-goals

14A delivers the secure primitives (immutable revisions, server lifecycle, CAS + idempotency, capability enforcement,
audit). 14B — Review & Approval Roles / Institutional Governance — will add distinct Reviewer / Approver identities,
school / department role assignments, separation-of-duties policy, reviewer comments, approval requests / inboxes,
delegation, organization-level rules and an admin UI, without rewriting revision storage or lifecycle authority: the
capability resolver is the extension point (`users` by subject today; a directory tomorrow), and every event already carries
the acting identity. Not implemented here: question-bank generalization, enterprise assembly, AI review / approval, policy
recommendations, Blueprint presets, CS sandbox, organization directory, analytics, new simulations, product rename.
