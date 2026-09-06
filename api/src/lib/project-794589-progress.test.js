import { describe, it, expect } from "vitest";
import { applyProgressUpdate } from "./project-794589-progress.js";

const base = { actor: "teacher1", programCode: "794589", classId: "c1", studentId: "s1" };
const NOW = "2026-09-10T09:00:00.000Z";

describe("applyProgressUpdate - the status workflow", () => {
  it("creates the doc and moves not_started -> in_progress with a history event", () => {
    const r = applyProgressUpdate(null, { ...base, stageId: "B01", status: "in_progress", now: NOW });
    expect(r.doc.stages.B01.status).toBe("in_progress");
    expect(r.fromStatus).toBe("not_started");
    expect(r.doc.history).toHaveLength(1);
    expect(r.doc.history[0]).toMatchObject({ stageId: "B01", type: "status", fromStatus: "not_started", toStatus: "in_progress" });
    expect(r.doc.startedAt).toBe(NOW);
  });
  it("in_progress -> ready_for_review", () => {
    const first = applyProgressUpdate(null, { ...base, stageId: "B01", status: "in_progress", now: NOW }).doc;
    const r = applyProgressUpdate(first, { ...base, stageId: "B01", status: "ready_for_review", now: NOW });
    expect(r.doc.stages.B01.status).toBe("ready_for_review");
    expect(r.toStatus).toBe("ready_for_review");
  });
  it("ready_for_review -> approved stamps approvedAt/approvedBy", () => {
    const prev = { stages: { B01: { status: "ready_for_review" } }, history: [] };
    const r = applyProgressUpdate(prev, { ...base, stageId: "B01", status: "approved", now: NOW });
    expect(r.doc.stages.B01.status).toBe("approved");
    expect(r.doc.stages.B01.approvedAt).toBe(NOW);
    expect(r.doc.stages.B01.approvedBy).toBe("teacher1");
  });
  it("moving away from approved clears the approval stamp", () => {
    const prev = { stages: { B01: { status: "approved", approvedAt: NOW, approvedBy: "t" } }, history: [] };
    const r = applyProgressUpdate(prev, { ...base, stageId: "B01", status: "in_progress", now: NOW });
    expect(r.doc.stages.B01.approvedAt).toBeUndefined();
    expect(r.doc.stages.B01.approvedBy).toBeUndefined();
  });
  it("a note change records a note event without storing the text in history", () => {
    const r = applyProgressUpdate(null, { ...base, stageId: "B01", note: "راجع OSPF", now: NOW });
    expect(r.doc.stages.B01.note).toBe("راجع OSPF");
    expect(r.noteChanged).toBe(true);
    const noteEvent = r.doc.history.find(e => e.type === "note");
    expect(noteEvent).toBeTruthy();
    expect(JSON.stringify(noteEvent)).not.toContain("راجع OSPF");
  });
  it("rejects an invalid status", () => {
    expect(() => applyProgressUpdate(null, { ...base, stageId: "B01", status: "done", now: NOW })).toThrow();
  });
  it("throws NO_CHANGE when nothing actually changes", () => {
    const prev = { stages: { B01: { status: "approved", approvedAt: NOW, approvedBy: "t" } }, history: [] };
    try {
      applyProgressUpdate(prev, { ...base, stageId: "B01", status: "approved", now: NOW });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e.code).toBe("NO_CHANGE");
    }
  });
});
