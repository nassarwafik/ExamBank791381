import { describe, it, expect, vi } from "vitest";
import * as SAVE from "./structuredSavePolicy";
import { toSavedStructuredExam } from "./examBuilderState";
import { networkingBlueprint } from "./assessmentBlueprintFixtures";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";
import type { StructuredExam, BuilderQuestion, BuilderSection } from "./examTypes";

// Phase 13C-C — F8: the App save path's SECOND-LINE guard, extracted as the pure owner helper App.saveStructuredExam uses.
const mcq = (id: string, marks: number, meta?: Record<string, unknown>, over: Record<string, unknown> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...(meta ? { assessmentMeta: meta } : {}), ...over } as unknown as BuilderQuestion);
const sec = (id: string, questions: BuilderQuestion[]): BuilderSection => ({ id, title: "قسم", gradingPolicy: "all", stimuli: {}, questions } as BuilderSection);
const exam = (sections: BuilderSection[], blueprint?: AssessmentBlueprintV1): StructuredExam => ({ examId: "e", title: "امتحان", status: "draft", schemaVersion: 2, updatedAt: "2026-01-01T00:00:00.000Z", ...(blueprint ? { blueprint } : {}), sections } as StructuredExam);
const BP = (policy?: unknown): AssessmentBlueprintV1 => ({ ...networkingBlueprint, constraints: [{ id: "ipv4", dimension: "topic", ref: "IP_ADDRESSING", metric: "marks", unit: "percent", min: 30 }], ...(policy ? { qualityPolicy: policy as never } : {}) });
const pol = (effect: "warning" | "block-finalization") => ({ schemaVersion: 1, enabled: true, rules: [{ id: "r", enabled: true, source: { kind: "constraint", constraintId: "ipv4" }, relations: ["below-min"], effect }] });
const below = (bp?: AssessmentBlueprintV1) => exam([sec("s1", [mcq("q1", 2, { primaryTopicId: "IP_ADDRESSING" }), mcq("q2", 6, { primaryTopicId: "OSI_TCPIP" })])], bp);
const structural = exam([sec("s1", [mcq("q1", 2, undefined, { answer: undefined })])]);
const harness = () => { const request = vi.fn(async (_payload: StructuredExam) => ({ ok: true })); const commitSaved = vi.fn(); return { request, commitSaved }; };

describe("F8 — runStructuredSave (App second-line guard)", () => {
  it("draft save sends the request even with quality blockers and structural errors; payload is the saved snapshot with status draft; commitSaved(snapshot, payload)", async () => {
    for (const e of [below(BP(pol("block-finalization"))), structural]) {
      const { request, commitSaved } = harness();
      const r = await SAVE.runStructuredSave({ snapshot: e, mode: "draft", request, commitSaved });
      expect(r.ok).toBe(true); expect(request).toHaveBeenCalledTimes(1);
      const payload = request.mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(payload.status).toBe("draft"); expect(payload.sections).toEqual(toSavedStructuredExam(e).sections);
      expect(commitSaved).toHaveBeenCalledWith(e, payload);
    }
  });
  it("final save sends the request when finalization permits (no policy; warning-only policy) and stamps status final", async () => {
    for (const e of [below(), below(BP(pol("warning"))), below(BP())]) {
      const { request, commitSaved } = harness();
      const r = await SAVE.runStructuredSave({ snapshot: e, mode: "final", request, commitSaved });
      expect(r.ok).toBe(true); expect((request.mock.calls[0][0] as unknown as Record<string, unknown>).status).toBe("final"); expect(commitSaved).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(request.mock.calls[0][0])).not.toMatch(/qualityGateReport|finalizationDecision|canFinalize|blockerCount/);   // nothing analytical is ever persisted
    }
  });
  it("final save sends NO request and commits nothing when a structural blocker, a quality blocker or a malformed enabled policy exists; the refusal names the reason", async () => {
    const cases: [StructuredExam, RegExp][] = [
      [structural, /بنيوي/],
      [below(BP(pol("block-finalization"))), /بوابات الجودة|سياسة الجودة/],
      [below(BP({ schemaVersion: 1, enabled: true, rules: [{ id: "x", enabled: true, source: { kind: "constraint", constraintId: "gone" }, relations: ["below-min"], effect: "warning" }] })), /سياسة/]
    ];
    for (const [e, re] of cases) {
      const { request, commitSaved } = harness();
      const r = await SAVE.runStructuredSave({ snapshot: e, mode: "final", request, commitSaved });
      expect(r.ok).toBe(false); expect(request).not.toHaveBeenCalled(); expect(commitSaved).not.toHaveBeenCalled();
      if (!r.ok) { expect(r.reason).toMatch(SAVE.FINAL_REFUSED_PREFIX); expect(r.reason).toMatch(re); expect(r.decision.canFinalize).toBe(false); }
    }
  });
  it("the exact snapshot passed is what is evaluated and persisted — a newer render's verdict is irrelevant", async () => {
    const good = below(BP(pol("block-finalization")));
    good.sections[0].questions[0] = mcq("q1", 6, { primaryTopicId: "IP_ADDRESSING" });                 // 50% → no blocker
    const stale = below(BP(pol("block-finalization")));                                                 // 25% → blocker
    const { request, commitSaved } = harness();
    expect((await SAVE.runStructuredSave({ snapshot: good, mode: "final", request, commitSaved })).ok).toBe(true);
    expect((await SAVE.runStructuredSave({ snapshot: stale, mode: "final", request, commitSaved })).ok).toBe(false);
    expect(request).toHaveBeenCalledTimes(1); expect(commitSaved).toHaveBeenCalledWith(good, expect.anything());
    expect(SAVE.decideStructuredSave(stale, "final")).toMatchObject({ allowed: false });
    expect(SAVE.decideStructuredSave(stale, "draft")).toMatchObject({ allowed: true });
  });
  it("a failing request rejects (caller shows the error) and never commits", async () => {
    const request = vi.fn(async (_payload: StructuredExam) => { throw new Error("تعذر الاتصال"); }); const commitSaved = vi.fn();
    await expect(SAVE.runStructuredSave({ snapshot: below(), mode: "final", request, commitSaved })).rejects.toThrow("تعذر الاتصال");
    expect(commitSaved).not.toHaveBeenCalled();
  });
});
