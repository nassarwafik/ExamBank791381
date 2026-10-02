# SmartAssess Coding Runner (Phase 17B practice · Phase 17C official grading)

The **only** place in this repository where student code is executed. The SmartAssess web app (`src/`) and API (`api/src/`)
never execute student code; they forward an authenticated, minimal request to this gateway, which runs it in **one disposable,
hardened Docker runtime sandbox per execution** (Java / C# are compiled beforehand in a separate compile sandbox) and returns a
bounded result. V1 supports exactly **Python, Java and C#**.

Two paths share the images, the hardened sandbox profile and the request-signing key:

- **Practice** (Phase 17B) — `POST /v1/execute`: one run with the student's own stdin; the result is shown to the student only.
- **Official grading** (Phase 17C) — `POST /v1/official-grading-jobs`: SmartAssess sends an opaque job (`jobId`, language,
  source, `cases: [{ token, stdin }]`, limits — never expected outputs, weights, titles, marks or any identity). The gateway
  answers `202`, compiles ONCE (Java / C#), runs every hidden case in a FRESH runtime container with no in-container grading
  supervisor (a trusted entry materialises the program, writes a fixed exec marker and `execve()`s it), derives each case
  status itself from what it observed (marker, exit code, wall clock, byte counts) and delivers the RAW evidence back to
  SmartAssess through a signed callback. **The runner executes; SmartAssess compares, weights and decides the grade.**

```
Browser ──(student session)──▶ SmartAssess API  /api/coding/run
                                   │  identity from auth · authoritative assignment / attempt / question checks · server limits
                                   │  distributed rate limit · minimal request · HMAC-SHA256 signature
                                   ▼
                     Coding Runner Gateway  (runner/gateway, this package)
                                   │  verify signature / freshness / replay · validate · registry → fixed image
                                   │  bounded concurrency (503 RUNNER_BUSY) · hard wall clock · result cap
                                   ▼
        Java / C#: a COMPILE sandbox (compile allowance, compiler only) → bounded artifact → then, for every language:
                     ONE runtime docker run --rm … smartassess-coding-<language>:17c-v1   (cgroup ceiling = memoryMb + fixed overhead)

Official grading (Phase 17C):
SmartAssess API (after the attempt commit) ──signed POST /v1/official-grading-jobs──▶ gateway ──202──▶ bounded official queue
   → compile ONCE (Java / C#) → per hidden case: a FRESH runtime container (gateway-captured stdout / stderr / exit / timeout)
   → raw evidence ──POST <SMARTASSESS_CALLBACK_BASE_URL>/api/coding/grade-callback (SA-CODING-CALLBACK-1, own HMAC key)──▶
   SmartAssess compares with the stored comparator, weights, scores, rebuilds the attempt totals
```

## Layout

| path | what |
|---|---|
| `gateway/main.js` | entry point (`npm start`); reads `RUNNER_*` settings, sweeps leftover sandboxes, listens |
| `gateway/server.js` | HTTP surface: `GET /healthz`, signed `GET /v1/capabilities`, signed `POST /v1/execute`, signed `POST /v1/official-grading-jobs` (17C) |
| `gateway/official.js` | 17C: strict official job validation, payload-hash dedupe (`JOB_ID_CONFLICT`), bounded queue (`RUNNER_BUSY`), server-owned job wall, result cache |
| `gateway/callback.js` | 17C: fixed callback destination from the host config, SA-CODING-CALLBACK-1 signing, raw-evidence-only body, no redirects; 17D-B2: one classified attempt per call (`attempt()`) |
| `gateway/journal.js` | 17D-B2: the DURABLE journal of official jobs (`RUNNER_JOURNAL_DIR`, file per job, atomic rename + fsync, lock, bounded scans, quarantine, fail-closed on ephemeral storage) |
| `gateway/auth.js` | request signing / verification (HMAC-SHA256, ±60 s, replay guard, constant-time compare) |
| `gateway/validate.js` | the one accepted request shape (exact allow-list, bounded fields) |
| `gateway/registry.js` | `python@1` / `java@1` / `csharp@1` → fixed image + fixed resource ceilings (data only) |
| `gateway/sandbox.js` | the ONLY module that starts a process: `docker` with a fixed argv, `shell: false` |
| `workers/supervisor.py` | in-sandbox supervisor (PID 1, uid 10001): practice compile → run → cap output → JSON result; 17C official frame (`SAOFF1`): materialise → exec marker → `execve` (no result reporting) |
| `workers/<language>/` | `Dockerfile` (digest-pinned official bases) + `toolchain.json` (commands as data) |
| `scripts/build-images.sh` | builds the three worker images (`docker build --network none`) |
| `tests/unit/` | gateway unit tests (no Docker): `npm test` |
| `tests/docker/` | REAL Docker functional + security + end-to-end tests (practice): `npm run test:docker:security` |
| `tests/docker-official/` | REAL Docker official grading tests (17C, incl. an end-to-end run through the real API handlers): `npm run test:docker:official` |

No third-party dependencies (Node ≥ 22 built-ins only). Not an Azure Function, not part of the Vite build.

## Toolchains (verified, pinned)

| contract | toolchain | image source (pinned by sha256 digest in the Dockerfile) |
|---|---|---|
| `python@1` | CPython **3.13.15** | official `python:3.13-slim` (Debian 13) |
| `java@1` | Eclipse Temurin OpenJDK **21.0.12.1+1 LTS** — `javac` then `java Main` | official `eclipse-temurin:21-jdk` (JDK copied onto the python base) |
| `csharp@1` | .NET SDK **10.0.401** / runtime **10.0.12 LTS** — offline Roslyn `csc` then `dotnet exec` | official `mcr.microsoft.com/dotnet/sdk:10.0` (SDK copied onto the python base) |

Every image runs the same supervisor on the same Python base; no package manager runs at build or run time.

## Sandbox hardening (every run)

`--rm` · random name + runner label · `--pull never` · `--network none` · `--read-only` · `--cap-drop ALL` ·
`--security-opt no-new-privileges` · `--user 10001:10001` · `--pids-limit 128` · `--cpus 1` · `--memory` = `--memory-swap` ·
`--ulimit core=0` · tmpfs `/workspace` and `/tmp` (`nosuid,nodev,noexec`, size-capped) · `--log-driver none` · no bind
mounts / volumes / docker.sock / environment / entrypoint override. The job travels on **stdin** (never argv, env or a host
file). Inside: rlimits (core, file size, open files, CPU backstop, Python address space), `oom_score_adj=1000` for the program,
JVM `-Xmx` / .NET `GCHeapHardLimit` = the question's memory limit, output capped **while reading**, process group killed at
the time limit; the gateway kills the container by name at the hard wall and always force-removes it.

**Memory:** a compiled language (Java, C#) is compiled in a separate disposable sandbox whose ceiling is the compiler's
allowance (768 / 1024 MB) and which never runs student code. The program then runs in a NEW sandbox whose cgroup ceiling —
covering the whole process tree, native memory and child processes — is `memoryMb + 128` (Java), `memoryMb + 96` (C#) or
`memoryMb + 64` (Python). See `docs/enterprise-coding-assessment-17b.md` §11a and `tests/docker/memory-isolation.rtest.js`.

## Local development (TEST key only)

```sh
# 1. build the worker images (needs Docker)
npm --prefix runner run build:images
# 2. start the gateway with a throw-away TEST key (never reuse it anywhere else)
RUNNER_HMAC_KEY="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')" npm --prefix runner start
# 3. point a LOCAL Functions host at it (api/local.settings.json is git-ignored):
#    CODING_RUNNER_URL=http://127.0.0.1:8787   CODING_RUNNER_HMAC_KEY=<the same TEST key>
# 4. (17C official grading) give BOTH sides a SECOND, different throw-away TEST key for callbacks:
#    gateway: SMARTASSESS_CALLBACK_BASE_URL=http://127.0.0.1:7071  SMARTASSESS_CALLBACK_HMAC_KEY=<callback TEST key>
#    API:     CODING_GRADING_CALLBACK_HMAC_KEY=<the same callback TEST key>
```

Phase 17D-B2: official grading ALSO needs a durable journal — `RUNNER_JOURNAL_DIR` = an absolute directory on a persistent disk
of the runner host (never tmpfs / a container layer / the Azure temporary disk); every accepted job is journaled before the
`202`, so a gateway restart resumes queued jobs, re-runs interrupted ones (bounded) and retries callbacks from durable results
without re-executing student code. The journal lock is bound to the PID and the kernel boot id, so a lock left by an
unclean host stop never blocks the gateway after a reboot, while a second live gateway on the same journal is still refused.
For local development only: `RUNNER_JOURNAL_DIR=$(mktemp -d) RUNNER_JOURNAL_ALLOW_EPHEMERAL=1`.
See `docs/enterprise-coding-assessment-17d-b.md` (Phase 17D-B2).

Official grading is **disabled** (`503 GRADING_UNAVAILABLE`) unless the callback destination is valid: `https://` (plain
`http://` only for a loopback host), no credentials / path / query, a key of ≥ 32 characters that differs from
`RUNNER_HMAC_KEY`. If the two raw secrets are set and equal, the gateway refuses to start, even when the callback URL is
missing or invalid. Queue bounds: `RUNNER_OFFICIAL_MAX_PENDING` (1..64, default 8), `RUNNER_OFFICIAL_MAX_ACTIVE` (1..4,
default 1), `RUNNER_OFFICIAL_CASE_CONCURRENCY` (1..4, default 2). Keys are held in memory only and never logged.

`http://` is accepted by the API **only** for `localhost` / `127.0.0.1` / `[::1]`; anything else must be `https://`.

## Tests

```sh
npm --prefix runner test              # gateway unit tests (auth, validation, registry, argv, HTTP, bounded reads)
npm --prefix runner run build:images
npm --prefix runner run test:docker   # both groups below
npm --prefix runner run test:docker:security   # practice: per-language functional + security (shell injection, network, env
                                               # canaries, host-file canary, timeout / orphans, memory, output flood, fork bomb)
                                               # + API→gateway e2e
npm --prefix runner run test:docker:official   # 17C: raw-runtime authority (stdout can never forge a status), compile once /
                                               # fresh container per case, cross-case isolation, per-case limits, cleanup,
                                               # end-to-end through the real API handlers (needs `npm ci --prefix api`)
```

CI: `.github/workflows/coding-runner-security.yml` ("Coding Runner Security & Smoke Tests", no secrets).

Full design, threat model, deployment and operations: `docs/enterprise-coding-assessment-17b.md` (practice) and
`docs/enterprise-coding-assessment-17c.md` (official hidden-test grading).
