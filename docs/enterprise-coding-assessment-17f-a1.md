# Phase 17F-A1 — Coding Production Pilot Deployment Engineering

> ⛔ Awaiting independent review. **No Azure resource was created or changed, no secret was generated, rotated or uploaded,
> no Runner was enabled.** Live activation is Phase 17F-A2 and requires the owner's approval.

**Scope:** the repository-side deployment package for running the **current** Coding Runner Gateway on one dedicated Azure
Linux VM for a bounded production pilot.

**Out of scope:** Runner / API behaviour changes (none were made) and the capacity / scale problems (Phase 17F-B).

| | |
|---|---|
| Baseline | `origin/main` `0fd6487b40a4b840170b90d6536de61bf0c2eac7` (merge of PR #242, Phase 17E-C) |
| Canonical runbook | [`runner/deploy/azure-vm/README.md`](../runner/deploy/azure-vm/README.md) |
| Parallel work | Phase 17E-D (teacher evidence UI) owns `src/` teacher components; 17F-A1 touches none of them |

## 1. Invariant (unchanged)
```
SmartAssess API ─signed─▶ HTTPS (Caddy :443) ─▶ 127.0.0.1:8787 Node gateway ─▶ hardened Docker worker ─▶ raw evidence
   ▲                                                                                                         │
   └────────────────────────────── signed callback ◀─────────────────────────────────────────────────────────┘
SmartAssess API = the only official grading authority.
```
`runner/gateway/*`, `runner/workers/*` and `api/src/*` are **byte-for-byte unchanged**.

## 2. Deliverables (`runner/deploy/azure-vm/`)
| Area | Files |
|---|---|
| Runbook + checklists | `README.md`, `activation-checklist.md` (23 steps), `a2-live-activation-checklist.md`, `rollback.md`, `smoke-matrix.md`, `crash-tests.md`, `monitoring-checklist.md`, `known-limits-17f-b-backlog.md` |
| Host configuration | `smartassess-runner.service`, `Caddyfile.example`, `runner.env.example`, `docker-daemon.json.example`, `journald-smartassess-runner.conf` |
| Operational tooling | `preflight.js` (start / readiness / verify-sandbox), `docker-api.js` (read-only Engine API client), `readiness.sh`, `smoke.js`, `journal-status.js`, `recovery-freshness.js`, `build-and-record-images.sh` + `record-images.js`, `sweep-containers.js` |

The tooling **reuses** the gateway's own modules:
- `readGatewayConfig`, `readJournalConfig`, `mountFor`, the registry and `createDockerSandbox` (preflight);
- `signRequest`, `signCallbackRequest`, `encodeCallbackBody` (smoke);
- `validateRecord` and `JOURNAL_LIMITS` (journal-status);
- `scripts/build-images.sh` (image build).

There is no second implementation of any protocol, limit or image list.

**Process boundary preserved.** The 17B architecture guard (`api/tests/coding-guards-17b.test.js` R1) requires that inside
`runner/` only `gateway/sandbox.js` starts processes, with literal requires only. The first version of the tools spawned the
docker CLI, and the full `npm test` run caught it. The tools were changed to start **no** process:
- Docker is queried through `docker-api.js`, a read-only `GET` client of the local Engine API socket that refuses TCP;
- the preflight's sandbox probe runs through `gateway/sandbox.js` itself.

The guard was then extended (test-only change, reviewed) with an **exact** inventory of the seven deployment tools and one new
assertion: the gateway never imports `deploy/`, and `docker-api.js` is GET-only with no container / exec / build / TCP
endpoint. **The process rule itself is not relaxed**; mutations PM25–PM27 prove the guard still fails on a process-starting
tool, a non-GET call or an unlisted file.

## 3. Key decisions
| Decision | Evidence |
|---|---|
| Journal path knob = the existing `RUNNER_JOURNAL_DIR` (no new setting); it must be **exactly the mount point** of the journal disk | `main.js` / `journal.js`; inventory parity test D3 |
| Mount fail-closed by three barriers: `RequiresMountsFor`, the preflight `journal` check (mount point, no symlink, ext4/xfs, owner, 0700, writable, free space), the immutable underlying directory | GAP test: the gateway's own gate **accepts** an unmounted or symlinked path (baseline behaviour, kept) |
| Loopback bind enforced by the preflight (production: exactly `127.0.0.1:8787`; non-loopback only with `--profile=development --allow-non-loopback-bind`) | local dev default unchanged (gateway default is already 127.0.0.1) |
| Activation / rollback switch = the existing `CODING_RUNNER_ENABLED` | `api/src/lib/coding/runner-config.js`: `false`/`0` disables, `true`/`1`/unset enables, anything else disables |
| Capacity guardrail derived from the code paths: practice `maxConcurrency` + official `max_k (k + min(2, (maxActive−k)·cc))` (compile containers are outside the 2 runtime slots) must be **< vCPUs** | pilot 1 + 2 = 3 < 4; the gateway default (2) fails on 4 vCPU; drift guard pins the slot count |
| Caddy, not nginx: automatic TLS; **3 MiB** body (> 2 MiB official max; nginx's 1 MB default would 413 valid jobs); **90 s** upstream (> 50 s worst practice wall, ≥ 60 s API timeout); only the 4 gateway routes; header-free access log | validated with Caddy v2.10.2; a real proxy test in front of a real gateway |
| systemd unit: preflight `ExecStartPre`, `Restart=on-failure` (10 s, ≤ 5 starts / 10 min), `KillMode=mixed` + 90 s for graceful practice drain, `ExecStopPost` label sweep, `ProtectSystem=strict`, no capabilities, **not** `PrivateDevices` (it would hide `/dev/disk/azure`, which the gateway's temporary-disk gate reads) | `systemd-analyze verify` clean; `systemd-analyze security` exposure 3.3 "OK" |
| Health model: liveness = existing `/healthz` (unchanged); readiness = local `preflight --mode=readiness` via `readiness.sh` in the service context; diagnostics = local `journal-status.js` (counts only). **No new HTTP route.** | — |
| Logging audit: no unsafe logging found (no keys, signatures, source, stdin, output or expected output logged); Caddy deletes headers from its access log | gateway sources; real Caddy run: 0 signature headers in 20 log lines |

## 4. Azure Static Web Apps constraints and pilot gates
| Gate | Constraint | A1 result | A2 requirement |
|---|---|---|---|
| **P1** | SWA API request ceiling **45 s** | Runner leg, near-worst legitimate requests: **Python 9.0 s, Java 10.7 s, C# 10.9 s** (real Docker, 4 vCPU) | measure browser → SWA → Runner → back. If a legitimate Java / C# run can exceed it: **DO NOT ACTIVATE JAVA/C# PRACTICE IN PRODUCTION** |
| **P2** | SWA request size **30 MB** | worst callback ≈ **6.45 MB** (gateway / API cap 8 MiB); the probe is accepted, authenticated and validated by the **real** API handler with **no write** | probe on production + one real near-max job applied once |
| **PV** | per-environment settings | the repository holds no Runner configuration for any environment; the API is fail-closed by default | verify previews do not inherit production Runner keys; otherwise disable Runner for previews |

## 5. Pilot guardrails (not school-scale)
- ≤ 64 official jobs per submission burst.
- ≈ 1,000 official jobs per rolling day.
- Java / C# official time limit ≥ 2000 ms (authoring policy).
- Worst-case sandbox containers < vCPU.

## 6. Tests
| Suite | Tests | Runs in |
|---|---|---|
| `runner/tests/unit/deploy-artifacts.rtest.js` | D1–D6, D12, D13, DOC (9) | `npm --prefix runner test` |
| `runner/tests/unit/deploy-preflight.rtest.js` | D7–D11, D9b, GAP, adversarial matrix, capacity / drift, helpers, T1–T7 tools (31) |
| `api/tests/coding-guards-17b.test.js` (extended) | R1 exact inventory incl. the deploy tools + the deploy-tool rule | `npm test` | `npm --prefix runner test` |
| `runner/tests/docker/deploy-preflight.rtest.js` | DP1 real-sandbox controls (3 toolchains), DP2 real daemon unreachable, DP3 smoke vs a real gateway + real sandboxes (3) | `test:docker:security` |
| `runner/tests/docker-official/deploy-callback-probe.rtest.js` | CP1–CP3 callback probe vs the REAL API handler, near-max, no write (with a positive control) (2) | `test:docker:official` |

### Fail-first (new tests copied onto unchanged `0fd6487`)
| Suite | Result on baseline |
|---|---|
| `deploy-artifacts.rtest.js` | **9 / 9 fail** (`ENOENT`: the deployment files do not exist) |
| `deploy-preflight.rtest.js` | **fails to load** (`Cannot find module '../../deploy/azure-vm/preflight.js'`) |
| `docker/deploy-preflight.rtest.js` | **fails to load** (same) |
| `docker-official/deploy-callback-probe.rtest.js` | **fails to load** (`smoke.js` missing) |

**Behavioural gap proven on unchanged code** (the GAP test passes on the baseline modules): `readJournalConfig` accepts
`/data/smartassess-runner` when the data disk is **not mounted** (the path then lives on the OS disk), and accepts a symlink
into the Azure temporary disk.

### Mutations (each applied alone, targeted suite run, restored byte-for-byte; tree fingerprint identical before / after)
**29 / 29 killed.** Highlights:
- PM1 remove `RequiresMountsFor`;
- PM2 public bind in the template;
- PM3 accept a reused HMAC;
- PM4 drop the journal mount-point check;
- PM5 drop the image check;
- PM6 drop the https rule;
- PM7 drop the symlink rejection;
- PM8 / PM8b weaken the bind check;
- PM9–PM11 Caddy at 1 MiB / 30 s / non-loopback upstream;
- PM12 a key value in the template;
- PM13 containers == vCPUs;
- PM14 a sandbox with network;
- PM15 smoke never detects replay;
- PM16 / PM17 / PM21 unit `Restart=always`, no preflight, `PrivateDevices`;
- PM18–PM20 env-file mode, Docker TCP listener, free space;
- PM22 slot drift;
- PM23 TCP `DOCKER_HOST`;
- PM24 loose image reference;
- PM25 `child_process` in a tool;
- PM26 non-GET Docker call;
- PM27 unlisted runner file.

Two first-round survivors were **equivalent mutants** caused by redundant defences:
- an http loopback callback is also refused by the "loopback in production" rule;
- 0.0.0.0 is also refused by the loopback rule.

The tests were strengthened (production refuses `http://127.0.0.1`, `::1` and `localhost`) and the mutants replaced by
non-equivalent ones (PM6 / PM6b, PM8 / PM8b).

## 7. Adversarial deployment matrix (all covered by tests)
| Attack | Result |
|---|---|
| journal path is a symlink / traverses a symlink | exit 20 |
| journal mount missing | exit 20 (and `RequiresMountsFor`) |
| journal on tmpfs / btrfs / the Azure temporary disk | exit 12 / 20 |
| journal wrong owner / 0755 / not writable / missing | exit 20 |
| journal or Docker disk nearly full | exit 21 / 31 |
| Docker socket missing / daemon stopped (real CLI) | exit 30 (no sandbox attempted) |
| Docker < 20.10 / cgroup v1 (production) / no seccomp | exit 30 |
| Docker API on TCP 2375 / 2376 | exit 41 |
| one worker image missing / drifted from the manifest | exit 32 |
| sandbox control violated (each of 13 controls) | exit 33 |
| port 8787 already in use | exit 40 |
| `RUNNER_HOST=0.0.0.0` / `::` / LAN address / port ≠ 8787 | exit 15 |
| public listener on 8787 | exit 41 |
| same HMAC for request + callback | exit 13 (and the gateway's own refusal) |
| weak / whitespace / placeholder / missing key; sweep key reused | exit 13 |
| callback `http://`, loopback, path / query / credentials | exit 14 |
| `RUNNER_JOURNAL_ALLOW_EPHEMERAL` in production | exit 12 |
| capacity ≥ vCPU / memory too small | exit 16 |
| env file group / world readable, not root, missing | exit 11 |
| invalid Caddy config | `caddy validate` in the runbook; static guard D4 |
| weakened gateway (replay guard off, wrong key, official disabled) | detected by `smoke.js` (T4) |

## 8. Validation
Recorded in the PR description: full validation chain, mutation campaign, CI.

## 9. Phase 17F-B backlog
[`known-limits-17f-b-backlog.md`](../runner/deploy/azure-vm/known-limits-17f-b-backlog.md): B1 queue depth, B2 journal capacity /
retention, B3 physical concurrency, B4 compile accounting, B5 scheduler reliability, B6 re-arm / generation exhaustion
(pilot: **Force Regrade** is the recovery path), B7 runtime mount / symlink hardening, B8 Java / C# start-up accounting, B9
host-load fairness, B10 school-scale load tests. **None of them is implemented here.**
