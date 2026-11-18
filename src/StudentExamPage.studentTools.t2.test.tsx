// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";

// Phase T2 — the student tools inside the REAL exam page (mocked fetch, same lifecycle as StudentExamPage.untimed.test.tsx):
// the start screen announces the allowed tools, the tool bar appears only in a writable attempt of an exam that allows tools, follows
// the current section, and disappears once the attempt is submitted.

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
let subState: unknown = base, tools: unknown = TOOLS;
beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  subState = base; tools = TOOLS;
  (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") return json(200, { ok: true, state: subState });
      const b = init && init.body ? JSON.parse(String(init.body)) : {};
      if (b.action === "startAttempt") { subState = started; return json(200, { ok: true, state: started }); }
      if (b.action === "submit") { subState = submitted; return json(200, { ok: true, result, state: submitted }); }
      return json(200, { ok: true, savedAt: START, serverNow: START, effectiveAttemptEndsAt: "", state: subState });
    }
    if (url.includes("/api/student-assignment/")) return json(200, { ok: true, assignment: assignment(tools, true) });
    return json(404, { ok: false });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mount = (a: unknown) => render(<StudentExamPage token="t" assignment={a as never} studentName="أحمد" className="الحادي عشر" onBack={() => {}} onLogout={() => {}} />);

describe("T2 — student tools in the exam page", () => {
  it("the start screen announces the allowed tools, and no tool bar exists before the attempt starts", async () => {
    const r = mount(assignment(TOOLS, false));
    const notice = await r.findByTestId("tools-notice");
    expect(notice.textContent).toContain("آلة حاسبة علمية");
    expect(notice.textContent).toContain("حاسبة الشبكات IPv4");
    expect(r.queryByTestId("student-tools-button")).toBeNull();
  });

  it("a started attempt shows the tool bar, which follows the current section", async () => {
    subState = started;
    const r = mount(assignment(TOOLS, true));
    await r.findByText("السؤال الأول");
    fireEvent.click(await r.findByTestId("student-tools-button"));
    const names = () => within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getAllByRole("button").map(b => b.textContent);
    expect(names()).toEqual(["آلة حاسبة علمية", "حاسبة الشبكات IPv4"]);
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    await r.findByText("السؤال الثاني");
    expect(names()).toEqual(["حاسبة الشبكات IPv4"]);
  });

  it("the tool bar disappears once the attempt is submitted (no longer writable)", async () => {
    subState = started;
    const r = mount(assignment(TOOLS, true));
    await r.findByText("السؤال الأول");
    await r.findByTestId("student-tools-button");
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    await r.findByText("السؤال الثاني");
    fireEvent.click(await screen.findByRole("button", { name: "مراجعة الإجابات" }));
    expect(r.getByTestId("student-tools-button")).toBeTruthy();              // still writable while reviewing
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الامتحان" }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));
    await r.findByText(/تم تسليم المحاولة/);
    expect(r.queryByTestId("student-tools-button")).toBeNull();
  });

  it("an attempt that is shown but no longer writable (expired, canWrite false) offers no tool bar", async () => {
    subState = { ...started, canWrite: false, attemptExpired: true };
    const r = mount(assignment(TOOLS, true));
    await r.findByText("السؤال الأول");
    expect(r.queryByTestId("student-tools-button")).toBeNull();
  });

  it("T5: the start screen names the formula sheet but never shows its content", async () => {
    const withSheet = { version: 1, tools: [{ id: "formulaSheet", title: "قوانين الحركة", content: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "SHEET-BODY v = d / t" }] }] } }] };
    // the server's pre-start payload carries a placeholder (api test); even a payload that carried the body shows only the title here
    const r = mount(assignment(withSheet, false));
    const notice = await r.findByTestId("tools-notice");
    expect(notice.textContent).toContain("قوانين الحركة");
    expect(r.container.textContent).not.toContain("SHEET-BODY");
  });

  it("an exam without tools shows neither the notice nor the tool bar", async () => {
    tools = undefined;
    const pre = mount(assignment(undefined, false));
    await pre.findByRole("button", { name: "بدء المحاولة" });
    expect(pre.queryByTestId("tools-notice")).toBeNull();
    pre.unmount();
    subState = started;
    const r = mount(assignment(undefined, true));
    await r.findByText("السؤال الأول");
    expect(r.queryByTestId("student-tools-button")).toBeNull();
  });

  it("a malformed tools value never renders a tool bar or a notice", async () => {
    const bad = { ...TOOLS, answerKey: "x" };
    const pre = mount(assignment(bad, false));
    await pre.findByRole("button", { name: "بدء المحاولة" });
    expect(pre.queryByTestId("tools-notice")).toBeNull();
    pre.unmount();
    subState = started; tools = bad;
    const r = mount(assignment(bad, true));
    await r.findByText("السؤال الأول");
    expect(r.queryByTestId("student-tools-button")).toBeNull();
  });
});
