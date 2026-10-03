"use strict";
// Phase 17F-B1 — Independent Review Fix 3 (node:test, no Docker, no secrets).
//   RF3 clock skew must never produce a NEGATIVE file age: a checkedAt within the shared CLOCK_SKEW_TOLERANCE_MS clamps the file age
//       to 0 (never -1, never a minute "refund" that could turn 241 → 240 → FRESH); beyond the tolerance it is UNKNOWN. The tolerance
//       is ONE constant exported by recovery-freshness.js and reused by coding-telemetry.js — the two policies cannot drift apart.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const T = require("../../deploy/azure-vm/coding-telemetry.js");
const F = require("../../deploy/azure-vm/recovery-freshness.js");

const DEPLOY = path.join(__dirname, "..", "..", "deploy", "azure-vm");
const NOW = Date.parse("2026-10-03T12:00:00Z"), MIN = 60000, SKEW = F.CLOCK_SKEW_TOLERANCE_MS;
const at = ms => new Date(NOW - ms).toISOString();                       // ms in the PAST (negative = future)
const load = (ageMinutes, checkedOffsetMs, policy = 240) => T.loadRecoveryResult({ state: "FRESH", ageMinutes, checkedAt: at(checkedOffsetMs) }, { nowMs: NOW, maxAgeMin: policy });

test("RF3-A — checkedAt 30 s in the future with ageMinutes 0 ⇒ FRESH, ageMinutes 0 — never -1", () => {
  assert.deepEqual(load(0, -30 * 1000), { state: "FRESH", ageMinutes: 0 });
  assert.deepEqual(load(0, -1), { state: "FRESH", ageMinutes: 0 }, "1 ms ahead");
  assert.deepEqual(load(0, -59 * 1000), { state: "FRESH", ageMinutes: 0 }, "59 s ahead");
  assert.deepEqual(load(7, -30 * 1000), { state: "FRESH", ageMinutes: 7 }, "the verdict's own age is not reduced by a skewed file");
});

test("RF3-B — the 240 / 241 boundary: a skewed checkedAt just inside the tolerance never turns 241 into 240 / FRESH", () => {
  for (const ahead of [1, 1000, 30 * 1000, SKEW - 1, SKEW]) {
    const r = load(241, -ahead);
    assert.deepEqual(r, { state: "STALE", ageMinutes: 241 }, "checkedAt " + ahead + " ms ahead must not refund a minute");
  }
  assert.deepEqual(load(240, -30 * 1000), { state: "FRESH", ageMinutes: 240 }, "exactly the policy, skewed file ⇒ still exactly the policy");
  assert.deepEqual(load(240, 0), { state: "FRESH", ageMinutes: 240 });
  assert.deepEqual(load(241, 0), { state: "STALE", ageMinutes: 241 });
  // a STALE verdict stays STALE under skew too
  assert.deepEqual(T.loadRecoveryResult({ state: "STALE", ageMinutes: 241, checkedAt: at(-30 * 1000) }, { nowMs: NOW }), { state: "STALE", ageMinutes: 241 });
});

test("RF3-C — checkedAt just beyond CLOCK_SKEW_TOLERANCE_MS ⇒ UNKNOWN", () => {
  assert.deepEqual(load(0, -(SKEW + 1)), { state: "UNKNOWN", ageMinutes: null });
  assert.deepEqual(load(0, -(SKEW + 1000)), { state: "UNKNOWN", ageMinutes: null });
  assert.deepEqual(load(0, -(60 * MIN)), { state: "UNKNOWN", ageMinutes: null });
  // and recovery-freshness.js applies the SAME edge to lastSuccessAt
  assert.equal(F.judge({ lastSuccessAt: at(-(SKEW + 1)) }, { nowMs: NOW, maxAgeMin: 240 }).state, "UNKNOWN");
  assert.equal(F.judge({ lastSuccessAt: at(-SKEW) }, { nowMs: NOW, maxAgeMin: 240 }).state, "FRESH");
});

test("RF3-D — a past checkedAt still adds elapsed WHOLE minutes normally", () => {
  assert.deepEqual(load(100, 10 * MIN), { state: "FRESH", ageMinutes: 110 });
  assert.deepEqual(load(100, 10 * MIN + 59 * 1000), { state: "FRESH", ageMinutes: 110 }, "partial minutes floor");
  assert.deepEqual(load(100, 11 * MIN), { state: "FRESH", ageMinutes: 111 });
  assert.deepEqual(load(220, 30 * MIN), { state: "STALE", ageMinutes: 250 }, "an aged FRESH verdict becomes STALE");
  assert.deepEqual(load(5, 300 * MIN), { state: "UNKNOWN", ageMinutes: null }, "a file older than the policy proves nothing");
  assert.deepEqual(load(239, 1 * MIN), { state: "FRESH", ageMinutes: 240 });
  assert.deepEqual(load(239, 2 * MIN), { state: "STALE", ageMinutes: 241 });
});

test("RF3-E — ageMinutes returned for ANY accepted FRESH / STALE result is a non-negative integer (sweep of ages × skews × policies)", () => {
  let accepted = 0;
  for (const age of [0, 1, 59, 60, 239, 240, 241, 1000])
    for (const offset of [-SKEW, -SKEW + 1, -45 * 1000, -30 * 1000, -1, 0, 1, 1000, 59 * 1000, MIN, 90 * 1000, 10 * MIN, 239 * MIN, 240 * MIN])
      for (const policy of [1, 60, 240, 1440])
        for (const state of ["FRESH", "STALE"]) {
          const r = T.loadRecoveryResult({ state, ageMinutes: age, checkedAt: at(offset) }, { nowMs: NOW, maxAgeMin: policy });
          if (r.state === "UNKNOWN") { assert.equal(r.ageMinutes, null); continue; }
          accepted++;
          assert.ok(Number.isInteger(r.ageMinutes) && r.ageMinutes >= 0, JSON.stringify({ age, offset, policy, state, r }));
          assert.ok(r.ageMinutes >= age, "the file can only ADD age, never subtract: " + JSON.stringify({ age, offset, r }));
          assert.equal(r.state, r.ageMinutes > policy ? "STALE" : state, "the policy decides from the summed age: " + JSON.stringify({ age, offset, policy, r }));
        }
  assert.ok(accepted > 500, "the sweep exercised accepted results: " + accepted);
});

test("RF3-F — coding-telemetry.js reuses the exported CLOCK_SKEW_TOLERANCE_MS; no independent future-skew constant exists", () => {
  const src = fs.readFileSync(path.join(DEPLOY, "coding-telemetry.js"), "utf8");
  assert.match(src, /require\("\.\/recovery-freshness\.js"\)/);
  assert.match(src, /\{[^}]*\bCLOCK_SKEW_TOLERANCE_MS\b[^}]*\}\s*=\s*require\("\.\/recovery-freshness\.js"\)/, "the tolerance is imported from recovery-freshness.js");
  assert.match(src, /checked\s*>\s*nowMs\s*\+\s*CLOCK_SKEW_TOLERANCE_MS/, "the future check uses the shared constant");
  assert.doesNotMatch(src, /nowMs\s*\+\s*60\s*\*\s*1000|nowMs\s*\+\s*60000/, "no independent 60 s literal in the future check");
  assert.doesNotMatch(src, /CLOCK_SKEW_TOLERANCE_MS\s*=/, "coding-telemetry.js does not define its own tolerance");
  assert.match(src, /Math\.max\(\s*0,\s*Math\.floor\(\s*\(nowMs - checked\)/, "the file age is clamped at 0");
  // the shared value itself
  assert.equal(F.CLOCK_SKEW_TOLERANCE_MS, 60 * 1000);
  assert.equal(typeof T.loadRecoveryResult, "function");
});
