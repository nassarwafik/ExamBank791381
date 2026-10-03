"use strict";
// Phase 17F-B10-A — the CAPACITY REPORT model: machine-readable JSON (schemaVersion 1) + a Markdown summary. buildReport() refuses a
// result without a build SHA, without the scenario configuration, with a verdict that contradicts the gates, or with ANY trace of
// student source, hidden test data, keys, signatures or auth headers (redactionScan). Reproducibility metadata (git SHA, Runner SHA,
// harness version, scenario id + configuration, environment class, VM SKU) is mandatory; two reports from different SHAs are never
// comparable as "the same build" (compareReports refuses).
//
// Independent Review Fix 4 (RF4-C / RF4-D): the report's `correctness` object is ALWAYS the canonical derived one — buildReport hands the
// raw gate entries (fresh `input.gates` from evaluateGates, or `input.correctness` of a report being revalidated) to
// evaluateQualification, which normalizes them through gates.js normalizeCorrectness() (the ONE authority) and returns the normalized
// object; there is no second derivation here. Stored summaries that disagree with the raw gates are recorded as contradictions and
// make Q-CORRECTNESS FAIL; a malformed gate set is refused. A report produced here revalidates to the same verdicts (round trip).
const { evaluateQualification, assertQualificationMetadata, requiredChecksFor } = require("./qualification.js");

const HARNESS_VERSION = "1.2.0";
const SHA = /^[0-9a-f]{40}$/;
const FORBIDDEN_KEYS = /^(source|stdin|stdout|stderr|expectedOutput|expectedOutputs|cases|key|hmac|hmacKey|secret|token|signature|authorization|headers|cookie|bearer|password)$/i;
const FORBIDDEN_TEXT = [/x-sa-(runner|callback|sweep)-signature/i, /\bv1=[0-9a-f]{64}\b/, /\bbearer\s+[A-Za-z0-9._-]{8,}/i, /\bauthorization\b/i, /(RUNNER_HMAC_KEY|SMARTASSESS_CALLBACK_HMAC_KEY|CODING_[A-Z_]*HMAC_KEY|CODING_RUNNER_HMAC_KEY)/, /print\s*\(|System\.out\.println|Console\.WriteLine|public\s+class\s+Main|import\s+java\./];

/** Scans a report-like object for anything that must never leave the harness. → { ok, findings: [paths] } */
function redactionScan(value, { canaries = [] } = {}) {
  const findings = [];
  // a canary is a SUBSTANTIVE string (a source text, a hidden input, an expected output, a key); a 1–7 character fragment such as
  // "42" or "2\n" would match every count in the report and prove nothing
  canaries = [...new Set(canaries.map(c => (typeof c === "string" ? c.trim() : "")).filter(c => c.length >= 8))];
  const seen = new Set();
  const walk = (v, p) => {
    if (v === null || v === undefined) return;
    if (typeof v === "string") {
      for (const c of canaries) if (c && v.includes(c)) findings.push(p + ": canary");
      for (const re of FORBIDDEN_TEXT) if (re.test(v)) { findings.push(p + ": " + re.source.slice(0, 24)); break; }
      return;
    }
    if (typeof v !== "object") return;
    if (seen.has(v)) return; seen.add(v);
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, p + "[" + i + "]")); return; }
    for (const [k, x] of Object.entries(v)) { if (FORBIDDEN_KEYS.test(k)) findings.push(p + "." + k + ": forbidden key"); walk(x, p + "." + k); }
  };
  walk(value, "$");
  return { ok: findings.length === 0, findings };
}

const plain = v => JSON.parse(JSON.stringify(v));
/** Report totals = practice requests + official jobs (every offered unit of work, in exactly one bucket each). */
function totalsOf(p, o) {
  const pt = p ? p.totals : { offered: 0, completed: 0, busy: 0, rejected: 0, networkErrors: 0, failed: 0, mismatches: 0, leaks: 0 };
  const ot = o ? { offered: o.offered, completed: o.complete, busy: o.busy, rejected: o.rejected, networkErrors: o.networkErrors, failed: o.failedTerminal, retryable: o.retryable, lost: o.lost.length } : { offered: 0, completed: 0, busy: 0, rejected: 0, networkErrors: 0, failed: 0, retryable: 0, lost: 0 };
  return { offered: pt.offered + ot.offered, completed: pt.completed + ot.completed, busy: pt.busy + ot.busy, rejected: pt.rejected + ot.rejected, networkErrors: pt.networkErrors + ot.networkErrors, failed: pt.failed + ot.failed, retryable: ot.retryable, lost: ot.lost, mismatches: (pt.mismatches || 0) + (o ? o.mismatches : 0), practiceOffered: pt.offered, practiceCompleted: pt.completed, officialOffered: ot.offered, officialAccepted: o ? o.accepted : 0, officialComplete: ot.completed, officialBusy: ot.busy };
}

/**
 * buildReport(input, { canaries }) → the frozen report. Required: target.name, buildSha (40-hex), scenario { id, config },
 * startedAt, durationMs, gates (from gates.js). Optional: runnerSha, harnessVersion, vmSku, practice, official, journal,
 * recovery, saturation, fairness, p1, attachments, notes.
 */
function buildReport(input, { canaries = [] } = {}) {
  if (!input || typeof input !== "object") throw new TypeError("report: input required");
  if (typeof input.buildSha !== "string" || !SHA.test(input.buildSha)) throw new Error("report: buildSha (40-character git object id) is required");
  if (input.runnerSha !== undefined && input.runnerSha !== null && !SHA.test(String(input.runnerSha))) throw new Error("report: runnerSha must be a git object id when given");
  if (!input.target || typeof input.target.name !== "string") throw new Error("report: target.name is required");
  if (!input.scenario || typeof input.scenario.id !== "string" || !input.scenario.config || typeof input.scenario.config !== "object") throw new Error("report: scenario { id, config } is required");
  // a finished report may be re-validated (e.g. after the operator attached VM metrics): its raw gates come back from `correctness`;
  // either way ONLY the raw gate entries are evidence (normalized below by the canonical authority), never a stored summary
  const rawCorrectness = input.gates !== undefined && input.gates !== null ? input.gates : input.correctness;
  if (!rawCorrectness || typeof rawCorrectness !== "object" || !Array.isArray(rawCorrectness.gates)) throw new Error("report: gates are required (the raw G1–G11 gate entries)");
  // Independent Review Fix 1 / 2 — the top-level verdict is the SCENARIO QUALIFICATION: correctness + the scenario's own required
  // checks. The CANONICAL registry (qualification.js) is the authority — an unknown scenario or target class is refused here;
  // scenario.config.qualification is reproducibility metadata and must match the canon EXACTLY (missing / extra / unknown /
  // duplicate → refused), so a report's own metadata can never weaken the pass rule.
  const canonical = requiredChecksFor(input.scenario.id, input.target.name);
  if (input.scenario.config.qualification !== undefined) assertQualificationMetadata(input.scenario.config.qualification, input.scenario.id, input.target.name);
  const bursts = Array.isArray(input.callbacks) ? input.callbacks : Array.isArray(input.bursts) ? input.bursts : [];
  // RF4-D: the SAME p1 evidence feeds the qualification and the emitted report, so a revalidated report never loses it
  const p1 = input.p1 || (input.performance && input.performance.p1) || null;
  const q = evaluateQualification({ scenarioId: input.scenario.id, target: input.target.name, correctness: rawCorrectness, p1, bursts, recovery: input.recovery || null, saturation: input.saturation || null });
  const g = q.correctness;                                                     // the canonical derived correctness (RF4-C)
  if (q.required.slice().sort().join(",") !== canonical.slice().sort().join(",")) throw new Error("report: qualification requirements drifted from the canon");
  if (input.verdict !== undefined && input.verdict !== q.verdict) throw new Error("report: verdict contradicts the qualification (" + input.verdict + " vs " + q.verdict + ")");
  const practice = input.practice ? plain(input.practice) : null;
  const official = input.official ? plain(input.official) : null;
  const perf = { latency: practice ? practice.latency : null, latencyByOutcome: practice ? practice.latencyByOutcome : null, official: official ? official.timing : null, p1: p1 ? plain(p1) : null, throughputPerMinute: input.durationMs > 0 && practice ? Math.round((practice.totals.completed / (input.durationMs / 60000)) * 100) / 100 : null };
  const report = {
    schemaVersion: 1, harnessVersion: typeof input.harnessVersion === "string" ? input.harnessVersion : HARNESS_VERSION,
    target: { name: input.target.name, remote: !!input.target.remote, host: input.target.host || null },
    environmentClass: input.target.name, buildSha: input.buildSha, runnerSha: input.runnerSha || null, vmSku: typeof input.vmSku === "string" && input.vmSku ? input.vmSku : null,
    scenario: { id: input.scenario.id, title: input.scenario.title || null, config: { ...plain(input.scenario.config), qualification: canonical } },
    startedAt: input.startedAt, durationMs: input.durationMs,
    verdict: q.verdict,
    correctness: { verdict: g.verdict, pass: g.pass, failed: g.failed, notEvaluated: g.notEvaluated, contradictions: g.contradictions, gates: g.gates.map(x => ({ id: x.id, title: x.title, evaluated: x.evaluated, pass: x.pass, detail: x.detail })) },
    qualification: { verdict: q.verdict, pass: q.pass, required: q.required, failed: q.failed, notEvaluated: q.notEvaluated, contradictions: q.contradictions, checks: q.checks.map(c => ({ id: c.id, title: c.title, evaluated: c.evaluated, pass: c.pass, detail: c.detail, contradiction: c.contradiction || null })) },
    callbacks: bursts.length ? plain(bursts) : null,
    performance: perf,
    totals: totalsOf(practice, official),
    languages: practice ? practice.languages : {},
    practice, official, journal: input.journal ? plain(input.journal) : null, recovery: input.recovery ? plain(input.recovery) : null, saturation: input.saturation ? plain(input.saturation) : null, fairness: input.fairness ? plain(input.fairness) : null,
    attachments: input.attachments ? plain(input.attachments) : null, notes: Array.isArray(input.notes) ? input.notes.map(String) : []
  };
  const scan = redactionScan(report, { canaries });
  if (!scan.ok) throw new Error("report: redaction scan refused the artifact (" + scan.findings.slice(0, 5).join("; ") + ")");
  return report;
}

/** Two reports are comparable only when they were produced from the SAME build. */
function compareReports(a, b) {
  if (!a || !b || a.buildSha !== b.buildSha || a.runnerSha !== b.runnerSha) return { ok: false, code: "DIFFERENT_BUILD" };
  if (a.scenario.id !== b.scenario.id) return { ok: false, code: "DIFFERENT_SCENARIO" };
  if (a.target.name !== b.target.name) return { ok: false, code: "DIFFERENT_TARGET" };
  const p = x => (x.performance && x.performance.latency) || {};
  return { ok: true, buildSha: a.buildSha, latencyDelta: { p50: (p(b).p50 || 0) - (p(a).p50 || 0), p95: (p(b).p95 || 0) - (p(a).p95 || 0), p99: (p(b).p99 || 0) - (p(a).p99 || 0) }, verdicts: [a.verdict, b.verdict] };
}

const fmt = v => (v === null || v === undefined ? "-" : String(v));
const pct = p => (p && p.count ? p.p50 + " / " + p.p95 + " / " + p.p99 + " / " + p.max + " ms (n=" + p.count + ")" : "-");
function toMarkdown(r) {
  const lines = [];
  lines.push("# SmartAssess Coding — load / certification result: " + r.scenario.id + (r.scenario.title ? " (" + r.scenario.title + ")" : ""));
  lines.push("");
  const q = r.qualification || { verdict: r.verdict, failed: [], notEvaluated: [], checks: [] };
  lines.push("**Verdict: " + r.verdict + "** (scenario qualification) — correctness " + (r.correctness.pass ? "PASS" : r.correctness.failed.length ? "FAIL (" + r.correctness.failed.join(", ") + ")" : "INCOMPLETE (" + r.correctness.notEvaluated.join(", ") + " not evaluated)") + "; scenario checks " + (q.failed.length ? "FAIL (" + q.failed.join(", ") + ")" : q.notEvaluated.length ? "INCOMPLETE (" + q.notEvaluated.join(", ") + " not evaluated)" : "PASS") + ". Performance numbers are reported separately; only the scenario's own pass rule (e.g. P1 for CERT-J) feeds the verdict.");
  lines.push("");
  lines.push("| | |"); lines.push("|---|---|");
  lines.push("| target / environment class | " + r.target.name + (r.target.host ? " (" + r.target.host + ")" : "") + " |");
  lines.push("| build SHA / Runner SHA | " + r.buildSha + " / " + fmt(r.runnerSha) + " |");
  lines.push("| harness version / schema | " + r.harnessVersion + " / " + r.schemaVersion + " |");
  lines.push("| VM SKU | " + fmt(r.vmSku) + " |");
  lines.push("| started / duration | " + r.startedAt + " / " + r.durationMs + " ms |");
  lines.push("| scenario configuration | `" + JSON.stringify(r.scenario.config) + "` |");
  lines.push("");
  lines.push("## Correctness gates"); lines.push(""); lines.push("| gate | result | detail |"); lines.push("|---|---|---|");
  for (const g of r.correctness.gates) lines.push("| " + g.id + " " + g.title + " | " + (!g.evaluated ? "not evaluated" : g.pass ? "PASS" : "**FAIL**") + " | " + g.detail + " |");
  lines.push("");
  lines.push("## Qualification (the scenario's own pass rule — decides the verdict)"); lines.push(""); lines.push("| check | result | detail |"); lines.push("|---|---|---|");
  for (const c of q.checks) lines.push("| " + c.id + " " + c.title + " | " + (!c.evaluated ? "not evaluated" : c.pass ? "PASS" : "**FAIL**") + " | " + c.detail + (c.contradiction ? " — **contradiction:** " + c.contradiction : "") + " |");
  lines.push("");
  if (q.contradictions && q.contradictions.length) { lines.push("**Evidence contradictions (stored summary vs raw evidence):** " + q.contradictions.join("; ")); lines.push(""); }
  if (r.callbacks) { lines.push("## Callback bursts"); lines.push(""); for (const b of r.callbacks) lines.push("- " + b.count + " × " + (b.nearMax ? "near-max" : "small") + " body (" + b.bytesPerBody + " bytes) at concurrency " + b.concurrency + ": expected " + b.expectedAnswer + ", answers " + JSON.stringify(b.answers) + ", transport " + (b.transportOk ? "OK" : "**FAILED**") + ", latency " + pct(b.latency) + (b.idempotency ? "; re-delivery " + b.idempotency.redeliveryAnswer + " — before " + JSON.stringify(b.idempotency.before) + ", after " + JSON.stringify(b.idempotency.after) + " → " + (b.idempotency.pass ? "idempotent" : "**NOT idempotent**") : "")); lines.push(""); }
  lines.push("## Totals"); lines.push(""); lines.push("| offered | completed | RUNNER_BUSY | rejected | network errors | failed | official offered | official accepted | official busy |"); lines.push("|---|---|---|---|---|---|---|---|---|");
  const t = r.totals; lines.push("| " + [t.offered, t.completed, t.busy, t.rejected, t.networkErrors, t.failed, t.officialOffered, t.officialAccepted, t.officialBusy].map(fmt).join(" | ") + " |");
  lines.push("");
  lines.push("## Performance (p50 / p95 / p99 / max)"); lines.push("");
  lines.push("- practice end-to-end (Runner leg): " + pct(r.performance.latency));
  if (r.performance.official) { lines.push("- official dispatch: " + pct(r.performance.official.dispatch)); lines.push("- official callback (dispatch → callback): " + pct(r.performance.official.callback)); lines.push("- official end-to-end: " + pct(r.performance.official.endToEnd)); }
  if (r.performance.throughputPerMinute !== null) lines.push("- completed practice executions per minute: " + r.performance.throughputPerMinute);
  if (r.performance.p1) lines.push("- P1 regression (≤ " + r.performance.p1.ceilingMs + " ms): " + (r.performance.p1.pass ? "PASS" : "**FAIL** " + JSON.stringify(r.performance.p1.violations) + (r.performance.p1.missing.length ? " missing " + r.performance.p1.missing.join(",") : "")));
  lines.push("");
  if (r.languages && Object.keys(r.languages).length) {
    lines.push("## Per language"); lines.push(""); lines.push("| language | offered | completed | busy | failed | outcomes | p50 / p95 / p99 / max |"); lines.push("|---|---|---|---|---|---|---|");
    for (const [k, v] of Object.entries(r.languages)) lines.push("| " + k + " | " + v.offered + " | " + v.completed + " | " + v.busy + " | " + v.failed + " | " + JSON.stringify(v.outcomes) + " | " + pct(v.latency) + " |");
    lines.push("");
  }
  if (r.official) {
    const o = r.official;
    lines.push("## Official accounting"); lines.push("");
    lines.push("accepted " + o.accepted + " = complete " + o.complete + " + retryable " + o.retryable + " + failed-terminal " + o.failedTerminal + " → remainder **" + o.remainder + "**; lost " + o.lost.length + "; duplicate applications " + o.duplicateApplications + "; idempotent alreadyApplied answers " + o.duplicateCallbackAcks + "; infrastructure zeroes " + o.infrastructureZeroes.length + "; hidden-test leaks " + o.hiddenLeaks);
    lines.push("");
  }
  if (r.journal) { lines.push("## Journal at final settlement"); lines.push(""); lines.push("`" + JSON.stringify(r.journal.counts || r.journal) + "`" + (r.journal.issues && r.journal.issues.length ? " issues: " + r.journal.issues.join(", ") : "") + (r.journal.declared && r.journal.declared.length ? " declared: " + r.journal.declared.join(", ") : "")); lines.push(""); }
  if (r.saturation) { lines.push("## Saturation / admission"); lines.push(""); lines.push("`" + JSON.stringify(r.saturation) + "`"); lines.push(""); }
  if (r.recovery) { lines.push("## Recovery"); lines.push(""); lines.push("`" + JSON.stringify(r.recovery) + "`"); lines.push(""); }
  if (r.fairness) { lines.push("## Fairness (measured, no guarantee claimed)"); lines.push(""); lines.push("`" + JSON.stringify(r.fairness) + "`"); lines.push(""); }
  if (r.attachments) { lines.push("## Operator attachments"); lines.push(""); lines.push("`" + JSON.stringify(r.attachments) + "`"); lines.push(""); }
  if (r.notes.length) { lines.push("## Notes"); lines.push(""); for (const n of r.notes) lines.push("- " + n); lines.push(""); }
  return lines.join("\n");
}

module.exports = { HARNESS_VERSION, redactionScan, buildReport, compareReports, toMarkdown };
