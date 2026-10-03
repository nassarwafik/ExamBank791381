"use strict";
// Phase 17F-B10-A — ADVERSARIAL / MUTATION check of the load harness (M1–M15). Each mutation is applied to the harness source
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
const SUITE = path.join(ROOT, "tests", "unit", "load-harness.rtest.js");
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
  { id: "M18", title: "let the P1 gate pass with a missing language", file: "gates.js", from: "return { pass: violations.length === 0 && missing.length === 0, violations, missing, ceilingMs };", to: "return { pass: violations.length === 0, violations, missing, ceilingMs };" }
];

function runSuite() { const r = spawnSync(process.execPath, ["--test", SUITE], { cwd: ROOT, encoding: "utf8", shell: false }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; }

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
    if (baseline.status !== 0) { console.error("baseline suite is not green — refusing to mutate"); restoreAll(); process.exit(2); }
    for (const m of MUTATIONS) {
      if (only.length && !only.includes(m.id)) continue;
      const file = LIB(m.file), src = originals.get(file).toString("utf8");
      if (!src.includes(m.from)) { results.push({ id: m.id, title: m.title, outcome: "NOT_APPLICABLE (anchor missing)" }); continue; }
      fs.writeFileSync(file, src.replace(m.from, m.to));
      const r = runSuite();
      fs.writeFileSync(file, originals.get(file));
      const failing = (r.out.match(/^✖ (LOAD\d+)/gm) || []).map(s => s.slice(2)).concat((r.out.match(/^# fail (\d+)/m) || []).slice(1).map(n => "fail=" + n));
      results.push({ id: m.id, title: m.title, outcome: r.status !== 0 ? "KILLED" : "SURVIVED", killedBy: r.status !== 0 ? [...new Set(failing)].slice(0, 6) : [] });
    }
  } finally {
    restoreAll();
  }
  const restored = files.every(f => sha(f) === before.get(f));
  for (const r of results) console.log((r.outcome === "KILLED" ? "KILLED   " : r.outcome.startsWith("NOT") ? "N/A      " : "SURVIVED ") + r.id.padEnd(5) + r.title + (r.killedBy && r.killedBy.length ? "  ← " + r.killedBy.join(", ") : ""));
  console.log("files restored byte-for-byte: " + (restored ? "yes" : "NO"));
  const survived = results.filter(r => r.outcome === "SURVIVED" || r.outcome.startsWith("NOT"));
  console.log(survived.length ? "MUTATION CHECK FAILED: " + survived.map(r => r.id).join(", ") : "MUTATION CHECK OK: " + results.length + " mutations killed");
  process.exit(!restored || survived.length ? 1 : 0);
}
main();
