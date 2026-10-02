"use strict";
// Phase 17F-A1 — host PREFLIGHT / READINESS gate of the Coding Runner Gateway on its dedicated Azure Linux VM.
//
// It never changes Runner semantics: it REUSES the gateway's own configuration reader (main.js readGatewayConfig), journal
// durability gate (journal.js readJournalConfig / mountFor), language registry (registry.js) and hardened sandbox (sandbox.js),
// and adds the HOST checks the gateway cannot make on its own (exact journal mount point, symlinks, free space, Docker daemon
// features and exposure, worker images, physical concurrency vs vCPUs, env-file permissions, loopback bind, port).
//
//   node deploy/azure-vm/preflight.js --mode=start       systemd ExecStartPre: every check; a failure keeps the gateway DOWN
//   node deploy/azure-vm/preflight.js --mode=readiness   while the service runs: liveness (/healthz) + cheap host checks
//   node deploy/azure-vm/preflight.js --mode=verify-sandbox   proves the container controls inside a REAL sandbox (all languages)
//   options: --profile=production (default) | development      --allow-non-loopback-bind (development profile only)
//            --env-file=/etc/smartassess-runner/runner.env     --image-manifest=/etc/smartassess-runner/images.manifest
//            --min-journal-free-mb=1024 --min-docker-free-mb=5120 --min-free-percent=10 --json
//
// Output: one line per check (PASS / FAIL / WARN, a stable check id and a reason). It NEVER prints a key, a key-derived value,
// a URL credential, student code or program output. Exit code: 0 when every check passes, otherwise the code of the FIRST failed
// check (see EXIT below); 2 = usage error.
const fs = require("node:fs");
const os = require("node:os");
const net = require("node:net");
const path = require("node:path");
const http = require("node:http");

// Literal requires only; this tool starts NO process (Docker is queried through the read-only Engine API client; the one
// sandbox it runs goes through the gateway's own sandbox.js — the only process-starting module of runner/).
const { readGatewayConfig } = require("../../gateway/main.js");
const { readJournalConfig, mountFor } = require("../../gateway/journal.js");
const { LANGUAGES, runtimeMemoryMb } = require("../../gateway/registry.js");
const { createDockerSandbox } = require("../../gateway/sandbox.js");
const { createDockerApi } = require("./docker-api.js");
const { storageSeparation } = require("./mountinfo.js");
const { parseImageManifest } = require("./image-manifest.js");
const RUNNER_PACKAGE = require("../../package.json");

const EXIT = Object.freeze({
  OK: 0, USAGE: 2,
  NODE: 10, ENV_FILE: 11, CONFIG: 12, KEYS: 13, CALLBACK: 14, BIND: 15, CAPACITY: 16,
  JOURNAL: 20, JOURNAL_DISK: 21, STORAGE: 22,
  DOCKER: 30, DOCKER_DISK: 31, IMAGES: 32, SANDBOX: 33,
  PORT: 40, EXPOSURE: 41, LIVENESS: 42
});
// The gateway's GLOBAL official runtime container slots: createDockerSandbox()'s default `officialMaxContainers`, which
// main.js never overrides (no env knob). Pinned by a drift guard in tests/unit/deploy-preflight.rtest.js. Phase 17F-B (B3).
const OFFICIAL_RUNTIME_SLOTS = 2;
const PRODUCTION = Object.freeze({ host: "127.0.0.1", port: 8787, journalFs: ["ext4", "xfs"], minDockerVersion: [20, 10] });
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const FORBIDDEN_DOCKER_PORTS = [2375, 2376];
const HOST_MEMORY_RESERVE_MB = 2048;          // OS + dockerd + Node gateway + Caddy
const DEFAULTS = Object.freeze({ minJournalFreeMb: 1024, minDockerFreeMb: 5120, minFreePercent: 10 });

// ── pure helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────
const clampInt = (v, lo, hi, d) => { const n = Number(v === undefined || v === "" ? d : v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : d; };
const versionAtLeast = (have, want) => { const h = String(have || "").split(/[.+-]/).map(n => parseInt(n, 10)); for (let i = 0; i < want.length; i++) { const x = Number.isFinite(h[i]) ? h[i] : 0; if (x !== want[i]) return x > want[i]; } return true; };
const minNodeVersion = () => { const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(RUNNER_PACKAGE.engines && RUNNER_PACKAGE.engines.node)); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [22, 12, 0]; };

/**
 * Worst-case number of sandbox containers the gateway can run AT ONCE, derived from the actual code paths:
 *   practice: each in-flight request runs ONE container at a time (compile, then run) → maxConcurrency;
 *   official: a job compiles in ONE container OUTSIDE the global runtime slots, then runs its cases through those slots
 *             (min(caseConcurrency, slots) per job). With k of the `maxActive` jobs compiling: k + min(slots, (maxActive − k) × cc).
 */
function physicalContainers({ maxConcurrency, maxActive, caseConcurrency, slots = OFFICIAL_RUNTIME_SLOTS }) {
  let official = 0;
  for (let k = 0; k <= maxActive; k++) official = Math.max(official, k + Math.min(slots, (maxActive - k) * caseConcurrency));
  return { practice: maxConcurrency, official, total: maxConcurrency + official };
}
/** Worst-case sandbox memory (MB) for the same pools, from the registry ceilings (largest toolchain everywhere). */
function worstSandboxMemoryMb({ maxConcurrency, maxActive, caseConcurrency, slots = OFFICIAL_RUNTIME_SLOTS }) {
  const entries = Object.values(LANGUAGES);
  const compileMax = Math.max(...entries.map(e => e.compileMemoryMb || 0));
  const runtimeMax = Math.max(...entries.map(e => runtimeMemoryMb(e, 512)));
  let official = 0;
  for (let k = 0; k <= maxActive; k++) official = Math.max(official, k * compileMax + Math.min(slots, (maxActive - k) * caseConcurrency) * runtimeMax);
  return maxConcurrency * Math.max(compileMax, runtimeMax) + official;
}

/** LISTEN sockets from /proc/net/tcp{,6} text → [{ address, port }] (address "127.0.0.1", "::1", "0.0.0.0", "::" or "other"). */
function parseListeners(text, v6) {
  const out = [];
  for (const line of String(text || "").split("\n").slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 4 || f[3] !== "0A") continue;
    const [addr, portHex] = f[1].split(":");
    const port = parseInt(portHex, 16);
    let address = "other";
    if (!v6) address = addr === "0100007F" ? "127.0.0.1" : addr === "00000000" ? "0.0.0.0" : /7F$/i.test(addr) ? "127.x" : "other";   // little-endian: 127.a.b.c ends in 7F
    else address = addr === "00000000000000000000000001000000" ? "::1" : addr === "00000000000000000000000000000000" ? "::" : "other";
    out.push({ address, port });
  }
  return out;
}
const isLoopbackListener = l => l.address === "127.0.0.1" || l.address === "127.x" || l.address === "::1";

/** Parses a systemd EnvironmentFile (KEY=VALUE, comments, optional quotes) — used only when --env-file is read directly. */
function parseEnvFile(text) {
  const env = {};
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

// ── the in-sandbox control probe (runs as STUDENT CODE in the real hardened practice sandbox) ──────────────────────────────
const SANDBOX_PROBE = {
  python: [
    "import os, json, socket",
    "r = {}",
    "st = open('/proc/self/status').read().splitlines()",
    "f = lambda n: next((l.split(':', 1)[1].strip() for l in st if l.startswith(n + ':')), None)",
    "r['uid'] = os.getuid(); r['capEff'] = f('CapEff'); r['noNewPrivs'] = f('NoNewPrivs'); r['seccomp'] = f('Seccomp')",
    "r['dockerSock'] = any(os.path.exists(p) for p in ('/var/run/docker.sock', '/run/docker.sock'))",
    "try:\n    open('/opt/runner/.probe', 'w'); r['rootfsWritable'] = True\nexcept OSError:\n    r['rootfsWritable'] = False",
    "try:\n    s = socket.socket(); s.settimeout(1); s.connect(('1.1.1.1', 53)); r['network'] = True\nexcept OSError:\n    r['network'] = False",
    "r['interfaces'] = sorted(os.listdir('/sys/class/net'))",
    "ok_fs = {'overlay', 'proc', 'tmpfs', 'sysfs', 'cgroup', 'cgroup2', 'devpts', 'mqueue'}",
    "ok_bind = {'/etc/hosts', '/etc/hostname', '/etc/resolv.conf'}",
    "mi = [l.split(' - ') for l in open('/proc/self/mountinfo').read().splitlines()]",
    "r['hostMounts'] = [a.split()[4] for a, b in mi if b.split()[0] not in ok_fs and a.split()[4] not in ok_bind]",
    "r['workspaceNoexec'] = any(a.split()[4] == '/workspace' and 'noexec' in (a.split()[5] + ',' + b.split()[2]) for a, b in mi)",
    "def rd(*ps):\n    for p in ps:\n        try:\n            return open(p).read().strip()\n        except OSError:\n            pass\n    return None",
    "r['pidsMax'] = rd('/sys/fs/cgroup/pids.max', '/sys/fs/cgroup/pids/pids.max')",
    "r['memoryMax'] = rd('/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes')",
    "r['cpuMax'] = rd('/sys/fs/cgroup/cpu.max') or ((rd('/sys/fs/cgroup/cpu/cpu.cfs_quota_us') or '') + ' ' + (rd('/sys/fs/cgroup/cpu/cpu.cfs_period_us') or ''))",
    "print(json.dumps(r))"
  ].join("\n") + "\n",
  java: "public class Main { public static void main(String[] a) { System.out.println(\"probe-ok\"); } }\n",
  csharp: "System.Console.WriteLine(\"probe-ok\");\n"
};
const PROBE_LIMITS = Object.freeze({ timeMs: 5000, memoryMb: 128, outputBytes: 8192 });

/** Judges the python probe's report against the hardening contract. → [] when every control holds, else violation names. */
function sandboxViolations(r, { memoryMb = PROBE_LIMITS.memoryMb } = {}) {
  const v = [];
  if (!r || typeof r !== "object") return ["no-report"];
  if (r.uid !== 10001) v.push("non-root-user");
  if (!/^0+$/.test(String(r.capEff || ""))) v.push("capabilities-dropped");
  if (String(r.noNewPrivs) !== "1") v.push("no-new-privileges");
  if (String(r.seccomp) !== "2") v.push("seccomp-filter");
  if (r.dockerSock !== false) v.push("no-docker-socket");
  if (r.rootfsWritable !== false) v.push("read-only-rootfs");
  if (r.network !== false || JSON.stringify(r.interfaces) !== JSON.stringify(["lo"])) v.push("network-none");
  if (!Array.isArray(r.hostMounts) || r.hostMounts.length) v.push("no-host-mounts");
  if (r.workspaceNoexec !== true) v.push("workspace-noexec");
  if (String(r.pidsMax) !== String(LANGUAGES["python@1"].pidsLimit)) v.push("pids-bounded");
  const expectBytes = runtimeMemoryMb(LANGUAGES["python@1"], memoryMb) * 1024 * 1024;
  if (Number(r.memoryMax) !== expectBytes) v.push("memory-bounded");
  const cpu = String(r.cpuMax || "").trim().split(/\s+/).map(Number);
  if (!(cpu.length === 2 && cpu[0] > 0 && cpu[1] > 0 && cpu[0] / cpu[1] === LANGUAGES["python@1"].cpus)) v.push("cpu-bounded");
  return v;
}

// ── real host dependencies (all injectable for the tests) ────────────────────────────────────────────────────────────────
function realDeps(env) {
  const docker = createDockerApi({ env });
  const read = p => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
  return {
    nodeVersion: process.versions.node,
    uid: typeof process.getuid === "function" ? process.getuid() : -1,
    cpus: os.cpus().length,
    memTotalMb: Math.floor(os.totalmem() / (1024 * 1024)),
    lstat: p => fs.lstatSync(p),
    stat: p => fs.statSync(p),
    realpath: p => fs.realpathSync(p),
    statfs: p => fs.statfsSync(p),
    readFile: read,
    mounts: () => read("/proc/mounts"),
    mountInfo: () => read("/proc/self/mountinfo"),
    resourceDevice: () => { try { return fs.realpathSync("/dev/disk/azure/resource-part1"); } catch { return null; } },
    listeners: () => [...parseListeners(read("/proc/net/tcp"), false), ...parseListeners(read("/proc/net/tcp6"), true)],
    writeProbe: dir => { const f = path.join(dir, ".preflight-probe-" + process.pid); const fd = fs.openSync(f, "wx", 0o600); try { fs.writeSync(fd, "probe"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); fs.unlinkSync(f); } },
    dockerInfo: () => docker.info(),
    imageId: image => docker.imageId(image),
    sandbox: createDockerSandbox({ env }),
    portFree: (host, port) => new Promise(resolve => { const s = net.createServer(); s.once("error", () => resolve(false)); s.listen(port, host, () => s.close(() => resolve(true))); }),
    healthz: (host, port) => new Promise(resolve => {
      const req = http.get({ host, port, path: "/healthz", timeout: 3000 }, res => { let b = ""; res.on("data", d => { if (b.length < 1024) b += d; }); res.on("end", () => { try { resolve(res.statusCode === 200 && JSON.parse(b).ok === true); } catch { resolve(false); } }); });
      req.on("timeout", () => req.destroy()); req.on("error", () => resolve(false));
    })
  };
}

// ── the checks ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * runPreflight({ env, mode, profile, options, deps }) → { ok, exitCode, results: [{ id, status: "pass"|"fail"|"warn", exit, reason }] }
 * Every reason is a constant phrase or a non-secret value (paths, counts, versions, image names).
 */
async function runPreflight({ env = process.env, mode = "start", profile = "production", options = {}, deps } = {}) {
  const d = deps || realDeps(env);
  const prod = profile === "production";
  const o = { ...DEFAULTS, ...options };
  const results = [];
  const pass = (id, exit, reason) => results.push({ id, status: "pass", exit, reason });
  const fail = (id, exit, reason) => results.push({ id, status: "fail", exit, reason });
  const warn = (id, exit, reason) => results.push({ id, status: "warn", exit, reason });
  const deep = mode === "start" || mode === "verify-sandbox";

  // NODE — the gateway's own engines requirement (runner/package.json)
  const want = minNodeVersion();
  if (versionAtLeast(d.nodeVersion, want)) pass("node-version", EXIT.NODE, "node " + d.nodeVersion + " ≥ " + want.join("."));
  else fail("node-version", EXIT.NODE, "node " + d.nodeVersion + " < " + want.join(".") + " (runner/package.json engines)");

  // ENV FILE — root-owned, no group / other access (systemd PID 1 reads it; the service user never needs to)
  if (o.envFile) {
    let st = null;
    try { st = d.stat(o.envFile); } catch { st = null; }
    if (!st) (prod ? fail : warn)("env-file", EXIT.ENV_FILE, "environment file not found: " + o.envFile);
    else if (!st.isFile()) fail("env-file", EXIT.ENV_FILE, "environment file is not a regular file");
    else if (st.uid !== 0) fail("env-file", EXIT.ENV_FILE, "environment file must be owned by root");
    else if ((st.mode & 0o077) !== 0) fail("env-file", EXIT.ENV_FILE, "environment file must not be accessible by group / other (chmod 0600)");
    else pass("env-file", EXIT.ENV_FILE, "root-owned, mode 0600");
  }

  // KEYS — present, strong, separated (checked on the raw values; never printed)
  const rk = typeof env.RUNNER_HMAC_KEY === "string" ? env.RUNNER_HMAC_KEY : "";
  const ck = typeof env.SMARTASSESS_CALLBACK_HMAC_KEY === "string" ? env.SMARTASSESS_CALLBACK_HMAC_KEY : "";
  const sk = typeof env.CODING_GRADING_SWEEP_HMAC_KEY === "string" ? env.CODING_GRADING_SWEEP_HMAC_KEY : "";
  const weak = k => k.length < 32 || k.length > 512 || /\s/.test(k);
  const placeholder = k => /REPLACE|PLACEHOLDER|CHANGE.?ME|EXAMPLE|SECRET.?STORE/i.test(k);
  if (!rk) fail("keys", EXIT.KEYS, "RUNNER_HMAC_KEY is not set");
  else if (!ck) fail("keys", EXIT.KEYS, "SMARTASSESS_CALLBACK_HMAC_KEY is not set (official grading would stay disabled)");
  else if (weak(rk) || weak(ck)) fail("keys", EXIT.KEYS, "a key is shorter than 32 characters, longer than 512, or contains whitespace");
  else if (placeholder(rk) || placeholder(ck)) fail("keys", EXIT.KEYS, "a key still holds a template placeholder");
  else if (rk === ck) fail("keys", EXIT.KEYS, "RUNNER_HMAC_KEY and SMARTASSESS_CALLBACK_HMAC_KEY are identical (they must be independent keys)");
  else if (sk && (sk === rk || sk === ck)) fail("keys", EXIT.KEYS, "CODING_GRADING_SWEEP_HMAC_KEY equals a runner key (three independent authorities)");
  else {
    pass("keys", EXIT.KEYS, "runner request key and callback key present, strong and independent");
    if (sk) warn("keys", EXIT.KEYS, "CODING_GRADING_SWEEP_HMAC_KEY is set on the runner host; the gateway never uses it — remove it");
  }

  // CALLBACK — fixed https destination (plain http only for loopback, and only in the development profile)
  const cbRaw = typeof env.SMARTASSESS_CALLBACK_BASE_URL === "string" ? env.SMARTASSESS_CALLBACK_BASE_URL.trim() : "";
  let cbUrl = null;
  try { cbUrl = cbRaw ? new URL(cbRaw) : null; } catch { cbUrl = null; }
  if (!cbRaw) fail("callback-url", EXIT.CALLBACK, "SMARTASSESS_CALLBACK_BASE_URL is not set");
  else if (!cbUrl) fail("callback-url", EXIT.CALLBACK, "SMARTASSESS_CALLBACK_BASE_URL is not a valid URL");
  else if (cbUrl.username || cbUrl.password || cbUrl.search || cbUrl.hash || (cbUrl.pathname !== "/" && cbUrl.pathname !== "")) fail("callback-url", EXIT.CALLBACK, "SMARTASSESS_CALLBACK_BASE_URL must be an origin only (no credentials, path, query or fragment)");
  else if (cbUrl.protocol !== "https:" && (prod || !LOOPBACK_HOSTS.has(cbUrl.hostname.replace(/^\[|\]$/g, "")))) fail("callback-url", EXIT.CALLBACK, "SMARTASSESS_CALLBACK_BASE_URL must use https");
  else if (prod && LOOPBACK_HOSTS.has(cbUrl.hostname.replace(/^\[|\]$/g, ""))) fail("callback-url", EXIT.CALLBACK, "SMARTASSESS_CALLBACK_BASE_URL points at a loopback host in the production profile");
  else pass("callback-url", EXIT.CALLBACK, cbUrl.protocol + "//" + cbUrl.host);

  // BIND — loopback only behind Caddy; a non-loopback bind needs the development profile AND an explicit flag
  const host = env.RUNNER_HOST || "127.0.0.1";
  const port = Number(env.RUNNER_PORT || 8787);
  if (prod && host !== PRODUCTION.host) fail("bind", EXIT.BIND, "RUNNER_HOST must be " + PRODUCTION.host + " in production (Caddy terminates TLS in front)");
  else if (prod && port !== PRODUCTION.port) fail("bind", EXIT.BIND, "RUNNER_PORT must be " + PRODUCTION.port + " in production (Caddyfile upstream)");
  else if (!LOOPBACK_HOSTS.has(host) && !(profile === "development" && o.allowNonLoopbackBind)) fail("bind", EXIT.BIND, "RUNNER_HOST " + host + " is not a loopback address (development profile + --allow-non-loopback-bind required)");
  else pass("bind", EXIT.BIND, host + ":" + port);

  // CONFIG — the gateway's OWN reader (same clamps, same refusals); production requires official grading + a durable journal
  let cfg = null;
  try { cfg = readGatewayConfig(env, { journalProbe: { mounts: d.mounts, resourceDevice: d.resourceDevice } }); } catch (e) { fail("runner-config", EXIT.CONFIG, String(e && e.message || "invalid configuration")); }
  if (cfg) {
    if (prod && env.RUNNER_JOURNAL_ALLOW_EPHEMERAL !== undefined && env.RUNNER_JOURNAL_ALLOW_EPHEMERAL !== "") fail("runner-config", EXIT.CONFIG, "RUNNER_JOURNAL_ALLOW_EPHEMERAL must not be set in production");
    else if (!cfg.official.enabled) fail("runner-config", EXIT.CONFIG, "official grading would be DISABLED (journal: " + cfg.official.journal + ")");
    else if (prod && cfg.official.journal !== "durable") fail("runner-config", EXIT.CONFIG, "journal is " + cfg.official.journal + ", not durable");
    else pass("runner-config", EXIT.CONFIG, "official grading enabled; journal " + cfg.official.journal + "; maxConcurrency " + cfg.maxConcurrency + "; official maxPending " + cfg.official.maxPending + " / maxActive " + cfg.official.maxActive + " / caseConcurrency " + cfg.official.caseConcurrency);
  }

  // CAPACITY — pilot guardrail: worst-case physical containers strictly below vCPUs (wall-clock time limits); memory fits
  const pools = {
    maxConcurrency: clampInt(env.RUNNER_MAX_CONCURRENCY, 1, 16, 2),
    maxActive: clampInt(env.RUNNER_OFFICIAL_MAX_ACTIVE, 1, 4, 1),
    caseConcurrency: clampInt(env.RUNNER_OFFICIAL_CASE_CONCURRENCY, 1, 4, 2)
  };
  const phys = physicalContainers(pools), mem = worstSandboxMemoryMb(pools);
  if (phys.total >= d.cpus) fail("capacity", EXIT.CAPACITY, "worst-case " + phys.total + " sandbox containers (practice " + phys.practice + " + official " + phys.official + ") must be < " + d.cpus + " vCPUs — lower RUNNER_MAX_CONCURRENCY / RUNNER_OFFICIAL_MAX_ACTIVE");
  else if (mem + HOST_MEMORY_RESERVE_MB > d.memTotalMb) fail("capacity", EXIT.CAPACITY, "worst-case sandbox memory " + mem + " MB + " + HOST_MEMORY_RESERVE_MB + " MB host reserve exceeds " + d.memTotalMb + " MB");
  else pass("capacity", EXIT.CAPACITY, "worst-case " + phys.total + " containers < " + d.cpus + " vCPUs; worst-case sandbox memory " + mem + " MB of " + d.memTotalMb + " MB");
  if (pools.caseConcurrency > OFFICIAL_RUNTIME_SLOTS) warn("capacity", EXIT.CAPACITY, "RUNNER_OFFICIAL_CASE_CONCURRENCY " + pools.caseConcurrency + " has no physical effect above the " + OFFICIAL_RUNTIME_SLOTS + " hard-coded official runtime slots (17F-B B3)");

  // JOURNAL — exact mount point of a dedicated persistent disk, no symlink, expected filesystem, owned / private / writable
  const rawDir = typeof env.RUNNER_JOURNAL_DIR === "string" ? env.RUNNER_JOURNAL_DIR.trim() : "";
  const journalOk = (() => {
    if (!rawDir) { fail("journal", EXIT.JOURNAL, "RUNNER_JOURNAL_DIR is not set"); return false; }
    if (!path.isAbsolute(rawDir)) { fail("journal", EXIT.JOURNAL, "RUNNER_JOURNAL_DIR must be absolute"); return false; }
    const dir = path.resolve(rawDir);
    let lst;
    try { lst = d.lstat(dir); } catch { fail("journal", EXIT.JOURNAL, "journal directory does not exist: " + dir); return false; }
    if (lst.isSymbolicLink()) { fail("journal", EXIT.JOURNAL, "journal path is a symlink: " + dir); return false; }
    if (!lst.isDirectory()) { fail("journal", EXIT.JOURNAL, "journal path is not a directory"); return false; }
    let real;
    try { real = d.realpath(dir); } catch { fail("journal", EXIT.JOURNAL, "journal path cannot be resolved"); return false; }
    if (real !== dir) { fail("journal", EXIT.JOURNAL, "journal path traverses a symlink (resolves to " + real + ")"); return false; }
    const mounts = d.mounts();
    const m = mounts ? mountFor(dir, mounts) : null;
    if (!m) { fail("journal", EXIT.JOURNAL, "cannot determine the journal filesystem (/proc/mounts unreadable)"); return false; }
    if (prod && m.mountPoint !== dir) { fail("journal", EXIT.JOURNAL, "journal disk is NOT mounted at " + dir + " (path lives on " + m.mountPoint + ") — refusing to journal on the wrong disk"); return false; }
    if (prod && !PRODUCTION.journalFs.includes(m.type)) { fail("journal", EXIT.JOURNAL, "journal filesystem " + m.type + " is not one of " + PRODUCTION.journalFs.join(", ")); return false; }
    const jc = readJournalConfig({ RUNNER_JOURNAL_DIR: dir, ...(prod ? {} : { RUNNER_JOURNAL_ALLOW_EPHEMERAL: env.RUNNER_JOURNAL_ALLOW_EPHEMERAL }) }, { mounts: () => mounts, resourceDevice: d.resourceDevice });
    if (!jc.enabled) { fail("journal", EXIT.JOURNAL, "the gateway's own durability gate refuses this path (" + jc.reason + ")"); return false; }
    let st;
    try { st = d.stat(dir); } catch { fail("journal", EXIT.JOURNAL, "journal directory cannot be inspected"); return false; }
    if (st.uid !== d.uid) { fail("journal", EXIT.JOURNAL, "journal directory must be owned by the service user (uid " + d.uid + "), found uid " + st.uid); return false; }
    if ((st.mode & 0o077) !== 0) { fail("journal", EXIT.JOURNAL, "journal directory must be private (chmod 0700)"); return false; }
    try { d.writeProbe(dir); } catch { fail("journal", EXIT.JOURNAL, "journal directory is not writable (create + fsync + unlink failed)"); return false; }
    pass("journal", EXIT.JOURNAL, dir + " is the mount point of " + m.type + " (" + m.device + "), owned, 0700, writable");
    return true;
  })();
  if (journalOk) diskCheck("journal-disk", EXIT.JOURNAL_DISK, path.resolve(rawDir), o.minJournalFreeMb);

  function diskCheck(id, exit, p, minMb) {
    let s;
    try { s = d.statfs(p); } catch { fail(id, exit, "free space unknown for " + p); return; }
    const freeMb = Math.floor((s.bavail * s.bsize) / (1024 * 1024));
    const pct = s.blocks > 0 ? Math.floor((s.bavail / s.blocks) * 100) : 0;
    if (freeMb < minMb || pct < o.minFreePercent) fail(id, exit, p + ": " + freeMb + " MB / " + pct + "% free (minimum " + minMb + " MB and " + o.minFreePercent + "%)");
    else pass(id, exit, p + ": " + freeMb + " MB / " + pct + "% free");
  }

  // DOCKER — daemon reachable, recent enough for every flag the sandbox uses, cgroup v2 + seccomp, never on TCP
  const info = await d.dockerInfo();
  const dockerHost = typeof env.DOCKER_HOST === "string" ? env.DOCKER_HOST.trim() : "";
  if (dockerHost && !dockerHost.startsWith("unix://")) fail("docker", EXIT.DOCKER, "DOCKER_HOST must be a local unix socket (unix://…); a TCP Docker API is refused");
  else if (!info) fail("docker", EXIT.DOCKER, "Docker daemon unreachable (is docker.service running and is the service user in the docker group?)");
  else if (!versionAtLeast(info.ServerVersion, PRODUCTION.minDockerVersion)) fail("docker", EXIT.DOCKER, "Docker Engine " + info.ServerVersion + " < " + PRODUCTION.minDockerVersion.join(".") + " (required for --pull never and the sandbox flags)");
  else if (prod && String(info.CgroupVersion) !== "2") fail("docker", EXIT.DOCKER, "cgroup v" + info.CgroupVersion + " — the production baseline is cgroup v2 (Ubuntu 24.04)");
  else if (!(Array.isArray(info.SecurityOptions) && info.SecurityOptions.some(s => /name=seccomp/.test(s)))) fail("docker", EXIT.DOCKER, "Docker seccomp is not enabled");
  else { pass("docker", EXIT.DOCKER, "Docker Engine " + info.ServerVersion + ", cgroup v" + info.CgroupVersion + ", seccomp on"); }
  const listeners = d.listeners();
  const dockerTcp = listeners.filter(l => FORBIDDEN_DOCKER_PORTS.includes(l.port));
  if (dockerTcp.length) fail("exposure", EXIT.EXPOSURE, "a process listens on Docker API port " + dockerTcp.map(l => l.port).join(", ") + " — the Docker daemon must use its unix socket only");
  const publicRunner = listeners.filter(l => l.port === port && !isLoopbackListener(l));
  if (publicRunner.length) fail("exposure", EXIT.EXPOSURE, "port " + port + " is bound to a non-loopback address (" + publicRunner.map(l => l.address).join(", ") + ")");
  if (!dockerTcp.length && !publicRunner.length) pass("exposure", EXIT.EXPOSURE, "no Docker TCP listener; port " + port + " not publicly bound");
  if (info && info.DockerRootDir) diskCheck("docker-disk", EXIT.DOCKER_DISK, info.DockerRootDir, o.minDockerFreeMb);

  // STORAGE — device separation (17F-A1.1 M1): a mount point alone proves nothing about the disk beneath it. From
  // /proc/self/mountinfo: journal device ≠ OS device, Docker device ≠ OS device, journal device ≠ Docker device, and the
  // journal path is the filesystem mount of its own device (a bind mount of an OS-disk directory is refused). Fails closed.
  if (journalOk && info) {
    const sep = storageSeparation({ mountInfo: d.mountInfo(), journalDir: path.resolve(rawDir), dockerRootDir: info.DockerRootDir });
    if (sep.ok) pass("storage", EXIT.STORAGE, sep.reason);
    else (prod ? fail : warn)("storage", EXIT.STORAGE, sep.reason);
  }

  // IMAGES — exactly the registry's images (never invented names), optionally pinned to the IDs recorded at build time; the
  // manifest must be structurally exact (image-manifest.js — the same contract record-images.js writes), never "whatever parses"
  if (info) {
    let manifest = null;
    if (o.imageManifest) {
      const t = d.readFile(o.imageManifest);
      if (t === null || t === undefined) fail("images", EXIT.IMAGES, "image manifest unreadable: " + o.imageManifest);
      else { const v = parseImageManifest(t, { images: Object.values(LANGUAGES).map(e => e.image) }); if (v.ok) manifest = v.manifest; else fail("images", EXIT.IMAGES, "image manifest invalid: " + v.reason + " (" + o.imageManifest + ")"); }
    }
    const missing = [], drift = [];
    for (const e of Object.values(LANGUAGES)) {
      const id = await d.imageId(e.image);
      if (!id) missing.push(e.image);
      else if (manifest && manifest.images[e.image] !== id) drift.push(e.image);
    }
    if (missing.length) fail("images", EXIT.IMAGES, "worker image missing: " + missing.join(", ") + " (run deploy/azure-vm/build-and-record-images.sh)");
    else if (drift.length) fail("images", EXIT.IMAGES, "worker image differs from the recorded manifest: " + drift.join(", "));
    else if (!o.imageManifest || manifest) pass("images", EXIT.IMAGES, Object.values(LANGUAGES).map(e => e.image).join(", ") + (manifest ? " (match manifest)" : ""));
  }

  // SANDBOX — a REAL hardened sandbox proves the controls (start: python; verify-sandbox: all three toolchains)
  if (info && deep && !results.some(r => r.id === "images" && r.status === "fail")) {
    const langs = mode === "verify-sandbox" ? ["python", "java", "csharp"] : ["python"];
    for (const key of langs) {
      const entry = LANGUAGES[key + "@1"];
      let r;
      try { r = await d.sandbox.run(entry, { requestId: "preflight_" + key, language: key, languageVersion: 1, source: SANDBOX_PROBE[key], stdin: "", limits: PROBE_LIMITS }); } catch { r = null; }
      if (!r || r.status !== "success") { fail("sandbox", EXIT.SANDBOX, key + " sandbox did not run (status " + (r ? r.status : "none") + ")"); continue; }
      if (key !== "python") { if (r.stdout.trim() === "probe-ok") pass("sandbox", EXIT.SANDBOX, key + " compiles and runs in the hardened sandbox"); else fail("sandbox", EXIT.SANDBOX, key + " sandbox produced unexpected output"); continue; }
      let report = null;
      try { report = JSON.parse(r.stdout.trim().split("\n").pop()); } catch { report = null; }
      const v = sandboxViolations(report);
      if (v.length) fail("sandbox", EXIT.SANDBOX, "container control violated: " + v.join(", "));
      else pass("sandbox", EXIT.SANDBOX, "python sandbox: uid 10001, no capabilities, no-new-privileges, seccomp, read-only rootfs, network none, no host mounts, no docker socket, pids/memory/cpu bounded");
    }
  }

  // PORT / LIVENESS
  if (mode === "start") {
    if (await d.portFree(host, port)) pass("port", EXIT.PORT, host + ":" + port + " is free");
    else fail("port", EXIT.PORT, host + ":" + port + " is already in use (another gateway or process)");
  } else if (mode === "readiness") {
    if (await d.healthz(host, port)) pass("liveness", EXIT.LIVENESS, "GET /healthz → 200 on " + host + ":" + port);
    else fail("liveness", EXIT.LIVENESS, "gateway not answering /healthz on " + host + ":" + port);
  }

  const firstFail = results.find(r => r.status === "fail");
  return { ok: !firstFail, exitCode: firstFail ? firstFail.exit : EXIT.OK, results };
}

function parseArgs(argv) {
  const o = { mode: "start", profile: "production", options: {}, json: false };
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) return null;
    const [, k, v] = m;
    if (k === "mode" && ["start", "readiness", "verify-sandbox"].includes(v)) o.mode = v;
    else if (k === "profile" && ["production", "development"].includes(v)) o.profile = v;
    else if (k === "allow-non-loopback-bind" && v === undefined) o.options.allowNonLoopbackBind = true;
    else if (k === "env-file" && v) o.options.envFile = v;
    else if (k === "read-env-file" && v === undefined) o.readEnvFile = true;
    else if (k === "image-manifest" && v) o.options.imageManifest = v;
    else if (["min-journal-free-mb", "min-docker-free-mb", "min-free-percent"].includes(k) && /^\d+$/.test(v || "")) o.options[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = Number(v);
    else if (k === "json" && v === undefined) o.json = true;
    else return null;
  }
  return o;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) { console.error("usage: preflight.js [--mode=start|readiness|verify-sandbox] [--profile=production|development] [--env-file=PATH [--read-env-file]] [--image-manifest=PATH] [--allow-non-loopback-bind] [--min-journal-free-mb=N] [--min-docker-free-mb=N] [--min-free-percent=N] [--json]"); process.exit(EXIT.USAGE); }
  let env = process.env;
  if (args.readEnvFile && args.options.envFile) { const t = fs.existsSync(args.options.envFile) ? fs.readFileSync(args.options.envFile, "utf8") : ""; env = { ...process.env, ...parseEnvFile(t) }; }
  const r = await runPreflight({ env, mode: args.mode, profile: args.profile, options: args.options });
  for (const x of r.results) console.log(args.json ? JSON.stringify({ event: "runner.preflight.check", ...x }) : (x.status.toUpperCase().padEnd(4) + " " + x.id.padEnd(14) + " " + x.reason));
  console.log(args.json ? JSON.stringify({ event: "runner.preflight.result", mode: args.mode, profile: args.profile, ok: r.ok, exitCode: r.exitCode }) : (r.ok ? "PREFLIGHT OK (" + args.mode + ", " + args.profile + ")" : "PREFLIGHT FAILED (" + args.mode + ", " + args.profile + ") exit " + r.exitCode));
  process.exit(r.exitCode);
}

if (require.main === module) main().catch(() => { console.error("PREFLIGHT FAILED: unexpected error"); process.exit(1); });

module.exports = { EXIT, OFFICIAL_RUNTIME_SLOTS, PRODUCTION, DEFAULTS, SANDBOX_PROBE, PROBE_LIMITS, runPreflight, physicalContainers, worstSandboxMemoryMb, parseListeners, parseEnvFile, sandboxViolations, versionAtLeast, parseArgs };
