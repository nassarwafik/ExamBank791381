# Pilot Monitoring Checklist

No large monitoring platform is required for the pilot. Every signal below can be observed with the VM, journald, an external
HTTPS probe and the GitHub Actions history. The Runner has **no metrics endpoint** (17F-B); Phase 17F-B1 adds the local tool
`coding-telemetry.js` ([`telemetry.md`](telemetry.md)) that folds the signals below into one bounded JSON record with a `health`
state, for a cron / timer, a log shipper or a human.

| Signal | How (pilot) | Threshold / alert |
|---|---|---|
| Runner process | `systemctl is-active smartassess-runner`; unit `failed` after the start limit | not `active` → page |
| HTTPS endpoint | external probe of `https://runner.<domain>/healthz` every 1–5 min (⚠ USER/AZURE: availability test) | 2 consecutive failures → page |
| TLS certificate | probe reports expiry; `curl -vI https://runner.<domain>/healthz 2>&1 \| grep expire` | < 14 days → alert |
| Docker daemon | `readiness.sh` (`docker` check) on a timer or manually; `systemctl is-active docker` | FAIL → page |
| Journal mount | `findmnt /data/smartassess-runner`; `readiness.sh` (`journal`) | not mounted → page |
| Journal free space | `readiness.sh` (`journal-disk`: ≥ 1 GB and ≥ 10 %) / Azure disk metric | below → alert |
| Docker disk free space | `readiness.sh` (`docker-disk`: ≥ 5 GB and ≥ 10 %) | below → alert (`docker image prune` of non-runner images) |
| Worker images | `readiness.sh` (`images`, against the manifest) | FAIL → page |
| **Telemetry health (17F-B1)** | `journalctl -u smartassess-runner -o cat --since -1h \| coding-telemetry.js --dir=… --json` → `health.state` + `health.reasons` | `saturated` → review burst size; `backlogged` → callback path; `degraded` → page |
| Callback failures | `journal-status.js` ATTENTION `parked-callbacks`; telemetry `journal.counts.callback_failed`, `callbacks.failed`; `journalctl … event=="coding.runner.callback.failed"` | any → alert |
| Owed callbacks / backlog | `journal-status.js` `executed` older than 15 min; telemetry `journal.callbackBacklog`, `journal.oldestOwedCallbackMinutes` | ATTENTION / `oldestOwedCallbackMinutes` > 15 → alert |
| Retryable growth (busy) | telemetry `busy.official` / `busy.practice` (counts of `runner.official.busy` / `runner.execute.busy`); teacher gradebook "retrying" counts | > 0 during a pilot burst → review the ≤ 64 burst guardrail (health `saturated`) |
| Execution durations | telemetry `durations.official.<lang>` / `durations.practice.<lang>` `{count, minMs, p50Ms, maxMs}` | `p50Ms` near the authored time limit → review L7 / L8 (Java / C# start-up, host load) |
| Recovery sweep freshness | `recovery-freshness.js --repo=<owner>/<repo> --max-age-min=240` → `FRESH` / `STALE` / `UNKNOWN` | STALE → alert; trigger `workflow_dispatch`; UNKNOWN (API / request failure) → check the token / network, never assume fresh |
| Recovery exhausted | sweep log line `exhausted=N` (Actions run log) | N > 0 → teacher bulk retry / force regrade |
| Auth failures | `journalctl … event=="runner.request.unauthorized"` grouped by `reason` | sustained `signature` → key mismatch / probing |
| Journal capacity | `journal-status.js` `records N / 1024 (P%)`; telemetry `journal.utilizationPercent` (ATTENTION `journal-near-capacity` at 80 %) | ≥ 80 % → stop expanding the pilot |

## Suggested pilot cadence
- Every 5 minutes: a root cron or systemd timer runs `readiness.sh` and `journal-status.js --json` and mails on a non-zero
  exit (operator's choice of mailer). 17F-B1: `coding-telemetry.js --json` (exit 3 when `health.state` ≠ `healthy`) can be
  appended to the same timer; its JSON line is safe to ship to a log platform as-is.
- Daily: `recovery-freshness.js`, `journalctl --disk-usage`, `df -h /data/smartassess-runner /var/lib/docker`.

## Recovery freshness without the API (manual)
GitHub → Actions → **Coding Grading Recovery** → filter `status: success`. The newest run's time is the last successful sweep.
Open it: the step "Trigger one signed recovery sweep" prints `HTTP 200 … eligible=… dispatched=… exhausted=…`.

## Log retention
| Tier | |
|---|---|
| **Pilot (required)** | journald persistent, capped 2 GB / 30 days (`journald-smartassess-runner.conf`); Caddy access log rolled 10 × 50 MiB |
| Production (recommended) | Azure Monitor Agent → Log Analytics (journald + Caddy), 30–90 days |
| Enterprise (future) | workbooks / dashboards / SIEM, metrics endpoint (17F-B) |
