// UX-R19a — the capture harness's determinism and its interactive-state scenes (docs/enterprise-ux-r0-redesign-foundation.md R19a).
// These guards pin: the scene fixtures are the product's own presets (the function-study widget draws the rational certification
// preset of functionStudyTemplates); every page runs on a frozen clock; no scripted scene picks a row by its position (the only
// positional pick left is the exam navigator's question index, whose order the exam fixes); the mock API keeps request bodies (the
// governance scene answers by action); and every state the plan lists has its scene.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { rationalCertificationConfig } from "../src/functionStudy/functionStudyTemplates";

const read = (...p) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const harness = read("scripts", "capture-visual-baseline-ux-r.mjs");
const fixtures = JSON.parse(read("scripts", "ux-r19a-scene-fixtures.json"));

describe("UX-R19a — the scene fixtures", () => {
  it("the function-study scene draws the rational certification preset, exactly", () => {
    expect(fixtures.functionStudy).toEqual(rationalCertificationConfig());
  });

  it("the governance scene reads an exam in review with an assigned workflow, every role filled", () => {
    const wf = fixtures.governance.workflow;
    expect(wf.reviewStatus).toBe("pending");
    for (const role of ["authorId", "reviewerId", "approverId", "publisherId"]) expect(fixtures.governance.directory.map(a => a.actorId)).toContain(wf[role]);
  });
});

describe("UX-R19a — determinism", () => {
  it("every page runs on a frozen clock, at the fixtures' NOW", () => {
    expect(harness).toContain("await ctx.clock.setFixedTime(new Date(NOW));");
    expect(harness).toMatch(/const NOW = "2026-10-20T08:30:00\.000Z";/);
  });

  it("no scripted scene picks a row by position (only the exam navigator's question index)", () => {
    const picks = [...harness.matchAll(/(\S+)\.nth\(/g)].map(m => m[1]);
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) expect(p, p).toMatch(/\.iex-nav-q"\)$/);
    expect(harness).toContain('getByRole("button", { name: /أحمد الحسن/ })');
  });

  it("the mock API keeps each request's body", () => {
    expect(harness).toContain('req.on("end", () => { req.body = body; api(req, res); });');
    expect(harness).not.toContain("req.resume();");
  });
});

describe("UX-R19a — the interactive-state scenes", () => {
  it("every state the plan lists has its scene", () => {
    for (const id of ["sim-functionStudy", "state-focus-field", "state-focus-row-action", "state-focus-nav", "state-focus-primary", "state-hover-row", "state-menu-open",
      "state-studio-title-focus", "state-question-types", "state-classic-builder", "state-governance", "state-ai-composer"]) expect(harness, id).toContain('"' + id + '"');
  });

  it("a focus scene presses Tab before it focuses, so :focus-visible applies", () => {
    const focusScenes = harness.slice(harness.indexOf('["state-focus-field"'), harness.indexOf('{ id: "state-hover-row"'));
    expect(focusScenes).toContain('await page.keyboard.press("Tab");');
  });
});
