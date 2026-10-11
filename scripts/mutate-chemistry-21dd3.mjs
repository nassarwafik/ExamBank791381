#!/usr/bin/env node
// Phase 21D-D.3 focused mutation certification of the virtual chemistry laboratory: exact decimals and rounding, the precision policy
// (half a unit in the last place, the instrument floors, the inclusive boundary), exact units, the solution / pH / titration / rate models
// and their supported ranges, the strict public config and its ambiguity refusals, replay normalization, server-side grading (derived
// answers, exact choice sets, the student's own bench), and the presentation invariants (readouts only when enabled, answers kept apart,
// typed numbers, reading order, the time cursor).
// AGENTS.md §9: every mutant is planted alone, the selected tests run, a mutant is KILLED only when a test fails because of it; a timeout is
// reported as such; every file is restored byte-for-byte (sha256-verified) even on interruption, and `git diff --exit-code` must be clean afterwards.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";
const EX = "src/chemistry/lab/exact.ts", PR = "src/chemistry/lab/precision.ts", UN = "src/chemistry/lab/units.ts", SO = "src/chemistry/lab/solutions.ts";
const AB = "src/chemistry/lab/acidBase.ts", TI = "src/chemistry/lab/titration.ts", KI = "src/chemistry/lab/kinetics.ts";
const MODEL = "src/chemistryLabModel.ts", PLUGIN = "src/chemistryLabPlugin.ts";
const VIEW = "src/chemistryLab/labView.ts", BENCH = "src/chemistryLab/LabBenches.tsx", WS = "src/chemistryLab/ChemLabWorkspace.tsx";
const CORE = ["src/chemistry/lab/labFoundation.21dd3.test.ts", "src/chemistry/lab/labModels.21dd3.test.ts"];
const AUTH = ["src/chemistryLab.21dd3.test.ts", "api/tests/certification-21dd3/cert-21dd3-chemistry-lab-lifecycle.test.js"];
const UI = ["src/chemistryLab/chemLabUi.21dd3.test.tsx"];
const M = (id, file, before, after, tests) => ({ id, file, before, after, tests });
const mutants = [
  // exact decimals
  M("E01-round-half-down", EX, "const r = cmp(rem, q(1n, 2n)) >= 0 ? whole + 1n : whole;", "const r = cmp(rem, q(1n, 2n)) > 0 ? whole + 1n : whole;", [...CORE, ...AUTH]),
  M("E02-exponent-bound", EX, "if (Math.abs(exp) > 30) return null;", "if (false) return null;", [...CORE, ...AUTH]),
  M("E03-length-bound", EX, 'if (typeof raw !== "string" || raw.length > 32 || !DECIMAL_PATTERN.test(raw)) return null;', 'if (typeof raw !== "string" || !DECIMAL_PATTERN.test(raw)) return null;', [...CORE, ...AUTH]),
  // the precision policy
  M("P01-full-unit-tolerance", PR, "max(mul(lastPlaceUnit(p, trusted), q(1n, 2n)), instrument)", "max(lastPlaceUnit(p, trusted), instrument)", [...CORE, ...AUTH]),
  M("P02-instrument-floor-ignored", PR, "max(mul(lastPlaceUnit(p, trusted), q(1n, 2n)), instrument)", "mul(lastPlaceUnit(p, trusted), q(1n, 2n))", [...CORE, ...AUTH]),
  M("P03-exclusive-boundary", PR, "cmp(abs(sub(answer, trusted)), tolerance) <= 0", "cmp(abs(sub(answer, trusted)), tolerance) < 0", [...CORE, ...AUTH]),
  M("P04-significant-place", PR, "return pow10(floorLog10(trusted) - p.significant + 1);", "return pow10(floorLog10(trusted) - p.significant);", [...CORE, ...AUTH]),
  // exact units
  M("U01-millilitre-factor", UN, 'u("mL", "mL", pow10(-3))', 'u("mL", "mL", pow10(-2))', [...CORE, ...AUTH]),
  M("U02-minute-factor", UN, 'u("min", "min", q(60n))]),\n  temperature', 'u("min", "min", q(1n))]),\n  temperature', [...CORE, ...AUTH]),
  // Lab A
  M("S01-hydrate-mass", SO, 'solute("CuSO4", "CuSO4·5H2O",', 'solute("CuSO4", "CuSO4",', [...CORE, ...AUTH]),
  M("S02-above-model-accepted", SO, 'if (cmp(concentration, s.maxConcentration) > 0) return { ok: false, code: "LAB_SOLUTION_ABOVE_MODEL"', 'if (false) return { ok: false, code: "LAB_SOLUTION_ABOVE_MODEL"', [...CORE, ...AUTH]),
  M("S03-aliquot-not-smaller", SO, " || aliquotML >= flaskML) return", ") return", [...CORE, ...AUTH]),
  M("S04-balance-resolution", SO, "sign(m) > 0 && cmp(m, maxMass) <= 0 && mul(m, q(100n)).d === 1n;", "sign(m) > 0 && cmp(m, maxMass) <= 0;", [...CORE, ...AUTH]),
  M("S05-dilution-moles", SO, "const moles = mul(stock, litres(aliquotML)), volumeL = litres(flaskML);", "const moles = mul(stock, litres(flaskML)), volumeL = litres(flaskML);", [...CORE, ...AUTH]),
  // Lab B
  M("A01-diprotic-base", AB, 'case "strongBase": return pack(KW / excessRoot(s.ions * x));', 'case "strongBase": return pack(KW / excessRoot(x));', [...CORE, ...AUTH]),
  M("A02-weak-as-strong", AB, 'case "weakAcid": return pack(weakRoot(x, s.constant as number));', 'case "weakAcid": return pack(excessRoot(x));', [...CORE, ...AUTH]),
  M("A03-out-of-range", AB, 'if (cmp(c, s.cMin) < 0 || cmp(c, s.cMax) > 0) return { ok: false, code: "LAB_PH_UNSUPPORTED" };', 'if (false) return { ok: false, code: "LAB_PH_UNSUPPORTED" };', [...CORE, ...AUTH]),
  M("A04-water-ignored", AB, "return a >= 0 ? (a + s) / 2 : (2 * KW) / (s - a);", "return a >= 0 ? a : (2 * KW) / (s - a);", [...CORE, ...AUTH]),
  M("A05-indicator-base-edge", AB, 'if (pH > ind.high) return { state: "base"', 'if (pH > ind.low) return { state: "base"', [...CORE, ...AUTH]),
  M("A06-phenolphthalein-range", AB, "low: 8.2, high: 10.0", "low: 8.2, high: 9.0", [...CORE, ...AUTH]),
  // Lab C
  M("T01-ratio-inverted", TI, "const ratio = acidIsAnalyte ? div(qi(bCoef), qi(aCoef)) : div(qi(aCoef), qi(bCoef));", "const ratio = acidIsAnalyte ? div(qi(aCoef), qi(bCoef)) : div(qi(bCoef), qi(aCoef));", [...CORE, ...AUTH]),
  M("T02-endpoint-at-range-edge", TI, "const v = volumeAtPh(s, indicatorMidpoint(ind));", "const v = volumeAtPh(s, ind.low);", [...CORE, ...AUTH]),
  M("T03-suitability-limit", TI, 'return e <= ENDPOINT_TOLERANCE_ML ? "suitable" : "unsuitable";', 'return e <= 1 ? "suitable" : "unsuitable";', [...CORE, ...AUTH]),
  M("T04-no-ambiguity-band", TI, 'if (Math.abs(e - ENDPOINT_TOLERANCE_ML) <= ENDPOINT_AMBIGUITY_ML) return "ambiguous";', 'if (false) return "ambiguous";', [...CORE, ...AUTH]),
  M("T05-burette-drop", TI, "mul(v, qi(20)).d === 1n", "mul(v, qi(100)).d === 1n", [...CORE, ...AUTH]),
  M("T06-weak-titration", TI, 'if (!strong(analyte) || !strong(titrant)) return { ok: false, code: "LAB_TITRATION_UNSUPPORTED" };', 'if (false) return { ok: false, code: "LAB_TITRATION_UNSUPPORTED" };', [...CORE, ...AUTH]),
  M("T07-equivalence-range", TI, "if (cmp(equivalenceML, qi(L.equivalenceMinML)) < 0 || cmp(equivalenceML, qi(L.equivalenceMaxML)) > 0) return", "if (false) return", [...CORE, ...AUTH]),
  // Lab D
  M("K01-catalyst-raises-ea", KI, "return Math.exp(lnA - (ea - drop) / (GAS_CONSTANT * T));", "return Math.exp(lnA - (ea + drop) / (GAS_CONSTANT * T));", [...CORE, ...AUTH]),
  M("K02-half-life", KI, "  if (order === 1) return Math.LN2 / k;", "  if (order === 1) return 0.5 / k;", [...CORE, ...AUTH]),
  M("K03-second-order-law", KI, "return a0 / (1 + k * a0 * t);", "return a0 * Math.exp(-k * t);", [...CORE, ...AUTH]),
  M("K04-celsius-as-kelvin", KI, "export const toKelvin = (c: number): number => c + 273.15;", "export const toKelvin = (c: number): number => c + 273;", [...CORE, ...AUTH]),
  // the strict public config
  M("M01-unknown-key", MODEL, 'if (!["v", "experiment", "view", "tasks"].includes(k)) add(', "if (false) add(", AUTH),
  M("M02-unknown-ions", MODEL, "ca = div(mul(mul(cb, veq), qi(titrantSp.ions)), mul(va, qi(analyteSp.ions)));", "ca = div(mul(cb, veq), va);", AUTH),
  M("M03-lowest-tie", MODEL, "if (sorted.length < 2 || Math.abs(ph(sorted[0]) - ph(sorted[1])) < 0.01) return refuse(", "if (sorted.length < 2) return refuse(", AUTH),
  M("M04-indicator-edge", MODEL, "if (Math.abs(r.pH - ind.low) < 0.05 || Math.abs(r.pH - ind.high) < 0.05) return refuse(", "if (false) return refuse(", AUTH),
  M("M05-titre-floor", MODEL, "instrument: () => ML(parseDecimal(String(ENDPOINT_TOLERANCE_ML)) as Q), value: (c: ChemLabConfigV1) => ML(titrationOf(c).setup.equivalenceML) },", "instrument: zero, value: (c: ChemLabConfigV1) => ML(titrationOf(c).setup.equivalenceML) },", AUTH),
  M("M06-concentration-floor", MODEL, "instrument: (c: ChemLabConfigV1) => titreFloor(c, s => div(mul(s.ca, parseDecimal(String(ENDPOINT_TOLERANCE_ML)) as Q), s.equivalenceML)),", "instrument: zero,", AUTH),
  M("M07-reading-floor", MODEL, "instrument: () => ML(BURETTE.readingUncertaintyML),", "instrument: zero,", AUTH),
  M("M08-prepare-tolerance", MODEL, 'return cmp(sub(m, need), parseDecimal("0.01") as Q) <= 0 && cmp(sub(need, m), parseDecimal("0.01") as Q) <= 0;', 'return cmp(sub(m, need), parseDecimal("0.10") as Q) <= 0 && cmp(sub(need, m), parseDecimal("0.10") as Q) <= 0;', AUTH),
  M("M09-graph-without-meter", MODEL, 'if (experiment.kind === "titration" && view.graph && !view.readouts) {', "if (false) {", AUTH),
  M("M10-time-beyond-duration", MODEL, "if (!v || toNumber(v) > dur) {", "if (!v) {", AUTH),
  M("M11-answer-not-offered", MODEL, 'if (t.mode === "single" ? r.correct.length !== 1 : r.correct.length < 1) {', "if (false) {", AUTH),
  M("M12-observe-needs-meter", MODEL, "if (o.readouts && !c.view.readouts) {", "if (false) {", AUTH),
  M("M13-bracket-window", MODEL, "const within = (v: Q) => cmp(sub(v, veq), qi(1)) <= 0 && cmp(sub(veq, v), qi(1)) <= 0;", "const within = (_v: Q) => true;", AUTH),
  M("M14-fastest-tie", MODEL, "if (sorted.length < 2 || (r(sorted[0]) - r(sorted[1])) / r(sorted[0]) < 0.01) return refuse(", "if (sorted.length < 2) return refuse(", AUTH),
  M("M15-prepared-any-flask", MODEL, "!s.lab.madeUp || s.lab.flask !== t.volume) return false;", "!s.lab.madeUp) return false;", AUTH),
  // replay normalization and state
  M("G01-any-unit", PLUGIN, "return labUnit(dim, raw.unit) ? { ok: true, action:", "return true ? { ok: true, action:", AUTH),
  M("G02-single-takes-many", PLUGIN, 'if (t.mode === "single" && picked.length !== 1) return INVALID;', "", AUTH),
  M("G03-option-not-offered", PLUGIN, '!picked.every(o => typeof o === "string" && t.options.includes(o))', '!picked.every(o => typeof o === "string")', AUTH),
  M("G04-burette-overflow", PLUGIN, "return cmp(next, qi(BURETTE.capacityML)) > 0 ? s : { ...s, lab: { ...lab, added: toFixed(next, 2) } };", "return { ...s, lab: { ...lab, added: toFixed(next, 2) } };", [...AUTH, ...UI]),
  M("G05-meter-without-readouts", PLUGIN, 'return e.kind === "ph" && c.view.readouts && has(["solutionId"])', 'return e.kind === "ph" && has(["solutionId"])', AUTH),
  M("G06-empty-make-up", PLUGIN, "return lab.kind === \"solutions\" && lab.flask !== null && (lab.mass !== null || lab.pipette !== null) ? { ...s, lab: { ...lab, madeUp: true } } : s;", "return lab.kind === \"solutions\" ? { ...s, lab: { ...lab, madeUp: true } } : s;", [...AUTH, ...UI]),
  M("G07-reset-clears-answers", PLUGIN, 'case "lab.reset": return { ...s, lab: emptyStateFor(c).lab };', 'case "lab.reset": return emptyStateFor(c);', [...AUTH, ...UI]),
  M("G08-check-extra-keys", PLUGIN, 'if (!exactKeys(raw, [...GENERIC, "taskId"])) return fail(', "if (false) return fail(", AUTH),
  M("G09-check-kind-mismatch", PLUGIN, "if (CHECK_FOR_TASK[t.kind] !== raw.kind) return fail(", "if (false) return fail(", AUTH),
  M("G10-choice-subset", PLUGIN, "const passed = correct.length > 0 && chosen.length === correct.length && chosen.every(o => correct.includes(o));", "const passed = correct.length > 0 && chosen.every(o => correct.includes(o));", AUTH),
  M("G11-no-unit-conversion", PLUGIN, "const answer = fromCanonical(toCanonical(v, unit), taskUnit);", "const answer = v;", AUTH),
  M("G12-record-unbounded", PLUGIN, "if (s.observations.length >= CHEM_LAB_LIMITS.observations) return s;", "if (false) return s;", [...AUTH, ...UI]),
  M("G13-action-limit", PLUGIN, "export const CHEM_LAB_MAX_ACTIONS = 500;", "export const CHEM_LAB_MAX_ACTIONS = 5000;", AUTH),
  M("G14-duplicate-measurements", PLUGIN, 'case "ph.measure": return withObservation(s, { kind: "meter", solution: a.solutionId }, true);', 'case "ph.measure": return withObservation(s, { kind: "meter", solution: a.solutionId }, false);', [...AUTH, ...UI]),
  // presentation invariants
  M("V01-arabic-decimal-separator", VIEW, '.replace(/[٫,]/g, ".")', '.replace(/[,]/g, ".")', UI),
  M("V02-readout-ungated", BENCH, '{cfg.view.readouts && view.state === "ready" && <p className="clab-readout"', '{view.state === "ready" && <p className="clab-readout"', UI),
  M("V03-answers-accumulate", WS, "const next = [...base.filter(x => !(isAnswer(x) && (x as Act).taskId === taskId)), ...(a ? [a] : [])];", "const next = [...base, ...(a ? [a] : [])];", UI),
  M("V04-reading-before-measuring", BENCH, "{cfg.view.readouts && (measured(s.id)", "{cfg.view.readouts && (true", UI),
  M("V05-no-ltr-isolate", VIEW, 'export const ltr = (s: string): string => "\\u2066" + s + "\\u2069";', "export const ltr = (s: string): string => s;", UI),
  M("V06-mirrored-time-cursor", BENCH, '<input type="range" dir="ltr"', '<input type="range"', UI),
  M("V07-no-op-recorded", WS, 'if (same(r.state, state)) { setAnnounce("لم يتغير شيء في التجربة."); return; }', "", UI)
];
// `--only=ID,ID` re-runs named mutants (a focused re-check after strengthening a test); the full campaign is the default and what CI runs
const only = process.argv.find(a => a.startsWith("--only="))?.slice("--only=".length).split(",").filter(Boolean) ?? null;
const unknown = (only ?? []).filter(id => !mutants.some(m => m.id === id));
if (unknown.length) { console.error("Unknown mutant ids:", unknown.join(", ")); process.exit(2); }
const selected = only ? mutants.filter(m => only.includes(m.id)) : mutants;
// `--check` only verifies that every needle occurs exactly once and differs from its replacement (no file is touched)
if (process.argv.includes("--check")) {
  const bad = mutants.filter(m => fs.readFileSync(m.file, "utf8").split(m.before).length - 1 !== 1 || m.before === m.after).map(m => m.id);
  console.log(bad.length ? "21DD3_MUTATION_NEEDLES_BAD " + bad.join(", ") : "21DD3_MUTATION_NEEDLES_OK " + mutants.length);
  process.exit(bad.length ? 1 : 0);
}
const sha = s => crypto.createHash("sha256").update(s).digest("hex"), files = [...new Set(mutants.map(m => m.file))];
const BACKUP = path.join(os.tmpdir(), "exambank-21dd3-mutation-backup.json");
if (fs.existsSync(BACKUP)) { const stale = JSON.parse(fs.readFileSync(BACKUP, "utf8")); for (const [file, contents] of Object.entries(stale)) fs.writeFileSync(file, contents, "utf8"); fs.rmSync(BACKUP, { force: true }); console.log("21DD3_MUTATION_RESTORED_STALE_BACKUP"); }
if (process.argv.includes("--restore")) process.exit(0);
const original = new Map(files.map(file => [file, fs.readFileSync(file, "utf8")]));
const restore = () => { for (const [file, contents] of original) fs.writeFileSync(file, contents, "utf8"); fs.rmSync(BACKUP, { force: true }); };
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { restore(); process.exit(130); });
const hashes = Object.fromEntries([...original].map(([file, value]) => [file, sha(value)]));
const dirty = spawnSync("git", ["status", "--porcelain", "--", ...files], { encoding: "utf8" });
if (dirty.status !== 0 || dirty.stdout.trim()) { console.error("Mutated sources must start clean.", dirty.stdout); process.exit(3); }
// the API lifecycle test grades through the COMPILED shared build: regenerate it for every mutant of a shared module, restore after
const SHARED = new Set([EX, PR, UN, SO, AB, TI, KI, MODEL, PLUGIN]);
const regen = () => spawnSync(process.execPath, ["scripts/build-shared-finalization.mjs"], { encoding: "utf8" });
const vitest = tests => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--reporter=dot", ...tests], { encoding: "utf8", timeout: 240000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, CI: "true" } });
const all = [...new Set(selected.flatMap(m => m.tests))], baseline = vitest(all);
if (baseline.status !== 0) { console.error("BASELINE RED", baseline.stdout.slice(-5000), baseline.stderr.slice(-3000)); process.exit(4); }
console.log("21DD3_MUTATION_BASELINE_GREEN", JSON.stringify({ tests: all, mutants: selected.length, selection: only ?? "all", files: hashes }));
const ledger = [];
fs.writeFileSync(BACKUP, JSON.stringify(Object.fromEntries(original)), "utf8");
try {
  for (const m of selected) {
    let outcome = "invalid", diagnostic = "";
    const source = original.get(m.file), occ = source.split(m.before).length - 1;
    if (occ !== 1) diagnostic = "needle count " + occ;
    else if (m.before === m.after) diagnostic = "mutation identical";
    else {
      try {
        fs.writeFileSync(m.file, source.replace(m.before, m.after), "utf8");
        if (SHARED.has(m.file)) regen();
        const r = vitest(m.tests), output = (r.stdout || "") + "\n" + (r.stderr || "");
        if (r.error?.code === "ETIMEDOUT" || r.signal) { outcome = "timeout"; diagnostic = String(r.error || r.signal); }
        else if (r.status === 0) { outcome = "survived"; diagnostic = "Selected tests passed"; }
        else if (/Transform failed|Failed to parse source|SyntaxError:|Unexpected token|Error during transform/.test(output)) { outcome = "invalid"; diagnostic = output.slice(-800); }
        else { outcome = "killed"; diagnostic = output.split("\n").filter(x => /FAIL |AssertionError|Test Files|Tests +/.test(x)).slice(0, 4).join(" ").slice(0, 700); }
      } finally { fs.writeFileSync(m.file, source, "utf8"); if (SHARED.has(m.file)) regen(); }
    }
    const record = { id: m.id, file: m.file, outcome, diagnostic };
    ledger.push(record); console.log("21DD3_MUTATION_RESULT", JSON.stringify(record));
  }
} finally { restore(); regen(); }
const verified = files.every(f => sha(fs.readFileSync(f, "utf8")) === hashes[f]), git = spawnSync("git", ["diff", "--exit-code", "--", ...files, "api/src/lib/shared-finalization"], { encoding: "utf8" });
const counts = Object.fromEntries(["killed", "survived", "invalid", "timeout"].map(s => [s, ledger.filter(r => r.outcome === s).length]));
const report = { baseline: "green", selection: only ?? "all", source_sha256: hashes, restored: verified && git.status === 0, counts, mutants: ledger };
const out = only ? "artifacts/phase-21dd3/mutation-ledger-only.json" : "artifacts/phase-21dd3/mutation-ledger.json";
fs.mkdirSync("artifacts/phase-21dd3", { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
console.log("21DD3_MUTATION_SUMMARY", JSON.stringify({ restored: report.restored, selection: only ?? "all", counts, report: out }));
if (!report.restored || counts.invalid || counts.timeout || counts.survived) process.exitCode = 1;
