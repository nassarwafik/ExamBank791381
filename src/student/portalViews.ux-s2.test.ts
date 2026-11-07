import { describe, it, expect } from "vitest";
import { STUDENT_VIEWS, viewFromHash, viewHash, viewHeading, isStudentViewHash } from "./portalViews";

// UX-S2 (approved design docs/enterprise-ux-student-s2.md §2.1, §2.3) — the five views and their links. Pure functions.
describe("UX-S2 — the student's view links", () => {
  it("five views in reading order, each with its link and the heading that receives focus", () => {
    expect(STUDENT_VIEWS.map(v => [v.key, v.label, viewHash(v.key), v.heading])).toEqual([
      ["today", "اليوم", "#/s/today", "eb-sp-welcome"],
      ["learning", "المواد", "#/s/learning", "eb-sp-learning-title"],
      ["tasks", "الواجبات", "#/s/tasks", "eb-sp-tasks-title"],
      ["progress", "التقدم", "#/s/progress", "eb-sp-progress-title"],
      ["projects", "المشاريع", "#/s/projects", "eb-sp-projects-title"]
    ]);
    expect(viewHeading("tasks")).toBe("eb-sp-tasks-title");
  });

  it("a link opens its view; no link, an unknown view or a foreign hash opens «اليوم»", () => {
    for (const v of STUDENT_VIEWS) expect(viewFromHash(viewHash(v.key), true)).toBe(v.key);
    expect(viewFromHash("", true)).toBe("today");
    expect(viewFromHash("#/s/", true)).toBe("today");
    expect(viewFromHash("#/s/admin", true)).toBe("today");
    expect(viewFromHash("#/s/tasks/extra?x=1", true)).toBe("tasks");
    expect(viewFromHash("#/owner", true)).toBe("today");
    expect(viewFromHash("#/invite/abc", true)).toBe("today");
  });

  it("«المشاريع» without a project opens «اليوم» (never an empty page)", () => {
    expect(viewFromHash("#/s/projects", false)).toBe("today");
    expect(viewFromHash("#/s/projects", true)).toBe("projects");
  });

  it("only #/s/… is a student link — the other surfaces' hashes are never claimed (main.tsx reloads only between surfaces)", () => {
    expect(isStudentViewHash("#/s/tasks")).toBe(true);
    for (const h of ["", "#", "#/owner", "#/invite/t", "#/handoff/t", "#/student/tasks", "#s/tasks"]) expect(isStudentViewHash(h)).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
describe("UX-S2 — the views' CSS contract", () => {
  const css = readFileSync(path.join(process.cwd(), "src/student/student-portal-v2.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("a view's own display is scoped to :not([hidden]), so a hidden view is really display:none (the UA rule wins)", () => {
    const viewRules = [...css.matchAll(/([^{}]*\.eb-sp-view(?![a-z-])[^{}]*)\{([^}]*display:[^}]*)\}/g)].map(m => m[1].trim());
    expect(viewRules.length).toBeGreaterThan(1);
    for (const sel of viewRules) expect(sel, sel).toContain(":not([hidden])");
  });
  it("the view bar is hidden on phones (the bottom bar serves them) and drawn as a row from 768px", () => {
    expect(css).toMatch(/\.eb-sp-v2 \.eb-sp-viewnav \{ display: none; \}/);
    const at = css.indexOf("@media (min-width: 768px) {\n  .eb-sp-v2 .eb-sp-viewnav");
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, at + 400)).toMatch(/display: flex; flex-direction: row;/);
  });
  it("only «اليوم» keeps the side-by-side pair on wide screens (hub 7 / now 5); the old whole-page grid is gone", () => {
    expect(css).toMatch(/\.eb-sp-v2 \.eb-sp-view\.is-today > \.eb-sp-today \{ grid-column: span 7; \}/);
    expect(css).toMatch(/\.eb-sp-v2 \.eb-sp-view\.is-today > \.eb-sp-now \{ grid-column: span 5; \}/);
    expect(css).not.toMatch(/\.eb-sp-v2 > \.eb-sp-(tasks-panel|projects|feed|learning|progress)/);
  });
});
