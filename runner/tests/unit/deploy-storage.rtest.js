"use strict";
// Phase 17F-A1.1 (M1) — dedicated-disk DEVICE separation in the deployment preflight — node:test, no Docker (host injected).
// A mount point alone is NOT enough: the journal and the Docker storage must live on backing devices distinct from the OS
// disk and from each other, judged from /proc/self/mountinfo (major:minor device identity + the mount's root, which exposes
// bind mounts). /proc/mounts, fs.stat().dev and `df` cannot tell a bind mount of an OS-disk directory from a real disk.
//   DISK1 journal mount on the root device → FAIL (22)        DISK2 journal bind-mounted from an OS-disk directory → FAIL
//   DISK3 DockerRootDir resolves to the OS disk → FAIL         DISK4 journal and Docker share one backing device → FAIL
//   DISK5 three distinct devices → PASS                         DISK6 symlink refusal intact (journal check still first)
//   DISK7 missing / malformed mountinfo → fail closed           PARSE the pure mountinfo parser cases
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const P = require("../../deploy/azure-vm/preflight.js");
const { LANGUAGES } = require("../../gateway/registry.js");

const KEY_A = crypto.randomBytes(32).toString("hex"), KEY_B = crypto.randomBytes(32).toString("hex");
const JDIR = "/data/smartassess-runner";
const IMAGE_IDS = Object.fromEntries(Object.values(LANGUAGES).map((e, i) => [e.image, "sha256:" + String(i + 1).repeat(64)]));
const env = (over = {}) => ({ RUNNER_HMAC_KEY: KEY_A, SMARTASSESS_CALLBACK_HMAC_KEY: KEY_B, SMARTASSESS_CALLBACK_BASE_URL: "https://smartassess.example.invalid", RUNNER_HOST: "127.0.0.1", RUNNER_PORT: "8787", RUNNER_JOURNAL_DIR: JDIR, RUNNER_MAX_CONCURRENCY: "1", RUNNER_OFFICIAL_MAX_ACTIVE: "1", RUNNER_OFFICIAL_CASE_CONCURRENCY: "2", ...over });
const dirStat = (over = {}) => ({ uid: 1001, mode: 0o40700, isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false, ...over });

// the same host seen through /proc/mounts (what the 17F-A1 journal check reads) and /proc/self/mountinfo
const MOUNTS = ["/dev/sda1 / ext4 rw,relatime 0 0", "/dev/sdb1 /var/lib/docker ext4 rw,noatime 0 0", "/dev/sdc1 /data/smartassess-runner ext4 rw,noatime 0 0", "tmpfs /run tmpfs rw 0 0"].join("\n");
const ROOT = "21 1 8:1 / / rw,relatime shared:1 - ext4 /dev/sda1 rw,errors=remount-ro";
const PROC = "22 21 0:5 / /proc rw,nosuid,nodev,noexec,relatime shared:2 - proc proc rw";
const RUN = "24 21 0:20 / /run rw,nosuid,nodev,noexec,relatime shared:4 - tmpfs tmpfs rw,size=1638400k,mode=755";
const DOCKER = "25 21 8:17 / /var/lib/docker rw,noatime shared:5 - ext4 /dev/sdb1 rw";
const JOURNAL = "26 21 8:33 / /data/smartassess-runner rw,noatime shared:6 - ext4 /dev/sdc1 rw";
const mi = lines => lines.join("\n") + "\n";
const GOOD = mi([ROOT, PROC, RUN, DOCKER, JOURNAL]);
const EXIT_STORAGE = 22;

function deps(over = {}) {
  return {
    nodeVersion: "22.12.0", uid: 1001, cpus: 4, memTotalMb: 16000,
    lstat: () => dirStat(), stat: p => p === "/etc/smartassess-runner/runner.env" ? { uid: 0, mode: 0o100600, isFile: () => true } : dirStat(),
    realpath: p => p, statfs: () => ({ bsize: 4096, blocks: 8 * 1024 * 1024, bavail: 7 * 1024 * 1024 }),
    readFile: p => p === "/etc/smartassess-runner/images.manifest" ? JSON.stringify({ schemaVersion: 1, images: IMAGE_IDS }) : null,
    mounts: () => MOUNTS, mountInfo: () => GOOD, resourceDevice: () => "/dev/sdd1", listeners: () => [{ address: "127.0.0.1", port: 8787 }],
    writeProbe: () => {},
    dockerInfo: async () => ({ ServerVersion: "27.3.1", CgroupVersion: "2", SecurityOptions: ["name=seccomp,profile=builtin"], DockerRootDir: "/var/lib/docker" }),
    imageId: async image => IMAGE_IDS[image] || null,
    sandbox: { run: async () => ({ status: "success", stdout: JSON.stringify({ uid: 10001, capEff: "0000000000000000", noNewPrivs: "1", seccomp: "2", dockerSock: false, rootfsWritable: false, network: false, interfaces: ["lo"], hostMounts: [], workspaceNoexec: true, pidsMax: "128", memoryMax: String((128 + 64) * 1024 * 1024), cpuMax: "100000 100000" }) + "\n", stderr: "" }) },
    portFree: async () => true, healthz: async () => true,
    ...over
  };
}
const run = (o = {}) => P.runPreflight({ env: o.env || env(), mode: "start", profile: o.profile || "production", options: { envFile: "/etc/smartassess-runner/runner.env", imageManifest: "/etc/smartassess-runner/images.manifest" }, deps: o.deps || deps() });
const check = (r, id) => r.results.find(x => x.id === id);
/** The operator message names the role and the rule — never a mount table, options or a device list dump. */
const operatorMessage = reason => { assert.ok(reason.length < 220, reason); assert.doesNotMatch(reason, /shared:|relatime|noatime|errors=remount-ro|\n/, reason); };

test("DISK1 — the journal mount lives on the OS (root) device: the 17F-A1 journal check passes, the storage check refuses (22)", async () => {
  const r = await run({ deps: deps({ mounts: () => MOUNTS.replace("/dev/sdc1 /data/smartassess-runner", "/dev/sda1 /data/smartassess-runner"), mountInfo: () => mi([ROOT, PROC, RUN, DOCKER, "26 21 8:1 / /data/smartassess-runner rw,noatime shared:6 - ext4 /dev/sda1 rw"]) }) });
  assert.equal(check(r, "journal").status, "pass", "a mount point of ext4 — the mount-point rule alone cannot see the shared device");
  assert.equal(r.exitCode, EXIT_STORAGE, JSON.stringify(r.results.filter(x => x.status !== "pass")));
  assert.equal(check(r, "storage").status, "fail");
  assert.match(check(r, "storage").reason, /Journal storage must be on a dedicated device separate from the OS disk/);
  operatorMessage(check(r, "storage").reason);
});

test("DISK2 — the journal path is a bind mount of an OS-disk directory (a mount point in /proc/mounts!) → refused (22)", async () => {
  const r = await run({ deps: deps({ mounts: () => MOUNTS.replace("/dev/sdc1 /data/smartassess-runner", "/dev/sda1 /data/smartassess-runner"), mountInfo: () => mi([ROOT, PROC, RUN, DOCKER, "26 21 8:1 /srv/journal /data/smartassess-runner rw,noatime shared:1 - ext4 /dev/sda1 rw,errors=remount-ro"]) }) });
  assert.equal(check(r, "journal").status, "pass");
  assert.equal(r.exitCode, EXIT_STORAGE);
  assert.match(check(r, "storage").reason, /bind mount/);
  assert.match(check(r, "storage").reason, /dedicated device separate from the OS disk/);
  operatorMessage(check(r, "storage").reason);
  // a bind mount from ANOTHER disk is refused too: the journal path must be the filesystem mount of its own device
  const other = await run({ deps: deps({ mountInfo: () => mi([ROOT, PROC, RUN, DOCKER, "26 21 8:33 / /mnt/data rw,noatime - ext4 /dev/sdc1 rw", "27 21 8:33 /journal /data/smartassess-runner rw,noatime - ext4 /dev/sdc1 rw"]) }) });
  assert.equal(other.exitCode, EXIT_STORAGE);
  assert.match(check(other, "storage").reason, /bind mount/);
});

test("DISK3 — DockerRootDir resolves to the OS disk (no Docker mount, or the root dir IS /) → refused (22)", async () => {
  let r = await run({ deps: deps({ mounts: () => MOUNTS.split("\n").filter(l => !l.includes("/var/lib/docker")).join("\n"), mountInfo: () => mi([ROOT, PROC, RUN, JOURNAL]) }) });
  assert.equal(check(r, "docker-disk").status, "pass", "free space on the OS disk is fine — only the device identity reveals the problem");
  assert.equal(r.exitCode, EXIT_STORAGE, JSON.stringify(r.results.filter(x => x.status !== "pass")));
  assert.match(check(r, "storage").reason, /Docker storage must be mounted on a dedicated device separate from the OS disk/);
  operatorMessage(check(r, "storage").reason);
  r = await run({ deps: deps({ dockerInfo: async () => ({ ServerVersion: "27.3.1", CgroupVersion: "2", SecurityOptions: ["name=seccomp"], DockerRootDir: "/" }) }) });
  assert.equal(r.exitCode, EXIT_STORAGE);
  assert.match(check(r, "storage").reason, /Docker storage must be mounted on a dedicated device separate from the OS disk/);
  // Docker root on a bigger dedicated mount (e.g. /var/lib on data disk B) is a distinct device → accepted
  r = await run({ deps: deps({ mountInfo: () => mi([ROOT, PROC, RUN, "25 21 8:17 / /var/lib rw,noatime - ext4 /dev/sdb1 rw", JOURNAL]) }) });
  assert.equal(r.exitCode, 0, JSON.stringify(r.results.filter(x => x.status !== "pass")));
});

test("DISK4 — journal and Docker storage share one backing device → refused (22)", async () => {
  let r = await run({ deps: deps({ mounts: () => MOUNTS.replace("/dev/sdc1 /data/smartassess-runner", "/dev/sdb1 /data/smartassess-runner"), mountInfo: () => mi([ROOT, PROC, RUN, DOCKER, "26 21 8:17 / /data/smartassess-runner rw,noatime shared:5 - ext4 /dev/sdb1 rw"]) }) });
  assert.equal(check(r, "journal").status, "pass");
  assert.equal(r.exitCode, EXIT_STORAGE, JSON.stringify(r.results.filter(x => x.status !== "pass")));
  assert.match(check(r, "storage").reason, /Journal and Docker storage must not share the same backing device/);
  operatorMessage(check(r, "storage").reason);
  // Docker's root directory placed INSIDE the journal disk
  r = await run({ deps: deps({ mountInfo: () => mi([ROOT, PROC, RUN, JOURNAL]), dockerInfo: async () => ({ ServerVersion: "27.3.1", CgroupVersion: "2", SecurityOptions: ["name=seccomp"], DockerRootDir: "/data/smartassess-runner/docker" }) }) });
  assert.equal(r.exitCode, EXIT_STORAGE);
  assert.match(check(r, "storage").reason, /must not share the same backing device/);
});

test("DISK5 — OS, journal and Docker on three distinct devices → the storage check passes and the gate exits 0", async () => {
  const r = await run();
  assert.equal(r.exitCode, 0, JSON.stringify(r.results.filter(x => x.status !== "pass")));
  const s = check(r, "storage");
  assert.equal(s.status, "pass");
  assert.match(s.reason, /three distinct devices/);
  assert.equal(s.exit, EXIT_STORAGE);
  assert.equal(P.EXIT.STORAGE, EXIT_STORAGE, "exit 22 is reserved for storage device separation");
  operatorMessage(s.reason);
  const ids = r.results.map(x => x.id);
  assert.ok(ids.indexOf("storage") > ids.indexOf("docker-disk") && ids.indexOf("storage") < ids.indexOf("images"), "judged after the Docker root dir is known, before the images");
});

test("DISK6 — the 17F-A1 symlink refusal is intact: a symlinked journal path fails the journal check first (20); no storage PASS is ever reported", async () => {
  let r = await run({ deps: deps({ lstat: () => dirStat({ isSymbolicLink: () => true, isDirectory: () => false }) }) });
  assert.equal(r.exitCode, P.EXIT.JOURNAL); assert.match(check(r, "journal").reason, /symlink/);
  assert.ok(!r.results.some(x => x.id === "storage" && x.status === "pass"));
  r = await run({ deps: deps({ realpath: () => "/mnt/smartassess-runner" }) });
  assert.equal(r.exitCode, P.EXIT.JOURNAL); assert.match(check(r, "journal").reason, /traverses a symlink/);
  assert.ok(!r.results.some(x => x.id === "storage" && x.status === "pass"));
  // and the mount-point rule (D8) still fires first when the data disk is simply not mounted
  r = await run({ deps: deps({ mounts: () => MOUNTS.split("\n").filter(l => !l.includes(JDIR)).join("\n"), mountInfo: () => mi([ROOT, PROC, RUN, DOCKER]) }) });
  assert.equal(r.exitCode, P.EXIT.JOURNAL);
});

test("DISK7 — /proc/self/mountinfo missing, malformed, without a root mount, or without the journal mount → fail closed (22)", async () => {
  for (const [text, re] of [[null, /mountinfo/], ["this is not a mountinfo table\n", /malformed|mountinfo/], ["", /mountinfo|root/], [mi([PROC, RUN, DOCKER, JOURNAL]), /root/], [mi([ROOT, PROC, RUN, DOCKER]), /Journal storage/], [mi([ROOT, PROC, RUN, DOCKER, "26 21 8:33 / /data/smartassess-runner rw,noatime"]), /malformed|mountinfo/]]) {
    const r = await run({ deps: deps({ mountInfo: () => text }) });
    assert.equal(r.exitCode, EXIT_STORAGE, JSON.stringify(text));
    assert.equal(check(r, "storage").status, "fail");
    assert.match(check(r, "storage").reason, re);
    operatorMessage(check(r, "storage").reason);
  }
});

test("development profile — the same device findings only WARN (the local developer has one disk), production FAILS", async () => {
  const d = () => deps({ mountInfo: () => mi([ROOT, PROC, RUN]), mounts: () => "/dev/sda1 / ext4 rw 0 0" });
  const dev = await run({ profile: "development", deps: d() });
  assert.ok(!dev.results.some(x => x.status === "fail" && x.id === "storage"), JSON.stringify(dev.results));
  assert.ok(dev.results.some(x => x.id === "storage" && x.status === "warn"));
  const prod = await run({ deps: d() });
  assert.ok(prod.results.some(x => x.id === "storage" && x.status === "fail") || prod.exitCode === P.EXIT.JOURNAL);
});

test("PARSE — pure mountinfo parser: root, data disk, bind mount, nested mount, escaped path, overmount; device roles judged from entries", () => {
  const M = require("../../deploy/azure-vm/mountinfo.js");
  const NESTED = "27 26 8:49 / /data/smartassess-runner/nested rw,noatime - ext4 /dev/sdd1 rw";
  const ESCAPED = "28 21 8:1 /srv/x /mnt/with\\040space\\011tab rw - ext4 /dev/sda1 rw";
  const OPTIONAL_MANY = "29 21 0:40 / /sys/fs/cgroup rw,nosuid shared:9 master:1 propagate_from:2 - cgroup2 cgroup2 rw";
  const { entries, malformed } = M.parseMountInfo(mi([ROOT, PROC, RUN, DOCKER, JOURNAL, NESTED, ESCAPED, OPTIONAL_MANY]));
  assert.equal(malformed, 0);
  assert.equal(entries.length, 8);
  assert.deepEqual(entries[0], { mountId: 21, parentId: 1, device: "8:1", major: 8, minor: 1, root: "/", mountPoint: "/", options: "rw,relatime", optional: ["shared:1"], fsType: "ext4", source: "/dev/sda1", superOptions: "rw,errors=remount-ro" });
  assert.deepEqual(entries[7].optional, ["shared:9", "master:1", "propagate_from:2"]);
  assert.equal(entries[7].fsType, "cgroup2");
  assert.equal(entries[6].mountPoint, "/mnt/with space\ttab");
  assert.equal(entries[6].root, "/srv/x");
  assert.equal(M.mountOf(entries, "/").mountPoint, "/");
  assert.equal(M.mountOf(entries, "/etc/passwd").device, "8:1");
  assert.equal(M.mountOf(entries, "/data/smartassess-runner").device, "8:33");
  assert.equal(M.mountOf(entries, "/data/smartassess-runner/journal.lock").device, "8:33");
  assert.equal(M.mountOf(entries, "/data/smartassess-runner/nested/x").device, "8:49", "the longest mount point wins");
  assert.equal(M.mountOf(entries, "/data/smartassess-runnerX").device, "8:1", "prefix matching stops at a path boundary");
  assert.equal(M.mountOf(entries, "/var/lib/docker2").device, "8:1");
  assert.equal(M.mountOf(entries, "/mnt/with space\ttab/f").root, "/srv/x");
  // an overmount (the same mount point twice) — the LATER entry is the visible one
  const over = M.parseMountInfo(mi([ROOT, "30 21 8:33 / /data/smartassess-runner rw - ext4 /dev/sdc1 rw", "31 21 8:65 / /data/smartassess-runner rw - ext4 /dev/sde1 rw"])).entries;
  assert.equal(M.mountOf(over, "/data/smartassess-runner").device, "8:65");
  // malformed lines are counted, never silently skipped; missing text is not a table
  assert.equal(M.parseMountInfo("x y z\n" + ROOT + "\n26 21 8:33 / /data rw,noatime\n").malformed, 2);
  assert.deepEqual(M.parseMountInfo(""), { entries: [], malformed: 0 });
  assert.deepEqual(M.parseMountInfo(null), { entries: [], malformed: 0 });
});

test("PARSE — storageSeparation: the three invariants, bind-mount refusal and fail-closed on missing / malformed input", () => {
  const M = require("../../deploy/azure-vm/mountinfo.js");
  const judge = (text, dockerRootDir = "/var/lib/docker") => M.storageSeparation({ mountInfo: text, journalDir: JDIR, dockerRootDir });
  const ok = judge(GOOD);
  assert.equal(ok.ok, true, ok.reason);
  assert.deepEqual(ok.devices, { root: "8:1", journal: "8:33", docker: "8:17" });
  assert.match(judge(mi([ROOT, PROC, RUN, DOCKER, "26 21 8:1 / /data/smartassess-runner rw - ext4 /dev/sda1 rw"])).reason, /Journal storage must be on a dedicated device separate from the OS disk/);
  assert.match(judge(mi([ROOT, PROC, RUN, DOCKER, "26 21 8:1 /srv/j /data/smartassess-runner rw - ext4 /dev/sda1 rw"])).reason, /bind mount/);
  assert.match(judge(mi([ROOT, PROC, RUN, JOURNAL])).reason, /Docker storage must be mounted on a dedicated device separate from the OS disk/);
  assert.match(judge(GOOD, "/").reason, /Docker storage must be mounted on a dedicated device separate from the OS disk/);
  assert.match(judge(mi([ROOT, PROC, RUN, DOCKER, "26 21 8:17 / /data/smartassess-runner rw - ext4 /dev/sdb1 rw"])).reason, /Journal and Docker storage must not share the same backing device/);
  assert.match(judge(GOOD, "/data/smartassess-runner/docker").reason, /must not share the same backing device/);
  assert.match(judge(mi([ROOT, PROC, RUN, DOCKER, "26 21 8:33 / /data rw - ext4 /dev/sdc1 rw"])).reason, /Journal storage/, "a parent mount is not the journal mount point");
  for (const [text, re] of [[null, /mountinfo/], [undefined, /mountinfo/], ["", /mountinfo|root/], ["garbage\n", /malformed|mountinfo/], [mi([PROC, DOCKER, JOURNAL]), /root/], [GOOD + "broken line\n", /malformed/]]) {
    const v = judge(text);
    assert.equal(v.ok, false, String(text));
    assert.match(v.reason, re);
  }
  assert.equal(judge(GOOD, "").ok, false, "an unknown Docker root directory fails closed");
  assert.equal(judge(GOOD, null).ok, false);
  for (const v of [ok, judge(null), judge("garbage\n")]) assert.ok(v.reason.length < 220 && !/\n/.test(v.reason), "operator message, not a table dump");
});
