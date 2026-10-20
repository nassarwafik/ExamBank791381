// @vitest-environment happy-dom
//
// Phase R-1 (owner decision D-1) — the gradebook's average / highest / lowest are over FINAL results only; the page says so when
// results are still awaiting the teacher, so a teacher never mistakes the excluded ones for missing marks.
import { describe, it, expect, afterEach } from "vitest";
import { createRef } from "react";
import { render, cleanup } from "@testing-library/react";
import AssignmentDetail from "./AssignmentDetail";

afterEach(cleanup);
const noop = () => {};
const item = { assignmentId: "a1", classId: "c", className: "أ", title: "و", instructions: "", status: "published" as const, openAt: "", dueAt: "", questionCount: 1, totalMarks: 2, maxAttempts: 1 };
const mount = (pendingReview: number) => render(
  <AssignmentDetail item={item} stats={{ students: 3, submitted: 3, pendingReview, finalized: 3 - pendingReview, notSubmitted: 0, active: 0, average: 70, highest: 80, lowest: 60 }} loading={false} headingRef={createRef()} onClose={noop}
    analysis={null} analysisBusy={false} analysisSort="number" onAnalysisSort={noop} tab="students" onTab={noop} overview={null} sortedQuestions={[]} analysisSummary={null} fmt={v => v}>{null}</AssignmentDetail>);
const hints = () => document.querySelector(".eb-assign-stats-hints")?.textContent || "";

describe("R-1 — gradebook average wording", () => {
  it("names the results it leaves out", () => {
    mount(1);
    expect(hints()).toContain("لا يشمل 1 بانتظار التصحيح");
  });
  it("adds nothing when every result is final", () => {
    mount(0);
    expect(hints()).not.toContain("بانتظار التصحيح");
  });
});
