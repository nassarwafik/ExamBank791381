// @vitest-environment happy-dom
// Learning Practice — the STUDENT host end to end through the portal: the Reader reads the trainings list with the
// student session headers, T02 opens the shared runner, the graded submission marks Strength as stale, and leaving
// the Reader reloads the dashboard ONCE (never per page, never when nothing was submitted).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import StudentPortal from "./StudentPortal";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const SLOW = { timeout: 8000 }, T = 30000;
const M01 = "791381-m01", M02 = "791381-m02", P08 = "791381-m02-l01-p08";
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const student = { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true };
const classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" };
const stats = { assigned: 0, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null };
const materials = { ok: true, materials: [{ courseId: "791381", title: "شبكات الاتصال", modules: [{ moduleId: M01, title: "أساسيات الشبكات", order: 1 }, { moduleId: M02, title: "الأعداد والموازين", order: 2 }] }] };
const questions = Array.from({ length: 10 }, (_, i) => ({ examQuestionId: `LIB-T02-Q${String(i + 1).padStart(2, "0")}`, presentationType: "multipleChoice", marks: 10, text: `سؤال ${i + 1}`, options: [{ value: "0", text: "أ" }, { value: "1", text: "ب" }], answer: {}, hint: "" }));
const listBody = { ok: true, actor: "student", trainings: [
  { trainingId: "T01", order: 1, label: "تدريب 1", requiredModuleId: M01, courseId: "791381", available: true, title: "أساسيات الشبكات" },
  { trainingId: "T02", order: 2, label: "تدريب 2", requiredModuleId: M02, courseId: "791381", available: true, title: "أنظمة العد" },
  { trainingId: "T03", order: 3, label: "تدريب 3", requiredModuleId: "791381-m07", courseId: "791381", available: false },
  { trainingId: "T04", order: 4, label: "تدريب 4", requiredModuleId: "791381-m07", courseId: "791381", available: false },
] };

function mount() {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  let strength = { totalPoints: 0, examPoints: 0, practicePoints: 0, projectPoints: 0, tier: null, level: 0, nextTier: "beginner", levelBlockSize: 400, withinLevelPoints: 0, nextLevelRemaining: 400, percent: 0, projects: [] };
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    calls.push({ url: url.replace(/\?.*$/, ""), method, headers: (init?.headers || {}) as Record<string, string>, body: init?.body as string | undefined });
    if (url.includes("/api/student-dashboard")) return res(200, { student, classroom, assignments: [], stats, strength });
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false, projects: [] });
    if (url.includes("/api/student-learning-materials")) return res(200, materials);
    if (url === "/api/learning-training") return res(200, listBody);
    if (url === "/api/learning-training/T02") return res(200, { ok: true, actor: "student", training: { ...listBody.trainings[1], questionCount: 10, totalMarks: 100, maxPoints: 25 }, exam: { questions } });
    if (url === "/api/learning-training/T02/submit") {
      strength = { ...strength, totalPoints: 25, practicePoints: 25, withinLevelPoints: 25, nextLevelRemaining: 375, percent: 6 };
      return res(200, { ok: true, actor: "student", persisted: true, result: { correctCount: 10, questionCount: 10, score: 100, totalMarks: 100, percentage: 100, review: questions.map((q, i) => ({ questionId: q.examQuestionId, questionNumber: i + 1, correct: true, chosenIndex: 0, correctOptionIndex: 0, hint: "" })) }, practice: { bestPercentage: 100, bestPoints: 25, maxPoints: 25, attempts: 1, lastCompletedAt: null, improved: true, pointsGained: 25, earnedPoints: 25 } });
    }
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
  render(<StudentPortal token="tok-1" displayName="أحمد" onLogout={vi.fn()} />);
  return { calls, dashboardGets: () => calls.filter(c => c.method === "GET" && c.url === "/api/student-dashboard").length };
}
async function openReader() {
  const s = await screen.findByRole("region", { name: "موادي التعليمية" });
  const card = await within(s).findByRole("article", { name: "شبكات الاتصال" });
  fireEvent.click(within(card).getByRole("button", { name: "فتح المادة" }));
  await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
}
const jump = () => screen.getByLabelText("انتقل إلى صفحة") as HTMLSelectElement;

describe("Student portal — Learning Practice through the Reader", () => {
  it("lists trainings with the student headers, solves T02 in the shared runner, returns to PDF 22 and reloads Strength once on exit", async () => {
    const { calls, dashboardGets } = mount();
    await openReader();
    await waitFor(() => expect(calls.filter(c => c.url === "/api/learning-training").length).toBe(1));
    const list = calls.find(c => c.url === "/api/learning-training")!;
    expect(list.headers["x-student-token"]).toBe("tok-1");
    expect(list.headers.Authorization).toBe("Bearer tok-1");
    fireEvent.change(jump(), { target: { value: P08 } });
    await screen.findByRole("heading", { level: 2, name: "تدريبات قصيرة" }, SLOW);
    const t2 = await screen.findByRole("region", { name: "تدريب 2" }, SLOW);
    fireEvent.click(within(t2).getByRole("button", { name: "ابدأ التدريب" }));
    await screen.findByRole("heading", { level: 2, name: "أنظمة العد" }, SLOW);
    for (const q of questions) fireEvent.click(within(screen.getByText(q.text).closest(".iex-q") as HTMLElement).getAllByRole("radio")[0]);
    fireEvent.click(screen.getByRole("button", { name: "أرسل الإجابات" }));
    await screen.findByText("مراجعة الإجابات", {}, SLOW);
    const submit = calls.find(c => c.url === "/api/learning-training/T02/submit")!;
    expect(submit.method).toBe("POST");
    expect(submit.headers["x-student-token"]).toBe("tok-1");
    expect(Object.keys(JSON.parse(submit.body!))).toEqual(["answers"]);                 // only answers leave the browser
    expect(dashboardGets()).toBe(1);                                                    // nothing reloaded yet
    fireEvent.click(screen.getAllByRole("button", { name: "العودة إلى الصفحة" })[0]);
    await screen.findByRole("heading", { level: 2, name: "تدريبات قصيرة" }, SLOW);
    expect(jump().value).toBe(P08);                                                     // the SAME page
    expect(dashboardGets()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى موادي التعليمية" }));
    await screen.findByRole("region", { name: "موادي التعليمية" });
    await waitFor(() => expect(dashboardGets()).toBe(2));                               // ONE Strength reload on exit
    expect((await screen.findByText(/نقاط القوة:/)).textContent).toContain("25");
  }, T);

  it("leaving the Reader without submitting does NOT reload the dashboard", async () => {
    const { dashboardGets } = mount();
    await openReader();
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى موادي التعليمية" }));
    await screen.findByRole("region", { name: "موادي التعليمية" });
    expect(dashboardGets()).toBe(1);
  }, T);
});
