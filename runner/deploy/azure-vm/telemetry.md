# Coding Runner Telemetry (Phase 17F-B1)

Local, read-only, **bounded** operational telemetry of the coding execution path. It is built from what the host already has —
the journal aggregate (`journal-status.js`), the gateway's structured journald events and the recovery-freshness judgement
(`recovery-freshness.js`) — and is **not** a metrics endpoint: the Runner still exposes `/healthz` only, no new gateway route
exists, and `coding-telemetry.js` starts no process (`journalctl` output is piped **in**; `gateway/sandbox.js` remains the only
process-starting module of `runner/`, architecture guard 17B R1).

## 0. Two invocation forms — do not confuse them
| Form | Command | `recovery.state` | Can be `healthy`? | Use |
|---|---|---|---|---|
| **A. Diagnostic** | `journalctl -u smartassess-runner -o cat --since -1h \| sudo -u smartassess-runner node …/coding-telemetry.js --dir=/data/smartassess-runner` (no `--recovery=`; diagnostic, recovery UNKNOWN) | `UNKNOWN` | **No** — health is always `degraded`, exit 3 | a human reading counts, backlog, busy, durations on the host |
| **B. Monitoring / timer** | step 1 + step 2 below (`--recovery=` a *current* freshness result) | `FRESH` / `STALE` / `UNKNOWN` | Yes | the alert path; the only form whose exit code means something |

```sh
# step 1 — on a host that can reach api.github.com (the Runner VM if its outbound policy allows, else the operator's admin
#          machine, copying the small file). GITHUB_TOKEN, if the repo needs one, is exported from the secret store — never typed
#          on a command line. A request failure writes state UNKNOWN (exit 2) — the `|| true` keeps the pipeline going; the file
#          then makes step 2 report degraded, which is the correct, fail-closed outcome.
node /opt/smartassess-runner/current/runner/deploy/azure-vm/recovery-freshness.js --repo=<owner>/<repo> --max-age-min=240 --json > /run/smartassess/recovery-freshness.json.tmp || true
mv -f /run/smartassess/recovery-freshness.json.tmp /run/smartassess/recovery-freshness.json
# step 2 — on the Runner host, as the service user (the journal is 0700); the last hour of gateway events on stdin; one JSON line out
journalctl -u smartassess-runner -o cat --since -1h \
  | sudo -u smartassess-runner node /opt/smartassess-runner/current/runner/deploy/azure-vm/coding-telemetry.js \
      --dir=/data/smartassess-runner --recovery=/run/smartassess/recovery-freshness.json --json
# exit 0 healthy · 3 saturated / backlogged / degraded · 2 usage, unreadable journal or privacy self-check refusal
```
The freshness file carries `checkedAt`. Step 2 adds the file's own age to `ageMinutes`, re-applies the **240-min** policy
(a `FRESH` verdict that aged past 240 min is `STALE` now) and treats a missing, unparsable, future-dated or > 240-min-old file as
`UNKNOWN`. Nothing is ever assumed fresh. No new secret, process, scheduler or endpoint is introduced: the two steps go into the
operator's existing timer (`monitoring-checklist.md`).

### Input bounds (Review Fix 1)
stdin is consumed as a **bounded stream**, never read whole: lines are split at the byte level as chunks arrive; a line is decoded
only when its **UTF-8 byte** length is ≤ `maxLineBytes` (16 384 — an oversized line's bytes are dropped as they stream in and
counted under `window.oversized` / `window.malformed`); reading **stops** — the source is destroyed — at `maxInputBytes`
(64 MiB) or once `maxLines` (100 000) are consumed and more input exists; either sets `window.truncated: true`; at most one line
of carry-over is held. `window.inputBytes` reports what was accepted. Nothing of a line is retained after it is aggregated.

## 1. Vocabulary (`event: "runner.coding.telemetry"`, `schemaVersion: 1`)
| Field | Meaning | Source |
|---|---|---|
| `journal.counts.{received,running,executed,confirmed,callback_failed,superseded}` | journal records per state — the 17D-B2 semantics are unchanged (`received` admitted, `running` executing, `executed` result stored and **owed** to SmartAssess, `confirmed` callback accepted, `callback_failed` parked after the callback budget, `superseded` replaced by a newer revision) | `journal-status.js` |
| `journal.total` / `journal.capacity` / `journal.utilizationPercent` | records / fixed capacity (`JOURNAL_LIMITS.maxRecords` = 1024) / whole percentage, 0–100 | `journal-status.js` |
| `journal.callbackBacklog` | `executed + callback_failed`: results SmartAssess does not have yet | `journal-status.js` |
| `journal.oldestOwedCallbackMinutes` | age of the oldest result still OWED to SmartAssess across `executed` **and** `callback_failed` (parked) records, from `executedAt` (validated `updatedAt` fallback); `null` when none. The legacy `oldestExecutedMinutes` of `journal-status.js` stays executed-only. | `journal-status.js` |
| `journal.quarantined` / `corrupt` / `truncated` / `lockHeld` / `attention[]` | as in `journal-status.js` (`attention` ⊆ `parked-callbacks`, `executed-result-waiting`, `corrupt-or-quarantined`, `truncated`, `journal-near-capacity`) | `journal-status.js` |
| `queue.pending` / `queue.active` | official jobs admitted but not started / executing (= `received` / `running`) | journal |
| `window.{lines,parsed,ignored,malformed,oversized,inputBytes,truncated}` | the event window fed on stdin: lines consumed, parsed gateway events, events the tool does not count, unparsable lines (oversized ones included), lines over the 16 KiB UTF-8 byte bound, bytes accepted, whether a limit (100 000 lines · 64 MiB) stopped the read | stdin |
| `official.accepted` / `official.completed` / `official.compileErrors` / `official.outcomes.{success,timeout,…}` | `runner.official.accepted` / `runner.official.completed` counts; compile failures; per-outcome **case counts** summed over completed jobs | events |
| `practice.completed` | `runner.execute.completed` count | events |
| `busy.official` / `busy.practice` / `busy.total` | `RUNNER_BUSY` refusals: `runner.official.busy` / `runner.execute.busy` | events |
| `callbacks.confirmed` / `retries` / `failed` | `coding.runner.callback.confirmed` / `.retry` / `.failed` | events |
| `recovery.state` / `recovery.ageMinutes` | `FRESH` / `STALE` / `UNKNOWN` and the age of the last successful sweep (240-min policy unchanged) | `recovery-freshness.js` |
| `auth.unauthorized` | `runner.request.unauthorized` count (no reason breakdown, no addresses) | events |
| `durations.official.<lang>` / `durations.practice.<lang>` | `{count, minMs, p50Ms, maxMs}` per registry language (`python`, `java`, `csharp`) + `other`; `count` counts every completed event, min / p50 / max use the first 10 000 samples per bucket | events `durationMs` |
| `health.state` / `health.reasons[]` | see §3 | derived |

Queue **wait** time is not emitted: the gateway does not log an admission→start interval today (`runner.official.accepted` and
`runner.official.completed` carry no shared timestamp field), and inventing one in the Runner would be a gateway change outside
B1. `queue.pending` with `durations.official` is the pilot proxy.

## 2. Forbidden fields — the privacy contract
The record is counts, percentages, durations and fixed enumerations. It **never** contains:
- student source code, student stdin, program stdout / stderr, hidden test input, hidden expected output, per-case results;
- HMAC keys, signatures, tokens, authorization or any other request header, callback bodies, request bodies;
- job ids (`cg_…`), request ids (`og_…`), target references (`assignment/student/attempt/question`), student / teacher
  identifiers, file paths, hostnames, addresses, free text of any kind.

How this is enforced, not promised: `aggregateEvents` reads only `event`, `language` (bucketed to the registry + `other`,
never used as a key), `durationMs`, `compile` and the `outcomes` **counts** of `runner.official.completed`; every other field of
every line is dropped before anything is stored. `assertSafe(record)` re-walks the emitted record against a fixed allow-list of
keys, a forbidden-key list (`source`, `stdin`, `stdout`, `stderr`, `expected`, `key`, `signature`, `headers`, `authorization`,
`token`, `jobId`, `requestId`, `targetRef`, `studentId`, …) and refuses any free-text string value; the CLI exits 2 and prints
nothing but the violation path when the self-check fails. Tests TEL1–TEL3 feed an adversarial (hypothetical, forbidden) verbose
gateway line carrying all of the above and prove none of it reaches the output.

## 3. Health state — interpretation
`health.state` is the worst of the triggered reasons (`healthy` < `saturated` < `backlogged` < `degraded`):

| State | Reasons | Meaning | First action |
|---|---|---|---|
| `healthy` | — | no backlog, no busy refusal in the window, journal under 80 %, recovery FRESH | — |
| `saturated` | `runner-busy` | official or practice requests were refused with `RUNNER_BUSY` in the window; official overflow is `retryable` (never a zero) and drains through recovery | review burst size vs the ≤ 64 pending cap (L1); watch `queue.pending`; teacher bulk retry if recovery is slow |
| `backlogged` | `parked-callbacks`, `executed-result-waiting`, `callback-failures` | results exist on the Runner that SmartAssess has not confirmed: callback path (URL, key, API availability, 30 MB gate) | README §6 `coding.runner.callback.*` lines; the API's `/api/coding-grading-callback` health; parked records need the recovery sweep / teacher retry |
| `degraded` | `corrupt-or-quarantined`, `truncated`, `journal-near-capacity`, `journal-events`, `recovery-stale`, `recovery-unknown` | the journal or the recovery safety net itself is at risk | corrupt / quarantined → README §6 troubleshooting; near capacity → stop expanding the pilot (B2 is the fix); stale → `workflow_dispatch` the recovery workflow; unknown → fix the freshness check's token / network first |

The exit code (0 / 3) mirrors `healthy` vs anything else, so a timer can mail on non-zero exactly like `journal-status.js`.

## 4. Alert-ready signals (thresholds the pilot agreed)
| Signal | Threshold |
|---|---|
| `health.state` | `degraded` → page; `backlogged` → alert; `saturated` during a burst → review |
| `journal.utilizationPercent` | ≥ 80 → stop expanding the pilot |
| `journal.callbackBacklog` | > 0 for two consecutive windows → alert |
| `journal.oldestOwedCallbackMinutes` | > 15 → alert |
| `busy.total` | > 0 outside a known burst → review |
| `recovery.state` | `STALE` → alert + `workflow_dispatch`; `UNKNOWN` → check the checker (never assumed fresh) |
| `auth.unauthorized` | sustained growth → key mismatch or probing |
| `durations.official.<lang>.p50Ms` | approaching the authored time limit → L7 / L8 review |

## 5. Pending-grade invariant (student UI — `src/codingGradingStatus.ts scoreWithheld`)
`OPEN TECHNICAL STATE + NO AUTHORITATIVE SCORE ⇒ neutral display` · `COMPLETE AUTHORITATIVE SCORE = 0 ⇒ display 0`.
The server's aggregate `autoGradingStatus` (`queued` / `processing` / `retrying` / `delayed` / `complete`, or absent) is the
only input; while it is open the headline shows `— / 30` and `بانتظار التصحيح الآلي` instead of `0 / 30` and `0%`. The UI never
infers completion from the score. Telemetry never changes a grade.

## 6. Boundaries (not changed here)
- **B2** journal capacity / retention: `JOURNAL_LIMITS` untouched; telemetry only reports `utilizationPercent`. No pruning.
- **B3 / B4** concurrency: slots and the busy cap untouched; `busy.*` only counts refusals.
- **B5** scheduler: the GitHub cron and the 240-min freshness policy untouched; only the result became machine-readable.
- No new public administrative Runner endpoint; no Azure resource; no new secret; no new production process or scheduler — the two
  steps of §0 run inside the operator's existing timer. The journal directory is the only Runner-side input and that is already in
  `runner-env.example` (`RUNNER_JOURNAL_DIR`).

## 7. Troubleshooting
| Symptom | Cause | Fix |
|---|---|---|
| `journal unreadable` (exit 2) | not run as the service user, or `/data/smartassess-runner` not mounted | `sudo -u smartassess-runner …`; `findmnt /data/smartassess-runner` |
| `telemetry refused by the privacy self-check` (exit 2) | a future gateway event added a field the aggregate copies, or a corrupted aggregate | file a bug — the tool fails closed on purpose; nothing was printed |
| `window.malformed` large | stdin is not `-o cat` journald output (e.g. the default journalctl format) | use `journalctl -u smartassess-runner -o cat --since -1h` |
| `window.truncated: true` with `lines` = 100 000 | more than 100 000 lines in the window | shorten `--since` |
| `window.oversized > 0` | gateway lines over 16 KiB (UTF-8 bytes) — not produced by the gateway today | compare the gateway version; the lines were counted, never decoded |
| `recovery.state: UNKNOWN` **without** `--recovery=` | form A (diagnostic) — expected; health is `degraded` by design | use form B (§0) for monitoring |
| `recovery.state: UNKNOWN` with `--recovery=` given | the freshness file is missing / invalid / older than 240 min / future-dated, or step 1's GitHub API call failed | re-run step 1 (`recovery-freshness.js --json`); check its `GITHUB_TOKEN` and network; check the timer order (step 1 before step 2) |
| `window.truncated: true` with `inputBytes` = 67 108 864 | the 64 MiB total input ceiling stopped the read | shorten `--since` |
| `durations.*.other.count > 0` | a completed event with a language outside the registry | should not happen — compare the gateway version with `registry.js` |
