"use strict";
// Phase 17F-A1.1 (M2) — STRUCTURAL validation of the worker image manifest — node:test, no Docker (host injected).
// The canonical contract is { "schemaVersion": 1, "recordedAt"?: "<ISO>", "images": { "<registry image>": "sha256:<64 hex>" } }
// with EXACTLY the registry's image names. 17F-A1 only compared `manifest.images[image] !== id`, so `{}`, `[]` and
// `{"schemaVersion":1}` were reported as "(match manifest)". One validator serves the writer (record-images.js) and the
// reader (preflight.js); exit 32 stays the image-manifest exit code.
//   IMG1 {} → FAIL            IMG2 [] → FAIL                    IMG3 {"schemaVersion":1} → FAIL       IMG4 wrong schemaVersion → FAIL
//   IMG5 a language image missing → FAIL (structural, not drift)   IMG6 an empty image id → FAIL      IMG7 valid → PASS
//   IMG8 record-images output validates against the SAME contract; a corrupt Docker answer is refused by the writer
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const P = require("../../deploy/azure-vm/preflight.js");
const { LANGUAGES } = require("../../gateway/registry.js");

const KEY_A = crypto.randomBytes(32).toString("hex"), KEY_B = crypto.randomBytes(32).toString("hex");
const IMAGES = Object.values(LANGUAGES).map(e => e.image);
const IMAGE_IDS = Object.fromEntries(IMAGES.map((image, i) => [image, "sha256:" + String(i + 1).repeat(64)]));
const JAVA = IMAGES.find(i => /java/.test(i));
const MANIFEST_PATH = "/etc/smartassess-runner/images.manifest";
const MOUNTS = ["/dev/sda1 / ext4 rw,relatime 0 0", "/dev/sdb1 /var/lib/docker ext4 rw,noatime 0 0", "/dev/sdc1 /data/smartassess-runner ext4 rw,noatime 0 0"].join("\n");
const MOUNTINFO = ["21 1 8:1 / / rw,relatime - ext4 /dev/sda1 rw", "25 21 8:17 / /var/lib/docker rw,noatime - ext4 /dev/sdb1 rw", "26 21 8:33 / /data/smartassess-runner rw,noatime - ext4 /dev/sdc1 rw"].join("\n") + "\n";
const env = () => ({ RUNNER_HMAC_KEY: KEY_A, SMARTASSESS_CALLBACK_HMAC_KEY: KEY_B, SMARTASSESS_CALLBACK_BASE_URL: "https://smartassess.example.invalid", RUNNER_HOST: "127.0.0.1", RUNNER_PORT: "8787", RUNNER_JOURNAL_DIR: "/data/smartassess-runner", RUNNER_MAX_CONCURRENCY: "1", RUNNER_OFFICIAL_MAX_ACTIVE: "1", RUNNER_OFFICIAL_CASE_CONCURRENCY: "2" });
const dirStat = () => ({ uid: 1001, mode: 0o40700, isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false });
const deps = (manifestText, over = {}) => ({
  nodeVersion: "22.12.0", uid: 1001, cpus: 4, memTotalMb: 16000,
  lstat: () => dirStat(), stat: p => p.endsWith("runner.env") ? { uid: 0, mode: 0o100600, isFile: () => true } : dirStat(),
  realpath: p => p, statfs: () => ({ bsize: 4096, blocks: 8 * 1024 * 1024, bavail: 7 * 1024 * 1024 }),
  readFile: p => (p === MANIFEST_PATH ? manifestText : null),
  mounts: () => MOUNTS, mountInfo: () => MOUNTINFO, resourceDevice: () => "/dev/sdd1", listeners: () => [], writeProbe: () => {},
  dockerInfo: async () => ({ ServerVersion: "27.3.1", CgroupVersion: "2", SecurityOptions: ["name=seccomp"], DockerRootDir: "/var/lib/docker" }),
  imageId: async image => IMAGE_IDS[image] || null,
  sandbox: { run: async () => ({ status: "success", stdout: JSON.stringify({ uid: 10001, capEff: "0000000000000000", noNewPrivs: "1", seccomp: "2", dockerSock: false, rootfsWritable: false, network: false, interfaces: ["lo"], hostMounts: [], workspaceNoexec: true, pidsMax: "128", memoryMax: String((128 + 64) * 1024 * 1024), cpuMax: "100000 100000" }) + "\n", stderr: "" }) },
  portFree: async () => true, healthz: async () => true,
  ...over
});
const run = (manifestText, over) => P.runPreflight({ env: env(), mode: "start", profile: "production", options: { envFile: "/etc/smartassess-runner/runner.env", imageManifest: MANIFEST_PATH }, deps: deps(manifestText, over) });
const images = r => r.results.find(x => x.id === "images");
const valid = (over = {}) => ({ schemaVersion: 1, recordedAt: "2026-10-02T12:00:00.000Z", images: IMAGE_IDS, ...over });

async function refused(text, re, label) {
  const r = await run(text);
  assert.equal(r.exitCode, P.EXIT.IMAGES, label + " → exit " + r.exitCode + " " + JSON.stringify(r.results.filter(x => x.status !== "pass")));
  assert.equal(images(r).status, "fail", label);
  assert.match(images(r).reason, /image manifest invalid/, label + ": " + images(r).reason);
  assert.match(images(r).reason, re, label + ": " + images(r).reason);
  assert.doesNotMatch(images(r).reason, /sha256:[0-9a-f]{64}|\{|\}/, label + ": the reason names the defect, it never dumps the manifest");
  assert.ok(!r.results.some(x => x.id === "sandbox"), label + ": no sandbox is started after an invalid manifest");
}

test("IMG1 — `{}` is not a manifest → refused (32)", () => refused("{}", /schemaVersion|images/, "IMG1"));
test("IMG2 — `[]` is not a manifest → refused (32)", () => refused("[]", /object/, "IMG2"));
test("IMG3 — `{\"schemaVersion\":1}` without images → refused (32)", () => refused(JSON.stringify({ schemaVersion: 1 }), /images/, "IMG3"));
test("IMG4 — a wrong / unknown schemaVersion → refused (32)", async () => {
  await refused(JSON.stringify(valid({ schemaVersion: 2 })), /schemaVersion/, "IMG4 v2");
  await refused(JSON.stringify(valid({ schemaVersion: "1" })), /schemaVersion/, "IMG4 string");
  await refused(JSON.stringify({ images: IMAGE_IDS }), /schemaVersion/, "IMG4 absent");
});
test("IMG5 — a required language image missing from the manifest → refused as a STRUCTURAL defect (32), not as drift", async () => {
  const { [JAVA]: _omit, ...rest } = IMAGE_IDS;
  await refused(JSON.stringify(valid({ images: rest })), new RegExp("missing image.*" + JAVA.replace(/[.:]/g, "\\$&")), "IMG5");
  await refused(JSON.stringify(valid({ images: {} })), /images.*empty|missing image/, "IMG5 empty images");
});
test("IMG6 — an empty / non-digest image id → refused (32)", async () => {
  await refused(JSON.stringify(valid({ images: { ...IMAGE_IDS, [JAVA]: "" } })), /empty|sha256/, "IMG6 empty");
  await refused(JSON.stringify(valid({ images: { ...IMAGE_IDS, [JAVA]: null } })), /sha256|string/, "IMG6 null");
  await refused(JSON.stringify(valid({ images: { ...IMAGE_IDS, [JAVA]: "latest" } })), /sha256/, "IMG6 tag");
  await refused(JSON.stringify(valid({ images: { ...IMAGE_IDS, [JAVA]: "sha256:" + "A".repeat(64) } })), /sha256/, "IMG6 uppercase");
  await refused(JSON.stringify(valid({ images: { ...IMAGE_IDS, [JAVA]: "sha256:" + "a".repeat(63) } })), /sha256/, "IMG6 short");
});
test("IMG7 — the canonical manifest with exactly the registry's images → PASS (match manifest), exit 0", async () => {
  const r = await run(JSON.stringify(valid()));
  assert.equal(r.exitCode, 0, JSON.stringify(r.results.filter(x => x.status !== "pass")));
  assert.equal(images(r).status, "pass");
  assert.match(images(r).reason, /match manifest/);
  const noDate = await run(JSON.stringify({ schemaVersion: 1, images: IMAGE_IDS }));
  assert.equal(noDate.exitCode, 0, "recordedAt is optional");
  // the 17F-A1 protections stay: a drifted local image and an unreadable manifest are still refused with 32
  const drift = await run(JSON.stringify(valid()), { imageId: async i => (i === JAVA ? "sha256:" + "f".repeat(64) : IMAGE_IDS[i]) });
  assert.equal(drift.exitCode, P.EXIT.IMAGES); assert.match(images(drift).reason, /differs from the recorded manifest/);
  const unreadable = await run(null);
  assert.equal(unreadable.exitCode, P.EXIT.IMAGES); assert.match(images(unreadable).reason, /unreadable/);
  const missing = await run(JSON.stringify(valid()), { imageId: async i => (i === JAVA ? null : IMAGE_IDS[i]) });
  assert.equal(missing.exitCode, P.EXIT.IMAGES); assert.match(images(missing).reason, /worker image missing/);
});
test("IMG8 — record-images.js builds its manifest through the SAME validator: its output validates and round-trips; a corrupt Docker answer is refused", async () => {
  const R = require("../../deploy/azure-vm/record-images.js");
  const V = require("../../deploy/azure-vm/image-manifest.js");
  const built = await R.buildImageManifest({ imageId: async image => IMAGE_IDS[image] || null, now: () => new Date("2026-10-02T12:00:00Z") });
  assert.equal(built.ok, true, built.reason);
  assert.deepEqual(Object.keys(built.manifest), ["schemaVersion", "recordedAt", "images"]);
  assert.equal(built.manifest.schemaVersion, 1);
  assert.deepEqual(Object.keys(built.manifest.images).sort(), [...IMAGES].sort());
  const text = JSON.stringify(built.manifest, null, 2);
  const parsed = V.parseImageManifest(text, { images: IMAGES });
  assert.equal(parsed.ok, true, parsed.reason);
  assert.deepEqual(parsed.manifest.images, IMAGE_IDS);
  const r = await run(text);
  assert.equal(r.exitCode, 0, "the preflight accepts exactly what the writer produces");
  // the writer refuses what the reader would refuse
  assert.equal((await R.buildImageManifest({ imageId: async () => "sha256:abc" })).ok, false);
  assert.equal((await R.buildImageManifest({ imageId: async () => "" })).ok, false);
  const missing = await R.buildImageManifest({ imageId: async image => (image === JAVA ? null : IMAGE_IDS[image]) });
  assert.equal(missing.ok, false); assert.deepEqual(missing.missing, [JAVA]);
  const dup = await R.buildImageManifest({ imageId: async () => "sha256:" + "1".repeat(64) });
  assert.equal(dup.ok, false, "one image id for three images is a duplicate logical identity");
  assert.match(dup.reason, /duplicate/);
});

test("validator — unit contract: plain object only, exact key set, exact image set, digest values, unique ids, bounded text, no duplicate JSON keys", () => {
  const V = require("../../deploy/azure-vm/image-manifest.js");
  const check = v => V.validateImageManifest(v, { images: IMAGES });
  assert.equal(check(valid()).ok, true);
  for (const [v, re] of [
    [null, /object/], [undefined, /object/], [[], /object/], ["{}", /object/], [42, /object/], [{}, /schemaVersion/],
    [valid({ schemaVersion: 1.5 }), /schemaVersion/], [valid({ schemaVersion: 0 }), /schemaVersion/],
    [valid({ extra: true }), /unknown.*extra/], [valid({ images: [] }), /images.*object/], [valid({ images: "x" }), /images.*object/], [valid({ images: null }), /images/],
    [valid({ images: { ...IMAGE_IDS, "evil/image:latest": "sha256:" + "e".repeat(64) } }), /unexpected image.*evil\/image:latest/],
    [valid({ images: { ...IMAGE_IDS, [JAVA.toUpperCase()]: IMAGE_IDS[JAVA] } }), /unexpected image/],
    [valid({ images: Object.fromEntries(Object.entries(IMAGE_IDS).map(([k, v]) => [" " + k, v])) }), /missing image|unexpected image/],
    [valid({ images: { ...IMAGE_IDS, [JAVA]: IMAGE_IDS[IMAGES[0] === JAVA ? IMAGES[1] : IMAGES[0]] } }), /duplicate image id/],
    [valid({ recordedAt: 12345 }), /recordedAt/], [valid({ recordedAt: "yesterday" }), /recordedAt/]
  ]) {
    const r = check(v);
    assert.equal(r.ok, false, JSON.stringify(v));
    assert.match(r.reason, re, JSON.stringify(v) + " → " + r.reason);
  }
  const parse = t => V.parseImageManifest(t, { images: IMAGES });
  assert.equal(parse(JSON.stringify(valid())).ok, true);
  assert.match(parse("not json").reason, /JSON/);
  assert.match(parse("").reason, /empty|JSON/);
  assert.match(parse(null).reason, /text|JSON/);
  assert.match(parse(JSON.stringify(valid()) + "x".repeat(70000)).reason, /JSON|large/);
  assert.match(parse("x".repeat(65537)).reason, /large/);
  const dupKeys = '{"schemaVersion":1,"images":{' + IMAGES.map(i => JSON.stringify(i) + ":" + JSON.stringify(IMAGE_IDS[i])).join(",") + "," + JSON.stringify(JAVA) + ":" + JSON.stringify("sha256:" + "d".repeat(64)) + "}}";
  assert.match(parse(dupKeys).reason, /duplicate/, "a duplicated JSON key is a duplicate logical image identity, never silently normalized");
  assert.equal(V.IMAGE_ID.test("sha256:" + "0".repeat(64)), true);
  assert.equal(V.IMAGE_ID.test("sha256:" + "0".repeat(64) + "\n"), false);
});
