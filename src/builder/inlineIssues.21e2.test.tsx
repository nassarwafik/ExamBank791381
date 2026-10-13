// @vitest-environment happy-dom
//
// Phase 21E.2 (D) — inline issue building blocks: the canonical issues regrouped (never re-validated), the per-question list
// semantics, and the polite announcement that fires on count changes only, after they settle, never on first render.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, act } from "@testing-library/react";
import { indexIssues, issueSummaryText } from "./issueIndex";
import InlineIssues from "./InlineIssues";
import { useIssueAnnouncer } from "./useIssueAnnouncer";
import { validateStructuredExam, type StructuredIssue } from "../examQuality";
import { newQuestion, newSection } from "../examBuilderState";
import type { StructuredExam } from "../examTypes";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const I = (id: string, severity: "error" | "warning", extra: Partial<StructuredIssue> = {}): StructuredIssue => ({ id, severity, code: "X", message: "m" + id, ...extra });

describe("indexIssues", () => {
  it("regroups every issue exactly once: question, section, or exam level", () => {
    const issues = [I("1", "error", { sectionId: "s", questionId: "q1" }), I("2", "warning", { sectionId: "s" }), I("3", "error"), I("4", "warning", { sectionId: "s", questionId: "q1" }), I("5", "error", { sectionId: "s", questionId: "gone" })];
    const idx = indexIssues(issues, { questionIds: new Set(["q1"]), sectionIds: new Set(["s"]) });
    expect(idx.byQuestion.get("q1")!.map(i => i.id)).toEqual(["1", "4"]);
    expect(idx.bySection.get("s")!.map(i => i.id)).toEqual(["2"]);
    expect(idx.exam.map(i => i.id)).toEqual(["3", "5"]);                                     // a vanished target stays visible
    expect(idx.errors).toBe(3); expect(idx.warnings).toBe(2);
    const total = [...idx.byQuestion.values(), ...idx.bySection.values()].flat().length + idx.exam.length;
    expect(total).toBe(issues.length);
  });
  it("on a real exam the question group holds that question's canonical issues", () => {
    const q = newQuestion("multipleChoice", { text: "", marks: 0, options: [{ text: "أ" }], answer: {} });
    const exam = { examId: "e", title: "t", sections: [{ ...newSection({ title: "ق" }), id: "s", questions: [q] }] } as unknown as StructuredExam;
    const issues = validateStructuredExam(exam);
    const idx = indexIssues(issues);
    expect(idx.byQuestion.get(q.examQuestionId)!.map(i => i.code).sort()).toEqual(["EMPTY_TEXT", "MARKS_PROBLEM", "MISSING_ANSWER", "MISSING_OPTIONS"]);
  });
});

describe("InlineIssues", () => {
  it("renders a labelled group, errors first, with a text severity (colour is not the only signal)", () => {
    render(<InlineIssues id="iss-q1" label="مشكلات السؤال 1" issues={[I("w", "warning"), I("e", "error")]} />);
    const group = screen.getByRole("group", { name: "مشكلات السؤال 1" });
    expect(group.id).toBe("iss-q1");
    expect(within(group).getAllByRole("listitem").map(li => li.textContent)).toEqual(["خطأ: me", "تنبيه: mw"]);
    expect(group.getAttribute("aria-live")).toBeNull();
  });
  it("renders nothing without issues", () => {
    const { container } = render(<InlineIssues id="x" label="x" issues={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

function Announcer({ e, w }: { e: number; w: number }) { return <div role="status">{useIssueAnnouncer(e, w, 500)}</div>; }
describe("useIssueAnnouncer", () => {
  it("is silent on first render, announces a settled count change once, and ignores a change that is undone in time", () => {
    vi.useFakeTimers();
    const r = render(<Announcer e={2} w={1} />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole("status").textContent).toBe("");
    r.rerender(<Announcer e={1} w={1} />);
    act(() => { vi.advanceTimersByTime(200); });
    r.rerender(<Announcer e={2} w={1} />);                                                  // back before it settled
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole("status").textContent).toBe("");
    r.rerender(<Announcer e={0} w={1} />);
    act(() => { vi.advanceTimersByTime(499); });
    expect(screen.getByRole("status").textContent).toBe("");
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole("status").textContent).toBe("مشكلات الامتحان: 1 تنبيه.");
  });
  it("summary wording", () => {
    expect(issueSummaryText(0, 0)).toBe("لا توجد مشكلات في الامتحان.");
    expect(issueSummaryText(3, 2)).toBe("مشكلات الامتحان: 3 أخطاء و2 تنبيهات — يجب إصلاح الأخطاء قبل الاعتماد النهائي.");
    expect(issueSummaryText(1, 0)).toBe("مشكلات الامتحان: 1 خطأ — يجب إصلاح الأخطاء قبل الاعتماد النهائي.");
  });
});
