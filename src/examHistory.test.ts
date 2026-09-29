import { describe, it, expect } from "vitest";
import type { StructuredExam } from "./examTypes";
import {
  HISTORY_LIMIT,
  openExamHistory,
  emptyExamHistory,
  clearExamHistory,
  updateExamHistory,
  undoExamHistory,
  redoExamHistory,
  commitSavedExamHistory,
  recoverExamHistory,
  isExamDirty,
  examSaveState,
  canUndo,
  canRedo,
  type ExamHistory
} from "./examHistory";

// Phase 13A — the Structured Exam Builder's HISTORY + SAVED AUTHORITY, as a pure module (no React, no DOM).
//   present / past / future / savedCheckpoint, bounded past, functional updaters applied to the LATEST present
//   (the Phase 5B invariant), strict exam-identity isolation, and a saved checkpoint stamped only from the
//   snapshot that was actually persisted.

const exam = (examId = "EX-1", title = "T0"): StructuredExam => ({ examId, title, status: "draft", sections: [{ id: "s1", title: "S", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "A", marks: 1 }] }] } as StructuredExam);
const setTitle = (title: string) => (e: StructuredExam): StructuredExam => ({ ...e, title });
const titles = (h: ExamHistory) => ({ present: h.present?.title, past: h.past.map(e => e.title), future: h.future.map(e => e.title) });

describe("13A history — open / update / undo / redo", () => {
  it("open resets everything: present = exam, no past/future, saved checkpoint = the opened exam (not dirty)", () => {
    const h = openExamHistory(exam());
    expect(titles(h)).toEqual({ present: "T0", past: [], future: [] });
    expect(isExamDirty(h)).toBe(false);
    expect(canUndo(h)).toBe(false); expect(canRedo(h)).toBe(false);
    expect(examSaveState(h, false)).toBe("saved");
  });

  it("open as UNSAVED (new / imported / legacy conversion): no checkpoint → dirty until the first successful save", () => {
    let h = openExamHistory(exam(), "unsaved");
    expect(h.savedCheckpoint).toBeNull();
    expect(isExamDirty(h)).toBe(true);
    expect(examSaveState(h, false)).toBe("dirty");
    const snap = h.present!;
    h = commitSavedExamHistory(h, snap, { ...snap, updatedAt: "2026-01-01T00:00:00.000Z" });
    expect(isExamDirty(h)).toBe(false);
  });

  it("update creates an undo entry and applies the updater to the LATEST present (functional)", () => {
    let h = openExamHistory(exam());
    h = updateExamHistory(h, setTitle("T1"));
    h = updateExamHistory(h, prev => ({ ...prev, title: prev.title + "+" }));       // sees T1, not T0
    expect(titles(h)).toEqual({ present: "T1+", past: ["T0", "T1"], future: [] });
    expect(isExamDirty(h)).toBe(true);
    expect(examSaveState(h, false)).toBe("dirty");
  });

  it("undo moves present → future and restores the previous snapshot (same reference, never a copy)", () => {
    const first = exam();
    let h = updateExamHistory(openExamHistory(first), setTitle("T1"));
    h = undoExamHistory(h);
    expect(h.present).toBe(first);
    expect(titles(h)).toEqual({ present: "T0", past: [], future: ["T1"] });
    expect(isExamDirty(h)).toBe(false);                                            // back on the saved checkpoint
  });

  it("redo restores; a new edit after undo clears the redo stack", () => {
    let h = updateExamHistory(updateExamHistory(openExamHistory(exam()), setTitle("T1")), setTitle("T2"));
    h = undoExamHistory(undoExamHistory(h));
    expect(titles(h)).toEqual({ present: "T0", past: [], future: ["T1", "T2"] });   // future[0] = the next redo
    h = redoExamHistory(h);
    expect(titles(h)).toEqual({ present: "T1", past: ["T0"], future: ["T2"] });
    h = updateExamHistory(h, setTitle("T1b"));
    expect(titles(h)).toEqual({ present: "T1b", past: ["T0", "T1"], future: [] });
    expect(canRedo(h)).toBe(false);
  });

  it("undo / redo with nothing to do are identity (no throw, same state object)", () => {
    const h = openExamHistory(exam());
    expect(undoExamHistory(h)).toBe(h);
    expect(redoExamHistory(h)).toBe(h);
    expect(undoExamHistory(emptyExamHistory())).toBe(emptyExamHistory());
  });

  it("a no-op updater (same reference OR structurally equal result) creates no history entry", () => {
    const h0 = updateExamHistory(openExamHistory(exam()), setTitle("T1"));
    expect(updateExamHistory(h0, e => e)).toBe(h0);
    const h1 = updateExamHistory(h0, e => ({ ...e, title: "T1" }));                // new object, same content
    expect(h1).toBe(h0);
    expect(h1.past).toHaveLength(1);
  });

  it("the past is bounded to HISTORY_LIMIT snapshots (oldest dropped); undo still walks the kept ones", () => {
    let h = openExamHistory(exam());
    for (let i = 1; i <= HISTORY_LIMIT + 25; i++) h = updateExamHistory(h, setTitle("T" + i));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0].title).toBe("T25");                                            // T0..T24 dropped
    for (let i = 0; i < HISTORY_LIMIT; i++) h = undoExamHistory(h);
    expect(h.present?.title).toBe("T25");
    expect(canUndo(h)).toBe(false);
  });

  it("update on a cleared (null) present never recreates an exam (a late async result after close)", () => {
    const h = clearExamHistory(updateExamHistory(openExamHistory(exam()), setTitle("T1")));
    expect(h.present).toBeNull();
    const late = updateExamHistory(h, setTitle("LATE"));
    expect(late.present).toBeNull();
    expect(late.past).toEqual([]);
  });
});

describe("13A history — exam identity isolation", () => {
  it("opening ANOTHER exam clears history, redo and the recovered flag; its checkpoint is the new exam", () => {
    let h = updateExamHistory(openExamHistory(exam("EX-1")), setTitle("T1"));
    h = undoExamHistory(updateExamHistory(h, setTitle("T2")));
    const b = exam("EX-2", "B");
    h = openExamHistory(b);
    expect(h.present).toBe(b);
    expect(titles(h)).toEqual({ present: "B", past: [], future: [] });
    expect(isExamDirty(h)).toBe(false);
    expect(h.recovered).toBe(false);
  });

  it("a late updater guarded by the OLD exam id (the builder's guard) is a no-op on the new exam — no entry", () => {
    let h = openExamHistory(exam("EX-1"));
    h = openExamHistory(exam("EX-2", "B"));
    const guarded = (prev: StructuredExam) => (prev.examId === "EX-1" ? { ...prev, title: "LATE IMAGE" } : prev);
    expect(updateExamHistory(h, guarded)).toBe(h);
  });
});

describe("13A history — saved authority (checkpoint from the snapshot that was ACTUALLY persisted)", () => {
  it("dirty → saved: a save whose snapshot is still the present lands the payload as present + checkpoint", () => {
    let h = updateExamHistory(openExamHistory(exam()), setTitle("T1"));
    const snapshot = h.present!;
    const payload = { ...snapshot, status: "final" as const, updatedAt: "2026-01-01T00:00:00.000Z" };
    h = commitSavedExamHistory(h, snapshot, payload);
    expect(h.present).toBe(payload);
    expect(h.savedCheckpoint).toBe(payload);
    expect(isExamDirty(h)).toBe(false);
    expect(canUndo(h)).toBe(true);                                                  // undo across a save still works …
    expect(isExamDirty(undoExamHistory(h))).toBe(true);                             // … and makes it dirty again
  });

  it("save race: save starts on A, edit B lands before the response → B is kept, NOT labelled saved, still dirty", () => {
    let h = updateExamHistory(openExamHistory(exam()), setTitle("A"));
    const snapshotA = h.present!;
    h = updateExamHistory(h, setTitle("B"));                                        // edit during the save
    const payload = { ...snapshotA, status: "final" as const, updatedAt: "2026-01-01T00:00:00.000Z" };
    h = commitSavedExamHistory(h, snapshotA, payload);
    expect(h.present?.title).toBe("B");
    expect(h.present?.status).toBe("draft");                                        // reconcileSavedStructuredExam semantics
    expect(h.present?.updatedAt).not.toBe(payload.updatedAt);
    expect(h.savedCheckpoint).toBe(payload);                                        // the server has A
    expect(isExamDirty(h)).toBe(true);
  });

  it("a save response for a DIFFERENT exam (the teacher opened another one meanwhile) touches nothing", () => {
    let h = updateExamHistory(openExamHistory(exam("EX-1")), setTitle("A"));
    const snapshotA = h.present!;
    const b = exam("EX-2", "B");
    h = openExamHistory(b);
    const out = commitSavedExamHistory(h, snapshotA, { ...snapshotA, status: "final" as const });
    expect(out).toBe(h);
    expect(out.savedCheckpoint).toBe(b);
  });

  it("a save response after the exam was cleared does nothing", () => {
    const h = clearExamHistory(openExamHistory(exam()));
    const snap = exam();
    expect(commitSavedExamHistory(h, snap, { ...snap, status: "final" as const })).toBe(h);
  });

  it("saving clears the recovered flag; examSaveState reports saving while a save is in flight", () => {
    const server = exam();
    let h = recoverExamHistory(openExamHistory(server), { ...server, title: "LOCAL" });
    expect(h.recovered).toBe(true);
    expect(examSaveState(h, false)).toBe("recovered");
    expect(examSaveState(h, true)).toBe("saving");
    const snap = h.present!;
    h = commitSavedExamHistory(h, snap, { ...snap, updatedAt: "x" });
    expect(h.recovered).toBe(false);
    expect(examSaveState(h, false)).toBe("saved");
  });
});

describe("13A history — local recovery", () => {
  it("recover: the recovered copy becomes present (dirty, undoable back to the server copy); checkpoint stays the server copy", () => {
    const server = exam();
    const local = { ...server, title: "LOCAL" };
    let h = recoverExamHistory(openExamHistory(server), local);
    expect(h.present).toBe(local);
    expect(h.savedCheckpoint).toBe(server);
    expect(isExamDirty(h)).toBe(true);
    h = undoExamHistory(h);
    expect(h.present).toBe(server);
    expect(isExamDirty(h)).toBe(false);
  });

  it("recover refuses a copy of another exam id or when nothing is open", () => {
    const h = openExamHistory(exam("EX-1"));
    expect(recoverExamHistory(h, exam("EX-2", "OTHER"))).toBe(h);
    expect(recoverExamHistory(emptyExamHistory(), exam("EX-1"))).toBe(emptyExamHistory());
  });

  it("dirty is structural (reverting an edit by hand returns to saved) but never depends on exam.status", () => {
    let h = updateExamHistory(openExamHistory(exam()), setTitle("T1"));
    h = updateExamHistory(h, setTitle("T0"));                                       // typed the old title back
    expect(isExamDirty(h)).toBe(false);
    const finalExam = { ...exam(), status: "final" as const };
    expect(isExamDirty(openExamHistory(finalExam))).toBe(false);
    expect(isExamDirty(updateExamHistory(openExamHistory(finalExam), setTitle("X")))).toBe(true);
  });
});

describe("13A history — review blocker 2: the persisted payload replaces the save snapshot INSIDE history", () => {
  const persisted = (snap: StructuredExam) => ({ ...snap, status: "final" as const, updatedAt: "2026-05-05T05:05:05.000Z", totalMarks: 1 });

  it("saved T0 → edit A → save(A) starts → edit B → commit A: undo lands on the PERSISTED A (not dirty); redo restores B (dirty)", () => {
    let h = updateExamHistory(openExamHistory(exam()), setTitle("A"));
    const snapshotA = h.present!;
    h = updateExamHistory(h, setTitle("B"));                                        // during the save
    const payload = persisted(snapshotA);
    h = commitSavedExamHistory(h, snapshotA, payload);
    expect(h.present?.title).toBe("B"); expect(isExamDirty(h)).toBe(true);
    h = undoExamHistory(h);
    expect(h.present).toBe(payload);                                                // the real saved checkpoint, not pre-save A
    expect(h.present?.status).toBe("final");
    expect(h.present?.updatedAt).toBe("2026-05-05T05:05:05.000Z");
    expect(isExamDirty(h)).toBe(false);
    expect(examSaveState(h, false)).toBe("saved");
    h = redoExamHistory(h);
    expect(h.present?.title).toBe("B"); expect(isExamDirty(h)).toBe(true);
  });

  it("A deeper than the top of past (two edits after the snapshot) is reconciled too; bounded history is preserved", () => {
    let h = updateExamHistory(openExamHistory(exam()), setTitle("A"));
    const snapshotA = h.present!;
    h = updateExamHistory(updateExamHistory(h, setTitle("B")), setTitle("C"));
    const payload = persisted(snapshotA);
    h = commitSavedExamHistory(h, snapshotA, payload);
    expect(h.past).toContain(payload); expect(h.past).not.toContain(snapshotA);
    expect(h.past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
    h = undoExamHistory(undoExamHistory(h));
    expect(h.present).toBe(payload); expect(isExamDirty(h)).toBe(false);
    expect(undoExamHistory(h).present?.title).toBe("T0");                           // history before A is intact
  });

  it("the snapshot sitting in FUTURE (undone before the response) is reconciled as well", () => {
    let h = updateExamHistory(openExamHistory(exam()), setTitle("A"));
    const snapshotA = h.present!;
    h = undoExamHistory(h);                                                         // A now in future
    const payload = persisted(snapshotA);
    h = commitSavedExamHistory(h, snapshotA, payload);
    expect(h.future[0]).toBe(payload);
    h = redoExamHistory(h);
    expect(h.present).toBe(payload); expect(isExamDirty(h)).toBe(false);
  });

  it("only the EXACT snapshot reference is replaced — an equal-looking but distinct state is untouched", () => {
    let h = updateExamHistory(openExamHistory(exam()), setTitle("A"));
    const snapshotA = h.present!;
    h = updateExamHistory(h, setTitle("B"));
    h = updateExamHistory(h, setTitle("A"));                                        // a NEW object equal to A
    const lookalike = h.present!;
    h = updateExamHistory(h, setTitle("C"));
    h = commitSavedExamHistory(h, snapshotA, persisted(snapshotA));
    expect(h.past.filter(e => e.title === "A")).toHaveLength(2);
    expect(h.past).toContain(lookalike);                                            // untouched
    expect(h.past.some(e => e.status === "final")).toBe(true);                      // exactly the snapshot became the payload
    expect(h.past.filter(e => e.status === "final")).toHaveLength(1);
  });
});
