# SmartAssess Coding Runner — Production Deployment on Azure (dedicated Linux VM)

Deployment and operations plan only. It changes no application, runner, grading, durability or callback code.
Baseline audited: `origin/main` = `a6e26acbd3dc505031162a97847ba40480254e02`.
This document never contains a secret. Every `<…>` value is filled in by the operator at deployment time.

---

## 0. How the Runner actually works (audit of the code)

| Fact | Source |
|---|---|
| Entry point is `node gateway/main.js` (`npm --prefix runner start`). Node ≥ 22.12, **no npm dependencies** (Node built-ins only). | `runner/package.json`, `runner/README.md` |
| Binds `RUNNER_HOST` (default `127.0.0.1`) : `RUNNER_PORT` (default `8787`). Plain HTTP; TLS is expected from a reverse proxy. | `gateway/main.js` |
| Routes: `GET /healthz` (unauthenticated, `{ok:true}`), signed `GET /v1/capabilities`, signed `POST /v1/execute`, signed `POST /v1/official-grading-jobs`. Everything else is `404`. | `gateway/server.js` |
| Body caps: 512 KiB (`/v1/execute`), 2 MiB (`/v1/official-grading-jobs`). Node `requestTimeout` 120 s, `headersTimeout` 15 s. | `gateway/server.js` |
| Auth `SA-CODING-RUNNER-1`: HMAC-SHA256 over method, **logical path** (`url.pathname`), timestamp (±60 s), request id, body hash. The replay guard lives in process memory. | `gateway/auth.js`, `api/src/lib/coding/runner-protocol.js` |
| The **only** process launcher is `sandbox.js`: it `spawn`s the **`docker` CLI** (`shell:false`, fixed argv). The CLI talks to the **host Docker daemon** over the default socket (`DOCKER_HOST` is passed through only if you set it). The env is allow-listed (`PATH`, `HOME`, `DOCKER_HOST`), so the keys never reach the CLI. | `gateway/sandbox.js` |
| Every sandbox gets: `docker run --rm -i --name sa-coding-<hex> --label smartassess.coding-runner=1 --pull never --network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 10001:10001 --pids-limit 128 --cpus 1 --memory=X --memory-swap=X --ulimit core=0:0 --ulimit nofile=1024:1024 --tmpfs /workspace(32m,noexec) --tmpfs /tmp(64m,noexec) --log-driver none <image>`. No mounts, no volumes, no env, no socket. | `gateway/sandbox.js` `buildDockerRunArgs` |
| Cleanup: `docker kill <name>` when the wall clock is hit, `docker rm -f <name>` always, and a **startup sweep** that removes every container with label `smartassess.coding-runner=1`. | `gateway/sandbox.js`, `gateway/main.js` |
| Images (fixed tags, `--pull never`): `smartassess-coding-python:17c-v1`, `smartassess-coding-java:17c-v1`, `smartassess-coding-csharp:17c-v1`. They are built locally by `npm --prefix runner run build:images` (`docker build --network none`). The bases are digest-pinned (`public.ecr.aws/docker/library/python`, `…/eclipse-temurin`, `mcr.microsoft.com/dotnet/sdk`). | `gateway/registry.js`, `scripts/build-images.sh`, `workers/*/Dockerfile` |
| Memory ceilings (cgroup): Java compile **768 MiB**, C# compile **1024 MiB**. Runtime = question `memoryMb` (≤ 512) + 128 (Java) / 96 (C#) / 64 (Python). tmpfs is charged inside the same cgroup. | `gateway/registry.js` |
| Practice concurrency: `RUNNER_MAX_CONCURRENCY` (1..16, default 2). Beyond it the gateway answers `503 RUNNER_BUSY` immediately (no queue). A practice run uses **one container at a time** (compile, then run). | `gateway/main.js`, `gateway/server.js` |
| Official grading: a bounded **in-memory** queue. `RUNNER_OFFICIAL_MAX_PENDING` (1..64, default 8), `RUNNER_OFFICIAL_MAX_ACTIVE` (1..4, default 1), `RUNNER_OFFICIAL_CASE_CONCURRENCY` (1..4, default 2). The hidden-case runtime containers also pass through a **global slot pool fixed at 2** (`createDockerSandbox()` is called without `officialMaxContainers`), so case concurrency above 2 has no effect today. Each job's hard wall is ≤ 20 min. Results are cached in memory for 1 h (≤ 512 entries). | `gateway/official.js`, `gateway/sandbox.js`, `gateway/main.js` |
| Callback: `POST <SMARTASSESS_CALLBACK_BASE_URL>/api/coding/grade-callback`, signed `SA-CODING-CALLBACK-1` with its own key, 15 s timeout, up to 6 attempts with backoff, **redirects refused**. The base URL must be `https://` with no path, query or credentials. A key equal to `RUNNER_HMAC_KEY` makes the gateway **refuse to start**. | `gateway/callback.js`, `gateway/main.js` |
| Logs: one JSON line per event on stdout/stderr. They contain request id, job id, language, status, counts and durations, **never** source, stdin, stdout, stderr, keys or signatures. | `gateway/*.js` |
| Graceful stop: `SIGTERM` → `server.close()` → exit. In-flight official jobs, the result cache and the replay guard **are lost on any restart** (this is the 17D-B2 durability gap; 17D-A recovery re-dispatches `dispatched` targets after 30 min). | `gateway/main.js`, `docs/enterprise-coding-assessment-17d-a.md` §4 |
| API side (Static Web App **managed** Functions, `api_location: api`): `CODING_RUNNER_URL` (https origin), `CODING_RUNNER_HMAC_KEY`, optional kill switch `CODING_RUNNER_ENABLED`, `CODING_GRADING_CALLBACK_HMAC_KEY`, `CODING_GRADING_SWEEP_HMAC_KEY`. Dispatch timeout 8 s, execute timeout 60 s, capabilities 5 s, all with `redirect:"error"`. | `api/src/lib/coding/*.js`, `.github/workflows/azure-static-web-apps-*.yml` |

**Hard host requirements derived from the code:** a host Docker daemon reachable by a local `docker` CLI; cgroup-enforced
`--memory/--memory-swap/--cpus/--pids-limit`; `--network none`, `--read-only`, `--cap-drop`, `no-new-privileges`, tmpfs
mounts; the ability to create, kill and force-remove sibling containers by name and label; local image builds that pull
digest-pinned bases; Node.js ≥ 22.12; a loopback HTTP listener behind TLS; and (for 17D-B2) a durable local filesystem.

---

## 1. Azure hosting decision

### 1.1 Compatibility matrix (current Runner, no redesign)

| Requirement | Linux VM | Container Apps (ACA) | Container Instances (ACI) | App Service (Linux / containers) | AKS |
|---|---|---|---|---|---|
| Host Docker daemon + `docker` CLI | ✅ install Docker Engine | ❌ no daemon, no socket | ❌ no daemon, no socket | ❌ no daemon, no socket | ⚠️ nodes run containerd, not Docker. Docker only through privileged DinD or a host-socket mount, both = node root |
| Spawn disposable **sibling** containers per execution | ✅ | ❌ containers are declared via ARM/revisions. Dynamic Sessions is a different HTTP API (redesign) | ❌ each container group is an ARM deployment taking seconds to minutes (redesign) | ❌ | ⚠️ only by rewriting `sandbox.js` to create Pods/Jobs (redesign) or by privileged DinD |
| Privileged / DinD as a workaround | n/a (not needed) | ❌ privileged containers not supported | ❌ not supported | ❌ not supported | ⚠️ possible, but a privileged pod is node-root and weakens isolation |
| Per-container cgroup `--memory`, `--memory-swap`, `--cpus`, `--pids-limit` | ✅ cgroup v2 | ❌ (app-level limits only) | ❌ (group-level only) | ❌ | ⚠️ via Pod resources, after a rewrite |
| `--network none`, `--read-only`, `--cap-drop ALL`, `no-new-privileges`, tmpfs | ✅ | ❌ not controllable per execution | ❌ | ❌ | ⚠️ via Pod securityContext, after a rewrite |
| Per-job names, `docker kill`, `docker rm -f`, label sweep | ✅ | ❌ | ❌ | ❌ | ⚠️ rewrite |
| Local image build from pinned digests, `--pull never` | ✅ | ❌ (registry only) | ❌ | ❌ | ⚠️ registry + rewrite |
| Persistent local disk for the 17D-B2 journal | ✅ Managed Disk | ⚠️ Azure Files (network SMB/NFS), not a block disk | ⚠️ Azure Files only | ⚠️ `/home` network share | ✅ PV (Managed Disk) |
| Loopback gateway behind a TLS proxy on the same host | ✅ | ⚠️ ingress is platform-managed | ⚠️ | ⚠️ | ✅ (Ingress) |
| Operational fit for one school | ✅ one VM, runbook | — | — | — | ❌ control plane, node pools, upgrades |

**Verdict: Azure Linux VM.** It is the only option that runs the **current** `sandbox.js` unchanged. The code's security
model is "a trusted Node process drives a local Docker daemon to create hardened sibling containers". ACA, ACI and App Service
expose no Docker daemon and no privileged mode, so `docker run` cannot work there at all. ACA Dynamic Sessions and ACI
container groups are real per-execution isolation primitives, but each needs `sandbox.js` rewritten against a different API.
They also lose the per-run cgroup flags and the startup characteristics the tests rely on. AKS could host it only via
privileged DinD (worse isolation than a VM) or a Pod-based rewrite. The repository's own CI (`coding-runner-security.yml`)
proves exactly the VM model: an Ubuntu x64 host with Docker Engine, cgroup v2, local image builds and real Docker
security tests. The 17B design doc (§18) already prescribes "a dedicated Linux VM with Docker Engine".

**Architecture: x64** (CI is x64; the digest-pinned bases are exercised on amd64 only).

---

## 2. Threat model and security boundaries

Student code is hostile. The host is **runner-only**: no SmartAssess storage credentials, no Azure credentials, no managed
identity, no other services.

| Boundary | Protects with | Honest limit |
|---|---|---|
| Student code → container | seccomp default profile, AppArmor `docker-default`, `--cap-drop ALL`, `no-new-privileges`, uid 10001, read-only rootfs, noexec tmpfs, `--network none`, cgroup memory/CPU/pids caps, no mounts, no env, no socket | **A container is not a VM.** All sandboxes share the host kernel. A kernel, runc or containerd escape gives **root on the host**. |
| Container → host | Docker daemon only on its Unix socket (`/run/docker.sock`, `root:docker 0660`); never TCP 2375/2376; socket never mounted | Patch kernel and runc promptly (they ship in `containerd.io` from Docker's repo, **not** auto-updated, see §F.6). |
| Internet → gateway | NSG + UFW: only 443 (and 22 from the admin IP). Caddy terminates TLS and forwards 4 exact method+path pairs to `127.0.0.1:8787` | 443 cannot be IP-restricted: SWA **managed** Functions have no fixed outbound IPs, and ACME validation needs public 443. HMAC + ±60 s + replay guard is the authentication. |
| Gateway process → host | systemd sandboxing (`ProtectSystem=strict`, `NoNewPrivileges`, …), non-login service user | The service user is in the **`docker` group, which is root-equivalent** (it can start a privileged container that mounts `/`). A remote-code bug in the gateway therefore equals host root. This is accepted and is the reason the host must be dedicated. |
| SmartAssess ↔ runner keys | Three independent keys. The runner never holds the sweep key. The API refuses equal keys, and the gateway refuses to start with equal keys. | Host root can read both runner-side keys from process memory or `/etc/smartassess-runner/secrets.env`. |

**If the host is compromised, the attacker gets:** both runner-side keys (`RUNNER_HMAC_KEY` and
`SMARTASSESS_CALLBACK_HMAC_KEY`); every submitted source and stdin that passes through while they are present; and the
ability to **forge raw evidence in callbacks**, which affects coding auto-grades. They can also deny service and read the
repository via its read-only deploy key.
**They do not get:** SmartAssess storage, sessions, teacher/student accounts, other API routes, the sweep key, or Azure
resources (the VM has no identity and holds no Azure credentials).
**Response:** set `CODING_RUNNER_ENABLED=false`, rotate both runner-side keys, rebuild the VM from this runbook, and
force-regrade the coding targets graded since the suspected time.

Hardening roadmap (not required for go-live; each needs the repository's Docker test suite re-run on the host first):
gVisor as the daemon `default-runtime` (no code change, because the CLI argv has no `--runtime`), `userns-remap`, rootless
Docker, Azure Bastion / JIT for SSH, and Azure Monitor Agent.

---

## 3. VM recommendation

| Item | Choice | Why |
|---|---|---|
| Name | `smartassess-coding-runner` | |
| Resource group | `rg-smartassess-coding-runner` (new, dedicated) | Separate RBAC, lifecycle and cost view |
| Region | **The same region as the SmartAssess Static Web App's API** (SWA → Overview → *Location*, i.e. the "Region for Azure Functions API" chosen at creation) | Shortest API ↔ runner ↔ callback path |
| OS | **Ubuntu Server 24.04 LTS – x64 Gen2** (Canonical) | Supported by Docker's, NodeSource's and Caddy's official repos; matches CI. 26.04 LTS is fine later, once all three list it and the acceptance suite passes. |
| Security type | Trusted launch (Secure Boot + vTPM) | Free boot-chain integrity |
| Size | **Standard_D4als_v5 — 4 vCPU, 8 GiB, non-burstable** (Intel twin: `D4ls_v5`. A newer `Dalsv6/Dlsv6` is fine if offered in the region.) | See sizing below |
| Not | B-series (burstable), Spot | Exhausted CPU credits or eviction make wall-clock time limits unfair (**false `timeout` verdicts**) or kill grading |
| OS disk | Premium SSD LRS **64 GiB (P6)**, delete with VM ✓ | Images (JDK, .NET SDK) and Docker storage. Reproducible from this runbook. |
| Data disk | Premium SSD LRS **32 GiB (P4)**, host caching **None**, **delete with VM ✗** | Reserved for the 17D-B2 journal (§20). Survives VM replacement. |
| Swap | **none** (keep the Azure default) | `--memory = --memory-swap` semantics; predictable timing |
| Public IP | Standard SKU, **static**, DNS label, **not** deleted with VM | Stable hostname and certificate across VM rebuilds |

### 3.1 Sizing (defaults recommended in §F: practice 2, official 1 active job × 2 case slots)

Worst-case simultaneous **cgroup ceilings**:

- Practice: `RUNNER_MAX_CONCURRENCY × max(C# compile 1024, Java compile 768, runtime 512+128)` = 2 × 1024 = **2048 MiB**
- Official (1 active job; its compile and its cases are sequential): `max(compile 1024, 2 slots × 640)` = **1280 MiB**
- Sandboxes total: **≈ 3.3 GiB**. Add OS + agents ~0.7, dockerd/containerd ~0.3, gateway Node ≤ ~0.8 (bounded queue +
  1 h result cache), Caddy ~0.05. That is **≈ 5.2 GiB worst case**. 8 GiB leaves ≈ 3 GiB of page cache for the JDK/.NET
  image layers, which speeds up container start.
- CPU: at most 4 sandboxes at once (2 practice + 2 official runtime), each `--cpus 1`, so **4 vCPU**. Fewer vCPUs would
  oversubscribe and distort wall-clock time limits. More is wasted at these settings.

**Rule:** sum of worst-case ceilings + ~2 GiB must stay below RAM, and concurrent sandboxes must stay ≤ vCPUs.

**Upgrade triggers** (resize to `D8als_v5` / 16 GiB, then raise concurrency):
- frequent `runner.execute.busy` (students see `RUNNER_BUSY`) during lessons;
- frequent `runner.official.busy`, or official accepted→callback time near **30 min** (the 17D-A stale threshold);
- CPU > 75 % sustained during lessons, available memory < 20 %, or any spurious timeout on a known-good reference solution;
- OS disk > 70 %.
Resizing is a stop/resize/start. Disks, IP and DNS are kept.

Cost: use the Azure Pricing Calculator for the chosen region: one D4als_v5 Linux VM, one P6 disk, one P4 disk, one Standard
static public IP, plus negligible Key Vault and Application Insights availability tests. **No price is asserted here.**
Consider a 1-year reservation or savings plan only after 1–2 months of stable sizing.

---

## 4. Network, TLS, DNS

```
SmartAssess API (SWA managed Functions) ──HTTPS 443──▶ Caddy (TLS, 4 exact routes, 3 MB body cap)
                                                             │ http://127.0.0.1:8787 (loopback only)
                                                             ▼
                                                   Runner Gateway (node) ──unix socket──▶ dockerd ──▶ sandboxes (--network none)
Runner Gateway ──HTTPS 443──▶ https://white-grass-0ce642c10.7.azurestaticapps.net/api/coding/grade-callback
```

**Reverse proxy: Caddy** (official Caddy apt repository), chosen over Nginx because:
- it has built-in ACME with **TLS-ALPN-01 on 443**, so **port 80 never has to be opened** and renewal is automatic. Nginx needs certbot plus port 80 (or DNS-01 credentials on the host);
- requests and responses stream by default (no request buffering surprises);
- the config is small and explicit (exact method+path matchers, body cap, timeouts), and Caddy is memory-safe (Go).

**Hostname.**
- No domain needed: give the public IP a DNS label, which yields `<label>.<region>.cloudapp.azure.com` (e.g. `smartassess-runner-<4 random chars>`). It is stable for as long as the public IP resource exists, and Caddy obtains a publicly trusted certificate for it.
- With a school domain: also create `coding-runner.<school-domain>` as a **CNAME** to that FQDN, and list both names in the Caddyfile.
- An IP-only HTTPS URL is **not** possible: the API's `fetch` validates the certificate, so production needs one of the two names above.

---

## 5. Secret and variable mapping

| Runner host (`/etc/smartassess-runner/*.env`) | SmartAssess API (SWA → Environment variables → Production) | GitHub (repo settings) |
|---|---|---|
| `RUNNER_HMAC_KEY` | `CODING_RUNNER_HMAC_KEY` (**same value**) | — |
| `SMARTASSESS_CALLBACK_HMAC_KEY` | `CODING_GRADING_CALLBACK_HMAC_KEY` (**same value**) | — |
| — (**must never be on the runner**) | `CODING_GRADING_SWEEP_HMAC_KEY` | secret `CODING_GRADING_SWEEP_HMAC_KEY` (**same value**) |
| `SMARTASSESS_CALLBACK_BASE_URL=https://white-grass-0ce642c10.7.azurestaticapps.net` (origin, **no path**) | — | — |
| — | `CODING_RUNNER_URL=https://<runner-host>` (origin, no path, no trailing slash) | — |
| — | `CODING_RUNNER_ENABLED` (optional kill switch; unset = enabled) | — |
| — | — | variable `SMARTASSESS_GRADING_SWEEP_URL=https://white-grass-0ce642c10.7.azurestaticapps.net/api/coding/grading-sweep` |
| `RUNNER_HOST=127.0.0.1`, `RUNNER_PORT=8787`, `RUNNER_MAX_CONCURRENCY=2`, `RUNNER_OFFICIAL_MAX_PENDING=16`, `RUNNER_OFFICIAL_MAX_ACTIVE=1`, `RUNNER_OFFICIAL_CASE_CONCURRENCY=2` | — | — |

The three keys are 64-hex-char randoms (`openssl rand -hex 32`) and **pairwise different**. Never reuse a key.

`RUNNER_OFFICIAL_MAX_PENDING=16` (default 8) is deliberate. One recovery sweep can dispatch up to **12** jobs in ~25 s
(17D-A `SWEEP_LIMITS.maxDispatches`), so a queue of 8 would turn part of every backlog sweep into self-inflicted
`RUNNER_BUSY` (each counting toward the 8-attempt cap). At typical job durations (tens of seconds), 16 queued jobs stay well
under the 30-min stale threshold. A re-dispatch of a still-queued job is a harmless `duplicate`.

**Secret storage (first production deployment):**
- On the VM: `/etc/smartassess-runner/secrets.env`, `root:root 0600`, in a `root:root 0700` directory, loaded by systemd
  `EnvironmentFile=` (systemd reads it as root before dropping to the service user). Non-secret settings live in
  `runner.env` (`0644`).
- Escrow: an Azure Key Vault (`kv-smartassess-runner-<suffix>`, RBAC, soft delete + purge protection) holding all three
  keys. Only administrators have *Key Vault Secrets Officer*. **The VM has no managed identity and no Key Vault access.**
  Giving it one would hand a container-escape attacker a token, and if the vault also held the sweep key, a new key.
- Why not `LoadCredential=`: the gateway reads keys only from environment variables, so a wrapper would still put them in
  the process environment. That adds no protection, and the only alternative is a code change, which is unjustified.
- Backups: the OS disk is **not** backed up (it is rebuildable), so keys never land in VM snapshots. Key Vault is the only
  backup of the keys.
- Never in: git, Dockerfiles, cloud-init/custom data, the unit file, shell history, logs.

**Rotation** (quiet window; no dual-key support exists):
1. SWA: `CODING_RUNNER_ENABLED=false` (new dispatches become `retryable`, nothing is lost).
2. Wait until the runner is idle (§J.3: no `accepted` without a matching `runner.official.callback` in the last 30 min).
3. On the VM, regenerate the affected key(s) (§F.2 command; keep the other key's line), then `sudo systemctl restart smartassess-runner`.
4. SWA: update the matching `CODING_*` value(s) (saving restarts the API), then remove `CODING_RUNNER_ENABLED` or set it to `true`.
5. Key Vault: add a new secret **version**. Re-run §K and the §L callback probe.
6. Sweep key: SWA first, then the GitHub secret (17D-A §16). The runner is not involved.
Callbacks in flight with an old key get `401` (final). Those targets go stale and recovery re-dispatches them.

---

## 6. Persistence readiness for 17D-B2 (location only, no journal logic here)

| Item | Decision |
|---|---|
| Disk | Dedicated Azure **Premium SSD LRS 32 GiB** data disk, host caching **None**, **not** deleted with the VM |
| Mount point | `/data/smartassess-runner` (fstab by **UUID**, `ext4`, `defaults,nofail,noatime,nodev,nosuid,noexec`) |
| Ownership | `smartassess-runner:smartassess-runner`, mode `0700`, **fixed UID/GID 2101** so a replacement VM reads the same disk without chown |
| Safety | The unmounted mount-point directory is `chattr +i`, so nothing can silently write to the OS disk. The unit has `RequiresMountsFor=/data/smartassess-runner` and `ReadWritePaths=/data/smartassess-runner`. |
| B2 usage | B2 picks its own subdirectory and configuration variable. This plan only reserves the path. **Never** use container filesystems, `/tmp`, `PrivateTmp` or `/var/lib/docker` for durable state. |

| Event | Data on `/data/smartassess-runner` | Current in-memory state (queue, result cache, replay guard) |
|---|---|---|
| Node crash / `systemctl restart` | survives | lost |
| VM reboot / deallocate + start / Azure host redeploy | survives | lost |
| VM deleted and rebuilt | survives **only if** the disk is detached and re-attached to the new VM (same region; same zone if zonal) | lost |
| Disk deleted, region/datacenter loss | lost (LRS = 3 copies in one datacenter) unless B2/B3 defines snapshots or ZRS | lost |

The journal will likely hold job payloads (student source and stdin). Any future snapshot or backup of this disk is therefore
**student-data-bearing** and needs a retention and access policy decided in B2/B3. None is enabled now.

---

## 7. Backups and recovery

| Asset | Backed up? | Recovery |
|---|---|---|
| OS disk | No | Rebuild from this runbook (~1 h) |
| Code | Git (`origin/main` at a recorded SHA) | Re-clone, checkout the SHA |
| Worker images | No | `npm --prefix runner run build:images` from digest-pinned bases (optional: `docker save` the three images to a private location if registry availability is a concern) |
| `runner.env` | This document (§F.3) | Re-create |
| Keys | Key Vault escrow only | Re-install from Key Vault, or rotate |
| Caddy ACME account and certs (`/var/lib/caddy`) | No | Re-issued automatically |
| Data disk (`/data/smartassess-runner`) | **Not yet**; retained across VM rebuilds | Policy is B2/B3's decision (see §6) |

---

## 8. Monitoring (no student code anywhere)

- Azure platform metrics alerts (enabled at VM creation): CPU > 80 % for 15 min, available memory < 1 GiB, VM availability,
  OS/data disk IOPS saturation. Action group: e-mail the administrators.
- Application Insights **Standard availability test** on `https://<runner-host>/healthz` every 5 min from 3+ locations:
  expect 200 and content `"ok":true`, with the **SSL certificate check** and the "certificate expires in < 7 days" alert on.
  This catches ACME renewal failures.
- Host timer (§G.4), every 5 min: logs one aggregate JSON line to the journal (`healthz` up/down, sandbox count, sandboxes
  older than 5 min, root and data disk %, memory available, Docker disk usage) and removes any labelled sandbox older than
  10 min (no legitimate sandbox lives more than ~1 min).
- Gateway events to watch (`journalctl -u smartassess-runner -o cat | jq -r .event | sort | uniq -c`):
  `runner.execute.busy`, `runner.official.busy` (saturation); `runner.callback.rejected`, `runner.callback.unreachable`,
  `runner.callback.gave-up` (callback errors); `runner.request.unauthorized` (key mismatch or probing);
  `runner.official.failed` (`SUITE_TIMEOUT` / `RUNNER_INTERNAL`).
- Later (optional, costs Log Analytics ingestion): Azure Monitor Agent + DCR collecting journald and syslog, with alerts on the
  events above. Gateway logs and the filtered Caddy access log contain no submission content, so they are safe to ship.

---

# PRODUCTION RUNBOOK

Conventions: `$` lines run over SSH as the admin user. Replace `<…>`. **Never paste a key on a command line.**

## A. Azure resource creation (Portal)

**A.1 Prerequisites:** Contributor on the subscription or target RG; the SWA's region; the administrator's public IP
(`<ADMIN_IP>/32`); an SSH Ed25519 key pair on the admin workstation; an e-mail address for ACME and alerts.

**A.2 Resource group:** Portal → Resource groups → Create → `rg-smartassess-coding-runner`, region = the SWA region.
Tags as in A.10.

**A.3 Network security group (create before the VM):** Network security groups → Create → `nsg-smartassess-coding-runner`
in the RG. Then **Inbound security rules**:

| Prio | Name | Source | Port | Proto | Action |
|---|---|---|---|---|---|
| 100 | Allow-HTTPS-Inbound | Service tag `Internet` | 443 | TCP | Allow |
| 110 | Allow-SSH-Admin | IP `<ADMIN_IP>/32` | 22 | TCP | Allow |
| 120 | Deny-Runner-Internals | Any | 8787,2375,2376 | Any | Deny |

(The defaults `DenyAllInBound` 65500 etc. stay.) **No rule for 80 or 8787.**
**Outbound security rules:**

| Prio | Name | Destination | Port | Proto | Action |
|---|---|---|---|---|---|
| 100 | Allow-HTTPS-Out | Service tag `Internet` | 443 | TCP | Allow |
| 110 | Allow-HTTP-Out (Ubuntu mirrors) | `Internet` | 80 | TCP | Allow |
| 120 | Allow-NTP-Out | `Internet` | 123 | UDP | Allow |
| 4000 | Deny-Other-Internet-Out | `Internet` | Any | Any | Deny |

Azure platform endpoints (168.63.129.16, IMDS) are unaffected. Sandboxes have no network regardless.

**A.4 Create VM:** Virtual machines → Create → Azure virtual machine.

**Basics**
- Subscription / RG: `rg-smartassess-coding-runner`; VM name `smartassess-coding-runner`; Region: the SWA region.
- Availability options: *No infrastructure redundancy required* (single VM; Premium SSD gives the single-instance SLA).
- Security type: **Trusted launch virtual machines** (Secure Boot ✓, vTPM ✓).
- Image: **Ubuntu Server 24.04 LTS – x64 Gen2**. VM architecture: **x64**.
- Run with Azure Spot discount: **unchecked**.
- Size: **Standard_D4als_v5** (See all sizes → filter "D4als"). Not B-series.
- Authentication: **SSH public key**; username `saadmin`; *Use existing public key* → paste your Ed25519 public key.
- Public inbound ports: **None** (the NSG from A.3 is attached in Networking).

**Disks**
- OS disk size **64 GiB**, type **Premium SSD (LRS)**, *Delete with VM* ✓.
- Encryption: platform-managed key (default). Enable **Encryption at host** if the subscription feature is registered.
- Data disks → *Create and attach a new disk*: name `smartassess-coding-runner-data`, **Premium SSD LRS 32 GiB (P4)**,
  then on the list set **Host caching: None** and *Delete with VM* **unchecked**.

**Networking**
- Virtual network: new `vnet-smartassess-runner` (`10.60.0.0/24`), subnet `snet-runner` (`10.60.0.0/27`).
- Public IP: *Create new* → `pip-smartassess-coding-runner`, SKU **Standard**, assignment **Static**.
- NIC network security group: **Advanced** → select `nsg-smartassess-coding-runner`.
- *Delete public IP and NIC when VM is deleted*: **unchecked** (keeps the hostname and certificate across rebuilds).
- Accelerated networking: on (default). Load balancing: None.

**Management**
- Microsoft Defender for Cloud: as the organisation's policy (optional, paid).
- **Identity: System-assigned managed identity OFF** (deliberate, see §5).
- Login with Microsoft Entra ID: off (SSH keys).
- **Auto-shutdown: OFF** (callbacks and grading must stay available).
- **Backup: OFF** (§7; keeps keys out of snapshots).
- Guest OS updates: Patch orchestration **Image default** (unattended-upgrades in the guest, tuned in B.3); *Enable periodic assessment* ✓.

**Monitoring**
- Alerts: **Enable recommended alert rules** ✓ → e-mail to the admins (CPU, available memory, disk, network, VM availability).
- Boot diagnostics: **Enable with managed storage account** (needed for Serial Console break-glass access).
- Enable OS guest diagnostics: off.

**Advanced**
- Extensions: none. VM applications: none.
- **Custom data / User data: empty**. Never put configuration or keys here; it is readable via ARM and IMDS.
- Host, capacity reservation, proximity placement: none.

**Tags:** `app=smartassess`, `component=coding-runner`, `env=production`, `owner=<admin e-mail>`,
`workload=untrusted-code-execution`, `managed-by=runbook`.

**Review + create:** confirm size D4als_v5, Trusted launch, no Spot, no public inbound ports, NSG attached, data disk
*not* deleted with VM, no identity → **Create**.

**A.5 DNS label:** Public IP `pip-smartassess-coding-runner` → Configuration → DNS name label `smartassess-runner-<4 random
chars>` → Save. Record `RUNNER_FQDN=<label>.<region>.cloudapp.azure.com`. Optional: school DNS
`coding-runner.<school-domain> CNAME <RUNNER_FQDN>`.

**A.6 Key Vault (escrow):** Key vaults → Create → `kv-smartassess-runner-<suffix>`, same RG, permission model **Azure RBAC**,
soft delete on, **purge protection on**, public access restricted to selected networks or the admin IP if desired. Grant
admins *Key Vault Secrets Officer*. Grant **nothing** to the VM.

**A.7 Application Insights:** create `appi-smartassess-runner` (workspace-based). You add the availability test in J.4.

## B. VM bootstrap

```sh
$ ssh saadmin@<RUNNER_FQDN>
# B.1 patch
$ sudo apt-get update && sudo apt-get -y full-upgrade && sudo apt-get -y autoremove
$ sudo reboot            # reconnect afterwards
# B.2 base tools
$ sudo apt-get install -y ca-certificates curl gnupg jq git ufw unattended-upgrades
# B.3 patch policy: Ubuntu security updates automatically, NO automatic reboot; never auto-restart the runner mid-job
$ sudo tee /etc/apt/apt.conf.d/52smartassess-runner >/dev/null <<'EOF'
Unattended-Upgrade::Automatic-Reboot "false";
EOF
$ sudo install -d /etc/needrestart/conf.d
$ sudo tee /etc/needrestart/conf.d/smartassess-runner.conf >/dev/null <<'EOF'
# Restart these only in a maintenance window (running jobs would be lost).
$nrconf{override_rc}{qr(^smartassess-runner)} = 0;
$nrconf{override_rc}{qr(^docker)} = 0;
$nrconf{override_rc}{qr(^containerd)} = 0;
$nrconf{override_rc}{qr(^caddy)} = 0;
EOF
# B.4 SSH: keys only, no root
$ sudo tee /etc/ssh/sshd_config.d/60-smartassess.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
AllowUsers saadmin
EOF
$ sudo sshd -t && sudo systemctl reload ssh
# B.5 time sync must be healthy: HMAC freshness is ±60 s (runner) / ±300 s (callback)
$ timedatectl            # "System clock synchronized: yes"
$ chronyc sources        # expect the Hyper-V PTP refclock (PHC0) on Azure images
# B.6 journald bounds
$ sudo install -d /etc/systemd/journald.conf.d
$ printf '[Journal]\nSystemMaxUse=1G\nMaxRetentionSec=30day\n' | sudo tee /etc/systemd/journald.conf.d/smartassess.conf
$ sudo systemctl restart systemd-journald
# B.7 dedicated service account with a FIXED uid/gid (data disk portability); uid 10001 must stay unused on the host
$ getent passwd 2101 || getent group 2101 || echo "2101 free"
$ getent passwd 10001 || echo "10001 unused (good)"
$ sudo groupadd --system --gid 2101 smartassess-runner
$ sudo useradd --system --uid 2101 --gid 2101 --home-dir /var/lib/smartassess-runner --no-create-home --shell /usr/sbin/nologin smartassess-runner
# B.8 data disk (Dalsv5 = SCSI; the stable path is /dev/disk/azure/scsi1/lun0)
$ ls -l /dev/disk/azure/scsi1/ && lsblk -o NAME,SIZE,TYPE,MOUNTPOINT
$ sudo parted /dev/disk/azure/scsi1/lun0 --script mklabel gpt mkpart primary ext4 0% 100%
$ sudo udevadm settle && sudo mkfs.ext4 -L sa-runner-data /dev/disk/azure/scsi1/lun0-part1
$ sudo mkdir -p /data/smartassess-runner && sudo chattr +i /data/smartassess-runner
$ UUID=$(sudo blkid -s UUID -o value /dev/disk/azure/scsi1/lun0-part1); echo "$UUID"
$ echo "UUID=$UUID /data/smartassess-runner ext4 defaults,nofail,noatime,nodev,nosuid,noexec,x-systemd.device-timeout=30s 0 2" | sudo tee -a /etc/fstab
$ sudo systemctl daemon-reload && sudo mount /data/smartassess-runner
$ sudo chown smartassess-runner:smartassess-runner /data/smartassess-runner && sudo chmod 0700 /data/smartassess-runner
$ findmnt /data/smartassess-runner && sudo reboot   # after reboot: findmnt again must show it mounted
```

## C. Docker Engine (official Docker apt repository; no convenience script)

```sh
$ for p in docker.io docker-doc docker-compose podman-docker containerd runc; do sudo apt-get remove -y $p 2>/dev/null; done
$ sudo install -m 0755 -d /etc/apt/keyrings
$ sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
$ sudo chmod a+r /etc/apt/keyrings/docker.asc
$ gpg --show-keys /etc/apt/keyrings/docker.asc   # fingerprint must be 9DC8 5822 9FC7 DD38 854A  E2D8 8D81 803C 0EBF CD88
$ sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
$ sudo apt-get update
$ sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
# C.2 daemon hardening (keep it minimal; every sandbox flag is already set per run by the gateway)
$ sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "live-restore": false,
  "icc": false,
  "userland-proxy": false,
  "log-driver": "local",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
$ sudo systemctl restart docker && sudo systemctl enable docker containerd
# C.3 verify: cgroup v2, seccomp + apparmor, socket permissions, no TCP listener
$ sudo docker version
$ sudo docker info --format 'cgroup v{{.CgroupVersion}} driver={{.CgroupDriver}} storage={{.Driver}} security={{.SecurityOptions}}'
$ ls -l /run/docker.sock                     # srw-rw---- root docker
$ sudo ss -ltnp | grep -E ':(2375|2376)\b' && echo "FAIL: docker TCP" || echo "OK: no docker TCP listener"
# C.4 Docker access for the service account ONLY (root-equivalent; see §2). Do not add saadmin to the docker group.
$ sudo usermod -aG docker smartassess-runner
```

Daemon choices:
- `live-restore: false` is **deliberate**. Official cases have no in-container supervisor after `execve`, and their timeout is enforced by the gateway's `docker kill`. With live-restore, a dockerd restart would leave hostile loops running unsupervised. Without it, a daemon restart kills every sandbox, and the gateway reports `internal-error`.
- `log-driver local` (rotated) only matters for non-sandbox containers; sandboxes force `--log-driver none`.
- The storage driver is left at the engine default (overlay2, or the containerd image store on newer engines). Both work, and E.3 proves it.
- `userns-remap`, rootless mode, `bridge: none` and the gVisor runtime are **not** enabled at go-live because CI does not cover them. Enable them later only after E.3 passes with them.

## D. Node.js 22 and the Runner code

```sh
# D.1 NodeSource repository, configured manually (no setup script)
$ curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
$ echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
$ sudo apt-get update && sudo apt-get install -y nodejs
$ node --version && npm --version          # node must be >= v22.12.0
```
Node 22 reaches end of life on **2027-04-30**. Move to Node 24 through a reviewed PR that runs the runner CI on 24 first.

```sh
# D.2 read-only deploy key (if the repository is private). GitHub → repo → Settings → Deploy keys → Add, "Allow write access" OFF.
$ sudo install -d -m 0700 /root/.ssh
$ sudo ssh-keygen -t ed25519 -N '' -C 'smartassess-coding-runner (read-only deploy)' -f /root/.ssh/smartassess_runner_deploy
$ sudo cat /root/.ssh/smartassess_runner_deploy.pub      # public half only → paste into GitHub
$ sudo tee /root/.ssh/config >/dev/null <<'EOF'
Host github-smartassess
  HostName ssh.github.com
  Port 443
  User git
  IdentityFile /root/.ssh/smartassess_runner_deploy
  IdentitiesOnly yes
EOF
$ sudo ssh-keyscan -p 443 -t ed25519 ssh.github.com | sudo tee /root/.ssh/known_hosts
$ sudo ssh-keygen -lf /root/.ssh/known_hosts   # must be SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU (GitHub's published ed25519 key)
# D.3 code: root-owned, read-only for the service, pinned to a reviewed main commit
$ sudo install -d -m 0755 /opt/smartassess-runner
$ sudo git clone github-smartassess:nassarwafik/ExamBank791381.git /opt/smartassess-runner/app
$ cd /opt/smartassess-runner/app && sudo git fetch origin main
$ sudo git merge-base --is-ancestor <RELEASE_SHA> origin/main && sudo git checkout --detach <RELEASE_SHA>
$ sudo git log -1 --format='%H %s'                         # record this SHA in the change log
```
(`<RELEASE_SHA>` = `a6e26acbd3dc505031162a97847ba40480254e02` today, or a later reviewed main commit.)

## E. Worker images

```sh
$ cd /opt/smartassess-runner/app
$ sudo npm --prefix runner run build:images          # pulls the digest-pinned bases; RUN steps use --network none
$ sudo docker image ls --filter 'reference=smartassess-coding-*' --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}'
# expect exactly: smartassess-coding-python:17c-v1, smartassess-coding-java:17c-v1, smartassess-coding-csharp:17c-v1
$ sudo docker builder prune -f
```
Never run `docker system prune -a` or `docker image prune -a`: they delete the worker images (no container references them
between runs), and every language then becomes `LANGUAGE_UNAVAILABLE`. Plain `docker image prune -f` (dangling only) is safe.

**E.3 Acceptance on this exact host (before any production key exists).** This is the repository's own CI suite.

```sh
$ sudo git clone /opt/smartassess-runner/app /var/tmp/sa-acceptance && cd /var/tmp/sa-acceptance && sudo git checkout --detach <RELEASE_SHA>
$ sudo npm --prefix runner test
$ sudo npm ci --prefix api                        # the official e2e test drives the real API handlers (TEST keys only)
$ sudo npm --prefix runner run test:docker        # practice security + official grading, real Docker
$ test -z "$(sudo docker ps -aq --filter label=smartassess.coding-runner=1)" && echo "no leftovers"
$ cd / && sudo rm -rf /var/tmp/sa-acceptance
```
All tests must pass. A failure is a go-live blocker (do not "skip").

## F. Secrets and configuration

```sh
# F.1 directory
$ sudo install -d -m 0700 -o root -g root /etc/smartassess-runner
# F.2 generate BOTH runner-side keys on the host, directly into the file (no echo, no history, no argv)
$ sudo sh -c 'umask 077; k1=$(openssl rand -hex 32); k2=$(openssl rand -hex 32); [ "$k1" != "$k2" ] || exit 1; printf "RUNNER_HMAC_KEY=%s\nSMARTASSESS_CALLBACK_HMAC_KEY=%s\n" "$k1" "$k2" > /etc/smartassess-runner/secrets.env'
$ sudo stat -c '%U:%G %a %n' /etc/smartassess-runner/secrets.env       # root:root 600
# F.3 non-secret settings
$ sudo tee /etc/smartassess-runner/runner.env >/dev/null <<'EOF'
# SmartAssess Coding Runner (non-secret). Keys live in secrets.env (0600).
RUNNER_HOST=127.0.0.1
RUNNER_PORT=8787
RUNNER_MAX_CONCURRENCY=2
RUNNER_OFFICIAL_MAX_PENDING=16
RUNNER_OFFICIAL_MAX_ACTIVE=1
RUNNER_OFFICIAL_CASE_CONCURRENCY=2
SMARTASSESS_CALLBACK_BASE_URL=https://white-grass-0ce642c10.7.azurestaticapps.net
EOF
$ sudo chmod 0644 /etc/smartassess-runner/runner.env
```
**F.4 Escrow (once):** reveal each value one at a time with `sudo sed -n 's/^RUNNER_HMAC_KEY=//p' /etc/smartassess-runner/secrets.env`
(and the same for `SMARTASSESS_CALLBACK_HMAC_KEY`). Paste each into Key Vault (Secrets → Generate/Import:
`coding-runner-hmac-key`, `coding-grading-callback-hmac-key`), then run `clear`. You paste the same values into SWA in §M.

**F.5 Sweep key** (never on this VM): in **Azure Cloud Shell**, run `openssl rand -hex 32`, then store it in Key Vault
as `coding-grading-sweep-hmac-key`. It is used in §N.

**F.6 Maintenance policy:** Docker, containerd/runc, Node and Caddy come from third-party repos that unattended-upgrades does
**not** update. Patch them weekly, and immediately on any runc, containerd or kernel CVE, in a quiet window:
`sudo apt-get update && sudo apt-get install --only-upgrade docker-ce docker-ce-cli containerd.io docker-buildx-plugin nodejs caddy`,
reboot if the kernel changed, then re-run J and K.

## G. systemd

**G.1 Leftover-sandbox sweeper** (used on stop and by the health timer):

```sh
$ sudo tee /usr/local/sbin/smartassess-runner-sweep >/dev/null <<'EOF'
#!/bin/sh
# Removes every SmartAssess sandbox container (label smartassess.coding-runner=1). Never touches images.
ids=$(docker ps -aq --filter label=smartassess.coding-runner=1 2>/dev/null)
[ -z "$ids" ] || docker rm -f $ids >/dev/null 2>&1
exit 0
EOF
$ sudo chmod 0755 /usr/local/sbin/smartassess-runner-sweep
```

**G.2 Unit** `/etc/systemd/system/smartassess-runner.service`:

```ini
[Unit]
Description=SmartAssess Coding Runner Gateway
Documentation=file:///opt/smartassess-runner/app/runner/README.md
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target
RequiresMountsFor=/data/smartassess-runner
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
User=smartassess-runner
Group=smartassess-runner
WorkingDirectory=/opt/smartassess-runner/app/runner
EnvironmentFile=/etc/smartassess-runner/runner.env
EnvironmentFile=/etc/smartassess-runner/secrets.env
Environment=NODE_ENV=production
Environment=HOME=/var/lib/smartassess-runner
ExecStart=/usr/bin/node gateway/main.js
ExecStopPost=/usr/local/sbin/smartassess-runner-sweep
Restart=always
RestartSec=5
TimeoutStopSec=90
KillMode=control-group
LimitNOFILE=65536
TasksMax=512
MemoryMax=2G
UMask=0077
StateDirectory=smartassess-runner
StateDirectoryMode=0700
ReadWritePaths=/data/smartassess-runner
# --- sandboxing of the gateway process itself (compatible with the docker CLI over /run/docker.sock) ---
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
ProtectProc=invisible
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
CapabilityBoundingSet=
AmbientCapabilities=
SystemCallArchitectures=native
# Deliberately NOT set: MemoryDenyWriteExecute (breaks the V8 JIT), SystemCallFilter (unverified for Node 22 io_uring),
# PrivateNetwork/IPAddressDeny (the gateway must reach docker.sock, listen on loopback and call back over HTTPS).

[Install]
WantedBy=multi-user.target
```

Tradeoffs:
- `ProtectSystem=strict` still allows connecting to `/run/docker.sock`, because socket connects are not blocked by read-only mounts. The docker CLI's `$HOME` is the writable `StateDirectory`.
- `MemoryMax=2G` caps only the Node process tree. Sandboxes live in Docker's own cgroups with their own ceilings.
- `KillMode=control-group` plus `ExecStopPost` sweep: stopping the service kills the docker CLI children, and the sweeper removes their containers (they could not report anyway). The gateway's own startup sweep covers crashes.
- None of this reduces the root-equivalence of the `docker` group (§2).

```sh
$ sudo systemd-analyze verify /etc/systemd/system/smartassess-runner.service
$ sudo systemctl daemon-reload && sudo systemctl enable --now smartassess-runner
$ systemctl status smartassess-runner --no-pager
$ journalctl -u smartassess-runner -o cat -n 5
# expect: {"event":"runner.gateway.started","host":"127.0.0.1","port":8787,"maxConcurrency":2,
#          "officialGrading":{"enabled":true,"maxPending":16,"maxActive":1,"caseConcurrency":2},"sweptContainers":0}
# officialGrading.enabled MUST be true (false = callback URL/key invalid). No key appears in this line by design.
$ sudo ss -ltnp | grep 8787          # 127.0.0.1:8787 only
```

**G.4 Health and housekeeping timers:**

```sh
$ sudo tee /usr/local/sbin/smartassess-runner-healthcheck >/dev/null <<'EOF'
#!/bin/sh
# Aggregate host facts only: never source, stdin, stdout, stderr, job payloads or keys.
now=$(date +%s); n=0; old=0; removed=0
hz=down; curl -fsS -m 5 http://127.0.0.1:8787/healthz >/dev/null 2>&1 && hz=up
for id in $(docker ps -aq --filter label=smartassess.coding-runner=1); do
  n=$((n+1)); s=$(docker inspect -f '{{.Created}}' "$id" 2>/dev/null) || continue
  age=$(( now - $(date -d "$s" +%s 2>/dev/null || echo "$now") ))
  [ "$age" -gt 300 ] && old=$((old+1))
  [ "$age" -gt 600 ] && docker rm -f "$id" >/dev/null 2>&1 && removed=$((removed+1))
done
root=$(df --output=pcent / | tail -1 | tr -dc 0-9); data=$(df --output=pcent /data/smartassess-runner | tail -1 | tr -dc 0-9)
mem=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
img=$(docker system df --format '{{.Type}}={{.Size}}' 2>/dev/null | tr '\n' ' ')
logger -t smartassess-runner-health "{\"healthz\":\"$hz\",\"sandboxes\":$n,\"olderThan5m\":$old,\"removedStale\":$removed,\"rootPct\":$root,\"dataPct\":$data,\"memAvailMiB\":$mem,\"dockerDf\":\"$img\"}"
[ "$hz" = up ]
EOF
$ sudo chmod 0755 /usr/local/sbin/smartassess-runner-healthcheck
$ sudo tee /etc/systemd/system/smartassess-runner-health.service >/dev/null <<'EOF'
[Unit]
Description=SmartAssess runner health facts
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/smartassess-runner-healthcheck
EOF
$ sudo tee /etc/systemd/system/smartassess-runner-health.timer >/dev/null <<'EOF'
[Unit]
Description=SmartAssess runner health facts every 5 min
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
EOF
$ sudo tee /etc/systemd/system/smartassess-docker-prune.service >/dev/null <<'EOF'
[Unit]
Description=Prune Docker build cache and dangling images (never the worker images)
[Service]
Type=oneshot
ExecStart=/usr/bin/docker builder prune -f
ExecStart=/usr/bin/docker image prune -f
EOF
$ sudo tee /etc/systemd/system/smartassess-docker-prune.timer >/dev/null <<'EOF'
[Unit]
Description=Weekly Docker prune
[Timer]
OnCalendar=Sun 03:30
Persistent=true
[Install]
WantedBy=timers.target
EOF
$ sudo systemctl daemon-reload && sudo systemctl enable --now smartassess-runner-health.timer smartassess-docker-prune.timer
$ journalctl -t smartassess-runner-health -n 1 -o cat
```

## H. HTTPS reverse proxy (Caddy)

```sh
$ curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
$ echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" | sudo tee /etc/apt/sources.list.d/caddy-stable.list
$ sudo apt-get update && sudo apt-get install -y caddy && caddy version
$ sudo install -d -o caddy -g caddy -m 0750 /var/log/caddy
```

`/etc/caddy/Caddyfile` (replace `<RUNNER_FQDN>`, `<ACME_EMAIL>`. To add a school name, write `<RUNNER_FQDN>, coding-runner.<school-domain> {`):

```caddyfile
{
	email <ACME_EMAIL>
	admin off
	auto_https disable_redirects
	servers {
		protocols h1 h2
		timeouts {
			read_header 15s
			read_body 30s
			write 150s
			idle 2m
		}
	}
}

(gateway) {
	reverse_proxy 127.0.0.1:8787 {
		transport http {
			dial_timeout 5s
			response_header_timeout 125s
			keepalive off
		}
	}
}

<RUNNER_FQDN> {
	tls {
		issuer acme {
			disable_http_challenge
		}
	}

	request_body {
		max_size 3MB
	}

	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		-Server
	}

	log {
		output file /var/log/caddy/runner-access.log {
			roll_size 20MiB
			roll_keep 10
			roll_keep_for 720h
		}
		format filter {
			fields {
				request>headers delete
				resp_headers delete
			}
		}
	}

	@get {
		method GET
		path /healthz /v1/capabilities
	}
	@post {
		method POST
		path /v1/execute /v1/official-grading-jobs
	}

	handle @get {
		import gateway
	}
	handle @post {
		import gateway
	}
	handle {
		header Content-Type "application/json; charset=utf-8"
		respond `{"ok":false,"code":"NOT_FOUND"}` 404
	}
}
```

Why each setting:
- **Exact method+path matchers, no rewrites.** The signature covers the path, and anything else is a JSON 404.
- **3 MB body cap**, above the gateway's 2 MiB official cap. The gateway enforces exact limits itself.
- **`response_header_timeout 125s`** is above the gateway's 120 s request timeout and above the API's 60 s execute timeout, so the proxy never cuts a request first.
- **`keepalive off` upstream** removes the classic race where a pooled connection that Node has just closed (5 s keep-alive) makes a POST fail with 502.
- **No HTTP listener redirects** (`disable_redirects`, port 80 closed). Certificates come via **TLS-ALPN-01 on 443**.
- **`protocols h1 h2`**: no HTTP/3, because UDP 443 is not opened.
- **The access log deletes all request and response headers**, so signatures are never logged.
- **`admin off`**: there is no local admin API. Apply config changes with `systemctl restart caddy`.
- If `caddy validate` rejects the `log` block on the installed version, delete the block (Caddy then writes no access log by default).

```sh
$ sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
$ sudo systemctl enable caddy && sudo systemctl restart caddy
$ journalctl -u caddy -n 50 -o cat | grep -iE 'certificate obtained|error'   # expect "certificate obtained successfully"
```

## I. Host firewall (defence in depth on top of the NSG)

```sh
$ sudo ufw default deny incoming && sudo ufw default allow outgoing
$ sudo ufw allow from <ADMIN_IP> to any port 22 proto tcp
$ sudo ufw allow 443/tcp
$ sudo ufw enable && sudo ufw status verbose
$ sudo ss -ltnp     # listeners: :22, :443 (caddy), 127.0.0.1:8787 (node), nothing on 80/2375/2376
```
If the admin IP changes, SSH is lost. Recover via Portal → VM → **Serial console** or **Run command**, then update the NSG
and UFW. Improvement: Azure Bastion (or JIT) and then close 22 entirely.

## J. Health checks

```sh
$ docker --version; sudo docker version --format '{{.Server.Version}}'; node --version; npm --version
$ systemctl is-active docker smartassess-runner caddy
$ curl -sS http://127.0.0.1:8787/healthz                     # {"ok":true}
$ curl -sS https://<RUNNER_FQDN>/healthz                     # {"ok":true}  (valid public certificate, no -k)
$ curl -sS -o /dev/null -w '%{http_code}\n' https://<RUNNER_FQDN>/v1/capabilities      # 401 (unsigned)
$ curl -sS -o /dev/null -w '%{http_code}\n' https://<RUNNER_FQDN>/anything             # 404
$ curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://<RUNNER_FQDN>/healthz      # 404 (method not allowed by proxy)
$ curl -sS -m 5 http://<RUNNER_FQDN>:8787/healthz || echo "OK: 8787 not reachable"   # run from the admin workstation
# Callback destination reachable from this host, route exists, NO redirect (unsigned POST must be 401, not 3xx):
$ curl -sS -o /dev/null -w '%{http_code} redirect=[%{redirect_url}]\n' -X POST https://white-grass-0ce642c10.7.azurestaticapps.net/api/coding/grade-callback
```
**J.3 Idle check** (before restarts or rotations):
```sh
$ journalctl -u smartassess-runner --since "-30 min" -o cat | jq -r .event | grep -E 'runner.official.(accepted|callback)' | sort | uniq -c
```
**J.4** Application Insights → `appi-smartassess-runner` → Availability → **Add Standard test**: URL
`https://<RUNNER_FQDN>/healthz`, every 5 min, ≥ 3 locations, expected 200, content match `"ok":true`, SSL check ✓, certificate
expiry alert ✓ (7 days). Add an alert to the admin action group.

## K. Signed capability check (real HMAC protocol, no bypass)

The tool below uses the gateway's **own signer** (`runner/gateway/auth.js`) and reads the key from `secrets.env` inside the
process. It never prints the key, signature or headers.

```sh
$ sudo tee /usr/local/sbin/smartassess-runner-check >/dev/null <<'EOF'
#!/usr/bin/env node
"use strict";
// Operator checks against the PUBLIC https URL. Prints statuses and response bodies only (bodies never contain secrets).
const fs = require("node:fs"), crypto = require("node:crypto");
const { signRequest } = require("/opt/smartassess-runner/app/runner/gateway/auth.js");
const [mode, base] = process.argv.slice(2);
if (!/^(caps|execute|official)$/.test(mode || "") || !/^https:\/\/[A-Za-z0-9.-]+$/.test(base || "")) { console.error("usage: smartassess-runner-check caps|execute|official https://<runner-host>"); process.exit(2); }
const line = fs.readFileSync("/etc/smartassess-runner/secrets.env", "utf8").split("\n").find(l => l.startsWith("RUNNER_HMAC_KEY="));
const key = line ? line.slice("RUNNER_HMAC_KEY=".length) : "";
if (key.length < 32) { console.error("RUNNER_HMAC_KEY not found"); process.exit(2); }
const rid = p => p + crypto.randomBytes(12).toString("base64url");
async function call(method, path, bodyObj, k, requestId = rid("ops_")) {
  const body = bodyObj === undefined ? "" : JSON.stringify(typeof bodyObj === "function" ? bodyObj(requestId) : bodyObj);
  const headers = k ? { "content-type": "application/json", ...signRequest({ key: k, method, path, timestamp: String(Math.floor(Date.now() / 1000)), requestId, body: Buffer.from(body, "utf8") }) } : {};
  const res = await fetch(base + path, { method, headers, body: method === "POST" ? body : undefined, redirect: "error", signal: AbortSignal.timeout(90000) });
  return { status: res.status, text: await res.text() };
}
(async () => {
  let ok = true;
  const show = (label, r, want) => { const pass = r.status === want; ok = ok && pass; console.log((pass ? "PASS " : "FAIL ") + label + " " + r.status + " " + r.text.slice(0, 300)); return r; };
  if (mode === "caps") {
    const h = await fetch(base + "/healthz", { redirect: "error" }); show("healthz", { status: h.status, text: await h.text() }, 200);
    show("unsigned", await call("GET", "/v1/capabilities"), 401);
    show("wrong-key", await call("GET", "/v1/capabilities", undefined, crypto.randomBytes(32).toString("hex")), 401);
    const s = show("signed", await call("GET", "/v1/capabilities", undefined, key), 200);
    const langs = s.status === 200 ? JSON.parse(s.text).languages.map(l => l.key + "@" + l.languageVersion).sort().join(",") : "";
    const pass = langs === "csharp@1,java@1,python@1"; ok = ok && pass; console.log((pass ? "PASS " : "FAIL ") + "languages " + langs);
  } else if (mode === "execute") {
    const r = show("execute", await call("POST", "/v1/execute", id => ({ requestId: id, language: "python", languageVersion: 1, source: "print(sum(map(int, input().split())))", stdin: "2 3\n", limits: { timeMs: 2000, memoryMb: 128, outputBytes: 1024 } }), key), 200);
    const res = r.status === 200 ? JSON.parse(r.text).result : {}; const pass = res.status === "success" && res.stdout === "5\n"; ok = ok && pass; console.log((pass ? "PASS " : "FAIL ") + "execute result");
  } else {
    const jobId = "cg_opssmoke" + crypto.randomBytes(9).toString("hex");
    show("official " + jobId, await call("POST", "/v1/official-grading-jobs", { jobId, language: "python", languageVersion: 1, source: "print(sum(map(int, input().split())))", cases: [{ token: "c01", stdin: "1 2\n" }, { token: "c02", stdin: "5 7\n" }], limits: { timeMs: 2000, memoryMb: 128, outputBytes: 1024 } }, key), 202);
    console.log("now: journalctl -u smartassess-runner -o cat | grep " + jobId);
  }
  console.log(ok ? "CHECK PASS" : "CHECK FAIL"); process.exit(ok ? 0 : 1);
})().catch(e => { console.error("CHECK ERROR " + (e && e.name)); process.exit(1); });
EOF
$ sudo chown root:root /usr/local/sbin/smartassess-runner-check && sudo chmod 0700 /usr/local/sbin/smartassess-runner-check
$ sudo /usr/local/sbin/smartassess-runner-check caps https://<RUNNER_FQDN>
$ sudo /usr/local/sbin/smartassess-runner-check execute https://<RUNNER_FQDN>
```
Expected: `healthz 200`, `unsigned 401`, `wrong-key 401`, `signed 200` with languages `csharp@1,java@1,python@1`,
then `execute 200` with `success` and `5`, and finally `CHECK PASS`. This proves the HTTPS path, the certificate, the
no-rewrite routing, the gateway's signature verification (positive and negative), Docker access under the systemd hardening
(`image inspect`), all three images, and a real sandbox run.
The **API side of the key pair** is proven in §M.3 (SmartAssess's own signed call).

## L. Official grading smoke (runner side, synthetic job, no student data)

```sh
$ sudo /usr/local/sbin/smartassess-runner-check official https://<RUNNER_FQDN>     # PASS official ... 202
$ sleep 20; journalctl -u smartassess-runner -o cat --since "-5 min" | grep cg_opssmoke
$ sudo docker ps -aq --filter label=smartassess.coding-runner=1 | wc -l          # 0
```
Expected events for that job id: `runner.official.accepted` (cases 2) → `runner.official.completed`
(`"outcomes":{"success":2}`) → one callback outcome. The callback outcome **is the key-pair probe** for the callback
direction:

| Callback status in `runner.callback.*` | Meaning |
|---|---|
| `503` | API `CODING_GRADING_CALLBACK_HMAC_KEY` is not set yet, or equals the runner key. Expected **before §M**. |
| `401` | Callback keys differ between runner and API. Fix them. |
| `404` (`UNKNOWN_JOB`, final, no retry) | Signature verified by SmartAssess. The synthetic job is unknown, so nothing is written. **This is the pass after §M.** |
| `unreachable` / `gave-up` | Outbound 443 or DNS problem. |

The log lines contain only ids, counts, statuses and durations. Verify that no source or stdout appears:
`journalctl -u smartassess-runner -o cat --since "-5 min" | grep -c 'sum(map' ` must print `0`.

## M. SmartAssess API configuration (SWA)

**M.1** Portal → the Static Web App → Settings → **Environment variables** → **Production** → add or update:

| Name | Value |
|---|---|
| `CODING_RUNNER_URL` | `https://<RUNNER_FQDN>` |
| `CODING_RUNNER_HMAC_KEY` | = runner `RUNNER_HMAC_KEY` (from Key Vault) |
| `CODING_GRADING_CALLBACK_HMAC_KEY` | = runner `SMARTASSESS_CALLBACK_HMAC_KEY` (from Key Vault) |
| `CODING_GRADING_SWEEP_HMAC_KEY` | the sweep key (from Key Vault). Different from both. |
| `CODING_RUNNER_ENABLED` | leave unset (or `true`). Set `false` to stop new runner traffic. |

**Apply**/Save (the API restarts). If the API is a *linked* Function App instead of managed functions, set the same names
in that Function App's configuration. A Key Vault reference is fine where the plan supports it.

**M.2** Re-run the §L probe: the callback status must now be **404**.

**M.3** API→Runner key pair: sign in as a **synthetic test student** in a test class and open
`https://white-grass-0ce642c10.7.azurestaticapps.net/api/coding/capabilities` → `{"ok":true,"available":true,"languages":[…3…]}`.
On the runner: `runner.request.unauthorized` must **not** appear, and `journalctl` shows no 401s for `caps_` request ids.

**M.4 End-to-end official grading** (synthetic data only): as a test teacher, create a test assignment in the test class with
one **Python** coding question in *hidden tests* mode (e.g. "read two integers, print their sum", 2 hidden tests:
`1 2`→`3`, `5 7`→`12`), assign it to the synthetic student, then submit a correct answer as that student. Verify:
- runner: one `runner.official.accepted`, one `runner.official.completed` with `success:2`, one `runner.callback.delivered`
  with `status 200`, and `sweptContainers`/leftovers 0;
- SmartAssess teacher review: the coding question is auto-graded full marks, and the gradebook shows no "pending" badge;
- a practice **Run** in the student editor returns output;
- `sudo docker ps -aq --filter label=smartassess.coding-runner=1` is empty;
- no source or stdout in the journal (`grep -c` as in §L returns 0).
Delete or archive the synthetic assignment afterwards per school policy.

## N. Recovery activation (17D-A)

1. Confirm the SWA has all four: `CODING_RUNNER_URL`, `CODING_RUNNER_HMAC_KEY`, `CODING_GRADING_CALLBACK_HMAC_KEY`,
   `CODING_GRADING_SWEEP_HMAC_KEY` (the values are pairwise different).
2. GitHub → repository → Settings → Secrets and variables → Actions:
   - **Secret** `CODING_GRADING_SWEEP_HMAC_KEY` = the sweep key;
   - **Variable** `SMARTASSESS_GRADING_SWEEP_URL` = `https://white-grass-0ce642c10.7.azurestaticapps.net/api/coding/grading-sweep`.
3. Actions → **Coding Grading Recovery** → *Run workflow* (branch `main`).
4. Expected log line: `HTTP 200 status=completed …`, or `409 SWEEP_BUSY` (both exit 0). `503` means the sweep key is
   missing or equals another key. `401` means the GitHub secret and the SWA value differ.
5. Watch two or three scheduled runs (every 10 min). On the runner, a backlog drains as ≤ 12 dispatches per sweep, which the
   queue of 16 absorbs. Occasional `runner.official.busy` during the first drain is expected and self-heals through backoff.

## O. Final verification checklist

- [ ] E.3 acceptance suite passed on this host; three `17c-v1` images present.
- [ ] `smartassess-runner`, `docker` and `caddy` are active and enabled. After `sudo reboot`, everything returns and `/data/smartassess-runner` is mounted.
- [ ] `ss -ltnp`: only 22, 443 and `127.0.0.1:8787`. Nothing on 80, 2375 or 2376. The NSG matches A.3, and UFW is active.
- [ ] `https://<RUNNER_FQDN>/healthz` returns `{"ok":true}` with a valid certificate. The availability test is green and the certificate alert is configured.
- [ ] K `caps` + `execute` give CHECK PASS. L probe gives 404. M.3 capabilities via the API work. M.4 e2e is fully graded.
- [ ] N: the manual Recovery run returns 200 or 409 SWEEP_BUSY, and scheduled runs are green.
- [ ] `secrets.env` is `root:root 0600`. The three keys are pairwise different and escrowed in Key Vault. The VM has no managed identity, and the sweep key is absent from the VM (`sudo grep -rl SWEEP /etc/smartassess-runner` prints nothing).
- [ ] `getent group docker` lists only `smartassess-runner`.
- [ ] No leftover sandboxes. The health timer is logging. The weekly prune timer is enabled.
- [ ] Recorded: `<RELEASE_SHA>`, VM size, `<RUNNER_FQDN>`, date, operator.

## Updating the Runner later

Choose a quiet window (J.3 idle) and verify the new SHA is on `origin/main`. Then:
`sudo git -C /opt/smartassess-runner/app fetch origin main && sudo git -C /opt/smartassess-runner/app checkout --detach <NEW_SHA>`.
If `runner/workers/**` or `runner/gateway/registry.js` changed, rebuild the images (E) and re-run E.3 in a throwaway clone.
Then `sudo systemctl restart smartassess-runner` → J + K. Until 17D-B2 lands, a restart drops queued or running official jobs,
and 17D-A recovery re-dispatches them after the 30-min stale threshold.

## Disable / roll back quickly

- Stop new work, keep accepting callbacks: SWA `CODING_RUNNER_ENABLED=false`.
- Stop official grading only: remove `SMARTASSESS_CALLBACK_BASE_URL` on the runner and restart (`503 GRADING_UNAVAILABLE`).
- Pause recovery: disable the *Coding Grading Recovery* workflow.
- Full stop: `sudo systemctl stop smartassess-runner caddy` (the stop hook removes sandboxes).

## Observations from the audit (no code change made)

1. `RUNNER_OFFICIAL_CASE_CONCURRENCY` values above 2 have no effect: the global official slot pool is fixed at 2 because
   `main.js` does not pass `officialMaxContainers`. This plan uses 2, so nothing is affected.
2. All official runner state is in memory, so any restart loses queued or running jobs. That is 17D-B2's scope; 17D-A
   recovery covers it after 30 min.
3. SWA **managed** Functions cap an HTTP request at roughly 45 s, while a worst-case practice run (Java/C# with the maximum
   10 s limit) can hold the gateway about 50 s. This is a pre-existing application-level edge case, not a deployment blocker.
4. Node 22 reaches end of life on 2027-04-30. Plan the Node 24 move through CI.
