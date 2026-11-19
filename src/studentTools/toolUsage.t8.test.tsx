// @vitest-environment happy-dom
// Phase T8 — the tool usage record: the exam page's counting helpers and the teacher's line in the review.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import AssignmentReview from "../AssignmentReview";
import { bumpToolUsage, serverToolUsage, maxToolUsage, toolUsageRequestField, TOOL_USAGE_MAX_OPENS } from "./toolUsage";
import { opensLabel, toolUsageSummaryText } from "./toolUsageSummary";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const attempt = (over: Record<string, unknown>) => ({ attemptNumber: 1, submittedAt: "2026-10-13T10:00:00.000Z", score: 4, totalMarks: 6, percentage: 66.7, manualReviewMarks: 2, finalized: false, gradingStatus: "pendingReview", startedAt: "", endedAt: "", endReason: "submitted", teacherFeedback: "", ...over });
const q = (id: string, n: number, over: Record<string, unknown>) => ({ questionId: id, questionNumber: n, text: "س" + n, marks: 2, type: "multipleChoice", options: [{ text: "أ" }, { text: "ب" }], studentAnswer: null, expectedAnswer: { correctOptionIndex: 0 }, autoGrade: { questionId: id, score: 0, maxMarks: 2, countedMaxMarks: 2, correct: false, manualReview: false }, manualScore: null, teacherComment: "", ...over });
const body = (att: Record<string, unknown>, questions: unknown[]) => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 6 }, student: { studentId: "s1", studentName: "أحمد", studentCode: "S1" }, attempt: att, attempts: [att], questions });

function mount(get: () => unknown) {
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init && init.method) || "GET";
    if (url.includes("/api/assignment-review") && method === "GET") return Promise.resolve({ status: 200, ok: true, json: async () => get() } as Response);
    return Promise.resolve({ status: 404, ok: false, json: async () => ({ ok: false }) } as Response);
  }) as unknown as typeof fetch;
  return render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
}


describe("the exam page's counting helpers", () => {
  it("bump adds one opening per call, bounded, without changing its input", () => {
    const a = {};
    const b = bumpToolUsage(a, "calculator");
    expect(a).toEqual({});
    expect(bumpToolUsage(b, "calculator")).toEqual({ calculator: 2 });
    expect(bumpToolUsage({ calculator: TOOL_USAGE_MAX_OPENS }, "calculator")).toEqual({ calculator: TOOL_USAGE_MAX_OPENS });
    expect(Object.prototype.hasOwnProperty.call(bumpToolUsage({}, "__proto__"), "__proto__")).toBe(true);
  });
  it("the server's counts are read strictly, and the larger count wins", () => {
    expect(serverToolUsage({ calculator: 3, scratchPad: 0, x: "2", y: 1.5 })).toEqual({ calculator: 3 });
    for (const bad of [null, [], "x", 3, undefined]) expect(serverToolUsage(bad)).toEqual({});
    expect(maxToolUsage({ calculator: 2, scratchPad: 5 }, { calculator: 4, scratchPad: 1 })).toEqual({ calculator: 4, scratchPad: 5 });
  });
  it("the request field is absent while nothing was opened", () => {
    expect(toolUsageRequestField({})).toEqual({});
    expect(toolUsageRequestField({ calculator: 1 })).toEqual({ toolUsage: { calculator: 1 } });
  });
});

describe("the teacher's line", () => {
  it("counts read naturally in Arabic", () => {
    expect([1, 2, 3, 10, 11, 25].map(opensLabel)).toEqual(["مرة واحدة", "مرتان", "3 مرات", "10 مرات", "11 مرة", "25 مرة"]);
  });
  it("names each known tool with its count; unknown tools and malformed entries are left out", () => {
    expect(toolUsageSummaryText([{ toolId: "calculator", opens: 3 }, { toolId: "scratchPad", opens: 1 }, { toolId: "nope", opens: 2 }, { toolId: "asciiTable", opens: 0 }, null]))
      .toBe("آلة حاسبة (3 مرات)، ورقة مسودة (مرة واحدة)");
    expect(toolUsageSummaryText(undefined)).toBe("");
    expect(toolUsageSummaryText({ calculator: 1 })).toBe("");
  });
  it("the review summary shows the tools the student opened", async () => {
    mount(() => body(attempt({ manualReviewMarks: 0, finalized: true, gradingStatus: "final", toolUsage: [{ toolId: "calculator", opens: 2, firstSeenAt: "", lastSeenAt: "" }] }), [q("q1", 1, {})]));
    const line = await screen.findByTestId("rv-tool-usage");
    expect(line.textContent).toBe("آلة حاسبة (مرتان)");
    expect(line.parentElement!.textContent).toContain("أدوات استخدمها الطالب");
  });
  it("an attempt without the record shows nothing new", async () => {
    mount(() => body(attempt({ manualReviewMarks: 0, finalized: true, gradingStatus: "final" }), [q("q1", 1, {})]));
    await screen.findByText("س1");
    expect(screen.queryByTestId("rv-tool-usage")).toBeNull();
  });
});
