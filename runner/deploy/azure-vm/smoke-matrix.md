# Pilot Smoke Matrices

Tools: `smoke.js` (signed, keys from the environment, safe on production) and the **dedicated test assignment**. Setup: one
teacher, one test student in a test class, one assignment with one `coding@1` hidden-tests question per language, 3 hidden
cases each, proportional scoring, `timeMs` **2000** (pilot policy for Java / C#), `memoryMb` 256.

## Runner surface + security (`smoke.js runner`)
| Check | Expected | Where |
|---|---|---|
| liveness `/healthz` | 200 `{ok:true}` | prod-safe |
| signed capabilities | python, java, csharp | prod-safe |
| unsigned request | 401 | prod-safe |
| wrong HMAC | 401 | prod-safe |
| stale timestamp (−600 s) | 401 | prod-safe |
| replayed request id | first 200, replay 401 | prod-safe |
| tampered body | 401 | prod-safe |
| oversized source (> 64 KB) | 400 `REQUEST_INVALID` | prod-safe |
| unsupported language (`ruby`) | 400 | prod-safe |
| arbitrary image field | 400 (exact allow-list) | prod-safe |
| official route enabled (invalid body) | 400 (503 = official grading disabled → FAIL) | prod-safe: nothing journaled |
| near-max official body through the proxy | 400 from the gateway (proxy did not refuse ~2 MiB) | prod-safe |
| official body > 2 MiB | 413 | prod-safe |
| container network (`connect 1.1.1.1:53`) | blocked | prod-safe |
| host filesystem (journal, `/etc/smartassess-runner`, `/var/lib/docker`, …) | absent; `/etc` write → read-only | prod-safe |
| Docker socket | absent | prod-safe |
| infinite loop | `timeout` | prod-safe |
| huge stdout | `output-limit`, ≤ outputBytes returned | prod-safe |
| fork / PID pressure | bounded (`timeout` / `runtime-error`), gateway still live | **staging only** (`--staging-only`) |
| memory pressure | bounded (`runtime-error`) | **staging only** |

## Language matrix: practice (`smoke.js runner --languages=…`) and OFFICIAL (test assignment)
Expected official result with 3 hidden cases (`n`, answer `2n`):

| Language | Case | Program | Practice status | Official score / evidence |
|---|---|---|---|---|
| Python | pass | `print(int(input()) * 2)` | success, `42` | full marks, 3/3 |
| Python | wrong output | `print(41)` | success, `41` | 0, 0/3, cases `success`, `passed: false` |
| Python | runtime error | `print(1 // 0)` | runtime-error | 0, cases `runtime-error` |
| Python | timeout | `while True: pass` | timeout | 0, cases `timeout` |
| Java | pass | `Scanner` → `nextInt()*2` | success, `42` | full marks |
| Java | compile error | missing `;` | compile-error | 0, `outcome: compile-error`, compile preview shown |
| Java | wrong output | prints `41` | success, `41` | 0 |
| Java | runtime error | array index out of bounds | runtime-error | 0 |
| Java | timeout | `while (true) {}` | timeout | 0 |
| C# | pass | `int.Parse(Console.ReadLine()!) * 2` | success, `42` | full marks |
| C# | compile error | missing `;` | compile-error | 0, compile preview |
| C# | wrong output | prints `41` | success, `41` | 0 |
| C# | runtime error | `throw new InvalidOperationException()` | runtime-error | 0 |
| C# | timeout | `while (true) { }` | timeout | 0 |

For every official row, verify:
- the gradebook score;
- the per-case evidence (status, duration, previews);
- exactly one audit event `coding.autoGrade.completed`;
- `journal-status.js` → the job `confirmed`, nothing `callback_failed`.

Measured on A1 (practice, real Docker, development container): all 14 rows pass (Python 0.5–1.6 s, Java 1.1–3.6 s, C#
0.7–3.8 s per request).

## Concurrency, saturation, P1 / P2 regressions under load (Phase 17F-B10)
`smoke.js` measures one request at a time. Concurrency ladders, saturation / admission, official bursts, callback bursts, recovery
under load, the P1 and P2 regressions as repeatable scenarios (CERT-A … CERT-L) and the machine-evaluated gates G1–G11 live in the
load / certification harness: `runner/tests/load/` (`node runner/tests/load/cli.js catalog`), specified in
`docs/enterprise-coding-assessment-17f-b10-certification.md`. Production stays fail closed there too.

## §P1: Pilot Gate P1 (SWA 45-second API ceiling)
1. Runner leg: `smoke.js runner --gate-p1`. A1 measurement: Python 9.0 s, Java 10.7 s, C# 10.9 s.
2. **End to end (A2):** as the test student in the IDE, run the three `p1Programs()` sources from `smoke.js` (time limit 10000 ms on the
   question). Measure browser request duration (DevTools → Network, `/api/coding/run`).
3. Pass: every run returns a result in **≤ 40 s**.
   **Fail for Java/C#: DO NOT ACTIVATE JAVA/C# PRACTICE IN PRODUCTION** (record the decision; Python may proceed).

## §P2: Pilot Gate P2 (callback size, 30 MB SWA quota)
1. On the VM, with the callback settings loaded from the env file in the service context:
   `systemd-run --pipe --wait --collect -p EnvironmentFile=/etc/smartassess-runner/runner.env -p WorkingDirectory=/opt/smartassess-runner/current/runner /usr/bin/node deploy/azure-vm/smoke.js callback --near-max`
   → `callback-key-matches-api` PASS (404 UNKNOWN_JOB), `callback-wrong-key-rejected` PASS (401),
   `callback-near-max-body-accepted` PASS (≈ 6.45 MB, 404 UNKNOWN_JOB). Nothing is written by the API.
2. Real job: an official question whose program prints ~17 KB per case for 50 hidden cases
   (`print('x' * 17000)`). The score is applied **once**, and a re-delivery (teacher retry) answers `alreadyApplied`.

## §Recovery: Runner unavailable → recovered, no false zero
1. `CODING_RUNNER_ENABLED=true`. Then `sudo systemctl stop smartassess-runner` (or block 443 on the NSG for the test).
2. The test student submits the Python question. The submission **succeeds**, the target is `retryable` (status "retrying"),
   the score is **not** 0 and the question is under review.
3. `sudo systemctl start smartassess-runner`, then Actions → Coding Grading Recovery → **Run workflow** (or teacher retry).
4. The sweep dispatches, the callback lands, and the official score appears (applied once).
5. Evidence: `recovery-freshness.js` FRESH; audit `coding.autoGrade.retryable` then `coding.autoGrade.completed`.
