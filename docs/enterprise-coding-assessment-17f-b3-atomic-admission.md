# Phase 17F-B3 — Atomic Official Admission & Deterministic Backpressure

Baseline `10b7e78507dc1d63d9ccf105d0a20dfa30a76b9a` (main after PR #248). Runner production code changed:
`runner/gateway/official.js` only. No Runner protocol, callback, HMAC, revision format, grading, sandbox or Docker change.
**Not deployed** to the live Azure Runner VM in this window (no systemd / environment / image / secret / Azure CLI change).

## 1. B10-F1 — root cause

The load / certification harness (PR #249, unmerged, not imported here) found that with `RUNNER_OFFICIAL_MAX_PENDING = 3`
eight **sequential** official submissions give 3 accepted + 5 `RUNNER_BUSY`, but eight **concurrent** submissions can give
**8 accepted**. Grading stayed correct; the configured capacity boundary was violated.

`submit()` serialised only ONE job id (`withJob(jobId)`). The shared admission state — the LIVE count (`received` +
`running`), `records.size` and the `targets` revision index — was read inside that per-job lock, then the async journal
writes ran (`writeInput`, `writeTarget`, `writeRecord`), and only then `records.set` installed the record:

```
submit(A) → withJob(A) → live = 0 < 3 ✓ → await writeInput/writeRecord …
submit(B) → withJob(B) → live = 0 < 3 ✓ → await …          (A is not installed yet)
submit(C…H) → same stale 0
records.set(A), records.set(B), … → 8 LIVE
```

Reproduced deterministically on the untouched baseline by gating `journal.writeRecord` until all eight submissions are in
flight (ADM1: `8 accepted, 0 busy`; ADM5: 7 records against `maxRecords = 3`; ADM25: 100 accepted against `maxPending = 10`).

A second, non-racy gap: the confirmed-**retryable** regeneration in `onDuplicate()` rewrote a `confirmed` record back to
`received` (a NON-LIVE record re-entering LIVE state) without any `maxPending` check at all (ADM8 failed on baseline).

## 2. Architecture — ONE admission authority

A queue-wide async admission mutex (`withAdmission`) now wraps the whole `submit()` transaction:

```
withAdmission(() => withJob(jobId, async () => {
  stopped?                     → busy "stopped"              (re-checked AFTER waiting for the lock)
  existing record?             → onDuplicate (idempotent; regeneration decides capacity here too)
  truncated index?             → busy "journal-truncated"
  target revision authority    → stale / conflict
  LIVE ≥ maxPending?           → busy "max-pending"
  records ≥ maxRecords?        → maintain, re-check → busy "journal-full"
  writeInput → writeTarget (+ targets.set) → writeRecord     (the commit point of "accepted")
  stopped during the write?    → busy "stopped" (record durable, recovered at next start, nothing installed)
  records.set → enqueue, pump() → { status: "accepted" }
}))
```

`withAdmission` is the same promise-chain pattern as `withJob` with a single key: `admissionChain = run.catch(() => {})`,
so a rejection inside the section releases it exactly like a return — a failed admission (any journal write, maintenance,
an internal callback) can never wedge later submissions. The section covers admission reads and durable admission writes
only; `pump()` / `schedule()` only start tracked asynchronous work, so the sandbox run, the callback delivery, the job wall
and lifecycle completion are never inside it. A reservation scheme was not chosen: the mutex is simpler to prove correct
under every failure path and the critical section is short (three small file writes).

## 3. Lock ordering (deadlock safety)

Documented order, the only one in the file: **ADMISSION → withJob(jobId) → journal**. `withAdmission` is taken at exactly one
site (`submit`). Every other `withJob` holder — `runJob` (start / finalize), `sendCallback` (reserve / confirm), `start()`
(interrupted / quarantine), `maintain()` (prune) — never waits for the admission lock, so no cycle exists: a submit holding
ADMISSION may wait for `withJob(X)` held by `runJob`, which finishes without ever needing ADMISSION. `maintain({ locked })`
called from inside `submit` prunes other ids through `withJob(other)`; those holders never wait on ADMISSION either.
`pump()` → `runJob` → `withJob(jobId)` queues behind the submit's own per-job lock and runs after it releases (unchanged).

## 4. Invariants

| Invariant | Mechanism | Tests |
|---|---|---|
| LIVE (`received` + `running`) ≤ maxPending for every arrival pattern | count + commit + install in one section | ADM1–ADM4 (HTTP), ADM25 |
| `records.size` ≤ maxRecords for newly admitted records (retention may legitimately free space first) | same section | ADM5 |
| one lifecycle per job id; duplicates consume no slot | `records.get` inside the section; `onDuplicate` unchanged for received / running / executed / confirmed-complete | ADM6, ADM22 |
| same id + conflicting payload → `JOB_ID_CONFLICT`, never two bodies | `payloadHash` authority unchanged, now race-safe | ADM7 |
| confirmed-retryable regeneration is a LIVE admission | `liveCount() ≥ maxPending` → busy; no generation++, no input rewrite, no `received`; the next redelivery regenerates exactly once | ADM8, ADM9 |
| `callback_failed → executed` re-arm is NOT a LIVE admission | unchanged; allowed at full `maxPending`, consumes no slot | ADM10 |
| maxActive stays separate | `pump()` untouched: `active ≤ maxActive` | ADM11 |
| the admission section never covers execution / delivery | execution held, delivery held → later admissions complete | ADM12, ADM24 |
| "accepted" only after the durable `writeRecord` | unchanged commit point, now inside the section | ADM23 |
| a failed admission consumes no slot, leaves no phantom, releases the authority | catch → cleanup → busy; chain continues | ADM13–ADM16 |
| stop(): waiters re-check `stopped` after acquiring the lock; nothing is installed or scheduled after stop | re-check at entry and after the write | ADM17 |
| target revision authority never regresses; same revision + other id → conflict; lower after higher → stale | `targets` read + `writeTarget` + `targets.set` in one section | ADM18–ADM20 |
| truncated index refuses admissions fail-closed | unchanged, inside the section | ADM21 |

`maxPending` keeps its semantic set (`received`, `running`); `executed`, `confirmed`, `callback_failed`, `superseded` are
never counted. Retention (`maintain`) semantics are unchanged.

## 5. Observability

Event names relied on by B1 telemetry are unchanged: `runner.official.accepted`, `runner.official.busy`. Every busy now
carries a bounded fixed-enum `reason`: `max-pending` (with `pending`, and `stage: "regeneration"` for the retryable case),
`journal-full`, `journal-truncated`, `stopped`. Nothing else is logged (no source, stdin, hidden data, keys, tokens, bodies,
identities). B1 telemetry is not implemented in this branch.

## 6. HTTP contract (unchanged)

`accepted` → 202 · `duplicate` → 202 duplicate · `busy` → 503 `RUNNER_BUSY` · `conflict` → 409 `JOB_ID_CONFLICT` · `stale` →
409 `STALE_REVISION`. No new public API code; capacity internals are not exposed to callers.

## 7. Performance

The serialised section is three small journal writes. ADM25 (100 concurrent distinct submissions, `maxPending = 10`, random
0–2 ms extra write latency, temp-dir journal): **46 ms** total, 10 accepted, 90 busy, no deadlock, no over-admission, no
unhandled rejection. This is a local micro-test, not VM capacity qualification — the B10 harness stays the capacity authority.

## 8. Tests and mutations

`runner/tests/unit/atomic-admission.rtest.js` — ADM1–ADM25 (fail-first on the baseline: ADM1, 2, 3, 4, 5, 8, 9, 17, 18, 20,
25 failed; 14 pre-existing behaviours passed and are kept as regressions). Runner unit suite: 179 / 179 (154 + 25), none
skipped. Mutations M1–M12 (shared serialization removed, lock released before commit, off-by-one capacity, racy maxRecords,
regeneration bypass, phantom reservation on failed write, duplicate consumes a slot, stop not re-checked, target regression,
lock held across execution, accepted before the durable write, rejection wedges the chain) are run by a scratch script that
restores `official.js` byte-for-byte; results in the PR.

## 9. Expected B10 CERT-E handoff

When PR #249 reconciles on top of B3, CERT-E `Q-ADMISSION` (maxPending 3, 8 concurrent → 3 accepted / 5 busy) is expected to
turn from FAIL to PASS **without modifying its acceptance rule**: this branch's ADM1 / ADM4 are the same scenario at the queue
and HTTP level.

## 10. Deployment / rollback

Deployment: a Runner code release (gateway restart) after merge and independent review, through the controlled procedure to
be decided separately; no configuration change is required (`RUNNER_OFFICIAL_MAX_PENDING` / `MAX_ACTIVE` keep their meaning).
Rollback: revert the commit; the journal format, records and protocol are unchanged, so an older gateway reads the same
journal.
