import { describe, it, expect } from "vitest";
import { filterStudentCards, statusLabel, stagesByGroup, STATUS_META } from "./helpers";
import type { StudentCard, StageStatus } from "./types";

function card(over: Partial<StudentCard> = {}): StudentCard {
  return {
    studentId: "s", displayName: "أحمد", code: "111", overallProgress: 50, bookProgress: 50,
    packetTracerProgress: 50, counts: { not_started: 0, in_progress: 0, ready_for_review: 0, approved: 5 },
    readyForReviewCount: 0, complete: false, updatedAt: "2026-09-10T00:00:00.000Z", stale: false, ...over
  };
}

describe("filterStudentCards", () => {
  const cards = [
    card({ studentId: "a", displayName: "أحمد", overallProgress: 20, readyForReviewCount: 2 }),
    card({ studentId: "b", displayName: "سارة", overallProgress: 100, complete: true }),
    card({ studentId: "c", displayName: "خالد", overallProgress: 0, counts: { not_started: 10, in_progress: 0, ready_for_review: 0, approved: 0 }, readyForReviewCount: 0 }),
    card({ studentId: "d", displayName: "ليان", stale: true, overallProgress: 30 })
  ];
  it("all returns everyone", () => {
    expect(filterStudentCards(cards, "all", "", 40)).toHaveLength(4);
  });
  it("ready filters to students with ready_for_review stages", () => {
    expect(filterStudentCards(cards, "ready", "", 40).map(c => c.studentId)).toEqual(["a"]);
  });
  it("late uses the configurable threshold, excludes complete", () => {
    // < 40 and not complete: a(20), c(0), d(30)
    expect(filterStudentCards(cards, "late", "", 40).map(c => c.studentId).sort()).toEqual(["a", "c", "d"]);
    // a lower threshold changes the result
    expect(filterStudentCards(cards, "late", "", 10).map(c => c.studentId)).toEqual(["c"]);
  });
  it("not_started filters to untouched students", () => {
    expect(filterStudentCards(cards, "not_started", "", 40).map(c => c.studentId)).toEqual(["c"]);
  });
  it("complete + stale filters", () => {
    expect(filterStudentCards(cards, "complete", "", 40).map(c => c.studentId)).toEqual(["b"]);
    expect(filterStudentCards(cards, "stale", "", 40).map(c => c.studentId)).toEqual(["d"]);
  });
  it("search matches name or code", () => {
    expect(filterStudentCards(cards, "all", "سارة", 40).map(c => c.studentId)).toEqual(["b"]);
    expect(filterStudentCards(cards, "all", "111", 40).length).toBe(4);
  });
});

describe("status metadata + grouping", () => {
  it("every status has an Arabic label", () => {
    (Object.keys(STATUS_META) as StageStatus[]).forEach(s => expect(statusLabel(s)).toBeTruthy());
    expect(statusLabel("approved")).toBe("تم الاعتماد");
  });
  it("stagesByGroup groups one track's stages preserving order", () => {
    const stages = [
      { stageId: "B02", groupId: "g1", order: 2, track: "book" as const },
      { stageId: "B01", groupId: "g1", order: 1, track: "book" as const },
      { stageId: "P01", groupId: "g2", order: 1, track: "packetTracer" as const }
    ];
    const grouped = stagesByGroup(stages, "book");
    expect(grouped.get("g1")!.map(s => s.stageId)).toEqual(["B01", "B02"]);
    expect(grouped.has("g2")).toBe(false);
  });
});
