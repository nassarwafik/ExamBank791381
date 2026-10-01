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
