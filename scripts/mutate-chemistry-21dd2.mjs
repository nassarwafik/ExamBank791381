#!/usr/bin/env node
// Phase 21D-D.2 focused mutation certification: atom and charge conservation, the exact solver and its canonicalization, coefficient
// normalization, the strict reaction / config authority, replay normalization, server-side grading (derived answers, completeness, exact sets,
// given coefficients), hidden-answer protection, the curated catalog's derived roles and contested families, and the presentation invariants.
// AGENTS.md §9: every mutant is planted alone, the selected tests run, a mutant is KILLED only when a test fails because of it; a timeout is
// reported as such; every file is restored byte-for-byte (sha256-verified) even on interruption, and `git diff --exit-code` must be clean afterwards.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";
const RX = "src/chemistry/reactions.ts", CAT = "src/chemistry/reactionCatalog.ts", MODEL = "src/chemistryReactionsModel.ts", PLUGIN = "src/chemistryReactionsPlugin.ts";
const WS = "src/chemistryReactions/RxnWorkspace.tsx", VIEW = "src/chemistryReactions/rxnView.ts";
const CORE = ["src/chemistry/reactions.21dd2.test.ts", "src/chemistry/reactionCatalog.21dd2.test.ts"];
const AUTH = ["src/chemistryReactions.21dd2.test.ts", "api/tests/certification-21dd2/cert-21dd2-reactions-lifecycle.test.js"];
const UI = ["src/chemistryReactions/reactionsUi.21dd2.test.tsx"];
const M = (id, file, before, after, tests) => ({ id, file, before, after, tests });
const mutants = [
  // atom and charge conservation, the exact solver
  M("R01-product-sign", RX, "const sign = (i: number) => (i < n ? 1n : -1n);", "const sign = (i: number) => (i < n ? 1n : 1n);", CORE),
  M("R02-row-balanced", RX, "delta: Number(a - b), balanced: a === b, complete: !unset.has(element) }));", "delta: Number(a - b), balanced: true, complete: !unset.has(element) }));", CORE),
  M("R03-incomplete-counts", RX, "    if (!integer(c, 1, REACTION_LIMITS.coefficientMax)) {\n      complete = false;\n", "    if (!integer(c, 1, REACTION_LIMITS.coefficientMax)) {\n", [...CORE, ...AUTH]),
  M("R18-row-completeness", RX, "balanced: a === b, complete: !unset.has(element) }));", "balanced: a === b, complete: true }));", [...CORE, ...UI]),
  M("R04-charge-ignored-in-table", RX, "(chargeRow?.balanced ?? true) };", "true };", [...CORE, ...AUTH]),
  M("R05-no-charge-row", RX, "  if (withCharge) rows.push(", "  if (false) rows.push(", CORE),
  M("R06-solver-without-charge", RX, "const full = solve(charged);", "const full = solve(false);", CORE),
  M("R07-positivity", RX, "if (!v.every(x => x > 0n)) return", "if (false) return", CORE),
  M("R08-gcd-reduction", RX, "    let v = primitive(x);", "    let v = x;", CORE),
  M("R09-sign-normalization", RX, "    if (lead < 0n) v = v.map(e => -e);\n", "", CORE),
  M("R10-one-sided-element", RX, "if (oneSided.length) return", "if (false) return", CORE),
  M("R11-non-unique-picked", RX, "if (basis.length > 1) return", "if (false) return", CORE),
  M("R12-coefficient-bound", RX, "if (v.some(x => x > BigInt(REACTION_LIMITS.coefficientMax))) return", "if (false) return", CORE),
  M("R13-repeated-species", RX, "if ([...sides[0], ...sides[1]].some(t => t.charge === term.charge && sameComposition(t.composition, term.composition))) {", "if (false) {", CORE),
  M("R14-canonical-formula", RX, "if (!parsed.ok || parsed.text !== raw.formula) {", "if (!parsed.ok) {", CORE),
  M("R15-charge-range", RX, "!integer(raw.charge, -REACTION_LIMITS.chargeAbsMax, REACTION_LIMITS.chargeAbsMax) ||", "!integer(raw.charge, -99, 99) ||", CORE),
  M("R16-coefficient-ignored", RX, "atoms.set(symbol, (atoms.get(symbol) ?? 0n) + BigInt(count) * factor);", "atoms.set(symbol, (atoms.get(symbol) ?? 0n) + BigInt(count));", CORE),
  M("R17-charge-diagnosis", RX, "if (!full.ok && charged && full.code !== \"REACTION_NOT_UNIQUE\" && solve(false).ok) return", "if (false) return", CORE),
  // the curated catalog and its derived facts
  M("C01-water-coefficients", CAT, 'reactants: [H2, O2], products: [H2O_L], coefficients: [2, 1, 2]', 'reactants: [H2, O2], products: [H2O_L], coefficients: [2, 1, 1]', CORE),
  M("C02-oxidized-direction", CAT, "      if (s > 0) up = true;", "      if (s < 0) up = true;", CORE),
  M("C03-iron-combustion-contested", CAT, 'families: ["synthesis", "redox"], contested: ["combustion"], sources: ["LT75"],\n    notes: ["نموذج مبسّط', 'families: ["synthesis", "redox"], contested: [], sources: ["LT75"],\n    notes: ["نموذج مبسّط', [...CORE, ...AUTH]),
  M("C04-methane-oxidation-number", CAT, '[["CH4", 0, "g", "الميثان", "molecule", { C: -4, H: 1 }]', '[["CH4", 0, "g", "الميثان", "molecule", { C: -3, H: 1 }]', CORE),
  M("C05-precipitate-role", CAT, 'families: ["precipitation", "doubleDisplacement"], roles: { precipitate: ["p1"] }', 'families: ["precipitation", "doubleDisplacement"], roles: { precipitate: ["p2"] }', [...CORE, ...AUTH]),
  M("C06-element-definition", CAT, 'return elements === 1 ? "element" : "compound";', 'return elements >= 1 ? "element" : "compound";', CORE),
  M("C07-contested-status", CAT, '(c.families.includes(f) ? "yes" : c.contested.includes(f) ? "contested" : "no")', '(c.families.includes(f) ? "yes" : "no")', [...CORE, ...AUTH]),
  // the strict config authority
  M("S01-config-unknown-key", MODEL, 'if (!["v", "reaction", "view", "tasks"].includes(k)) add(', 'if (false) add(', AUTH),
  M("S02-unbalanceable-accepted", MODEL, 'if (!b.ok) return bad("RXN_REACTION_UNBALANCEABLE"', 'if (false) return bad("RXN_REACTION_UNBALANCEABLE"', AUTH),
  M("S03-names-on-typed-equation", MODEL, "if (raw.names && !ctx.catalog) {", "if (false) {", AUTH),
  M("S04-every-coefficient-locked", MODEL, "} else if (b.locked.length >= ctx.termIds.length) {", "} else if (false) {", AUTH),
  M("S05-contested-offered", MODEL, 'if (contested.length) { fail("RXN_CLASSIFICATION_CONTESTED"', 'if (false) { fail("RXN_CLASSIFICATION_CONTESTED"', AUTH),
  M("S06-single-ambiguous", MODEL, 'if (t.mode === "single" && yes.length !== 1)', 'if (t.mode === "single" && yes.length < 1)', AUTH),
  M("S07-catalog-only-role", MODEL, "  if (CATALOG_ONLY_ROLES.includes(role)) return null;\n", "", AUTH),
  M("S08-empty-role", MODEL, 'if (expected.length === 0) { fail("RXN_SELECTION_EMPTY"', 'if (false) { fail("RXN_SELECTION_EMPTY"', AUTH),
  M("S09-task-id-collision", MODEL, 'if (ctx.termIds.includes(id)) { fail("RXN_TASK_ID_COLLISION"', 'if (false) { fail("RXN_TASK_ID_COLLISION"', AUTH),
  M("S10-classification-guessed", MODEL, 'if (!ctx.catalog) { fail("RXN_CLASSIFICATION_UNSUPPORTED"', 'if (false) { fail("RXN_CLASSIFICATION_UNSUPPORTED"', AUTH),
  // replay normalization
  M("A01-zero-coefficient", PLUGIN, "!isInt(raw.value, 1, REACTION_LIMITS.coefficientMax)) return INVALID;", "!isInt(raw.value, 0, REACTION_LIMITS.coefficientMax)) return INVALID;", AUTH),
  M("A02-locked-writable", PLUGIN, "!!t.balance && !t.balance.locked.includes(id);", "!!t.balance;", AUTH),
  M("A03-coefficient-exact-keys", PLUGIN, 'if (!exactKeys(raw, ["type", "termId", "value"]) || !open(raw.termId)', 'if (!open(raw.termId)', AUTH),
  M("A04-unoffered-family", PLUGIN, "!raw.families.every(f => typeof f === \"string\" && (task.options as string[]).includes(f))", "!raw.families.every(f => typeof f === \"string\")", AUTH),
  M("A05-single-choice-count", PLUGIN, ' || (task.mode === "single" && raw.families.length !== 1)) return INVALID;', ") return INVALID;", AUTH),
  M("A06-unknown-term-selected", PLUGIN, '|| typeof raw.termId !== "string" || !ctx.termIds.includes(raw.termId)) return INVALID;', '|| typeof raw.termId !== "string") return INVALID;', AUTH),
  M("A07-reset-noop", PLUGIN, 'case "equation.reset": next.coefficients.clear(); break;', 'case "equation.reset": break;', AUTH),
  M("A08-selection-click-order", PLUGIN, "if (s?.length) selections[t.id] = ids.filter(id => s.includes(id));", "if (s?.length) selections[t.id] = [...s];", AUTH),
  // grading
  M("G01-complete-required", RX, "return { rows, charge: chargeRow, complete, balanced: complete && rows.every(", "return { rows, charge: chargeRow, complete, balanced: rows.every(", [...CORE, ...AUTH]),
  M("G02-lowest-exact", PLUGIN, "passed: table.complete && coeffs.every((x, i) => x === ctx.lowest[i]) };", "passed: table.balanced };", AUTH),
  M("G03-element-complete", PLUGIN, 'passed: table.complete && !!row?.balanced };', "passed: !!row?.balanced };", AUTH),
  M("G04-charge-complete", PLUGIN, "passed: table.complete && !!table.charge?.balanced };", "passed: !!table.charge?.balanced };", AUTH),
  M("G05-coefficient-exact", PLUGIN, "passed: got === ctx.lowest[i] };", "passed: got !== null };", AUTH),
  M("G06-classification-exact-set", PLUGIN, "passed: !!want && want.length > 0 && Array.isArray(got) && sameList(got, want) };", "passed: !!want && Array.isArray(got) && got.some(f => want.includes(f)) };", AUTH),
  M("G07-selection-exact-set", PLUGIN, "passed: !!want && want.length > 0 && sameList(got, want) };", "passed: !!want && got.every(id => want.includes(id)) };", AUTH),
  M("G08-given-coefficients", PLUGIN, "locked.includes(id) ? ctx.lowest[i] :", "locked.includes(id) ? null :", AUTH),
  M("G09-expected-value-smuggled", PLUGIN, '      if (!exactKeys(raw, GENERIC)) return fail("معاملات الفحص غير مطابقة لنوعه.");\n      return needBalance() ?? { ok: true, check: base };', '      return needBalance() ?? { ok: true, check: base };', AUTH),
  M("G10-charge-on-neutral", PLUGIN, 'if (!hasChargedTerm(ctx.reaction)) return fail(', 'if (false) return fail(', AUTH),
  // hidden-answer protection
  M("H01-answer-in-public-config", MODEL, "return { ok: true, reaction: r, catalog: c, ref: { catalog: c.id } };", "return { ok: true, reaction: r, catalog: c, ref: { catalog: c.id, lowest: [...c.coefficients] } as never };", AUTH),
  // presentation invariants
  M("U01-clear-is-an-action", WS, 'decide("coef:" + id, v === null ? null :', 'decide("coef:" + id, v === null ? { type: "coefficient.clear", termId: id } :', UI),
  M("U02-radio-group-name", WS, 'name={uid + "-" + t.id}', 'name={"rxn-" + t.id}', UI),
  M("U03-family-click-order", WS, "families: REACTION_FAMILIES.filter(f => families.includes(f)) }", "families }", UI),
  M("U04-aqueous-drawn-as-molecule", VIEW, 'return t.charge === 0 && t.state !== "aq" ? BY_FORMULA.get(t.formula) : undefined;', "return t.charge === 0 ? BY_FORMULA.get(t.formula) : undefined;", UI),
  M("U05-copies-cap", VIEW, "const drawn = Math.min(coefficient, PARTICLE_COPIES_MAX);", "const drawn = coefficient;", UI)
];
const sha = s => crypto.createHash("sha256").update(s).digest("hex"), files = [...new Set(mutants.map(m => m.file))];
const BACKUP = path.join(os.tmpdir(), "exambank-21dd2-mutation-backup.json");
if (fs.existsSync(BACKUP)) { const stale = JSON.parse(fs.readFileSync(BACKUP, "utf8")); for (const [file, contents] of Object.entries(stale)) fs.writeFileSync(file, contents, "utf8"); fs.rmSync(BACKUP, { force: true }); console.log("21DD2_MUTATION_RESTORED_STALE_BACKUP"); }
if (process.argv.includes("--restore")) process.exit(0);
const original = new Map(files.map(file => [file, fs.readFileSync(file, "utf8")]));
const restore = () => { for (const [file, contents] of original) fs.writeFileSync(file, contents, "utf8"); fs.rmSync(BACKUP, { force: true }); };
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { restore(); process.exit(130); });
const hashes = Object.fromEntries([...original].map(([file, value]) => [file, sha(value)]));
const dirty = spawnSync("git", ["status", "--porcelain", "--", ...files], { encoding: "utf8" });
if (dirty.status !== 0 || dirty.stdout.trim()) { console.error("Mutated sources must start clean.", dirty.stdout); process.exit(3); }
// the API lifecycle test grades through the COMPILED shared build: regenerate it for every mutant of a shared module, restore after
const SHARED = new Set([RX, CAT, MODEL, PLUGIN]);
const regen = () => spawnSync(process.execPath, ["scripts/build-shared-finalization.mjs"], { encoding: "utf8" });
const vitest = tests => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--reporter=dot", ...tests], { encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, CI: "true" } });
const all = [...new Set(mutants.flatMap(m => m.tests))], baseline = vitest(all);
if (baseline.status !== 0) { console.error("BASELINE RED", baseline.stdout.slice(-5000), baseline.stderr.slice(-3000)); process.exit(4); }
console.log("21DD2_MUTATION_BASELINE_GREEN", JSON.stringify({ tests: all, mutants: mutants.length, files: hashes }));
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
    ledger.push(record); console.log("21DD2_MUTATION_RESULT", JSON.stringify(record));
  }
} finally { restore(); regen(); }
const verified = files.every(f => sha(fs.readFileSync(f, "utf8")) === hashes[f]), git = spawnSync("git", ["diff", "--exit-code", "--", ...files, "api/src/lib/shared-finalization"], { encoding: "utf8" });
const counts = Object.fromEntries(["killed", "survived", "invalid", "timeout"].map(s => [s, ledger.filter(r => r.outcome === s).length]));
const report = { baseline: "green", source_sha256: hashes, restored: verified && git.status === 0, counts, mutants: ledger };
fs.mkdirSync("artifacts/phase-21dd2", { recursive: true });
fs.writeFileSync("artifacts/phase-21dd2/mutation-ledger.json", JSON.stringify(report, null, 2) + "\n");
console.log("21DD2_MUTATION_SUMMARY", JSON.stringify({ restored: report.restored, counts, report: "artifacts/phase-21dd2/mutation-ledger.json" }));
if (!report.restored || counts.invalid || counts.timeout || counts.survived) process.exitCode = 1;
