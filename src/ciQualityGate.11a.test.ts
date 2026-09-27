/// <reference types="node" />
// Phase 11A — the CI quality gate is part of the product's safety net: the deploy job must depend on a gate that
// runs the full test suite, the production build (tsc + vite + bundle guard) and lint, in that order. Lint must stay
// able to fail the gate on ERROR-level findings (the React rules-of-hooks rule is kept at "error"), while the
// existing warning baseline does not block. This file reads the workflow and configs as text (no YAML dependency).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const WORKFLOW = read("../.github/workflows/azure-static-web-apps-white-grass-0ce642c10.yml");

/** The text of one top-level job block (from `  <name>:` to the next two-space job key). */
function jobBlock(name: string): string {
  const start = WORKFLOW.indexOf("\n  " + name + ":\n");
  expect(start, `job ${name}`).toBeGreaterThanOrEqual(0);
  const rest = WORKFLOW.slice(start + 1);
  const next = rest.slice(3).search(/\n  [a-z_]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 3);
}

describe("CI quality gate (Phase 11A)", () => {
  it("the gate runs tests, then the build, then lint — each as its own step", () => {
    const gate = jobBlock("quality_gate");
    const test = gate.indexOf("run: npm test"), build = gate.indexOf("run: npm run build"), lint = gate.indexOf("run: npm run lint");
    expect(test).toBeGreaterThan(0);
    expect(build).toBeGreaterThan(test);
    expect(lint).toBeGreaterThan(build);
    expect(gate).not.toMatch(/npm run lint\s*\|\|\s*true|continue-on-error:\s*true/);   // lint can actually fail the gate
  });
  it("deployment still depends on the gate", () => {
    expect(jobBlock("build_and_deploy_job")).toMatch(/needs:\s*quality_gate/);
  });
  it("the build script keeps typecheck + bundle guard; lint is oxlint with rules-of-hooks at error", () => {
    const pkg = JSON.parse(read("../package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts.build).toBe("tsc -b && vite build && npm run check:bundle");
    expect(pkg.scripts.lint).toBe("oxlint");
    const oxlint = JSON.parse(read("../.oxlintrc.json")) as { rules: Record<string, unknown> };
    expect(oxlint.rules["react/rules-of-hooks"]).toBe("error");
  });
});
