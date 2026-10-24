// Phase G-CI — the project tracker's real-browser checks run in CI (`.github/workflows/projects-browser-g.yml`). This guard
// keeps that true: every `scripts/check-project-*-browser-*.mjs` has its own step in the workflow, no step is softened
// (`continue-on-error`), every step after the build runs even when an earlier one failed (so a red step never hides another),
// and the path filter covers the checks themselves and the workflow. A new project browser check that is not wired into the
// workflow fails this test.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const workflow = readFileSync(root + ".github/workflows/projects-browser-g.yml", "utf8");
const checks = readdirSync(root + "scripts").filter(f => /^check-project-.+-browser-.+\.mjs$/.test(f)).sort();
const steps = workflow.split(/\n(?=      - )/).filter(s => /run: node scripts\/check-project-/.test(s));

describe("the project browser checks run in CI", () => {
  it("there is at least one project browser check, and every one has its own step", () => {
    expect(checks.length).toBeGreaterThanOrEqual(8);
    const run = steps.map(s => (s.match(/run: node scripts\/(check-project-[^\s]+\.mjs)/) || [])[1]).sort();
    expect(run).toEqual(checks);
  });
  it("no step is softened, each runs after an earlier failure, and each writes to its own output folder", () => {
    expect(workflow).not.toMatch(/continue-on-error/);
    for (const s of steps) expect(s, s).toContain("if: ${{ !cancelled() }}");
    const outs = steps.map(s => (s.match(/HARNESS_OUT: (\.harness-projects\/[a-z0-9]+)/) || [])[1]);
    expect(outs.every(Boolean)).toBe(true);
    expect(new Set(outs).size).toBe(outs.length);
  });
  it("it runs on pull requests that touch the checks, the project code or the workflow itself", () => {
    expect(workflow).toMatch(/on:\n  pull_request:/);
    for (const p of ['"scripts/check-project-*-browser-*.mjs"', '"src/projects/**"', '"api/src/functions/project-tracker.js"', '"api/src/lib/project-tracker/**"', '"browser-harness/learning-l8-api.cjs"', '".github/workflows/projects-browser-g.yml"']) expect(workflow, p).toContain(p);
  });
});
