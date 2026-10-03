# Enterprise Coding Assessment — Phase 17F-B10-A / 17F-D0: Load, Capacity & Final Certification Harness

> **Status: certification harness ready. Production certification is NOT complete.** This phase delivers the repeatable harness, the
> scenario catalog, the report generator, the safety gates, local evidence and the certification procedure. No production load run
> was performed. "SmartAssess Coding is certified" may only be stated after B1 (observability / pending-grade UX), C1 (editor), the
> B2–B9 hardening items and the final production qualification described in §13 have been merged and executed.

Baseline: `main` at `eb61b5d3ce73ee54f734c3c188e167b0afa8d7c8` (17F-A2 hotfix merged). Branch: `feature/17f-b10-coding-load-certification-harness`.

## 1. Purpose

17F-A2 proved the live pilot works. This phase builds the engineering system that can later answer, with measured evidence:
how many simultaneous coding requests one Runner handles safely; what happens when many students press Run together or official
submissions arrive in bursts; whether one student or class monopolises capacity; the relative cost of Python / Java / C# and of
compilation; callback behaviour under load; what a Runner restart does to pending work; whether recovery stays correct under pressure;
whether journal state stays bounded and consistent; whether official grades are still applied at most once; whether any job is lost or
any false academic zero is created; whether the system fails closed when saturated; and which limits to document for `Standard_D4s_v5`
and when to recommend `Standard_D8s_v5`.

## 2. Architecture audit (what existed, what was missing)

| Area | Existing (reused) | Missing (built here) |
|---|---|---|
| Runner protocol signers | `runner/gateway/auth.js signRequest`, `callback.js signCallbackRequest / encodeCallbackBody` | — (reused, no second implementation) |
| Smoke tooling | `runner/deploy/azure-vm/smoke.js` (security rows, 14 language rows, sandbox probes, `--gate-p1`, callback probe `--near-max`), `smoke-matrix.md` (A1/A2 measurements, P1/P2 gates), `journal-status.js` (read-only aggregates, ATTENTION flags), `recovery-freshness.js` | any concurrency, admission measurement, percentiles, official ledger, report model |
| Runner admission | practice: `server.js` immediate `503 RUNNER_BUSY` above `RUNNER_MAX_CONCURRENCY` (1..16, default 2, no queue); official: `official.js` `live ≥ maxPending → busy`, `maxActive` 1..4, journal `maxRecords` 1024 | a harness that measures admission under **concurrent** arrivals (see finding B10-F1) |
| Durability / recovery | `journal.js` (atomic writes, lock, quarantine), `official.js` startup recovery (received → re-run, running → interrupted ≤ 2, executed → callback from durable result), `crash-recovery.rtest.js`, `durable-delivery.rtest.js`, Docker `restart.rtest.js` | recovery **under load** (several jobs outstanding) as a repeatable scenario with accounting |
| Tests | 154 Runner unit tests (node:test), Docker security / official suites — every Docker test at concurrency 1; no parallel practice load, no 50-case real job, P1 never run in CI | fail-first LOAD1–25, local scenarios SC1–14, Docker load DL1–7 |
| API side | `official-grading.js applyOfficialCallback` idempotent (`alreadyApplied`, `STALE_RESULT`, `UNKNOWN_JOB`), `grading-recovery.js` sweep, deterministic `officialJobId`; hidden tests only under `answer.*`, sanitised away from students; ~276 vitest tests | — (the harness measures the Runner leg and mirrors the API's callback contract in its receiver; it never changes grading semantics) |
| Performance tooling | none anywhere (no percentile / load / timing helper; backlog item B10 open) | all of it |
| Capacity documentation | `runner-env.example` and `deploy/azure-vm/README.md`: pilot D4s_v5 = `RUNNER_MAX_CONCURRENCY=1`, `MAX_ACTIVE=1`, `CASE_CONCURRENCY=2` (≤ 3 containers < 4 vCPU); D8s_v5 example `MAX_CONCURRENCY=5` | measured evidence (none yet — see §11) |
| Architecture guards | `api/tests/coding-guards-17b.test.js` pins every non-test file under `runner/` to an allow-list and forbids `child_process` outside `sandbox.js`; `deploy-artifacts.rtest.js` pins the `deploy/azure-vm` listing to the runbook table | → the harness lives under `runner/tests/load/` (test tooling, exempt), nothing was added to `deploy/azure-vm/` |

Not duplicated: `smoke.js` keeps the security rows and probes; the harness reuses its `p1Programs()` for CERT-J and its near-max body
shape for CERT-K.

## 3. Invariants the harness validates (never redefines)

A Runner executes untrusted code only · B the SmartAssess API is the grading authority · C hidden expected outputs never reach the
student (the harness computes expected outputs on its own side and never sends them to the Runner; its receiver counts any score /
passed / expected field in a callback body as a leak — gate G4) · D the Runner never decides the mark (the receiver, like the API,
decides from raw evidence) · E delivery is at-least-once (duplicate callbacks are expected and counted) · F official application is
at-most-once (gate G2) · G stable job identity (`cg_…` ids; duplicates answered `202 duplicate`) · H infrastructure failure never
becomes a final zero (gate G10: a technical outcome applied as `complete` with score 0 fails) · I no resubmission after an
infrastructure failure (recovery scenario reports `resubmissionNeeded: false` only when every accepted job settled by itself) · J only
Python, Java, C# (the accumulators refuse any other language).

## 4. Harness architecture

```
cli.js ─▶ harness.runScenario ─▶ targets.resolveTarget (local | staging | production, fail closed)
                               ─▶ scenarios.planScenario (validate params → steps; ceilings per target; refuse > ceiling / zero jobs)
                               ─▶ dry run? → plan only, NO request
                               ─▶ local: local-stack (REAL gateway + official queue + journal + deliverer; fake or Docker sandbox;
                                         SmartAssess-like callback receiver: apply once / alreadyApplied / technical → retryable)
                                  remote: driver.createRunnerClient (signed SA-CODING-RUNNER-1) [+ receiver on staging]
                               ─▶ safety.createGovernor (hard stop) + runPool (bounded concurrency)
                               ─▶ steps: load (practice / official / mixed / saturation / fairness) · p1 · callback-burst · recovery
                               ─▶ settle (every accepted official job acknowledged, or timeout → lost)
                               ─▶ /healthz probe · journal status (local: read; remote: operator attachment)
                               ─▶ gates.evaluateGates (G1–G11) ─▶ report.buildReport (redaction scan, build SHA) ─▶ JSON + Markdown
```

Modes: **1** practice load · **2** official load (hidden cases, callback completion) · **3** mixed · **4** callback burst (+ idempotent
re-delivery) · **5** recovery load (local: dead stop of the gateway with work outstanding, restart over the same journal, startup
recovery, settlement) · **6** saturation (offered concurrency above the Runner limits; busy counted; peak sandboxes; responsiveness).
Concurrency levels 1 / 2 / 4 / 8 / 16 / 32 are offered by CERT-D but **the target's ceiling decides what is allowed**; the harness
distinguishes offered concurrency, accepted / queued / active (official queue status on local), `RUNNER_BUSY`, completed, failed,
timed-out (an execution outcome, not a transport failure).

## 5. Target model and production protection

| target | how | protection |
|---|---|---|
| `local` | in-process stack started by the harness; no credentials | the default; `fetchImpl` for remote calls is never used |
| `staging` | `RUNNER_URL` + `RUNNER_HMAC_KEY` from the environment | operator declares it non-production; official load needs the harness receiver (`LOAD_CALLBACK_RECEIVER_PORT`, `LOAD_CALLBACK_HMAC_KEY`) |
| `production` | as staging **plus** `SMARTASSESS_ALLOW_PRODUCTION_LOAD_TEST=I_UNDERSTAND` in the harness process environment, https only | without the acknowledgement every call — even a plan — returns `PRODUCTION_NOT_ACKNOWLEDGED`; **official / recovery load through the Runner protocol is always refused** (`PRODUCTION_OFFICIAL_DIRECT_REFUSED`: an orphan callback would park in the production journal as `callback_failed` for 7 days); ceilings: ≤ 8 concurrent, ≤ 200 jobs, ≤ 15 min, ≤ 50 official, ≥ 2 s cool-down |

The default invocation (no arguments) is a **dry run** of CERT-A against `local`; `--execute` is required to send anything. A dry run
never calls the network for any target (LOAD19, mutation M13). No token, key or URL lives in the repository; keys are non-enumerable on
the resolved target and generated per local stack.

Hard ceilings (`safety.js CEILINGS`): local 64 / 5000 / 60 min / 2000 official; staging 32 / 2000 / 45 min / 500; production 8 / 200 /
15 min / 50; cases per job ≤ 50 everywhere. A request above a ceiling is refused (`MAX_*_EXCEEDED`), never clamped silently; the
governor hard-stops a run at the total-job or duration ceiling and records whether a ceiling was ever crossed (gate G8).

## 6. Test identity / pilot data

Live scenarios use **only** the dedicated test class, test-only students (the harness labels actors `cert-student-NN`), test-only
assignments (`cert-assignment-N`) and clearly named artifacts (`cg_load…` job ids, `CERT-*` reports). Real student records are never
used for load testing. Nothing in the repository holds a real token; the production acknowledgement is an environment variable.

## 7. Scenario catalog

| id | title | targets | purpose | prerequisites | default volume | expected | safety | evidence | pass rule |
|---|---|---|---|---|---|---|---|---|---|
| CERT-A | Practice correctness | local / staging / production | Every matrix workload (P1–P4, J1–J5, C1–C5) through the signed practice protocol returns the expected status (and output). | Runner reachable; practice runs persist nothing (production-safe). | jobs = 14 (one per workload) · concurrency 2 | every result status matches the workload; no RUNNER_BUSY at concurrency ≤ the Runner limit | Non-destructive; identical in nature to smoke.js language rows. | per-language outcomes and latency percentiles; expectation mismatches | G1–G11 PASS; mismatches = 0 |
| CERT-B | Official grading correctness | local / staging | Official jobs with hidden cases complete through the queue, the journal and the signed callback; every accepted job is graded at most once and correctly. | A callback receiver the Runner can reach (local stack, or the harness receiver on staging). PRODUCTION: only through the SmartAssess API with the dedicated test class (manual procedure). | officialJobs = 14 · casesPerJob = 3 · concurrency 4 | accepted = complete + retryable + failed; compile-error / timeout / runtime-error workloads produce the matching evidence; duplicate applications 0 | Never pointed at production directly: an orphan callback would park in the production journal. | official ledger reconciliation, callback timing percentiles, journal consistency | G1, G2, G4, G5, G6, G9, G10, G11 PASS |
| CERT-C | Language failure modes | local / staging | Timeout, runtime error, compile error (Java / C#) and CPU-heavy runs are bounded and reported as the right outcome in practice AND official grading. | as CERT-B | 8 failure workloads × practice + official | outcomes equal the workload expectation; no internal-error | Bounded time limits only; no memory / fork pressure. | per-outcome latency, compile cost (large-compile vs success) | G1–G11 PASS; internal-error = 0 |
| CERT-D | Concurrency ladder | local / staging / production | How practice latency and RUNNER_BUSY behave as offered concurrency rises (1, 2, 4, 8, 16, 32 — or one level). | Runner reachable | jobs per level = jobs (default 8) · levels bounded by the target ceiling | busy appears only above the Runner's RUNNER_MAX_CONCURRENCY; latency p95 per level is recorded | Production: ≤ 8 concurrent, cool-down between levels (ceilings). | per-level offered / completed / busy / p50 / p95 / p99 | G7, G8 PASS; correctness gates PASS; performance reported per level |
| CERT-E | Saturation / admission control | local / staging | Push practice and official admission past the configured limits and prove safe refusal (503 RUNNER_BUSY) instead of queue / resource growth; the Runner stays responsive. | local stack (Runner limits set by the scenario) or a staging Runner whose limits the operator knows | offered = 4 × the Runner limit (default) practice + officialJobs above maxPending | busy > 0, peak active ≤ configured limit, /healthz 200 afterwards, every busy job accounted as busy (never lost) | Staging only among remote targets: saturating production would refuse real students. | saturation summary (offered, busy, completed, peak active), responsiveness | G7, G8, G9 PASS; busy counted separately (G-busy) |
| CERT-F | Callbacks / idempotency | local / staging / production | Many signed callbacks arrive in a bounded interval; a re-delivered, already-applied result answers alreadyApplied and never changes the score. | local / staging: the harness receiver. production: SMARTASSESS_CALLBACK_BASE_URL + SMARTASSESS_CALLBACK_HMAC_KEY in the environment; every production callback names a job that cannot exist (404 UNKNOWN_JOB — nothing is written, like smoke.js). | callbacks = jobs (default 20) · concurrency 4 | local: every callback applied once, re-delivery alreadyApplied; production: 404 UNKNOWN_JOB for all | Production bodies are small and bounded (≤ 20 by ceiling); nothing is applied. | callback answers, latency percentiles, idempotency check | G2 PASS (0 duplicate applications, 0 score drift); transport answers as expected |
| CERT-G | Recovery under load | local | Accepted official work exists, the gateway dies, the journal is inspected, the gateway returns, recovery re-dispatches, jobs settle, grades apply at most once, no resubmission is needed. | local stack (in-process crash / restart over the same journal). STAGING / PRODUCTION: the manual procedure in crash-tests.md / smoke-matrix.md §Recovery (a test suite never stops a production service). | officialJobs = 6 · casesPerJob = 2 | journal at crash: ≥ 1 running / received; after restart: every job confirmed, applied once, re-executions ≤ maxInterruptions | Local only. | recovery summary (outstanding at crash, recovered, re-executions, applied once), journal consistency | G1, G2, G5, G6, G9, G10 PASS; reExecutionsPerJob ≤ 1 |
| CERT-H | Journal consistency | local | After a completed official batch the journal holds no running / received / executed / callback_failed / corrupt records. | local stack (the journal is on the Runner host; remote runs attach journal-status.js --json output). | officialJobs = 10 | clean final state | Local only; remote journals are inspected read-only by the operator. | journal counts at settlement | G3, G5, G6 PASS |
| CERT-I | Fairness (measured) | local / staging | F1 one student bursts while another sends one request · F2 one assignment bursts while another submits · F3 mixed-language burst · F4 practice plus official. Latency and starvation are MEASURED; no fairness guarantee is claimed (B9 defines policy). | as CERT-B for the official part | burst = jobs (default 12) per sub-scenario | numbers only: per-actor p50 / p95 / max, the single requester's latency vs the burst p50 | Bounded bursts. | fairness summary per sub-scenario | correctness gates PASS; fairness is reported, not gated |
| CERT-J | P1 latency regression | local / staging / production | The A2 pilot gate P1: the near-worst legitimate practice programs (smoke.js p1Programs) answer in ≤ 40 s for Python, Java and C# (Runner leg; the browser leg is measured manually as in smoke-matrix.md §P1). | Runner reachable | 3 runs (one per language) · concurrency 1 · repeats = jobs/3 | every run ≤ 40000 ms | Identical to smoke.js --gate-p1. | P1 samples per language | performance.p1.pass = true (reported separately from correctness) |
| CERT-K | P2 callback-size regression | local / staging / production | A: synthetic near-max callback (50 worst-case cases ≈ 6.45 MB) crosses the transport. B (local / staging): a REAL official job with 50 hidden cases and ~17 KB output per case is graded once and a re-delivery answers alreadyApplied. | production: callback env (as CERT-F) — part A only; part B needs the receiver | A: 1 near-max body · B: 1 job × 50 cases | A: applied (local) / 404 UNKNOWN_JOB (remote); B: applied once, alreadyApplied on re-delivery | One body only on production. | callback size, latency, idempotency | transport accepted; G2 PASS |
| CERT-L | Final mixed workload (exam-like) | local / staging | Several test students, Python / Java / C#, practice runs and official submissions, passing / wrong / compile-failing / runtime-failing / timing-out programs, callbacks, grading evidence and journal verification — the shape of a school exam, scaled by parameters. | as CERT-B. PRODUCTION: through the SmartAssess API with the dedicated test class only (manual, see the certification document). | jobs = 24 practice · officialJobs = 12 · casesPerJob = 3 · concurrency 4 · students = 8 | every accepted job settles; grades applied once; journal clean; outcomes match | Scaled by parameters; bounded by ceilings. | everything above | all gates PASS |

The future **final mixed workload** (CERT-L) is shaped like a school exam: several test students, three languages, practice runs and
official submissions, passing / wrong / compile-failing / runtime-failing / timing-out programs, callback completion, grading evidence,
journal verification — all counts scale through `--jobs`, `--official-jobs`, `--cases-per-job`, `--concurrency`, students.

## 8. Language workload matrix

P1 short success · P2 CPU-heavy bounded (~1 s) · P3 timeout (1000 ms limit) · P4 runtime error · J1 compile + run · J2 large valid source
(~40 KB of methods) · J3 compile error · J4 runtime error · J5 timeout (2000 ms) · C1 compile + run · C2 large valid source · C3 compile
error · C4 runtime error · C5 timeout (2000 ms). Each program carries `LOAD-KIND:` / `LOAD-FN:` markers that the deterministic fake
sandbox reads; real Docker simply runs the program; both are judged by the same expectations (G11). Memory / fork pressure programs stay
in `smoke.js --staging-only` and are not part of the matrix.

## 9. Measurement and percentile definitions

Every offered request lands in exactly one bucket: `completed` (HTTP 200 with an execution status, including `internal-error`),
`busy` (503 `RUNNER_BUSY`), `rejected` (any other HTTP answer), `networkErrors`. `failed` = `internal-error` executions + network errors
(a second axis, so collapsing busy into failed is visible — LOAD10 / M5). Official jobs: `submitted → dispatched (accepted | duplicate |
busy | conflict | stale | unauthorized | unavailable | rejected | network) → callback received → acknowledged (applied | alreadyApplied |
stale | unknown | rejected | error) → terminal (complete | retryable | failed)`.

Timings (ms, client wall clock): practice end-to-end = Runner leg of `/v1/execute`; official dispatch = `POST /v1/official-grading-jobs`
round trip; official callback = dispatch answer → callback arrival at the receiver (queue wait + execution + delivery; the split needs the
B1 observability fields and is a known limit); official end-to-end = dispatch + callback. **Percentiles are nearest-rank over a sorted
copy** (`p(q) = sorted[ceil(q·n) − 1]`): deterministic, order-independent, always an actual sample value, defined for 0 / 1 / 2 samples.
`mean` is reported but never used for a decision. Throughput = completed practice executions per minute of the run.

## 10. Correctness gates (machine-evaluated), scenario qualification and the verdict

**Two layers, kept apart (Independent Review Fix 1).** *Correctness* (G1–G11 below) answers "did the platform behave correctly".
*Qualification* answers "did this scenario meet its own pass rule": Q-CORRECTNESS (the correctness verdict is PASS) plus the
scenario's required checks — **Q-P1** (CERT-J: `performance.p1.pass`, every language ≤ 40 000 ms, a missing language fails),
**Q-CALLBACK-TRANSPORT** (CERT-F / CERT-K: every burst delivered, every answer as the target contract expects — `applied` on a
local / staging receiver, `UNKNOWN_JOB` for a production synthetic job), **Q-IDEMPOTENCY** (CERT-F / CERT-K when the plan requested a
re-delivery: `alreadyApplied` and state / score / application count unchanged between a snapshot taken BEFORE the re-delivery and one
taken AFTER), **Q-RECOVERY** (CERT-G: `recovery.pass`), **Q-ADMISSION** (CERT-E: every saturation step has `official.overAdmission = 0`).
The report carries both: `correctness { verdict, gates }` and `qualification { required, checks, failed, notEvaluated, verdict }`;
**`report.verdict` is the qualification verdict.** PASS requires every required check evaluated and passed; a failed check gives
FAIL whatever the averages say; an unmeasured required check gives INCOMPLETE, never PASS. Performance numbers never become
correctness gates — only the scenario's own pass rule reaches the verdict. The required checks are recorded in
`scenario.config.qualification` for reproducibility.

**Qualification authority (Independent Review Fix 2).** The canonical registry in `lib/qualification.js` is the only source of the
required checks, derived from the scenario id and the target class. `scenario.config.qualification` in a report is reproducibility
metadata: `buildReport` refuses a report whose metadata is missing a canonical check, adds an unknown check, repeats a check or is not
an array — metadata can never weaken the pass rule. An unknown scenario id or an unknown target class (anything but `local`,
`staging`, `production`) is refused outright and never degrades to "correctness only". **Every check derives its result from the
raw evidence**, never from a stored summary boolean: Q-P1 from `violations`, `missing`, the canonical 40 000 ms ceiling and the
per-language maxima; Q-CALLBACK-TRANSPORT from `count` vs the answer counts (Σ answers = count and answers[expectedAnswer] = count);
Q-IDEMPOTENCY from `redeliveryAnswer`, both snapshots and the state / score / application equality; Q-RECOVERY from the shared
`recoveryVerdict()` helper (settled, lost 0, duplicate applications 0, no resubmission, executions per job ≤ the allowance, itself
bounded by the Runner's `maxInterruptions`) that the recovery scenario also uses, so the two can never drift. **Contradiction policy:**
when a stored summary (`p1.pass`, `transportOk`, `idempotency.pass`, `recovery.pass`) contradicts its evidence the check FAILS and the
contradiction is recorded in `qualification.contradictions` (and shown in the Markdown) — a measured failure is a FAIL; malformed
certification evidence or metadata (wrong shapes, unknown ids) is REFUSED with an error — never a silent optimistic choice.

**Admission evidence (Independent Review Fix 3).** The admission bound used by Q-ADMISSION comes from exactly two sources, kept
apart in the plan and the report: `scenario.config.runner` is the EFFECTIVE configuration of the harness-owned LOCAL Runner (catalog
default merged with overrides; `null` on a remote target because the harness does not own that Runner); `scenario.config.runnerDeclared`
is ONLY what the operator explicitly supplied (`--runner-max-pending=N`). A remote saturation step records `officialMaxPending` and
`overAdmission` only from the declaration (`maxPendingSource: "operator-declared"`), never from the CERT-E catalog default; without a
declaration both are `null` and Q-ADMISSION is INCOMPLETE. Every saturation step must carry an `official` evidence object;
`overAdmission` is `null` (not measured) or a non-negative integer that is RE-DERIVED from `official.accepted` and `officialMaxPending`
(positive integer) — the derived value is authoritative, a stored `0` that disagrees FAILS with a recorded contradiction, and a
missing object / field or a NaN / Infinity / negative / string value refuses the report. **P1 evidence:** every canonical language
(python, java, csharp) must be proven by its own sample summary (count ≥ 1, finite max ≤ 40 000 ms); `missing` and `violations` are
stored summaries and cannot vouch for a language; malformed sample shapes are refused. **Strict shapes:** idempotency snapshots need a
string state, a null or finite score and a non-negative integer application count; recovery evidence needs boolean flags, non-negative
integer counts and a positive integer allowance — malformed shapes are refused, measured breaches FAIL.

**Certification authority (Independent Review Fix 4).** *Callback contract:* the expected answer of a synthetic callback burst is the
TARGET CONTRACT — `CALLBACK_CONTRACT` in `lib/qualification.js`: local → `applied` (the harness receiver applies the synthetic job),
staging and production → `unknown` (the job cannot exist at the SmartAssess endpoint → UNKNOWN_JOB). The harness takes its own
expectation from the same table, and a report's stored `expectedAnswer` is reproducibility evidence only: Q-CALLBACK-TRANSPORT
evaluates the answer counts against the contract, and a stored value that disagrees FAILS the check with a recorded contradiction
(a production burst "expecting applied" can never look consistent); a missing or non-string value is refused. *Local idempotency
completeness:* on local EVERY callback burst of CERT-F / CERT-K must carry its own idempotency evidence — a burst that omits it fails
Q-IDEMPOTENCY and is never covered by another burst that has it; staging / production require none (nothing is applied there).
*Canonical correctness:* `normalizeCorrectness()` in `lib/gates.js` is the ONE authority that derives `failed`, `notEvaluated`, `pass`
and `verdict` from the raw G1–G11 gate entries; `evaluateGates`, `evaluateQualification` (Q-CORRECTNESS) and `buildReport` (fresh
`gates` and a report revalidated from `correctness` alike) all go through it, so no second derivation can drift. A correctness object
must contain exactly every canonical gate once (a missing G5, a duplicate G3 or an unknown G12 is refused) with a consistent pair —
`evaluated=true` needs a boolean `pass`, `evaluated=false` needs `pass=null`, anything else is refused. Stored summaries (`verdict`,
`pass` / `correctnessPass`, `failed`, `notEvaluated`) are data, never authority: when they disagree with the raw gates the gates win,
the contradiction is recorded in `correctness.contradictions` and `qualification.contradictions`, and Q-CORRECTNESS FAILS — "G2 FAIL
but verdict PASS" can never yield a passing report, and a bare summary without gate entries can never claim Q-CORRECTNESS. *Round
trip:* a report produced by `buildReport` is accepted again by `buildReport` with identical correctness and qualification verdicts
(the same `p1` evidence now feeds both the qualification and the emitted report, and a recorded contradiction is never dropped).

**CERT-F / CERT-K requirement matrix (what is measurable under the current architecture):**

| target | required checks | why |
|---|---|---|
| local | Q-CORRECTNESS, Q-CALLBACK-TRANSPORT, Q-IDEMPOTENCY | the harness receiver really applies the synthetic job, so an idempotent re-delivery is meaningful |
| staging | Q-CORRECTNESS, Q-CALLBACK-TRANSPORT | the synthetic job cannot exist at the SmartAssess endpoint (404 UNKNOWN_JOB): transport only; nothing is applied, so no idempotency is measured or claimed |
| production | Q-CORRECTNESS, Q-CALLBACK-TRANSPORT | same transport-only contract |

The plan requests the idempotent re-delivery on `local` only. A future real staging prepared-job test (a job SmartAssess knows,
applied once, then re-delivered) may add a separate idempotency qualification; this phase does not fabricate one. A staging CERT-F /
CERT-K run therefore reaches PASS once the operator attaches `journal-status.js --json` for the correctness gates G3 / G5 / G6.

**Consequence for the current Runner:** CERT-E **FAILS qualification** on Q-ADMISSION because of finding B10-F1 (§11) while its
correctness gates pass. That is the intended enterprise behaviour: the harness is ready to detect the defect, the test suite passes
because it proves the detection, and the product is not qualified until Phase B3 fixes `official.js` — after which the identical
CERT-E scenario turns PASS without any change to the acceptance rule.

### Correctness gates

| gate | rule |
|---|---|
| G1 | lost official jobs = 0 (accepted jobs with neither acknowledgement nor explicit terminal state) |
| G2 | duplicate official grade application = 0 and no score drift on `alreadyApplied` |
| G3 | corrupt / quarantined journal records = 0 |
| G4 | hidden-test leakage = 0 (non-evidence keys in callback bodies / practice results) |
| G5 | no `executed` (owed callback), `running` or `received` record at final settlement, unless declared |
| G6 | no `callback_failed` record, unless declared |
| G7 | `/healthz` answers 200 after the run (saturation) |
| G8 | no safety ceiling crossed |
| G9 | accepted = complete + explicitly retryable + explicitly failed (remainder 0) |
| G10 | no technical outcome applied as a final zero |
| G11 | observed outcomes match the workload expectations (status; output for passing programs) |

Correctness verdict (`correctness.verdict`): `PASS` only when every gate was evaluated and passed; `FAIL` when any evaluated gate
failed; `INCOMPLETE` when a gate could not be evaluated (e.g. a remote run without an attached journal status). The P1 measurement
lives in `performance.p1` and reaches the top-level verdict only through Q-P1 for CERT-J (LOAD21, Q1, Q2).

## 11. Capacity evidence and the D4s_v5 / D8s_v5 decision model

**No capacity number is declared in this phase.** The only measurements that exist are: the A1/A2 single-request figures already in
`smoke-matrix.md` (Python 9.0 s, Java 10.7 s, C# 10.9 s for the P1 programs; 0.5–3.8 s for the matrix rows) and the local fake-sandbox
runs below, which qualify the **harness**, not the VM. Linear extrapolation from them is explicitly refused.

The D4s_v5 qualification (B3/B10 execution, later) runs CERT-D (ladder), CERT-E (saturation), CERT-B/C (official + compile cost), CERT-J
(P1) and CERT-L on the pilot or staging VM, with the operator attaching VM metrics per §12. The report then answers: safe practice
concurrency (highest ladder level with busy = 0 and p95 within the agreed ceiling), saturation point (first level with busy > 0), queue
behaviour (official dispatch → callback percentiles vs `maxActive`), p95 latency per language, Java / C# compile cost (J2/C2 vs J1/C1,
`compile.durationMs` from the evidence), official throughput (confirmed per minute), when `RUNNER_BUSY` begins, and the recommended pilot
limits (`RUNNER_MAX_CONCURRENCY`, `RUNNER_OFFICIAL_MAX_PENDING`, `MAX_ACTIVE`).

**D8s_v5 upgrade decision model** — an upgrade is warranted when one or more MEASURED thresholds (to be agreed from the D4s_v5 run, not
invented here) are crossed: sustained CPU saturation during the exam-like CERT-L; practice p95 above the agreed ceiling at the class
concurrency; busy / rejection rate above the agreed share of offered requests; official queue wait (dispatch → callback minus execution)
above the agreed grading delay; simultaneous class size above the measured safe concurrency. The report fields that feed each input are
`performance.latency.p95`, `totals.busy / totals.offered`, `official.timing.callback`, `saturation.steps[].practice.busy`, the attached CPU
series. Alternatives to a bigger VM (B3 global semaphore, B4 compile accounting, a second Runner) are decided on the same evidence.

### Finding B10-F1 (measured by the harness on the local stack, real `official.js`)

With `RUNNER_OFFICIAL_MAX_PENDING=3`, **8 sequential** official submissions give 3 accepted / 5 `RUNNER_BUSY`; **8 concurrent**
submissions give **8 accepted**. The admission check in `official.js submit()` counts live records before the concurrent submissions have
committed theirs (the `withJob` lock is per job id), so a burst over-admits past `maxPending` (and, in principle, past the journal
`maxRecords` bound by the burst width). Every over-admitted job is still journaled, executed once and confirmed — a **bounds violation
(L1 / backlog B1)**, not a correctness failure. Grading semantics were deliberately **not** changed in this phase (shared production
file, out of scope); the harness reports `saturation.steps[].official.overAdmission` and a `B10-F1 observed` note, and `SC5b`
characterises the behaviour. Recommended follow-up (B1/B3): serialise admission across jobs (a queue-wide admission lock or an atomic
reserved-slot counter) so `RUNNER_BUSY` holds for bursts; add a concurrent variant of `BD2`.

## 12. CPU / memory / disk observation contract (real VM qualification)

No agent is required. The operator captures, for the run's time window, and attaches to the report with `--attach=FILE.json`
(`attachments.*` is scanned by the redaction guard; never include credentials):

| measurement | how (D4s_v5 pilot) |
|---|---|
| VM CPU, memory, load average | Azure Monitor VM metrics (Percentage CPU, Available Memory) exported for the window; or `sar -u -r -q 5` / `vmstat 5` on the VM |
| disk utilisation (OS / journal / Docker) | `df -h / /data/smartassess-runner /var/lib/docker` before and after; Azure disk metrics |
| journal capacity | `journal-status.js --json` before and after (attach as `attachments.journalStatus` — this also evaluates G3/G5/G6 for a remote run) |
| Docker storage | `docker system df` before and after |
| active container count | `docker ps -q --filter label=smartassess.coding-runner=1 \| wc -l` sampled every 5 s (`watch -n5`) → peak |
| Runner events | `journalctl -u smartassess-runner -o cat --since …` filtered to `runner.execute.busy`, `runner.official.busy`, `callback.*` (counts only) |

Suggested attachment shape: `{ "vmSku": "Standard_D4s_v5", "cpuPercent": { "p50": …, "p95": …, "max": … }, "memoryAvailableMiBMin": …,
"loadAverageMax": …, "disk": { "journalFreeGiB": …, "dockerFreeGiB": … }, "containersPeak": …, "journalStatus": { …journal-status.js --json… } }`.

## 13. Usage

**Local (no Docker):** `node runner/tests/load/cli.js run --scenario=CERT-L --target=local --execute` (fake sandbox);
`npm --prefix runner run test:load` runs LOAD1–25, SC1–14 and the review-fix suites; `test:load:mutation` runs M1–M18 and QM1–QM30.
**Local (real Docker):** build the images (`npm --prefix runner run build:images`), then `--sandbox=docker` on any local scenario or
`npm --prefix runner run test:docker:load` (DL1–DL7, bounded).
**Staging:** `RUNNER_URL=https://runner-staging.<domain> RUNNER_HMAC_KEY=… node runner/tests/load/cli.js run --scenario=CERT-D
--target=staging --execute --levels=1,2,4,8 --vm-sku=Standard_D4s_v5 --attach=vm-metrics.json`; a staging CERT-E needs the operator's
explicit `--runner-max-pending=N` (the staging Runner's `RUNNER_OFFICIAL_MAX_PENDING`) or Q-ADMISSION stays INCOMPLETE; official scenarios additionally need the
harness receiver (`LOAD_CALLBACK_RECEIVER_PORT`, `LOAD_CALLBACK_HMAC_KEY`) and the staging Runner's `SMARTASSESS_CALLBACK_BASE_URL`
pointing at the harness host. Recovery on staging is the manual `crash-tests.md` procedure.
**Production approval workflow (later, never automatic):** (1) owner approval recorded; (2) B1 + C1 merged, A2 smoke green;
(3) off-hours window, no live exam; (4) `SMARTASSESS_ALLOW_PRODUCTION_LOAD_TEST=I_UNDERSTAND` set only in the operator's shell for the
run; (5) allowed scenarios: CERT-A, CERT-D (≤ 8 concurrent, cool-down), CERT-J, CERT-F / CERT-K part A (callback transport, unknown job
ids — nothing written); (6) official grading (CERT-B / CERT-L production variant) only through the SmartAssess API as the test students
of the dedicated test class, counts verified in the gradebook + `journal-status.js` + audit events (`coding.autoGrade.completed` exactly
once per target), with the harness report produced from the attached counts; (7) recovery on production is never automated: the
`smoke-matrix.md §Recovery` procedure, executed by a human, with the Runner stopped by the operator, not by a test.

## 14. Report format

`schemaVersion 1` (harness 1.2.0): `{ harnessVersion, target { name, remote, host }, environmentClass, buildSha, runnerSha, vmSku, scenario { id, title,
config { concurrency, jobs, practiceJobs, officialJobs, callbacks, casesPerJob, languages, workloadIds, limits, runner, levels, students,
ceilings, qualification[] } }, startedAt, durationMs, verdict (= qualification.verdict), correctness { verdict, pass, failed, notEvaluated, contradictions[], gates[] } (canonical, derived from the gate entries),
qualification { verdict, pass, required[], failed[], notEvaluated[], contradictions[], checks[] { …, contradiction } }, callbacks[] (bursts: answers, latency, transportOk,
idempotency { redeliveryAnswer, before { state, score, applications }, after { … }, stateUnchanged, scoreUnchanged, applicationsUnchanged, pass }),
performance { latency, latencyByOutcome,
official { dispatch, callback, endToEnd }, p1, throughputPerMinute }, totals { offered, completed, busy, rejected, networkErrors, failed,
retryable, lost, mismatches, practiceOffered, …, officialAccepted, officialBusy }, languages { python | java | csharp → counts, outcomes,
latency }, practice, official (ledger reconciliation incl. byLanguage / byActor), journal, recovery, saturation, fairness, attachments,
notes }` plus a Markdown rendering. Reproducibility: git SHA (required, 40 hex), Runner SHA, harness version, scenario id and full
configuration, environment class, VM SKU; `compareReports` refuses two reports from different SHAs. Reports never contain source, stdin,
stdout, expected outputs, keys, signatures or auth headers (redaction scan; LOAD5–7; M4).

## 14a. The harness callback receiver (local stack and staging receiver)

The receiver that stands in for the SmartAssess API bounds every request **before** verification at the Runner protocol's own
callback ceiling, `CALLBACK_MAX_BYTES` = 8 MiB from `gateway/callback.js` (no second limit): wrong method / path is refused before
the body is read; a `Content-Length` above the bound is refused immediately (413) without buffering; streamed bytes are counted and
the body is discarded the moment it exceeds the bound (413, connection closed); exactly 8 MiB is accepted; the ≈ 6.45 MB P2 body is
accepted; the HMAC is computed over the exact accepted bytes; nothing of a body, key or signature is logged. It also exposes an
application counter per job (for the idempotency snapshot) and test-only fault modes (`fault-mutate`, `fault-reapply`) that the
harness must catch (R1–R8, I1–I5).

## 15. Evidence from this phase

| evidence | result |
|---|---|
| fail-first LOAD1–LOAD25 on the baseline | 25 tests, 25 fail (`MODULE_NOT_FOUND`) |
| LOAD1–LOAD25 after implementation | 25 / 25 pass |
| local scenario suite SC1–SC14 (fake sandbox, real gateway / queue / journal / deliverer) | 15 / 15 pass (SC5: CERT-E correctness PASS, qualification FAIL on Q-ADMISSION — B10-F1; SC5b is the characterisation) |
| mutations M1–M18 (19 mutants incl. M4b) + QM1–QM8 (10 mutants incl. QM6b / QM7b) + QM9–QM16 (8) + QM17–QM24 (8) + QM25–QM30 (6) | 51 / 51 killed, files restored byte-for-byte |
| Independent Review Fix 1 fail-first Q1–Q10, I1–I5, R1–R8 | 23 fail on 4c1a416 → 23 / 23 pass |
| Independent Review Fix 2 fail-first QA1–QA4, AUTH1–AUTH6, EV1–EV9 | 17 of 19 fail on 8b6fe3a → 19 / 19 pass |
| Independent Review Fix 3 fail-first RA1–RA6, RB1–RB7, RP1–RP6, RE1–RE6 | 18 of 25 fail on 78114c3 → 25 / 25 pass |
| Independent Review Fix 4 fail-first CT0–CT7, ID1–ID4, CG1–CG11, RT1–RT3 | 18 of 26 fail on 332c210 → 26 / 26 pass |
| `load:qualify:local` CERT-L (24 practice + 12 official, concurrency 4) | PASS; practice p50 / p95 94 / 211 ms (fake profile); official end-to-end p50 408 ms; journal clean |
| Runner unit suite | see the PR for the exact count after reconciliation |
| real Docker (DL1–DL7) | not runnable in the authoring container (no Docker daemon); executed by the manual `docker-load` CI job / operator |
| production load | **not run** (by design of this phase) |

## 16. Known limits

Queue wait vs execution time cannot be split from the Runner leg until B1 adds the observability fields (reported as one duration).
Fairness is measured, not guaranteed (B9). Official load through the Runner protocol needs a harness receiver (staging) and is refused
on production; production official grading evidence comes from the API path (manual counts attached). Recovery is in-process on local
(the process-kill variant is covered by `tests/unit/crash-recovery.rtest.js` RR1–3 and Docker `restart.rtest.js`). The fake sandbox's
timings qualify the harness, never the VM. The local stack's receiver mirrors `applyOfficialCallback`'s contract (`applied` / `alreadyApplied`
/ technical → `retryable`) but is not the API code. Finding B10-F1 is reported, not fixed. P1 end-to-end (browser leg) stays a manual
measurement as in A2.

## 17. Later final-certification procedure

1. Reconcile with the merged B1 / C1 / B2–B9 state; rerun `test:load`, `test:load:mutation`, the Runner unit suite and `test:docker:load`.
2. Staging / pilot VM: CERT-A, B, C, D (ladder), E, H, I, J, K, L with `--vm-sku=Standard_D4s_v5` and attached VM metrics; recovery per
   `crash-tests.md`. Every report PASS (or INCOMPLETE only for gates the attachment cannot evaluate, explained).
3. Decide the D4s_v5 limits and the D8s_v5 thresholds from the measured reports (§11); record them in `runner-env.example` and the runbook.
4. Production (approval workflow §13): CERT-A, CERT-D, CERT-J, CERT-F / K part A; API-path official qualification with the test class.
5. Only then: "SmartAssess Coding — production certification complete", citing the report files (SHA, scenario, date) for each gate.
