// Phase 21G.4 — one status per student: grading first (the shared resolver's status), then a live attempt, then «لم يسلّم»; the
// lifecycle survives only as a note when it adds something. Never from a score.
import { describe, it, expect } from "vitest";
import { studentStatus } from "./gradebookStatus";
import { rowGrading } from "./assignmentsView";
import type { StudentResult } from "./types";

const result = (extra: Record<string, unknown> = {}) => ({ attemptNumber: 1, score: 0, totalMarks: 10, percentage: 0, submittedAt: "2026-10-01T00:00:00Z", finalized: true, manualReviewMarks: 0, ...extra });
const s = (over: Record<string, unknown> = {}) => ({ studentId: "x", studentName: "x", studentCode: "x", attemptsUsed: 0, allowedAttempts: 1, dueAtOverride: null, ...over } as unknown as StudentResult);
const live = (status = "started") => ({ activeAttempt: { attemptNumber: 2, startedAt: "a", endsAt: "b", status } });
const of = (row: StudentResult) => { const st = studentStatus(row, rowGrading(row)); return [st.key, st.label, st.note]; };

describe("one gradebook status per student", () => {
  it("grading first: a final result stays «نهائي» while a newer attempt runs (the live attempt is the note)", () => {
    expect(of(s({ attemptStatus: "submitted", latestResult: result() }))).toEqual(["final", "نهائي", null]);
    expect(of(s({ attemptStatus: "started", latestResult: result(), ...live() }))).toEqual(["final", "نهائي", "قيد المحاولة"]);
    expect(of(s({ attemptStatus: "timedOut", latestResult: result() }))).toEqual(["final", "نهائي", "انتهى الوقت"]);
    expect(of(s({ attemptStatus: "teacherEnded", latestResult: result() }))).toEqual(["final", "نهائي", "أنهى المعلم المحاولة"]);
  });
  it("a pending review names its manual marks and is never shown as a grade", () => {
    expect(of(s({ attemptStatus: "submitted", latestResult: result({ finalized: false, manualReviewMarks: 6, percentage: 95 }) }))).toEqual(["pendingReview", "بانتظار التصحيح (6 ع.)", null]);
    expect(of(s({ gradingStatus: "pendingReview", attemptStatus: "submitted", latestResult: result({ percentage: 100 }) }))).toEqual(["pendingReview", "بانتظار التصحيح", null]);
  });
  it("without a graded result, the live attempt describes the student in its own lifecycle words", () => {
    expect(of(s({ attemptStatus: "started", ...live() }))).toEqual(["active", "قيد المحاولة", null]);
    expect(of(s({ attemptStatus: "draft", ...live("draft") }))).toEqual(["active", "مسودة", null]);
    expect(of(s({ attemptStatus: "paused", ...live("paused") }))).toEqual(["paused", "متوقفة مؤقتًا", null]);
  });
  it("otherwise «لم يسلّم», with the lifecycle only when it adds something", () => {
    expect(of(s({ attemptStatus: "notStarted" }))).toEqual(["notSubmitted", "لم يسلّم", null]);
    expect(of(s({}))).toEqual(["notSubmitted", "لم يسلّم", null]);
    expect(of(s({ attemptStatus: "integrityExit" }))).toEqual(["notSubmitted", "لم يسلّم", "غادر صفحة الامتحان"]);
  });
});
