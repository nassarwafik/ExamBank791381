# SmartAssess Coding — Load, Capacity & Certification Harness (Phase 17F-B10-A)

Repeatable engineering harness that **measures** the Coding platform (Runner protocol, official queue, durable journal, signed
callbacks) under load and evaluates a fixed **pass / fail contract**. It never redefines an invariant, never decides a mark, never
sends an expected output to the Runner and never writes student source, hidden inputs, keys or signatures into a report.
Verdict = **scenario qualification** (correctness G1–G11 + the scenario's own required checks); CERT-E currently FAILS on Q-ADMISSION because of finding B10-F1 (the Runner over-admits concurrent official submissions) — by design, until Phase B3 fixes `official.js`.
Full specification: [`docs/enterprise-coding-assessment-17f-b10-certification.md`](../../../docs/enterprise-coding-assessment-17f-b10-certification.md).

```
node runner/tests/load/cli.js                                   # DRY RUN of CERT-A against local — no request is made
node runner/tests/load/cli.js catalog                           # the scenario catalog
node runner/tests/load/cli.js plan --scenario=CERT-D --target=staging --levels=1,2,4
node runner/tests/load/cli.js run  --scenario=CERT-L --target=local --execute            # real local run → results/*.json + *.md
npm --prefix runner run test:load            # LOAD1–LOAD25 + SC1–SC14 + review fix 1 (Q/I/R) + review fix 2 (QA/AUTH/EV) (no Docker)
npm --prefix runner run test:load:mutation   # M1–M18 + QM1–QM24 must all be killed
npm --prefix runner run test:docker:load     # bounded REAL-Docker local load (needs the worker images)
```

| | |
|---|---|
| `lib/targets.js` | target model — `local` / `staging` / `production`; production fails closed (`SMARTASSESS_ALLOW_PRODUCTION_LOAD_TEST=I_UNDERSTAND`, https) |
| `lib/safety.js` | hard ceilings per target class, plan check, run-time governor (hard stop), bounded pool |
| `lib/workloads.js` | the language matrix P1–P4 / J1–J5 / C1–C5 (+ harness-side expected outputs) |
| `lib/metrics.js` | nearest-rank percentiles, practice accumulator (one bucket per request, busy ≠ failed) |
| `lib/accounting.js` | official ledger (submitted → dispatched → callback → acknowledged → terminal), reconciliation identity, journal consistency |
| `lib/gates.js` | G1–G11 correctness gates, P1 gate (performance, separate); `normalizeCorrectness()` — the ONE canonical correctness authority (Independent Review Fix 4): exactly the canonical gate set, consistent evaluated / pass pairs, verdict derived from the raw entries, stored summaries recorded as contradictions when they disagree |
| `lib/qualification.js` | scenario qualification (Independent Review Fix 1 / 2 / 4; `CALLBACK_CONTRACT` = the target-derived expected answer of a synthetic callback; every local burst must carry idempotency evidence): the CANONICAL registry of required checks per scenario and target class (fail closed on unknown scenario / target; report metadata must match it exactly); Q-CORRECTNESS + Q-P1 / Q-CALLBACK-TRANSPORT / Q-IDEMPOTENCY (local only) / Q-RECOVERY / Q-ADMISSION, every one derived from raw evidence with contradictions recorded; `report.verdict` = qualification verdict |
| `lib/report.js` | JSON report (schemaVersion 1) + Markdown, redaction scan, build-SHA requirement, report comparison; a report revalidates through the same canonical correctness authority with identical verdicts |
| `lib/scenarios.js` | CERT-A … CERT-L catalog + planner (validation, ceilings; `runner` = effective local configuration, `runnerDeclared` = the operator's explicit remote declaration) |
| `lib/driver.js` | signed Runner client + callback sender (reuses the gateway's own signers) |
| `lib/fake-sandbox.js` | deterministic sandbox for the local target (markers `LOAD-KIND:` / `LOAD-FN:`) |
| `lib/local-stack.js` | in-process stack: real gateway + queue + journal + deliverer, a SmartAssess-like callback receiver (apply once / alreadyApplied, body bounded at `CALLBACK_MAX_BYTES` before verification, application counter, test fault modes), crash / restart |
| `lib/harness.js` | orchestrator (modes 1–6), settlement, gates, report |
| `cli.js` | operator CLI; `results/` is git-ignored |

Secrets come only from the environment (`RUNNER_URL`, `RUNNER_HMAC_KEY`; for remote callback bursts `SMARTASSESS_CALLBACK_BASE_URL`,
`SMARTASSESS_CALLBACK_HMAC_KEY`; for official load on staging `LOAD_CALLBACK_RECEIVER_PORT`, `LOAD_CALLBACK_HMAC_KEY`). Nothing is printed.
Official load is **refused on the production target** through the Runner protocol (an orphan callback would park in the production
journal); production official grading is qualified through the SmartAssess API with the dedicated test class (manual procedure in the document).
