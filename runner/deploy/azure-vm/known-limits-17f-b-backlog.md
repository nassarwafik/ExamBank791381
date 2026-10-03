# Known Limits of the Pilot and the Phase 17F-B Backlog

None of these is fixed in 17F-A1: Runner semantics are deliberately untouched. None of them can turn a technical problem into
a student zero, **except** L7 / L8, which the pilot authoring policy and the preflight vCPU guardrail mitigate.

## Known limits (pilot operations must know these)
| # | Limit (code fact) | Pilot effect | Pilot mitigation |
|---|---|---|---|
| L1 | Official queue `RUNNER_OFFICIAL_MAX_PENDING` ≤ 64 (`main.js` clamp) | jobs beyond it → `503 RUNNER_BUSY` → `retryable` | ≤ 64 official jobs per burst; recovery / bulk retry for overflow |
| L2 | Recovery sweep ≤ 12 dispatches, ≤ 200 submissions scanned (`grading-recovery.js SWEEP_LIMITS`) | overflow drains slowly | teacher bulk retry (12 per call) |
| L3 | Journal ≤ 1,024 records (`journal.js JOURNAL_LIMITS.maxRecords`) | admissions refused (`RUNNER_BUSY`) when full | ≈ 1,000 official jobs per rolling day; `journal-status.js` capacity alert at 80 % |
| L4 | Confirmed records retained 24 h, parked / superseded 7 days | the slot is held for that long | as L3 |
| L5 | Official runtime slots hard-coded to 2 (`sandbox.js officialMaxContainers`); compile containers outside them; `CASE_CONCURRENCY` > 2 has no effect | throughput only | preflight capacity check counts compile containers |
| **L6** | **Re-arm (≤ 8) / generation (≤ 3) exhausted → the Runner answers `202 duplicate` and does no work; teacher *retry* (same revision) is ineffective** | the target shows "processing" then "delayed" | **If this condition occurs, Force Regrade is the recovery path** (new revision → new job id) |
| L7 | JVM / .NET start-up counts inside the measured time limit | a correct Java / C# program can time out at a very low limit → a real 0 for that case | **pilot authoring policy: Java / C# official time limit ≥ 2000 ms** |
| L8 | Time limits are wall-clock; an oversubscribed host slows correct programs | false `timeout` | preflight: worst-case containers < vCPUs; no B-series |
| L9 | GitHub cron is best-effort (3 runs in ~9.5 h observed) | recovery latency of hours | freshness check (240 min), manual `workflow_dispatch` |
| L10 | No graceful drain API; SIGTERM interrupts running official jobs (counts toward `maxInterruptions` 2) | an upgrade during grading re-runs jobs | upgrade procedure: disable dispatch, wait for an empty journal |
| L11 | `/healthz` is liveness only; no metrics endpoint | readiness via the local preflight | `readiness.sh`; 17F-B1: local `coding-telemetry.js` ([`telemetry.md`](telemetry.md)) — still no network metrics endpoint |
| L12 | Journal gate in the gateway uses `path.resolve`, not `realpath`, and does not require a mount point | — | deployment preflight + `RequiresMountsFor` + immutable underlying dir |
| L13 | Single key per direction (no dual-key rotation) | brief coordinated window | README §10 |
| L14 | Docker CLI stderr is discarded | daemon causes show only as `RUNNER_INTERNAL` | `journalctl -u docker` |

## Phase 17F-B — Coding Scale & Operational Hardening (NOT implemented here)
| ID | Item | Addresses |
|---|---|---|
| **B1** | Configurable queue depth (raise the 64 cap, bounded by journal capacity; startup validation) | L1 |
| **B2** | Journal capacity / retention redesign (configurable `maxRecords`, separate confirmed retention, admission vs pruning) | L3, L4 |
| **B3** | Physical concurrency correction: configurable official runtime slots, one global host-wide sandbox semaphore shared by practice + official | L5 |
| **B4** | Compile concurrency accounting (compile containers count against the global limit; memory-aware admission) | L5 |
| **B5** | Scheduler reliability: a recovery trigger independent of GitHub cron (VM timer or Azure-native), larger / configurable sweep batches, a coding-target index | L2, L9 |
| **B6** | Re-arm / generation exhaustion semantics: a distinct answer (e.g. `409 JOB_EXHAUSTED`) the API surfaces, or teacher retry that starts a new generation | L6 |
| **B7** | Runtime mount / symlink hardening in the gateway itself (`realpath` + mount-point requirement), if still needed beyond the deployment preflight | L12 |
| **B8** | Java / C# start-up vs execution-time accounting (exclude runtime start-up, or per-language minimum `timeMs` in authoring validation) | L7 |
| **B9** | Host-load fairness (CPU-time-based limits or admission control so contention never produces a timeout verdict) | L8 |
| **B10** | School-scale capacity and load tests (30 / 100 / 500 / 1000 students; measured `T_job`, burst drain, practice concurrency) | all |

Also proposed: a graceful drain mode, a loopback-only readiness / metrics endpoint, dual-key rotation, and logging the Docker
error class.

**Phase 17F-B1 (observability foundation, this repository)** adds the *measurement* side only: `coding-telemetry.js`,
the extra `journal-status.js` fields, the `FRESH` / `STALE` / `UNKNOWN` freshness state and the student pending-grade display
rule. It changes **no limit above**: journal capacity / retention (B2), concurrency (B3 / B4) and the scheduler (B5) remain as
listed, and the telemetry reports them without altering them.
