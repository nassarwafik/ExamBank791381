# Phase 17F-B3 — Atomic Official Admission & Deterministic Backpressure

Baseline `10b7e78507dc1d63d9ccf105d0a20dfa30a76b9a` (main after PR #248). Runner production code changed:
`runner/gateway/official.js` only. No Runner protocol, callback, HMAC, revision format, grading, sandbox or Docker change.
**Not deployed** to the live Azure Runner VM in this window (no systemd / environment / image / secret / Azure CLI change).
Section 11 documents Independent Review Fix 1 (the durable target revision authority); sections 12–13 document Independent
Review Fix 2 (the in-memory target map as a cache of the durable index, same-revision ambiguity, the pre-B3 migration contract);
section 14 documents Independent Review Fix 3 (corrupt-vs-missing index entries, delivery authority, superseding of competitors).
Review fixes 2 and 3 also change `runner/gateway/journal.js` (the bounded target listing reports truncation and corrupt
entries; `readTarget` is structured).

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
  blocked target?              → busy "target-inconsistent" | "target-authority-unavailable" | "target-authority-corrupt"
  target revision authority    → cache, then journal.readTarget on a miss (review fix 2) → stale / conflict
                                 ({ missing } → no authority; { corrupt } → busy "target-authority-corrupt" + blocked (review
                                 fix 3); an I/O error → busy "target-authority-unavailable" — never "no authority")
  LIVE ≥ maxPending?           → busy "max-pending"
  records ≥ maxRecords?        → maintain({ locked }), re-check → busy "journal-full"
  writeInput → writeRecord                                   (the commit point of "accepted"; a failure leaves NOTHING behind)
  stopped during the write?    → busy "stopped" (record durable, recovered at next start, nothing installed)
  advanceTarget (targets.set, then writeTarget)              (review fix 1: the index follows the durable record)
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

Documented order, the only one in the file: **ADMISSION → withJob(jobId) → journal**. `withAdmission` is taken at three sites
(`submit`, the periodic target pruning of `maintain()`, the target load + repair of `start()`), none of which holds a per-job
lock when it asks for ADMISSION. Every `withJob` holder — `runJob` (start / finalize), `sendCallback` (reserve / confirm),
`start()` (interrupted / quarantine), record pruning — never waits for the admission lock while holding its per-job lock, so no
cycle exists: a submit holding ADMISSION may wait for `withJob(X)` held by `runJob`, which finishes without ever needing
ADMISSION. `maintain({ locked })` called from inside `submit` runs inline (ADMISSION + withJob(locked) already held) and prunes
other ids through `withJob(other)`; those holders never wait on ADMISSION either. `pump()` → `runJob` → `withJob(jobId)`
queues behind the submit's own per-job lock and runs after it releases (unchanged). See §11.4 for the maintenance paths.

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
| target revision authority never regresses; same revision + other id → conflict; lower after higher → stale | `targets` read + the durable commit + `advanceTarget` in one section | ADM18–ADM20 |
| a failed admission never creates target authority; the index is advanced only after the durable commit | review fix 1, §11 | TAR1–TAR5 |
| every mutation of the index (admission, pruning, startup repair) runs under the admission authority | review fix 1, §11 | TAR6–TAR11 |
| a restart derives the authority from the records before anything executes | review fix 1, §11 | TAR12–TAR14 |
| truncated index refuses admissions fail-closed | unchanged, inside the section | ADM21 |

`maxPending` keeps its semantic set (`received`, `running`); `executed`, `confirmed`, `callback_failed`, `superseded` are
never counted. Retention (`maintain`) semantics are unchanged.

## 5. Observability

Event names relied on by B1 telemetry are unchanged: `runner.official.accepted`, `runner.official.busy`. Every busy now
carries a bounded fixed-enum `reason`: `max-pending` (with `pending`, and `stage: "regeneration"` for the retryable case),
`journal-full`, `journal-truncated`, `stopped`; review fix 2 adds `target-inconsistent` and `target-authority-unavailable`.
Review fix 1 adds `coding.runner.target.write-failed` / `.repaired` / `.inconsistent` (`jobId`, `revision`, `stage` — never the
opaque target reference) and `status().targetIndexLag`; review fix 2 adds `coding.runner.target.listing-truncated` (`scanned`,
`limit`), `coding.runner.target.blocked` (`revision`, `records`, `reason`), `status().targetIndexTruncated`,
`status().targetsBlocked`, `status().executionHeld` and the startup summary `targets: { repaired, inconsistent, blocked, held,
scanned, truncated }`. Nothing else is logged (no source, stdin, hidden data, keys, tokens, bodies, identities). B1 telemetry is
not implemented in this branch.

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

## 11. Independent Review Fix 1 — the durable target revision authority

Review 1 of PR #250 (head `8f8cfc2`) found two production correctness blockers and one startup gap in B3's handling of the
target index (`targets/<ref>.json` + the in-memory `targets` map: the highest revision admitted per opaque target reference).

### 11.1 RF1-A — phantom target authority (root cause)

`submit()` wrote the index (`writeTarget` + `targets.set`) BEFORE the durable accepted commit (`writeRecord`). When
`writeRecord` failed, the admission answered busy and removed its input, but the index — on disk and in memory — kept pointing
at a job that was never accepted. Every later delivery of that revision under another job id was refused with a false
`JOB_ID_CONFLICT`, and because the phantom was durable it survived a restart (TAR1 / TAR2 / TAR3 / TAR5 fail-first on `8f8cfc2`).

### 11.2 The protocol now — the record is the authority, the index follows it

```
writeInput → writeRecord (commit point, unchanged) → [stopped?] → advanceTarget: targets.set, then writeTarget → install
```

- A revision's authority is its durable record (`{ targetRef, revision, jobId }` inside it). The index is a derived, monotonic
  cache. It is advanced ONLY after the commit, so an admission that fails before or at the commit leaves nothing behind — no
  rollback exists because nothing was advanced (TAR1, TAR2, TAR5), and a restart cannot recover a phantom (TAR3).
- Crash windows (audit of every interleaving, all under the admission mutex):
  (1) after `writeInput`: an orphan input, removed by `removeOrphans` at the next start (unchanged);
  (2) after `writeRecord`, before `writeTarget`: a durable accepted record ABOVE its index entry — the next start derives
  the entry from the record BEFORE anything runs (§11.5, TAR12); the retried delivery is a duplicate (idempotent);
  (3) after `writeTarget`: consistent. No window can execute a revision under a regressed or missing authority, and no window
  creates authority for a revision that was never accepted.
- "accepted" is still answered only after `writeRecord` resolves (ADM23); the durable state it requires is the record.

### 11.3 A failed index write after the commit — explicit, never hidden

The one residual failure is `writeTarget` failing AFTER the record is durable. The admission is accepted (its record is the
authority and it is durable); memory is advanced first, so every later decision of this process is correct (same revision,
other id → conflict; lower → stale: TAR4); the lag is counted (`dirtyTargets` → `status().targetIndexLag`), logged
(`coding.runner.target.write-failed` with `jobId`, `revision`, `stage`), retried under the admission authority by every
maintenance pass (`coding.runner.target.repaired`, `stage: "maintenance"`), and re-derived from the record at the next start
(`stage: "startup"`). While an entry is lagging its records are never pruned (the index must hold the revision before the
record may go) and the entry itself is never pruned. There is no silent optimistic path (mutation M17 is killed by TAR4 / ADM15).
ADM15 (a `writeTarget` failure) therefore changed from "busy, nothing durable" to "accepted with an explicit, repaired lag".

### 11.4 RF1-B — target pruning under the admission authority, without re-entry

`maintain()` deleted index entries (`journal.deleteTarget` + `targets.delete`) outside any lock: a pass that had decided to
prune a stale rev 8 entry could delete the entry of rev 9 admitted meanwhile — on disk and in memory (TAR6–TAR9 fail-first).

Now `maintain()` is two phases. Record pruning (`pruneRecords`) runs under the per-job locks only, never holding ADMISSION
while waiting for one. Target pruning (`pruneTargets`: the durable retry of lagging entries, then the bounded deletes) runs
under `withAdmission`: the live references, the entries and every delete are read and performed under the same authority as
admissions, so an entry admitted meanwhile is simply seen (TAR6, TAR7, TAR10) — `targets.delete` additionally checks the
entry's identity as defence in depth. The path called from inside an admission transaction (`maintain({ locked })`, when
`records.size ≥ maxRecords`) runs both phases INLINE — it never re-enters `withAdmission` (ADMISSION → maintain → ADMISSION
would wait for itself; TAR11 bounds both paths running concurrently). No execution or callback work ever runs under the
authority; the target phase is at most pruneBatch small unlinks per minute.

### 11.5 RF1-C — startup consistency

`start()` loads the index and repairs it from the records under `withAdmission`, before any job is enqueued. Only
unambiguous states are touched: an entry is pruned legitimately only once it is older than `failedRetentionMs` and no LIVE /
executed job references it, so a LIVE / executed record, or any record younger than that window, proves that its revision
reached the authority — a missing or lower entry for such a record is the crash window of §11.2 and is re-derived
(`summary.targets.repaired`, TAR12, TAR14). An entry without a record is retained history and is never deleted (TAR13); a
record older than the window is left alone, its entry may have been pruned legitimately (TAR14); two records at one revision
(impossible under the protocol) are reported (`coding.runner.target.inconsistent`, `summary.targets.inconsistent`), never
"repaired" by guessing.

### 11.6 Tests and mutations

`runner/tests/unit/target-authority.rtest.js` — TAR1–TAR14 (fail-first on `8f8cfc2`: TAR1–TAR10, TAR12, TAR14 fail for the
defects above, TAR13 for the new startup summary; TAR11 pins the absence of a deadlock). Mutations M13 (index advanced before
the commit, no rollback), M14 (memory-only rollback), M15 (target pruning outside the authority), M16 (stale snapshot deleting
a newer entry), M17 (index write failure ignored), M18 (startup repair removed) are run by a scratch script that restores
`official.js` byte-for-byte; results in the PR.

## 12. Independent Review Fix 2 — the target map is a cache; same-revision ambiguity is never guessed

Review 2 of PR #250 (head `dcf45e3`) found two further target-authority blockers.

### 12.1 RF2-A — the bounded startup listing of the index was silently truncated

`journal.listTargets({ maxEntries })` returned an array and stopped at `maxEntries` without any signal, while `start()` loaded
the whole in-memory `targets` map from it. Index entries are retained `failedRetentionMs` (7 days); confirmed records only
`confirmedRetentionMs` (24 h). `targets/` can therefore legitimately hold more entries than `startupScanMax` (2048) while
`jobs/` holds fewer than `maxRecords` and the job scan reports `truncated: false`. An entry outside the listing was invisible to
`submit()` (`targets.get` only): an older revision was ACCEPTED, and a second job id of the same revision was ACCEPTED, although
the durable authority still existed on disk (TAR15 / TAR16 fail-first: `an older revision was accepted although its durable
authority exists`).

### 12.2 Cache-vs-durable authority model

- `targets` is a CACHE of the durable index, never the only authority. `loadTargetAuthority(ref)` (caller holds ADMISSION):
  cache hit → the entry; miss → `journal.readTarget(ref)`; a durable entry is installed in the cache and used; `null` means
  "no durable entry" only when the read SUCCEEDED. `submit()` makes every stale / conflict / advance decision from it; the
  startup repair reads through it as well (a repair must never overwrite a higher entry the warm cache did not reach).
- The durable read fails (I/O error) → that versioned submission fails closed: `busy` / `target-authority-unavailable`
  (503 `RUNNER_BUSY`), no record, no input, no index change, no execution; the next attempt is admitted when the read works
  (TAR19). An I/O error is never read as "target absent". A structurally invalid index file is not authority (the listing
  skips it too) — the records remain the authority and startup re-derives from them.
- The listing now returns `{ targets, scanned, truncated }` and counts directory entries like the job scan (TAR17). Startup
  exposes it (`summary.targets.scanned / truncated`, `status().targetIndexTruncated`, `coding.runner.target.listing-truncated`)
  and the queue stays usable: with a complete job scan every cache miss is resolved durably, so a truncated warm cache changes
  cost (one bounded read per first touch of a reference), never decisions (TAR18).
- Cost: one `stat` (ENOENT) per first admission of a reference unknown to the cache; a negative result is not cached, so a
  reference pruned by retention is re-read once per admission — bounded by the admission rate.

### 12.3 Retention after a truncated warm cache (operational limitation)

`pruneTargets` visits the cache only, so an entry the warm listing did not reach is pruned only after an admission touched it
(it is then in the cache) or after a later start whose listing reaches it (every pruned entry makes room in the bounded window,
so the listing converges over restarts). Such an entry is never invisible for CORRECTNESS (every decision reads through to disk)
and is never overwritten by a lower revision (`advanceTarget` runs only above the loaded authority). The limitation is purely
retention: a directory with more than `startupScanMax` retained entries is reclaimed over several restarts, not in one pass.
No unbounded directory read was introduced.

### 12.4 RF2-B — same-revision ambiguity at startup: revision groups, no scan-order winner

The RF1 repair kept the FIRST record of a (targetRef, revision) pair in `best` and, when the index was missing or lower,
repaired the index to it — a scan-order winner, contradicting the "never guessed" policy (TAR20 fail-first on `dcf45e3`:
`{ repaired: 1, inconsistent: 1 }`). The pre-B3 gateway did not serialise target authority, so a journal written by it can hold
same target / same revision / different job ids (ADM20 proved the race): B3 must consume such a journal safely.

Startup now reasons per target over the HIGHEST relevant revision as a GROUP of records (relevance as in §11.5):

| highest-revision group | durable entry at that revision | action |
|---|---|---|
| one job id | missing / lower | repaired to it (TAR23, TAR12) |
| one job id | that job | consistent |
| any | higher | newer history, untouched |
| several job ids | selects ONE of them | preserved — never replaced from scan order; the competitors are HELD (TAR21) |
| several job ids | missing / lower | NEVER guessed: the target is BLOCKED, its live records held (TAR20, TAR22, TAR25) |
| any | selects none of the records | BLOCKED (a pre-B3 phantom cannot be told from retained history) |
| any | the read fails | BLOCKED (`authority-unavailable`) |

A lower duplicate pair below a unique higher revision is ordinary history (TAR24): superseded by `runJob`, never executed.
Scan order is irrelevant by construction (TAR22 runs the natural and the reversed order against the same journals).

Blocked target (`blockedTargets`, fail closed): new versioned admissions → `busy` / `target-inconsistent` (never stale or
conflict from a guessed winner); the exact-id duplicate of a held record stays an idempotent `duplicate` (nothing executes);
the confirmed-retryable regeneration of a blocked target → busy; its index entry is never pruned. Held records
(`held`: the LIVE competitors) never enter the run queue (`enqueue` gate) and `runJob` refuses them and every record of a
blocked target — no competing RECEIVED / RUNNING pair of one revision ever executes, no academic result is invented. Both
sets are re-derived from disk at every start, so the state survives restarts (TAR25) and clears only when the durable state
changes: an operator removes or quarantines the competing record(s) or writes the authoritative index entry, after which the
next start repairs or selects as in the table. Counts: `summary.targets.{ blocked, held, inconsistent }`,
`status().targetsBlocked / executionHeld`; logs carry `jobId`, `revision`, `records`, `reason` — never the opaque reference.

## 13. Pre-B3 journal migration contract

- A journal written by the pre-B3 gateway may contain target races: two or more records of ONE target at ONE revision under
  different job ids, with an index entry pointing at any of them, at none of them, at a lower revision, or missing (the old
  gateway wrote the index BEFORE the record, so a failed admission could also leave an entry without a record).
- B3 startup preserves an existing durable index entry wherever it already selects an authority: an entry at the highest
  revision pointing at one of that revision's records stays the authority; the other same-revision records are held and never
  execute as current authority. A higher entry than any record is newer history and is kept.
- A unique higher durable record repairs a lagging (missing / lower) entry.
- The same highest revision under multiple job ids without such an entry is NEVER guessed: the target fails closed (busy for
  new revisions, held live records, visible counts) until operator / recovery action resolves it — remove or quarantine the
  competing record(s), or write the authoritative `targets/<ref>.json`, then restart. This state was possible before B3; it
  is not called impossible.
- Nothing else of the journal changes: record and index formats, retention, duplicates, callbacks and the protocol are the
  same, so a rollback to the previous gateway reads the same files.

### 13.1 Tests and mutations (review fix 2)

`target-authority.rtest.js` TAR15–TAR25 (fail-first on `dcf45e3`: TAR15–TAR22 and TAR25 for the defects, TAR23 / TAR24 on
the new startup summary shape). Mutations M19 (cache miss without the durable read), M20 (I/O error as missing authority),
M21 (silent listing truncation), M22 (scan-order winner on ambiguity), M23 (existing index overwritten by scan order), M24
(held records still scheduled) are run by a scratch script that restores `official.js` and `journal.js` byte-for-byte.

## 14. Independent Review Fix 3 — corrupt entries, delivery authority, superseding of competitors

### 14.1 RF3-A — a corrupt durable entry is never "missing"

`journal.readTarget` collapsed a missing file, an oversized / unreadable file, malformed JSON and an invalid shape (wrong
reference, invalid revision, invalid job id) into `null`, which `loadTargetAuthority` read as "no durable authority". Index
entries outlive confirmed records (7 days vs 24 h), so a corrupt entry can be the only surviving ordering evidence of a target:
rev 8 historically authoritative, record pruned, entry corrupt → a new rev 7 was ACCEPTED (TAR26 / TAR27 fail-first on `5cca0c2`:
`accepted under a corrupt / unreadable authority`).

Read contract now (structured like `readRecord`): `{ target }` | `{ missing: true }` | `{ corrupt: "name" | "size" | "json" |
"shape" }`; an I/O error throws. Policy per state for a versioned submission: MISSING → no retained authority (TAR28); VALID →
use it; CORRUPT → fail closed: `busy` / `target-authority-corrupt`, the reference is blocked (`authority-corrupt`), counted
(`status().targetIndexCorrupt`, `summary.targets.corrupt`) and logged with the reason only — no input, no record, no execution,
no index write, and the file is NEVER rewritten, quarantined or deleted (deletion would turn uncertainty into apparent absence;
TAR26 / TAR27 compare the bytes before and after); I/O ERROR → `busy` / `target-authority-unavailable`, transient (TAR29).
`listTargets` reports corrupt validly-named entries (`corrupt: [{ targetRef, reason }]`, TAR30) and startup blocks them before
anything runs; an entry outside the warm-cache window is detected the same way on the cache miss (TAR31). The reference is used
internally only and never logged. Recovery is operator action on the file, then a restart.

### 14.2 RF3-B — target authority guards delivery as well as execution

Held / blocked authority guarded `enqueue` and `runJob` only: an EXECUTED or CALLBACK_FAILED competitor (a pre-B3 record that
reached its result before the upgrade) could still send or re-arm a callback through `schedule()`, `sendCallback()` and the
duplicate paths (TAR32 / TAR33 / TAR34 / TAR35 fail-first). One canonical delivery authority now exists — `deliverable(rec)`:
not a record of a blocked target, not a held competitor; plain jobs always — and is applied by `runJob`, `schedule()`,
`sendCallback()` (reservation), `idle()` and the `executed` / `callback_failed` duplicate paths. For a BLOCKED target:
received / running → no execution; executed → the durable result is preserved, no callback is sent (TAR32); callback_failed →
never re-armed (TAR34); a fresh delivery of such a job → deterministic `busy` (`target-inconsistent` / the block reason,
`stage: "callback"`), nothing scheduled (TAR35). At-least-once delivery of authoritative records is unchanged (TAR33: B delivers;
every callback suite unchanged).

### 14.3 RF3-C — competitors of a selected authority are superseded, never LIVE forever

The competitor of a durably SELECTED authority (index rev 8 / B, records A and B at rev 8) was held `received` forever: it stayed
LIVE, counted against `maxPending`, could contribute to `journal-full` (TAR36 / TAR37 fail-first). Startup now supersedes such
competitors durably (`supersede`: commit `superseded`, release input / result under the existing rules; TAR33 for executed, TAR34
for callback_failed, TAR21 / TAR22 for received, in both scan orders). If that commit fails, the record is held (fail closed:
no execution, no delivery, counted in `executionHeld`) and superseded as soon as a higher authority advances the target
(`advanceTarget` releases every held record of that reference below the new revision — TAR36; TAR37 shows the slot freed under
`maxPending = 2`). Nothing is superseded for a BLOCKED target: without a trustworthy authority no record is chosen against
(TAR38, both records preserved across restarts).

### 14.4 Tests and mutations (review fix 3)

TAR26–TAR38 (fail-first on `5cca0c2`: TAR26, TAR27 ×4, TAR30, TAR31, TAR32, TAR33, TAR34, TAR35, TAR36, TAR37 for the defects;
TAR28 / TAR29 pin missing ≠ corrupt and the unchanged I/O policy; TAR38 the no-guessing rule). Mutations M25 (corrupt collapses
to missing), M26 (listing skips corrupt), M27 (delivery ignores the authority), M28 (callback_failed re-arm), M29 (competitor held
forever), M30 (no release on advance) are run by a scratch script that restores `official.js` and `journal.js` byte-for-byte.

## 15. Independent Review Fix 4 — the CURRENT target authority gates delivery, finalization, re-arm and regeneration

### 15.1 RF4-A — `deliverable` proved "not blocked, not held", never "still the current authority"

After RF3 `deliverable(rec)` rejected a record of a blocked target and a held competitor only. A record that WAS the authority of
its target and lost it later (a newer revision admitted, or another job selected for its revision) stayed deliverable: an EXECUTED
rev 7 whose callback was pending / retrying still sent its result after rev 8 became authoritative (TAR39 fail-first on `6da48c0`:
`a non-authoritative EXECUTED record was delivered`); a RUNNING rev 7 that finished after rev 8 was admitted was stored as a
deliverable EXECUTED by `finalize` and delivered (TAR40); a CALLBACK_FAILED rev 7 was re-armed by a redelivery (TAR41); a confirmed
RETRYABLE rev 7 was regenerated by a redelivery and executed a second time (TAR42); after a restart, a pre-RF4 journal holding an
EXECUTED rev 7 below a durable rev 8 entry delivered the rev 7 result before anything else (TAR43). `advanceTarget` superseded HELD
records of the reference only, so a LIVE / EXECUTED older revision was never retired at the advance.

### 15.2 The ONE authority predicate

`deliverable(rec)` now requires, for a versioned record, the cached authority entry of its target to name ITS revision AND ITS job
id: `t.revision === rec.revision && t.jobId === rec.jobId` — not a blocked target, not a held competitor, and a cache miss is
"no authority" (fail closed; plain jobs are always deliverable). The same predicate gates execution (`runJob`), post-sandbox
finalization (`finalize`), callback scheduling (`schedule`), reservation / delivery (`sendCallback`), `idle()` and the
`executed` / `callback_failed` duplicate paths. The cache is monotonic for a reference that has a LIVE or EXECUTED record (RF2:
set at admission, advanced under ADMISSION, pruned only when nothing of the reference is live), so the predicate is read without a
disk access on the hot paths and its answer can only change from "authoritative" to "obsolete", never back.

`obsolete(rec)` is the complementary, UNAMBIGUOUS statement: a KNOWN, trusted authority of the reference is a newer revision, or
the same revision with another selected job id. It is false for a blocked target (nothing is chosen against without a trustworthy
authority — RF3-C, TAR38 unchanged) and false for a cache miss (never guessed). A record that is neither deliverable nor obsolete
(held, blocked, no authority) stays exactly where RF3 left it: preserved, non-deliverable, fail-closed busy on redelivery.

### 15.3 Supersession of obsolete records — at the advance, at start, at finalize, at the redelivery, at startup

* **Advance** (`advanceTarget`, caller holds ADMISSION): every record of the reference in a SUPERSEDABLE state (`received`,
  `running`, `executed`, `callback_failed`) that is `obsolete` under the new entry is superseded durably (`supersede`: commit
  `superseded`, `callback.nextAt = null`, input and result released) — not only held ones. A RUNNING record is superseded while
  its sandbox still runs; its late result is never stored (below). A failed commit leaves the record NON-deliverable (the
  predicate requires the current authority) and it is retired by the next fence that touches it (TAR44 / TAR45 / TAR46).
* **Start** (`runJob`, under `withJob`): a RECEIVED record that became obsolete before its slot (the advance's commit failed, or
  the admission raced the scheduler) is superseded at start instead of executing or lingering LIVE — logged
  `coding.runner.execution.superseded` / `stage: "start"` (TAR40 second half, TAR46).
* **Finalize** (`finalize`, under `withJob`): only a record still RUNNING and still the authority becomes EXECUTED. A record
  superseded while the sandbox ran is left superseded (its input released); a RUNNING record that is obsolete at finalization
  is committed `superseded`, its result is never written, `executedAt` stays null — `stage: "finalize"` (TAR40, TAR45).
* **Redelivery** (`onDuplicate`, caller holds ADMISSION + this job's lock): for a versioned record of a non-blocked, non-held
  reference the authority is resolved (cache, else `loadTargetAuthority` — corrupt / I/O fail closed as `busy`,
  `stage: "duplicate"`); if the record is obsolete it is superseded durably (unless already `confirmed`: a decided result is
  history, never rewritten), removed from the execution queue, its input / result released, and the answer is `{ status: "stale" }`
  → HTTP 409 `STALE_REVISION` — never re-executed, rescheduled, re-armed (TAR41) or regenerated (TAR42). A versioned record
  with NO authority at all answers `busy` / `target-authority-unavailable`.
* **Startup** (`start()`, after the revision-group repair): every SUPERSEDABLE, non-held record that is obsolete under the
  repaired index is superseded before the scheduler or the callback loop starts (`summary.targets.superseded`); a failed commit
  holds it (fail closed) exactly as RF3-C (TAR43: an EXECUTED rev 7 and a CALLBACK_FAILED rev 6 below a durable rev 8 entry).

Lock order is unchanged (ADMISSION → withJob → journal): `deliverable` / `obsolete` read the in-memory cache only; the advance
and the startup pass take `withJob` per superseded record from inside ADMISSION (as RF3-C did for held records); the redelivery
already holds both; start / finalize hold `withJob` and never take ADMISSION.

### 15.4 Tests and mutations (review fix 4)

TAR39–TAR46 in `runner/tests/unit/target-authority.rtest.js` (fail-first on the reviewed head `6da48c0` with the final test
file: TAR39, TAR40, TAR41, TAR42, TAR43, TAR44, TAR45, TAR46 all fail; the whole suite passes on the fix). TAR44 / TAR45 / TAR46
inject ONE failing `writeRecord` for the superseding commit of rev 7 at the advance, so that the delivery fence, the finalize
fence and the start fence are each proven ALONE. Mutations (each alone, `official.js` restored byte-for-byte, sha256-verified,
against the TAR + ADM suites): M31 `deliverable` ignores the authority identity → TAR44; M32 the advance supersedes held records
only → TAR39, TAR40, TAR44; M33a `finalize` drops the obsolete fence → TAR45; M34 the redelivery skips the obsolete check → TAR42,
TAR44; M35 the startup obsolete pass removed → TAR43; M36 `runJob` drops the start fence → TAR46. M33b (`finalize` drops the
"still RUNNING" guard, keeping the obsolete fence) survives and is documented as equivalent in reachable states: a record leaves
RUNNING only through `supersede`, which requires `obsolete`, and the reference of a LIVE record is never evicted from the cache
nor blocked at runtime, so a superseded record reaching `finalize` is always `obsolete` and is re-committed `superseded` (a
no-op); the guard is kept as defence in depth, not as the proof.

### 15.5 Reconciliation with merged PR #251 (17F-C2)

PR #250 was reconciled with `origin/main` (`de0919b`, the merge of PR #251) by a normal merge commit — no rebase, no amend, no
force-push. The two changes touch disjoint files (B3: `runner/` and this document; C2: `api/`, `src/`, its own document), so the
Runner protocol seen by the C2 server is unchanged: the callback response and the Runner JOB record still say `complete`; the
`reviewRequired` target state, `compileErrorPolicy`, the coding@1 / coding@2 boundary and the legacy score-withhold bit are
server-side (C2) semantics that B3 neither reads nor rewrites.

## 16. Independent Review Fix 5 — the at-least-once fallback obeys the current authority

### 16.1 RF5-1 — the in-memory fallback of `runJob` delivered without asking who the authority is

`runJob` keeps the Phase 17D-B2 at-least-once rule: when `finalize` cannot make the sandbox result durable (a journal write fails),
the result is delivered ONCE from memory and the record stays RUNNING on disk, so the next start re-runs the job (bounded by
`maxInterruptions`) while the API applies at most one result. After review fix 4, `finalize` is also the fence that retires an
obsolete RUNNING record (its `superseded` commit). The two met in one reachable state: rev 7 RUNNING, rev 8 admitted, the
advance's `supersede` commit of rev 7 FAILS, the sandbox returns, `finalize` takes the obsolete branch and ITS `superseded` commit
fails too → the catch of `runJob` ran the fallback and delivered the rev 7 result — a job that had lost its authority delivered
(independent review probe P1, now TAR47 fail-first on `dfc6321`: `a NON-AUTHORITATIVE result was delivered from memory`, actual
1 attempt). The API refuses that callback (409 `STALE_RESULT`: the attempt's target names rev 8), so nothing was applied, but the
Runner contract of §15 ("never later deliver a result") must hold on the Runner alone.

### 16.2 The rule

The fallback obeys the SAME predicate as every other delivery. Inside the catch, under `withJob(jobId)` (the smallest existing
lock; never ADMISSION, never over the sandbox or the transport), the current in-memory record is re-read and the result is
delivered from memory ONLY if the record still exists, is still `running` and `deliverable(rec)` holds (plain jobs: always;
versioned jobs: the cached authority names this revision and this job, not blocked, not held, no cache miss). Otherwise nothing
is delivered: the existing `coding.runner.journal.write-failed / result` line is followed by `coding.runner.delivery.withheld`
`{ jobId, revision, stage: "fallback", reason }` with `reason ∈ { obsolete, not-authoritative, state-changed, record-missing }`
(fixed identifiers only — never the reference, never payload), and the record is left exactly as the failed writes left it:
RUNNING on disk. No new state, no success claimed, no bypass of recovery: the next start's review-fix-4 pass supersedes it under
the durable rev 8 entry (TAR47: `summary.targets.superseded` 1, `recovered.interrupted` 0, input released, redelivery `stale`, no
re-run, the single pending slot free), or — if it IS the authority — re-runs it as before. The window between this check and the
transport is the one already described for every delivery (OBS-5 below): the API's `STALE_RESULT` stays the final arbiter.

### 16.3 Tests and mutation (review fix 5)

TAR47 (fail-first on `dfc6321`, final test file against the unmodified `official.js`: ✖ actual 1 / expected 0 attempts): both
supersede fences fail (`injected` 2), zero rev 7 attempts, record RUNNING, `executedAt` null, no result file, `executed` 0,
withheld log with `reason: "obsolete"`, no reference logged, rev 8 confirmed with one attempt, then restart: superseded, no
re-run, redelivery stale, no held / LIVE / executed leftovers, a plain job is admitted into `maxPending = 1`. TAR48 pins the
PRESERVED contract: a result-write failure for an authoritative versioned job and for a plain job still delivers once from memory
(records RUNNING, two `write-failed / result` lines, no withheld line); TAR48 passes on `dfc6321` as well (a pin, not a defect).
Mutation M37 (the guard returns "deliverable" unconditionally) is killed by TAR47; `official.js` restored byte-for-byte
(sha256-verified). Lock order unchanged: ADMISSION → `withJob` → journal; the catch takes `withJob(jobId)` only.

### 16.4 Scope note — observations OBS-1 … OBS-5 of the independent review (not changed here)

* OBS-1 (minor): a `callback_failed` record of the CURRENT authority whose index entry was pruned (entry age ≥ `failedRetentionMs`,
  record younger) answers `busy` / `target-authority-unavailable` on redelivery until the record itself is pruned, then a fresh
  admission re-executes it. Fail closed by the §12 cache-miss rule; bounded by retention. Follow-up candidate.
* OBS-2 (minor): a held competitor (its startup supersede failed) answers `duplicate / received` on redelivery until a higher
  revision releases it (§14.3); held records of a BLOCKED target keep their pending slot until operator action — the documented
  fail-closed design (§14.1, §14.3).
* OBS-3 (info): a RUNNING record superseded by the advance keeps its sandbox slot until the run ends (bounded by the job wall).
* OBS-4 (info): `supersede` of an already `confirmed` competitor at startup commits nothing but is counted / logged as superseded.
* OBS-5 (info): a callback may be reserved between the durable write of the newer record and the cache advance of the same
  admission; such a delivery is answered `STALE_RESULT` by the API and the record ends superseded (review probe P2).
