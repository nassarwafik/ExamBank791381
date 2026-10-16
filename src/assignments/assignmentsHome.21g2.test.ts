// Phase 21G.2 — the assignments home model: time status, Arabic durations, the time filter and the KPI strip.
import { describe, it, expect } from "vitest";
import { timeStatusOf, timeLabel, durationArabic, matchesTimeFilter, timeFilterCounts, homeKpis } from "./assignmentsHome";
import type { AssignmentProgress, Item } from "./types";

const NOW = Date.parse("2026-10-16T12:00:00.000Z");
const H = 3600 * 1000, D = 24 * H;
const iso = (offset: number) => new Date(NOW + offset).toISOString();
const item = (id: string, over: Partial<Item>): Item => ({ assignmentId: id, classId: "c1", className: "صف", title: id, instructions: "", status: "published", openAt: iso(-D), dueAt: iso(5 * D), questionCount: 1, totalMarks: 10, maxAttempts: 1, ...over });
const prog = (id: string, p: Partial<AssignmentProgress>): AssignmentProgress => ({ assignmentId: id, classId: "c1", expected: 10, submitted: 0, notSubmitted: 10, pendingReview: 0, graded: 0, active: 0, average: null, lastSubmittedAt: "", ...p });

describe("time status", () => {
  it("classifies drafts, archived, scheduled, open, closing soon and closed", () => {
    expect(timeStatusOf(item("a", { status: "draft" }), NOW)).toBe("draft");
    expect(timeStatusOf(item("a", { status: "archived" }), NOW)).toBe("archived");
    expect(timeStatusOf(item("a", { openAt: iso(2 * H) }), NOW)).toBe("scheduled");
    expect(timeStatusOf(item("a", {}), NOW)).toBe("open");
    expect(timeStatusOf(item("a", { dueAt: "" }), NOW)).toBe("open");
    expect(timeStatusOf(item("a", { dueAt: iso(48 * H) }), NOW)).toBe("closingSoon");
    expect(timeStatusOf(item("a", { dueAt: iso(48 * H + 1) }), NOW)).toBe("open");
    expect(timeStatusOf(item("a", { dueAt: iso(0) }), NOW)).toBe("closed");
    expect(timeStatusOf(item("a", { dueAt: iso(-1) }), NOW)).toBe("closed");
  });
  it("labels each with an Arabic duration in the largest whole unit", () => {
    expect(timeLabel(item("a", { openAt: iso(2 * H) }), NOW)).toEqual({ status: "scheduled", label: "يفتح بعد ساعتين", tone: "info" });
    expect(timeLabel(item("a", { dueAt: iso(5 * H) }), NOW)).toEqual({ status: "closingSoon", label: "يُغلق خلال 5 ساعات", tone: "attention" });
    expect(timeLabel(item("a", { dueAt: iso(-3 * D) }), NOW)).toEqual({ status: "closed", label: "أُغلق منذ 3 أيام", tone: "neutral" });
    expect(timeLabel(item("a", {}), NOW)).toEqual({ status: "open", label: "مفتوح · يُغلق خلال 5 أيام", tone: "success" });
    expect(timeLabel(item("a", { dueAt: "" }), NOW)?.label).toBe("مفتوح بلا موعد نهائي");
    expect(timeLabel(item("a", { status: "draft" }), NOW)).toBeNull();
    expect(timeLabel(item("a", { status: "archived" }), NOW)).toBeNull();
  });
  it("counts in Arabic: 1 · 2 · 3–10 · 11+", () => {
    expect([1, 2, 3, 10, 11, 45].map(m => durationArabic(m * 60000))).toEqual(["دقيقة واحدة", "دقيقتين", "3 دقائق", "10 دقائق", "11 دقيقة", "45 دقيقة"]);
    expect([1, 2, 7, 23].map(h => durationArabic(h * H))).toEqual(["ساعة واحدة", "ساعتين", "7 ساعات", "23 ساعة"]);
    expect([1, 2, 4, 12].map(d => durationArabic(d * D))).toEqual(["يوم واحد", "يومين", "4 أيام", "12 يومًا"]);
    expect(durationArabic(5000)).toBe("دقيقة واحدة");                       // never below one minute
  });
});

describe("time filter", () => {
  const list = [item("open", {}), item("soon", { dueAt: iso(H) }), item("sched", { openAt: iso(D) }), item("closed", { dueAt: iso(-H) }), item("draft", { status: "draft" }), item("arch", { status: "archived" })];
  it("«مفتوحة» includes the ones closing soon; the others are exact", () => {
    const ids = (f: Parameters<typeof matchesTimeFilter>[1]) => list.filter(x => matchesTimeFilter(x, f, NOW)).map(x => x.assignmentId);
    expect(ids("open")).toEqual(["open", "soon"]);
    expect(ids("closingSoon")).toEqual(["soon"]);
    expect(ids("scheduled")).toEqual(["sched"]);
    expect(ids("closed")).toEqual(["closed"]);
    expect(ids("draft")).toEqual(["draft"]);
  });
  it("counts exclude archived assignments", () => {
    expect(timeFilterCounts(list, NOW)).toEqual({ all: 5, open: 2, closingSoon: 1, scheduled: 1, closed: 1, draft: 1 });
  });
});

describe("KPI strip", () => {
  const list = [item("open", {}), item("soon", { dueAt: iso(H) }), item("closed", { dueAt: iso(-H) }), item("draft", { status: "draft" })];
  const progress = new Map([
    ["open", prog("open", { submitted: 4, expected: 10, pendingReview: 1, active: 2 })],
    ["soon", prog("soon", { submitted: 6, expected: 10 })],
    ["closed", prog("closed", { submitted: 9, expected: 10, pendingReview: 3 })]
  ]);
  it("open / closing soon, pending review over every published one, live attempts, submission rate over the open ones", () => {
    expect(homeKpis(list, progress, NOW)).toEqual({ open: 2, closingSoon: 1, pendingReview: 4, pendingAssignments: 2, active: 2, submitted: 10, expected: 20, completion: 50, progressKnown: true });
  });
  it("without the progress read, nothing that needs it is invented", () => {
    expect(homeKpis(list, null, NOW)).toEqual({ open: 2, closingSoon: 1, pendingReview: 0, pendingAssignments: 0, active: 0, submitted: 0, expected: 0, completion: null, progressKnown: false });
  });
});
