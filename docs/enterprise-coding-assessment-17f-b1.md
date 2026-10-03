# Phase 17F-B1 — Coding Observability Foundation & Pending-Grade UX

> ⛔ **DO NOT MERGE — independent review required.** No Azure resource was created or changed, no secret was generated,
> rotated or uploaded, no Runner was enabled, no PR was merged, `main` was not modified. 17F-A2 remains a GO for the
> controlled pilot as reported; this phase only implements backlog item **B1** of the 17F-B plan.

**Scope.** (B1-A) safe operational telemetry of the coding execution path, (B1-B) journal health visibility,
(B1-C) machine-readable recovery freshness, (B1-D) the student pending-grade display fix from the A2 live audit
(`0 / 30` and `0%` shown during a Runner outage). **Not here:** journal capacity / retention (B2), concurrency (B3 / B4),
scheduler (B5), any Azure or GitHub-governance change.

| | |
|---|---|
| Baseline | `origin/main` `eb61b5d3ce73ee54f734c3c188e167b0afa8d7c8` (merge of PR #246, 17F-A2 hotfix) — re-verified unchanged before each push |
| Review | first reviewed head `b502816` → Independent Review Fix 1 (§7a) → reviewed head `f63a544` → Independent Review Fix 2 (§7b) |
| Branch | `feature/17f-b1-observability-pending-grade-ux` — one branch, one PR, no rebase, no force-push, no amend after push, auto-merge off |
| Runbook | [`runner/deploy/azure-vm/README.md`](../runner/deploy/azure-vm/README.md) §4, §5.13, §7, §8 · [`telemetry.md`](../runner/deploy/azure-vm/telemetry.md) · [`monitoring-checklist.md`](../runner/deploy/azure-vm/monitoring-checklist.md) |

## 1. Architecture audit (read before anything was written)
| Question | Finding (code fact) | Consequence for B1 |
|---|---|---|
| Where is the student-facing grading state decided? | `api/src/lib/coding/official-grading.js` `studentCodingGradingStatus(attempt)` → `queued` / `processing` / `retrying` / `delayed` / `complete` / absent (skips overridden targets, 17E-D F3); `autoGradingPending(attempt)` is the legacy boolean. Both are projected by `student-submission.js pub()` (`autoGradingStatus`, `autoGradingPending`) and `student-dashboard.js latestResult`. | **The server already is the single authority.** No new server state, no new field: the UI consumes the existing aggregate. |
| How does the UI currently word the state? | `src/codingGradingStatus.ts` (`codingGradingStatusOf`, `isCodingGradingOpen`, `shouldPollCodingGrading`) + `src/student/CodingGradingStatusPanel.tsx` (17E-C) — the *panel* already says "جارٍ التصحيح الآلي"; the *headline* (`StudentExamPage.tsx` `.iex-score` + `<strong>{percentage}%</strong>`) and the portal card (`StudentAssignmentCard.tsx`) printed the raw provisional `score` / `percentage`, i.e. `0 / 30` and `0%`. | The defect is a **display rule**, not a status rule. Fix = one resolver next to the existing vocabulary, used by both surfaces. |
| Is mark finality a separate dimension? | Yes: `src/gradingStatus.ts resolveGradingStatus` (`pendingReview` / `final`), server `deriveGradingStatus`. 17E-C deliberately never merged the two. | Untouched. "علامة مؤقتة" and the pending headline coexist; the resolver never reads `score`, `percentage` or finality. |
| What does the host already measure? | `journal-status.js` (counts per state, owed callbacks, quarantine, lock, attention list, 80 % capacity), `recovery-freshness.js` (last successful sweep vs 240 min), gateway structured journald events (`runner.official.accepted/completed/busy`, `runner.execute.completed/busy`, `coding.runner.callback.confirmed/retry/failed`, `coding.runner.execution.*`, `coding.runner.journal.*`, `runner.request.unauthorized`; `*.completed` carries `language`, `durationMs`, `compile`, outcome **counts**). | Telemetry is **assembled from existing local diagnostics**; no new gateway route (`/healthz` stays the only one), no new log line in the gateway, no process spawned (17B R1 guard: `sandbox.js` is the only process starter). |
| Could a dashboard read raw journal bodies? | `journalStatus` validates each record (`validateRecord`) and keeps counts only; bounded by `JOURNAL_LIMITS.startupScanMax`. | Reused as-is; the aggregate never includes a record body (§11 of the brief). |

## 2. Student pending-grade UX (B1-D) — exact behaviour
`src/codingGradingStatus.ts`:
```ts
export const PENDING_SCORE_DASH = "—";
export const PENDING_SCORE_LABEL = "بانتظار التصحيح الآلي";
export function scoreWithheld(result) { return isCodingGradingOpen(codingGradingStatusOf(result)) || result.autoGradingPending === true; }
```
| Server projection | Result page headline (`data-testid="result-headline"`, `data-pending`) | Percentage slot | Portal card |
|---|---|---|---|
| `autoGradingStatus` ∈ {`queued`, `processing`, `retrying`, `delayed`} (any score) | `— / 30`, `data-pending="true"` | `بانتظار التصحيح الآلي` | `علامة مؤقتة: — /30` (no `%`) |
| legacy payload: only `autoGradingPending: true` | `— / 30` | `بانتظار التصحيح الآلي` | `— /30` |
| `autoGradingStatus: "complete"`, score 0 | `0 / 30`, `data-pending="false"` | `0%` | `0/30 (0%)` when final |
| teacher override → server omits the open state (17E-D F3), score 0 | `0 / 30` | `0%` | `0/30` |
| no coding question (no status field), score 0 | `0 / 30` | `0%` | `0/30` |
| mixed exam: coding `processing`, other question already worth 10 | `— / 30` (the partial 10 is **not** presented as the result) | pending label | `— /30` |
| refresh `processing` → `complete` 30 / 100 % | `30 / 30` | `100%` | — |

Invariant: **OPEN TECHNICAL STATE + NO AUTHORITATIVE SCORE ⇒ neutral · COMPLETE AUTHORITATIVE SCORE = 0 ⇒ 0.**
The UI never infers completion from the score; the 17E-C panel, polling (`useCodingGradingPoll`), mark-finality badge and the
`coding-grading-pending` legacy sentence are unchanged. Three 17E-C assertions that encoded the old numeric headline while open
(POLL8 `7 / 10`, POLL10b `5 / 10`, RACE3 `2 / 10`) now assert `— / 10` while open and the numeric mark after completion.
CSS: `.iex-score[data-pending="true"]` and `.iex-score-pending` (muted, smaller) in `studentexam-pro.css`.

## 3. Telemetry (B1-A / B1-B / B1-C)
- **`runner/deploy/azure-vm/coding-telemetry.js`** (new, pure + CLI): `aggregateEvents(lines)` reads only `event`, `language`
  (bucketed to registry languages + `other`), `durationMs`, `compile`, `outcomes` counts; `buildTelemetry({journal, events,
  recovery})` → one record `runner.coding.telemetry` v1 (journal counts / total / capacity / `utilizationPercent` /
  `callbackBacklog` / `oldestOwedCallbackMinutes` / quarantine / corrupt / truncated / lock / attention; `queue.pending`,
  `queue.active`; official accepted / completed / compileErrors / outcome counts; practice completed; `busy.official` /
  `busy.practice` (**RUNNER_BUSY observability**); callbacks confirmed / retries / failed; recovery `FRESH` / `STALE` /
  `UNKNOWN` + age; auth unauthorized; per-language duration `{count, minMs, p50Ms, maxMs}`; `health {state, reasons}` with
  `healthy` < `saturated` < `backlogged` < `degraded`); `assertSafe(record)` allow-list / forbidden-key / free-text self-check
  (the CLI exits 2 and prints nothing but the violation when it fails); `LIMITS` 100 000 lines, 16 KB per line, 10 000 samples
  per bucket, 64 MiB total input (RF1 — all applied while streaming stdin). Exit 0 healthy, 3 otherwise, 2 usage. Full vocabulary,
  thresholds and troubleshooting: `telemetry.md`.
- **`journal-status.js`**: adds `utilizationPercent`, `callbackBacklog` (= `executed + callback_failed`),
  `oldestOwedCallbackMinutes`, `health` (`ok` / `attention`); every 17F-A1 field, attention rule and exit code unchanged; text
  output adds `(N%)` and `callback backlog N`.
- **`recovery-freshness.js`**: `judge()` now returns `state: "FRESH" | "STALE"` (existing fields kept); new `freshnessState()`
  returns `UNKNOWN` for an API / request failure or invalid input — **never fresh**; CLI prints the state, exit 2 + JSON on
  UNKNOWN. 240-min policy and the scheduler untouched.
- **Queue wait** is not emitted: the gateway logs no admission→start interval and adding one is a gateway change outside B1
  (documented as a known limit; `queue.pending` + `durations.official` is the proxy).

### Data NOT collected (privacy contract, enforced by tests TEL1–TEL3 + `assertSafe`)
student source, student stdin, program stdout / stderr, hidden test input, hidden expected output, per-case results, HMAC keys,
signatures, tokens, authorization or any header, callback / request bodies, job ids, request ids, target references, student /
teacher identifiers, file paths, hostnames, addresses, free text.

## 4. Fail-first evidence (new suites on the untouched baseline `eb61b5d`)
| Suite | Baseline result | Failure shape |
|---|---|---|
| `src/coding/pendingGrade.17f-b1.test.tsx` | **9 failed / 4 passed** (13) | UX1–UX4, UX-legacy, UX8, UX9, UX9b: `expected '0 / 30' to match /^—\s*\/\s*30$/` (UX8: `'10 / 30'`); UX-card: no `— / 30` on the card. UX5 / UX5b / UX6 / UX7 (real zero / real score display) passed — invariants, as intended. |
| `runner/tests/unit/deploy-telemetry.rtest.js` | **8 failed / 0 passed** | TEL5 / TEL6 (`utilizationPercent`, `callbackBacklog`, `health` missing), TEL7 (`state` / `freshnessState` missing), TEL1–TEL4, TEL8, health, utilization: `Cannot find module coding-telemetry.js`. |
| `api/tests/coding-17f-b1-pending-grade.test.js` | 3 passed | server invariants (override ⇒ no open state, vocabulary mapping, UX10 outage projection carries no teacher-only field) — intentionally green on the baseline. |

## 5. Tests added / changed
- `src/coding/pendingGrade.17f-b1.test.tsx` — 14: UX1 retrying, UX2 queued, UX3 processing, UX4 delayed, UX1b–UX4b each
  status alone (no legacy boolean), UX-legacy, UX5 complete 0, UX6 complete 24 / 80 %, UX7 override 0, UX5b non-coding 0,
  UX8 mixed partial, UX9 pending → complete 30, UX9b pending → complete real 0, UX-card.
- `api/tests/coding-17f-b1-pending-grade.test.js` — 3: UX7 server, vocabulary, UX10 (`F.runnerFetch("throw")` outage →
  public keys only).
- `runner/tests/unit/deploy-telemetry.rtest.js` — 8: TEL5, TEL6, TEL7, TEL1–3 (adversarial verbose lines on **every** counted
  event type: accepted, official completed, practice completed, busy, callback failed), TEL4 (bounded cardinality, flood of
  100 500 lines), TEL8, health classification, utilization.
- Updated: `codingGrading.17e-c.test.tsx` (3 headline assertions), `deploy-preflight.rtest.js` T2 (`state: "FRESH"`),
  `coding-guards-17b.test.js` `RUNNER_DEPLOY` list (+ `coding-telemetry.js`).

## 6. Mutations (each applied alone, targeted suite, restored byte-for-byte; 4-file fingerprint `ecf1c07a…5fb1` identical before / after)
| # | Mutation | Result |
|---|---|---|
| M1 | `scoreWithheld` → `return false` (pending shown as 0) | KILLED — 10 failed / 4 passed |
| M2 | `isCodingGradingOpen` excludes `retrying` | KILLED — 1 failed (UX1b–UX4b)¹ |
| M3 | `isCodingGradingOpen` excludes `delayed` | KILLED — 1 failed (UX1b–UX4b)¹ |
| M4 | withhold whenever `score === 0` (hide a legitimate zero) | KILLED — 5 failed / 9 passed |
| M5 | copy `e.source` into the aggregate on `runner.official.accepted` | KILLED — TEL1–3² |
| M6 | copy `e.expected` / `e.cases` into the aggregate on `runner.execute.completed` | KILLED — TEL1–3² |
| M7 | `callbackBacklog: 0` | KILLED — TEL5 + TEL6 |
| M8 | utilization divides by 100 instead of `maxRecords` | KILLED — TEL5 + utilization |
| M9 | `freshnessState` returns `FRESH` on API failure | KILLED — TEL7 |
| M10 | delete the two `*.busy` cases | KILLED — TEL8 + health |

¹ Pass 1 **survived** M2 / M3: every open fixture also carried the legacy `autoGradingPending: true`, which masked the mutated
status check. Added UX1b–UX4b (each status alone) → killed. ² Pass 1 **survived** M5 / M6: the adversarial fixture poisoned
only one `runner.official.completed` line, not the mutated event types. Poison fields were added to one line of every counted
event type → killed. Both passes are recorded in the PR body.

## 7. Validation (this branch, exact CI commands)
| Command | Result |
|---|---|
| `npm --prefix runner test` (Coding Runner CI) | 162 / 162 |
| `npm test` (SWA CI: root vitest = frontend + API) | 613 files / 7564 tests |
| `npm run build` · `npm run check:bundle` | built · bundle guard passed |
| `npm run lint` (oxlint) | 99 warnings / 0 errors (baseline, unchanged) |
| `npx tsc -b` | exit 0 |
| `api`: all `coding-*` suites (17B guards, 17C, 17D, 17E-C, 17E-D, 17F-B1) | 21 files / 397 tests |
| `api`: student submission / dashboard / sanitizer / recovery / runner / security-sensitive suites | 24 files / 341 tests |
| `npm --prefix runner run test:docker:security` · `test:docker:official` (local daemon) | 28 / 28 · 13 / 13 · `docker ps -aq --filter label=smartassess.coding-runner=1` empty |
| `git diff --check` | clean |

## 7a. Independent Review Fix 1 (same branch, normal commit on top of `b502816`)
| Finding | Fix |
|---|---|
| **RF1 — stdin was buffered whole.** The CLI did `fs.readFileSync(0, "utf8")` and only then applied `maxLines` / `maxLineBytes`, so an arbitrarily large `journalctl` stream was held in memory before any bound. | `aggregateStream(readable, limits)` consumes stdin **as a bounded stream**: Buffer chunks, lines split on `\n` at the byte level, a line decoded only when its **UTF-8 byte** length ≤ `maxLineBytes` (16 384; an oversized line's bytes are dropped as they arrive and counted as `window.oversized` + `malformed`), the read **stopped and the source destroyed** at `maxInputBytes` (**64 MiB**, new) or when `maxLines` (100 000) are consumed and more input exists — both set `window.truncated`; at most one line of carry-over is held; nothing of a line is retained after `feed`. `window.inputBytes` reports what was accepted. The array API `aggregateEvents` shares the same `createAggregator` and now measures `Buffer.byteLength`, not `.length`. The CLI (`async main`) calls `aggregateStream(process.stdin)`; `readFileSync(0)` is gone (guarded by RF1-E). |
| **RF2 — `oldestOwedCallbackMinutes` ignored parked results.** It equalled `oldestExecutedMinutes` while `callbackBacklog` counted `executed + callback_failed`. | `journalStatus` tracks the oldest age across `executed` **and** `callback_failed` from `executedAt` (validated `updatedAt` fallback), schema unchanged; `oldestExecutedMinutes`, attention rules and exit codes untouched; `buildTelemetry` now carries the owed age (it previously copied the legacy field). |
| **RF3 — the runbook recommended an always-degraded timer command.** Without `--recovery=` recovery is `UNKNOWN` → `degraded` → exit 3 by design, yet the checklist suggested exactly that command for the timer. | Docs now separate **form A (diagnostic, no `--recovery=`, recovery UNKNOWN, never healthy — never alert on it)** from **form B (monitoring: step 1 `recovery-freshness.js --json > file`, step 2 `--recovery=<file> --json`)** in `telemetry.md` §0, `monitoring-checklist.md` (timer block) and README §5.13 / §7. `recovery-freshness.js --json` now stamps `checkedAt`; `loadRecoveryResult` adds the file's own age, re-applies the 240-min policy (an aged FRESH verdict becomes STALE) and treats a missing / invalid / future / > 240-min-old result as UNKNOWN. No credential, secret, process or scheduler added. **Guard:** RF3 test scans the three documents — every monitoring / timer / `--json` invocation of `coding-telemetry.js` must carry `--recovery=`, every invocation without it must be labelled diagnostic / UNKNOWN; backslash-continued lines are one invocation. |

Fail-first on `b502816` (`runner/tests/unit/deploy-telemetry-rf1.rtest.js`): **10 failed / 2 passed** — RF1-A…E (`aggregateStream` not a
function; `readFileSync(0` present), RF2-B / C / E (owed age `null` or executed-only), RF3 guard (README diagnostic line unlabelled),
RF3 currency (`loadRecoveryResult` missing). RF2-A and RF2-D passed by construction (the cases where the old field coincided).

Mutations (each alone, targeted RF + telemetry suites, byte-for-byte restore, fingerprint identical): RM1 restore `readFileSync(0)` → KILLED (RF1-E) ·
RM2 drop the input-byte cap → KILLED (RF1-B) · RM3 char-count bound, array API → KILLED (RF1-D) · RM3b char-count bound, stream API →
KILLED (RF1-D; pass 1 survived because `feed` re-measured bytes itself — now the stream hands its wire measurement to the single check) ·
RM4 owed age ignores `callback_failed` → KILLED (RF2-B/C/E) · RM5 parked-only backlog → null age → KILLED (RF2-B/E) · RM6 timer command
without `--recovery=` → KILLED (RF3 guard).

## 7b. Independent Review Fix 2 (same branch, normal commit on top of `f63a544`)
| Finding | Fix |
|---|---|
| **RF2-1 — the `--recovery` file read was unbounded.** `fs.readFileSync(args.recovery).slice(0, 4096)` loaded the whole file before slicing. | `readRecoveryFileBounded(file)`: `openSync(O_RDONLY \| O_NONBLOCK)` (a FIFO never blocks the open) → `fstatSync` → **regular file only** → size ≤ **4096** (`LIMITS.maxRecoveryFileBytes`) → `readSync` loop into a `limit + 1` buffer → `> limit` ⇒ `oversize`; fd closed in `finally`; never throws. `loadRecoveryFile()` = bounded read → strict JSON → `loadRecoveryResult`; any failure ⇒ `UNKNOWN`. The CLI calls `loadRecoveryFile(args.recovery)`; R2-1C guards against `readFileSync(args.recovery` / `.slice(0, 4096)` returning. |
| **RF2-2 — negative / future freshness.** `loadRecoveryResult` accepted a negative `ageMinutes`; `judge()` would call a future `lastSuccessAt` FRESH (negative age ≤ policy). | `ageMinutes` must be a finite number ≥ 0 (else `UNKNOWN`); `checkedAt` keeps its future protection. `judge()` returns `UNKNOWN` (`fresh: false`) when `lastSuccessAt` leads the clock by more than `CLOCK_SKEW_TOLERANCE_MS` = **60 s**; within it the age is clamped to 0. |
| **RF2-3 — `--max-age-min` derived from `Number(...)`.** `--max-age-min=Infinity` disabled the guard silently. | `parseMaxAgeMin(raw)`: `undefined` ⇒ 240; a positive **integer** (number or `/^[0-9]{1,9}$/` string) ⇒ itself; everything else (`Infinity`, `NaN`, text, `0`, negatives, fractions, `--max-age-min` without a value) ⇒ `null` ⇒ the CLI prints usage and exits 2 before any network call. `judge()` and `loadRecoveryResult()` fall back to 240 for an invalid policy, so a library caller cannot widen the window either. |

Fail-first on `f63a544` (`runner/tests/unit/deploy-telemetry-rf2.rtest.js`): **9 failed / 1 passed** — R2-1A…F (`readRecoveryFileBounded`
missing; `readFileSync(args.recovery` present), R2-2A (negative age accepted), R2-2B (future timestamp FRESH), R2-3A–F
(`parseMaxAgeMin` missing), docs guard. R2-2C/D passed by construction.

Mutations (each alone, RF2 + RF1 + telemetry suites, byte-for-byte restore, fingerprint identical): RM7 restore `readFileSync(…).slice(0, 4096)` →
KILLED · RM8 ignore the recovery-file size → KILLED · RM9 accept a negative age → KILLED · RM10 future sweep reported FRESH → KILLED ·
RM11 accept `Infinity` as max-age → KILLED (see the PR body for the exact killing tests).

## 8. Security analysis
- Telemetry reads the journal through the existing validated aggregate and journald text through stdin; it opens no socket,
  spawns nothing, writes nothing. `assertSafe` fails closed. No new endpoint, no new secret, no new environment variable
  (`RUNNER_JOURNAL_DIR` already exists). 17B D13 secrets scan and the REAL deploy-file reference guard pass with the new files.
- The UI change is display-only on a public projection that already carried `autoGradingStatus`; no new field is exposed, no
  teacher-only field leaks (UX10), scoring authority, callback / runner auth, grading key, revision, job identity, at-most-one
  application, recovery ownership, hidden-test confidentiality and sanitizer boundaries are untouched (`api/src/*` unchanged
  except nothing — the API diff is tests only).

## 9. Known limits and boundaries
- Queue wait time not measured (gateway logs no interval) — proxy documented.
- Telemetry is pull-based and local; shipping it off-host is the operator's log pipeline (B-series "metrics endpoint" remains
  future work; `/healthz` is still liveness only).
- B2 (capacity / retention), B3 / B4 (concurrency), B5 (scheduler) untouched — telemetry reports them, never alters them.
- Deployment: copy the release as usual (§5.7); optional timer line in `monitoring-checklist.md`. **No USER / AZURE action
  required** by this phase. Rollback: revert the merge commit — no data format, journal, secret or endpoint changed.
