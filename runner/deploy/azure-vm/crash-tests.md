# Crash / Restart / Journal Tests (staging or pre-activation pilot, never live students)

**Never deliberately crash production during activation.** Run these on a staging Runner, or on the pilot VM **before**
`CODING_RUNNER_ENABLED=true` for real students. Use the test assignment or a staging SmartAssess.

Helpers (on the VM):
- `JS="sudo -u smartassess-runner node /opt/smartassess-runner/current/runner/deploy/azure-vm/journal-status.js --dir=/data/smartassess-runner"`
- `EV="journalctl -u smartassess-runner -o cat --since -10min | jq -c 'select(.event|test(\"journal|execution|callback|official\"))'"`
- `PID=$(systemctl show -p MainPID --value smartassess-runner)`
- Slow a job down so a window is observable: a hidden-tests question with 10 cases and `time.sleep(1.5)` per case.

Already covered automatically on every CI run (no Docker, real gateway process): `runner/tests/unit/crash-recovery.rtest.js`,
`durable-delivery.rtest.js`, `production-readiness.rtest.js`. With real Docker: `tests/docker-official/restart.rtest.js`.
The procedures below repeat the scenarios on the real host.

| ID | Scenario | Procedure | Expected durable state / outcome |
|---|---|---|---|
| C1 | gateway killed **before** container start | `RUNNER_OFFICIAL_MAX_ACTIVE=1`; submit two slow jobs; while job 1 runs, `kill -9 $PID` | job 2 was `received`. After restart: `coding.runner.execution.resumed`; executes once, called back once, scored once |
| C2 | killed **during** execution | submit a slow job; when `docker ps --filter label=smartassess.coding-runner=1` shows a container, `kill -9 $PID` | `ExecStopPost` / startup sweep removes the container; record `running` → `coding.runner.execution.interrupted` (interruptions 1) → re-run → confirmed; one score |
| C3 | killed **after result, before callback** | temporarily block egress to the SmartAssess host (`iptables -I OUTPUT -p tcp -d <api-ip> --dport 443 -j REJECT`); wait for `executed` (`$JS`); `kill -9 $PID`; restore egress | after restart: `executed` called back **from the durable result**, no new container (`docker events` shows none), confirmed |
| C4 | killed **during callback** | add latency (`tc qdisc add dev eth0 root netem delay 8000ms`), `kill -9` while `coding.runner.callback.*` is pending; remove the qdisc | `callback.attempts` already incremented (durable reservation); resend after backoff; API answers `applied` or `alreadyApplied`; one score |
| C5 | VM reboot | `sudo reboot` with jobs in several states | unit starts after Docker + both mounts; `recovery.staleLock: "previous-boot"`; states recovered as C1–C3 |
| C6 | Docker daemon restart | `sudo systemctl restart docker` while a job runs | cases `internal-error` → API technical outcome (`retryable`, never zero) → next delivery = generation 2 → scored |
| C7 | callback API unavailable | block egress for ≥ 10 min while a job finishes | ≤ 8 attempts (2 s … 10 min backoff), then `callback_failed` (`$JS` ATTENTION parked-callbacks). After unblock: the API's stale-dispatched re-delivery (30 min) or a teacher retry re-arms it → confirmed |
| C8 | journal disk temporarily unavailable | stop the unit, `umount /data/smartassess-runner`, `systemctl start smartassess-runner` | **unit refuses to start** (`RequiresMountsFor` / preflight `journal`: "NOT mounted"); no write lands on the OS disk (immutable underlying dir). Remount → start → normal |

## Persistent journal checks
| Check | Procedure | Expected |
|---|---|---|
| restart process | `systemctl restart smartassess-runner` with a job `received` | resumed, executed once |
| reboot host | C5 | as C5 |
| duplicate job | teacher **retry** on a job already `confirmed` | Runner `202 duplicate`; API `alreadyApplied` / no second score |
| duplicate callback | C4 | one application (`alreadyApplied`) |
| late callback | C7 after a **force regrade** (new revision) | old revision's callback → API `409 STALE_RESULT` → Runner parks it (permanent); the new revision's score stands |
| stale revision | force regrade twice quickly | an older revision arriving later → Runner `409 STALE_REVISION` or `superseded`; never executed after a newer one |

## Disk-full behaviour (staging only: never fill a production disk)
1. On staging, fill the journal disk to below the preflight floor:
   `sudo -u smartassess-runner fallocate -l <size> /data/smartassess-runner/fill.bin` (leave < 1 GB / < 10 % free).
2. `readiness.sh` → `FAIL journal-disk` (exit 21): **degraded readiness**.
3. Submit an official job. If the disk is truly full, the journal write fails → `503 RUNNER_BUSY` → API `retryable`
   (no zero, no OS-disk fallback).
4. A restart is **refused** by the preflight until space is freed. `rm` the fill file → start → normal.
