# Pilot Monitoring Checklist

No large monitoring platform is required for the pilot. Every signal below can be observed with the VM, journald, an external
HTTPS probe and the GitHub Actions history. The Runner has **no metrics endpoint** (17F-B).

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
| Callback failures | `journal-status.js` ATTENTION `parked-callbacks`; `journalctl … event=="coding.runner.callback.failed"` | any → alert |
| Owed callbacks | `journal-status.js` `executed` older than 15 min | ATTENTION → alert |
| Retryable growth (busy) | `journalctl … event=="runner.official.busy"` count; teacher gradebook "retrying" counts | > 0 during a pilot burst → review the ≤ 64 burst guardrail |
| Recovery sweep freshness | `recovery-freshness.js --repo=<owner>/<repo> --max-age-min=240` | STALE → alert; trigger `workflow_dispatch` |
| Recovery exhausted | sweep log line `exhausted=N` (Actions run log) | N > 0 → teacher bulk retry / force regrade |
| Auth failures | `journalctl … event=="runner.request.unauthorized"` grouped by `reason` | sustained `signature` → key mismatch / probing |
| Journal capacity | `journal-status.js` `records N / 1024` (ATTENTION `journal-near-capacity` at 80 %) | → stop expanding the pilot |

## Suggested pilot cadence
- Every 5 minutes: a root cron or systemd timer runs `readiness.sh` and `journal-status.js --json` and mails on a non-zero
  exit (operator's choice of mailer).
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
