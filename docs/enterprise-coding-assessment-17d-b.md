# Phase 17D-B1 — Signed Sweep Replay Protection & Request Ledger

> Status: implemented on `feature/17d-b1-sweep-replay-protection` (baseline `main` = `6a50f54`, the PR #236 merge).
> Awaiting independent security and reliability review. Scope is **only** replay protection of the Phase 17D-A sweep trigger:
> no runner persistence, no grading journal, no UI, no queue / Redis / SQL.

Phase 17D-A shipped the signed recovery sweep trigger `POST /api/coding/grading-sweep` (protocol `SA-CODING-SWEEP-1`) with an
explicit residual risk ([17D-A §8](enterprise-coding-assessment-17d-a.md#8-sweep-trigger-protocol--sa-coding-sweep-1)):
a captured, validly signed request could be replayed while its timestamp was inside the ±300 s window. Phase 17D-B1 closes
that: **every validly signed sweep request is accepted at most once**, enforced by a durable, server-owned ledger.

---

## 1. Threat

| Threat | 17D-A behaviour | 17D-B1 behaviour |
|---|---|---|
| Replay of a captured signed request inside ±300 s | accepted; one more bounded sweep (or `SWEEP_BUSY`) | **409 `REPLAYED_REQUEST`**, sweep never reached (RP2) |
| Concurrent submission of the same request | each ran or hit the lease | exactly one reserves (atomic CAS); the rest are `REPLAYED_REQUEST` (RP3) |
| Replay after a Functions restart / on another instance | n/a (no state) | refused — the ledger is in blob storage, not memory (RP8) |
| Changing the request id to dodge the ledger | — | impossible: the id is part of the HMAC canonical input (RP2, RPM9) |
| Storage-amplification by unauthenticated traffic | no writes | still **no storage access at all** before HMAC + freshness + id format (RP4, RP5, RP7) |
| Path traversal through the request id | — | ledger names are `sha256` hex digests under a fixed prefix (RP7) |
| Ledger unavailable / ambiguous CAS outcome | — | **503 `SWEEP_UNAVAILABLE`**, sweep never runs (fail closed, RP11, RP11b) |

The sweep was already idempotent (it only re-dispatches *still due* targets at the same revision with deterministic job ids)
and the body is fixed, so a replay could never choose targets or grades. 17D-B1 removes the remaining "one extra sweep per
captured request" amplification and makes "a signed request executes once" a hard guarantee.

## 2. Protocol — unchanged `SA-CODING-SWEEP-1`, tightened request id

The request id was **already HMAC-authenticated** (it is the 5th line of the canonical string), so it is reused as the replay
nonce. The canonical bytes, headers and signature format are byte-identical to 17D-A, so the protocol version stays
`SA-CODING-SWEEP-1`:

```
x-sa-sweep-protocol    "1"
x-sa-sweep-timestamp   Unix seconds (10 digits), ±300 s
x-sa-sweep-request-id  /^[A-Za-z0-9_-]{20,64}$/     ← 17D-B1: minimum raised from 8 to 20
x-sa-sweep-signature   "v1=" + hex(HMAC-SHA256(CODING_GRADING_SWEEP_HMAC_KEY,
                          "SA-CODING-SWEEP-1\nPOST\n/api/coding/grading-sweep\n" + timestamp + "\n" + requestId + "\n" + hex(SHA-256(body))))
```

* The 20-character minimum forces a nonce with real entropy; the 64-character maximum is the 17D-A lease-owner bound (the id
  is also the lease owner), so no other component changes.
* Verification order is unchanged: protocol → timestamp format → **request-id format** → signature format → HMAC (constant
  time) → freshness. A malformed id is refused (401) before any storage access.
* **Signer** (`scripts/coding-grading-sweep.mjs`): every invocation now signs `"gh_" + base64url(24 random bytes)` (35 chars,
  192 bits). The id is never printed. `409 REPLAYED_REQUEST` maps to exit 1 (a failure) — it is never treated like
  `SWEEP_BUSY` (RP6b).

## 3. Handler ordering

```
unsigned                                   → 401 UNAUTHORIZED            (no storage)
key not configured / not separated         → 503 SWEEP_UNAVAILABLE       (no storage)
body > 1 KB                                → 400 REQUEST_INVALID         (no storage)
verify: format, HMAC, freshness            → 401 UNAUTHORIZED            (no storage)
body ≠ {"version":1}                       → 400 REQUEST_INVALID         (no storage)
── 17D-B1 ──────────────────────────────────────────────────────────────────────────────
reserve request id (conditional create)
    exists: 409 BlobAlreadyExists          → 409 REPLAYED_REQUEST        (no lease, no engine)
    exists: 412 ConditionNotMet            → 409 REPLAYED_REQUEST        (no lease, no engine)
    any other outcome                      → 503 SWEEP_UNAVAILABLE       (no lease, no engine)
────────────────────────────────────────────────────────────────────────────────────────
lease (17D-A)                              → 409 SWEEP_BUSY
engine                                     → 200 aggregates
one bounded ledger cleanup step            (never throws, never changes the response)
```

The reservation is the **first storage write** of the route and happens only for authenticated, fresh, well-formed requests.
A replay never reaches the lease. `SWEEP_BUSY` and `REPLAYED_REQUEST` are distinct codes: a fresh request that loses the lease
race has still consumed its id (it was authenticated and reserved); the scheduler's next invocation uses a new id.

## 4. Storage — the ledger

`api/src/lib/coding/sweep-replay-ledger.js`

* **Path:** `platform/system/coding-sweep-replay/<hex(SHA-256("sa-sweep-replay-v1\n" + requestId))>.json`. Fixed prefix + 64 hex
  characters: request-id text never becomes part of a blob name, so no traversal or prefix confusion is possible. The digest
  is derived from the id alone (no time bucket), so one id always maps to one record.
* **Atomicity:** one `uploadJsonConditional(..., etag = null)` → a single Put Blob whose **only** precondition is
  `If-None-Match: *` (RP3b pins the exact `conditions` object). The service evaluates the precondition together with the
  write, so there is no read-then-write window and at most one request can create the record. See §4.1 for how the outcome
  is classified.
* **Record (identifier-free metadata only):**
  `{ schemaVersion: 1, protocol: "SA-CODING-SWEEP-1", requestDigest, signedAt, acceptedAt, expiresAt }`.
  No key, signature, raw request id, body, student, attempt, job id, source, hidden test or grading key (RP9, RP12).
* **No in-memory state.** Every decision is made against blob storage, so restarts and scale-out are covered (RP8).

### 4.1 Reservation outcome classification (review fix 1)

A failed create-only write can report "the blob already exists" in two shapes, and both are accepted as a replay:

* `409` with error code `BlobAlreadyExists` — the in-memory test store and other compatible backends use this shape.
* `412` with error code `ConditionNotMet` — the failed-precondition shape. `@azure/storage-blob` 12.33 (the pinned
  dependency) surfaces it as `RestError { statusCode: 412, code: "ConditionNotMet", details.errorCode: "ConditionNotMet" }`;
  this was verified by driving the real SDK client against a local endpoint that answered with Azure's error headers and
  XML body (`x-ms-error-code`), and the request it sent carried `If-None-Match: *` and no other condition.

This repository does not depend on which of the two a particular service version returns. Because `If-None-Match: *` is the
write's only precondition, `ConditionNotMet` on **this** write can only mean that the record exists. The mapping lives inside
`reserveSweepRequest()` and is not a general storage-error mapping (the shared `isConcurrencyConflict` helper is untouched
and not used here).

| Reservation write outcome | Result | HTTP |
|---|---|---|
| created | accepted → lease → engine | 200 / 409 `SWEEP_BUSY` |
| status `409` and code `BlobAlreadyExists` | `REPLAYED_REQUEST` | 409 |
| status `412` and code `ConditionNotMet` | `REPLAYED_REQUEST` | 409 |
| `412` with another code (e.g. `LeaseIdMissing`) or no code | `LEDGER_UNAVAILABLE` | 503 |
| `409` with another code or no code | `LEDGER_UNAVAILABLE` | 503 |
| right code with a wrong / missing status (e.g. `ConditionNotMet` + 400) | `LEDGER_UNAVAILABLE` | 503 |
| `statusCode` vs `response.status`, or `code` vs `details.errorCode`, disagree | `LEDGER_UNAVAILABLE` | 503 |
| 5xx, 403, network (`ECONNRESET`, `REQUEST_SEND_ERROR`), non-object / malformed error | `LEDGER_UNAVAILABLE` | 503 |

Status and code must both match one row exactly, and must agree everywhere the SDK reports them. Neither `REPLAYED_REQUEST`
nor `LEDGER_UNAVAILABLE` reaches the lease or the engine, so classification affects only the response code and telemetry;
the sweep runs **only** after a successful create.

**Lost-response retry.** The storage SDK retries a request when the transport fails. If a first Put Blob succeeded but its
response was lost, the retry finds the record and is classified as a replay. That request then answers 409
`REPLAYED_REQUEST` without running a sweep. This errs on the side of not executing; the scheduler exits 1 and the next
scheduled invocation, with a new id, runs normally.

## 5. TTL invariant

A request is acceptable only while `|now − timestamp| ≤ 300 s`. Its timestamp may be up to 300 s *before* its acceptance, so
the latest moment it can be re-presented is `acceptedAt + 2·300 s`.

```
REPLAY_SAFETY_MARGIN_MS = 1 h
REPLAY_RETENTION_MS     = 24 h      ≥ 2 · SWEEP_MAX_SKEW_SECONDS · 1000 + REPLAY_SAFETY_MARGIN_MS  (= 1 h 10 min)
expiresAt               = acceptedAt + REPLAY_RETENTION_MS
```

The invariant is asserted at module load (the module throws if it is ever violated) and by RP9. **A record's presence
always means "replay"** — expiry never re-admits an id; it only makes the record eligible for deletion, and by then the
signed timestamp is ~23 h stale and fails freshness anyway.

## 6. Bounds — cleanup

`pruneReplayLedger()` runs once after each accepted sweep:

| Bound | Value |
|---|---|
| listing pages per call | 1 |
| names per page / records read per call | ≤ `maxScanned` = 25 |
| ETag-conditional deletes per call | ≤ `maxDeleted` = 10 |
| cursor | `platform/system/coding-sweep-replay-cursor.json` (continuation token ≤ 4 KB, printable; an invalid token restarts from the beginning) |

Only names matching the exact record pattern are considered; malformed or unexpired records are kept; a record changed
between read and delete is skipped (If-Match). Every cleanup error is swallowed: **cleanup can never allow a replay**,
because reservation never consults cleanup state. At the 10-minute schedule the ledger holds ~144 live records per day, far
below one call's 10-deletion capacity × 144 runs (RP10 drains 300 expired records over repeated calls).

## 7. Telemetry (aggregate, no identifiers)

| Event | Fields |
|---|---|
| `coding.autoGrade.sweepReplay.accepted` | none |
| `coding.autoGrade.sweepReplay.rejected` | `{ reason: "replayed" }` |
| `coding.autoGrade.sweepReplay.storageError` | none (the storage error text is not logged) |

## 8. Lease interaction

The 17D-A sweep lease (`platform/system/coding-grading-sweep-lock.json`) is untouched and remains the serialization
mechanism. The ledger answers "has this signed request been accepted before?"; the lease answers "is a sweep running right
now?". A replay or a failed reservation is refused before the lease is touched (RP2 asserts the sweep does not re-run; RP11 asserts no lock blob is ever created), and all 17C / 17D-A authority rules
(one dispatch path, same revision, no grading outside the 17C applier) are unchanged.

## 9. Tests — `api/tests/coding-17d-b1-replay-protection.test.js`

| Test | Proves |
|---|---|
| RP1 | fresh signed request with an unseen id → 200, sweep runs exactly once, one ledger record |
| RP2 | exact replays → 409 `REPLAYED_REQUEST` ×3, sweep not re-run; a swapped id under the old signature → 401 (id is HMAC-bound) |
| RP3 | 3 concurrent identical requests → exactly one 200, two `REPLAYED_REQUEST`, one record |
| RP3b | Azure-shaped `412 ConditionNotMet` (`RestError`) on an existing reservation → 409 `REPLAYED_REQUEST` twice; no sweep; the lease blob is never accessed; `sweepReplay.rejected` emitted, no `storageError`; every reservation write's conditions are exactly `{ ifNoneMatch: "*" }` |
| RP3c | 4 concurrent identical requests against Azure 412 semantics → exactly one 200, three `REPLAYED_REQUEST`, no 503, one record |
| RP4 | bad signature → 401 with zero storage access |
| RP5 | stale (±301 s, far past) → 401 with zero storage access |
| RP6 | distinct ids with identical body are independent sweeps |
| RP6b | scheduler: 50 unique fresh ids matching the format; `REPLAYED_REQUEST` → exit 1; the id is never logged |
| RP7 | short / long / whitespace / bad chars / traversal / non-ASCII / newline / missing id → 401, zero storage; ledger name is a hex digest |
| RP8 | a re-required handler (restart) over the same storage still refuses the replay |
| RP9 | retention invariant; record never pruned before `expiresAt`; replay inside window → 409, later → 401; expired records are pruned, unexpired kept |
| RP10 | 300 expired records: one call lists ≤ 25, reads ≤ 25, deletes ≤ 10; repeated calls drain the ledger via the cursor |
| RP11 | ledger upload 500, `412 LeaseIdMissing`, 412 without code, or `ECONNRESET` → 503 `SWEEP_UNAVAILABLE`, sweep never runs, no lock, no error text in logs |
| RP11b | the §4.1 decision matrix: 5 replay shapes and 17 fail-closed shapes, each checked on `reserveSweepRequest()` directly and through the handler (status, body, telemetry, no run, no lock, no record, no error text) |
| RP12 | replay response is `{ ok, code }` with `no-store`; record has exactly the six metadata fields; nothing leaks into responses, logs or the record |

**Fail-first on `6a50f54`:** 10 failed, 3 passed (RP4, RP5 and RP6b already held in 17D-A: no storage before auth, and the
signer already used a fresh 27-character id). The failures were: replay `expected 200 to be 409`; `"short_id_1234": expected
200 to be 401`; `500: expected 200 to be 503`; empty ledger arrays; `Cannot find module …/sweep-replay-ledger.js`.

**Review fix 1 fail-first on `77f6839`** (unchanged source): RP3b `expected 503 to be 409`; RP3c `expected [] to have a
length of 3 but got +0`; RP11b `azure 412 ConditionNotMet: expected { ok: false, code: 'LEDGER_UNAVAILABLE' } to deeply equal
{ ok: false, code: 'REPLAYED_REQUEST' }`. RP11's former `412 ConditionNotMet → 503` case encoded the defect; it was replaced by
`412 LeaseIdMissing`, a 412 without a code and a network error, which keeps RP11's 412 fail-closed coverage.

The 17D-A sweep suite's fixed short ids (`sw_parity0001`, `gh_proof00001`, the 15-character random default) were lengthened
to satisfy the new minimum; no assertion changed.

## 10. Mutations

Harness: back up the file, apply one anchored replacement, run the named test, restore byte-for-byte (asserted), and compare a
fingerprint of `git status` + `git diff` + every untracked file's SHA-256 before and after the campaign.

| # | Mutation | Killed by |
|---|---|---|
| RPM1 | skip the reservation (`reservation = { ok: true }`) | RP2 |
| RPM2 | conditional create → unconditional overwrite (`uploadJson`) | RP3 |
| RPM3 | treat `BlobAlreadyExists` as accepted | RP2 |
| RPM4 | reserve the raw header id **before** signature verification | RP4 |
| RPM5 | reserve on a stale-timestamp failure | RP5 |
| RPM6 | relax the request-id format to `/^[^\s]{8,128}$/` | RP7 |
| RPM7 | short retention (`expiresAt = accepted + 5 min`) | RP9 |
| RPM8 | run the sweep when the ledger is unavailable | RP11 |
| RPM9 | drop the request id from the canonical string | RP2 |
| RPM10a | unbounded listing page (`maxPageSize: 5000`) | RP10 |
| RPM10b | ignore `maxDeleted` | RP10 |
| RPM11 | store the raw request id in the record | RP12 |
| RPM12 | remove the `412 ConditionNotMet` replay classification | RP3b (`expected 503 to be 409`) |
| RPM13 | over-broad: every 412 is a replay | RP11b (`412 LeaseIdMissing` → `REPLAYED_REQUEST`) |
| RPM14 | match the error code only, ignore the status | RP11b (`ConditionNotMet` without a status → `REPLAYED_REQUEST`) |
| RPM15 | drop the status / code consistency check | RP11b (`412 code/details disagree` → `REPLAYED_REQUEST`) |

16 / 16 killed (RPM1–RPM11 re-run after review fix 1); fingerprint before = after. RPM11 initially survived, and RP12 was
strengthened to pin the record's exact key set and scan it for leaks. During review fix 1 a further candidate (drop the "status and
code present" guard) survived because it was equivalent: a missing status or code can never equal a matrix row. The redundant
guard was removed from the code instead of being kept as dead logic.

## 11. Production migration note

* No new configuration, secret or variable. The sweep key and URL from 17D-A are reused.
* The only externally visible change is the request-id minimum (8 → 20). The repository signer already produced 27-character
  ids and now produces 35; no other signer exists (17D-A production activation is still configuration-blocked).
* Expect one `coding-sweep-replay/*.json` blob per accepted sweep (~144/day at the 10-minute schedule), each pruned within a
  day of expiry.

---

# Phase 17D-B2 — Durable Runner Delivery & Crash Recovery

> Status: implemented on `feature/17d-b2-durable-runner-delivery` (baseline `main` = `a6e26ac`, the PR #237 merge). Awaiting
> independent reliability / crash-recovery review. Scope: durable delivery and crash recovery of OFFICIAL coding grading jobs
> only — no evidence-retention redesign (17D-B3), no admin / teacher UI, no Redis / SQL / Service Bus / general queue.

The grading authority is unchanged: **`attempt.codingGrading.targets`** in the committed attempt. The runner remembers
*delivery and execution* state only; it never decides a grade, never creates or changes a revision and never writes an
official result.

## B2.1 Audit (written before implementation, baseline `a6e26ac`)

| Question | Answer on `a6e26ac` |
|---|---|
| where is `jobId` created? | `officialJobId()` (`official-grading.js`) — `cg_` + SHA-256 of (assignment, student, attempt number, submittedAt, target, **revision**): deterministic, and it binds the revision |
| where is the revision created? | at plan time (1) and ONLY by `regradeTarget(action: "force")` (revision + 1) |
| where does retry state live? | `target.recovery` in the attempt (17D-A recovery engine) — API side only |
| where do callback attempts live? | in the runner's RAM (`callback.js` loop variables) |
| what survives an API restart? | everything (attempt, job record, recovery cursor, sweep lease, replay ledger — Azure Blob) |
| what survives a runner restart? | **nothing** — accepted jobs, the queue, executed-but-unconfirmed results and the callback retry loop were RAM-only |
| where are duplicates handled? | runner RAM dedupe by (jobId, payload hash); API: one application per (job, revision, grading key) |
| concurrent dispatch? | **no per-job lease**: post-commit hook, teacher retry, bulk retry and the sweep could each send the same job |

Crash windows: (W2) accepted but not started → lost until the 30-min stale window; (W3) during execution → lost; (W4)
executed but not called back → the result was lost and **student code was executed again** after the stale window;
(W5) callback outage longer than ~1 min of in-process backoff → result lost on restart; (W6) concurrent dispatchers → duplicate
requests; (W7) no revision ordering on the runner.

### Deployment-model audit and durability boundary

The gateway is **not containerised**: it is a Node host service on a **dedicated Linux VM with Docker Engine**, bound to
127.0.0.1 behind a TLS proxy (`docs/enterprise-coding-assessment-17b.md` §18), spawning disposable sandbox containers. It is
not deployed yet (17D-A activation is configuration-blocked); the repository has no IaC for it.

| Event (Azure Linux VM) | OS disk / managed data disk | temp (resource) disk, tmpfs |
|---|---|---|
| gateway process crash / restart | survives | survives (process) / survives |
| service restart, host reboot, VM stop-start | survives | **lost** (resource disk on deallocate; tmpfs always) |
| Azure redeploy (host move), live migration | survives | **lost** |
| VM delete / reimage | **lost** (OS disk) / data disk survives if kept | lost |

Decision: a **file-per-job journal** in `RUNNER_JOURNAL_DIR` on the OS disk or a managed data disk — the smallest
platform-native durable store for this deployment (no new service). The gateway **refuses to enable official grading** when the
directory is missing, relative, or on an ephemeral filesystem: tmpfs, ramfs, overlay/aufs (a container's writable layer),
squashfs, or the Azure resource disk (`/dev/disk/azure/resource`). `RUNNER_JOURNAL_ALLOW_EPHEMERAL=1` exists only for local
development / tests and is reported as `ephemeral-override` in the startup event — durability is never claimed for it.

Beyond the boundary (journal disk destroyed) correctness still holds, with less efficiency: the API is the authority, the 17D-A
sweep re-dispatches the stale target, the runner executes it as a new job, the API applies at most one result.

## B2.2 Delivery semantics

**Durable at-least-once delivery + idempotent job identity + a single official grade authority.** Not "exactly once".

| Guarantee | Scope |
|---|---|
| official grade application | **at most once** per (job, revision, grading key) — `applyOfficialCallback` (17C), re-proved for the B2 lifecycle (CB4) |
| completed execution lifecycle | **at most one** per (jobId, payload hash, generation); an EXECUTED job is never executed again to rebuild a callback |
| physical execution count | 1 per generation, **plus bounded re-runs if the gateway process dies DURING execution** (`maxInterruptions` = 2, then a technical outcome `RUNNER_INTERRUPTED` — never a zero); a new generation (≤ `maxGenerations` = 3) only when SmartAssess confirmed a technical outcome as `retryable` and delivers the same job again |
| delivery API → runner | at-least-once (dispatch retried by the 17D-A recovery policy); one active delivery per job (lease) |
| callback runner → API | at-least-once (durable, bounded retry); duplicates are answered `alreadyApplied` |

## B2.3 Runner journal (`runner/gateway/journal.js`)

```
RUNNER_JOURNAL_DIR/            0700, owned by the gateway user, one gateway process (journal.lock: pid + boot id + token, §B2.13)
  jobs/<jobId>.json            0600  lifecycle record (below) — identifiers, hashes, states, timestamps, counters
  inputs/<jobId>.json          0600  validated job (source + hidden-test stdin) — ONLY until the result is durable
  results/<jobId>.json         0600  raw-evidence callback body — ONLY until SmartAssess confirms (or the record is pruned)
  targets/<targetRef>.json     0600  highest revision seen per opaque target reference
  quarantine/                  0700  corrupt records, moved (never silently deleted)
```

Every write is atomic: temp file (`wx`, 0600) → `fsync` → `rename` → `fsync` of the directory. A record holds:
`schemaVersion, jobId, payloadHash, revision, targetRef, language, state, generation, interruptions, receivedAt, startedAt,
executedAt, updatedAt, outcome, technicalCode, resultHash, summary (case counts by status only), callback { attempts,
windowEnd, rearms, nextAt, lastAt, lastStatus, lastErrorClass, confirmedAt, confirmedAs }`. Never source, stdin, output,
keys, signatures or raw headers. The result file is bound to the record by `resultHash`; a mismatch is corruption.

### State machine

| From | Event | To | Durable effect |
|---|---|---|---|
| — | signed delivery, new (jobId, hash), admitted | `received` | input + target index + record written **before the 202** |
| `received` | worker picks it; newer revision of the target known | `superseded` | input deleted; never executed, never called back |
| `received` | worker picks it | `running` | `startedAt` written **before the sandbox starts** |
| `running` | suite finished (any outcome) | `executed` | result written, record (`resultHash`), input deleted, callback due now |
| `running` | gateway process died (found at startup) | `received` (interruptions + 1) | re-run; after `maxInterruptions`: `executed` with outcome `failed / RUNNER_INTERRUPTED` |
| `executed` | callback attempt reserved | `executed` | `attempts + 1`, `nextAt = now + backoff` written **before sending** |
| `executed` | 2xx `applied`/`alreadyApplied` | `confirmed` (`confirmedAs` complete / retryable) | result deleted after the commit |
| `executed` | retryable failure, window left | `executed` | `lastStatus`, `lastErrorClass` (schedule already reserved) |
| `executed` | permanent failure, or window exhausted | `callback_failed` | parked; result kept |
| `executed` / `callback_failed` | same job delivered again | `executed` | callback due now / re-armed (≤ `maxRearms`) — never re-executed |
| `confirmed` (`retryable`) | same job delivered again | `received` (generation + 1) | input re-written; bounded by `maxGenerations` |
| `confirmed`, `superseded`, `callback_failed` | retention elapsed | removed | bounded pruning |

The spec's names map as: RECEIVED = `received`; RUNNING = `running`; EXECUTED / CALLBACK_PENDING = `executed` (execution completed
and its result durable — the crash window the journal exists for); CALLBACK_CONFIRMED = `confirmed`; TERMINAL = `confirmed`,
`superseded`, or a parked `callback_failed`.

### Idempotent receive

| Existing record for the jobId | Answer | Effect |
|---|---|---|
| none | 202 `accepted` | journaled, queued |
| different payload hash (body or revision differs) | 409 `JOB_ID_CONFLICT` | none — a reused id never runs other code |
| `received` / `running` | 202 `duplicate` | none — one execution |
| `executed` | 202 `duplicate` | callback retried now (if not already in flight) |
| `callback_failed` | 202 `duplicate` | callback re-armed (bounded) |
| `confirmed` complete | 202 `duplicate` | none |
| `confirmed` retryable | 202 `duplicate` | new generation (bounded) |
| `superseded` | 409 `STALE_REVISION` | none |
| none, but the target index has a newer revision | 409 `STALE_REVISION` | none |

### Restart recovery (bounded)

At startup: lock → **bounded** scan of `jobs/` (≤ `startupScanMax` entries; beyond → `truncated`, new admissions refused) →
quarantine corrupt entries → `received` re-queued, `running` interrupted, `executed` result verified and callback scheduled at its
persisted `nextAt`, terminal records left alone (leftover inputs / results of a crash between two steps released) → bounded
orphan cleanup, **only when the scan was complete** (a truncated scan skips it, §B2.13) → serve. Leftover sandbox containers of the dead process are removed by the existing startup sweep.

### Callback retry

One signed attempt per call (`callback.js attempt()`), classified: 2xx → confirmed (`state: "retryable"` in SmartAssess's
answer → `confirmedAs: retryable`); network / timeout / 5xx / 408 / 429 → retryable; any other 4xx, or a local protocol error →
permanent. Backoff `2 s · 2^(k−1)` capped at 10 min, 8 attempts per window, ≤ 8 re-arms (only by a fresh delivery from
SmartAssess), so at most 8 + 8 × 8 = 72 attempts per generation. The attempt is reserved durably before it is sent: a crash never
resets or under-counts it (at worst one reserved attempt is never sent).

## B2.4 API delivery lease (`api/src/lib/coding/official-grading.js`)

Every send is preceded by a CLAIM on the server-only job record `platform/coding-grading-jobs/<jobId>.json` (ETag CAS):

```
delivery: { state: "delivering" | "received" | "failed", attempt, leaseOwner, leaseExpiresAt, claimedAt,
            lastDeliveryAt, lastDeliveryCode, lastDeliveryErrorClass }
```

- a claim is refused while another dispatcher holds an unexpired lease (`coding.runner.delivery.duplicate`), or when the job is
  `complete` / `superseded` / of another revision; contention on the ETag re-reads (≤ 4 tries);
- lease TTL 30 s (> the 8 s dispatch timeout); an expiry claimed more than 2 min ahead is ignored — a crashed dispatcher
  delays the job by seconds, never strands it;
- the lease is released with the outcome (`ACCEPTED` / `DUPLICATE` / the technical code, and an error class: network, busy,
  unavailable, auth, conflict, config, protocol); release failure is harmless (expiry);
- no delivery field is written to the attempt; nothing of it reaches a student; no source, tests, keys or signatures.

`attempt` counts deliveries per job; the number of automatic deliveries stays bounded by the 17D-A recovery policy (8 per
manual reset). Each revision has its own job record, so its delivery lifecycle is isolated (DD6).

## B2.5 Revision authority

`jobId` already binds the revision. The signed runner request now also carries `revision` and an opaque `targetRef`
(`tr_` + SHA-256 of the target identity, 40 hex): the runner refuses an older revision of a target after a newer one
(`STALE_REVISION`) and supersedes a queued older one; same jobId with another revision is `JOB_ID_CONFLICT`. The API still decides
authority on every callback (stale revision / job / grading key → `409 STALE_RESULT`). Only `regradeTarget(force)` creates a
revision; recovery and retries stay on the same revision and job id.

## B2.6 Failure matrix

| # | Crash / fault | Behaviour | Test |
|---|---|---|---|
| CR1 | runner never accepts (down, 503, refused) | target stays `retryable`; lease released (`failed`, error class); next delivery succeeds | CR1 (API), CR1r (runner: unjournaled → 503) |
| CR2 | accepted, not started | re-run once after restart, one callback | CR2, RR1, D2 |
| CR3 | during execution | interrupted → re-run (bounded); then `RUNNER_INTERRUPTED`; one callback | CR3, RR1, D2 |
| CR4 | executed, callback not delivered | durable result called back after restart, **no re-execution**, same bytes | CR4, RR2, D1 |
| CR5 | callback applied, response lost | retried → `alreadyApplied` → confirmed; applied once | CR5, RR3, CB4 |
| CR6 | duplicate while running | one execution | CR6 |
| CR7 | duplicate after execution | no re-execution; immediate callback retry | CR7 |
| CR8 | duplicate after confirmation | acknowledged, nothing runs or is sent (also after restart) | CR8 |
| CR9 | older revision after newer | refused / superseded, durable across restarts | CR9, DD5 |
| CR10 | restart during callback backoff | attempts and `nextAt` preserved; window bounded | CR10, CB3 |
| — | corrupt record / tampered result | quarantined; never executed or called back | JC1, JC2 |
| — | disk cannot write at receive | 503 `RUNNER_BUSY`, nothing runs | CR1r, J2 |

## B2.7 Bounds

| Bound | Value |
|---|---|
| journal records (admission refused beyond) | 1024 |
| startup / maintenance scan | ≤ 2048 directory entries per walk |
| live jobs (received + running) | `RUNNER_OFFICIAL_MAX_PENDING` (1..64, default 8) |
| quarantine | ≤ 256 files |
| retention | confirmed 24 h; `callback_failed` / superseded / target index 7 days; ≤ 64 removals per pass (every 60 s) |
| record / input / result size | 64 KB / 3 MB / 8 MB |
| callback | 8 attempts per window, backoff 2 s → 10 min cap, ≤ 8 re-arms, concurrency 2 |
| execution | ≤ 2 interruption re-runs, ≤ 3 generations, existing job hard wall (≤ 20 min) |
| API delivery lease | 30 s TTL, ignored beyond 2 min ahead, ≤ 4 CAS tries per claim |
| diagnostic text | telemetry carries ids, states, counts, status codes, error classes only (bounded lines) |

## B2.8 Telemetry

API: `coding.runner.delivery.claimed`, `coding.runner.delivery.duplicate`, `coding.runner.delivery.release.failed`.
Runner: `coding.runner.delivery.duplicate`, `coding.runner.delivery.stale`, `coding.runner.execution.started | resumed |
interrupted | superseded | regenerated`, `coding.runner.callback.retry | confirmed | failed | rearmed`,
`coding.runner.journal.corrupt | truncated | orphans | orphans-skipped | write-failed | recovered`; the gateway start event
reports `recovery.staleLock` (`previous-boot | dead-pid | own-pid | malformed | null`). Identifiers are the opaque job id only; never
source, hidden tests, output, keys or signed payloads (LK1). `queue.status()` exposes aggregate counts for operations; there is
no new route and no UI.

## B2.9 Backward compatibility and migration

- **Deploy the runner first.** It accepts both the 17C request shape and the new one (`revision` + `targetRef` together or
  not at all). An API with B2 against a 17C runner gets `400` (extra keys) → `retryable EXECUTION_FAILED` → recovered once the
  runner is upgraded.
- No migration: job records without `delivery` are initialised lazily on the next claim; pending / retryable / exhausted
  targets keep their 17D-A recovery metadata; complete targets are never touched; a runner restarting with an empty journal
  simply receives re-dispatches (17D-A stale window).
- 17C behaviour change: a duplicate delivery of a job whose callback SmartAssess already **confirmed** is acknowledged without
  re-sending the result (the 17C RAM cache re-sent it); an unconfirmed result is retried from the journal instead.

## B2.10 Production configuration (runner VM)

1. Create a directory on the OS disk or a managed data disk, e.g. `/var/lib/smartassess-runner/journal`, owned by the gateway
   service user (`0700`). Never `/tmp`, `/run`, `/dev/shm`, `/mnt`/`/mnt/resource` (Azure temp disk) or a container layer.
2. Set `RUNNER_JOURNAL_DIR` in the gateway service environment (secrets stay in the existing secret settings — the journal
   holds none). Do not set `RUNNER_JOURNAL_ALLOW_EPHEMERAL` in production.
3. Restart the gateway; the `runner.gateway.started` event must show `officialGrading.journal: "durable"` and
   `officialGrading.enabled: true`. One gateway process per journal directory.
4. Back-up is not required (the API is the authority); the disk only needs to survive restarts and redeploys.

## B2.11 Tests

| Suite | Tests | Covers |
|---|---|---|
| `api/tests/coding-17d-b2-delivery.test.js` | 9 | DD1 durable claim before send, bounded expiry · DD2 4 concurrent dispatchers → 1 runner request · DD3 crashed dispatcher's lease blocks only until expiry; a far-future lease is ignored · DD4 same job / revision idempotent, attempts counted · DD5 older revision never delivered after force regrade, late result refused, signed revision ordering · DD6 newer revision's delivery isolated from a stuck older lease · DD7 no source / tests / expected outputs / keys / signatures in job record, delivery state, attempt or logs; opaque `targetRef` · CR1 runner down / busy → recoverable, lease released · CB4 the same callback re-sent 3× applies once; after force regrade it is refused |
| `runner/tests/unit/crash-recovery.rtest.js` | 13 | CR1r (unjournaled → 503, nothing runs), CR2–CR10 (in-process restarts over the same journal), **RR1–RR3 real gateway processes (production `startGateway()`) killed with SIGKILL** before execution / after execution with a failing callback / after an applied callback whose response was lost |
| `runner/tests/unit/durable-delivery.rtest.js` | 13 | JK1 fail-closed configuration (tmpfs, overlay, Azure resource disk, override) · J1 durable-before-202, 0600 / 0700, idempotent receive · J2 HTTP mapping incl. `409 STALE_REVISION`, `503` on journal failure · CB1 retryable failures back off (capped) · CB1b single classified attempt · CB2 permanent failure parks, bounded re-arms · CB3 retry state survives restart · JC1 corrupt record quarantined · JC2 tampered result quarantined · BD1 bounded startup scan · BD2 bounded admission · BD3 bounded retention pruning · LK1 no leakage, inputs / results released |
| `runner/tests/docker-official/restart.rtest.js` | 2 | **D1 / D2: the real `gateway/main.js` + real Docker sandboxes, SIGKILL + restart**: callback from the journal without re-execution; waiting job run once, interrupted job re-run, containers of the dead process swept |

Updated (contract extensions, reviewed): 17C secrecy test pins the new exact request shape (`revision`, opaque `targetRef`);
17D-A R32 pins the classified dispatch result (`errorClass`); the 17B guard's gateway file list includes `journal.js` (still
scanned for exec primitives); the 17C runner F-tests run on a journaled queue (F2 now asserts that a CONFIRMED result is not
re-sent); RK4 requires a durable journal for official grading; the G8 Docker end-to-end runs a journaled queue.

**Fail-first on `a6e26ac` (unchanged source):** API 8 failed / 1 passed (CB4 already held — the callback idempotency of 17C,
re-proved for the B2 lifecycle; DD2 exposed 4 runner requests from 4 concurrent dispatchers); runner crash-recovery 13 / 13
failed (no `journal.js`; RR1–RR3: the production entry point had no restart recovery); runner durable-delivery 13 / 13 failed;
Docker D1 / D2 failed (`waitFor timed out` — no journal record was ever written, a restarted gateway had nothing to recover).

## B2.12 Mutations

Each mutation is applied by an anchored replacement, killed by the named test, restored byte-for-byte (asserted), with a
fingerprint of `git status` + `git diff` + every untracked file's SHA-256 identical before and after the campaign.

| # | Mutation | Killed by |
|---|---|---|
| DM1 | no durable record before the 202 | CR2 (the waiting job is lost across the restart) |
| DM2 | mark the callback confirmed when the attempt is reserved (before the ACK) | CR4 |
| DM3 | re-execute EXECUTED jobs after a restart (input kept, executed treated as interrupted) | CR4 |
| DM4 | ignore a duplicate of the same job / revision | CR6 (second execution) |
| DM5 | accept a stale older revision | CR9 |
| DM6 | remove the API delivery lease check | DD2 (4 runner requests) |
| DM7 | the API delivery lease never expires | DD3 (a crashed dispatcher strands the job) |
| DM8 | reset the callback attempt count on restart | CR10 (attempts exceed the window) |
| DM9 | drop result persistence (hash only) | CR4 |
| DM10 | retry a permanent callback failure | CB2 |
| DM11 | remove the startup scan bound | BD1 |
| DM12 | log the source and hidden-test cases | LK1 |

**12 / 12 killed.**

## B2.13 Production-readiness hardening (after the 17D-B2 merge)

Three findings of the independent review are fixed. Nothing else changes: the B2 state machine, its bounds, its telemetry
contract and the API authority are untouched.

### M1 — the journal lock survives an unclean reboot

`journal.lock` is on the persistent disk, so a host crash leaves it behind. It used to record only the gateway's PID, and after
a reboot Linux may give that PID to an unrelated live process: the new gateway then concluded that another gateway owned the
journal (`JOURNAL_LOCKED`) and the whole gateway stayed down until someone deleted the lock by hand.

The lock now also records the kernel boot identity: `{ pid, bootId, token, at }`, `bootId` from
`/proc/sys/kernel/random/boot_id`. On `open()`, an existing lock is judged as follows:

| Existing lock | Verdict |
|---|---|
| stored and current boot id both readable and **different** | stale (written before this boot) → replaced, whatever its PID |
| same boot id, PID of a **live** process other than this one | owned by another gateway → `JOURNAL_LOCKED` (unchanged) |
| same boot id, **dead** PID | stale → replaced (unchanged) |
| boot id **unavailable** (current unreadable, or stored missing / not a boot id) | the 17D-B2 PID rule: live → `JOURNAL_LOCKED`, dead → replaced |
| this process's own PID | this process's lock → replaced (unchanged 17D-B2 semantics) |
| malformed (unparseable, no integer PID) | `JOURNAL_LOCKED` while younger than 60 s (it may still be being written by a starting gateway); stale after that |

- An unreadable boot id is never taken to mean "stale". It only removes the boot check, never the live-PID check, so it
  cannot let two live gateways share a journal.
- A stale lock is removed only if it is still exactly the lock that was judged; if another starting gateway replaced it in
  between, the decision is taken again.
- The start event reports why a stale lock was replaced, as `recovery.staleLock` (`previous-boot | dead-pid | own-pid |
  malformed | null`). No PID or boot id is logged.
- A genuine reboot therefore never needs manual intervention. The production configuration
  (`RUNNER_JOURNAL_DIR=/data/smartassess-runner` on an ext4 managed data disk) is unaffected.

### m1 — a truncated startup scan never deletes what it did not see

The startup orphan cleanup removes inputs and results that no record references. After a **truncated** scan (more
directory entries than `startupScanMax`) the record set is incomplete, and the cleanup used to delete the inputs and results
of valid records that were simply not scanned — including the durable result of an EXECUTED-but-unconfirmed job, which was
then quarantined on the next complete scan.

The cleanup now runs only after a **complete** scan. A truncated scan skips it, logs
`coding.runner.journal.orphans-skipped { reason: "truncated" }` and stays fail-closed for new official admissions, exactly as
before. A complete scan still removes genuine orphans. The scan bound is unchanged.

### m2 — the new-generation path is covered

When SmartAssess confirms a technical outcome as **retryable**, the next delivery of the same job starts a new execution
generation, bounded by `EXECUTION_POLICY.maxGenerations` (3). The code was correct but untested (review mutation X3
survived). GEN1–GEN3 now prove that:

- the input is re-persisted;
- the generation increments and the job executes again with a fresh result (the generation-1 result is never re-used);
- callback counters stay cumulative and bounded;
- the revision and `targetRef` never change;
- no fourth generation starts, also after restarts;
- the generation counter survives a restart.

### Tests — `runner/tests/unit/production-readiness.rtest.js` (11)

| Test | Proves |
|---|---|
| LOCK1 | same boot + live foreign PID → `JOURNAL_LOCKED`, the lock is untouched |
| LOCK2 | same boot + dead PID → replaced; the new lock carries this process's PID and boot id |
| LOCK3 | a lock from a previous boot whose PID is now a **live unrelated process** → replaced (the regression case) |
| LOCK4 | a second gateway **process** on the same boot is refused; this process's own lock reopens; after close another process opens |
| LOCK5 | boot id unavailable (current unreadable, stored missing, stored not a boot id) → the PID rule; never a bypass |
| LOCK6 | malformed locks (empty, truncated JSON, string PID, array) → refused while fresh, untouched; replaced after the grace period; an old malformed lock is replaced at once |
| SCAN1 | 8 EXECUTED jobs + 120 foreign entries, `startupScanMax` 6 → `truncated`; every result survives; new jobs refused; a later complete scan calls back all 8 from their durable results, 0 quarantined, 0 re-executed |
| SCAN2 | a complete scan still removes orphan inputs / results and keeps the referenced result |
| GEN1 | retryable → same job delivered again → generation 2: input re-persisted, executed again (`gen-2` output), same revision / `targetRef`, cumulative callback counters |
| GEN2 | three retryable generations → a fourth delivery is a duplicate of the confirmed job, before and after a restart: 3 executions, 3 callbacks |
| GEN3 | generation 2 survives a restart → the next delivery runs generation 3 → after another restart no generation 4 |

**Fail-first on unchanged `c4d8268`:**

- **Failed:** LOCK2, LOCK3, LOCK5, LOCK6 (no boot id in the lock; a previous boot's lock held by a re-used live PID →
  `JOURNAL_LOCKED`; a fresh malformed lock was removed at once) and SCAN1 (the truncated scan deleted a result of an unscanned
  EXECUTED job).
- **Passed:** LOCK1, LOCK4, SCAN2 and GEN1–GEN3, which guard behaviour that already existed. The generation coverage gap is
  proven by mutation: review mutation X3 applied to the baseline fails GEN1, GEN2 and GEN3.

### Mutations

Each mutation is restored byte-for-byte; the `git status` + `git diff` + untracked-file fingerprint is identical before and
after the campaign. **6 / 6 killed.**

| # | Mutation | Killed by |
|---|---|---|
| PM1 | ignore the stored boot id (PID only) | LOCK3 |
| PM2 | treat every different boot id as locked | LOCK3 |
| PM3 | skip the live-PID check on the same boot | LOCK1 (also LOCK4, LOCK5) |
| PM4 | run the orphan cleanup even after a truncated scan | SCAN1 |
| PM5 | never start a new generation after a confirmed retryable outcome | GEN1 (also GEN2, GEN3) |
| PM6 | reset the generation to 1 on restart | GEN3 (also GEN2) |
