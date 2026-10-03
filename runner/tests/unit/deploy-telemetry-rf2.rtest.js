"use strict";
// Phase 17F-B1 — Independent Review Fix 2 (node:test, no Docker, no secrets).
//   RF2-1 the --recovery FILE read must be BOUNDED on the wire: at most LIMIT + 1 bytes are ever read from the fd, a regular file
//         only, the fd closed on every path; missing / unreadable / non-regular / oversized / invalid JSON ⇒ recovery UNKNOWN.
//   RF2-2 impossible freshness values fail closed: a negative ageMinutes ⇒ UNKNOWN; a last-success timestamp materially in the
//         future (beyond a documented clock-skew tolerance) is never FRESH.
//   RF2-3 --max-age-min must be a finite positive integer; absent ⇒ 240; a malformed explicit value is a usage error (exit 2).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const T = require("../../deploy/azure-vm/coding-telemetry.js");
const F = require("../../deploy/azure-vm/recovery-freshness.js");

const DEPLOY = path.join(__dirname, "..", "..", "deploy", "azure-vm");
const SOURCE = "print(open('/etc/passwd').read())  # STUDENT_SOURCE_MARKER", TOKEN = "ghp_" + "Z".repeat(36);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sa-rf2-"));
const NOW = Date.parse("2026-10-03T12:00:00Z"), MIN = 60000;
const at = m => new Date(NOW - m * MIN).toISOString();
const freshFile = (over = {}) => JSON.stringify({ event: "runner.recovery.freshness", maxAgeMin: 240, checkedAt: at(5), state: "FRESH", fresh: true, ageMinutes: 30, lastSuccessAt: at(35), ...over });
const UNKNOWN = { state: "UNKNOWN", ageMinutes: null };

test("R2-1A — a normal small recovery file is read through the bounded reader and judged FRESH", () => {
  assert.equal(typeof T.readRecoveryFileBounded, "function", "a bounded recovery-file reader is exported");
  assert.equal(T.LIMITS.maxRecoveryFileBytes, 4096, "the recovery-file limit is explicit: 4096 bytes");
  const d = tmp(), p = path.join(d, "rf.json"); fs.writeFileSync(p, freshFile());
  const r = T.readRecoveryFileBounded(p);
  assert.equal(r.ok, true); assert.equal(typeof r.text, "string"); assert.ok(r.bytes <= 4096);
  assert.deepEqual(T.loadRecoveryResult(JSON.parse(r.text), { nowMs: NOW }), { state: "FRESH", ageMinutes: 35 });
  assert.deepEqual(T.loadRecoveryFile(p, { nowMs: NOW }), { state: "FRESH", ageMinutes: 35 }, "the one-call helper the CLI uses");
});

test("R2-1B / R2-1D — a recovery file over 4096 bytes is rejected as UNKNOWN; nothing after the limit can influence telemetry", () => {
  const d = tmp();
  // a VALID fresh verdict padded past the limit: the size alone must reject it (no partial parse of a 'convenient' prefix)
  const padded = path.join(d, "padded.json"); fs.writeFileSync(padded, freshFile({ pad: "x".repeat(5000) }));
  assert.equal(fs.statSync(padded).size > 4096, true);
  const r = T.readRecoveryFileBounded(padded);
  assert.equal(r.ok, false); assert.equal(r.reason, "oversize");
  assert.ok(r.bytes <= 4097, "never more than LIMIT + 1 bytes were read from the fd: " + r.bytes);
  assert.deepEqual(T.loadRecoveryFile(padded, { nowMs: NOW }), UNKNOWN);
  // a 4096-byte prefix that is itself valid JSON, followed by poison: still oversize ⇒ UNKNOWN, and the poison never appears
  const prefix = freshFile(); const fill = 4096 - Buffer.byteLength(prefix, "utf8");
  const trick = path.join(d, "trick.json"); fs.writeFileSync(trick, prefix + " ".repeat(fill) + "\n" + JSON.stringify({ source: SOURCE, token: TOKEN, state: "FRESH", ageMinutes: 0 }));
  assert.deepEqual(T.loadRecoveryFile(trick, { nowMs: NOW }), UNKNOWN, "a valid prefix does not rescue an oversized file");
  const t = T.buildTelemetry({ journal: {}, events: T.aggregateEvents([]), recovery: T.loadRecoveryFile(trick, { nowMs: NOW }) });
  assert.equal(t.recovery.state, "UNKNOWN"); assert.equal(t.health.state, "degraded");
  const text = JSON.stringify(t); for (const s of [SOURCE, TOKEN, "STUDENT_SOURCE_MARKER"]) assert.ok(!text.includes(s));
  // exactly 4096 bytes is accepted
  const exact = path.join(d, "exact.json"); fs.writeFileSync(exact, prefix + " ".repeat(fill)); assert.equal(fs.statSync(exact).size, 4096);
  assert.deepEqual(T.loadRecoveryFile(exact, { nowMs: NOW }), { state: "FRESH", ageMinutes: 35 });
});

test("R2-1C — no unbounded readFileSync(args.recovery …) path remains in the CLI; the fd is closed on every path", () => {
  const src = fs.readFileSync(path.join(DEPLOY, "coding-telemetry.js"), "utf8");
  assert.doesNotMatch(src, /readFileSync\(\s*args\.recovery/, "readFileSync(args.recovery) loads the whole file before any slice()");
  assert.doesNotMatch(src, /\.slice\(0,\s*4096\)/, "slicing AFTER a full read is not a bound");
  assert.match(src, /readRecoveryFileBounded/); assert.match(src, /openSync\(/); assert.match(src, /fstatSync\(/); assert.match(src, /readSync\(/);
  assert.match(src, /finally\s*\{[^}]*closeSync\(/, "the fd is closed in a finally block");
  assert.doesNotMatch(src, /child_process|spawn\(|execSync|net\.|createServer\(/, "still no process, socket or endpoint");
});

test("R2-1E — invalid JSON, a missing file and an unreadable path ⇒ UNKNOWN (never FRESH, never a throw)", () => {
  const d = tmp();
  const bad = path.join(d, "bad.json"); fs.writeFileSync(bad, "{ not json");
  assert.deepEqual(T.loadRecoveryFile(bad, { nowMs: NOW }), UNKNOWN);
  const arr = path.join(d, "arr.json"); fs.writeFileSync(arr, "[1,2,3]");
  assert.deepEqual(T.loadRecoveryFile(arr, { nowMs: NOW }), UNKNOWN);
  assert.deepEqual(T.loadRecoveryFile(path.join(d, "missing.json"), { nowMs: NOW }), UNKNOWN);
  assert.equal(T.readRecoveryFileBounded(path.join(d, "missing.json")).ok, false);
  const empty = path.join(d, "empty.json"); fs.writeFileSync(empty, "");
  assert.deepEqual(T.loadRecoveryFile(empty, { nowMs: NOW }), UNKNOWN);
});

test("R2-1F — non-regular inputs (a directory, a character device) are rejected without hanging", () => {
  const d = tmp();
  const r = T.readRecoveryFileBounded(d);
  assert.equal(r.ok, false); assert.equal(r.reason, "not-a-regular-file");
  assert.deepEqual(T.loadRecoveryFile(d, { nowMs: NOW }), UNKNOWN);
  if (fs.existsSync("/dev/null")) { const n = T.readRecoveryFileBounded("/dev/null"); assert.equal(n.ok, false); assert.equal(n.reason, "not-a-regular-file"); }
  if (fs.existsSync("/dev/zero")) { const z = T.readRecoveryFileBounded("/dev/zero"); assert.equal(z.ok, false, "an endless device is refused before any read"); }
});

test("R2-2A — a negative or non-finite ageMinutes in the recovery file ⇒ UNKNOWN", () => {
  for (const age of [-1, -0.5, -1e9, Infinity, -Infinity, NaN, "12", null]) assert.deepEqual(T.loadRecoveryResult({ state: "FRESH", ageMinutes: age, checkedAt: at(1) }, { nowMs: NOW }), UNKNOWN, String(age));
  assert.deepEqual(T.loadRecoveryResult({ state: "FRESH", ageMinutes: 0, checkedAt: at(1) }, { nowMs: NOW }), { state: "FRESH", ageMinutes: 1 }, "zero is a valid age");
  const d = tmp(), p = path.join(d, "neg.json"); fs.writeFileSync(p, freshFile({ ageMinutes: -30 }));
  assert.deepEqual(T.loadRecoveryFile(p, { nowMs: NOW }), UNKNOWN);
});

test("R2-2B — a last-success timestamp beyond the documented clock-skew tolerance is never FRESH", () => {
  assert.equal(typeof F.CLOCK_SKEW_TOLERANCE_MS, "number"); assert.ok(F.CLOCK_SKEW_TOLERANCE_MS <= 5 * MIN, "tolerance is small and documented");
  for (const future of [10 * MIN, 60 * MIN, 24 * 60 * MIN, 365 * 24 * 60 * MIN]) {
    const j = F.judge({ lastSuccessAt: new Date(NOW + future).toISOString() }, { nowMs: NOW, maxAgeMin: 240 });
    assert.notEqual(j.state, "FRESH", "future by " + future / MIN + " min"); assert.equal(j.fresh, false); assert.equal(j.state, "UNKNOWN");
    const s = F.freshnessState({ lastSuccessAt: new Date(NOW + future).toISOString() }, { nowMs: NOW, maxAgeMin: 240 });
    assert.equal(s.fresh, false); assert.equal(s.state, "UNKNOWN");
  }
  // within the tolerance a slightly-ahead clock is still FRESH, with age clamped to 0
  const near = F.judge({ lastSuccessAt: new Date(NOW + F.CLOCK_SKEW_TOLERANCE_MS - 1000).toISOString() }, { nowMs: NOW, maxAgeMin: 240 });
  assert.equal(near.state, "FRESH"); assert.equal(near.ageMinutes, 0);
});

test("R2-2C / R2-2D — a current timestamp remains FRESH, a stale one remains STALE (policy unchanged)", () => {
  assert.deepEqual(F.judge({ lastSuccessAt: at(120) }, { nowMs: NOW, maxAgeMin: 240 }), { state: "FRESH", fresh: true, ageMinutes: 120, lastSuccessAt: at(120) });
  assert.equal(F.judge({ lastSuccessAt: at(240) }, { nowMs: NOW, maxAgeMin: 240 }).state, "FRESH", "exactly the policy is still fresh");
  assert.equal(F.judge({ lastSuccessAt: at(241) }, { nowMs: NOW, maxAgeMin: 240 }).state, "STALE");
  assert.equal(F.judge({ lastSuccessAt: at(3000) }, { nowMs: NOW, maxAgeMin: 240 }).state, "STALE");
  assert.deepEqual(F.judge({ lastSuccessAt: null }, { nowMs: NOW, maxAgeMin: 240 }), { state: "STALE", fresh: false, ageMinutes: null, lastSuccessAt: null });
  assert.equal(F.DEFAULT_MAX_AGE_MIN, 240);
});

test("R2-3A–F — --max-age-min is validated: 240 ok · Infinity / NaN / text / negative / zero rejected · absent ⇒ 240", () => {
  assert.equal(typeof F.parseMaxAgeMin, "function");
  assert.equal(F.parseMaxAgeMin("240"), 240);                                      // R2-3A
  assert.equal(F.parseMaxAgeMin(240), 240);
  assert.equal(F.parseMaxAgeMin("1"), 1);
  for (const bad of ["Infinity", "-Infinity", Infinity]) assert.equal(F.parseMaxAgeMin(bad), null, "R2-3B " + bad);
  for (const bad of ["NaN", "abc", "", "240abc", "1e3", "0x10", " 240", true, {}, []]) assert.equal(F.parseMaxAgeMin(bad), null, "R2-3C " + JSON.stringify(bad));
  for (const bad of ["-1", "-240", -5]) assert.equal(F.parseMaxAgeMin(bad), null, "R2-3D " + bad);
  for (const bad of ["0", 0, "0.0"]) assert.equal(F.parseMaxAgeMin(bad), null, "R2-3E " + bad);
  assert.equal(F.parseMaxAgeMin("240.5"), null, "integers only");
  assert.equal(F.parseMaxAgeMin(undefined), F.DEFAULT_MAX_AGE_MIN);                // R2-3F
  // the library functions never let an invalid policy widen the window either
  assert.equal(F.judge({ lastSuccessAt: at(3000) }, { nowMs: NOW, maxAgeMin: Infinity }).state, "STALE", "Infinity cannot disable the guard in judge()");
  assert.equal(F.judge({ lastSuccessAt: at(3000) }, { nowMs: NOW, maxAgeMin: NaN }).state, "STALE");
  assert.deepEqual(T.loadRecoveryResult({ state: "FRESH", ageMinutes: 3000, checkedAt: at(1) }, { nowMs: NOW, maxAgeMin: Infinity }), { state: "STALE", ageMinutes: 3001 }, "Infinity cannot disable the guard in loadRecoveryResult()");
  // the CLI: a malformed explicit value is a usage error (exit 2) BEFORE any network call; absent uses the default
  const cli = path.join(DEPLOY, "recovery-freshness.js");
  for (const bad of ["Infinity", "NaN", "abc", "-1", "0", "240.5"]) {
    const r = spawnSync(process.execPath, [cli, "--repo=owner/name", "--max-age-min=" + bad, "--json"], { encoding: "utf8", env: { ...process.env, GITHUB_TOKEN: "" }, timeout: 20000 });
    assert.equal(r.status, 2, "exit 2 for --max-age-min=" + bad + " (stderr: " + r.stderr.trim() + ")");
    assert.match(r.stderr, /usage|max-age-min/i);
    assert.doesNotMatch(r.stdout + r.stderr, /FRESH/);
  }
});

test("R2-3 — the documented usage names the constraint", () => {
  const readme = fs.readFileSync(path.join(DEPLOY, "telemetry.md"), "utf8");
  assert.match(readme, /4096|4 KiB/, "the recovery-file byte limit is documented");
  assert.match(readme, /positive integer/i, "the max-age constraint is documented");
});
