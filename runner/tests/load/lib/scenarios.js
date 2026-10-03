"use strict";
// Phase 17F-B10-A — the CERTIFICATION SCENARIO CATALOG (CERT-A … CERT-L) and the planner that turns a scenario + parameters into a
// bounded, validated PLAN (steps of practice / official / callback-burst / recovery items with an offered concurrency). Every
// scenario states its purpose, the targets it may run on, prerequisites, default volume, expected outcome, safety notes, the
// evidence it collects and its pass rule. A plan never exceeds the target's hard ceilings (safety.js) and a malformed or zero-job
// request is refused (SCENARIO_INVALID). Volumes scale through parameters; nothing here hard-codes school-size numbers.
const { WORKLOADS, BY_ID, normalizeWorkload } = require("./workloads.js");
const { LANGUAGES } = require("./metrics.js");
const { resolveCeilings, checkPlanAgainstCeilings } = require("./safety.js");
const { requiredChecksFor } = require("./qualification.js");

const DEFAULT_LEVELS = [1, 2, 4, 8, 16, 32];
const posInt = v => Number.isInteger(v) && v >= 1;
const nonNegInt = v => Number.isInteger(v) && v >= 0;
const SUCCESS_IDS = ["P1", "J1", "C1"];
const FAILURE_IDS = ["P3", "P4", "J3", "J4", "J5", "C3", "C4", "C5"];
const student = i => "cert-student-" + String(i + 1).padStart(2, "0");                   // TEST-ONLY identities, never real students
const pick = (pool, i) => pool[i % pool.length];

const practice = (w, actor, extra = {}) => ({ type: "practice", workloadId: w.id, language: w.language, actor, workload: w, ...extra });
const official = (w, actor, casesPerJob, assignment, extra = {}) => ({ type: "official", workloadId: w.id, language: w.language, actor, casesPerJob, assignment, workload: w, ...extra });

/** The catalog. `plan(p, ctx)` returns the steps; `p` is already validated / defaulted by planScenario. */
const CATALOG = [
  { id: "CERT-A", title: "Practice correctness", group: "A", modes: [1], targets: ["local", "staging", "production"],
    purpose: "Every matrix workload (P1–P4, J1–J5, C1–C5) through the signed practice protocol returns the expected status (and output).",
    prerequisites: "Runner reachable; practice runs persist nothing (production-safe).", volume: "jobs = 14 (one per workload) · concurrency 2", expected: "every result status matches the workload; no RUNNER_BUSY at concurrency ≤ the Runner limit",
    safety: "Non-destructive; identical in nature to smoke.js language rows.", evidence: "per-language outcomes and latency percentiles; expectation mismatches", passRule: "G1–G11 PASS; mismatches = 0",
    defaults: { jobs: 14, concurrency: 2 }, plan: p => [{ kind: "load", concurrency: p.concurrency, items: cycle(p.workloads, p.jobs, (w, i) => practice(w, student(i % 4))) }] },
  { id: "CERT-B", title: "Official grading correctness", group: "B", modes: [2], targets: ["local", "staging"],
    purpose: "Official jobs with hidden cases complete through the queue, the journal and the signed callback; every accepted job is graded at most once and correctly.",
    prerequisites: "A callback receiver the Runner can reach (local stack, or the harness receiver on staging). PRODUCTION: only through the SmartAssess API with the dedicated test class (manual procedure).", volume: "officialJobs = 14 · casesPerJob = 3 · concurrency 4",
    expected: "accepted = complete + retryable + failed; compile-error / timeout / runtime-error workloads produce the matching evidence; duplicate applications 0", safety: "Never pointed at production directly: an orphan callback would park in the production journal.",
    evidence: "official ledger reconciliation, callback timing percentiles, journal consistency", passRule: "G1, G2, G4, G5, G6, G9, G10, G11 PASS",
    defaults: { officialJobs: 14, casesPerJob: 3, concurrency: 4 }, plan: p => [{ kind: "load", concurrency: p.concurrency, items: cycle(p.workloads, p.officialJobs, (w, i) => official(w, student(i % 6), p.casesPerJob, "cert-assignment-1")) }] },
  { id: "CERT-C", title: "Language failure modes", group: "C", modes: [1, 2], targets: ["local", "staging"],
    purpose: "Timeout, runtime error, compile error (Java / C#) and CPU-heavy runs are bounded and reported as the right outcome in practice AND official grading.",
    prerequisites: "as CERT-B", volume: "8 failure workloads × practice + official", expected: "outcomes equal the workload expectation; no internal-error", safety: "Bounded time limits only; no memory / fork pressure.",
    evidence: "per-outcome latency, compile cost (large-compile vs success)", passRule: "G1–G11 PASS; internal-error = 0",
    defaults: { jobs: 8, officialJobs: 8, casesPerJob: 2, concurrency: 2, workloadIds: FAILURE_IDS },
    plan: p => [{ kind: "load", concurrency: p.concurrency, items: [...cycle(p.workloads, p.jobs, (w, i) => practice(w, student(i))), ...cycle(p.workloads, p.officialJobs, (w, i) => official(w, student(i), p.casesPerJob, "cert-assignment-1"))] }] },
  { id: "CERT-D", title: "Concurrency ladder", group: "D", modes: [1], targets: ["local", "staging", "production"],
    purpose: "How practice latency and RUNNER_BUSY behave as offered concurrency rises (1, 2, 4, 8, 16, 32 — or one level).",
    prerequisites: "Runner reachable", volume: "jobs per level = jobs (default 8) · levels bounded by the target ceiling", expected: "busy appears only above the Runner's RUNNER_MAX_CONCURRENCY; latency p95 per level is recorded", safety: "Production: ≤ 8 concurrent, cool-down between levels (ceilings).",
    evidence: "per-level offered / completed / busy / p50 / p95 / p99", passRule: "G7, G8 PASS; correctness gates PASS; performance reported per level",
    defaults: { jobs: 8, workloadIds: SUCCESS_IDS }, plan: (p, ctx) => (p.concurrency ? [p.concurrency] : DEFAULT_LEVELS.filter(l => l <= ctx.ceilings.maxConcurrency && (!p.levels || p.levels.includes(l)))).map(level => ({ kind: "load", level, concurrency: level, cooldown: true, items: cycle(p.workloads, p.jobs, (w, i) => practice(w, student(i % level))) })) },
  { id: "CERT-E", title: "Saturation / admission control", group: "E", modes: [6], targets: ["local", "staging"],
    purpose: "Push practice and official admission past the configured limits and prove safe refusal (503 RUNNER_BUSY) instead of queue / resource growth; the Runner stays responsive.",
    prerequisites: "local stack (Runner limits set by the scenario) or a staging Runner whose limits the operator knows", volume: "offered = 4 × the Runner limit (default) practice + officialJobs above maxPending", expected: "busy > 0, peak active ≤ configured limit, /healthz 200 afterwards, every busy job accounted as busy (never lost)", safety: "Staging only among remote targets: saturating production would refuse real students.",
    evidence: "saturation summary (offered, busy, completed, peak active), responsiveness", passRule: "G7, G8, G9 PASS; busy counted separately (G-busy)",
    defaults: { jobs: 16, officialJobs: 8, casesPerJob: 1, concurrency: 8, workloadIds: ["P2", "J1", "C1"], runner: { maxConcurrency: 2, maxPending: 3, maxActive: 1 } },
    plan: p => [{ kind: "load", saturation: true, concurrency: p.concurrency, items: cycle(p.workloads, p.jobs, (w, i) => practice(w, student(i))) }, { kind: "load", saturation: true, concurrency: p.concurrency, items: cycle(p.workloads.filter(w => w.kind !== "compile-error"), p.officialJobs, (w, i) => official(w, student(i), p.casesPerJob, "cert-assignment-1")) }] },
  { id: "CERT-F", title: "Callbacks / idempotency", group: "F", modes: [4], targets: ["local", "staging", "production"],
    purpose: "Many signed callbacks arrive in a bounded interval; on local a re-delivered, already-applied result answers alreadyApplied and never changes the score (Q-IDEMPOTENCY). On staging / production every synthetic job is unknown to SmartAssess (404 UNKNOWN_JOB): transport qualification only — no remote idempotency is claimed.",
    prerequisites: "local: the harness receiver. staging / production: SMARTASSESS_CALLBACK_BASE_URL + SMARTASSESS_CALLBACK_HMAC_KEY in the environment; every remote callback names a job that cannot exist (404 UNKNOWN_JOB — nothing is written, like smoke.js).",
    volume: "callbacks = jobs (default 20) · concurrency 4", expected: "local: every callback applied once, re-delivery alreadyApplied; production: 404 UNKNOWN_JOB for all", safety: "Production bodies are small and bounded (≤ 20 by ceiling); nothing is applied.",
    evidence: "callback answers, latency percentiles, idempotency check", passRule: "G2 PASS (0 duplicate applications, 0 score drift); transport answers as expected",
    defaults: { jobs: 20, concurrency: 4 }, plan: (p, ctx) => [{ kind: "callback-burst", count: p.jobs, concurrency: p.concurrency, idempotency: ctx.target === "local" }] },
  { id: "CERT-G", title: "Recovery under load", group: "G", modes: [5], targets: ["local"],
    purpose: "Accepted official work exists, the gateway dies, the journal is inspected, the gateway returns, recovery re-dispatches, jobs settle, grades apply at most once, no resubmission is needed.",
    prerequisites: "local stack (in-process crash / restart over the same journal). STAGING / PRODUCTION: the manual procedure in crash-tests.md / smoke-matrix.md §Recovery (a test suite never stops a production service).",
    volume: "officialJobs = 6 · casesPerJob = 2", expected: "journal at crash: ≥ 1 running / received; after restart: every job confirmed, applied once, re-executions ≤ maxInterruptions", safety: "Local only.",
    evidence: "recovery summary (outstanding at crash, recovered, re-executions, applied once), journal consistency", passRule: "G1, G2, G5, G6, G9, G10 PASS; reExecutionsPerJob ≤ 1",
    defaults: { officialJobs: 6, casesPerJob: 2, concurrency: 3, workloadIds: ["P1", "J1", "C1"], runner: { maxConcurrency: 2, maxPending: 16, maxActive: 1 } },
    plan: p => [{ kind: "recovery", concurrency: p.concurrency, items: cycle(p.workloads, p.officialJobs, (w, i) => official(w, student(i), p.casesPerJob, "cert-assignment-1")) }] },
  { id: "CERT-H", title: "Journal consistency", group: "H", modes: [2], targets: ["local"],
    purpose: "After a completed official batch the journal holds no running / received / executed / callback_failed / corrupt records.",
    prerequisites: "local stack (the journal is on the Runner host; remote runs attach journal-status.js --json output).", volume: "officialJobs = 10", expected: "clean final state", safety: "Local only; remote journals are inspected read-only by the operator.",
    evidence: "journal counts at settlement", passRule: "G3, G5, G6 PASS",
    defaults: { officialJobs: 10, casesPerJob: 2, concurrency: 4, workloadIds: SUCCESS_IDS }, plan: p => [{ kind: "load", concurrency: p.concurrency, items: cycle(p.workloads, p.officialJobs, (w, i) => official(w, student(i), p.casesPerJob, "cert-assignment-1")) }] },
  { id: "CERT-I", title: "Fairness (measured)", group: "I", modes: [3], targets: ["local", "staging"],
    purpose: "F1 one student bursts while another sends one request · F2 one assignment bursts while another submits · F3 mixed-language burst · F4 practice plus official. Latency and starvation are MEASURED; no fairness guarantee is claimed (B9 defines policy).",
    prerequisites: "as CERT-B for the official part", volume: "burst = jobs (default 12) per sub-scenario", expected: "numbers only: per-actor p50 / p95 / max, the single requester's latency vs the burst p50", safety: "Bounded bursts.",
    evidence: "fairness summary per sub-scenario", passRule: "correctness gates PASS; fairness is reported, not gated",
    defaults: { jobs: 12, officialJobs: 4, casesPerJob: 2, concurrency: 6, workloadIds: SUCCESS_IDS, runner: { maxConcurrency: 6, maxPending: 16, maxActive: 2 } },
    plan: p => [
      { kind: "load", fairness: "F1", concurrency: p.concurrency, items: [...cycle(p.workloads, p.jobs, w => practice(w, "burst-student")), practice(p.workloads[0], "single-student", { probe: true })] },
      { kind: "load", fairness: "F2", concurrency: p.concurrency, items: [...cycle(p.workloads, p.jobs, (w, i) => practice(w, student(i), { assignment: "burst-assignment" })), practice(p.workloads[0], "other-assignment-student", { probe: true, assignment: "other-assignment" })] },
      { kind: "load", fairness: "F3", concurrency: p.concurrency, items: cycle(WORKLOADS.filter(w => SUCCESS_IDS.includes(w.id) || ["P2", "J2", "C2"].includes(w.id)), p.jobs, (w, i) => practice(w, student(i))) },
      { kind: "load", fairness: "F4", concurrency: p.concurrency, items: [...cycle(p.workloads, p.jobs, (w, i) => practice(w, student(i))), ...cycle(p.workloads, p.officialJobs, (w, i) => official(w, student(i + 20), p.casesPerJob, "cert-assignment-1"))] }
    ] },
  { id: "CERT-J", title: "P1 latency regression", group: "J", modes: [1], targets: ["local", "staging", "production"],
    purpose: "The A2 pilot gate P1: the near-worst legitimate practice programs (smoke.js p1Programs) answer in ≤ 40 s for Python, Java and C# (Runner leg; the browser leg is measured manually as in smoke-matrix.md §P1).",
    prerequisites: "Runner reachable", volume: "3 runs (one per language) · concurrency 1 · repeats = jobs/3", expected: "every run ≤ 40000 ms", safety: "Identical to smoke.js --gate-p1.",
    evidence: "P1 samples per language", passRule: "performance.p1.pass = true (reported separately from correctness)",
    defaults: { jobs: 3, concurrency: 1 }, plan: p => [{ kind: "p1", concurrency: 1, repeats: Math.max(1, Math.floor(p.jobs / 3)) }] },
  { id: "CERT-K", title: "P2 callback-size regression", group: "K", modes: [2, 4], targets: ["local", "staging", "production"],
    purpose: "A: synthetic near-max callback (50 worst-case cases ≈ 6.45 MB) crosses the transport. B (local / staging): a REAL official job with 50 hidden cases and ~17 KB output per case is graded once and a re-delivery answers alreadyApplied.",
    prerequisites: "production: callback env (as CERT-F) — part A only; part B needs the receiver", volume: "A: 1 near-max body · B: 1 job × 50 cases", expected: "A: applied (local) / 404 UNKNOWN_JOB (remote); B: applied once, alreadyApplied on re-delivery", safety: "One body only on production.",
    evidence: "callback size, latency, idempotency", passRule: "transport accepted; G2 PASS",
    defaults: { jobs: 1, officialJobs: 1, casesPerJob: 50, concurrency: 1 }, plan: (p, ctx) => [{ kind: "callback-burst", count: 1, concurrency: 1, nearMax: true, idempotency: ctx.target === "local" }, ...(ctx.target === "production" ? [] : [{ kind: "load", concurrency: 1, items: [official(largeOutput(), student(0), p.casesPerJob, "cert-assignment-p2", { largeOutput: true })] }])] },
  { id: "CERT-L", title: "Final mixed workload (exam-like)", group: "L", modes: [3], targets: ["local", "staging"],
    purpose: "Several test students, Python / Java / C#, practice runs and official submissions, passing / wrong / compile-failing / runtime-failing / timing-out programs, callbacks, grading evidence and journal verification — the shape of a school exam, scaled by parameters.",
    prerequisites: "as CERT-B. PRODUCTION: through the SmartAssess API with the dedicated test class only (manual, see the certification document).", volume: "jobs = 24 practice · officialJobs = 12 · casesPerJob = 3 · concurrency 4 · students = 8",
    expected: "every accepted job settles; grades applied once; journal clean; outcomes match", safety: "Scaled by parameters; bounded by ceilings.", evidence: "everything above", passRule: "all gates PASS",
    defaults: { jobs: 24, officialJobs: 12, casesPerJob: 3, concurrency: 4, students: 8 },
    plan: p => [{ kind: "load", concurrency: p.concurrency, items: interleave(cycle(p.workloads, p.jobs, (w, i) => practice(w, student(i % p.students))), cycle(p.workloads.filter(w => w.kind !== "cpu"), p.officialJobs, (w, i) => official(w, student(i % p.students), p.casesPerJob, "cert-assignment-" + (1 + (i % 2))))) }] }
];
const BY_SCENARIO = Object.fromEntries(CATALOG.map(s => [s.id, s]));

function cycle(pool, n, make) { const out = []; for (let i = 0; i < n; i++) out.push(make(pick(pool, i), i)); return out; }
function interleave(a, b) { const out = []; for (let i = 0; i < Math.max(a.length, b.length); i++) { if (i < a.length) out.push(a[i]); if (i < b.length) out.push(b[i]); } return out; }
/** The P2 "real large callback" program: ~17 KB of output per hidden case (Python keeps the start-up cost out of the measurement). */
function largeOutput() { return { ...normalizeWorkload({ id: "P2LARGE", language: "python", kind: "success", fn: "none", source: "import sys\nsys.stdin.readline()\nprint('x' * 17000)  # LOAD-KIND:success LOAD-FN:large\n", expect: { status: "success" } }), fn: "large" }; }

/** Validates + defaults the parameters of one scenario. → { ok: true, params } | { ok: false, code: "SCENARIO_INVALID", detail } */
function normalizeParams(def, params) {
  const bad = detail => ({ ok: false, code: "SCENARIO_INVALID", detail });
  if (params === null || typeof params !== "object" || Array.isArray(params)) return bad("params must be an object");
  const p = { ...def.defaults };
  for (const k of ["jobs", "officialJobs", "casesPerJob", "concurrency", "students"]) if (params[k] !== undefined) p[k] = params[k];
  if (p.jobs !== undefined && !nonNegInt(p.jobs)) return bad("jobs must be a non-negative integer");
  if (p.officialJobs !== undefined && !nonNegInt(p.officialJobs)) return bad("officialJobs must be a non-negative integer");
  if (p.casesPerJob !== undefined && !(posInt(p.casesPerJob) && p.casesPerJob <= 50)) return bad("casesPerJob must be 1..50");
  if (p.concurrency !== undefined && !posInt(p.concurrency)) return bad("concurrency must be a positive integer");
  if (p.students !== undefined && !posInt(p.students)) return bad("students must be a positive integer");
  if (params.levels !== undefined) { if (!Array.isArray(params.levels) || !params.levels.length || !params.levels.every(posInt)) return bad("levels must be positive integers"); p.levels = params.levels.slice(); }
  let languages = LANGUAGES.slice();
  if (params.languages !== undefined) { if (!Array.isArray(params.languages) || !params.languages.length || !params.languages.every(l => LANGUAGES.includes(l))) return bad("languages must be a non-empty subset of python, java, csharp"); languages = params.languages.slice(); }
  let workloads;
  if (params.workloads !== undefined) {
    if (!Array.isArray(params.workloads) || !params.workloads.length) return bad("workloads must be a non-empty array");
    workloads = params.workloads.map(normalizeWorkload);
    if (workloads.some(w => !w)) return bad("a workload is malformed");
  } else {
    const ids = params.workloadIds || def.defaults.workloadIds || WORKLOADS.map(w => w.id);
    if (!Array.isArray(ids) || !ids.length || !ids.every(id => BY_ID[id])) return bad("workloadIds must name matrix workloads");
    workloads = ids.map(id => BY_ID[id]);
  }
  workloads = workloads.filter(w => languages.includes(w.language));
  if (!workloads.length) return bad("no workload left for the selected languages");
  p.languages = languages; p.workloads = workloads;
  const total = (p.jobs || 0) + (p.officialJobs || 0);
  if (def.id !== "CERT-J" && total < 1) return bad("a scenario must offer at least one job");
  if (def.id === "CERT-J" && !(p.jobs >= 1)) return bad("CERT-J needs jobs ≥ 1");
  if (params.runner !== undefined) { const r = params.runner; if (!r || typeof r !== "object" || ![r.maxConcurrency, r.maxPending, r.maxActive].every(v => v === undefined || posInt(v))) return bad("runner limits must be positive integers"); p.runner = { ...(def.defaults.runner || {}), ...r }; }
  if (params.ceilings !== undefined) { if (!params.ceilings || typeof params.ceilings !== "object") return bad("ceilings must be an object"); p.ceilings = { ...params.ceilings }; }
  if (params.settleTimeoutMs !== undefined) { if (!posInt(params.settleTimeoutMs)) return bad("settleTimeoutMs must be a positive integer"); p.settleTimeoutMs = params.settleTimeoutMs; }
  if (params.profile !== undefined) p.profile = params.profile;
  if (params.sandbox !== undefined) { if (!["fake", "docker"].includes(params.sandbox)) return bad("sandbox must be fake or docker"); p.sandbox = params.sandbox; }
  if (params.journalExpected !== undefined) p.journalExpected = params.journalExpected;
  return { ok: true, params: p };
}

/** planScenario({ scenario, target, params }) → { ok: true, scenario, params, ceilings, steps, totals } | { ok: false, code, ... } */
function planScenario({ scenario, target, params = {} } = {}) {
  const def = typeof scenario === "string" ? BY_SCENARIO[scenario] : undefined;
  if (!def) return { ok: false, code: "UNKNOWN_SCENARIO", detail: "known scenarios: " + CATALOG.map(s => s.id).join(", ") };
  const np = normalizeParams(def, params);
  if (!np.ok) return np;
  const p = np.params;
  const c = resolveCeilings(target, p.ceilings || {});
  if (!c.ok) return c.code === "UNKNOWN_TARGET" ? { ok: false, code: "UNKNOWN_TARGET" } : { ok: false, code: c.code === "CEILING_EXCEEDED" ? "MAX_" + c.field.replace(/^max/, "").replace(/([A-Z])/g, "_$1").toUpperCase().replace(/^_/, "") + "_EXCEEDED" : "SCENARIO_INVALID", detail: c };
  const steps = def.plan(p, { target, ceilings: c.ceilings });
  if (!steps.length) return { ok: false, code: "SCENARIO_INVALID", detail: "the plan has no steps" };
  const totals = { jobs: 0, practiceJobs: 0, officialJobs: 0, callbacks: 0, maxConcurrency: 0, maxCasesPerJob: 0, steps: steps.length, languages: new Set(), kinds: new Set() };
  for (const s of steps) {
    totals.maxConcurrency = Math.max(totals.maxConcurrency, s.concurrency);
    if (s.kind === "callback-burst") { totals.callbacks += s.count; totals.jobs += s.count; continue; }
    if (s.kind === "p1") { totals.jobs += 3 * s.repeats; totals.practiceJobs += 3 * s.repeats; for (const l of LANGUAGES) totals.languages.add(l); continue; }
    for (const it of s.items) {
      totals.jobs++; totals.languages.add(it.language);
      if (it.type === "official") { totals.officialJobs++; totals.maxCasesPerJob = Math.max(totals.maxCasesPerJob, it.casesPerJob); totals.kinds.add("official"); } else { totals.practiceJobs++; totals.kinds.add("practice"); }
    }
  }
  if (totals.jobs < 1) return { ok: false, code: "SCENARIO_INVALID", detail: "zero jobs planned" };
  totals.languages = [...totals.languages].sort(); totals.kinds = [...totals.kinds].sort();
  const over = checkPlanAgainstCeilings(totals, c.ceilings);
  if (over) return { ok: false, ...over, detail: over };
  const config = { scenario: def.id, concurrency: totals.maxConcurrency, jobs: totals.jobs, practiceJobs: totals.practiceJobs, officialJobs: totals.officialJobs, callbacks: totals.callbacks, casesPerJob: totals.maxCasesPerJob || null, languages: totals.languages, workloadIds: p.workloads.map(w => w.id), limits: { practice: { timeMs: 3000, memoryMb: 128, outputBytes: 4096 }, official: { timeMs: 3000, memoryMb: 128, outputBytes: 17408 } }, runner: p.runner || null, levels: steps.filter(s => s.level).map(s => s.level), students: p.students || null, ceilings: c.ceilings, qualification: requiredChecksFor(def.id, target) };
  return { ok: true, scenario: def, params: p, ceilings: c.ceilings, steps, totals, config };
}

const listScenarios = () => CATALOG.map(({ plan: _plan, defaults, ...rest }) => ({ ...rest, defaults: { ...defaults } }));

/** The catalog as Markdown (used by the CLI `catalog` command and the certification document). */
function catalogMarkdown() {
  const out = ["| id | title | targets | purpose | prerequisites | default volume | expected | safety | evidence | pass rule |", "|---|---|---|---|---|---|---|---|---|---|"];
  for (const s of CATALOG) out.push("| " + [s.id, s.title, s.targets.join(" / "), s.purpose, s.prerequisites, s.volume, s.expected, s.safety, s.evidence, s.passRule].map(x => String(x).replace(/\|/g, "\\|")).join(" | ") + " |");
  return out.join("\n");
}

module.exports = { CATALOG, BY_SCENARIO, DEFAULT_LEVELS, planScenario, listScenarios, catalogMarkdown };
