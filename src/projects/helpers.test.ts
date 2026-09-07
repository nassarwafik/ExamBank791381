import { describe, it, expect } from "vitest";
import { filterStudentCards, stagesByGroup, statusLabel } from "./helpers";
import type { StudentCard } from "./types";

function card(over: Partial<StudentCard>): StudentCard {
  return {
    studentId: "s", displayName: "طالب", code: "C1", overallProgress: 0,
    trackProgress: {}, counts: { not_started: 0, in_progress: 0, ready_for_review: 0, approved: 0 },
    readyForReviewCount: 0, complete: false, updatedAt: "", stale: false, ...over
  };
}

describe("filterStudentCards (generic, config-driven threshold)", () => {
  const cards = [
    card({ studentId: "a", displayName: "أحمد", overallProgress: 20 }),
    card({ studentId: "b", displayName: "بلال", overallProgress: 80, readyForReviewCount: 2, counts: { not_started: 0, in_progress: 0, ready_for_review: 2, approved: 5 } }),
    card({ studentId: "c", displayName: "خالد", complete: true, overallProgress: 100 }),
    card({ studentId: "d", displayName: "سعيد", stale: true, overallProgress: 10 })
  ];
  it("ready filter", () => { expect(filterStudentCards(cards, "ready", "", 40).map(c => c.studentId)).toEqual(["b"]); });
  it("late filter uses the given threshold, not a hard-coded one", () => {
    expect(filterStudentCards(cards, "late", "", 40).map(c => c.studentId).sort()).toEqual(["a", "d"]);
    expect(filterStudentCards(cards, "late", "", 15).map(c => c.studentId)).toEqual(["d"]);
  });
  it("complete + stale + search", () => {
    expect(filterStudentCards(cards, "complete", "", 40).map(c => c.studentId)).toEqual(["c"]);
    expect(filterStudentCards(cards, "stale", "", 40).map(c => c.studentId)).toEqual(["d"]);
    expect(filterStudentCards(cards, "all", "خالد", 40).map(c => c.studentId)).toEqual(["c"]);
  });
});

describe("stagesByGroup (generic track string)", () => {
  it("groups a track's stages by group in order", () => {
    const stages = [
      { stageId: "V02", track: "visualStudio", groupId: "g1", order: 2 },
      { stageId: "V01", track: "visualStudio", groupId: "g1", order: 1 },
      { stageId: "B01", track: "book", groupId: "b1", order: 1 }
    ];
    const m = stagesByGroup(stages, "visualStudio");
    expect(m.get("g1")!.map(s => s.stageId)).toEqual(["V01", "V02"]);
    expect(m.has("b1")).toBe(false);
  });
});

describe("statusLabel", () => {
  it("labels known statuses and falls back", () => {
    expect(statusLabel("approved")).toBe("تم الاعتماد");
    expect(statusLabel("ready_for_review")).toBe("جاهز للفحص");
  });
});
