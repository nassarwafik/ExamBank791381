// Phase 21F.0 — the client side of conditional saves: which base version a save states, and how the history records the version
// the server returned (pure helpers; the end-to-end flow is in App.saveConflict.21f0.test.tsx).
import { describe, it, expect } from "vitest";
import { openExamHistory, commitSavedExamHistory, updateExamHistory } from "./examHistory";
import { runStructuredSave, saveConditionFields, saveConflictOf, savedEtagOf } from "./structuredSavePolicy";
import { newExamId, structuredExamCopy } from "./examBuilderState";
import { newInstantiatedExamId } from "./assessmentPreset";
import type { StructuredExam } from "./examTypes";

const exam = (title = "امتحان"): StructuredExam => ({ examId: "E1", title, status: "draft", sections: [{ id: "s1", title: "ق", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "trueFalse", text: "س", marks: 1, answer: { correct: true } }] }] } as unknown as StructuredExam);

describe("21F.0 — the base version of a save", () => {
  it("unknown base → the historical unconditional save; null → create-only; an ETag → only that version", () => {
    expect(saveConditionFields(undefined)).toEqual({});
    expect(saveConditionFields(null)).toEqual({ conditional: true, baseEtag: null });
    expect(saveConditionFields("E-7")).toEqual({ conditional: true, baseEtag: "E-7" });
  });
  it("opening records the base: a saved exam its ETag, a new one null, a legacy conversion nothing", () => {
    expect(openExamHistory(exam(), "saved", "E-1").serverEtag).toBe("E-1");
    expect(openExamHistory(exam(), "unsaved", null).serverEtag).toBeNull();
    expect(openExamHistory(exam(), "unsaved")).not.toHaveProperty("serverEtag");
  });
  it("a successful save moves the base to the version the server returned; an ETag-less response keeps the known base", () => {
    const h0 = openExamHistory(exam(), "saved", "E-1");
    const snapshot = updateExamHistory(h0, p => ({ ...p, title: "جديد" })).present as StructuredExam;
    const h1 = { ...h0, present: snapshot };
    expect(commitSavedExamHistory(h1, snapshot, snapshot, "E-2").serverEtag).toBe("E-2");
    expect(commitSavedExamHistory(h1, snapshot, snapshot, null).serverEtag).toBe("E-1");
    expect(commitSavedExamHistory(h1, snapshot, snapshot).serverEtag).toBe("E-1");
  });
  it("edits never change the base (only a save or an open does)", () => {
    const h = updateExamHistory(openExamHistory(exam(), "saved", "E-1"), p => ({ ...p, title: "x" }));
    expect(h.serverEtag).toBe("E-1");
  });
  it("runStructuredSave hands the returned ETag to the commit", async () => {
    let committed: unknown = "not-called";
    const result = await runStructuredSave({ snapshot: exam(), mode: "draft", request: async () => ({ ok: true, etag: "E-9" }), commitSaved: (_s, _p, etag) => { committed = etag; } });
    expect(result.ok).toBe(true);
    expect(committed).toBe("E-9");
    expect(savedEtagOf({ ok: true })).toBeNull();
  });
  it("only a 409 EXAM_CONFLICT is a save conflict", () => {
    expect(saveConflictOf({ status: 409, payload: { code: "EXAM_CONFLICT", serverEtag: "E-2", serverSavedAt: "2026-10-15T09:00:00Z", blobName: "exams/E1.json" } }))
      .toEqual({ serverEtag: "E-2", serverSavedAt: "2026-10-15T09:00:00Z", blobName: "exams/E1.json" });
    expect(saveConflictOf({ status: 409, payload: { code: "OTHER" } })).toBeNull();
    expect(saveConflictOf({ status: 403, payload: { code: "EXAM_CONFLICT" } })).toBeNull();
    expect(saveConflictOf(new Error("x"))).toBeNull();
  });
});

describe("21F.0 — exam ids are random, never the clock", () => {
  it("new, copied and preset-instantiated exams get distinct EXAM-<uuid> ids even within one millisecond", () => {
    const ids = [newExamId(), newExamId(), structuredExamCopy(exam()).examId, newInstantiatedExamId(), newInstantiatedExamId()];
    for (const id of ids) expect(id).toMatch(/^EXAM-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
