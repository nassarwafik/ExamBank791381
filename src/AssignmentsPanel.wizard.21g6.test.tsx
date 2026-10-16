// @vitest-environment happy-dom
//
// Phase 21G.6 — the creation wizard through the REAL AssignmentsPanel: one step at a time, one copy per chosen class (D4) — the
// SAME create request as before, once per class, in order — every class reported; a failed class stays chosen and a retry never
// creates a second copy where one already exists. The chosen content can be previewed (ExamPreview, secrets scrubbed).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";

const CLASSES = [
  { classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active" },
  { classId: "c2", name: "العاشر", grade: "10", active: true, status: "active" },
  { classId: "c3", name: "التاسع", grade: "9", active: true, status: "active" }
];
const SAVED = Array.from({ length: 7 }, (_, i) => ({ blobName: "exams/e" + i + ".json", examId: "e" + i, title: i === 3 ? "امتحان الكسور" : "امتحان رقم " + i, savedAt: "", questionCount: 4, totalMarks: 40 }));
const EXAM = { examId: "e3", title: "امتحان الكسور", totalMarks: 40, questions: ["س١", "س٢", "س٣", "س٤"].map((text, i) => ({ examQuestionId: "q" + i, text, marks: 10, presentationType: "open" })) };
let calls: { url: string; method: string; body: Record<string, unknown> }[] = [], failClass = new Set<string>();
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, headers: new Headers(), json: async () => body } as unknown as Response);
function routed(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input), method = (init?.method || "GET").toUpperCase(), body = init?.body ? JSON.parse(String(init.body)) : {};
  calls.push({ url, method, body });
  if (url === "/api/assignment-progress") return json({ ok: true, progress: [] });
  if (url.startsWith("/api/assignments") && method === "GET") return json({ ok: true, assignments: [] });
  if (url === "/api/assignments" && body.action === "create") {
    if (failClass.has(String(body.classId))) return json({ ok: false, error: "الصف غير موجود أو مؤرشف." }, 400);
    const c = CLASSES.find(x => x.classId === body.classId)!;
    return json({ ok: true, assignment: { assignmentId: "A-" + body.classId, classId: body.classId, className: c.name, title: body.title, instructions: "", status: "draft", openAt: body.openAt, dueAt: body.dueAt, questionCount: 4, totalMarks: 40, maxAttempts: 1 } });
  }
  if (url.startsWith("/api/saved-exams") && method === "GET") return json({ ok: true, exams: SAVED });
  if (url.startsWith("/api/saved-exams")) return json({ ok: true, exam: EXAM });
  return json({ ok: true });
}
beforeEach(() => { calls = []; failClass = new Set(); (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; globalThis.fetch = vi.fn(routed) as unknown as typeof fetch; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const creates = () => calls.filter(c => c.method === "POST" && c.body.action === "create").map(c => c.body.classId);
async function openWizard() {
  render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
  fireEvent.click(await screen.findByRole("button", { name: "إنشاء واجب" }));
  const w = await screen.findByRole("region", { name: "إنشاء واجب جديد" });
  await waitFor(() => expect(within(w).getAllByRole("option").length).toBeGreaterThan(1));
  return w;
}
const next = (w: HTMLElement) => fireEvent.click(within(w).getByRole("button", { name: "التالي" }));
async function chooseContent(w: HTMLElement) {
  fireEvent.change(within(w).getByLabelText("اختيار الامتحان"), { target: { value: "exams/e3.json" } });
  await within(w).findByText("4 سؤال · 40 علامة");
}

describe("21G.6 the creation wizard", () => {
  it("searches my exams, previews the chosen content and only moves on once the step is valid", async () => {
    const w = await openWizard();
    fireEvent.change(within(w).getByLabelText("بحث في امتحاناتي"), { target: { value: "الكسور" } });
    expect(within(within(w).getByLabelText("اختيار الامتحان")).getAllByRole("option").map(o => o.textContent)).toEqual(["اختر امتحانًا محفوظًا", "امتحان الكسور · 4 سؤال · 40 علامة"]);
    expect(within(w).getByRole("status", { name: "ما يمنع المتابعة" }).textContent).toContain("اختر محتوى الواجب");
    expect((within(w).getByRole("button", { name: /^4\s*المراجعة|المراجعة/ }) as HTMLButtonElement).disabled).toBe(true);   // no jumping ahead
    await chooseContent(w);
    fireEvent.click(within(w).getByRole("button", { name: "معاينة المحتوى" }));
    const preview = await waitFor(() => { const el = document.querySelector(".sb-preview-overlay"); if (!el) throw new Error("no preview"); return el as HTMLElement; });
    expect(preview.textContent).toContain("س١");
    fireEvent.click(within(preview).getByRole("button", { name: /إغلاق المعاينة/ }));
    expect((within(w).getByRole("button", { name: /المراجعة/ }) as HTMLButtonElement).disabled).toBe(false);          // every step valid → the review is reachable
  });

  it("creates one copy per chosen class with the same request; a failed class stays chosen and a retry adds only it", async () => {
    const w = await openWizard();
    await chooseContent(w);
    next(w);
    fireEvent.click(within(w).getByRole("checkbox", { name: "كل الصفوف" }));
    expect(within(w).getByText("سيُنشأ 3 نسخ من الواجب.")).toBeTruthy();
    fireEvent.click(within(w).getByRole("button", { name: /المراجعة/ }));
    expect(within(w).getByText("الحادي عشر، العاشر، التاسع (3 نسخ)")).toBeTruthy();
    failClass = new Set(["c2"]);
    fireEvent.click(within(w).getByRole("button", { name: "إنشاء الواجب (3 نسخ)" }));
    await waitFor(() => expect(creates()).toEqual(["c1", "c2", "c3"]));
    expect(await screen.findByText("✓ تم إنشاء نسختان من الواجب: الحادي عشر، التاسع.")).toBeTruthy();
    expect(screen.getByText(/تعذر إنشاء الواجب لـ العاشر \(الصف غير موجود أو مؤرشف\.\)\. الصفوف الأخرى أُنشئت/)).toBeTruthy();
    const wizard = screen.getByRole("region", { name: "إنشاء واجب جديد" });                            // still open, on the review
    expect(within(wizard).getByText("العاشر (نسخة واحدة)")).toBeTruthy();
    const bodies = calls.filter(c => c.body.action === "create").map(c => { const { classId, ...rest } = c.body; return JSON.stringify(rest) + "|" + classId; });
    expect(new Set(bodies.map(b => b.split("|")[0])).size).toBe(1);                                  // the same request for every class
    failClass = new Set();
    fireEvent.click(within(wizard).getByRole("button", { name: "إنشاء الواجب" }));
    await waitFor(() => expect(creates()).toEqual(["c1", "c2", "c3", "c2"]));                        // only the failed class again
    await waitFor(() => expect(screen.queryByRole("region", { name: "إنشاء واجب جديد" })).toBeNull()); // closed once all succeeded
  });

  it("goes back freely and never loses what was entered", async () => {
    const w = await openWizard();
    await chooseContent(w);
    fireEvent.change(within(w).getByLabelText("عنوان الواجب"), { target: { value: "واجب الأسبوع" } });
    next(w); next(w);
    fireEvent.change(within(w).getByLabelText("عدد المحاولات"), { target: { value: "3" } });
    fireEvent.click(within(w).getByRole("button", { name: "السابق" }));
    fireEvent.click(within(w).getByRole("button", { name: /المحتوى/ }));
    expect((within(w).getByLabelText("عنوان الواجب") as HTMLInputElement).value).toBe("واجب الأسبوع");
    fireEvent.click(within(w).getByRole("button", { name: /المراجعة/ }));
    expect(within(w).getByText("واجب الأسبوع")).toBeTruthy();
    expect(within(within(w).getByText("المحاولات").closest("div") as HTMLElement).getByText("3")).toBeTruthy();
  });
});
