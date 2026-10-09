import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { publishAndAssign, takeExam } from "../certification-20g/lifecycle.js";
import { attemptInvariants } from "../certification-20g/ledger.js";
import { SURFACES_ACCEPTANCE_PATH } from "../../../scripts/function-surfaces-21b-exam.mjs";

const require_ = createRequire(import.meta.url);
const { createPlatform } = require_("../certification-20g/platform.js");
const { validateRichContent } = require_("../../src/lib/shared-finalization/richContent/richContentModel.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const load = () => JSON.parse(fs.readFileSync(path.join(root, SURFACES_ACCEPTANCE_PATH), "utf8"));
const PERFECT = {
  a1: { kind: "choice", index: 0 }, b1: { kind: "choice", index: 0 },
  c1: { kind: "choice", index: 0 }, d1: { kind: "choice", index: 0 }
};
const PARTIAL = {
  a1: { kind: "choice", index: 0 }, b1: { kind: "choice", index: 1 },
  c1: { kind: "choice", index: 0 }, d1: { kind: "choice", index: 2 }
};

describe("21B-PLATFORM persisted 3D surfaces in the real exam lifecycle", () => {
  let platform, published, aid, perfect, partial;
  beforeAll(async () => {
    platform = createPlatform({ students: { "s-perfect": "طالب مثالي", "s-partial": "طالب جزئي" } });
    published = await publishAndAssign(platform, load());
    aid = published.aid;
    perfect = await takeExam(platform, aid, "s-perfect", PERFECT, { chunks: 2 });
    partial = await takeExam(platform, aid, "s-partial", PARTIAL, { chunks: 2 });
  }, 120000);

  it("teacher save/publish preserves the canonical SurfaceSpecV1 objects", () => {
    expect(published.pub.ok).toBe(true);
    const original = load();
    const snap = platform.assignmentOf(aid).examSnapshot;
    for (let i = 0; i < 4; i++) {
      const before = original.sections[i].questions[0].richContent.blocks.find(b => b.type === "functionSurface3D").surface;
      const after = snap.sections[i].questions[0].richContent.blocks.find(b => b.type === "functionSurface3D").surface;
      expect(after).toEqual(before);
    }
  });

  it("student delivery includes safe 3D specs but never teacher answer keys", () => {
    const delivered = perfect.delivery.jsonBody.assignment.exam;
    const surfaces = delivered.sections.map(s => s.questions[0].richContent.blocks.find(b => b.type === "functionSurface3D").surface);
    expect(surfaces.map(s => s.id)).toEqual(["surface-paraboloid", "surface-saddle", "surface-wave", "surface-dome"]);
    expect(surfaces.map(s => s.expression)).toEqual(["x^2+y^2", "x^2-y^2", "sin(x)*cos(y)", "sqrt(4-x^2-y^2)"]);
    expect(JSON.stringify(perfect.delivery.jsonBody)).not.toContain("correctOptionIndex");
  });

  it("autosave/restore and official grading work with 3D rich stimuli present", () => {
    for (const [run, score] of [[perfect, 16], [partial, 8]]) {
      expect(run.restores.length).toBeGreaterThan(0);
      expect(run.restores.at(-1).restored).toEqual(run.answers);
      expect([run.submit.status, run.duplicateSubmit.status]).toEqual([200, 409]);
      expect([run.attempt.score, run.attempt.totalMarks, run.attempt.finalized]).toEqual([score, 16, true]);
      expect(attemptInvariants(run.attempt, 16)).toEqual([]);
    }
  });

  it("the shared server authority refuses renderer data smuggled into a 3D rich block", () => {
    const exam = load();
    const rich = structuredClone(exam.sections[0].questions[0].richContent);
    const block = rich.blocks.find(b => b.type === "functionSurface3D");
    block.surface.renderer = { rawSvg: "<svg onload=alert(1) />" };
    const r = validateRichContent(rich);
    expect(r.ok).toBe(false);
    expect(r.issues.map(i => i.code)).toContain("RICH_CONTENT_FUNCTION_SURFACE");
  });
});
