"use strict";
// Phase 17B — disposable Docker sandboxes for one execution. This is the ONLY production module in the repository that starts a
// process (architecture-guarded): it runs the Docker CLI with a FIXED argument array (spawn, shell: false, no string
// interpolation into a shell), never with anything a request can choose besides bounded numbers that were already validated.
//
// Hardening of every sandbox (docker run):
//   --rm, a random name + a runner label (so a crashed gateway's leftovers are found and removed), --pull never (offline,
//   pre-built images only), --network none, --read-only root filesystem, --cap-drop ALL, no-new-privileges, a numeric
//   non-root user, --pids-limit, --cpus, --memory = --memory-swap (no swap), core dumps off, a bounded tmpfs /workspace and /tmp
//   (nosuid, nodev, NOEXEC), --log-driver none (student output is never written to host logs), no bind mounts, no volumes,
//   no docker.sock, no environment variables, no entrypoint / command override (the image's supervisor is the entrypoint).
// Memory isolation (review fix): a compiled toolchain (Java, C#) uses TWO disposable sandboxes per execution —
//   1. a COMPILE sandbox (ceiling = the toolchain's fixed compile allowance) that runs only the trusted compiler and returns a
//      bounded artifact (≤ 256 files, ≤ 8 MB, validated relative names) on its stdout;
//   2. a RUNTIME sandbox whose cgroup ceiling is ONLY the question's memoryMb + the toolchain's fixed runtime overhead, set by
//      `docker run` before the program starts. It receives the artifact (never the source) and never compiles.
// The cgroup ceiling bounds the whole process tree (managed heap, native memory, child processes), so the compile allowance is
// never available to student code. Interpreted toolchains (Python) use the runtime sandbox only.
// The job (source / artifact, stdin, limits) is written to the container's STDIN as JSON — nothing touches the host filesystem,
// argv or the environment; the artifact lives only in gateway memory between the two sandboxes. The docker CLI itself receives
// an allow-listed environment (never the gateway's HMAC key). Every result stream is read with a hard byte cap; a hard wall
// clock per sandbox kills the container by name; every container is force-removed in every outcome.
//
// Phase 17C — OFFICIAL raw runtime (runOfficialSuite). For an official grading job there is no grading supervisor beside student
// code: a compiled toolchain is compiled ONCE in the compile sandbox above (trusted compiler only); then EVERY hidden case runs in
// a BRAND-NEW runtime sandbox (same hardening, same memoryMb + overhead cgroup ceiling) whose stdin is an exact-length setup frame
// (artifact / source + limits) followed by that case's stdin. The in-sandbox entry materialises the program, writes a fixed exec
// marker and execve()s the runtime — so THIS module observes the program directly: the status is derived here from the marker,
// the exit status, the wall clock and the byte counts, never from anything the program prints. A missing marker means student code
// never ran (internal-error, an infrastructure outcome). Global official container slots are bounded by server configuration.
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const { LANGUAGES, runtimeMemoryMb, compileWallMs, runWallMs, officialCaseWallMs } = require("./registry.js");

const SANDBOX_USER = "10001:10001";
const LABEL_KEY = "smartassess.coding-runner";
const LABEL = LABEL_KEY + "=1";
const NAME = /^sa-coding-[0-9a-f]{16,32}$/;
const STATUSES = ["success", "compile-error", "runtime-error", "timeout", "output-limit", "internal-error"];
const DOCKER_ENV_KEYS = ["PATH", "HOME", "DOCKER_HOST"];
const STDERR_MAX_BYTES = 65536;
const INTERNAL = Object.freeze({ status: "internal-error", stdout: "", stderr: "" });
const ARTIFACT_MAX_FILES = 256;
const ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;
const ARTIFACT_SEGMENT = /^[A-Za-z0-9_$][A-Za-z0-9_$.-]{0,127}$/;
const COMPILE_RESULT_MAX_BYTES = 12 * 1024 * 1024;              // base64 artifact (≤ 8 MB raw) + JSON framing / diagnostics
// Phase 17C — official raw runtime constants (mirrored by runner/workers/supervisor.py; parity-tested).
const OFFICIAL_EXEC_MARKER = "\u0000SA-EXEC-17C\u0000";
const OFFICIAL_MARKER_BYTES = Buffer.from(OFFICIAL_EXEC_MARKER, "latin1");
const OFFICIAL_STDERR_CAPTURE_BYTES = 4096;                     // forwarded stderr (diagnostics only)
const OFFICIAL_STDERR_FLOOD_BYTES = 64 * 1024;                  // stderr beyond this stops the program (output-limit)
const OFFICIAL_COMPILE_STDERR_BYTES = 32 * 1024;

const isRegistered = entry => !!entry && Object.values(LANGUAGES).includes(entry);

/** The complete `docker run` argument array for one sandbox. phase "run" (default): cgroup ceiling = memoryMb + the toolchain's
 *  runtime overhead; phase "compile": the toolchain's fixed compile allowance (compiled toolchains only). Throws on anything that
 *  is not a registry entry / a safe name / a known phase. */
function buildDockerRunArgs({ name, entry, limits, phase = "run" }) {
  if (typeof name !== "string" || !NAME.test(name)) throw new Error("invalid sandbox name");
  if (!isRegistered(entry)) throw new Error("unregistered language entry");
  if (phase !== "run" && !(phase === "compile" && entry.compileSandbox)) throw new Error("invalid sandbox phase");
  const memory = (phase === "compile" ? entry.compileMemoryMb : runtimeMemoryMb(entry, limits.memoryMb)) + "m";
  return [
    "run", "--rm", "-i",
    "--name", name, "--label", LABEL,
    "--pull", "never",
    "--network", "none",
    "--read-only",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--user", SANDBOX_USER,
    "--pids-limit", String(entry.pidsLimit),
    "--cpus", String(entry.cpus),
    "--memory", memory, "--memory-swap", memory,
    "--ulimit", "core=0:0", "--ulimit", "nofile=1024:1024",
    "--tmpfs", "/workspace:rw,nosuid,nodev,noexec,size=" + entry.workspaceMb + "m,uid=10001,gid=10001,mode=0700",
    "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=" + entry.tmpMb + "m,mode=1777",
    "--workdir", "/workspace",
    "--hostname", "sandbox",
    "--log-driver", "none",
    entry.image
  ];
}

/** The longest prefix of s within maxBytes UTF-8 bytes, never splitting a code point. */
function utf8Prefix(s, maxBytes) {
  if (Buffer.byteLength(s, "utf8") <= maxBytes) return { text: s, cut: false };
  let end = 0, bytes = 0;
  while (end < s.length) {
    const cp = s.codePointAt(end), w = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + w > maxBytes) break;
    bytes += w; end += cp > 0xffff ? 2 : 1;
  }
  return { text: s.slice(0, end), cut: true };
}

/** Re-labels and bounds whatever came out of a sandbox: unknown status → internal-error; stdout / stderr re-capped; only
 *  numeric exitCode / durationMs survive (nothing else a sandbox prints is ever forwarded). */
function boundResult(raw, outputBytes) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...INTERNAL };
  let status = STATUSES.includes(raw.status) ? raw.status : "internal-error";
  const out = utf8Prefix(typeof raw.stdout === "string" ? raw.stdout : "", outputBytes);
  const err = utf8Prefix(typeof raw.stderr === "string" ? raw.stderr : "", Math.min(outputBytes, STDERR_MAX_BYTES));
  if ((out.cut || err.cut) && status === "success") status = "output-limit";
  const result = { status, stdout: out.text, stderr: err.text };
  for (const k of ["exitCode", "durationMs"]) if (Number.isInteger(raw[k])) result[k] = raw[k];
  return result;
}

/** A compile sandbox's artifact, re-validated before it is handed to the runtime sandbox: [{ path, data(base64) }] with safe
 *  relative paths (no absolute path, no "..", no empty segment), ≤ 256 files and ≤ 8 MB decoded. null when anything is off. */
function validateArtifact(artifact) {
  if (!Array.isArray(artifact) || artifact.length === 0 || artifact.length > ARTIFACT_MAX_FILES) return null;
  const out = [], seen = new Set();
  let total = 0;
  for (const f of artifact) {
    if (!f || typeof f !== "object" || Array.isArray(f) || Object.keys(f).sort().join(",") !== "data,path") return null;
    if (typeof f.path !== "string" || f.path.length > 512 || typeof f.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(f.data)) return null;
    const parts = f.path.split("/");
    if (parts.length > 16 || parts.some(p => !ARTIFACT_SEGMENT.test(p) || p === "." || p === "..") || seen.has(f.path)) return null;
    seen.add(f.path);
    total += Buffer.from(f.data, "base64").length;
    if (total > ARTIFACT_MAX_BYTES) return null;
    out.push({ path: f.path, data: f.data });
  }
  return out;
}

/** Upper bound of the supervisor's JSON line for these limits (worst-case JSON escaping is 6 bytes per input byte). */
const resultCapBytes = outputBytes => 6 * (outputBytes + Math.min(outputBytes, STDERR_MAX_BYTES)) + 65536;

/** Phase 17C — the official setup frame: b"SAOFF1 " + 10-digit decimal length + b"\n" + JSON setup + the case's raw stdin. The
 *  in-sandbox entry reads exactly the header and the declared length, so the stdin that follows is never consumed by setup. */
function encodeOfficialFrame(setup, stdin) {
  const payload = Buffer.from(JSON.stringify(setup), "utf8");
  const header = Buffer.from("SAOFF1 " + String(payload.length).padStart(10, "0") + "\n", "ascii");
  return Buffer.concat([header, payload, Buffer.isBuffer(stdin) ? stdin : Buffer.from(String(stdin == null ? "" : stdin), "utf8")]);
}
/** Captured bytes → text bounded to maxBytes UTF-8 bytes (invalid sequences become U+FFFD, then re-bounded). */
const decodeBounded = (buf, maxBytes) => utf8Prefix(buf.toString("utf8"), maxBytes).text;
/** The execution status of one official runtime, derived ONLY from the gateway's own observation. */
function officialStatus(r) {
  if (!r.markerSeen || r.markerBad) return { status: "internal-error" };               // student code never started
  if (r.timedOut) return { status: "timeout" };
  if (r.overflow) return { status: "output-limit" };
  if (r.code === 0) return { status: "success", exitCode: 0 };
  if (Number.isInteger(r.code) && r.code > 0) return { status: "runtime-error", exitCode: r.code };
  return { status: "internal-error" };                                                 // the CLI vanished without an exit status
}
/** A bounded counting semaphore (global official runtime containers of this gateway). */
function createSlots(n) {
  let free = Math.max(1, n);
  const waiters = [];
  return {
    acquire(signal) {
      return new Promise((resolve, reject) => {
        const grant = () => { free--; let released = false; resolve(() => { if (released) return; released = true; free++; const w = waiters.shift(); if (w) w(); }); };
        if (free > 0) { grant(); return; }
        const w = () => grant();
        waiters.push(w);
        if (signal) signal.addEventListener("abort", () => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); reject(new Error("official suite aborted")); } }, { once: true });
      });
    }
  };
}

function createDockerSandbox({ dockerBin = "docker", spawnImpl = spawn, env = process.env, hardWallOverrideMs, capabilitiesCacheMs = 30000, officialWallOverrideMs, officialMaxContainers = 2 } = {}) {
  const dockerEnv = {};
  for (const k of DOCKER_ENV_KEYS) if (typeof env[k] === "string" && env[k] !== "") dockerEnv[k] = env[k];

  /** One docker CLI invocation: fixed argv, no shell, bounded stdout, bounded time. Never throws. */
  function invoke(args, { input, maxOut = 65536, timeoutMs = 30000, onAbort } = {}) {
    return new Promise(resolve => {
      let child;
      try { child = spawnImpl(dockerBin, args, { shell: false, env: dockerEnv, stdio: ["pipe", "pipe", "pipe"], windowsHide: true }); }
      catch { resolve({ code: -1, out: Buffer.alloc(0), overflow: false, timedOut: false }); return; }
      const chunks = [];
      let size = 0, overflow = false, timedOut = false, settled = false;
      const abort = () => { try { child.kill("SIGKILL"); } catch { /* already gone */ } if (onAbort) onAbort(); };
      const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
      const finish = code => { if (settled) return; settled = true; clearTimeout(timer); resolve({ code, out: Buffer.concat(chunks), overflow, timedOut }); };
      child.stdout.on("data", d => {
        if (overflow) return;
        size += d.length;
        if (size > maxOut) { overflow = true; chunks.length = 0; abort(); return; }
        chunks.push(d);
      });
      child.stderr.on("data", () => { /* docker CLI diagnostics are drained and never returned */ });
      child.on("error", () => finish(-1));
      child.on("close", code => finish(code));
      if (child.stdin) { child.stdin.on("error", () => { /* the container may exit before reading everything */ }); child.stdin.end(input === undefined ? undefined : input); }
    });
  }

  /** One disposable sandbox: fixed argv, the job on stdin, bounded output, a hard wall clock, always force-removed. */
  async function sandboxOnce(entry, phase, job, limits, wallMs, maxOut) {
    const name = "sa-coding-" + crypto.randomBytes(12).toString("hex");
    const args = buildDockerRunArgs({ name, entry, limits, phase });
    let r;
    try {
      r = await invoke(args, { input: JSON.stringify(job), maxOut, timeoutMs: hardWallOverrideMs || wallMs, onAbort: () => { void invoke(["kill", name], { timeoutMs: 10000 }); } });
    } finally {
      await invoke(["rm", "-f", name], { timeoutMs: 15000 });
    }
    if (r.timedOut) return { timedOut: true };
    if (r.overflow) return { parsed: null };
    const lines = r.out.toString("utf8").trim().split("\n");
    try { return { parsed: JSON.parse(lines[lines.length - 1]) }; } catch { return { parsed: null }; }
  }

  async function run(entry, request) {
    const limits = { timeMs: request.limits.timeMs, memoryMb: request.limits.memoryMb, outputBytes: request.limits.outputBytes, compileTimeoutMs: entry.compileTimeoutMs };
    let runJob;
    if (entry.compileSandbox) {
      // 1. COMPILE sandbox: the compiler's fixed allowance; student code never runs here.
      const c = await sandboxOnce(entry, "compile", { phase: "compile", source: request.source, stdin: "", limits }, limits, compileWallMs(entry), COMPILE_RESULT_MAX_BYTES);
      if (c.timedOut) return { status: "timeout", stdout: "", stderr: "" };
      if (!c.parsed || typeof c.parsed !== "object") return { ...INTERNAL };
      if (c.parsed.status === "compile-error") return boundResult(c.parsed, request.limits.outputBytes);
      const artifact = c.parsed.status === "compiled" ? validateArtifact(c.parsed.artifact) : null;
      if (!artifact) return { ...INTERNAL };
      runJob = { phase: "run", artifact, stdin: request.stdin, limits };
    } else {
      runJob = { phase: "run", source: request.source, stdin: request.stdin, limits };
    }
    // 2. RUNTIME sandbox: cgroup ceiling = memoryMb + runtime overhead, fixed before the program starts.
    const r = await sandboxOnce(entry, "run", runJob, limits, runWallMs(entry, request.limits.timeMs), resultCapBytes(request.limits.outputBytes));
    if (r.timedOut) return { status: "timeout", stdout: "", stderr: "" };
    if (!r.parsed) return { ...INTERNAL };
    return boundResult(r.parsed, request.limits.outputBytes);
  }

  let capsCache = null;
  /** Only the registry contracts whose image actually exists on this host (checked, cached briefly). */
  async function availableLanguages() {
    if (capsCache && Date.now() - capsCache.at < capabilitiesCacheMs) return capsCache.value;
    const value = [];
    for (const e of Object.values(LANGUAGES)) {
      const r = await invoke(["image", "inspect", "--format", "{{.Id}}", e.image], { timeoutMs: 10000 });
      if (r.code === 0) value.push({ key: e.key, languageVersion: e.languageVersion });
    }
    capsCache = { at: Date.now(), value };
    return value;
  }

  /** Removes every container carrying the runner label (left behind by a crashed gateway). */
  async function sweep() {
    const r = await invoke(["ps", "-aq", "--filter", "label=" + LABEL], { timeoutMs: 15000 });
    const ids = r.out.toString("utf8").split(/\s+/).filter(id => /^[0-9a-f]{12,64}$/.test(id));
    if (ids.length) await invoke(["rm", "-f", ...ids], { timeoutMs: 30000 });
    return ids.length;
  }

  // ── Phase 17C — official raw runtime ─────────────────────────────────────────────────────────────────────────────────────
  const slots = createSlots(officialMaxContainers);

  /** ONE brand-new runtime sandbox for ONE hidden case; resolves with the gateway's raw observation. Always force-removed. */
  function officialRuntimeOnce(entry, setup, stdinBuf, limits, signal) {
    const name = "sa-coding-" + crypto.randomBytes(12).toString("hex");
    const args = buildDockerRunArgs({ name, entry, limits, phase: "run" });
    const input = encodeOfficialFrame(setup, stdinBuf);
    const outCap = limits.outputBytes;
    const wallMs = officialWallOverrideMs || officialCaseWallMs(entry, limits.timeMs);
    return new Promise(resolve => {
      let child;
      try { child = spawnImpl(dockerBin, args, { shell: false, env: dockerEnv, stdio: ["pipe", "pipe", "pipe"], windowsHide: true }); }
      catch { resolve({ name, code: -1, markerSeen: false, markerBad: false, timedOut: false, overflow: false, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), durationMs: 0 }); return; }
      let head = Buffer.alloc(0), markerSeen = false, markerBad = false, execAt = 0, outSize = 0, errSize = 0, errTotal = 0;
      let timedOut = false, overflow = false, settled = false, killed = false, programTimer = null;
      const out = [], err = [];
      const kill = () => { if (killed) return; killed = true; try { child.kill("SIGKILL"); } catch { /* already gone */ } void invoke(["kill", name], { timeoutMs: 10000 }); };
      const wall = setTimeout(() => { if (markerSeen) timedOut = true; kill(); }, wallMs);
      const onAbort = () => kill();
      if (signal) { if (signal.aborted) kill(); else signal.addEventListener("abort", onAbort, { once: true }); }
      const finish = code => {
        if (settled) return; settled = true;
        clearTimeout(wall); if (programTimer) clearTimeout(programTimer);
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve({ name, code, markerSeen, markerBad, timedOut, overflow, stdout: Buffer.concat(out), stderr: Buffer.concat(err), durationMs: execAt ? Date.now() - execAt : 0 });
      };
      child.stdout.on("data", d => {
        if (!markerSeen) {
          if (markerBad) return;
          head = Buffer.concat([head, d]);
          const n = Math.min(head.length, OFFICIAL_MARKER_BYTES.length);
          if (!head.subarray(0, n).equals(OFFICIAL_MARKER_BYTES.subarray(0, n))) { markerBad = true; kill(); return; }
          if (head.length < OFFICIAL_MARKER_BYTES.length) return;
          // the marker is written by trusted setup code BEFORE execve: from here on, every byte is the program's stdout
          markerSeen = true; execAt = Date.now();
          programTimer = setTimeout(() => { timedOut = true; kill(); }, limits.timeMs);
          d = head.subarray(OFFICIAL_MARKER_BYTES.length); head = null;
          if (!d.length) return;
        }
        if (overflow) return;
        outSize += d.length;
        if (outSize > outCap) { overflow = true; const keep = d.length - (outSize - outCap); if (keep > 0) out.push(d.subarray(0, keep)); kill(); return; }
        out.push(d);
      });
      child.stderr.on("data", d => {
        errTotal += d.length;
        if (errSize < OFFICIAL_STDERR_CAPTURE_BYTES) { const keep = Math.min(d.length, OFFICIAL_STDERR_CAPTURE_BYTES - errSize); err.push(d.subarray(0, keep)); errSize += keep; }
        if (errTotal > OFFICIAL_STDERR_FLOOD_BYTES && markerSeen && !overflow) { overflow = true; kill(); }
      });
      child.on("error", () => finish(-1));
      child.on("close", code => finish(code));
      if (child.stdin) { child.stdin.on("error", () => { /* the program may exit before reading its stdin */ }); child.stdin.end(input); }
    }).then(async r => { await invoke(["rm", "-f", r.name], { timeoutMs: 15000 }); return r; });
  }

  /** Runs one validated official job: compile ONCE (compiled toolchains), then a fresh runtime sandbox per case (bounded case
   *  concurrency + global slots). Resolves with raw evidence { compile?, cases[] }; throws on any infrastructure failure. */
  async function runOfficialSuite(entry, job, { signal, caseConcurrency = 2 } = {}) {
    if (!isRegistered(entry)) throw new Error("unregistered language entry");
    const limits = { timeMs: job.limits.timeMs, memoryMb: job.limits.memoryMb, outputBytes: job.limits.outputBytes, compileTimeoutMs: entry.compileTimeoutMs };
    const ensureLive = () => { if (signal && signal.aborted) throw new Error("official suite aborted"); };
    let setupBase, compile;
    if (entry.compileSandbox) {
      const t0 = Date.now();
      const c = await sandboxOnce(entry, "compile", { phase: "compile", source: job.source, stdin: "", limits }, limits, compileWallMs(entry), COMPILE_RESULT_MAX_BYTES);
      ensureLive();
      if (c.timedOut || !c.parsed || typeof c.parsed !== "object") throw new Error("official compile sandbox failed");
      if (c.parsed.status === "compile-error") return { compile: { status: "compile-error", stderr: utf8Prefix(typeof c.parsed.stderr === "string" ? c.parsed.stderr : "", OFFICIAL_COMPILE_STDERR_BYTES).text, durationMs: Date.now() - t0 }, cases: [] };
      const artifact = c.parsed.status === "compiled" ? validateArtifact(c.parsed.artifact) : null;
      if (!artifact) throw new Error("official compile produced no valid artifact");
      compile = { status: "compiled", durationMs: Date.now() - t0 };
      setupBase = { phase: "official", artifact };                 // the artifact stays in gateway memory; the source never reaches the runtime
    } else setupBase = { phase: "official", source: job.source };
    const results = new Array(job.cases.length);
    let next = 0;
    const worker = async () => {
      while (next < job.cases.length) {
        const i = next++;
        ensureLive();
        const c = job.cases[i];
        const release = await slots.acquire(signal);
        let r;
        try { r = await officialRuntimeOnce(entry, { ...setupBase, limits }, Buffer.from(c.stdin, "utf8"), limits, signal); }
        finally { release(); }
        ensureLive();
        const st = officialStatus(r);
        const out = { token: c.token, status: st.status, stdout: decodeBounded(r.stdout, limits.outputBytes), stderr: decodeBounded(r.stderr, OFFICIAL_STDERR_CAPTURE_BYTES) };
        if (st.exitCode !== undefined) out.exitCode = st.exitCode;
        out.durationMs = r.durationMs;
        results[i] = out;
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(caseConcurrency, job.cases.length)) }, worker));
    return compile ? { compile, cases: results } : { cases: results };
  }

  return { run, availableLanguages, sweep, runOfficialSuite };
}

module.exports = { buildDockerRunArgs, createDockerSandbox, boundResult, validateArtifact, resultCapBytes, encodeOfficialFrame, OFFICIAL_EXEC_MARKER, OFFICIAL_STDERR_CAPTURE_BYTES, LABEL };
