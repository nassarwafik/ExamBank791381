// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";

// Phase T8 — the attempt's count of tool openings inside the REAL exam page (mocked fetch, the T2 harness): every opening of a tool is
// counted, re-selecting the tool already open is not, the count rides on the submit (and saves) for the server to record, a reload resumes
// from the server's counts, and an attempt without tool use sends exactly the historical body.

const START = "2026-01-01T10:00:00.000Z";
const TOOLS = { version: 1, tools: [{ id: "calculator", variant: "scientific", angleUnit: "deg" }, { id: "ipv4Calculator", showBinary: false, allowSubnetting: false }], sectionOverrides: { s2: { disabled: ["calculator"] } } };
const base = {
  attemptsUsed: 0, allowedAttempts: 1, canAttempt: false, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "",
  durationMinutes: 0, timed: false, attemptModelVersion: 2, requiresStart: true, attemptStatus: "notStarted",
  serverNow: "2026-01-01T10:30:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false,
  canStartAttempt: true, canWrite: false, draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: []
};
const started = { ...base, activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: "", status: "started", lastSavedAt: "" }, canStartAttempt: false, canWrite: true, attemptStatus: "started" };
const result = { attemptNumber: 1, submittedAt: "2026-01-01T10:20:00.000Z", score: 2, totalMarks: 2, percentage: 100, manualReviewMarks: 0, finalized: true, timedOut: false, endReason: "submitted", startedAt: START, endedAt: "2026-01-01T10:20:00.000Z" };
const submitted = { ...base, attemptsUsed: 1, canStartAttempt: false, activeAttempt: null, latestResult: result, attempts: [result], attemptStatus: "submitted" };

const examBody = (tools: unknown) => ({
  title: "امتحان الشبكات", metadata: {}, presentationTheme: "classic", coverPage: { enabled: false }, ...(tools === undefined ? {} : { studentTools: tools }),
  sections: [
    { id: "s1", title: "القسم الأول", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "السؤال الأول", marks: 1 }] },
    { id: "s2", title: "القسم الثاني", gradingPolicy: "all", questions: [{ examQuestionId: "q2", presentationType: "shortAnswer", text: "السؤال الثاني", marks: 1 }] }
  ]
});
const assignment = (tools: unknown, full: boolean) => ({
  assignmentId: "a1", title: "واجب الشبكات", instructions: "", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0,
  requiresStart: !full, timed: false, marksDistribution: { rows: [], total: 2 },
  exam: full ? examBody(tools) : { title: "امتحان الشبكات", metadata: {}, presentationTheme: "classic", coverPage: { enabled: false }, ...(tools === undefined ? {} : { studentTools: tools }) }
});

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
let subState: unknown = base;
const posts: Record<string, unknown>[] = [];
beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  subState = base; posts.length = 0;
  (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") return json(200, { ok: true, state: subState });
      const b = init && init.body ? JSON.parse(String(init.body)) : {};
      posts.push(b);
      if (b.action === "startAttempt") { subState = started; return json(200, { ok: true, state: started }); }
      if (b.action === "submit") { subState = submitted; return json(200, { ok: true, result, state: submitted }); }
      return json(200, { ok: true, savedAt: START, serverNow: START, effectiveAttemptEndsAt: "", state: subState });
    }
    if (url.includes("/api/student-assignment/")) return json(200, { ok: true, assignment: assignment(TOOLS, true) });
    return json(404, { ok: false });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mount = (a: unknown) => render(<StudentExamPage token="t" assignment={a as never} studentName="أحمد" className="الحادي عشر" onBack={() => {}} onLogout={() => {}} />);
const openTool = async (name: string) => {
  fireEvent.click(await screen.findByTestId("student-tools-button"));
  fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name }));
};
const submitNow = async () => {
  fireEvent.click(screen.getByRole("button", { name: "التالي" }));
  await screen.findByText("السؤال الثاني");
  fireEvent.click(await screen.findByRole("button", { name: "مراجعة الإجابات" }));
  fireEvent.click(await screen.findByRole("button", { name: "تسليم الامتحان" }));
  fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));
  await screen.findByText(/تم تسليم المحاولة/);
  return posts.find(p => p.action === "submit")!;
};

describe("T8 — the attempt's tool usage in the exam page", () => {
  it("each opening counts; re-selecting the open tool does not; the submit carries the counts", async () => {
    subState = started;
    const r = mount(assignment(TOOLS, true));
    await r.findByText("السؤال الأول");
    await openTool("آلة حاسبة علمية");
    await openTool("آلة حاسبة علمية");                                      // already open: not a new opening
    fireEvent.click(screen.getByRole("button", { name: /^إغلاق/ }));
    await openTool("آلة حاسبة علمية");
    await openTool("حاسبة الشبكات IPv4");
    const submit = await submitNow();
    expect(submit.toolUsage).toEqual({ calculator: 2, ipv4Calculator: 1 });
  });

  it("an attempt without any opening sends no toolUsage field at all", async () => {
    subState = started;
    const r = mount(assignment(TOOLS, true));
    await r.findByText("السؤال الأول");
    const submit = await submitNow();
    expect(Object.keys(submit)).not.toContain("toolUsage");
    expect(posts.some(p => "toolUsage" in p)).toBe(false);
  });

  it("a reload resumes from the server's counts (never restarts them)", async () => {
    subState = { ...started, draftToolUsage: { calculator: 3 } };
    const r = mount(assignment(TOOLS, true));
    await r.findByText("السؤال الأول");
    await openTool("آلة حاسبة علمية");
    const submit = await submitNow();
    expect(submit.toolUsage).toEqual({ calculator: 4 });
  });
});
