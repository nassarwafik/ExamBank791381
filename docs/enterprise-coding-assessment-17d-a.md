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
* **Bounded:** `BULK_RETRY_LIMIT = 12` per call, `BULK_RETRY_CONCURRENCY = 4`; reply
  `{ ok, scheduled, dispatched, retryable, hasMore }`.
* **Resumable without a client cursor:** a target retried by a teacher within `BULK_RETRY_COOLDOWN_MS` (2 min) is skipped, so
  the next call continues with the rest (R28).
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
⌈N / 200⌉ sweeps (≈ 10 min each). Bulk retry reads one assignment, lists the assignment prefix, reads its submissions, and does
≤ 12 dispatches per call.

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
