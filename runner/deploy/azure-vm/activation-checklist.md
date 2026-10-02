# 17F-A Pilot Activation Checklist (23 steps): prepared in 17F-A1, executed in 17F-A2

**Do not execute in 17F-A1.** Each row is: step · command/action · expected result · rollback point · evidence to capture.

`⚠ USER/AZURE` = an external manual action. See [`a2-live-activation-checklist.md`](a2-live-activation-checklist.md).
Evidence is stored in the A2 activation record. **Never** paste keys into evidence.

| # | Step | Command / action | Expected result | Rollback point | Evidence |
|---|---|---|---|---|---|
| 1 | ⚠ USER/AZURE Provision VM + network | resource group, VNet/subnet, NSG (§3 README), Standard static public IP, **Standard_D4s_v5**, Ubuntu 24.04 LTS, SSH keys only | VM running; NSG: 443 any, 22 admin range only, nothing else | delete the resource group (no production impact) | VM size / image / NSG rules (screenshot or `az` JSON, no secrets) |
| 2 | ⚠ USER/AZURE Attach data disks | data disk A 32 GB (journal), B 64–128 GB (Docker), Premium SSD, host caching None/ReadOnly | two LUNs visible (`lsblk`) | detach disks | `lsblk -o NAME,SIZE,SERIAL` |
| 3 | ⚠ USER/AZURE DNS | `runner.<domain>` A → static IP | `dig +short runner.<domain>` = IP | remove the record | dig output |
| 4 | Host baseline | README §5.1 (upgrade, chrony) | `NTPSynchronized=yes` | — | `timedatectl` |
| 5 | Disks + mounts | README §5.2 (ext4, fstab by UUID, **no nofail**, `chattr +i` underlying dir, **no bind mounts**) | `findmnt` shows both; `findmnt -no SOURCE,MAJ:MIN / /data/smartassess-runner /var/lib/docker` shows **three different devices** (a mount point alone is not enough — three storage roles: OS, journal, Docker); reboot test keeps them | edit fstab back | `findmnt` (with MAJ:MIN), `/etc/fstab` |
| 6 | Docker Engine | README §5.3 (daemon.json, hold) | ≥ 20.10, cgroup v2, seccomp, no 2375/2376 | `apt-get remove docker-ce` | `docker info` line, `ss -ltn` |
| 7 | journald caps + Node 22 | README §5.4–5.5 | `node -v` ≥ 22.12; journald capped | — | versions |
| 8 | Service account | README §5.6 | user `smartassess-runner` (nologin) in `docker`; journal root `0700` owned by it | `userdel` | `id smartassess-runner`, `stat /data/smartassess-runner` |
| 9 | Deploy release | README §5.7 (tag → `/opt/smartassess-runner/<tag>`, root-owned, `current` symlink) | `DEPLOYED_SHA` = reviewed merge SHA | previous `current` | DEPLOYED_SHA |
| 10 | Worker images + Docker suites | README §5.8 | security (+ official) Docker suites green; manifest written; no leftover containers | rebuild | suite summary lines, manifest IDs |
| 11 | ⚠ USER Keys into the secret store | generate request key + callback key (independent, `openssl rand -hex 32`); sweep key already exists | 2 new secret-store entries | delete entries | entry **names** + creation time only |
| 12 | Env file | README §5.9 (root:root 0600) | `stat -c '%U %a'` = `root 600` | remove the file | stat output |
| 13 | Preflight (deep) | `sh runner/deploy/azure-vm/readiness.sh --deep` | every check PASS except liveness (not started); `storage` PASS = "three distinct devices" (exit 22 otherwise: journal / Docker on the OS disk, a bind mount, or journal and Docker on one disk); `images` PASS = "(match manifest)" | — | the PASS/FAIL list |
| 14 | systemd | README §5.11 (`systemd-analyze verify`, `enable --now`) | `active (running)`; `runner.gateway.started` with `journal:"durable"`, official enabled | `systemctl disable --now smartassess-runner` | status + started event |
| 15 | Caddy + TLS | README §5.12 | `caddy validate` OK; `https://runner.<domain>/healthz` = `{"ok":true}`, valid certificate | `systemctl stop caddy` | curl -v (certificate issuer / expiry) |
| 16 | Exposure check | from outside: `nc -vz <ip> 8787`, `nc -vz <ip> 2375` | both fail | — | nc output |
| 17 | Remote signed smoke | `smoke.js runner` (README §5.14) | `SMOKE OK` (surface, security, language matrix, sandbox boundary) | — | smoke output |
| 18 | ⚠ USER/AZURE SWA settings (disabled) | order 1–3 of README §5.15 (**`CODING_RUNNER_ENABLED=false` first**); verify Gate PV (previews) | settings saved; student capabilities = unavailable | delete the settings | setting **names** (no values) |
| 19 | Gate P2 callback | on the VM: `SMARTASSESS_CALLBACK_*` from the env file → `smoke.js callback --near-max` | 3 × PASS (`404 UNKNOWN_JOB` ×2, `401` ×1) | — | smoke output |
| 20 | ⚠ USER/AZURE Activate | `CODING_RUNNER_ENABLED=true` | test student: capabilities list python / java / csharp | **`CODING_RUNNER_ENABLED=false`** | capabilities response |
| 21 | Gate P1 end to end + practice | smoke-matrix.md §P1 + practice rows | every legitimate run ≤ 40 s end to end; else **Java/C# practice NOT activated** (decision recorded) | `CODING_RUNNER_ENABLED=false` | timings table |
| 22 | Official matrix + recovery test | smoke-matrix.md §Official, §Recovery | official scores exactly as expected, applied once; Runner-down submission → retryable → recovered, no false zero | force regrade / manual review | gradebook + journal-status + audit events |
| 23 | Monitoring + first pilot class | monitoring-checklist.md; enable alerts; ≤ 64 jobs per burst, Java/C# ≥ 2000 ms | alerts firing on test; pilot running | `CODING_RUNNER_ENABLED=false` | alert test, first-day journal-status |
