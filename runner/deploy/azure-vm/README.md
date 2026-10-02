# SmartAssess Coding Runner — Azure VM Pilot Deployment Runbook (Phase 17F-A1)

The **one canonical runbook** for deploying the Coding Runner Gateway on **one dedicated Azure Linux VM** for the controlled
production pilot. It is written so an operator needs no tribal knowledge. Phase 17F-A1 only *prepares* this package. The live
Azure actions belong to **Phase 17F-A2** ([`a2-live-activation-checklist.md`](a2-live-activation-checklist.md)) and need the
owner's approval.

> **DO NOT put secrets in the repository.** Keys live only in the secret store, in `/etc/smartassess-runner/runner.env`
> (root:root 0600) on the VM, and in the SmartAssess app settings. Every template here leaves secret values **empty**.
>
> **PR preview environments must not receive production Runner keys.** Production, staging/pilot and PR previews each get
> their own configuration (§2.3).

## 0. Architecture (unchanged; the Runner executes, SmartAssess grades)

```
SmartAssess API ──signed request (SA-CODING-RUNNER-1)──▶ https://runner.<domain> :443
   ▲                                                       │ Caddy (TLS, 3 MiB body cap, 90 s upstream timeout, 4 routes only)
   │                                                       ▼
   │                                              127.0.0.1:8787  Node Runner Gateway  (systemd, user smartassess-runner)
   │                                                       │ docker CLI → unix socket (never TCP)
   │                                                       ▼
   │                                              hardened worker containers (--network none, read-only, uid 10001, …)
   │                                                       │ raw execution evidence (never a score)
   └────────── signed callback (SA-CODING-CALLBACK-1) ─────┘
SmartAssess API = the ONLY official grading authority (compares, weights, scores, applies once).
```

## 1. Pilot guardrails (not school-scale capacity)

| Guardrail | Why (code fact) |
|---|---|
| **≤ 64 official jobs** in one submission burst (students × coding questions) | `RUNNER_OFFICIAL_MAX_PENDING` is capped at 64. Overflow becomes `retryable RUNNER_BUSY`, which is never a zero but recovers slowly (§8). |
| **≈ 1,000 official jobs per rolling day** | The journal holds ≤ 1,024 records, and a confirmed record keeps its slot for 24 h. |
| **Java / C# questions: official time limit ≥ 2000 ms** (pilot authoring policy) | JVM / .NET start-up counts inside the measured time (the exec marker is written before `execve`). Below ~1 s a correct program can time out. |
| **Worst-case sandbox containers < vCPU count** | Time limits are wall-clock. The preflight enforces it (`capacity` check): pilot = 1 practice + 2 official = 3 < 4 vCPU. |
| One VM, one gateway process, one journal | The journal lock allows one gateway per directory; there is no multi-node routing. |

These limits are **not** fixed here. They are the Phase 17F-B backlog ([`known-limits-17f-b-backlog.md`](known-limits-17f-b-backlog.md)).

## 2. Azure Static Web Apps constraints and pilot gates

### 2.1 45-second API request limit — Pilot Gate **P1**
Azure Static Web Apps managed APIs have a **maximum request duration of 45 seconds**. A practice run is synchronous:
browser → SWA API (`/api/coding/run`, 60 s runner timeout in code) → Runner → Docker → back. The Runner's worst *hard
walls* for Java / C# add up to about 50 s (compile wall 30 s + run wall 20 s). Those are kill limits, not legitimate durations.

- **Measured, Runner leg only** (A1 development container, 4 vCPU, real Docker), near-worst legitimate requests
  (`timeMs` 10000, a program busy for 8.5 s, Java / C# sources near the 64 KB cap):
  **Python 9.0 s · Java 10.7 s · C# 10.9 s.**
- **Still required (A2):** measure the **whole** path from the browser as the test student, with the same programs (§10.3). Pass
  criterion: every legitimate request completes in **≤ 40 s** end to end.
- **If a legitimate Java / C# practice request can exceed the 45 s ceiling: DO NOT ACTIVATE JAVA/C# PRACTICE IN PRODUCTION**
  until a separate design decision is made. Caddy's timeout cannot extend the SWA limit upstream. Do not "fix" this with
  proxy timeouts.
- Official grading is **not** affected: dispatch answers `202` within milliseconds, and results come back by callback.

### 2.2 30 MB request size — Pilot Gate **P2** (callback size)
The SWA request size limit is **30 MB**. The largest official callback the gateway can produce is 50 cases × (17,408 B stdout
+ 4,096 B stderr), worst-case JSON-escaped ≈ **6.45 MB** (the gateway and the API both cap the callback at 8 MiB). That is below
the quota. Do not raise payload limits because the quota would allow it.

Gate P2:
1. `smoke.js callback --near-max` sends a signed ≈ 6.45 MB callback for an unknown job. `404 UNKNOWN_JOB` means it was
   **accepted, authenticated, validated, and nothing was applied**.
2. Then one real large-output official job through the test assignment (§10.4) must be **applied once**.

### 2.3 Environment-specific settings — Pilot Gate **PV** (previews)
| Environment | Runner settings |
|---|---|
| **Production** | production Runner URL + production keys (`CODING_RUNNER_*`, `CODING_GRADING_CALLBACK_HMAC_KEY`) |
| **Staging / pilot rehearsal** | a staging Runner (`runner-staging.<domain>`) + **independent** keys + its own callback target and storage |
| **PR preview environments** | **Runner disabled**: `CODING_RUNNER_ENABLED=false`, no Runner URL, no Runner keys |

The repository holds **no** Runner configuration for any environment: no key, URL or flag in `staticwebapp.config.json`, the
workflows or the code. The API is **fail-closed by default**: with no `CODING_RUNNER_URL` / key, practice is `503
EXECUTION_UNAVAILABLE` and official targets stay `retryable` (never a zero).

The repository cannot set Azure app settings per environment. A2 must verify in the portal that PR preview environments do
**not** inherit the production Runner settings. If they would, explicitly set `CODING_RUNNER_ENABLED=false` for previews, or
disable preview environments, **before** any production key is added.

## 3. Host design

| | Pilot (this runbook) | School production (future, capacity planning only) |
|---|---|---|
| VM | **Standard_D4s_v5** (4 vCPU, 16 GiB), Ubuntu Server **24.04 LTS** | Standard_D8s_v5 (8 vCPU, 32 GiB) |
| Concurrency | `RUNNER_MAX_CONCURRENCY=1`, official `MAX_ACTIVE=1`, `CASE_CONCURRENCY=2` → ≤ 3 containers | e.g. `RUNNER_MAX_CONCURRENCY=5` → ≤ 7 < 8 (the preflight decides) |
| Never | B-series (CPU credits throttle → false timeouts), the Azure temporary disk, a shared host | same |

### Disks (three responsibilities)
| Disk | Mount | FS | Purpose |
|---|---|---|---|
| OS disk (64 GB Premium SSD) | `/` | ext4 | OS, Node, `/opt/smartassess-runner` code, journald |
| Data disk A (32 GB Premium SSD) | **`/data/smartassess-runner`** | ext4 | **the Runner journal only** (`RUNNER_JOURNAL_DIR`) |
| Data disk B (64–128 GB Premium SSD) | `/var/lib/docker` | ext4 | Docker images and container layers |

The journal must **never** silently fall back to the OS disk. Four independent barriers enforce that:
1. systemd `RequiresMountsFor=/data/smartassess-runner` (the unit will not start without the mount);
2. the preflight `journal` check (the path must be **exactly** a mount point of ext4/xfs, not a symlink, owned, 0700, writable);
3. the preflight `storage` check (17F-A1.1): **a mount point alone is NOT enough.** From `/proc/self/mountinfo` the three
   storage roles must sit on three **distinct backing devices** — journal ≠ OS disk, Docker root ≠ OS disk, journal ≠ Docker —
   and the journal path must be the filesystem mount of its own device. A **bind mount from the OS disk does not qualify**
   (`mount --bind /srv/journal /data/smartassess-runner` is a mount point in `findmnt` / `df` and still writes to the OS disk);
   a `DockerRootDir` that resolves to `/` is refused; a journal placed on the Docker disk (or Docker inside the journal disk) is
   refused. Exit `22`, operator message "Journal storage must be on a dedicated device separate from the OS disk." / "Docker
   storage must be mounted on a dedicated device separate from the OS disk." / "Journal and Docker storage must not share the
   same backing device.";
4. the immutable underlying directory (§5.2: if the disk is ever unmounted, nothing can write into the OS-disk directory).

**Activation requires three distinct storage roles — OS, journal, Docker — on three distinct devices.** `findmnt` showing a
mount point proves barrier 1 only; `sh runner/deploy/azure-vm/readiness.sh --deep` (checklist row 13) proves barrier 3.

### Network
| Direction | Rule |
|---|---|
| Inbound **443/tcp** | Internet → Caddy (required) |
| Inbound 80/tcp | optional. Only for ACME HTTP-01 and the automatic HTTP → HTTPS redirect. TLS-ALPN-01 works on 443 alone. |
| Inbound 22/tcp | **only** from the trusted admin IP/range (or Azure Bastion / JIT). Never `Any`. |
| Inbound **8787, 2375, 2376** and everything else | **denied** (the gateway binds 127.0.0.1; Docker uses its unix socket only) |
| Outbound 443 | the SmartAssess host (callbacks), Ubuntu / Docker / NodeSource apt mirrors, the ACME CA, and the image registries during image builds (`public.ecr.aws`, `mcr.microsoft.com`) |
| Worker containers | `--network none`: no network at all |

**DNS:** `runner.<domain>` A record → the static public IP. **Never a raw-IP endpoint.**

## 4. What is in this directory

| File | Purpose |
|---|---|
| `README.md` | this runbook |
| `activation-checklist.md` | the 23-step executable activation checklist (step · action · expected · rollback point · evidence) |
| `a2-live-activation-checklist.md` | every **USER/AZURE ACTION REQUIRED** for Phase 17F-A2 |
| `rollback.md` | exact rollback procedure |
| `smoke-matrix.md` | language + security smoke matrices, Gates P1 / P2 |
| `crash-tests.md` | crash / restart / journal / disk-full procedures (staging / pilot rehearsal) |
| `monitoring-checklist.md` | pilot monitoring, alerts, log queries, recovery freshness |
| `known-limits-17f-b-backlog.md` | known limits + the Phase 17F-B backlog (B1–B10) |
| `smartassess-runner.service` | systemd unit (preflight gate, mounts required, dedicated user, hardening) |
| `Caddyfile.example` | TLS reverse proxy (4 routes → 127.0.0.1:8787, 3 MiB, 90 s, header-free access log) |
| `runner-env.example` | environment template (**no secret values**) |
| `docker-daemon.json.example` | `/etc/docker/daemon.json` (unix socket only, local log driver) |
| `journald-smartassess-runner.conf` | journald caps (`/etc/systemd/journald.conf.d/`) |
| `preflight.js` | start / readiness / verify-sandbox gate (exit codes below) |
| `mountinfo.js` | pure `/proc/self/mountinfo` reader: device identity of the OS / journal / Docker storage roles, bind-mount detection (preflight `storage` check, 17F-A1.1) |
| `image-manifest.js` | the one structural contract of the worker image manifest, shared by `record-images.js` (writer) and the preflight (reader) (17F-A1.1) |
| `docker-api.js` | read-only Docker Engine API client (GET only, unix socket only, allow-listed endpoints). The tools start **no process**: `gateway/sandbox.js` stays the only process-starting module of `runner/` (architecture guard 17B R1) |
| `readiness.sh` | runs the preflight in the exact service context (`systemd-run`) |
| `smoke.js` | signed smoke tool: Runner surface, language matrix, sandbox boundary, Gate P1, callback probe (Gate P2) |
| `journal-status.js` | local diagnostics: journal state counts only |
| `recovery-freshness.js` | last successful recovery sweep (GitHub API) vs the agreed maximum interval |
| `build-and-record-images.sh` / `record-images.js` | build via `runner/scripts/build-images.sh`, run the Docker suites, record image IDs |
| `sweep-containers.js` | `ExecStopPost`: removes leftover sandbox containers (the gateway's own label sweep) |

Worker images (exactly `runner/gateway/registry.js`): `smartassess-coding-python:17c-v1`, `smartassess-coding-java:17c-v1`,
`smartassess-coding-csharp:17c-v1`. They are built from digest-pinned official bases by `runner/scripts/build-images.sh`.

### Preflight exit codes
`0` ok · `2` usage · `10` Node version · `11` env-file permissions · `12` runner configuration · `13` keys · `14` callback URL ·
`15` bind · `16` capacity (vCPU / memory) · `20` journal (mount / symlink / fs / owner / mode / writable) · `21` journal free
space · `22` storage device separation (journal / Docker / OS on three distinct devices, no bind mount; fails closed when
`/proc/self/mountinfo` is unreadable) · `30` Docker daemon (reachable, ≥ 20.10, cgroup v2, seccomp) · `31` Docker disk free
space · `32` worker images / manifest (missing image, drift, or a manifest that is not exactly `{ "schemaVersion": 1, "images":
{ "<registry image>": "sha256:<64 hex>" } }` for all three images) · `33` sandbox controls · `40` port in use · `41` exposure
(Docker TCP 2375/2376, public 8787) · `42` liveness.
Output names the check and a reason. It never prints a key, a key-derived value, student code or program output.

## 5. Runbook

Commands run as root on the VM unless noted. `<domain>`, `<release-tag>` and `<admin-ip>` are placeholders.

### 5.1 VM prerequisites (A2: VM created per §3 — USER/AZURE ACTION REQUIRED)
```sh
lsb_release -ds                       # Ubuntu 24.04.x LTS
nproc; free -g                        # 4 vCPU, 16 GiB (pilot)
apt-get update && apt-get -y full-upgrade && apt-get -y install chrony jq ca-certificates curl gnupg
timedatectl show -p NTPSynchronized   # NTPSynchronized=yes  (signatures allow ±60 s / ±300 s of skew)
```

### 5.2 Disk preparation and journal mount
```sh
lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,SERIAL       # identify the two data disks by SIZE / LUN — never format the OS disk
mkfs.ext4 -L sa-journal /dev/disk/azure/scsi1/lun0      # data disk A (journal)   — adjust to the LUN shown in the portal
mkfs.ext4 -L sa-docker  /dev/disk/azure/scsi1/lun1      # data disk B (Docker)
mkdir -p /data/smartassess-runner /var/lib/docker
chattr +i /data/smartassess-runner                      # immutable while UNMOUNTED: nothing can ever write the OS-disk copy
blkid -s UUID -o value /dev/disk/azure/scsi1/lun0       # → <uuid-journal>
blkid -s UUID -o value /dev/disk/azure/scsi1/lun1       # → <uuid-docker>
cat >> /etc/fstab <<'EOF'
UUID=<uuid-journal> /data/smartassess-runner ext4 defaults,noatime,x-systemd.device-timeout=60s 0 2
UUID=<uuid-docker>  /var/lib/docker          ext4 defaults,noatime,x-systemd.device-timeout=60s 0 2
EOF
systemctl daemon-reload && mount -a
findmnt /data/smartassess-runner && findmnt /var/lib/docker   # both mounted, ext4
findmnt -no SOURCE,MAJ:MIN / /data/smartassess-runner /var/lib/docker   # three DIFFERENT devices (MAJ:MIN), three different sources
```
**Never** add `nofail`. A missing journal disk must stop the Runner, not move the journal.
**Never** satisfy the mount with a bind mount (`mount --bind`) or a directory of the OS disk: the preflight `storage` check
(exit 22) reads `/proc/self/mountinfo` and refuses a journal or Docker root that shares the OS disk's device, a journal that is
a bind mount, and a journal that shares the Docker disk. Three roles, three devices — a mount point alone is not enough.

### 5.3 Docker Engine
Install Docker Engine from Docker's official apt repository (docs.docker.com → "Install Docker Engine on Ubuntu"). Then:
```sh
install -m 0644 runner/deploy/azure-vm/docker-daemon.json.example /etc/docker/daemon.json
dockerd --validate --config-file /etc/docker/daemon.json && systemctl restart docker
docker info --format '{{.ServerVersion}} cgroup v{{.CgroupVersion}} {{.SecurityOptions}} {{.DockerRootDir}}'
#   ≥ 20.10 (the sandbox uses --pull never, --read-only, --cap-drop ALL, no-new-privileges, --pids-limit, --memory/--memory-swap,
#   --cpus, --user, --tmpfs uid/gid, --network none); cgroup v2; seccomp; /var/lib/docker
ss -ltnp | grep -E ':(2375|2376)\b' && echo "STOP: Docker on TCP"   # must print nothing
apt-mark hold docker-ce docker-ce-cli containerd.io                  # upgrade only in a maintenance window (§5.15)
```

### 5.4 journald caps
```sh
install -D -m 0644 runner/deploy/azure-vm/journald-smartassess-runner.conf /etc/systemd/journald.conf.d/smartassess-runner.conf
systemctl restart systemd-journald && journalctl --disk-usage
```

### 5.5 Node.js 22 LTS
Install Node 22 (NodeSource apt repository or the official tarball) so that `/usr/bin/node` exists:
`node -v` must be ≥ the Runner's `engines` requirement (22.12). Then `apt-mark hold nodejs`.

### 5.6 Service account
```sh
useradd --system --no-create-home --home-dir /var/lib/smartassess-runner --shell /usr/sbin/nologin smartassess-runner
usermod -aG docker smartassess-runner
chattr -i /data/smartassess-runner 2>/dev/null; chown smartassess-runner:smartassess-runner /data/smartassess-runner && chmod 0700 /data/smartassess-runner
```
(`chattr -i` is a no-op on the mounted ext4 root. The immutable flag stays on the *underlying* OS-disk directory.)

**Docker access is root-equivalent.** Membership of `docker` lets a process start privileged containers, so a compromised
gateway equals a compromised host. This is accepted **only** because the VM is dedicated: no other application, no SmartAssess
data, no other secrets, and no interactive users besides the administrators. The gateway itself never passes anything except
its fixed hardened `docker run` argv (`runner/gateway/sandbox.js`). Never run the gateway as root, and never add the service
user to `sudo`.

### 5.7 Deploy the release (code is root-owned and read-only for the service)
```sh
install -d -m 0755 /opt/smartassess-runner
git clone --depth 1 --branch <release-tag> https://github.com/<owner>/<repo>.git /opt/smartassess-runner/<release-tag>
git -C /opt/smartassess-runner/<release-tag> rev-parse HEAD > /opt/smartassess-runner/<release-tag>/DEPLOYED_SHA
chown -R root:root /opt/smartassess-runner/<release-tag> && chmod -R go-w /opt/smartassess-runner/<release-tag>
ln -sfn /opt/smartassess-runner/<release-tag> /opt/smartassess-runner/current
```
The Runner has **zero npm dependencies**, so there is no `npm install` on the host.

### 5.8 Worker images
```sh
install -d -m 0755 /etc/smartassess-runner
cd /opt/smartassess-runner/current && sh runner/deploy/azure-vm/build-and-record-images.sh /etc/smartassess-runner/images.manifest
```
This builds the three images with the existing pipeline, runs the real-Docker security suite (and the official suite when
`api/node_modules` is present), checks that no sandbox container is left behind, and records the image IDs. The preflight
refuses to start the gateway if an image is missing or differs from this manifest — or if the manifest is not structurally exact
(`{ "schemaVersion": 1, "recordedAt": "<ISO>", "images": { "<registry image>": "sha256:<64 hex>" } }` with all three registry
images, no unknown keys, no empty or duplicated ids): `{}`, `[]`, `{"schemaVersion":1}` or a hand-edited file exit 32
(`image manifest invalid: <reason>`). The writer (`record-images.js`) validates with the same `image-manifest.js` contract.

### 5.9 Environment file
```sh
install -o root -g root -m 0600 /opt/smartassess-runner/current/runner/deploy/azure-vm/runner-env.example /etc/smartassess-runner/runner.env
${EDITOR:-vi} /etc/smartassess-runner/runner.env   # paste the keys from the secret store; set SMARTASSESS_CALLBACK_BASE_URL
```

**Key relationships (verified in code):**

| Runner (`runner.env`) | equals | SmartAssess API setting |
|---|---|---|
| `RUNNER_HMAC_KEY` | == | `CODING_RUNNER_HMAC_KEY` |
| `SMARTASSESS_CALLBACK_HMAC_KEY` | == | `CODING_GRADING_CALLBACK_HMAC_KEY` |
| (not on the Runner) | | `CODING_GRADING_SWEEP_HMAC_KEY` == GitHub secret of the same name |

All three keys are **different** from each other. The gateway refuses to start when the request key equals the callback key.
The API refuses callbacks (503) when they are equal, and refuses sweeps when the sweep key equals either. The preflight refuses
all of these and also placeholders. **Do not generate or rotate keys as part of 17F-A1.**

### 5.10 Preflight (before the first start)
```sh
sh /opt/smartassess-runner/current/runner/deploy/azure-vm/readiness.sh --deep   # liveness fails (not started yet); every other check must PASS
```
Fix every `FAIL`. The run proves the container controls inside **real** sandboxes for all three languages: uid 10001, no
capabilities, no-new-privileges, seccomp, read-only rootfs, network none, no host mounts, no Docker socket, pids / memory / CPU
bounded.

### 5.11 systemd service (the operator enables it; nothing in the repository does)
```sh
install -m 0644 /opt/smartassess-runner/current/runner/deploy/azure-vm/smartassess-runner.service /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/smartassess-runner.service
systemctl daemon-reload
systemctl enable --now smartassess-runner          # boot start + start now (ExecStartPre = the preflight gate)
systemctl status smartassess-runner --no-pager
journalctl -u smartassess-runner -o cat -n 50      # runner.preflight.* PASS lines, then runner.gateway.started:
#   officialGrading.enabled true, journal "durable", sweptContainers 0, recovery.staleLock null (or "previous-boot" after a reboot)
```
| Operation | Command | Behaviour |
|---|---|---|
| stop | `systemctl stop smartassess-runner` | SIGTERM to the gateway: the official queue stops (running jobs resume from the journal at the next start), in-flight practice requests finish (≤ 90 s), leftovers are SIGKILLed and swept |
| restart | `systemctl restart smartassess-runner` | stop + preflight + start; the startup journal recovery is logged as `coding.runner.journal.recovered` |
| boot | `WantedBy=multi-user.target` | starts after Docker **and** both mounts; a stale journal lock from the previous boot is replaced automatically |
| crash | `Restart=on-failure`, 10 s | at most 5 starts per 10 min, then the unit stays failed (alert) |

### 5.12 Caddy and TLS
Install Caddy from its official apt repository. Then:
```sh
install -m 0644 /opt/smartassess-runner/current/runner/deploy/azure-vm/Caddyfile.example /etc/caddy/Caddyfile
sed -i 's/runner\.example\.invalid/runner.<domain>/; s/ops@example\.invalid/<ops-mailbox>/' /etc/caddy/Caddyfile
install -d -o caddy -g caddy -m 0750 /var/log/caddy
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
curl -sS https://runner.<domain>/healthz           # {"ok":true}   (after DNS + NSG: A2)
```
Certificates are obtained and renewed automatically (ACME). HTTP is redirected to HTTPS when port 80 is open.

### 5.13 Local readiness
```sh
sh /opt/smartassess-runner/current/runner/deploy/azure-vm/readiness.sh          # every check PASS, liveness PASS
sudo -u smartassess-runner node /opt/smartassess-runner/current/runner/deploy/azure-vm/journal-status.js --dir=/data/smartassess-runner
```

### 5.14 Remote readiness and smoke (from the operator's admin machine, keys from the secret store)
```sh
# keys are exported into the shell from the secret store — never typed into a command line that is logged
RUNNER_URL=https://runner.<domain> RUNNER_HMAC_KEY="$K" node runner/deploy/azure-vm/smoke.js runner           # surface + matrix + sandbox
RUNNER_URL=https://runner.<domain> RUNNER_HMAC_KEY="$K" node runner/deploy/azure-vm/smoke.js runner --gate-p1 # Runner leg of Gate P1
nc -vz -w 3 <public-ip> 8787 ; nc -vz -w 3 <public-ip> 2375   # both must FAIL (filtered / refused)
```

### 5.15 SmartAssess (SWA) configuration — order matters (A2: USER/AZURE ACTION REQUIRED)
| Order | Setting | Class |
|---|---|---|
| 1 | `CODING_RUNNER_ENABLED=false` | **activation switch / rollback variable**. Add first. |
| 2 | `CODING_GRADING_CALLBACK_HMAC_KEY` | safe while disabled (only verifies callbacks) |
| 3 | `CODING_RUNNER_HMAC_KEY`, `CODING_RUNNER_URL=https://runner.<domain>` (no path) | safe while disabled |
| 4 | Gate P2: `smoke.js callback --near-max` from the VM | must be `404 UNKNOWN_JOB` |
| 5 | `CODING_RUNNER_ENABLED=true` | **activation** |
| — | `CODING_GRADING_SWEEP_HMAC_KEY` + GitHub `SMARTASSESS_GRADING_SWEEP_URL` / secret | already configured (17F-A audit: sweeps return HTTP 200) |

`CODING_RUNNER_ENABLED` is read by `api/src/lib/coding/runner-config.js`:
- `"false"` / `"0"` → disabled;
- `"true"` / `"1"` / unset → enabled when URL + key are valid;
- anything else → disabled (malformed).

Callback verification does **not** depend on it, so callbacks for jobs already dispatched are still applied while it is `false`.

### 5.16 Smoke, Gate P1 end to end, official matrix and recovery test
Follow [`smoke-matrix.md`](smoke-matrix.md) (one teacher, one test student, one test assignment).

### 5.17 Rollback
[`rollback.md`](rollback.md). Primary rollback: `CODING_RUNNER_ENABLED=false` on the API.

## 6. Logs (journald)

The gateway writes single-line JSON events to stdout → journald (capped by `journald-smartassess-runner.conf`).

**Audited (17F-A1):**
- Logged: request ids, opaque job ids, language, status / exit classification, durations, callback attempt / status / error
  class, recovery and journal events.
- **Never logged:** keys, signatures or auth headers, student source, stdin, stdout / stderr, expected outputs.
- The docker CLI's stderr is drained, never logged. Caddy's access log deletes request and response headers.
- No unsafe logging was found, so there is no deployment blocker.

```sh
journalctl -u smartassess-runner -o cat --since "1 hour ago" | jq -c 'select(.event | test("callback|official|journal"))'
journalctl -u smartassess-runner -o cat | jq -c 'select(.event=="coding.runner.callback.failed" or .event=="runner.official.busy")'
journalctl -u smartassess-runner -o cat | jq -c 'select(.event=="runner.request.unauthorized") | .reason' | sort | uniq -c
journalctl -u smartassess-runner -p warning --since today
journalctl --disk-usage
```

## 7. Monitoring
[`monitoring-checklist.md`](monitoring-checklist.md).

## 8. Recovery sweep — GitHub cron is best-effort
`.github/workflows/coding-grading-recovery.yml` is scheduled every 10 minutes, but GitHub runs scheduled workflows on a
best-effort basis: **3 runs were observed in ~9.5 hours** (17F-A audit). The pilot therefore:
- treats the cron as a **safety net**, not a guarantee;
- checks freshness with `recovery-freshness.js` (alert if no successful sweep within the agreed **240 min**);
- uses `workflow_dispatch` (Actions → Coding Grading Recovery → Run workflow) or teacher **retry / bulk retry** when recovery
  is needed sooner.

A more reliable scheduler is backlog item **B5** (17F-B). This phase does not change the scheduler.

## 9. Upgrades (no drain API exists — 17F-B)
1. Choose a window outside exams.
2. Set `CODING_RUNNER_ENABLED=false` on the API.
3. Wait until `journal-status.js` shows `received 0 · running 0 · executed 0`.
4. Snapshot the journal disk.
5. Deploy the new release (§5.7), rebuild and record images if the workers changed (§5.8), `ln -sfn` the new release, then `systemctl restart smartassess-runner`.
6. Run `readiness.sh --deep`, then `smoke.js runner`.
7. Set `CODING_RUNNER_ENABLED=true`, and run teacher **bulk retry** for affected assignments.

Docker and Node upgrades follow the same window (`apt-mark unhold … && apt-get install … && apt-mark hold …`).

## 10. Key rotation (not in 17F-A1)
Single key per direction; no dual-key support. A rotation is a short coordinated window:
1. Disable via `CODING_RUNNER_ENABLED=false`.
2. Change both sides.
3. Restart the Runner.
4. Re-enable.
5. Bulk retry.

Callbacks rejected during the window are parked on the Runner and re-armed by the API's next delivery. No evidence is lost.
