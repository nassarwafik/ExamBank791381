import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { toSavedStructuredExam } from "../../../src/examBuilderState";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { publishAndAssign, takeExam } from "../certification-20g/lifecycle.js";
import { attemptInvariants } from "../certification-20g/ledger.js";
import { A, CANARY } from "../certification-20g/kit.js";
import { SURFACE_PLOTS_ACCEPTANCE_PATH } from "./surfacePlotsExam.js";

// Phase 21D-A.4 — the multi-surface 3D plot acceptance exam through the PRODUCTION authorities: JSON import → save → re-import,
// finalization, the real platform lifecycle (publish, student delivery, autosave / restore, submit, official grading) and the compiled
// shared server authority refusing tampered plots. The plots are rich stimuli of existing question types: grading never depends on them.
const require_ = createRequire(import.meta.url);
const { createPlatform } = require_("../certification-20g/platform.js");
const { validateRichContent } = require_("../../src/lib/shared-finalization/richContent/richContentModel.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const load = () => JSON.parse(fs.readFileSync(path.join(root, SURFACE_PLOTS_ACCEPTANCE_PATH), "utf8"));
const block = q => q.richContent.blocks.find(b => b.type === "functionSurface3D");
const PERFECT = { a1: A.choice(0), b1: A.choice(0), c1: A.choice(0), d1: A.choice(0), e1: A.choice(0) };
const PARTIAL = { a1: A.choice(0), b1: A.choice(1), c1: A.choice(0), d1: A.choice(1), e1: A.choice(0) };

describe("21D-A.4 lifecycle — multi-surface 3D plots in a real exam", () => {
  let platform, published, perfect, partial;
  beforeAll(async () => {
    platform = createPlatform({ students: { "s-perfect": "طالب مثالي", "s-partial": "طالب جزئي" } });
    published = await publishAndAssign(platform, load());
    perfect = await takeExam(platform, published.aid, "s-perfect", PERFECT, { chunks: 2 });
    partial = await takeExam(platform, published.aid, "s-partial", PARTIAL, { chunks: 2 });
  }, 120000);

  it("imports, round-trips (save → re-import) and finalizes with no blocker; V2 plots and the V1 surface survive byte-identical", () => {
    const original = load();
    const plots = original.sections.map(s => block(s.questions[0]).surface);
    expect(plots.map(s => s.version)).toEqual([2, 2, 2, 2, 1]);
    expect(plots.slice(0, 4).map(s => s.surfaces.length)).toEqual([2, 2, 2, 3]);
    const imp = parseStructuredExamJson(JSON.stringify(original), "21da4.json");
    expect([imp.canOpen, imp.parseErrors, imp.validationErrors.filter(x => x.severity === "error")]).toEqual([true, [], []]);
    expect(evaluateExamFinalization(original).blockers).toEqual([]);
    const again = parseStructuredExamJson(JSON.stringify(toSavedStructuredExam(imp.exam)), "again-21da4.json");
    expect([again.canOpen, again.validationErrors.filter(x => x.severity === "error")]).toEqual([true, []]);
    expect(again.exam.sections.map(s => block(s.questions[0]).surface)).toEqual(plots);
  });

  it("teacher publish keeps the canonical plots; student delivery carries the public plots and no teacher-private data", () => {
    expect(published.pub.ok).toBe(true);
    const original = load(), snap = platform.assignmentOf(published.aid).examSnapshot;
    expect(snap.sections.map(s => block(s.questions[0]).surface)).toEqual(original.sections.map(s => block(s.questions[0]).surface));
    const delivered = perfect.delivery.jsonBody.assignment.exam;
    const plots = delivered.sections.map(s => block(s.questions[0]).surface);
    expect(plots.map(s => s.id)).toEqual(["plot-paraboloids", "plot-saddle-plane", "plot-cone-plane", "plot-three", "surface-dome-v1"]);
    expect(plots[0].surfaces.map(s => s.expression)).toEqual(["x^2+y^2", "4-x^2-y^2"]);
    expect(plots[3].controls).toEqual({ rotate: true, zoom: false, toggleSurfaces: false });
    const json = JSON.stringify(perfect.delivery.jsonBody);
    expect(json).not.toContain("correctOptionIndex");
    expect(json).not.toContain(CANARY);
    const local = JSON.stringify(sanitizeExamForStudent(load()));
    expect(local).not.toContain(CANARY);
    expect(local).toContain('"version":2');
  });

  it("autosave / restore and official grading work with the plots present (grading never reads a plot)", () => {
    for (const [run, score] of [[perfect, 20], [partial, 12]]) {
      expect(run.restores.length).toBeGreaterThan(0);
      expect(run.restores.at(-1).restored).toEqual(run.answers);
      expect([run.submit.status, run.duplicateSubmit.status]).toEqual([200, 409]);
      expect([run.attempt.score, run.attempt.totalMarks, run.attempt.finalized]).toEqual([score, 20, true]);
      expect(attemptInvariants(run.attempt, 20)).toEqual([]);
    }
  });

  it("the shared server authority refuses tampered plots, and finalization blocks them", () => {
    const tamper = [
      s => { s.renderer = { rawSvg: "<svg onload=alert(1) />" }; },
      s => { s.surfaces = [...s.surfaces, ...s.surfaces.map((x, i) => ({ ...x, id: "copy" + i })), ...s.surfaces.map((x, i) => ({ ...x, id: "more" + i }))]; },
      s => { s.surfaces[1].color = s.surfaces[0].color; },
      s => { s.surfaces[0].expression = "x+t"; },
      s => { s.surfaces[0].onclick = "alert(1)"; },
      s => { s.viewport.zMax = s.viewport.zMin; }
    ];
    for (const mutate of tamper) {
      const exam = load(), rich = exam.sections[0].questions[0].richContent;
      mutate(block({ richContent: rich }).surface);
      const r = validateRichContent(rich);
      expect(r.ok).toBe(false);
      expect(r.issues.map(i => i.code)).toContain("RICH_CONTENT_FUNCTION_SURFACE");
      expect(evaluateExamFinalization(exam).blockers.length).toBeGreaterThan(0);
    }
  });
});
