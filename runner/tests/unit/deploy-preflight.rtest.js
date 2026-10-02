"use strict";
// Phase 17F-A1 — the deployment PREFLIGHT / readiness gate and the operator tools — node:test, no Docker (host + Docker are
// injected; tests/docker/deploy-preflight.rtest.js runs the same gate against the REAL daemon and images):
//   D7  journal path symlink (itself or a parent) → refused        D8  journal disk not mounted at the path → refused
//   D9  Docker unreachable / too old / cgroup v1 → refused          D10 runner key reused as callback key → refused
//   D11 a worker image missing / drifted → refused                  A*  the adversarial deployment matrix (bind, http callback,
//   disk nearly full, port in use, Docker TCP, public 8787, capacity, env-file permissions, placeholders, sandbox violations)
//   T*  tools: journal-status, recovery-freshness, smoke (against the REAL gateway HTTP surface), callback probe
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");

const P = require("../../deploy/azure-vm/preflight.js");
const { journalStatus } = require("../../deploy/azure-vm/journal-status.js");
const freshness = require("../../deploy/azure-vm/recovery-freshness.js");
const smoke = require("../../deploy/azure-vm/smoke.js");
const { LANGUAGES } = require("../../gateway/registry.js");
const { createJournal, readJournalConfig } = require("../../gateway/journal.js");
const { createGatewayServer } = require("../../gateway/server.js");
const { verifyCallbackRequest } = require("../../../api/src/lib/coding/callback-protocol.js");

const KEY_A = crypto.randomBytes(32).toString("hex"), KEY_B = crypto.randomBytes(32).toString("hex"), KEY_C = crypto.randomBytes(32).toString("hex");
const JDIR = "/data/smartassess-runner";
const MOUNTS = ["/dev/sda1 / ext4 rw,relatime 0 0", "/dev/sdb1 /var/lib/docker ext4 rw,noatime 0 0", "/dev/sdc1 /data/smartassess-runner ext4 rw,noatime 0 0", "tmpfs /run tmpfs rw 0 0"].join("\n");
const GOOD_PROBE = { uid: 10001, capEff: "0000000000000000", noNewPrivs: "1", seccomp: "2", dockerSock: false, rootfsWritable: false, network: false, interfaces: ["lo"], hostMounts: [], workspaceNoexec: true, pidsMax: "128", memoryMax: String((128 + 64) * 1024 * 1024), cpuMax: "100000 100000" };
const IMAGE_IDS = Object.fromEntries(Object.values(LANGUAGES).map((e, i) => [e.image, "sha256:" + String(i + 1).repeat(64)]));

const goodEnv = (over = {}) => ({ RUNNER_HMAC_KEY: KEY_A, SMARTASSESS_CALLBACK_HMAC_KEY: KEY_B, SMARTASSESS_CALLBACK_BASE_URL: "https://smartassess.example.invalid", RUNNER_HOST: "127.0.0.1", RUNNER_PORT: "8787", RUNNER_JOURNAL_DIR: JDIR, RUNNER_MAX_CONCURRENCY: "1", RUNNER_OFFICIAL_MAX_PENDING: "64", RUNNER_OFFICIAL_MAX_ACTIVE: "1", RUNNER_OFFICIAL_CASE_CONCURRENCY: "2", ...over });
const dirStat = (over = {}) => ({ uid: 1001, mode: 0o40700, isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false, ...over });
function deps(over = {}) {
  const calls = { sandbox: 0 };
  const d = {
    nodeVersion: "22.12.0", uid: 1001, cpus: 4, memTotalMb: 16000,
    lstat: () => dirStat(), stat: p => p === "/etc/smartassess-runner/runner.env" ? { uid: 0, mode: 0o100600, isFile: () => true } : dirStat(),
    realpath: p => p, statfs: () => ({ bsize: 4096, blocks: 8 * 1024 * 1024, bavail: 7 * 1024 * 1024 }),
    readFile: p => p === "/etc/smartassess-runner/images.manifest" ? JSON.stringify({ schemaVersion: 1, images: IMAGE_IDS }) : null,
    mounts: () => MOUNTS, resourceDevice: () => "/dev/sdd1", listeners: () => [{ address: "127.0.0.1", port: 8787 }, { address: "0.0.0.0", port: 443 }],
    writeProbe: () => {},
    dockerInfo: async () => ({ ServerVersion: "27.3.1", CgroupVersion: "2", SecurityOptions: ["name=apparmor", "name=seccomp,profile=builtin", "name=cgroupns"], DockerRootDir: "/var/lib/docker" }),
    imageId: async image => IMAGE_IDS[image] || null,
    sandbox: { run: async () => { calls.sandbox++; return { status: "success", stdout: JSON.stringify(GOOD_PROBE) + "\n", stderr: "" }; } },
    portFree: async () => true, healthz: async () => true,
    ...over
  };
  d.calls = calls;
  return d;
}
const OPTS = { envFile: "/etc/smartassess-runner/runner.env", imageManifest: "/etc/smartassess-runner/images.manifest" };
const run = (o = {}) => P.runPreflight({ env: o.env || goodEnv(), mode: o.mode || "start", profile: o.profile || "production", options: { ...OPTS, ...(o.options || {}) }, deps: o.deps || deps() });
const failed = r => r.results.filter(x => x.status === "fail").map(x => x.id);

test("baseline — a correctly prepared pilot host passes every start check (exit 0), all checks reported", async () => {
  const d = deps();
  const r = await run({ deps: d });
  assert.equal(r.exitCode, 0, JSON.stringify(r.results.filter(x => x.status !== "pass")));
  assert.deepEqual([...new Set(r.results.map(x => x.id))], ["node-version", "env-file", "keys", "callback-url", "bind", "runner-config", "capacity", "journal", "journal-disk", "docker", "exposure", "docker-disk", "images", "sandbox", "port"]);
  assert.equal(d.calls.sandbox, 1, "start mode proves the controls in ONE real python sandbox");
});

test("no output ever contains a key value", async () => {
  for (const env of [goodEnv(), goodEnv({ SMARTASSESS_CALLBACK_HMAC_KEY: KEY_A }), goodEnv({ RUNNER_HMAC_KEY: "short" + KEY_C.slice(0, 10) })]) {
    const text = JSON.stringify((await run({ env })).results);
    for (const k of [KEY_A, KEY_B, KEY_C, KEY_C.slice(0, 10)]) assert.ok(!text.includes(k));
  }
});

test("D7 — a symlinked journal path (itself or a parent directory) is refused", async () => {
  let r = await run({ deps: deps({ lstat: () => dirStat({ isSymbolicLink: () => true, isDirectory: () => false }) }) });
  assert.equal(r.exitCode, P.EXIT.JOURNAL); assert.match(r.results.find(x => x.id === "journal").reason, /symlink/);
  r = await run({ deps: deps({ realpath: () => "/mnt/smartassess-runner" }) });
  assert.equal(r.exitCode, P.EXIT.JOURNAL); assert.match(r.results.find(x => x.id === "journal").reason, /traverses a symlink/);
});

test("D8 — the journal data disk is not mounted (the directory silently lives on the OS disk) → refused; dev profile tolerates", async () => {
  const noData = MOUNTS.split("\n").filter(l => !l.includes(JDIR)).join("\n");
  const r = await run({ deps: deps({ mounts: () => noData }) });
  assert.equal(r.exitCode, P.EXIT.JOURNAL);
  assert.match(r.results.find(x => x.id === "journal").reason, /NOT mounted at \/data\/smartassess-runner \(path lives on \/\)/);
  const dev = await run({ profile: "development", deps: deps({ mounts: () => noData }) });
  assert.ok(!failed(dev).includes("journal"));
});

test("GAP (baseline behaviour, unchanged) — the gateway's OWN journal gate accepts the unmounted / symlinked path the preflight refuses", () => {
  // why the deployment preflight exists: readJournalConfig judges the path string against /proc/mounts and accepts any durable
  // filesystem — with the data disk missing, /data/smartassess-runner simply lives on the OS disk ("/", ext4) → enabled.
  const noData = MOUNTS.split("\n").filter(l => !l.includes(JDIR)).join("\n");
  assert.deepEqual(readJournalConfig({ RUNNER_JOURNAL_DIR: JDIR }, { mounts: () => noData, resourceDevice: () => "/dev/sdd1" }), { enabled: true, dir: JDIR, ephemeral: false });
  // a symlink /data/smartassess-runner → /mnt/x on the Azure temporary disk is judged by the LINK's location (OS disk) → enabled
  const withTemp = noData + "\n/dev/sdd1 /mnt ext4 rw 0 0";
  assert.equal(readJournalConfig({ RUNNER_JOURNAL_DIR: JDIR }, { mounts: () => withTemp, resourceDevice: () => "/dev/sdd1" }).enabled, true);
  assert.equal(readJournalConfig({ RUNNER_JOURNAL_DIR: "/mnt/x" }, { mounts: () => withTemp, resourceDevice: () => "/dev/sdd1" }).enabled, false, "only the resolved path is refused");
});

test("journal: unexpected filesystem, Azure temporary disk, wrong owner, shared mode, read-only → refused", async () => {
  const cases = [
    [{ mounts: () => MOUNTS.replace("/dev/sdc1 /data/smartassess-runner ext4", "tmpfs /data/smartassess-runner tmpfs") }, /filesystem tmpfs/],
    [{ mounts: () => MOUNTS.replace("/dev/sdc1 /data/smartassess-runner ext4", "/dev/sdc1 /data/smartassess-runner btrfs") }, /filesystem btrfs/],
    [{ resourceDevice: () => "/dev/sdc1" }, /durability gate refuses this path \(ephemeral\)/],
    [{ stat: p => p.endsWith("runner.env") ? { uid: 0, mode: 0o100600, isFile: () => true } : dirStat({ uid: 0 }) }, /owned by the service user/],
    [{ stat: p => p.endsWith("runner.env") ? { uid: 0, mode: 0o100600, isFile: () => true } : dirStat({ mode: 0o40755 }) }, /chmod 0700/],
    [{ writeProbe: () => { throw new Error("EROFS"); } }, /not writable/],
    [{ lstat: () => { throw new Error("ENOENT"); } }, /does not exist/]
  ];
  for (const [over, re] of cases) {
    const r = await run({ deps: deps(over) });
    assert.ok(r.exitCode === P.EXIT.JOURNAL || r.exitCode === P.EXIT.CONFIG, String(re) + " → " + r.exitCode);   // tmpfs / resource disk: the gateway's own reader fails first
    assert.ok(failed(r).includes("journal"), String(re));
    assert.match(r.results.find(x => x.id === "journal").reason, re);
  }
});

test("disk nearly full: journal disk below the threshold → refused (21); Docker disk below → refused (31)", async () => {
  const low = p => (p === JDIR ? { bsize: 4096, blocks: 8 * 1024 * 1024, bavail: 1000 } : { bsize: 4096, blocks: 8 * 1024 * 1024, bavail: 7 * 1024 * 1024 });
  let r = await run({ deps: deps({ statfs: low }) });
  assert.equal(r.exitCode, P.EXIT.JOURNAL_DISK);
  r = await run({ deps: deps({ statfs: p => (p === "/var/lib/docker" ? { bsize: 4096, blocks: 100 * 1024 * 1024, bavail: 5 * 1024 * 1024 } : { bsize: 4096, blocks: 8 * 1024 * 1024, bavail: 7 * 1024 * 1024 }) }) });
  assert.equal(r.exitCode, P.EXIT.DOCKER_DISK, "5 % free is below the 10 % floor");
});

test("D9 — Docker unreachable / too old / cgroup v1 / no seccomp → refused; images and sandbox are not attempted when unreachable", async () => {
  const d = deps({ dockerInfo: async () => null });
  let r = await run({ deps: d });
  assert.equal(r.exitCode, P.EXIT.DOCKER);
  assert.equal(d.calls.sandbox, 0);
  assert.ok(!r.results.some(x => x.id === "images"));
  r = await run({ deps: deps({ dockerInfo: async () => ({ ServerVersion: "19.03.15", CgroupVersion: "2", SecurityOptions: ["name=seccomp"], DockerRootDir: "/var/lib/docker" }) }) });
  assert.equal(r.exitCode, P.EXIT.DOCKER);
  r = await run({ deps: deps({ dockerInfo: async () => ({ ServerVersion: "27.0.0", CgroupVersion: "1", SecurityOptions: ["name=seccomp"], DockerRootDir: "/var/lib/docker" }) }) });
  assert.equal(r.exitCode, P.EXIT.DOCKER);
  r = await run({ deps: deps({ dockerInfo: async () => ({ ServerVersion: "27.0.0", CgroupVersion: "2", SecurityOptions: ["name=apparmor"], DockerRootDir: "/var/lib/docker" }) }) });
  assert.equal(r.exitCode, P.EXIT.DOCKER);
});

test("D10 — the runner key reused as the callback key is refused (preflight AND the gateway's own reader)", async () => {
  const r = await run({ env: goodEnv({ SMARTASSESS_CALLBACK_HMAC_KEY: KEY_A }) });
  assert.equal(r.exitCode, P.EXIT.KEYS);
  assert.match(r.results.find(x => x.id === "keys").reason, /identical/);
  assert.match(r.results.find(x => x.id === "runner-config").reason, /must differ/);
});

test("keys: missing, weak, whitespace, placeholder, sweep key equal → refused; a sweep key on the host only warns", async () => {
  for (const env of [goodEnv({ RUNNER_HMAC_KEY: "" }), goodEnv({ SMARTASSESS_CALLBACK_HMAC_KEY: "" }), goodEnv({ RUNNER_HMAC_KEY: "x".repeat(31) }), goodEnv({ RUNNER_HMAC_KEY: KEY_A.slice(0, 20) + " " + KEY_A.slice(20) }), goodEnv({ RUNNER_HMAC_KEY: "__REPLACE_WITH_64_HEX_FROM_SECRET_STORE__" }), goodEnv({ CODING_GRADING_SWEEP_HMAC_KEY: KEY_B })]) {
    assert.equal((await run({ env })).exitCode, P.EXIT.KEYS);
  }
  const r = await run({ env: goodEnv({ CODING_GRADING_SWEEP_HMAC_KEY: KEY_C }) });
  assert.equal(r.exitCode, 0);
  assert.ok(r.results.some(x => x.id === "keys" && x.status === "warn"));
});

test("callback URL: http, loopback (production), path / query / credentials, invalid → refused; dev profile allows loopback http", async () => {
  for (const url of ["http://smartassess.example.invalid", "http://127.0.0.1:7071", "http://localhost:7071", "https://127.0.0.1", "https://smartassess.example.invalid/api", "https://smartassess.example.invalid?x=1", "https://u:p@smartassess.example.invalid", "not a url", ""]) {
    const r = await run({ env: goodEnv({ SMARTASSESS_CALLBACK_BASE_URL: url }) });
    assert.equal(r.exitCode, P.EXIT.CALLBACK, url);
  }
  const dev = await run({ profile: "development", env: goodEnv({ SMARTASSESS_CALLBACK_BASE_URL: "http://127.0.0.1:7071" }) });
  assert.ok(!failed(dev).includes("callback-url"));
});

test("bind: RUNNER_HOST=0.0.0.0 / a LAN address / ::1 / localhost (Caddy's upstream is exactly 127.0.0.1) / another port → refused in production; non-loopback needs dev profile + explicit flag", async () => {
  for (const over of [{ RUNNER_HOST: "0.0.0.0" }, { RUNNER_HOST: "10.0.0.4" }, { RUNNER_HOST: "::" }, { RUNNER_HOST: "::1" }, { RUNNER_HOST: "localhost" }, { RUNNER_PORT: "9000" }]) assert.equal((await run({ env: goodEnv(over) })).exitCode, P.EXIT.BIND, JSON.stringify(over));
  assert.ok(failed(await run({ profile: "development", env: goodEnv({ RUNNER_HOST: "0.0.0.0" }) })).includes("bind"));
  assert.ok(!failed(await run({ profile: "development", env: goodEnv({ RUNNER_HOST: "0.0.0.0" }), options: { allowNonLoopbackBind: true } })).includes("bind"));
  assert.ok(failed(await run({ env: goodEnv({ RUNNER_HOST: "0.0.0.0" }), options: { allowNonLoopbackBind: true } })).includes("bind"), "the flag never relaxes the production profile");
});

test("runner config: the ephemeral journal override is refused in production; a disabled official path is refused", async () => {
  assert.equal((await run({ env: goodEnv({ RUNNER_JOURNAL_ALLOW_EPHEMERAL: "1" }) })).exitCode, P.EXIT.CONFIG);
  const r = await run({ env: goodEnv({ RUNNER_JOURNAL_DIR: "" }) });
  assert.ok(failed(r).includes("runner-config") && failed(r).includes("journal"));
});

test("exposure: a Docker TCP listener (2375 / 2376) or a public 8787 → refused; loopback 8787 is fine", async () => {
  for (const l of [[{ address: "0.0.0.0", port: 2375 }], [{ address: "127.0.0.1", port: 2376 }], [{ address: "0.0.0.0", port: 8787 }], [{ address: "::", port: 8787 }], [{ address: "other", port: 8787 }]]) {
    assert.equal((await run({ deps: deps({ listeners: () => l }) })).exitCode, P.EXIT.EXPOSURE, JSON.stringify(l));
  }
  assert.equal((await run({ deps: deps({ listeners: () => [{ address: "::1", port: 8787 }] }) })).exitCode, 0);
});

test("D11 — a missing worker image or one that differs from the recorded manifest → refused; an unreadable manifest → refused", async () => {
  const missing = Object.values(LANGUAGES)[1].image;
  let r = await run({ deps: deps({ imageId: async i => (i === missing ? null : IMAGE_IDS[i]) }) });
  assert.equal(r.exitCode, P.EXIT.IMAGES); assert.match(r.results.find(x => x.id === "images").reason, new RegExp(missing.replace(/[.:]/g, "\\$&")));
  r = await run({ deps: deps({ imageId: async i => (i === missing ? "sha256:" + "f".repeat(64) : IMAGE_IDS[i]) }) });
  assert.equal(r.exitCode, P.EXIT.IMAGES); assert.match(r.results.find(x => x.id === "images").reason, /differs from the recorded manifest/);
  r = await run({ deps: deps({ readFile: () => null }) });
  assert.equal(r.exitCode, P.EXIT.IMAGES);
});

test("sandbox: any violated container control, or a sandbox that does not run → refused (33)", async () => {
  const mutations = { uid: 0, capEff: "00000000a80425fb", noNewPrivs: "0", seccomp: "0", dockerSock: true, rootfsWritable: true, network: true, interfaces: ["eth0", "lo"], hostMounts: ["/data"], workspaceNoexec: false, pidsMax: "max", memoryMax: "9223372036854771712", cpuMax: "max 100000" };
  for (const [k, v] of Object.entries(mutations)) {
    const report = { ...GOOD_PROBE, [k]: v };
    const r = await run({ deps: deps({ sandbox: { run: async () => ({ status: "success", stdout: JSON.stringify(report) + "\n", stderr: "" }) } }) });
    assert.equal(r.exitCode, P.EXIT.SANDBOX, k);
  }
  assert.equal((await run({ deps: deps({ sandbox: { run: async () => ({ status: "internal-error", stdout: "", stderr: "" }) } }) })).exitCode, P.EXIT.SANDBOX);
  assert.deepEqual(P.sandboxViolations(GOOD_PROBE), []);
});

test("port already in use → refused (40); readiness: /healthz must answer, no sandbox is started, no port probe", async () => {
  assert.equal((await run({ deps: deps({ portFree: async () => false }) })).exitCode, P.EXIT.PORT);
  const d = deps({ portFree: async () => { throw new Error("must not probe the port in readiness"); } });
  const ok = await run({ mode: "readiness", deps: d });
  assert.equal(ok.exitCode, 0);
  assert.equal(d.calls.sandbox, 0);
  assert.equal((await run({ mode: "readiness", deps: deps({ healthz: async () => false }) })).exitCode, P.EXIT.LIVENESS);
});

test("verify-sandbox mode proves all three toolchains", async () => {
  const seen = [];
  const d = deps({ sandbox: { run: async (entry) => { seen.push(entry.key); return entry.key === "python" ? { status: "success", stdout: JSON.stringify(GOOD_PROBE) + "\n", stderr: "" } : { status: "success", stdout: "probe-ok\n", stderr: "" }; } } });
  assert.equal((await run({ mode: "verify-sandbox", deps: d })).exitCode, 0);
  assert.deepEqual(seen, ["python", "java", "csharp"]);
});

test("env file: missing (production), group/world readable, not root-owned, not a file → refused (11)", async () => {
  const st = s => deps({ stat: p => (p.endsWith("runner.env") ? s : dirStat()) });
  for (const d of [deps({ stat: p => { if (p.endsWith("runner.env")) throw new Error("ENOENT"); return dirStat(); } }), st({ uid: 0, mode: 0o100640, isFile: () => true }), st({ uid: 0, mode: 0o100604, isFile: () => true }), st({ uid: 1001, mode: 0o100600, isFile: () => true }), st({ uid: 0, mode: 0o40700, isFile: () => false })]) {
    assert.equal((await run({ deps: d })).exitCode, P.EXIT.ENV_FILE);
  }
});

test("capacity guardrail: worst-case physical containers must stay below vCPUs; memory must fit; caseConcurrency > slots warns", async () => {
  assert.deepEqual(P.physicalContainers({ maxConcurrency: 1, maxActive: 1, caseConcurrency: 2 }), { practice: 1, official: 2, total: 3 });
  assert.equal(P.physicalContainers({ maxConcurrency: 2, maxActive: 1, caseConcurrency: 2 }).total, 4);
  assert.equal(P.physicalContainers({ maxConcurrency: 1, maxActive: 2, caseConcurrency: 2 }).total, 4, "one job compiling (outside the slots) + another using both slots");
  assert.equal(P.physicalContainers({ maxConcurrency: 1, maxActive: 4, caseConcurrency: 4 }).total, 6);
  assert.equal(P.physicalContainers({ maxConcurrency: 1, maxActive: 1, caseConcurrency: 1 }).total, 2);
  assert.equal(P.worstSandboxMemoryMb({ maxConcurrency: 1, maxActive: 1, caseConcurrency: 2 }), 1024 + 2 * 640);
  assert.equal((await run({ env: goodEnv({ RUNNER_MAX_CONCURRENCY: "2" }) })).exitCode, P.EXIT.CAPACITY, "the gateway default (2) is too much for 4 vCPUs");
  assert.equal((await run({ env: goodEnv({ RUNNER_OFFICIAL_MAX_ACTIVE: "2" }) })).exitCode, P.EXIT.CAPACITY);
  assert.equal((await run({ env: goodEnv({ RUNNER_MAX_CONCURRENCY: "5" }), deps: deps({ cpus: 8, memTotalMb: 32000 }) })).exitCode, 0, "school size D8s_v5: 5 + 2 = 7 < 8");
  assert.equal((await run({ deps: deps({ memTotalMb: 3000 }) })).exitCode, P.EXIT.CAPACITY);
  const r = await run({ env: goodEnv({ RUNNER_OFFICIAL_CASE_CONCURRENCY: "4" }) });
  assert.ok(r.results.some(x => x.id === "capacity" && x.status === "warn" && /no physical effect/.test(x.reason)));
});

test("drift guard: the preflight's official slot count matches the gateway (createDockerSandbox default, never overridden by main.js)", () => {
  const sandboxSrc = fs.readFileSync(path.join(__dirname, "..", "..", "gateway", "sandbox.js"), "utf8");
  const mainSrc = fs.readFileSync(path.join(__dirname, "..", "..", "gateway", "main.js"), "utf8");
  assert.match(sandboxSrc, new RegExp("officialMaxContainers = " + P.OFFICIAL_RUNTIME_SLOTS + "\\b"));
  assert.match(mainSrc, /createDockerSandbox\(\)/);
  assert.doesNotMatch(mainSrc, /officialMaxContainers/);
});

test("node version below the runner engines requirement → refused (10)", async () => {
  assert.equal((await run({ deps: deps({ nodeVersion: "20.18.0" }) })).exitCode, P.EXIT.NODE);
  assert.ok(P.versionAtLeast("22.12.0", [22, 12, 0]) && !P.versionAtLeast("22.11.9", [22, 12, 0]) && P.versionAtLeast("24.0.0", [22, 12, 0]));
});

test("helpers: /proc/net/tcp parsing, systemd env-file parsing, argument parsing", () => {
  const tcp = "  sl  local_address rem_address   st\n   0: 0100007F:2253 00000000:0000 0A x\n   1: 00000000:01BB 00000000:0000 0A x\n   2: 0400000A:0016 00000000:0000 0A x\n   3: 0100007F:2253 0100007F:9C40 01 x\n";
  assert.deepEqual(P.parseListeners(tcp, false), [{ address: "127.0.0.1", port: 8787 }, { address: "0.0.0.0", port: 443 }, { address: "other", port: 22 }]);
  const tcp6 = "  sl\n   0: 00000000000000000000000001000000:2253 00000000000000000000000000000000:0000 0A x\n   1: 00000000000000000000000000000000:0947 00000000000000000000000000000000:0000 0A x\n";
  assert.deepEqual(P.parseListeners(tcp6, true), [{ address: "::1", port: 8787 }, { address: "::", port: 2375 }]);
  assert.deepEqual(P.parseEnvFile("# c\nA=1\nB=\"two words\"\n\nC=\n bad line\n"), { A: "1", B: "two words", C: "" });
  assert.equal(P.parseArgs(["--mode=bogus"]), null);
  assert.equal(P.parseArgs(["--profile=production", "--whatever"]), null);
  assert.deepEqual(P.parseArgs(["--mode=readiness", "--min-journal-free-mb=2048"]).options, { minJournalFreeMb: 2048 });
});

// ── tools ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const record = (jobId, state, extra = {}) => ({ schemaVersion: 1, jobId, payloadHash: "a".repeat(64), revision: null, targetRef: null, language: "python", state, generation: 1, interruptions: 0, receivedAt: new Date().toISOString(), startedAt: null, executedAt: null, updatedAt: new Date().toISOString(), outcome: null, technicalCode: null, resultHash: ["executed", "confirmed", "callback_failed"].includes(state) ? "b".repeat(64) : null, summary: null, callback: { attempts: 0, windowEnd: 8, rearms: 0, nextAt: null }, ...extra });

test("T1 journal-status: aggregate counts only, attention for parked callbacks / stale executed results / quarantine", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-jstatus-"));
  const j = createJournal({ dir });
  await j.open();
  const id = n => "cg_statusprobe" + String(n).padStart(6, "0");
  await j.writeRecord(record(id(1), "received"));
  await j.writeRecord(record(id(2), "confirmed"));
  let s = journalStatus(dir);
  assert.deepEqual(s.counts, { received: 1, running: 0, executed: 0, confirmed: 1, callback_failed: 0, superseded: 0 });
  assert.deepEqual(s.attention, []);
  assert.ok(s.lockHeld);
  await j.writeRecord(record(id(3), "executed", { executedAt: new Date(Date.now() - 60 * 60000).toISOString() }));
  await j.writeRecord(record(id(4), "callback_failed"));
  fs.writeFileSync(path.join(dir, "quarantine", "x.json"), "{}");
  s = journalStatus(dir);
  assert.deepEqual(s.attention.sort(), ["corrupt-or-quarantined", "executed-result-waiting", "parked-callbacks"]);
  assert.equal(s.oldestExecutedMinutes >= 59, true);
  const text = JSON.stringify(s);
  for (let n = 1; n <= 4; n++) assert.ok(!text.includes(id(n)), "no job id is ever printed");
  await j.close();
});

test("T2 recovery-freshness: stale when the last successful sweep is older than the interval or absent", async () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  assert.deepEqual(freshness.judge({ lastSuccessAt: "2026-10-02T10:00:00Z" }, { nowMs: now, maxAgeMin: 240 }), { fresh: true, ageMinutes: 120, lastSuccessAt: "2026-10-02T10:00:00Z" });
  assert.equal(freshness.judge({ lastSuccessAt: "2026-10-02T06:39:53Z" }, { nowMs: now, maxAgeMin: 240 }).fresh, false);
  assert.equal(freshness.judge({ lastSuccessAt: null }, { nowMs: now }).fresh, false);
  let url = null;
  const r = await freshness.lastSuccessfulSweep({ repo: "o/r", fetchImpl: async u => { url = u; return { status: 200, json: async () => ({ workflow_runs: [{ updated_at: "2026-10-02T06:40:13Z", event: "schedule" }] }) }; } });
  assert.match(url, /\/repos\/o\/r\/actions\/workflows\/coding-grading-recovery\.yml\/runs\?status=success&per_page=1$/);
  assert.equal(r.lastSuccessAt, "2026-10-02T06:40:13Z");
  assert.deepEqual(await freshness.lastSuccessfulSweep({ repo: "o/r", fetchImpl: async () => ({ status: 403 }) }), { error: "GitHub API HTTP 403" });
});

/** The REAL gateway HTTP surface (auth, validation, body bounds) with a fake sandbox, on an ephemeral loopback port. */
async function realGateway({ key, replay } = {}) {
  const sandbox = { availableLanguages: async () => Object.values(LANGUAGES).map(e => ({ key: e.key, languageVersion: 1 })), run: async () => ({ status: "success", stdout: "1\n", stderr: "" }) };
  const server = createGatewayServer({ key, sandbox, maxConcurrency: 2, officialQueue: { submit: async () => ({ status: "busy" }) }, logger: { info() {}, warn() {} }, ...(replay ? { replay } : {}) });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  return { url: "http://127.0.0.1:" + server.address().port, close: () => new Promise(r => server.close(r)) };
}

test("T3 smoke (runner): every security check passes against the real gateway surface", async () => {
  const g = await realGateway({ key: KEY_A });
  try {
    const out = await smoke.smokeRunner({ baseUrl: g.url, key: KEY_A, languages: [], sandbox: false });
    assert.deepEqual(out.filter(c => !c.ok), []);
    assert.deepEqual(out.map(c => c.id), ["liveness", "capabilities", "unsigned-rejected", "wrong-hmac-rejected", "stale-timestamp-rejected", "replay-rejected", "tampered-body-rejected", "oversized-source-rejected", "unsupported-language-rejected", "arbitrary-image-rejected", "official-route-enabled", "proxy-accepts-near-max-official-body", "oversized-official-body-rejected"]);
  } finally { await g.close(); }
});

test("T4 smoke (runner) DETECTS a weakened gateway: replay guard disabled, wrong key, official grading disabled", async () => {
  const g = await realGateway({ key: KEY_A, replay: { seen: () => false } });
  try {
    const out = await smoke.smokeRunner({ baseUrl: g.url, key: KEY_A, languages: [], sandbox: false });
    assert.deepEqual(out.filter(c => !c.ok).map(c => c.id), ["replay-rejected"]);
    const wrong = await smoke.smokeRunner({ baseUrl: g.url, key: KEY_B, languages: [], sandbox: false });
    assert.ok(wrong.filter(c => !c.ok).length >= 5, "a wrong operator key fails the signed checks");
  } finally { await g.close(); }
  const sandbox = { availableLanguages: async () => [], run: async () => ({}) };
  const server = createGatewayServer({ key: KEY_A, sandbox, logger: { info() {}, warn() {} } });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  try {
    const out = await smoke.smokeRunner({ baseUrl: "http://127.0.0.1:" + server.address().port, key: KEY_A, languages: [], sandbox: false });
    const off = out.find(c => c.id === "official-route-enabled");
    assert.equal(off.ok, false); assert.match(off.detail, /GRADING_UNAVAILABLE/);
    assert.equal(out.find(c => c.id === "capabilities").ok, false, "no languages is a failure");
  } finally { await new Promise(r => server.close(r)); }
});

test("T5 smoke (callback): unknown-job probe authenticates with the API's verifier; a near-max body is 6–8 MiB and valid", async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    const parts = [];
    req.on("data", d => parts.push(d));
    req.on("end", () => {
      const body = Buffer.concat(parts);
      const auth = verifyCallbackRequest({ key: KEY_B, headers: { get: n => req.headers[n] }, body });
      seen.push({ path: req.url, bytes: body.length, ok: auth.ok });
      res.writeHead(auth.ok ? 404 : 401, { "content-type": "application/json" });
      res.end(JSON.stringify(auth.ok ? { ok: false, code: "UNKNOWN_JOB" } : { ok: false, code: "UNAUTHORIZED" }));
    });
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  try {
    const out = await smoke.smokeCallback({ baseUrl: "http://127.0.0.1:" + server.address().port, key: KEY_B, nearMax: true });
    assert.deepEqual(out.map(c => [c.id, c.ok]), [["callback-key-matches-api", true], ["callback-wrong-key-rejected", true], ["callback-near-max-body-accepted", true]]);
    assert.ok(seen.every(s => s.path === "/api/coding/grade-callback"));
    const near = seen[2].bytes;
    assert.ok(near > 6 * 1024 * 1024 && near < 8 * 1024 * 1024, "near-max body " + near + " bytes");
    const wrongKey = await smoke.smokeCallback({ baseUrl: "http://127.0.0.1:" + server.address().port, key: KEY_C });
    assert.equal(wrongKey.find(c => c.id === "callback-key-matches-api").ok, false, "a mismatched key is reported");
  } finally { await new Promise(r => server.close(r)); }
});

test("T6 smoke programs: the P1 gate uses the maximum time limit and Java / C# sources near the 64 KB cap; matrix covers the pilot", () => {
  for (const p of smoke.p1Programs()) {
    const n = Buffer.byteLength(p.source, "utf8");
    if (p.language !== "python") assert.ok(n > 55000 && n <= 65536, p.language + " source " + n + " bytes");
  }
  assert.deepEqual(smoke.MATRIX.python.map(t => t.id), ["pass", "wrong-output", "runtime-error", "timeout"]);
  for (const l of ["java", "csharp"]) assert.deepEqual(smoke.MATRIX[l].map(t => t.id), ["pass", "compile-error", "wrong-output", "runtime-error", "timeout"]);
  assert.ok(smoke.P1_CEILING_MS < 45000, "the gate ceiling stays below the SWA 45 s API limit");
  assert.ok(smoke.SANDBOX.filter(t => t.stagingOnly).every(t => /pressure/.test(t.id)), "pressure tests are staging-only");
});
