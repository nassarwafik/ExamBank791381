import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { validateStructuredExam } from "../../../src/examQuality";
import { compositeArabicExam, compositePhysicsExam } from "../../../src/composite/compositeFixtures";

// Phase 20G — DEFECT D2 (fail-first on f16ac8f): the ONE canonical exam content form (exam-canonical.js — used by every saved working copy
// AND by every immutable governance revision) stamps `history: []` / `redoStack: []` on each top-level question, but the strict composite@1
// question contract refused both keys (COMPOSITE_UNKNOWN_KEY). Consequences: (1) a saved composite exam re-opened in the Builder showed two
// BLOCKING errors the teacher never caused; (2) governance submit-review ran server finalization on the canonical revision and refused it
// (422 FINALIZATION_REFUSED) — a governed exam containing ANY composite question could never be published or assigned. Fixed: the composite
// contract tolerates exactly the canonical, academically inert bookkeeping (both keys as EMPTY arrays); any other value is still refused.
const require_ = createRequire(import.meta.url);
const { canonicalizeExamContent } = require_("../../src/lib/exam-canonical.js");
const { evaluateServerFinalization } = require_("../../src/lib/server-finalization.js");
const { createPlatform } = require_("./platform.js");
const codes = e => validateStructuredExam(e).filter(i => i.severity === "error").map(i => i.code);

describe("20G D2 — composite exams survive the canonical content form", () => {
  it("the canonical form of a finalizable composite exam is still finalizable (client authority and server authority)", () => {
    for (const f of [compositeArabicExam, compositePhysicsExam]) {
      expect(evaluateExamFinalization(f()).canFinalize).toBe(true);
      const canonical = canonicalizeExamContent(f());
      expect(canonical.sections[0].questions[0]).toMatchObject({ history: [], redoStack: [] });
      expect(codes(canonical)).toEqual([]);
      expect(evaluateServerFinalization(canonical).canFinalize).toBe(true);
    }
  });
  it("save → reload → the Builder's own finalization stays clean; governance review / approve / publish succeeds; the composite is assigned and delivered", async () => {
    const p = createPlatform({ students: { "d2-s": "طالب" } });
    const saved = await p.teacher.saveExam(compositeArabicExam());
    const loaded = (await p.teacher.loadExam(saved.jsonBody.blobName)).jsonBody.exam;
    expect(codes(loaded)).toEqual([]);
    const pub = await p.teacher.publish(loaded);
    expect(pub.steps.map(s => s.status)).toEqual([200, 200, 200, 200]);
    const a = await p.teacher.assign("CMP-20D-A");
    expect(a.status).toBe(200);
    const s = p.student("d2-s");
    await s.start(a.jsonBody.assignment.assignmentId);
    const d = await s.deliver(a.jsonBody.assignment.assignmentId);
    expect(d.jsonBody.assignment.exam.sections[0].questions[0].composite.groups).toHaveLength(3);
  });
  it("strictness is kept: a composite carrying NON-empty bookkeeping, or any other unknown question key, is still refused", () => {
    const withHistory = compositeArabicExam(); withHistory.sections[0].questions[0].history = [{ text: "old" }];
    expect(codes(withHistory)).toContain("COMPOSITE_UNKNOWN_KEY");
    const withRedo = compositeArabicExam(); withRedo.sections[0].questions[0].redoStack = "x";
    expect(codes(withRedo)).toContain("COMPOSITE_UNKNOWN_KEY");
    const smuggled = compositeArabicExam(); smuggled.sections[0].questions[0].renderer = "evil";
    expect(codes(smuggled)).toContain("COMPOSITE_UNKNOWN_KEY");
  });
});
