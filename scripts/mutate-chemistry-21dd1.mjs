#!/usr/bin/env node
// Phase 21D-D.1 focused mutation certification: chemistry science (catalog, electron model, formula engine, molecule data), the
// chemistryStructure@1 authority (strict config, action normalization, selection bound), grading (derived checks, private species,
// generic-rule view) and the presentation invariants found by the Chromium certification. AGENTS.md §9: every mutant is planted alone,
// the selected tests run, a mutant is KILLED only when a test fails because of it; a timeout is reported as such; every file is restored
// byte-for-byte (sha256-verified) even on interruption, and `git diff --exit-code` must be clean afterwards.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";
const EL = "src/chemistry/elements.ts", EC = "src/chemistry/electrons.ts", FO = "src/chemistry/formula.ts", MO = "src/chemistry/molecules.ts";
const MODEL = "src/chemistryStructureModel.ts", PLUGIN = "src/chemistryStructurePlugin.ts", VIEW = "src/chemistryStructure/chemView.ts", WS = "src/chemistryStructure/ChemWorkspace.tsx";
const CORE = ["src/chemistry/chemistryCore.21dd1.test.ts"];
const AUTH = ["src/chemistryStructure.21dd1.test.ts", "api/tests/certification-21dd1/cert-21dd1-chemistry-lifecycle.test.js"];
const UI = ["src/chemistryStructure/chemistryUi.21dd1.test.tsx", "src/chemistryStructure/chemView.21dd1.test.ts"];
const M = (id, file, before, after, tests) => ({ id, file, before, after, tests });
const mutants = [
  // science — the verified data and the models built on it
  M("E01-oxygen-weight", EL, '[8, "O", "أكسجين", "Oxygen", "15.999"', '[8, "O", "أكسجين", "Oxygen", "15.990"', CORE),
  M("E02-chlorine-isotopes", EL, '"halogen", [35, 37], [-1]]', '"halogen", [35, 36, 37], [-1]]', CORE),
  M("E03-sodium-group", EL, '"Sodium", "22.990", 1, 3', '"Sodium", "22.990", 2, 3', CORE),
  M("E04-chromium-exception", EC, '  24: Object.freeze({ "4s": 1, "3d": 5 }),\n', '', CORE),
  M("E05-copper-exception", EC, '  29: Object.freeze({ "4s": 1, "3d": 10 })\n', '', CORE),
  M("E06-cation-removal-order", EC, 'sort((a, b) => b.n - a.n || b.l - a.l)', 'sort((a, b) => b.l - a.l || b.n - a.n)', CORE),
  M("E07-anion-fill", EC, 'if (charge < 0) return toList(madelungFill(-charge, occ));', 'if (charge < 0) return base;', CORE),
  M("E08-valence-d-block", EC, 'if (blockOf(e) === "d") return null;', 'if (false) return null;', CORE),
  M("F01-unknown-symbol", FO, 'if (!e) return fail("FORMULA_ELEMENT_UNKNOWN"', 'if (false && !e) return fail("FORMULA_ELEMENT_UNKNOWN"', CORE),
  M("F02-leading-zero", FO, 'if (peek() === "0") return fail(', 'if (false) return fail(', CORE),
  M("F03-depth-bound", FO, 'if (depth >= FORMULA_LIMITS.depth)', 'if (depth >= 99)', CORE),
  M("F04-hydrate-multiplier", FO, 'merge(all, part, times);', 'merge(all, part, 1);', CORE),
  M("F05-empirical-gcd", FO, 'for (const k of Object.keys(c).sort()) out[k] = c[k] / g;', 'for (const k of Object.keys(c).sort()) out[k] = c[k];', CORE),
  M("F06-hill-carbon-first", FO, 'if (!keys.includes("C")) return keys;', 'return keys;', CORE),
  M("F07-composition-subset", FO, 'return ka.length === kb.length && ka.every', 'return ka.every', CORE),
  M("M01-water-shape", MO, 'casNumber: "7732-18-5", central: ["O1"], shape: "bent"', 'casNumber: "7732-18-5", central: ["O1"], shape: "linear"', CORE),
  M("M02-ammonia-lone-pair", MO, '["N1", "N", v(0, 0, 0), 1]', '["N1", "N", v(0, 0, 0), 0]', CORE),
  M("M03-methane-angle", MO, '["aHCH", "angle", ["H1", "C1", "H2"], 109.471]', '["aHCH", "angle", ["H1", "C1", "H2"], 109.5]', CORE),
  // authority — strict config and semantic actions
  M("S01-config-unknown-key", MODEL, 'if (!["v", "activity", "subject", "view", "tasks"].includes(k)) add(', 'if (false) add(', AUTH),
  M("S02-subject-species", MODEL, '    const problem = speciesProblem(raw);\n    if (problem) {', '    const problem = speciesProblem(raw);\n    if (false && problem) {', AUTH),
  M("S03-formula-canonical", MODEL, 'if (parsed.text !== raw.formula) {', 'if (false) {', AUTH),
  M("S04-measure-on-atom", MODEL, 'if (raw.measure && activity !== "molecule")', 'if (false)', AUTH),
  M("A01-particle-bounds", PLUGIN, 'isInt(raw.protons, 0, L.protonsMax)', 'isInt(raw.protons, 0, 1e9)', AUTH),
  M("A02-particle-exact-keys", PLUGIN, 'if (!t.build || !exactKeys(raw, ["type", "protons", "neutrons", "electrons"])', 'if (!t.build', AUTH),
  M("A03-build-task-required", PLUGIN, 'if (!t.build || !exactKeys(raw, ["type", "protons"', 'if (!exactKeys(raw, ["type", "protons"', AUTH),
  M("A04-value-declared", PLUGIN, '!declared(t.values.map(v => v.id), raw.valueId) || typeof raw.value', 'typeof raw.value', AUTH),
  M("A05-formula-parsed", PLUGIN, 'return p.ok ? { ok: true, action: { type: "formula.set", formulaId: raw.formulaId, text: p.text } } : INVALID;', 'return { ok: true, action: { type: "formula.set", formulaId: raw.formulaId, text: raw.text } };', AUTH),
  M("A06-classification-option", PLUGIN, '|| !CHEM_PROPERTY_OPTIONS[task.property].includes(raw.option)) return INVALID;', ') return INVALID;', AUTH),
  M("A07-selection-max", PLUGIN, 'if (on.size > max) return "CHEM_SELECTION_TOO_MANY";', '', AUTH),
  M("A08-selection-declared", PLUGIN, 'if (!exactKeys(raw, ["type", "objectId"]) || !declared(chemSelectableIds(c), raw.objectId)) return INVALID;', 'if (!exactKeys(raw, ["type", "objectId"])) return INVALID;', AUTH),
  // grading — derived references, private species, rule view
  M("G01-particles-every", PLUGIN, 'passed: keys.every(k => got[k] === want[k])', 'passed: keys.some(k => got[k] === want[k])', AUTH),
  M("G02-shells-length", PLUGIN, 'passed: g.length === want.length && g.every', 'passed: g.every', AUTH),
  M("G03-value-tolerance", PLUGIN, 'e !== null && Math.abs(got - e) <= tol;', 'e !== null && Math.abs(got - e) <= tol + 1;', AUTH),
  M("G04-formula-composition", PLUGIN, 'passed: p.ok && sameComposition(p.composition, want)', 'passed: p.ok', AUTH),
  M("G05-empirical-target", PLUGIN, 'return check.target === "empirical" ? empiricalComposition(base) : base;', 'return base;', AUTH),
  M("G06-classification-equal", PLUGIN, 'passed: want !== null && got === want', 'passed: got !== undefined', AUTH),
  M("G07-ion-valence", PLUGIN, 'case "valenceElectrons": return s.charge === 0 ? valenceElectrons(e) : null;', 'case "valenceElectrons": return valenceElectrons(e);', AUTH),
  M("G08-private-species", PLUGIN, 'const checkSpecies = (check: ChemCheck, c: ChemConfigV1): ChemSpecies | null => (check.species as ChemSpecies | undefined) ?? subjectSpecies(c);', 'const checkSpecies = (check: ChemCheck, c: ChemConfigV1): ChemSpecies | null => subjectSpecies(c);', AUTH),
  M("G09-rule-view-ids", PLUGIN, 'ids: [...chemSelectableIds(c), ...c.tasks.values.map(v => v.id)]', 'ids: [...c.tasks.values.map(v => v.id)]', AUTH),
  // presentation invariants (Chromium findings)
  M("U01-bond-hidden-end-on", VIEW, '    if (l <= ra + rb) continue;\n', '', UI),
  M("U02-bond-trim", VIEW, 'x1: p.x + ux * ra, y1: p.y + uy * ra, x2: q.x - ux * rb, y2: q.y - uy * rb', 'x1: p.x, y1: p.y, x2: q.x, y2: q.y', UI),
  M("U03-radio-group-name", WS, 'name={uid + "-" + t.id}', 'name={"chem-" + t.id}', UI),
  M("U04-lone-pair-angle", VIEW, 'const half = steric === 3 ? Math.PI / 3 : Math.acos(-1 / 3) / 2', 'const half = Math.PI / 3', UI)
];
const sha = s => crypto.createHash("sha256").update(s).digest("hex"), files = [...new Set(mutants.map(m => m.file))];
const BACKUP = path.join(os.tmpdir(), "exambank-21dd1-mutation-backup.json");
if (fs.existsSync(BACKUP)) { const stale = JSON.parse(fs.readFileSync(BACKUP, "utf8")); for (const [file, contents] of Object.entries(stale)) fs.writeFileSync(file, contents, "utf8"); fs.rmSync(BACKUP, { force: true }); console.log("21DD1_MUTATION_RESTORED_STALE_BACKUP"); }
if (process.argv.includes("--restore")) process.exit(0);
const original = new Map(files.map(file => [file, fs.readFileSync(file, "utf8")]));
const restore = () => { for (const [file, contents] of original) fs.writeFileSync(file, contents, "utf8"); fs.rmSync(BACKUP, { force: true }); };
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { restore(); process.exit(130); });
const hashes = Object.fromEntries([...original].map(([file, value]) => [file, sha(value)]));
const dirty = spawnSync("git", ["status", "--porcelain", "--", ...files], { encoding: "utf8" });
if (dirty.status !== 0 || dirty.stdout.trim()) { console.error("Mutated sources must start clean.", dirty.stdout); process.exit(3); }
// the API lifecycle test grades through the COMPILED shared build: regenerate it for every mutant of a shared module, restore after
const SHARED = new Set([EL, EC, FO, MO, MODEL, PLUGIN]);
const regen = () => spawnSync(process.execPath, ["scripts/build-shared-finalization.mjs"], { encoding: "utf8" });
const vitest = tests => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--reporter=dot", ...tests], { encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, CI: "true" } });
const all = [...new Set(mutants.flatMap(m => m.tests))], baseline = vitest(all);
if (baseline.status !== 0) { console.error("BASELINE RED", baseline.stdout.slice(-5000), baseline.stderr.slice(-3000)); process.exit(4); }
console.log("21DD1_MUTATION_BASELINE_GREEN", JSON.stringify({ tests: all, mutants: mutants.length, files: hashes }));
const ledger = [];
fs.writeFileSync(BACKUP, JSON.stringify(Object.fromEntries(original)), "utf8");
try {
  for (const m of mutants) {
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
    ledger.push(record); console.log("21DD1_MUTATION_RESULT", JSON.stringify(record));
  }
} finally { restore(); regen(); }
const verified = files.every(f => sha(fs.readFileSync(f, "utf8")) === hashes[f]), git = spawnSync("git", ["diff", "--exit-code", "--", ...files, "api/src/lib/shared-finalization"], { encoding: "utf8" });
const counts = Object.fromEntries(["killed", "survived", "invalid", "timeout"].map(s => [s, ledger.filter(r => r.outcome === s).length]));
const report = { baseline: "green", source_sha256: hashes, restored: verified && git.status === 0, counts, mutants: ledger };
fs.mkdirSync("artifacts/phase-21dd1", { recursive: true });
fs.writeFileSync("artifacts/phase-21dd1/mutation-ledger.json", JSON.stringify(report, null, 2) + "\n");
console.log("21DD1_MUTATION_SUMMARY", JSON.stringify({ restored: report.restored, counts, report: "artifacts/phase-21dd1/mutation-ledger.json" }));
if (!report.restored || counts.invalid || counts.timeout || counts.survived) process.exitCode = 1;
