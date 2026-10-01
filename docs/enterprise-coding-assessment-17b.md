# Phase 17B — Secure Coding Execution Runner V1

Baseline: `fe086e36310d941317d8d276e1df22e9f813b293` (`origin/main`, merge of PR #231, post-merge run #870 green).
Builds on [Phase 17A](enterprise-coding-assessment-17a.md) (the `coding@1` engine core). No parallel coding model: the
question type, the `code` Answer, the language registry, the execution contract, the provider seam and the client seam of
17A are reused unchanged in shape.

## 1. Objective and scope

Real, **isolated** execution of student code for **Python, Java and C# only**, for **practice**:

- a student presses «تشغيل» on a coding question during a writable attempt and sees the program's real output;
- the code runs in **one disposable, hardened Docker runtime sandbox per execution** (Java / C# are first compiled in a separate
  compile sandbox — §11a), behind an authenticated gateway, on a host that holds **no** application secrets;
- **no official grading change**: `coding@1` stays manual (score 0, `manualReview: true`); `weightedPassFraction` stays
  unwired; hidden tests never reach the browser or the practice path. Authoritative hidden-test grading is **Phase 17C**.

Out of scope (deferred): hidden-test execution and automatic marks (17C), teacher preview runs, queues, multiple files,
packages, network access for programs, additional languages.

## 2. Architecture and trust boundaries

```
Browser (student)                                         TRUST: untrusted input (source, stdin)
   │  Authorization: Bearer <student session>   (added by StudentExamPage; never in the body / Answer / storage)
   ▼
SmartAssess API — Azure Functions                         TRUST: holds app secrets; NEVER executes code
   POST /api/coding/run · GET /api/coding/capabilities
   │  identity from the session · authoritative assignment / class / attempt / timer / question checks
   │  question-derived limits · distributed run budget · server request id
   │  HMAC-SHA256 signed, minimal request (no identity, no token, no exam, no hidden tests)
   ▼
Coding Runner Gateway — runner/gateway (separate host)    TRUST: holds ONLY the runner signing key; knows no students
   │  verify signature / freshness / replay · validate · registry → fixed image · bounded concurrency · hard wall
   ▼
ONE Docker sandbox per run (--rm, no network, read-only, no capabilities, non-root, limits)   TRUST: hostile
   supervisor (PID 1) → compile → run → capped output → one JSON line
```

- **Student code is hostile input.** It never executes inside `src/` or `api/src/` (architecture-guarded, §15).
- **Process-spawning production code exists only in `runner/`**, and inside it only in `runner/gateway/sandbox.js`
  (fixed `docker` argument array, `shell: false`).
- **No local fallback.** Without a complete, well-formed runner configuration the API answers `EXECUTION_UNAVAILABLE`.
- The gateway **knows nothing** about students, classes, exams, storage, hidden tests or marks.

## 3. Routes

### `POST /api/coding/run` (student session required)

Body — exactly these six fields (any other field, including `limits`, `timeMs`, `memoryMb`, `outputBytes`, `requestId`,
`testId`, `studentId`, `classId`, `image`, `command`, is **refused** with `REQUEST_INVALID`):

```json
{ "assignmentId": "…", "questionId": "…", "language": "python", "languageVersion": 1, "source": "…", "stdin": "…" }
```

Checks, in order (each refusal is a bounded `{ ok: false, code }`, `Cache-Control: no-store`):

| # | check | refusal |
|---|---|---|
| 1 | active student session (token + current `authVersion` + active / not archived) | 401 |
| 2 | strict body (six fields, types, ≤ 256 KB, stdin ≤ 16 KB UTF-8) | 400 `REQUEST_INVALID` |
| 3 | class not archived | 403 |
| 4 | assignment exists **in the student's class** (else no existence oracle) | 404 |
| 5 | assignment `published` | 403 |
| 6 | attempt writable now: `writeRejection(a, s, "saveDraft")` **and** `timerState(a, s).canWrite` — the same rules and the same timer as save / submit (not started, paused, expired, submitted, closed, not open → refused) | 403 / 409 |
| 7 | `bindCodeAnswerToQuestion` against the **published** question of `examSnapshot` (canonical id via `flattenQuestions`): coding@1, allowed language, the question's `sourceBytes` (≤ 64 KB) | 400 `CODE_QUESTION_MISMATCH` / 400 `CODE_LANGUAGE_NOT_ALLOWED` / 413 `CODE_SOURCE_TOO_LARGE` / 400 `REQUEST_INVALID` (unregistered language / version) |
| 8 | runner available and offering this language contract (checked **before** spending budget) | 503 `EXECUTION_UNAVAILABLE` / 422 `LANGUAGE_UNAVAILABLE` |
| 9 | distributed run budget (§9) | 429 `RATE_LIMITED` + `Retry-After` (storage failure → 503, fail closed) |
| 10 | execute through the provider (server-generated 128-bit request id; question-derived limits) | 503 `RUNNER_BUSY` / 502 `EXECUTION_FAILED` |

Success: `200 { ok: true, result: { status, stdout, stderr, exitCode?, durationMs? } }` — bounded and re-labelled by the
shared `normalizeExecutionResult`. **A run never writes answers, drafts, attempts or scores** (the only storage write is the
budget bucket).

### `GET /api/coding/capabilities` (student session required)

`200 { ok: true, available, languages: [{ key, languageVersion }] }` — the runner's real offer intersected with the
registry. No URL, image, host, IP or version strings.

## 4. Statuses and codes

Execution statuses (17A contract): `success`, `compile-error`, `runtime-error`, `timeout`, `output-limit`, `internal-error`.

Refusal codes: `EXECUTION_UNAVAILABLE`, `RUNNER_BUSY`, `RATE_LIMITED`, `REQUEST_INVALID`, `CODE_QUESTION_MISMATCH`,
`CODE_LANGUAGE_NOT_ALLOWED`, `CODE_SOURCE_TOO_LARGE`, `LANGUAGE_UNAVAILABLE`, `EXECUTION_FAILED` (plus the route-local
`ASSIGNMENT_UNAVAILABLE`, `CLASS_ARCHIVED`, `ATTEMPT_NOT_WRITABLE`).

## 5. Limits — always server-derived

`timeMs`, `memoryMb`, `outputBytes` come from the published question's public projection (each bounded by the platform
ranges; defaults 2000 ms / 256 MB / 64 KB when absent). The client cannot send limits. The gateway re-validates the same
ranges (timeMs 250–10 000, memoryMb 16–512, outputBytes 1 KB–256 KB, source ≤ 64 KB, stdin ≤ 16 KB).

## 6. Configuration (API) — fail closed

| setting | meaning |
|---|---|
| `CODING_RUNNER_URL` | gateway base URL; `https://` required (`http://` only for `localhost` / `127.0.0.1` / `[::1]`); no credentials, query or fragment |
| `CODING_RUNNER_HMAC_KEY` | signing key shared only with the gateway (≥ 32 chars, no whitespace) — not a session secret |
| `CODING_RUNNER_ENABLED` | optional kill switch (`false` / `0` disables; `true` / `1` / unset = enabled when configured) |

Missing, disabled or malformed → `available: false` / `503 EXECUTION_UNAVAILABLE`. The key is a non-enumerable property of
the config object (never serialised or logged). **Default = no runner configured = safe.**

## 7. Remote provider (`api/src/lib/coding/execution-provider.js`)

- `UNAVAILABLE_PROVIDER` kept; `resolveCodingExecutionProvider(deps)` → injected provider (tests) → remote provider only for
  an enabled config → otherwise UNAVAILABLE (a malformed injection never falls through).
- Request built by `buildExecutionRequest` (allow-list, no extra properties); result normalised by `normalizeExecutionResult`.
- Native `fetch`, `redirect: "error"`, `AbortSignal.timeout` (capabilities 5 s; execute 60 s > the gateway's hard wall),
  response bodies read with a byte cap (capabilities 16 KB; execute 12 × outputBytes + 64 KB), **no automatic retry**.
- Capabilities cached briefly per configuration (30 s on success, 5 s on failure).
- Gateway `503 RUNNER_BUSY` → `503 RUNNER_BUSY`; `422 LANGUAGE_UNAVAILABLE` → 422; anything else (non-200, unparseable,
  oversized, timeout, network) → `502 EXECUTION_FAILED`.

## 8. Request signing protocol (version 1)

```
x-sa-runner-protocol:   1
x-sa-runner-timestamp:  <unix seconds>
x-sa-runner-request-id: <id /^[A-Za-z0-9_-]{1,64}$/>
x-sa-runner-signature:  v1=hex(HMAC-SHA256(key, "SA-CODING-RUNNER-1\n" + METHOD + "\n" + path + "\n" + timestamp + "\n" + requestId + "\n" + hex(SHA-256(body))))
```

The gateway refuses missing / malformed headers, a wrong key, an altered body / method / path / id, a timestamp outside
±60 s, a **replayed** request id (bounded in-memory guard over the skew window) and a body whose `requestId` differs from the
signed one. The digest comparison uses `crypto.timingSafeEqual` on equal-length buffers. API signer
(`api/src/lib/coding/runner-protocol.js`) and gateway (`runner/gateway/auth.js`) are independent implementations pinned by a
parity test. The runner never receives student / teacher tokens, storage connection strings, OpenAI keys, database
credentials or session secrets.

## 9. Distributed run budget

`api/src/lib/coding/run-rate-limit.js`: a token bucket per **student + assignment** — **20 runs, refilling continuously over
5 minutes** — stored as a small blob (`platform/throttle/coding-run-<sha256>.json`, no identity in the name) and mutated
with the platform's ETag compare-and-set helper (`mutateJsonWithRetry`), so every Function instance shares one count.
Over budget → `429 RATE_LIMITED`, `Retry-After` = seconds until one run is available (also in the body). Invalid requests
and an unavailable runner never consume budget. A storage failure fails closed (`503 EXECUTION_UNAVAILABLE`). Source is
never logged.

## 10. The runner (`runner/`)

Independent deployable (Node ≥ 22 built-ins only, zero dependencies; not an Azure Function; not in the Vite graph). See
[`runner/README.md`](../runner/README.md).

- **Gateway** (`gateway/server.js`): `GET /healthz` → `{ ok: true }`; signed `GET /v1/capabilities`; signed
  `POST /v1/execute`. Body ≤ 512 KB (413 otherwise, before parsing). Bounded concurrency (`RUNNER_MAX_CONCURRENCY`, 1–16,
  default 2): beyond it **503 `RUNNER_BUSY` immediately** (no queue). One runtime sandbox per request (Java / C#: preceded by
  one separate compile sandbox — §11a).
- **Registry** (`gateway/registry.js`, data only): `python@1`, `java@1`, `csharp@1` → `smartassess-coding-<lang>:17b-v1` +
  compile timeout + memory model + pids / cpu / tmpfs sizes. Requests can never supply image, command, flags, entrypoint,
  mounts or environment.
- **Capabilities** report only contracts whose image exists on the host (`docker image inspect`, cached 30 s).
- **Start-up sweep** removes any container carrying the runner label (a crashed gateway's leftovers).
- Configuration (gateway host only): `RUNNER_HMAC_KEY` (required), `RUNNER_HOST` (default `127.0.0.1`), `RUNNER_PORT`
  (default 8787), `RUNNER_MAX_CONCURRENCY`.

## 11. Sandbox hardening

| control | how |
|---|---|
| disposable | `docker run --rm`, random name `sa-coding-<24 hex>`, label `smartassess.coding-runner=1`; the gateway always `docker rm -f`s it |
| offline | `--network none` (only `lo`; TCP / DNS fail — tested) |
| filesystem | `--read-only` root; tmpfs `/workspace` (32 MB) and `/tmp` (64 MB), both `nosuid,nodev,noexec`; no bind mounts, volumes or docker.sock |
| privileges | `--user 10001:10001`, `--cap-drop ALL` (CapEff 0), `--security-opt no-new-privileges` (NoNewPrivs 1), default seccomp, never `--privileged` |
| resources | `--pids-limit 128`, `--cpus 1`, `--memory` = `--memory-swap` (no swap), `--ulimit core=0`, `nofile=1024` |
| no secrets | no `-e` / `--env-file`; the docker CLI is spawned with an allow-listed environment (`PATH`, `HOME`, `DOCKER_HOST`) |
| logs | `--log-driver none` — student output is never stored in host logs |
| images | `--pull never` — only the locally built, digest-pinned images |
| input | the job (source or compiled artifact, stdin, limits) is written to the container **stdin** as JSON; never argv, env or a host file |
| process launch | `spawn("docker", <fixed array>, { shell: false })` — no shell, no interpolation |

**Inside** (`workers/supervisor.py`, PID 1, non-dumpable so the same-uid program cannot open its `/proc` fds / memory):
rlimits for the program (core 0, file size 16 MB, 256 open files, CPU-time backstop, Python address space),
`oom_score_adj = 1000` (the kernel kills the program, not the supervisor), a new session per step and a process-group kill
at the limit, output read **while the program runs** and cut at the cap (UTF-8-safe), one JSON result line.

**Time model:** Java / C# compile sandbox: compile timeout 20 s → `compile-error` ("Compilation timed out."), hard wall
20 s + 10 s. Runtime sandbox: program wall limit = `timeMs` → `timeout`; hard wall = timeMs + 10 s (Python: + its 10 s syntax
check, which runs inside the runtime sandbox). At a hard wall the gateway kills the container by name → `timeout`. No orphan
containers (tested after success, timeout, memory failure, compile failure and fork-bomb cases).

### 11a. Memory isolation — compile memory vs runtime memory (independent security review fix)

**The defect (reviewed HEAD `27595c3`).** One container compiled AND ran the program, so its cgroup ceiling had to be
`max(compileMemoryMb, memoryMb + runtimeOverheadMb)`: at least **768 MB for Java** and **1024 MB for C#**, even for a
question with `memoryMb = 64`. The program limits used then — JVM `-Xmx`, .NET `GCHeapHardLimit` — bound only the
**managed heap**. They do not bound native allocations, child processes or their descendants, and both images also contain
the Python runtime the supervisor uses. Real-Docker fail-first evidence at 64 MB (`runner/tests/docker/memory-isolation.rtest.js`):

| case | result on `27595c3` |
|---|---|
| cgroup ceiling read by the Java program | `805306368` (768 MB) |
| RF1 Java → `ProcessBuilder` child allocating 480 MB | `success`, `child-exit=0`, **`CHILD-ALLOCATED 480`** |
| RF2 C# → `System.Diagnostics.Process` child allocating 480 MB | `success`, `child-exit=0`, **`CHILD-ALLOCATED 480`** |
| RF3 C# `Marshal.AllocHGlobal` 480 MB, every page touched | `success`, **`NATIVE-ALLOCATED 480`** |

**The fix — two disposable sandboxes for compiled languages** (`gateway/sandbox.js`, `workers/supervisor.py`):

1. **Compile sandbox** (Java, C# only): same hardening as every sandbox (no network, read-only root, `--cap-drop ALL`,
   non-root, `no-new-privileges`, PID limit, noexec tmpfs, no secrets, no mounts). Cgroup ceiling = the toolchain's fixed
   **compile allowance** (`compileMemoryMb`: Java 768 MB, C# 1024 MB). It runs **only the trusted compiler** (`javac
   -proc:none`, offline Roslyn `csc` with no analyzers / generators) — student code never executes there — and returns a
   bounded artifact on stdout: regular files only, ≤ 256 files, ≤ 8 MB decoded, safe relative names (no absolute path,
   no `..`, no empty segment, no links). The container is then removed.
2. **Runtime sandbox** (every language): a NEW container whose cgroup ceiling is fixed by `docker run --memory /
   --memory-swap` **before any student code starts** and is derived only from the question:

   | contract | runtime ceiling (MB) | compile allowance (MB, compile sandbox only) |
   |---|---|---|
   | `java@1` | **`memoryMb + 128`** | 768 |
   | `csharp@1` | **`memoryMb + 96`** | 1024 |
   | `python@1` | **`memoryMb + 64`** | — (no compile sandbox; its syntax check runs inside the runtime sandbox) |

   The gateway re-validates the artifact and passes it to the runtime sandbox on stdin, **never the source**. The runtime
   supervisor refuses a compiled toolchain's job that carries source instead of an artifact, so it never compiles. The
   artifact exists only in gateway memory between the two containers; nothing is written to the host.

**Why this bounds child / native memory.** The runtime ceiling is the container's memory cgroup, which accounts for **every**
process in the container: the supervisor, the program's managed heap, native allocations, threads, child processes and
forked descendants. With `--memory-swap = --memory` there is no swap escape. The program runs with `oom_score_adj = 1000`
(inherited by its children), so on pressure the kernel kills the student process (or its child), not the supervisor, and the
supervisor still reports a bounded result. JVM `-Xmx` / .NET `GCHeapHardLimit` / Python `RLIMIT_AS` remain as defence in depth
only.

**Runtime overhead (measured, not guessed).** `runtimeOverheadMb` covers the supervisor (CPython, ~10 MB), the language
runtime's non-heap memory (JVM metaspace / code cache / threads, the .NET runtime, the CPython interpreter) and the page
cache of the program's files. Peak cgroup usage (`memory.peak` / `memory.max_usage_in_bytes`) with the program filling 80 %
of `memoryMb`:

| memoryMb | Java peak / ceiling | C# peak / ceiling | Python peak / ceiling |
|---|---|---|---|
| 16 | 41 / 144 MB | 27 / 112 MB | 28 / 80 MB |
| 64 | 88 / 192 MB | 67 / 160 MB | 67 / 128 MB |
| 256 | 239 / 384 MB | 220 / 352 MB | 220 / 320 MB |
| 512 | 504 / 640 MB | 425 / 608 MB | 426 / 576 MB |

The worst measured excess over `memoryMb` is ≈ 25 MB (Java), ≈ 11 MB (C#) and ≈ 12 MB (Python); each overhead keeps at
least a 3× margin above that, and RF8 keeps proving it (80 % of 256 / 512 MB succeeds in all three languages).

**What is and is not claimed.** The whole runtime process tree is bounded by `memoryMb + runtimeOverheadMb` — proven by
real-Docker tests that read the ceiling from inside the student program and attack it with child processes and native
memory. A program can therefore use somewhat more than `memoryMb` itself, up to the documented fixed overhead (this is
the runtime's own working memory). It is **not** claimed that a program is held to exactly `memoryMb` bytes.

**Post-fix real-Docker evidence (64 MB question):** Java ceiling read in the program = `(64 + 128) MB`; C# = `(64 + 96) MB`;
Python = `(64 + 64) MB`. RF1 Java child → `child-exit=137` (OOM-killed by the runtime cgroup), no sentinel. RF2 C# child →
`child-exit=137`, no sentinel. RF3 C# native → `runtime-error` (exit 137), no sentinel. RF4 / RF5 normal programs at 64 MB
succeed; RF6 compilation of a 400-method source at the minimum `memoryMb = 16` succeeds while the program's ceiling stays below
the compile allowance; RF7 no container / host temporary entry remains after success, memory failure, timeout and compile
failure; RF8 80 % of 256 / 512 MB succeeds.

**Mutation proof.** Temporarily giving the runtime sandbox the compile allowance again
(`Math.max(compileMemoryMb, memoryMb + overhead)`) makes RF-C, RF1, RF2, RF3 and RF6 fail on real Docker (the 480 MB child
and native allocations succeed again; the Java ceiling reads `805306368`), plus one runner unit test and one Vitest test;
after the revert the tree fingerprint is identical.

## 12. Toolchains (verified on 2026-10-01, pinned by digest)

| contract | toolchain | source image |
|---|---|---|
| `python@1` | CPython 3.13.15 — syntax check (`compile()`), then `python3 -I -S -B -X utf8 main.py` | `public.ecr.aws/docker/library/python@sha256:7c61056e61ac89e852de05f3dc6fa51a6dd2181797bceed46aa725dd7cb2cd3b` (official `python:3.13-slim`, Debian 13, glibc 2.41) |
| `java@1` | Eclipse Temurin OpenJDK 21.0.12.1+1 LTS — `javac -proc:none -d out Main.java`, then `java -Xmx… -cp out Main` | `public.ecr.aws/docker/library/eclipse-temurin@sha256:4d06038800655fe1211760cd561de70ef2ed7a47f5d69255e9834414602b7026` (official `eclipse-temurin:21-jdk`) |
| `csharp@1` | .NET SDK 10.0.401 / runtime 10.0.12 LTS — offline Roslyn `csc` against the SDK's reference assemblies (+ the `dotnet new console` implicit usings), then `dotnet exec` | `mcr.microsoft.com/dotnet/sdk@sha256:35d40304542c8689331f8cab17c65926cdf48fe711e289321d71924b230a7d29` (official `dotnet/sdk:10.0`) |

- All three images share the digest-pinned Python base (the supervisor's runtime). The JDK and the .NET SDK are copied
  from their official images (`COPY --from`, the pattern the Temurin images document). `public.ecr.aws/docker/library` is
  the Docker Official Images mirror on ECR Public (no Docker Hub rate limits).
- **Python:** single file, isolated mode (`-I -S`: no site-packages, no `PYTHON*` env), pip removed from the image.
- **Java:** entry class `Main`; compile then run; compile failure → `compile-error`; no Maven / Gradle.
- **C#:** top-level statements or a classic `Program.Main`; compile failure → `compile-error`; no project / restore / package
  manager; globalization-invariant. `DOTNET_EnableWriteXorExecute=0`: the runtime's W^X double-mapping needs an unbounded
  memfd that conflicts with the sandbox's 16 MB file-size rlimit (measured: "Out of memory." abort); inside a no-network,
  no-capability, non-root, disposable sandbox the file-size bound is the more valuable control.
- `docker build --network none`: build steps fetch nothing; only the pinned base layers are pulled by the daemon.

## 13. Student UI

- `StudentExamPage` provides a **generic** `StudentAttemptContext` (`src/questionTypes/studentAttemptContext.ts`):
  `{ assignmentId, request(path, init) }`. The request function adds the auth headers itself and only reaches same-origin
  `/api/…` paths — the **token never reaches the renderer**, the Answer, storage or the builder. This is the smallest general
  renderer seam (the canonical question id was already passed as `id`).
- The lazy coding renderer (`CodingResponse`) loads the lazy run client (`src/coding/codingRunClient.ts`) and wires the
  existing `CodingExecutionContext` contract to the API (an injected context still wins — tests). The teacher preview /
  builder provides no seam → the unavailable notice, no network call.
- One click = one run: «مدخلات التشغيل» (LTR, ≤ 16 KB, prefilled with the first public sample), «استخدام مدخلات: …» per
  public sample, «تشغيل». Results: Arabic status label, stdout / stderr as **text** in LTR `<pre>` boxes with bounded
  scrolling (no page overflow on mobile), announced through an always-present `aria-live="polite"` region; the button keeps
  focus (`aria-disabled` while running). A sample comparison is labelled «للتدريب فقط».
- Arabic messages: unavailable («تشغيل الكود غير متاح حاليًا؛ يمكن حفظ الإجابة وتسليمها للمراجعة.»), busy, rate-limited (with
  the server's seconds), source too large, attempt not writable, network, generic failure; status labels for
  compile / runtime / timeout / output-limit / internal.
- The Answer stays `{ kind, language, languageVersion, source }`; the 17A ingestion binding (saveDraft / pause / submit) is
  unchanged.

## 14. Observability

API: `coding.run.completed` (assignmentId, language, status, durationMs) and `coding.run.refused` (code, status, retry
seconds) through the redacting observability context. Gateway: `runner.execute.completed|failed|busy`,
`runner.request.unauthorized|refused` (request id, language, status, duration, reason). **Never** source, stdin, stdout,
stderr, hidden tests, tokens, signatures or keys (tested with canaries).

## 15. Architecture guards

`api/tests/coding-guards-17b.test.js` (and the updated `coding-guards-17a.test.js`):

- the **global** scan of `src/` + `api/src/` still forbids every execution primitive (eval, `new Function`, vm,
  child_process, worker_threads, exec / spawn / fork, non-literal import / require, string timers);
- inside `runner/`, `child_process` appears **only** in `gateway/sandbox.js`; no `shell: true`, exec, execFile, spawnSync;
- application code never imports `runner/`; the runner never imports platform storage, student / builder auth, grading,
  OpenAI, Azure SDKs or `src/` / `api/src/`, and never names an application secret;
- exactly three languages in the app registry, the gateway registry and the worker images; no language-literal branches;
- every `FROM` is digest-pinned; `USER 10001:10001`; supervisor entrypoint; no remote `ADD`, curl, package managers;
- no hidden tests / reference solutions / answer key / `weightedPassFraction` on the practice path; coding@1 still manual;
- the initial bundle never imports coding modules; the run client is imported only by the lazy renderer; the token is never
  in context data or browser storage; output is text only;
- the runner workflow uses no secrets; the SWA workflow keeps tests, build, lint and `needs: quality_gate`.

Deliberate 17A pin updates: `/api/coding/run` now exists (it forwards only, no container code); the autosave test now
allows exactly one `GET /api/coding/capabilities` (still no run, no other request).

## 16. Security tests (real Docker)

`runner/tests/docker/sandbox.rtest.js` + `memory-isolation.rtest.js` + `api-e2e.rtest.js` (required in CI, never skipped):

| case | proof |
|---|---|
| shell injection | `'; touch …; $(id) \`id\` && rm -rf /` in source and stdin arrive verbatim; no host marker file |
| network | TCP to 1.1.1.1 / 8.8.8.8 / 169.254.169.254 blocked, DNS fails, only `lo` |
| environment | fake canaries (`RUNNER_HMAC_KEY`, storage, OpenAI) in the gateway env are invisible in Python / Java / C# |
| host filesystem | host canary file absent; root read-only; no docker.sock; `/workspace` noexec; uid 10001; CapEff 0; NoNewPrivs 1 |
| timeout | infinite loops and detached sleepers → `timeout`, no container left |
| memory | Python / Java / C# allocations beyond the limit → `runtime-error` (MemoryError / OutOfMemoryError / heap hard limit) |
| memory isolation (§11a) | runtime cgroup ceiling read inside the program = `memoryMb + overhead` (< compile allowance); Java / C# child processes and C# native memory cannot exceed it (RF1–RF3); normal programs, minimum-memory compilation and 80 % of 256 / 512 MB still work (RF4–RF6, RF8); no leftovers (RF7) |
| output flood | stdout and stderr floods → `output-limit`, ≤ outputBytes, valid UTF-8, stopped quickly |
| process limit | fork bomb bounded by the PID limit; the next run still works; no container left |
| functional | per language: hello, stdin → stdout, compile / syntax error, runtime error, timeout; Java and C# compile → run |
| end-to-end | the API's remote provider (production config path, TEST key) → gateway → sandbox for all three languages; wrong key refused |

## 17. Local development (TEST key)

```sh
npm --prefix runner run build:images
RUNNER_HMAC_KEY="<random test key>" npm --prefix runner start          # binds 127.0.0.1:8787
# api/local.settings.json (git-ignored): CODING_RUNNER_URL=http://127.0.0.1:8787, CODING_RUNNER_HMAC_KEY=<same test key>
```

Never commit a key; never reuse the test key elsewhere.

## 18. Deployment (no real identifiers here)

1. A **dedicated** Linux VM (or equivalent) with Docker Engine — never the Functions host, never a host with application
   data or secrets. Keep the kernel and Docker patched; restrict inbound traffic to the TLS reverse proxy.
2. Check out the repository's `runner/` on that host, run `npm --prefix runner run build:images`.
3. Generate a strong random key in the platform's secret store; give it to the gateway as `RUNNER_HMAC_KEY` and to the
   Function App as `CODING_RUNNER_HMAC_KEY` (secret settings, never in the repository or logs).
4. Run the gateway as a service bound to `127.0.0.1` behind a TLS-terminating reverse proxy (HTTPS only); set
   `CODING_RUNNER_URL=https://<runner host>` on the Function App. Optionally restrict the proxy to the Function App's
   outbound addresses.
5. Verify: `GET /api/coding/capabilities` lists the three languages; a practice run succeeds; with
   `CODING_RUNNER_ENABLED=false` the platform returns to the safe unavailable state immediately.
6. Rotation: set the new key on both sides (brief `503 EXECUTION_UNAVAILABLE` / unauthorised window, no data impact).
7. Toolchain updates: change the pinned digest in the Dockerfile in a reviewed PR, rebuild, re-run the Docker suite.

## 19. Residual risks and hardening roadmap

- **Shared kernel.** A container is not a VM. For stronger isolation run the sandbox under gVisor (`--runtime runsc`) or
  Kata Containers on the dedicated host; the gateway needs no change beyond the runtime flag.
- **Same uid for supervisor and program.** Mitigated by the non-dumpable supervisor and PID 1 signal semantics; a program can
  still forge its *own* practice result (no grading impact in 17B). 17C must not trust in-sandbox reporting for marks
  without this analysis (e.g. per-test containers with outputs captured by the gateway).
- **Replay guard is per gateway process** (in-memory); multiple gateway replicas would each accept an id once within ±60 s.
- **Gateway responses are not signed** (TLS authenticates the gateway); responses are bounded and re-labelled by the API.
- **No teacher preview runs** and **no queue** in V1.

## 20. Test matrix

| suite | covers |
|---|---|
| `api/tests/coding-run-api-17b.test.js` | A1–A14: auth, identity from session, assignment / class / published / writable attempt, question binding, server limits, fail-closed, distributed rate limit, no mutation, request ids, telemetry, minimal capabilities |
| `api/tests/coding-runner-17b.test.js` | P1–P12: configuration fail-closed, signed minimal requests, signature verification (missing / malformed / stale / altered / replay), timing-safe compare, protocol parity, bounded single-shot transport, error mapping, gateway validation, registry, concurrency, hardening argv, spawn without shell |
| `api/tests/coding-guards-17b.test.js` | R1–R7 architecture / security guards (§15) |
| `src/coding/codingRun.17b.test.tsx` | U1–U10: attempt seam, minimal run body, Arabic messages, text-only LTR output, aria-live, stable focus, samples «للتدريب فقط», stdin bound, no Answer change, no token leak, real exam page + real handlers end to end |
| `runner/tests/unit/gateway.rtest.js` | gateway units without Docker |
| `runner/tests/docker/*.rtest.js` | §16 (incl. `memory-isolation.rtest.js`, §11a) |

## 21. Mutation matrix

One mutant at a time → targeted suites → revert → tree fingerprint (md5 of `git status --short` + `git diff` + every
untracked file) compared. M19 / M20 rebuild the Python worker image with the mutant, run the REAL Docker suite, then rebuild
from the restored source.

| id | mutation | targeted suites result | tree after revert | verdict |
|---|---|---|---|---|
| M1 | gateway skips the HMAC signature check | 4 failed / 33 passed (coding-runner-17b.test.js: 3 failed / 22 passed; gateway.rtest.js: 1 failed / 11 passed) | clean | **killed** |
| M2 | gateway accepts stale / future timestamps | 2 failed / 35 passed (coding-runner-17b.test.js: 1 failed / 24 passed; gateway.rtest.js: 1 failed / 11 passed) | clean | **killed** |
| M3 | gateway replay guard disabled | 2 failed / 35 passed (coding-runner-17b.test.js: 1 failed / 24 passed; gateway.rtest.js: 1 failed / 11 passed) | clean | **killed** |
| M4 | gateway accepts extra request fields (image / command) | 3 failed / 34 passed (coding-runner-17b.test.js: 2 failed / 23 passed; gateway.rtest.js: 1 failed / 11 passed) | clean | **killed** |
| M5 | sandbox without --network none | 2 failed / 35 passed (coding-runner-17b.test.js: 1 failed / 24 passed; gateway.rtest.js: 1 failed / 11 passed) | clean | **killed** |
| M6 | sandbox without --read-only | 2 failed / 35 passed (coding-runner-17b.test.js: 1 failed / 24 passed; gateway.rtest.js: 1 failed / 11 passed) | clean | **killed** |
| M7 | sandbox keeps Linux capabilities (no --cap-drop ALL) | 2 failed / 35 passed (coding-runner-17b.test.js: 1 failed / 24 passed; gateway.rtest.js: 1 failed / 11 passed) | clean | **killed** |
| M8 | docker spawned through a shell | 3 failed / 55 passed (coding-runner-17b.test.js: 1 failed / 24 passed; coding-guards-17b.test.js: 1 failed / 20 passed; gateway.rtest.js: 1 failed / 11 passed) | clean | **killed** |
| M9 | docker CLI inherits the gateway environment (secrets) | 2 failed / 35 passed (coding-runner-17b.test.js: 1 failed / 24 passed; gateway.rtest.js: 1 failed / 11 passed) | clean | **killed** |
| M10 | gateway concurrency bound removed | 2 failed / 35 passed (coding-runner-17b.test.js: 1 failed / 24 passed; gateway.rtest.js: 1 failed / 11 passed) | clean | **killed** |
| M11 | API silently falls back to a local / fake provider | 3 failed / 53 passed (coding-runner-17b.test.js: 1 failed / 24 passed; coding-run-api-17b.test.js: 2 failed / 29 passed) | clean | **killed** |
| M12 | runner config accepts plain http to a public host | 2 failed / 54 passed (coding-runner-17b.test.js: 1 failed / 24 passed; coding-run-api-17b.test.js: 1 failed / 30 passed) | clean | **killed** |
| M13 | run route trusts client-supplied limits | 2 failed / 39 passed (coding-run-api-17b.test.js: 2 failed / 29 passed; codingRun.17b.test.tsx: 0 failed / 10 passed) | clean | **killed** |
| M14 | run route skips the attempt writability / timer check | 6 failed / 25 passed (coding-run-api-17b.test.js: 6 failed / 25 passed) | clean | **killed** |
| M15 | run route skips the published-question binding | 4 failed / 37 passed (coding-run-api-17b.test.js: 4 failed / 27 passed; codingRun.17b.test.tsx: 0 failed / 10 passed) | clean | **killed** |
| M16 | run route ignores the distributed run budget | 2 failed / 29 passed (coding-run-api-17b.test.js: 2 failed / 29 passed) | clean | **killed** |
| M17 | a practice run is written into the student's submission | 1 failed / 40 passed (coding-run-api-17b.test.js: 1 failed / 30 passed; codingRun.17b.test.tsx: 0 failed / 10 passed) | clean | **killed** |
| M18 | the UI stores the run result in the Answer | 1 failed / 9 passed (codingRun.17b.test.tsx: 1 failed / 9 passed) | clean | **killed** |
| M19 | [Docker] supervisor no longer enforces the output cap while reading | 1 failed / 12 passed (real Docker suite: 1 failed / 12 passed) | clean | **killed** |
| M20 | [Docker] supervisor no longer applies the Python address-space limit | 1 failed / 12 passed (real Docker suite: 1 failed / 12 passed) | clean | **killed** |

**20 / 20 killed**; fingerprint `e70a08986dc335f6` → `e70a08986dc335f6`.

## 22. Phase 17C handoff

17C adds authoritative hidden-test execution: server loads hidden tests (never sent to the browser) → one sandbox per test
(stdin of one test) → gateway-captured output → `compareOutput` with the stored comparator → `weightedPassFraction` by stable
test id → marks through the SmartAssess grader (the runner never decides a grade). It reuses the provider, protocol,
gateway, images and budget of 17B; it must address §19 (result authenticity per test) before trusting outputs for marks.
