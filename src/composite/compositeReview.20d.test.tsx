// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
import AssignmentReview from "../AssignmentReview";
import CompositeReviewView from "./CompositeReviewView";
import { compositeArabicExam, compositePhysicsExam, ARABIC_PASSAGE } from "./compositeFixtures";

// Phase 20D — the teacher composite review tree (CompositeReviewView) and its integration in AssignmentReview: the shared context is shown
// ONCE, every part of every group is rendered under its child key, an ignored (first-N excess) part cannot be overridden, and the per-part
// overrides (a score for an ordinary part, rubric selections for an open-response part) travel in the saveReview payload under the CHILD
// keys — never as a whole-question override — and drive the provisional total.
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

type Json = Record<string, unknown>;
const root = () => (compositeArabicExam().sections[0].questions[0] as unknown as { composite: { contexts: Json[]; groups: { id: string; parts: Json[] }[] } }).composite;
const SCORES: Record<string, number> = { pA1: 2, pA2: 3, pA3: 2, pA4: 3, pB1: 2, pB2: 2, pB3: 0, pC1: 0 };
function partGrade(p: Json, groupId: string) {
  const id = String(p.id), marks = Number(p.marks);
  if (id === "pB3") return { partId: id, groupId, label: p.label, type: p.type, score: 0, maxMarks: marks, countedMaxMarks: 0, correct: false, manualReview: false, ignored: true, counted: false };
  return { partId: id, groupId, label: p.label, type: p.type, score: SCORES[id], maxMarks: marks, countedMaxMarks: marks, correct: id !== "pC1", manualReview: id === "pC1", ignored: false, counted: true };
}
function reviewQuestion() {
  const c = root();
  const parts: Json[] = [], grades: Json[] = [];
  for (const g of c.groups) for (const p of g.parts) {
    const { contextId, ...rest } = p, ag = partGrade(p, g.id);
    grades.push(ag);
    parts.push({ partId: p.id, groupId: g.id, childKey: "q4::part::" + p.id, label: p.label, type: p.type, questionTypeVersion: p.questionTypeVersion, marks: p.marks, text: p.text, contextId,
      node: { ...rest, presentationType: p.type }, studentAnswer: p.id === "pC1" ? { kind: "text", value: "نغلق الصنبور ونعيد استخدام الماء." } : null, expectedAnswer: p.answer ?? null,
      autoGrade: ag, manualScore: null, teacherComment: "", ...(p.type === "openResponse" ? { rubricReview: null } : {}) });
  }
  const ctx = c.contexts[0];
  return {
    questionId: "q4", questionNumber: 4, text: "اقرأ النص", marks: 20, type: "composite", studentAnswer: { kind: "composite", parts: {}, contexts: {} }, expectedAnswer: null,
    autoGrade: { questionId: "q4", score: 14, maxMarks: 20, manualReview: true, parts: grades, composite: { v: 1, groups: [{ id: "gA", gradingPolicy: "all", maxMarks: 10, partIds: ["pA1", "pA2", "pA3", "pA4"] }, { id: "gB", gradingPolicy: "firstNAnswered", maxMarks: 4, partIds: ["pB1", "pB2", "pB3"] }, { id: "gC", gradingPolicy: "all", maxMarks: 6, partIds: ["pC1"] }] } },
    manualScore: null, teacherComment: "", composite: c,
    compositeReview: { valid: true, contexts: [{ id: ctx.id, kind: "source", title: ctx.title, sources: ctx.sources }], parts }
  };
}

describe("20D-UI4b CompositeReviewView tree", () => {
  it("renders the shared source ONCE, every group and every part under its child key, with type labels and counted state", () => {
    const { container } = render(<CompositeReviewView question={reviewQuestion()} overrides={{}} onOverride={() => {}} />);
    expect(container.querySelector('.cmp-review[dir="rtl"]')).toBeTruthy();
    expect(container.querySelectorAll(".cmp-review-context")).toHaveLength(1);
    expect((container.textContent || "").split(ARABIC_PASSAGE).length - 1).toBe(1);
    expect(container.querySelectorAll(".cmp-review-group")).toHaveLength(3);
    const keys = [...container.querySelectorAll(".cmp-review-part")].map(e => e.getAttribute("data-child-key"));
    expect(keys).toEqual(["pA1", "pA2", "pA3", "pA4", "pB1", "pB2", "pB3", "pC1"].map(id => "q4::part::" + id));
    expect(container.querySelector('[data-child-key="q4::part::pB3"]')!.textContent).toContain("غير محتسب");
    expect(container.querySelector('[data-child-key="q4::part::pA1"]')!.textContent).not.toContain("غير محتسب");
    expect(container.textContent).toMatch(/أجب عن 2 من 3/);
    expect(container.innerHTML).not.toMatch(/<script/i);
  });
  it("an ignored part's override inputs are disabled; a counted part's are enabled and bounded by its counted maximum", () => {
    const onOverride = vi.fn();
    const { container } = render(<CompositeReviewView question={reviewQuestion()} overrides={{ "q4::part::pA2": { score: 1, comment: "x" } }} onOverride={onOverride} />);
    const ign = container.querySelector('[data-child-key="q4::part::pB3"]')!;
    expect((ign.querySelector('input[type="number"]') as HTMLInputElement).disabled).toBe(true);
    expect((ign.querySelector("textarea") as HTMLTextAreaElement).disabled).toBe(true);
    const a2 = container.querySelector('[data-child-key="q4::part::pA2"] input[type="number"]') as HTMLInputElement;
    expect(a2.disabled).toBe(false);
    expect(a2.max).toBe("3");
    expect(a2.value).toBe("1");
    fireEvent.change(container.querySelector('[data-child-key="q4::part::pA2"] textarea')!, { target: { value: "جيد" } });
    expect(onOverride).toHaveBeenLastCalledWith("q4::part::pA2", { score: 1, comment: "جيد" });
  });
  it("a shared SmartSim context is shown ONCE (answered note); each linked part shows only its own server check facts", async () => {
    const c = (compositePhysicsExam().sections[0].questions[0] as unknown as { composite: { contexts: Json[]; groups: { id: string; parts: Json[] }[] } }).composite;
    const parts = c.groups.flatMap(g => g.parts.map(p => ({ partId: p.id, groupId: g.id, childKey: "phys1::part::" + p.id, label: p.label, type: p.type, marks: p.marks, contextId: p.contextId, node: { ...p, presentationType: p.type }, studentAnswer: null, expectedAnswer: p.answer,
      autoGrade: { partId: p.id, score: 0, maxMarks: p.marks, countedMaxMarks: p.marks, manualReview: false, ignored: false, counted: true },
      ...(p.type === "smartSim" ? { smartSimReview: { valid: true, score: 0, maxMarks: p.marks, totalWeight: 1, passedWeight: 0, manualReview: false, checks: [{ id: "c-" + p.id, label: "فحص " + p.id, expected: "1", actual: "—", passed: false, weight: 1, points: 0, maxPoints: p.marks }] } } : {}) })));
    const question = { questionId: "phys1", questionNumber: 1, marks: 18, type: "composite", composite: c, compositeReview: { valid: true, contexts: [{ id: "ctxSim", kind: "smartSim", title: "محاكاة السقوط الحر", smartSim: c.contexts[0].smartSim, studentAnswer: null, review: { valid: true, answered: false } }], parts } };
    const { container } = render(<CompositeReviewView question={question} overrides={{}} onOverride={() => {}} />);
    await waitFor(() => expect(container.querySelectorAll('[data-testid="smartsim-review"]')).toHaveLength(5));
    expect(container.querySelectorAll(".cmp-review-context")).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="cmp-review-context-answered"]')).toHaveLength(1);
    expect(container.querySelector('[data-child-key="phys1::part::s2"] [data-testid="smartsim-check"]')!.textContent).toContain("فحص s2");
    expect(container.querySelectorAll('[data-child-key="phys1::part::s2"] [data-testid="smartsim-check"]')).toHaveLength(1);
  });
});

describe("20D-UI4c AssignmentReview composite integration", () => {
  it("sends a part score and an open-response rubric award under the CHILD keys and counts them in the provisional total", async () => {
    let posted: Json | null = null;
    const attempt = { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 14, totalMarks: 20, percentage: 70, manualReviewMarks: 6, finalized: false, gradingStatus: "pendingReview", startedAt: "", endedAt: "", endReason: "submitted", timedOut: false };
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input), method = (init && init.method) || "GET";
      if (url.includes("/api/assignment-review") && method === "GET") return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 20 }, student: { studentId: "s1", studentName: "أ", studentCode: "S1" }, attempt: { ...attempt, teacherFeedback: "" }, attempts: [attempt], questions: [reviewQuestion()] }) } as Response);
      if (url.includes("/api/assignment-review")) { posted = JSON.parse(String(init!.body)); return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true, result: { finalized: true, score: 19.5, totalMarks: 20, percentage: 97.5, manualReviewMarks: 0 } }) } as Response); }
      return Promise.resolve({ status: 404, ok: false, json: async () => ({ ok: false }) } as Response);
    }) as unknown as typeof fetch;
    const { container } = render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(container.querySelector('[data-child-key="q4::part::pA1"] input[type="number"]')).toBeTruthy());
    const provisional = () => [...container.querySelectorAll(".review-summary > div")].find(d => d.querySelector("span")?.textContent === "بعد التعديل")!.querySelector("strong")!.textContent;
    expect(provisional()).toBe("14/20");                                                              // provisional = stored total before any change
    fireEvent.change(container.querySelector('[data-child-key="q4::part::pA1"] input[type="number"]')!, { target: { value: "1.5" } });
    await waitFor(() => expect(container.querySelectorAll('[data-child-key="q4::part::pC1"] input[type="radio"]').length).toBe(5));
    const radios = container.querySelectorAll('[data-child-key="q4::part::pC1"] input[type="radio"]');
    fireEvent.click(radios[0]);                                                                       // ideas → "two" (4 points)
    fireEvent.click(radios[3]);                                                                       // reason → "full" (2 points)
    expect(provisional()).toBe("19.5/20");                                                            // (10 − 0.5) + 4 + 6
    fireEvent.click(screen.getByText(/حفظ واعتماد التصحيح/));
    await waitFor(() => expect(posted).not.toBeNull());
    const overrides = (posted as unknown as { action: string; overrides: Record<string, unknown> }).overrides;
    expect((posted as unknown as { action: string }).action).toBe("saveReview");
    expect(overrides).toEqual({ "q4::part::pA1": { score: 1.5, comment: "" }, "q4::part::pC1": { rubricAwards: { ideas: { levelId: "two" }, reason: { levelId: "full" } }, comment: "" } });
  });
  it("never sends an override for an UNCOUNTED part, even when a score is stored on it (the server would refuse the whole save)", async () => {
    let posted: Json | null = null;
    const q = reviewQuestion();
    const pB3 = (q.compositeReview.parts as Json[]).find(p => p.partId === "pB3")!;
    pB3.manualScore = 1; pB3.teacherComment = "قديم";                                              // a stored value on an ignored part (legacy / inconsistent record)
    const attempt = { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 14, totalMarks: 20, percentage: 70, manualReviewMarks: 6, finalized: false, gradingStatus: "pendingReview", startedAt: "", endedAt: "", endReason: "submitted", timedOut: false };
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input), method = (init && init.method) || "GET";
      if (url.includes("/api/assignment-review") && method === "GET") return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 20 }, student: { studentId: "s1", studentName: "أ", studentCode: "S1" }, attempt: { ...attempt, teacherFeedback: "" }, attempts: [attempt], questions: [q] }) } as Response);
      if (url.includes("/api/assignment-review")) { posted = JSON.parse(String(init!.body)); return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true, result: { finalized: false, score: 15, totalMarks: 20, percentage: 75, manualReviewMarks: 6 } }) } as Response); }
      return Promise.resolve({ status: 404, ok: false, json: async () => ({ ok: false }) } as Response);
    }) as unknown as typeof fetch;
    const { container } = render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(container.querySelector('[data-child-key="q4::part::pA1"] input[type="number"]')).toBeTruthy());
    fireEvent.change(container.querySelector('[data-child-key="q4::part::pA1"] input[type="number"]')!, { target: { value: "1" } });
    fireEvent.click(screen.getByText(/حفظ واعتماد التصحيح/));
    await waitFor(() => expect(posted).not.toBeNull());
    const overrides = (posted as unknown as { overrides: Record<string, unknown> }).overrides;
    expect(Object.keys(overrides)).toEqual(["q4::part::pA1"]);
  });
});
