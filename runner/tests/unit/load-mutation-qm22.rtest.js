"use strict";
// Hotfix — QM22 is a REAL (non-equivalent) mutant and the mutation runner applies it where it matters. The mutant is compiled IN MEMORY
// from the exact replacement the runner uses (no file is touched — safe while other test files run concurrently): on RP3's evidence
// (java max 41 000 ms, violations = [], stored pass = true) the real module says Q-P1 FAIL, the mutant says Q-P1 PASS.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const L = require("../load/lib/index.js");

const QUAL = path.join(__dirname, "..", "load", "lib", "qualification.js");
const RUNNER = path.join(__dirname, "..", "mutation", "load-mutations.js");
const FROM = '    if (s.max > P1_CEILING_MS) reasons.push(lang + " maximum " + s.max + " ms > " + P1_CEILING_MS);';
const TO = '    if (false) reasons.push(lang + " maximum " + s.max + " ms > " + P1_CEILING_MS);';
const compileFrom = source => { const m = new Module(QUAL, module); m.filename = QUAL; m.paths = Module._nodeModulePaths(path.dirname(QUAL)); m._compile(source, QUAL); return m.exports; };
const gates = () => L.evaluateGates({ practice: L.createPracticeAccumulator().summary(), official: L.createOfficialLedger().reconcile(), journal: { counts: { received: 0, running: 0, executed: 0, confirmed: 1, callback_failed: 0, superseded: 0, corrupt: 0 } } });
const evidence = () => ({ pass: true, violations: [], missing: [], ceilingMs: 40000, samples: { python: L.percentiles([9000]), java: L.percentiles([41000]), csharp: L.percentiles([10900]) } });
const p1Check = qual => qual.evaluateQualification({ scenarioId: "CERT-J", target: "local", correctness: gates(), p1: evidence() }).checks.find(c => c.id === "Q-P1");

test("QE1 the runner's QM22 entry is exactly this replacement and its anchor occurs exactly once in qualification.js", () => {
  const runner = fs.readFileSync(RUNNER, "utf8"), src = fs.readFileSync(QUAL, "utf8");
  const entry = runner.split("\n").find(l => l.includes('id: "QM22"'));
  assert.ok(entry && entry.includes(FROM) && entry.includes(TO), "load-mutations.js QM22 from / to are exactly this replacement");
  assert.equal(src.split(FROM).length - 1, 1);
});

test("QE2 QM22 is NON-equivalent: java max 41 000 with violations = [] → real Q-P1 FAIL, mutant Q-P1 PASS", () => {
  const src = fs.readFileSync(QUAL, "utf8");
  const real = p1Check(compileFrom(src)), mutant = p1Check(compileFrom(src.replace(FROM, TO)));
  assert.equal(real.pass, false); assert.match(real.detail, /java maximum 41000 ms > 40000/);
  assert.equal(mutant.pass, true, "the mutant trusts violations = [] and passes a language above the ceiling");
  assert.deepEqual(p1Check(L), real, "the in-memory real module behaves exactly like the loaded one");
});
