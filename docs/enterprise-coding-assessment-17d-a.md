# Phase 17D-A — Enterprise Coding Grading Reliability & Operations

> Status: implemented on `feature/17d-a-coding-grading-reliability-operations` (baseline `main` = `e9a3ddb`, the PR #235 merge).
> Awaiting independent reliability and security review. **Recovery is inactive in production until it is configured** (see
> [§16 Production setup required after merge](#16-production-setup-required-after-merge)).

Phase 17C made official coding grading correct: the runner only executes; SmartAssess compares, weights and grades. It did not
make it **reliable**. If anything interrupts the chain between "attempt committed" and "callback applied", a coding question can
stay in manual review forever. Phase 17D-A closes that gap without adding a second grading authority:

* a scheduler-agnostic **Recovery Engine** that finds open coding targets in the committed attempts and re-dispatches the
  **same revision** through the ONE Phase 17C dispatch path;
* a signed **HTTP sweep trigger** (`POST /api/coding/grading-sweep`, protocol `SA-CODING-SWEEP-1`, a third HMAC key) driven by a
  **GitHub Actions schedule** — the managed Functions host is HTTP-only;
* teacher operations: a **bulk retry** (`POST /api/coding/bulk-retry`) and an aggregate **coding status in the gradebook**.

Nothing in the runner changed. The engine never runs code, never builds a runner request itself, never computes a grade and
never reads hidden tests: it decides *when* to call `ensureCodingGradingJobs()`, and nothing else.

---

## 1. Failure modes closed

| # | Situation (17C) | What was stuck | 17D-A recovery |
|---|---|---|---|
| F1 | Function host dies after the attempt CAS, before the post-commit dispatch (§56 crash-after-commit) | target `pending`, no job blob | sweep dispatches it after the pending grace window, same job id |
| F2 | Runner outage / refusal at dispatch (`EXECUTION_FAILED`, `RUNNER_BUSY`, `LANGUAGE_UNAVAILABLE`, `RUNNER_UNAUTHORIZED`, `GRADING_UNAVAILABLE`, …) | target `retryable` until a teacher clicks retry | automatic retries with deterministic backoff (§58), then the runner returns (§59) |
| F3 | Runner accepted the job but the callback never arrived (crash, network, callback refused) (§57) | target `dispatched` forever | after 30 min the same job is re-dispatched (the runner dedupes by job id) |
| F4 | Runner reported a technical failure (`RUNNER_INTERNAL`, `SUITE_TIMEOUT`, `CASE_INTERNAL_ERROR`, …) | target `retryable` | same as F2 |
| F5 | A teacher must retry dozens of targets one by one | manual clicks | one bulk retry per assignment |
| F6 | The gradebook cannot tell "still grading" from "needs action" | — | aggregate status badges + summary |

A technical failure is never a zero (unchanged 17C rule). A no-answer target is `complete` with 0 at planning time and is never
recovered.

## 2. Architecture

```
GitHub Actions schedule (every 10 min)            teacher (builder auth)
        │  signed POST {"version":1}                      │ POST {assignmentId}
        ▼                                                 ▼
POST /api/coding/grading-sweep                    POST /api/coding/bulk-retry
  (functions/coding-grading-recovery.js)            (same file)
        │ auth BEFORE any storage access                  │
        ▼                                                 ▼
runCodingGradingRecoverySweep()                   bulkRetryAssignment()
  (lib/coding/grading-recovery.js — scheduler-agnostic)
        │ lease · cursor · paginated scan of platform/submissions/ · pure decision · CAS claim
        ▼
ensureCodingGradingJobs(..., { targets:[key], states:[state], expect:{revision, jobId} })   ← Phase 17C, unchanged path
        │ re-reads attempt + snapshot · targetAuthority() · job upsert · signed runner request · target CAS
        ▼
Coding Runner (unchanged) ──signed callback──▶ applyOfficialCallback() (unchanged)
```

* **Source of truth:** `platform/submissions/<assignment>/<student>.json → attempts[].codingGrading.targets[questionId]`. The
  job store (`platform/coding-grading-jobs/`) is never scanned and never trusted for eligibility.
* **Reuse:** `officialJobId()`, `targetAuthority()`, `buildOfficialRunnerJob()`, `dispatchOfficialJob()`,
  `ensureCodingGradingJobs()`, `applyOfficialCallback()`, `rebuildAttemptGrades()` — no new job id, grade calculator, runner
  request builder, scoring or hidden-test reader.
* **No timers in `api/`:** no `app.timer`, queue, Service Bus, Event Grid, Durable Functions or cron (guarded by R35).

## 3. Data model (additive)

The 17C target gains ONE optional field:

```js
target.recovery = {
  automaticAttempts: 3,                       // automatic (sweep) dispatches of THIS revision
  lastAutomaticAttemptAt: "2026-…Z",
  exhausted: false,                           // true once MAX_AUTOMATIC_RECOVERIES is reached
  manualRetryAt: "2026-…Z"                    // set by a teacher retry / bulk retry (resets the two counters above)
}
```

* It never changes `revision`, `jobId`, `gradingKey`, `answerHash` or `questionFingerprint`.
* A force regrade builds a new target (`buildTarget`), which carries no `recovery`: a force invalidates any old recovery.
* Legacy attempts, non-coding attempts and attempts without `codingGrading` are skipped. No migration.

System documents:

| Blob | Purpose |
|---|---|
| `platform/system/coding-grading-recovery-v1.json` | durable cursor `{ schemaVersion: 1, continuationToken \| null, cycle, updatedAt, lastCycleCompletedAt? }` |
| `platform/system/coding-grading-sweep-lock.json` | lease `{ schemaVersion: 1, owner: <requestId>, acquiredAt, expiresAt }` |

## 4. Recovery policy (pure, deterministic)

`RECOVERY_POLICY` (frozen) and `recoveryDecision(target, nowMs)`:

| State | Eligible when | Reason when not |
|---|---|---|
| `complete` | never | `complete` |
| anything else not in {pending, dispatched, retryable} (e.g. `superseded`), or no job id / revision | never | `not-active` / `invalid` |
| `pending` | `now − updatedAt ≥ 2 min` (grace: the post-commit dispatch may still be in flight) | `pending-grace` |
| `dispatched` | `now − updatedAt > 30 min` (stale: the callback is presumed lost) | `dispatched-fresh` |
| `retryable` | `now − max(updatedAt, lastAutomaticAttemptAt) ≥ retryBackoffMs(automaticAttempts)` | `retryable-backoff` |
| any due target with `automaticAttempts ≥ 8` | never | `exhausted` |

`retryBackoffMs(n)` = 5, 10, 20, 40 min, then capped at 60 min (`min(60, 5·2ⁿ)`). An invalid `n` is treated as 0.

**Exhaustion.** `MAX_AUTOMATIC_RECOVERIES = 8`. When a target is due but exhausted, the sweep flags `recovery.exhausted = true`
once and keeps the target **retryable**. A stale dispatched or pending target becomes `retryable` with
`technicalCode: "RECOVERY_EXHAUSTED"`. Its existing technical code is kept, there is no zero, nothing is deleted, and the
question stays in manual review. A flagged target is never rewritten again. A teacher retry or bulk retry resets the counters.
Force regrade remains the only way to start a new revision.

The 30-minute stale threshold is shared with the gradebook as `STALE_DISPATCHED_MS` (official-grading.js).

## 5. The sweep (`runCodingGradingRecoverySweep(container, options, deps)`)

1. **Lease.** CAS create (`If-None-Match: *`) or takeover of an EXPIRED lease (`If-Match`), TTL 3 min. A lease is also treated
   as expired when its expiry is implausibly far in the future (> 10 min). Any conflict means `busy`: the sweep returns
   `{ ok: false, status: "busy" }` and touches nothing else.
2. **Cursor.** Reads the durable cursor. A malformed document, a non-string or oversized token, or a bad cycle resets it to
   the start (`cursorReset: true`).
3. **Page.** `listBlobNamesPage(container, "platform/submissions/", { continuationToken, maxPageSize })` returns
   `{ names, continuationToken | null }`, `.json` only. A token the service rejects (HTTP 400) surfaces as
   `INVALID_CONTINUATION_TOKEN`; the sweep resets to the start and continues. `listBlobNames` is unchanged.
4. **Read and decide.** The page's submissions are read with the platform read concurrency. Identifiers come from the blob
   NAME, and a document whose own ids disagree is skipped. Every target gets the pure decision.
5. **Work** (`concurrency` workers, each checking the deadline and the dispatch budget before every item):
   * **claim:** a CAS on the submission (`mutateTarget`) that re-finds the target and requires the same revision and job id,
     not complete, and **still due**. It records the automatic attempt (`automaticAttempts + 1`, `lastAutomaticAttemptAt`)
     durably before any side effect;
   * **dispatch:** `ensureCodingGradingJobs` with `states: [claimedState]` and `expect: { revision, jobId }`. That call
     re-derives the authority (fail closed: `AUTHORITY_CHANGED`), upserts the job, sends the signed runner request, and
     CAS-updates the target (refused when complete or the revision moved);
   * **exhaust:** see §4.
6. **Advance.** Only when every item of the page was worked, and only if this request **still owns the lease**, the cursor
   moves past the page. The end of the listing writes a `null` token and increments `cycle` (`cycleCompleted: true`), and the
   sweep stops there. A page cut short by the deadline or the dispatch budget leaves the cursor before it. The next sweep
   re-reads it, and the targets already handled are no longer due (fresh dispatched / in backoff), so nothing is repeated or
   lost (R17, R18).
7. **Release.** An ETag-conditional delete of the lease, only by its owner. A sweep that lost its lease never releases it.

**Bounds** (`SWEEP_LIMITS`, frozen): `maxScanned 200` submissions, `pageSize 100`, `maxDispatches 12`, `concurrency 4`,
`deadlineMs 25 000`, `leaseTtlMs 3 min`. A claim that turns out stale (`skipped`) gives its dispatch slot back.

**Result:** aggregate facts only — `{ ok, status, stoppedBy (end-of-cycle | scan-budget | dispatch-budget | deadline |
lease-lost), scanned, pages, eligible, dispatched, retryable, exhausted, skipped, errors, cycle, cycleCompleted, cursorReset,
leaseLost, durationMs }`. It never contains a student, assignment, job id, grading key, source, stdin/stdout, hidden test or
expected output (R21).

## 6. Race safety

| Concurrent actor | Outcome |
|---|---|
| Callback lands during the sweep | callback wins: `updateTarget` refuses to move a complete target; `setJobState` refuses a complete job (R14) |
| Force regrade between scan and claim | the claim CAS sees another revision or job id and does nothing; `expect` keeps `ensure` from dispatching another revision (R13) |
| Force regrade after a recovery | the new revision has no `recovery`; the old job is `superseded`; an old callback is `STALE_RESULT` (17C) |
| Teacher retry / bulk retry vs sweep | both dispatch the same job id (the runner dedupes); counters reset by the teacher action |
| Manual grade / override | `rebuildAttemptGrades` applies overrides last: a manual override always wins (R15) |
| A second sweep | `busy` (409 `SWEEP_BUSY`); an expired lease is taken over by exactly one CAS winner (R19) |
| Lease lost mid-sweep | the sweep stops without advancing the cursor or releasing the other owner's lease (R20) |
| Stored answer changed after planning | `targetAuthority` recomputes the grading key: `AUTHORITY_CHANGED`, no runner call (R34) |

No backward move from `complete` is possible: every write path (claim, exhaustion mark, dispatch result) is a CAS that refuses
a complete target.

## 7. Dispatch hardening (key separation at dispatch)

`dispatchOfficialJob` now requires `resolveCallbackKey(env)` (Review Fix 1 resolver) instead of the bare callback key reader.
With **equal raw runner and callback keys nothing is sent**: the target stays `retryable` with `EXECUTION_UNAVAILABLE`. This
holds for the post-commit hook, teacher retry, bulk retry and recovery alike (R32). Before this change the dispatcher sent jobs
whose results could never be authenticated (fail-first evidence: `failfirst-r32-direct.txt`: 1 runner call at `e9a3ddb`).

## 8. Sweep trigger protocol — `SA-CODING-SWEEP-1`

`lib/coding/sweep-protocol.js` (verifier and reference signer) and `scripts/coding-grading-sweep.mjs` (independent signer;
the parity test pins both to the same bytes):

```
x-sa-sweep-protocol    "1"
x-sa-sweep-timestamp   Unix seconds (10 digits), ±300 s
x-sa-sweep-request-id  /^[A-Za-z0-9_-]{8,64}$/   (also the lease owner id)
x-sa-sweep-signature   "v1=" + hex(HMAC-SHA256(CODING_GRADING_SWEEP_HMAC_KEY,
                          "SA-CODING-SWEEP-1\nPOST\n/api/coding/grading-sweep\n" + timestamp + "\n" + requestId + "\n" + hex(SHA-256(body))))
```

* **Not interchangeable:** the protocol label in the canonical string, the fixed logical path and the header names differ from
  `SA-CODING-RUNNER-1` and `SA-CODING-CALLBACK-1`. A callback signature (even under the same key) is never a sweep signature,
  and vice versa (R22). The 17C protocols are untouched; a shared canonical signer was deliberately not introduced, to keep
  the reviewed 17C code byte-identical.
* **Verification order:** format → HMAC (constant time) → timestamp window. A stale request with a bad signature reports
  `signature`.
* **Replay model (no nonce store; that is 17D-B):** a captured request can be replayed within ±300 s. A sweep is idempotent:
  it only re-dispatches targets that are *still due*, at the same revision, with the deterministic job id the runner dedupes.
  It is bounded and serialized by the lease, so a replay can at most cause one more bounded sweep or a 409 `SWEEP_BUSY`. It
  cannot choose targets, revisions or grades, because the body is fixed (`{"version":1}`).

> **Superseded by Phase 17D-B1:** each signed request id is now reserved once in a durable replay ledger (409
> `REPLAYED_REQUEST`), and the request-id minimum is 20 characters. See
> [enterprise-coding-assessment-17d-b.md](enterprise-coding-assessment-17d-b.md).

## 9. Key separation (third key)

`resolveSweepKey(env)` returns the key only if `CODING_GRADING_SWEEP_HMAC_KEY` is 32–512 characters with no whitespace **and**
differs, on exact raw bytes, from both `CODING_RUNNER_HMAC_KEY` and `CODING_GRADING_CALLBACK_HMAC_KEY`. That holds whatever
the runner URL, the kill switch or the callback key's own validity is (partial configurations are covered by R23). Otherwise
the route answers 503 `SWEEP_UNAVAILABLE`. The scheduler holds only the sweep key; it cannot sign runner requests or callbacks.

## 10. `POST /api/coding/grading-sweep`

Anonymous transport, classified `SIGNED` in the route-auth inventory. The order of checks, **all before any storage access**
(R24, verified with a counting container proxy):

1. no `x-sa-sweep-signature` → **401** `UNAUTHORIZED` (even when unconfigured)
2. sweep key missing / weak / not separated → **503** `SWEEP_UNAVAILABLE`
3. body > 1 KB or unreadable → **400** `REQUEST_INVALID`
4. HMAC mismatch / format → **401**
5. timestamp outside ±300 s → **401**
6. body not exactly `{"version":1}` (unknown fields, other version, array, not JSON) → **400**
7. lease busy → **409** `SWEEP_BUSY`
8. engine → **200** with the aggregate result; an unexpected failure → **500** `INTERNAL` (lease released)

All replies are `Cache-Control: no-store`.

## 11. Scheduler — `.github/workflows/coding-grading-recovery.yml`

* `schedule: "7,17,27,37,47,57 * * * *"` (every 10 min, off the hour) and `workflow_dispatch`.
* `permissions: contents: read`; `concurrency` group; `timeout-minutes: 5`; first-party actions only (`actions/checkout`,
  `actions/setup-node`); checkout without persisted credentials.
* One variable (`SMARTASSESS_GRADING_SWEEP_URL`) and one secret (`CODING_GRADING_SWEEP_HMAC_KEY`). There are no cloud
  credentials and no other keys.
* `node scripts/coding-grading-sweep.mjs` signs with Node `crypto`, uses `redirect: "error"` and a 60 s timeout, and prints
  only aggregate counts. Configuration errors name the setting, never its value. The key and the signature are never printed
  (R33).
* Exit codes: 2xx → 0; **409 `SWEEP_BUSY` → 0 (documented success)**; 401 / 400 / 503 / 500 / any other 409 / redirect /
  network error / missing configuration → 1.

## 12. Bulk retry — `POST /api/coding/bulk-retry`

Builder auth. Body exactly `{ "assignmentId": "<id>" }`; anything else → 400; unknown assignment → 404 `NOT_FOUND`.

* **Selection:** pending, retryable (including exhausted) and *stale* dispatched targets of every attempt of the assignment.
  Never `complete`, never a freshly dispatched target, never a no-answer.
* **Same revision:** each target is reset by a CAS (`recovery = { automaticAttempts: 0, exhausted: false, manualRetryAt }`,
  same revision, job id and grading key), then dispatched via `ensureCodingGradingJobs(..., expect)`.
* **Bounded in every dimension (Review Fix 1, §20):** per call at most `BULK_RETRY_MAX_SCANNED = 100` blob names listed (and
  so at most 100 submissions downloaded), `BULK_RETRY_LIMIT = 12` dispatches, `BULK_RETRY_CONCURRENCY = 4` in flight, and no new
  claim *and no new runner dispatch* after `BULK_RETRY_DEADLINE_MS = 20 s` (Review Fix 2, §21). All of these are server constants; the body is exactly `{ assignmentId }`. Reply:
  `{ ok, scheduled, dispatched, retryable, hasMore }`.
* **Resumable through a server-owned operation cursor:** see §20. The cooldown (`BULK_RETRY_COOLDOWN_MS`, 2 min) only dedupes
  a target a teacher retried moments ago; it never owns progress.
* **Audit:** ONE `coding.autoGrade.bulkRetry` event per call (`targetType: "assignment"`, counts only) and one observability
  event with the same aggregates.

The Phase 17C single-target `retry` (same revision; also for a fresh dispatched target; `complete` → 409) and `force` (new
audited revision) are unchanged (R31). The single retry additionally resets an existing `recovery` block.

## 13. Gradebook and student payload

* `codingGradingStatus(attempt, nowMs)` gives `{ pending, retryable, stale }`, or `null` when nothing is open. `pending`
  includes a fresh dispatched target. It is added to every gradebook attempt and `latestResult` as `codingGrading` (only while
  open), and the GET reply gains `codingSummary` (the sum over all attempts). No technical code, job id, grading key or recovery
  internal is ever included (R30b).
* UI (lazy teacher chunk only):
  * row badge «التصحيح البرمجي يحتاج إعادة محاولة» (retryable or stale) or «تصحيح برمجي جارٍ» (pending);
  * a bulk button «إعادة محاولة التصحيح البرمجي» when the summary needs a retry and the assignment is not archived;
  * a confirmation that states that answers and manual reviews do not change;
  * a summary notice «تمت جدولة إعادة المحاولة لـ N أسئلة برمجية.» (with a continuation hint when `hasMore`);
  * an authoritative reload.
* **Student payload unchanged:** still only the 17C boolean `autoGradingPending`, with no recovery internals (R30c).

## 14. Read-cost model

Per sweep, worst case with the default limits:

| Step | Reads | Writes |
|---|---|---|
| lease acquire / release | 2 | 2 (create, conditional delete) |
| cursor read | 1 | — |
| list pages (≤ 2 × 100) | 2 list calls | — |
| submissions | ≤ 200 | — |
| per page: lease-ownership check + cursor write | ≤ 2 + 2 | ≤ 2 |
| per dispatch (≤ 12): claim CAS, assignment + submission re-read, job upsert, target CAS, job state CAS | ≈ 6 | ≈ 4 + 1 audit (17C per-target audit) |
| per exhaustion flag | 1 | 1 |

So about 280 reads and 55 writes per sweep at most. At 6 sweeps an hour that is ≤ ~1 700 reads and ~330 writes an hour; an
idle system (nothing due) costs only the scan, about 205 reads per sweep. A full cycle over N submission documents takes
⌈N / 200⌉ sweeps (≈ 10 min each). Bulk retry (per call): 1 assignment read, 1 cursor read + 2 cursor writes (lock, then
progress and release), ≤ 100 listed names, ≤ 100 submission downloads, ≤ 12 dispatches (each ≈ 6 reads and 5 writes, as for the
sweep) and 1 audit write. An assignment with N submissions is walked in about ⌈N / 100⌉ calls when little is eligible, and in
⌈eligible / 12⌉ calls when a lot is.

## 15. Observability and audit

| Event | Fields (aggregates only) |
|---|---|
| `coding.autoGrade.recovery.started` | `maxScanned`, `maxDispatches` |
| `coding.autoGrade.recovery.completed` | the result object of §5 |
| `coding.autoGrade.recovery.busy` | — |
| `coding.autoGrade.recovery.failed` | counts so far + a safe error code (never a message, which could carry a blob name) |
| `coding.autoGrade.recovery.unauthorized` / `.refused` | `reason` |
| `coding.autoGrade.bulkRetry` | `scheduled`, `dispatched`, `retryable`, `hasMore`, `skipped` |

There is no per-sweep audit event (no audit flood). The per-target 17C audits (`coding.autoGrade.dispatched` /
`.retryable`) still record each real dispatch, and bulk retry writes exactly one audit event per call. The engine calls
`ensureCodingGradingJobs` without the per-target logger, so its telemetry stays aggregate.

## 16. Production setup required after merge

Recovery is **inactive until configured**. Without the settings below the sweep route answers 503, and the scheduled workflow
fails with a clear configuration message (no grading behaviour changes; 17C keeps working exactly as before).

1. Generate a new random key of at least 32 characters, e.g. `openssl rand -base64 48 | tr -d '\n='`. It **must differ** from
   `CODING_RUNNER_HMAC_KEY` and `CODING_GRADING_CALLBACK_HMAC_KEY`. Never reuse a key.
2. In the Function App settings: `CODING_GRADING_SWEEP_HMAC_KEY = <key>`.
3. In the GitHub repository settings, add:
   * **secret** `CODING_GRADING_SWEEP_HMAC_KEY = <the same key>`;
   * **variable** `SMARTASSESS_GRADING_SWEEP_URL = https://<production host>/api/coding/grading-sweep`.
4. Run the workflow once with **Run workflow** (`workflow_dispatch`). Expect `HTTP 200 status=completed …`, or `409 SWEEP_BUSY`.
5. Watch `coding.autoGrade.recovery.completed` in the logs for a few cycles.

To pause recovery: disable the workflow, or remove the Function App setting (the route answers 503). To rotate: change both
copies of the key (Function App first, then the GitHub secret). The next scheduled run uses the new key.

## 17. Compatibility and out of scope

* Additive only: the `recovery` field, the `codingGrading` / `codingSummary` gradebook fields and two system blobs. Legacy and
  non-coding attempts are untouched.
* The runner, the runner protocol, the callback protocol and the student payload are unchanged.
* Out of scope (Phase 17D-B): a nonce / replay store, an evidence-retention redesign, and runner-side queue persistence.

## 18. Tests and evidence

Fail-first on `e9a3ddb` (scratch evidence `17da/failfirst-*.txt`): 43 of 45 backend tests failed, plus the UI file failing at
import (missing modules); R30c and R31 passed by design (they guard unchanged 17C / student behaviour).

| Suite | Tests |
|---|---|
| `api/tests/coding-17d-a-recovery.test.js` | R1, R3–R15, R32, R34, §56–§59 |
| `api/tests/coding-17d-a-sweep.test.js` | R2, R16, R16b, R17–R26, R33a–d, R35 |
| `api/tests/coding-17d-a-bulk-gradebook.test.js` | R27–R29, R30a–c, R31 |
| `src/assignments/codingRecovery.17d-a.test.tsx` | U1–U6 |
| `api/tests/route-auth-inventory-11a.test.js` | `codingGradingSweep` classified SIGNED; both new routes reject anonymous callers |

Vertical scenarios: §56 crash-after-commit, §57 stale callback loss, §58 runner outage with backoff, and §59 recovery after the
runner returns. All run end to end through the real planner, dispatcher and callback applier against the in-memory blob
container (with real CAS semantics and paginated listing).

## 19. Mutations RM1–RM20

Each mutation is applied to the working tree, the killing test is run, and the file is restored byte-exact. The fingerprint
`sha256({ git status --porcelain; git diff; })` is compared before and after.

| # | Mutation | Killed by |
|---|---|---|
| RM1 | backoff without the 60 min cap | R1 |
| RM2 | no pending grace window | R4 |
| RM3 | every dispatched target treated as stale | R5 |
| RM4 | MAX_AUTOMATIC_RECOVERIES not enforced | R7 |
| RM5 | claim does not record the automatic attempt | R8 |
| RM6 | `ensure` ignores `expect` (revision binding) | R13 |
| RM7 | dispatch reads the callback key without separation | R32 |
| RM8 | lease busy check removed | R19 |
| RM9 | an incomplete page advances the cursor | R17 |
| RM10 | cursor written without the lease-ownership check | R20 |
| RM11 | invalid continuation token not reset | R16b |
| RM12 | worker concurrency unbounded | R17 |
| RM13 | dispatch budget ignored | R17 |
| RM14 | internal deadline ignored | R18 |
| RM15 | sweep key not separated from the callback key | R23 |
| RM16 | sweep timestamp window not enforced | R22 |
| RM17 | sweep body not strictly validated | R24 |
| RM18 | bulk retry selects freshly dispatched targets | R27 |
| RM19 | teacher retry does not reset recovery | R12 |
| RM20 | scheduler treats any 409 as success | R33c |

## 20. Independent Reliability Review Fix 1 — Bounded Bulk Retry Enumeration

**Root cause (at `81d7733`).** `bulkRetryAssignment()` bounded only the *dispatches* (12 per call). It still listed the whole
`platform/submissions/<assignment>/` prefix with `listBlobNames()`, downloaded *every* submission, derived every candidate,
and only then took the first 12. Each `hasMore` call repeated that full scan. Progress across calls depended on the 2-minute
cooldown: once it expired, the first batch became eligible again and later targets could starve. Fail-first evidence (BR1): one
call over 1 000 submissions downloaded **1 000** submission documents.

**Fix.** The per-call bounds of §12, plus a server-owned operation cursor per assignment,
`platform/system/coding-bulk-retry/<assignmentId>.json`:

```js
{ schemaVersion: 1, assignmentId,
  operation: { startedAt, pageToken, after: { name, attemptNumber, targetKey } | null } | null,   // null = no operation in progress
  lock?: { owner, expiresAt },                                                                   // held only while a call runs
  updatedAt, lastCompletedAt? }
```

* **Paginated enumeration.** The call uses `listBlobNamesPage()` with `maxPageSize = BULK_RETRY_MAX_SCANNED − listed so far`;
  the unbounded `listBlobNames()` is no longer used here. Every listed name counts toward the bound, so listing and downloads
  are both ≤ 100 per call.
* **Total order.** Targets are ordered by (blob name, attempt number, target key). `after` is the last target **taken** in the
  page identified by `pageToken`. The next call re-lists that page, skips the names before `after.name` without downloading
  them, and resumes with the first target after `after`. That works mid-page, mid-submission and mid-attempt (BR4). Workers take
  targets strictly in order, so the processed set is always a prefix: no target is skipped and none is advanced past unseen.
* **Page completion.** A page whose targets are all taken moves `pageToken` to the next page and clears `after`. The end of the
  listing completes the operation (`operation: null`, `hasMore: false`), and the next call starts a new operation from the
  beginning.
* **`hasMore`** means that this operation still has assignment space it has not processed: unscanned pages, or untaken targets
  of a page cut short by the dispatch limit, the scan bound or the deadline. It no longer means "more than 12 candidates after a
  full scan" (BR6).
* **Deadline.** Checked before each page, before each page's downloads and before each target is claimed. *As corrected by
  Review Fix 2 (§21):* the claim is asynchronous, so the Review Fix 1 code could still enter the dispatch path after the deadline.
  The deadline is now also re-checked synchronously between a successful claim and `ensureCodingGradingJobs()`. Work already in
  flight finishes (bounded by the 8 s runner timeout). Progress is saved and the call returns `hasMore: true` (BR5, BR5b, BR11).
* **Concurrency control.** Acquiring the cursor is a CAS write that sets a 60 s lock (create with `If-None-Match`, or update
  with `If-Match`). A concurrent call gets **409 `BULK_RETRY_BUSY`** (BR9). Progress is written and the lock released with
  `If-Match` on the acquired ETag. A call that lost an expired lock never overwrites newer progress; its work is simply
  re-checked later (the reset and dispatch are idempotent: same revision, same deterministic job id). An invalid listing token
  resets the operation once. A malformed, foreign or stale (> 24 h) operation starts a new one.
* **Unchanged.**
  * Eligibility (pending, retryable including exhausted, stale dispatched; never complete or fresh).
  * Same revision, job id and grading key; the reset applies only to targets actually taken (`manualRecovery()`).
  * The CAS skips a target that completed since the scan (BR7) or whose revision moved after a force regrade (BR8).
  * One aggregate audit event per call, and an aggregate-only reply. The client never sees or sends the cursor (BR10).
* The automatic recovery sweep is unchanged.

**Tests (`api/tests/coding-17d-a-bulk-bounded.test.js`).** Fail-first on `81d7733`: BR1, BR2, BR3, BR5, BR6 and BR9 failed;
BR4, BR7, BR8 and BR10 passed (they guard behaviour that was already correct).

| # | Proof |
|---|---|
| BR1 | 1 000 submissions, one call: ≤ 100 distinct submission downloads, ≤ 100 listed names, ≤ 12 dispatches, ≤ 4 in flight |
| BR2 | 30 targets → calls schedule 12 / 12 / 6, each target exactly once; no call restarts at submission #1; one audit per call |
| BR3 | cooldown expiring between every call: all 30 targets still progress, exactly once, in 3 calls |
| BR4 | 2 attempts × 2 coding targets per submission: the limit stops mid-attempt; the next call resumes at the first untaken target |
| BR5 | a slow runner stops the call at the deadline with `hasMore`; later calls finish every target exactly once |
| BR6 | 150 submissions with only the last one eligible: call 1 → 0 scheduled, `hasMore: true`; call 2 → 1 scheduled, done |
| BR7 | a callback completes a target between scan and claim: skipped, still complete, never revisited |
| BR8 | a force regrade between scan and claim: old (revision, job) refused; the new revision stays authoritative |
| BR9 | two concurrent calls: one 200, one 409 `BULK_RETRY_BUSY`; no revision / job id change; all targets finish exactly once |
| BR10 | extra body fields (student / question / job id, revision, cursor, limit, states) → 400; the reply is aggregate-only |

**Mutations BRM1–BRM8**

| # | Mutation | Killed by |
|---|---|---|
| BRM1 | enumerate with `listBlobNames()` (unpaginated) | BR1 |
| BRM2 | ignore the stored cursor (restart every call) | BR2 / BR3 |
| BRM3 | advance `after` past untaken targets of the page | BR4 |
| BRM4 | never persist the cursor (cooldown alone owns progress) | BR3 |
| BRM5 | remove the scan bound | BR1 |
| BRM6 | remove the internal deadline | BR5 |
| BRM7 | accept a client `studentId` to select targets | BR10 / R29 |
| BRM8 | bulk retry increments the revision | R27 / BR9 |

## 21. Independent Reliability Review Fix 2 — Strict Pre-Dispatch Deadline

**Race window (at `03e3616`).** The Bulk Retry worker checked the deadline *before* taking a target. It then awaited
`mutateTarget()` — the CAS claim that re-checks eligibility and applies `manualRecovery()` — and called
`ensureCodingGradingJobs()` straight after. The claim is asynchronous (a read plus a conditional write, with CAS retries), so
storage latency could carry it past `BULK_RETRY_DEADLINE_MS`. The dispatch path, meaning the job upsert and the runner request,
then **started after the deadline**. Fail-first evidence:
* BR11: 3 runner dispatches started after the deadline in one call;
* BR11b: 1 started after the deadline while concurrent claims finished out of order.

**Why a simple second check after `mutateTarget()` is unsafe.** By then the claim has already written
`recovery = { automaticAttempts: 0, exhausted: false, manualRetryAt: now }`. If the call just stopped:
* the Review Fix 1 cooldown would skip that target on the next call, because `manualRetryAt` is recent;
* the cursor would already have moved past it (it was "taken").

The target would be stranded for the rest of the operation. This was verified with a temporary probe and reverted byte-exact:
with only a naive post-claim check, BR11's second call scheduled **0** of the 3 claimed targets.

**Implemented invariant.** *A Bulk Retry request never begins a new runner dispatch after `BULK_RETRY_DEADLINE_MS`, and a target
is never lost because the deadline expired between its claim and its dispatch.*

1. **Synchronous pre-dispatch gate.** After a successful claim, `overDeadline()` is re-checked with no `await` between the check
   and the call to `ensureCodingGradingJobs()`. A target that misses it is **deferred**: it is not dispatched, not counted as
   scheduled, and the call stops with `hasMore: true`. Work already in the dispatch path finishes (bounded by the 8 s runner
   timeout).
2. **The claim stays rediscoverable.** The claim changes neither the target's state, revision, job id nor grading key; it only
   resets the automatic counters, which is the teacher's intent. The cooldown now dedupes only a manual retry that **reached a
   dispatch outcome** (`target.updatedAt ≥ recovery.manualRetryAt`), so a bare claim never hides a target. This also covers a host
   crash between claim and dispatch. Single-target retries and finished bulk retries are still deduped (R28 unchanged).
3. **Exact cursor.**
   * The cursor stops just **before the first deferred target** (`after`). Everything before it was finished in order.
   * Targets past it that concurrent workers already finished out of order are recorded in the cursor's `handled` list. That
     list holds at most `BULK_RETRY_HANDLED_MAX = 16` positions, all after `after`; it is validated on read, and a malformed one
     starts a fresh operation.
   * The next call resumes at the deferred target and skips `handled` positions, so no target is skipped and none is sent twice
     within the operation.
   * `handled` is cleared when the page completes.
4. **Unchanged.**
   * Authority, eligibility, and the CAS precedence of callbacks and force regrades (BR7, BR8).
   * Same revision, job id and grading key.
   * The pre-claim deadline check, and every Review Fix 1 bound.
   * The server-owned cursor and lock.
   * The aggregate-only reply and audit, and the API reply shape.

**Tests (`api/tests/coding-17d-a-bulk-bounded.test.js`).** Fail-first on `03e3616`'s implementation: BR11 and BR11b failed; the
other 11 passed.

| # | Proof |
|---|---|
| BR11 | The first claim write advances the clock past the deadline. The claim began below the limit and ended above it. **No runner request and no job upsert** happen in call 1, which returns `hasMore: true`, 0 scheduled. Call 2 schedules and dispatches all 3 targets **exactly once**, with the same revision, job id and grading key. The complete, no-answer and freshly dispatched bystanders are byte-identical. The two audits carry aggregate keys only. |
| BR11b | sid2's claim is slow in real time while later targets claim and dispatch, so the completion is out of order (the deferred target sits before finished ones). No dispatch starts after the deadline. With a busy runner (targets stay eligible) and the cooldown expiring before every later call, all 8 targets are attempted exactly once, including the deferred one. |
| BR5 (strengthened) | After a deadline stop, at most `BULK_RETRY_CONCURRENCY` targets are left claimed but undispatched. |
| BR5b | The deadline passes while the page is downloading: **no claim (no submission CAS write) and no dispatch** start afterwards. Later calls finish all 6 targets exactly once. |

**Mutations BRM1–BRM9: 9/9 killed** (byte-exact restore; fingerprint `8791d7e0…da7dfa` matched before and after).

| # | Mutation | Killed by |
|---|---|---|
| BRM1 | `listBlobNames()` instead of pagination | BR1 |
| BRM2 | ignore the stored cursor | BR2 |
| BRM3 | advance the cursor past untaken or deferred targets | BR4 |
| BRM4 | never persist the cursor | BR3 |
| BRM5 | remove the scan bound | BR1 |
| BRM6 | remove the pre-claim deadline check | BR5b |
| BRM7 | accept extra body fields | BR10 |
| BRM8 | bulk retry increments the revision | R27 |
| **BRM9** | **remove the post-claim / pre-dispatch deadline check** | **BR11** |

Two supplementary mutations were also killed:
* reverting the cooldown to "recent `manualRetryAt`" only → BR11 (the deferred targets become stranded);
* removing the `handled` skip → BR11b (duplicates after the cooldown).

**Validation.** See the PR body "Independent Reliability Review Fix 2" section for the exact counts on the pushed head.

