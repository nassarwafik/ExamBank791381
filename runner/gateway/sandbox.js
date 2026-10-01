"use strict";
// Phase 17B — ONE disposable Docker sandbox per execution. This is the ONLY production module in the repository that starts a
// process (architecture-guarded): it runs the Docker CLI with a FIXED argument array (spawn, shell: false, no string
// interpolation into a shell), never with anything a request can choose besides bounded numbers that were already validated.
//
// Hardening of every sandbox (docker run):
//   --rm, a random name + a runner label (so a crashed gateway's leftovers are found and removed), --pull never (offline,
//   pre-built images only), --network none, --read-only root filesystem, --cap-drop ALL, no-new-privileges, a numeric
//   non-root user, --pids-limit, --cpus, --memory = --memory-swap (no swap), core dumps off, a bounded tmpfs /workspace and /tmp
//   (nosuid, nodev, NOEXEC), --log-driver none (student output is never written to host logs), no bind mounts, no volumes,
//   no docker.sock, no environment variables, no entrypoint / command override (the image's supervisor is the entrypoint).
// The job (source, stdin, limits) is written to the container's STDIN as JSON — the source never touches the host filesystem,
// argv or the environment. The docker CLI itself receives an allow-listed environment (never the gateway's HMAC key).
// The result stream is read with a hard byte cap; a hard wall clock (compile timeout + run limit + slack) kills the container by
// name; the container is force-removed in every outcome.
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const { LANGUAGES, containerMemoryMb, hardWallMs } = require("./registry.js");

const SANDBOX_USER = "10001:10001";
const LABEL_KEY = "smartassess.coding-runner";
const LABEL = LABEL_KEY + "=1";
const NAME = /^sa-coding-[0-9a-f]{16,32}$/;
const STATUSES = ["success", "compile-error", "runtime-error", "timeout", "output-limit", "internal-error"];
const DOCKER_ENV_KEYS = ["PATH", "HOME", "DOCKER_HOST"];
const STDERR_MAX_BYTES = 65536;
const INTERNAL = Object.freeze({ status: "internal-error", stdout: "", stderr: "" });

const isRegistered = entry => !!entry && Object.values(LANGUAGES).includes(entry);

/** The complete `docker run` argument array for one sandbox. Throws on anything that is not a registry entry / a safe name. */
function buildDockerRunArgs({ name, entry, limits }) {
  if (typeof name !== "string" || !NAME.test(name)) throw new Error("invalid sandbox name");
  if (!isRegistered(entry)) throw new Error("unregistered language entry");
  const memory = containerMemoryMb(entry, limits.memoryMb) + "m";
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

/** Upper bound of the supervisor's JSON line for these limits (worst-case JSON escaping is 6 bytes per input byte). */
const resultCapBytes = outputBytes => 6 * (outputBytes + Math.min(outputBytes, STDERR_MAX_BYTES)) + 65536;

function createDockerSandbox({ dockerBin = "docker", spawnImpl = spawn, env = process.env, hardWallOverrideMs, capabilitiesCacheMs = 30000 } = {}) {
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

  async function run(entry, request) {
    const name = "sa-coding-" + crypto.randomBytes(12).toString("hex");
    const args = buildDockerRunArgs({ name, entry, limits: request.limits });
    const job = JSON.stringify({ source: request.source, stdin: request.stdin, limits: { timeMs: request.limits.timeMs, memoryMb: request.limits.memoryMb, outputBytes: request.limits.outputBytes, compileTimeoutMs: entry.compileTimeoutMs } });
    const wall = hardWallOverrideMs || hardWallMs(entry, request.limits.timeMs);
    let r;
    try {
      r = await invoke(args, { input: job, maxOut: resultCapBytes(request.limits.outputBytes), timeoutMs: wall, onAbort: () => { void invoke(["kill", name], { timeoutMs: 10000 }); } });
    } finally {
      await invoke(["rm", "-f", name], { timeoutMs: 15000 });
    }
    if (r.timedOut) return { status: "timeout", stdout: "", stderr: "" };
    if (r.overflow) return { ...INTERNAL };
    const lines = r.out.toString("utf8").trim().split("\n");
    let parsed;
    try { parsed = JSON.parse(lines[lines.length - 1]); } catch { return { ...INTERNAL }; }
    return boundResult(parsed, request.limits.outputBytes);
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

  return { run, availableLanguages, sweep };
}

module.exports = { buildDockerRunArgs, createDockerSandbox, boundResult, resultCapBytes, LABEL };
