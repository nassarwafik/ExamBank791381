"use strict";
// Phase 17F-B10-A — ADVERSARIAL / MUTATION check of the load harness (M1–M18, QM1–QM30). Each mutation is applied to the harness source
// (string replacement), the fail-first suite runs, and the mutation is KILLED when the suite fails. Files are restored
// byte-for-byte afterwards (verified by SHA-256) — even when a run throws. Exit 0 = every mutation killed · 1 = a mutation survived.
//     node runner/tests/mutation/load-mutations.js [--only=M4,M5] [--restore]
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const LIB = f => path.join(ROOT, "tests", "load", "lib", f);
const SUITES = ["load-harness.rtest.js", "load-review-fix-1.rtest.js", "load-review-fix-2.rtest.js", "load-review-fix-3.rtest.js", "load-review-fix-4.rtest.js"].map(f => path.join(ROOT, "tests", "unit", f));
const sha = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const MUTATIONS = [
  { id: "M1", title: "remove the production acknowledgement guard", file: "targets.js", from: 'if (env[PRODUCTION_ACK_ENV] !== PRODUCTION_ACK_VALUE) return { ok: false, code: "PRODUCTION_NOT_ACKNOWLEDGED"', to: 'if (false) return { ok: false, code: "PRODUCTION_NOT_ACKNOWLEDGED"' },
  { id: "M2", title: "remove the total-job ceiling", file: "safety.js", from: 'if (t.jobs > ceilings.maxTotalJobs) return { code: "MAX_TOTAL_JOBS_EXCEEDED"', to: 'if (false) return { code: "MAX_TOTAL_JOBS_EXCEEDED"' },
  { id: "M3", title: "remove the concurrency ceiling", file: "safety.js", from: 'if (t.maxConcurrency > ceilings.maxConcurrency) return { code: "MAX_CONCURRENCY_EXCEEDED"', to: 'if (false) return { code: "MAX_CONCURRENCY_EXCEEDED"' },
  { id: "M4", title: "include source text in the JSON report", file: "report.js", from: "    attachments: input.attachments ? plain(input.attachments) : null, notes:", to: "    source: (input.scenario.config.workloadIds || []).join(\",\") + \" print(int(input()) * 2)\", attachments: input.attachments ? plain(input.attachments) : null, notes:" },
  { id: "M4b", title: "disable the redaction scan", file: "report.js", from: "  if (!scan.ok) throw new Error(\"report: redaction scan refused the artifact", to: "  if (false) throw new Error(\"report: redaction scan refused the artifact" },
  { id: "M5", title: "collapse RUNNER_BUSY into generic failure", file: "metrics.js", from: 'else if (r.httpStatus === 503 && r.code === "RUNNER_BUSY") { totals.busy++; L.busy++; if (A) A.busy++; }', to: 'else if (r.httpStatus === 503 && r.code === "RUNNER_BUSY") { totals.failed++; L.failed++; totals.networkErrors++; L.networkErrors++; }' },
  { id: "M6", title: "ignore one missing official job", file: "accounting.js", from: "          else { r.lost.push(j.jobId); L.lost++; if (A) A.lost++; }", to: "          else { if (r.lost.length) { r.lost.push(j.jobId); L.lost++; } else { r.complete++; L.complete++; } }" },
  { id: "M7", title: "ignore duplicate grade application", file: "accounting.js", from: "if (applied.length > 1) { r.duplicateApplications += applied.length - 1; r.duplicateApplied.push(j.jobId); }", to: "if (false) { r.duplicateApplications += applied.length - 1; r.duplicateApplied.push(j.jobId); }" },
  { id: "M8", title: "treat a corrupt journal as PASS", file: "accounting.js", from: 'if (Number(status.corrupt || 0) > 0 || Number(status.quarantined || 0) > 0) issues.push("corrupt-records");', to: 'if (false) issues.push("corrupt-records");' },
  { id: "M9", title: "ignore owed callbacks", file: "accounting.js", from: '  check("executed", "owed-callbacks");', to: '  // check("executed", "owed-callbacks");' },
  { id: "M10", title: "mark retryable as completed", file: "accounting.js", from: 'if (answer === "applied") j.terminal = state === "retryable" ? "retryable" : "complete";', to: 'if (answer === "applied") j.terminal = "complete";' },
  { id: "M11", title: "allow a final PASS with a failed correctness gate", file: "gates.js", from: 'const verdict = failed.length ? "FAIL" : notEvaluated.length ? "INCOMPLETE" : "PASS";', to: 'const verdict = notEvaluated.length ? "INCOMPLETE" : "PASS";' },
  { id: "M12", title: "drop the build SHA requirement from the result", file: "report.js", from: 'if (typeof input.buildSha !== "string" || !SHA.test(input.buildSha)) throw new Error("report: buildSha', to: 'if (false) throw new Error("report: buildSha' },
  { id: "M13", title: "make a dry run send real requests", file: "harness.js", from: "  if (dryRun) return { ok: true, dryRun: true,", to: "  if (dryRun) { try { await fetchImpl(\"https://runner.example.test/healthz\"); } catch { /* mutated */ } }\n  if (dryRun) return { ok: true, dryRun: true," },
  { id: "M14", title: "break the percentile calculation", file: "metrics.js", from: "const rank = q => sorted[Math.max(0, Math.min(n - 1, Math.ceil(q * n) - 1))];", to: "const rank = q => sorted[Math.max(0, Math.min(n - 1, Math.floor(q * n)))];" },
  { id: "M15", title: "hide callback failures from the summary", file: "accounting.js", from: '  check("callback_failed", "callback-failed");', to: '  // check("callback_failed", "callback-failed");' },
  { id: "M16", title: "count busy official dispatches as lost (break the explicit busy bucket)", file: "accounting.js", from: '        } else if (j.dispatch === "busy") { r.busy++; L.busy++; if (A) A.busy++; }', to: '        } else if (j.dispatch === "busy") { r.lost.push(j.jobId); }' },
  { id: "M17", title: "treat alreadyApplied with a changed score as fine", file: "accounting.js", from: "if (applied.length && already.some(a => a.score !== null && applied[0].score !== null && a.score !== applied[0].score)) r.idempotencyViolations.push(j.jobId);", to: "if (false) r.idempotencyViolations.push(j.jobId);" },
  { id: "M18", title: "let the P1 gate pass with a missing language", file: "gates.js", from: "return { pass: violations.length === 0 && missing.length === 0, violations, missing, ceilingMs };", to: "return { pass: violations.length === 0, violations, missing, ceilingMs };" },
  // Independent Review Fix 1
  { id: "QM1", title: "ignore a P1 failure in the qualification", file: "qualification.js", from: '  return check("Q-P1", derived && !contradiction,', to: '  return check("Q-P1", true,' },
  { id: "QM2", title: "ignore a callback transport failure", file: "qualification.js", from: '  return check("Q-CALLBACK-TRANSPORT", derived && !contradictions.length,', to: '  return check("Q-CALLBACK-TRANSPORT", true,' },
  { id: "QM3", title: "ignore official over-admission", file: "qualification.js", from: '  return check("Q-ADMISSION", over.length === 0 && !contradictions.length, detail,', to: '  return check("Q-ADMISSION", true, detail,' },
  { id: "QM4", title: "snapshot the score AFTER the duplicate send", file: "harness.js", from: "    const before = snapshot();\n    const again = await sender.send(bodies[0]);\n    const after = snapshot();", to: "    const again = await sender.send(bodies[0]);\n    const before = snapshot();\n    const after = snapshot();" },
  { id: "QM5", title: "let a duplicate change the score without failing", file: "harness.js", from: 'pass: again.answer === "alreadyApplied" && same("state") && same("score") && same("applications") };', to: 'pass: again.answer === "alreadyApplied" && same("state") && same("applications") };' },
  { id: "QM6", title: "remove the receiver body ceiling (streaming check)", file: "local-stack.js", from: "      if (size > CALLBACK_MAX_BYTES) { refused = true;", to: "      if (false) { refused = true;" },
  { id: "QM6b", title: "remove the receiver Content-Length ceiling", file: "local-stack.js", from: "if (Number.isFinite(declared) && declared > CALLBACK_MAX_BYTES) { stats.oversizeRejected++;", to: "if (false) { stats.oversizeRejected++;" },
  { id: "QM7", title: "check the size only AFTER the whole body was read", file: "local-stack.js", from: "      if (size > CALLBACK_MAX_BYTES) { refused = true; parts.length = 0; stats.oversizeRejected++; answer(413, { ok: false, code: \"REQUEST_TOO_LARGE\" }, { destroy: true }); return; }\n      parts.push(d);", to: "      parts.push(d);\n      if (false) { refused = true; }" },
  { id: "QM7b", title: "off-by-one at the body ceiling (exactly 8 MiB refused)", file: "local-stack.js", from: "      if (size > CALLBACK_MAX_BYTES) { refused = true;", to: "      if (size >= CALLBACK_MAX_BYTES) { refused = true;" },
  { id: "QM8", title: "allow a top-level PASS while a required qualification check failed", file: "qualification.js", from: 'const verdict = failed.length ? "FAIL" : notEvaluated.length ? "INCOMPLETE" : "PASS";', to: 'const verdict = notEvaluated.length ? "INCOMPLETE" : "PASS";' },
  // Independent Review Fix 2
  { id: "QM9", title: "let scenario.config.qualification omit a canonical check", file: "qualification.js", from: '  if (a !== b) throw new QualificationError("scenario.config.qualification [" + a + "]', to: '  if (false) throw new QualificationError("scenario.config.qualification [" + a + "]' },
  { id: "QM10", title: "unknown scenario falls back to correctness-only", file: "qualification.js", from: 'if (typeof scenarioId !== "string" || !Object.prototype.hasOwnProperty.call(SCENARIO_CHECKS, scenarioId)) throw new QualificationError("unknown scenario " + JSON.stringify(scenarioId));\n  const extra = SCENARIO_CHECKS[scenarioId];', to: 'const extra = SCENARIO_CHECKS[scenarioId] || [];' },
  { id: "QM11", title: "staging CERT-F requires the impossible Q-IDEMPOTENCY", file: "qualification.js", from: '  "CERT-F": target => (target === "local" ? TRANSPORT_AND_IDEMPOTENCY : TRANSPORT_ONLY),', to: '  "CERT-F": target => (target !== "production" ? TRANSPORT_AND_IDEMPOTENCY : TRANSPORT_ONLY),' },
  { id: "QM12", title: "trust p1.pass without checking the violations", file: "qualification.js", from: '  const derived = reasons.length === 0;\n  const contradiction = summaryVs("Q-P1", p1.pass, derived);', to: '  const derived = p1.pass === true;\n  const contradiction = null;' },
  { id: "QM13", title: "trust transportOk despite wrong answer counts", file: "qualification.js", from: '    const ok = total === b.count && (b.answers[expected] || 0) === b.count;', to: '    const ok = b.transportOk === true; void total;' },
  { id: "QM14", title: "trust idempotency.pass despite a score drift", file: "qualification.js", from: '    const ok = i.redeliveryAnswer === "alreadyApplied" && snap(i.before) && snap(i.after) && i.before.state === i.after.state && i.before.score === i.after.score && i.before.applications === i.after.applications;', to: '    const ok = i.pass === true; void snap;' },
  { id: "QM15", title: "trust recovery.pass despite lost work", file: "qualification.js", from: '  const v = recoveryVerdict(rec);\n  const contradiction = summaryVs("Q-RECOVERY", rec.pass, v.pass);', to: '  const v = { pass: rec.pass === true, reasons: [] };\n  const contradiction = null;' },
  { id: "QM16", title: "accept qualification metadata without validating it (unknown / missing / duplicate checks)", file: "report.js", from: "  if (input.scenario.config.qualification !== undefined) assertQualificationMetadata(input.scenario.config.qualification, input.scenario.id, input.target.name);", to: "  if (false) assertQualificationMetadata(input.scenario.config.qualification, input.scenario.id, input.target.name);" },
  // Independent Review Fix 3
  { id: "QM17", title: "remote staging ignores the explicit --runner-max-pending declaration", file: "harness.js", from: "          const declaredMaxPending = declared && Number.isInteger(declared.maxPending) ? declared.maxPending : null;", to: "          const declaredMaxPending = null; void declared;" },
  { id: "QM18", title: "remote uses the CERT-E local default as if the operator had declared it", file: "harness.js", from: "          const maxPending = stack ? stack.config.official.maxPending : declaredMaxPending;", to: "          const maxPending = stack ? stack.config.official.maxPending : ((plan.params.runner && plan.params.runner.maxPending) || declaredMaxPending);" },
  { id: "QM19", title: "admission ignores a malformed saturation step", file: "qualification.js", from: '    if (!isObj(s) || !isObj(s.official)) throw new QualificationError("malformed admission evidence (a saturation step has no official evidence object)");', to: '    if (!isObj(s) || !isObj(s.official)) continue;' },
  { id: "QM20", title: "trust the stored overAdmission instead of deriving it from accepted / maxPending", file: "qualification.js", from: "    const derived = Math.max(0, o.accepted - s.officialMaxPending);", to: "    const derived = o.overAdmission;" },
  { id: "QM21", title: "P1 trusts missing=[] without requiring a sample for every language", file: "qualification.js", from: "  for (const lang of P1_LANGUAGES) {\n    const s = samples[lang];", to: "  for (const lang of P1_LANGUAGES.filter(l => samples[l] !== undefined)) {\n    const s = samples[lang];" },
  { id: "QM22", title: "P1 trusts violations=[] despite a sample maximum above the ceiling", file: "qualification.js", from: '    if (s.max > P1_CEILING_MS) reasons.push(lang + " maximum " + s.max + " ms > " + P1_CEILING_MS);', to: '    if (false) reasons.push(lang + " maximum " + s.max + " ms > " + P1_CEILING_MS);' },
  { id: "QM23", title: "idempotency accepts a negative application count", file: "qualification.js", from: "|| !nonNegInt(s.applications)) throw new QualificationError(\"malformed idempotency snapshot (\" + name + \")\"); }", to: "|| !Number.isInteger(s.applications)) throw new QualificationError(\"malformed idempotency snapshot (\" + name + \")\"); }" },
  { id: "QM24", title: "recovery accepts negative execution / count evidence", file: "qualification.js", from: '  for (const k of ["accepted", "lost", "duplicateApplications", "executionsPerJobMax", "complete"]) if (!(Number.isInteger(rec[k]) && rec[k] >= 0)) throw', to: '  for (const k of ["accepted", "lost", "duplicateApplications", "executionsPerJobMax", "complete"]) if (false) throw' },
  // Independent Review Fix 4
  { id: "QM25", title: "trust the burst's stored expectedAnswer instead of the target-derived callback contract", file: "qualification.js", from: "  const expected = CALLBACK_CONTRACT[target];\n  const details = [], contradictions = [];", to: "  const expected = bursts.find(b => b && typeof b.expectedAnswer === \"string\") ? bursts.find(b => b && typeof b.expectedAnswer === \"string\").expectedAnswer : CALLBACK_CONTRACT[target];\n  const details = [], contradictions = [];" },
  { id: "QM26", title: "local idempotency silently skips a burst with no evidence", file: "qualification.js", from: '    if (i === undefined || i === null) { derived = false; details.push("burst " + (n + 1) + " carries no idempotency evidence ✗"); continue; }', to: '    if (i === undefined || i === null) continue;' },
  { id: "QM27", title: "trust the stored correctness verdict instead of the raw G1–G11 gates", file: "gates.js", from: '  const verdict = failed.length ? "FAIL" : notEvaluated.length ? "INCOMPLETE" : "PASS";\n  const contradictions = [];', to: '  const verdict = typeof c.verdict === "string" ? c.verdict : failed.length ? "FAIL" : notEvaluated.length ? "INCOMPLETE" : "PASS";\n  const contradictions = [];' },
  { id: "QM28", title: "allow a missing canonical gate", file: "gates.js", from: '  for (const id of GATE_IDS) if (!byId[id]) throw new CorrectnessEvidenceError("canonical gate " + id + " is missing");\n  const gates = GATE_IDS.map(id => byId[id]);', to: '  const gates = GATE_IDS.map(id => byId[id]).filter(Boolean);' },
  { id: "QM29", title: "allow a duplicate gate id", file: "gates.js", from: '    if (byId[g.id]) throw new CorrectnessEvidenceError("duplicate gate id " + g.id);', to: '    if (false) throw new CorrectnessEvidenceError("duplicate gate id " + g.id);' },
  { id: "QM30", title: "allow an inconsistent evaluated / pass pair", file: "gates.js", from: '    if (g.evaluated ? typeof g.pass !== "boolean" : g.pass !== null) throw new CorrectnessEvidenceError(', to: '    if (false) throw new CorrectnessEvidenceError(' }
];

const RUN_TIMEOUT_MS = 5 * 60 * 1000;                 // a mutant that HANGS the suite is reported as TIMEOUT, never waited for indefinitely
function runSuite() { const r = spawnSync(process.execPath, ["--test", ...SUITES], { cwd: ROOT, encoding: "utf8", shell: false, timeout: RUN_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 }); return { status: r.status, timedOut: !!(r.error && r.error.code === "ETIMEDOUT"), out: (r.stdout || "") + (r.stderr || "") }; }

// A mutation run that is killed (SIGKILL, a lost shell) cannot run `finally`: every original is therefore copied to a BACKUP
// directory first, and the next invocation restores from a stale backup before doing anything else. SIGINT / SIGTERM restore too.
const BACKUP = path.join(os.tmpdir(), "sa-load-mutation-backup");
function restoreFromBackup() {
  if (!fs.existsSync(BACKUP)) return false;
  let restored = 0;
  for (const name of fs.readdirSync(BACKUP)) { const target = LIB(name); if (fs.existsSync(target)) { fs.copyFileSync(path.join(BACKUP, name), target); restored++; } }
  fs.rmSync(BACKUP, { recursive: true, force: true });
  return restored;
}

function main() {
  const only = (process.argv.find(a => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
  const files = [...new Set(MUTATIONS.map(m => m.file))].map(f => LIB(f));
  const stale = restoreFromBackup();
  if (stale) console.log("restored " + stale + " file(s) left behind by an interrupted mutation run");
  if (process.argv.includes("--restore")) return;
  const originals = new Map(files.map(f => [f, fs.readFileSync(f)]));
  const before = new Map(files.map(f => [f, sha(f)]));
  fs.mkdirSync(BACKUP, { recursive: true });
  for (const f of files) fs.copyFileSync(f, path.join(BACKUP, path.basename(f)));
  const restoreAll = () => { for (const f of files) fs.writeFileSync(f, originals.get(f)); fs.rmSync(BACKUP, { recursive: true, force: true }); };
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { restoreAll(); process.exit(130); });
  const results = [];
  try {
    const baseline = runSuite();
    if (baseline.status !== 0 || baseline.timedOut) { console.error("baseline suite is not green" + (baseline.timedOut ? " (timed out)" : "") + " — refusing to mutate"); restoreAll(); process.exit(2); }
    for (const m of MUTATIONS) {
      if (only.length && !only.includes(m.id)) continue;
      const file = LIB(m.file), src = originals.get(file).toString("utf8");
      if (!src.includes(m.from)) { results.push({ id: m.id, title: m.title, outcome: "NOT_APPLICABLE (anchor missing)" }); continue; }
      fs.writeFileSync(file, src.replace(m.from, m.to));
      const r = runSuite();
      fs.writeFileSync(file, originals.get(file));
      const failing = (r.out.match(/^✖ (LOAD\d+)/gm) || []).map(s => s.slice(2)).concat((r.out.match(/^# fail (\d+)/m) || []).slice(1).map(n => "fail=" + n));
      results.push({ id: m.id, title: m.title, outcome: r.timedOut ? "TIMEOUT" : r.status !== 0 ? "KILLED" : "SURVIVED", killedBy: r.status !== 0 && !r.timedOut ? [...new Set(failing)].slice(0, 6) : [] });
    }
  } finally {
    restoreAll();
  }
  const restored = files.every(f => sha(f) === before.get(f));
  for (const r of results) console.log((r.outcome === "KILLED" ? "KILLED   " : r.outcome === "TIMEOUT" ? "TIMEOUT  " : r.outcome.startsWith("NOT") ? "N/A      " : "SURVIVED ") + r.id.padEnd(5) + r.title + (r.killedBy && r.killedBy.length ? "  ← " + r.killedBy.join(", ") : ""));
  console.log("files restored byte-for-byte: " + (restored ? "yes" : "NO"));
  const survived = results.filter(r => r.outcome === "SURVIVED" || r.outcome === "TIMEOUT" || r.outcome.startsWith("NOT"));
  console.log(survived.length ? "MUTATION CHECK FAILED: " + survived.map(r => r.id).join(", ") : "MUTATION CHECK OK: " + results.length + " mutations killed");
  process.exit(!restored || survived.length ? 1 : 0);
}
main();
