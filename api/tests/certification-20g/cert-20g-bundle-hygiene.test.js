import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INITIAL_JS_GZIP_BUDGET_KB } from "../../../scripts/check-bundle-budget.mjs";

// Phase 20G — BUNDLE hygiene (§17). The certification harness, fixtures and scripted-model helpers are TEST code: no production module may
// import them (so they can never reach any bundle), the heavy surfaces stay behind lazy edges (the bundle guard proves it on every build:
// AI composer, Monaco, SmartSim runtime, composite, presentation — measured 124.1 KB baseline → 124.2 KB head gzip initial graph), and the
// initial-graph budget is NOT raised by this phase (125 KB, unchanged since Phase 8E-5).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

describe("20G bundle hygiene", () => {
  it("the initial JS gzip budget is unchanged (125 KB)", () => { expect(INITIAL_JS_GZIP_BUDGET_KB).toBe(125); });
  it("no production module (src/** non-test, api/src/**) imports the certification harness, fixtures or the scripted-model test helpers", () => {
    const prod = [...walk(path.join(repo, "src")), ...walk(path.join(repo, "api/src"))].filter(f => /\.(t|j)sx?$/.test(f) && !/\.test\.|[\\/]testing[\\/]/.test(f));
    const imports = f => fs.readFileSync(f, "utf8").split("\n").filter(l => /^\s*(import\b|export\b[^;]*\bfrom\b|.*\brequire\(|.*\bimport\()/.test(l));
    const offenders = prod.filter(f => imports(f).some(l => /certification-20g|certification20g|aiComposer\/testing|api\/tests\/|\/testing\/composer/.test(l)));
    expect(offenders.map(f => path.relative(repo, f))).toEqual([]);
  });
  it("the AI composer dialog is reached ONLY through a lazy edge (the bundle guard checks every built chunk; this pins the source edge)", () => {
    const prod = walk(path.join(repo, "src")).filter(f => /\.(t|j)sx?$/.test(f) && !/\.test\./.test(f) && !f.endsWith("AiExamComposerDialog.tsx"));
    const users = prod.filter(f => fs.readFileSync(f, "utf8").includes("AiExamComposerDialog"));
    expect(users.length).toBeGreaterThan(0);
    for (const f of users) expect(fs.readFileSync(f, "utf8"), path.relative(repo, f)).not.toMatch(/^import [^;]*from "[^"]*AiExamComposerDialog"/m);
  });
});
