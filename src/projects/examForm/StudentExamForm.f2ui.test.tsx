// @vitest-environment happy-dom
/// <reference types="node" />
// Phase F2-UI — the student's project exam form end to end over the REAL handlers (in-memory container): the card on the
// project page appears only after the teacher opened the form; the student types an answer and it is saved as they go;
// leaving and coming back resumes it; a submit names the missing required questions, then locks the form; a save from a
// page that missed another device's save keeps both; a closed form is a read-only record.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, renderHook, act, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import StudentProjectPanel from "../StudentProjectPanel";
import StudentExamForm from "./StudentExamForm";
import { useExamFormDraft, type SubmitOutcome } from "./useExamFormDraft";

const nodeRequire = createRequire(import.meta.url);
const { handler: studentTracker } = nodeRequire("../../../api/src/functions/student-project-tracker.js");
const { handler: studentForm } = nodeRequire("../../../api/src/functions/student-project-exam-form.js");
const { handler: tracker } = nodeRequire("../../../api/src/functions/project-tracker.js");
const { getExamFormTemplate, getStorageNamespace } = nodeRequire("../../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
type Question = { questionId: string; kind: string; required: boolean; prompt: string; minRows?: number; columns?: { id: string }[]; options?: { id: string }[]; justification?: boolean; left?: { id: string }[]; right?: { id: string }[]; items?: { id: string }[]; max?: number };
const CODE = "794589";
const NS = getStorageNamespace(CODE);
const NOW = "2026-11-14T00:00:00.000Z";
const QUESTIONS: Question[] = getExamFormTemplate(CODE).sections.flatMap((s: { questions: Question[] }) => s.questions);
const ANSWERABLE = QUESTIONS.filter(q => q.kind !== "image" && q.kind !== "file");
const user = (id: string, cid: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });
const room = (id: string, over: Body = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW, ...over });
function fullAnswer(q: Question): Body {
  switch (q.kind) {
    case "table": return { rows: Array.from({ length: q.minRows || 1 }, (_, i) => Object.fromEntries((q.columns || []).map(c => [c.id, c.id + i]))) };
    case "choice": return q.justification ? { optionId: q.options![0].id, justification: "لأن البوابة خارج الشبكة" } : { optionId: q.options![0].id };
    case "multiChoice": return { optionIds: [q.options![0].id] };
    case "matching": return { pairs: Object.fromEntries(q.left!.map((l, i) => [l.id, q.right![i % q.right!.length].id])) };
    case "ordering": return { order: q.items!.map(i => i.id) };
    case "scale": return { values: Object.fromEntries(q.items!.map(i => [i.id, q.max])) };
    case "checklist": return { checked: [q.items![0].id] };
    case "declaration": return { accepted: true };
    default: return { text: "جواب " + q.questionId };
  }
}

function server() {
  const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1") });
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const studentDeps = { ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) };
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const requests: { method: string; url: string; body?: Body }[] = [];
  const route = (url: string) => url.startsWith("/api/student-project-exam-form") ? (req: unknown) => studentForm(req, studentDeps)
    : url.startsWith("/api/student-project-tracker") ? (req: unknown) => studentTracker(req, studentDeps) : (req: unknown) => tracker(req, teacherDeps);
  const call = async (method: string, url: string, body?: Body) => {
    const r = await route(url)({ method, url: "https://x" + url, json: async () => body ?? {} });
    return r as { status: number; jsonBody: Body };
  };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    requests.push({ method, url, body });
    const r = await call(method, url, body);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  const teacher = (action: string) => call("POST", "/api/project-tracker", { projectCode: CODE, classId: "c1", action });
  const save = (answers: Body, baseRevision: number) => call("POST", "/api/student-project-exam-form", { projectCode: CODE, action: "saveDraft", baseRevision, answers });
  const doc = () => (ctx.has(NS.examFormAnswersName("c1", "s1")) ? ctx.getJson(NS.examFormAnswersName("c1", "s1")) : null) as { status: string; revision: number; answers: Record<string, Body> } | null;
  return { ctx, requests, teacher, save, doc };
}
const openForm = (onClose = () => {}) => render(<StudentExamForm token="st" projectCode={CODE} onClose={onClose} saveDelayMs={5} />);
const questionBox = (id: string) => document.querySelector('[data-question="' + id + '"]') as HTMLElement;
const goTo = (name: RegExp) => fireEvent.click(within(screen.getByRole("navigation", { name: "أقسام الاستمارة" })).getByRole("button", { name }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("F2-UI the form's card on the student's project page", () => {
  it("is not shown until the teacher opens the form, and the page makes no request to the form route", async () => {
    const s = server();
    render(<StudentProjectPanel token="st" />);
    await screen.findByRole("group", { name: "عرض المراحل" });
    expect(screen.queryByTestId("exam-form-card")).toBeNull();
    expect(s.requests.every(r => r.url.startsWith("/api/student-project-tracker"))).toBe(true);
  });

  it("shows the state and the counts, opens the form in place of the project, and comes back with fresh counts", async () => {
    const s = server();
    await s.teacher("examForm.open");
    render(<StudentProjectPanel token="st" />);
    const card = await screen.findByTestId("exam-form-card");
    expect(card.textContent).toContain("استمارة امتحان المشروع");
    expect(card.textContent).toContain("لم تبدأ");
    expect(card.textContent).toMatch(/أجبت عن\s*0\s*من\s*77/);
    expect(s.requests.some(r => r.url.startsWith("/api/student-project-exam-form"))).toBe(false);   // the card itself asks nothing

    fireEvent.click(within(card).getByRole("button", { name: "ابدأ الاستمارة" }));
    expect(await screen.findByRole("heading", { name: "استمارة امتحان المشروع" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "عرض المراحل" })).toBeNull();
    await s.save({ S01Q01: { text: "EcoResort" } }, 0);
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى المشروع" }));
    const again = await screen.findByTestId("exam-form-card");
    await waitFor(() => expect(again.textContent).toMatch(/أجبت عن\s*1\s*من\s*77/));
    expect(within(screen.getByTestId("exam-form-card")).getByRole("button", { name: "أكمل من حيث توقفت" })).toBeTruthy();
  });

  it("a submitted form shows «سُلّمت» and offers the read-only view", async () => {
    const s = server();
    await s.teacher("examForm.open");
    await s.save(Object.fromEntries(ANSWERABLE.map(q => [q.questionId, fullAnswer(q)])), 0);
    await (async () => { const r = await fetch("/api/student-project-exam-form", { method: "POST", body: JSON.stringify({ projectCode: CODE, action: "submit", baseRevision: 1 }) }); expect(r.status).toBe(200); })();
    render(<StudentProjectPanel token="st" />);
    const card = await screen.findByTestId("exam-form-card");
    expect(card.textContent).toContain("سُلّمت");
    expect(within(card).getByRole("button", { name: "عرض الاستمارة" })).toBeTruthy();
  });
});

describe("F2-UI the student fills the form", () => {
  it("opens on the first section, with the save state, the progress and no answer key in what the page received", async () => {
    const s = server();
    await s.teacher("examForm.open");
    openForm();
    expect((await screen.findByRole("heading", { name: /بطاقة المشروع/, level: 3 })).textContent).toBe("1. بطاقة المشروع");
    expect(screen.getByText("مسودة")).toBeTruthy();
    expect(screen.getByText(/أجبت عن 0 من 77/)).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "أقسام الاستمارة" })).getAllByRole("button")).toHaveLength(16);
    expect(screen.getByText(/15 سؤالًا تحتاج صورًا أو ملفات/)).toBeTruthy();
    expect(within(questionBox("S01Q04")).getByText(/هذا السؤال يحتاج صورة/)).toBeTruthy();
    expect(within(questionBox("S01Q04")).queryByRole("textbox")).toBeNull();
    const received = JSON.stringify(await (await fetch("/api/student-project-exam-form?projectCode=" + CODE)).json());
    expect(received).not.toContain("correctOption");
    expect(received).not.toContain('"answer"');
  });

  it("an answer is saved a moment after the student types it, and a later visit resumes it", async () => {
    const s = server();
    await s.teacher("examForm.open");
    const first = openForm();
    await screen.findByRole("heading", { name: /بطاقة المشروع/ });
    fireEvent.change(within(questionBox("S01Q01")).getByRole("textbox"), { target: { value: "EcoResort" } });
    await waitFor(() => expect(s.doc()?.answers.S01Q01).toEqual({ text: "EcoResort" }));
    const posts = s.requests.filter(r => r.method === "POST" && r.url.startsWith("/api/student-project-exam-form"));
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ projectCode: CODE, action: "saveDraft", baseRevision: 0, answers: { S01Q01: { text: "EcoResort" } } });
    await screen.findByText(/تم الحفظ/);
    await screen.findByText(/أجبت عن 1 من 77/);
    first.unmount();

    openForm();
    await screen.findByRole("heading", { name: /بطاقة المشروع/ });
    expect((within(questionBox("S01Q01")).getByRole("textbox") as HTMLInputElement).value).toBe("EcoResort");
  });

  it("resumes where the student stopped: the first section that still has a required question", async () => {
    const s = server();
    await s.teacher("examForm.open");
    const done = ANSWERABLE.filter(q => /^S0[123]/.test(q.questionId));           // sections 1 to 3 complete
    await s.save(Object.fromEntries(done.map(q => [q.questionId, fullAnswer(q)])), 0);
    openForm();
    expect((await screen.findByRole("heading", { level: 3 })).textContent).toBe("4. تخطيط العناوين و VLAN");
    const nav = within(screen.getByRole("navigation", { name: "أقسام الاستمارة" }));
    expect(nav.getByRole("button", { name: /بطاقة المشروع · مكتمل/ })).toBeTruthy();
    expect(nav.getByRole("button", { name: /تخطيط العناوين/ }).getAttribute("aria-current")).toBe("step");
    expect(nav.getByRole("button", { name: /تخطيط العناوين/ }).textContent).not.toContain("مكتمل");
  });

  it("leaving the form right after typing still saves the edit", async () => {
    const s = server();
    await s.teacher("examForm.open");
    const page = render(<StudentExamForm token="st" projectCode={CODE} onClose={() => {}} saveDelayMs={60000} />);   // the pause never elapses
    await screen.findByRole("heading", { name: /بطاقة المشروع/ });
    fireEvent.change(within(questionBox("S01Q01")).getByRole("textbox"), { target: { value: "قبل الخروج" } });
    expect(s.doc()).toBeNull();
    page.unmount();
    await waitFor(() => expect(s.doc()?.answers.S01Q01).toEqual({ text: "قبل الخروج" }));
  });

  it("several quick edits go out as one save; an edit made during a save is sent by the next one", async () => {
    const s = server();
    await s.teacher("examForm.open");
    openForm();
    await screen.findByRole("heading", { name: /بطاقة المشروع/ });
    const box = within(questionBox("S01Q01")).getByRole("textbox");
    fireEvent.change(box, { target: { value: "E" } });
    fireEvent.change(box, { target: { value: "Eco" } });
    fireEvent.change(within(questionBox("S01Q02")).getByRole("textbox"), { target: { value: "شبكة منتجع" } });
    await waitFor(() => expect(s.doc()?.answers).toEqual({ S01Q01: { text: "Eco" }, S01Q02: { text: "شبكة منتجع" } }));
    expect(s.doc()?.revision).toBe(1);
    fireEvent.change(box, { target: { value: "EcoResort" } });
    await waitFor(() => expect(s.doc()?.answers.S01Q01).toEqual({ text: "EcoResort" }));
    expect(s.doc()?.revision).toBe(2);
  });

  it("closed kinds: a choice, a multi-choice, a matching, a checklist and a table row are stored as chosen", async () => {
    const s = server();
    await s.teacher("examForm.open");
    openForm();
    await screen.findByRole("heading", { name: /بطاقة المشروع/ });
    goTo(/تخطيط العناوين/);
    fireEvent.click(within(questionBox("S04Q04")).getByRole("radio", { name: "254" }));
    fireEvent.click(within(questionBox("S04Q03")).getByRole("checkbox", { name: "10.0.0.0/8" }));
    await waitFor(() => expect(s.doc()?.answers.S04Q04).toEqual({ optionId: "o1" }));
    expect(s.doc()?.answers.S04Q03).toEqual({ optionIds: ["o1"] });
    goTo(/الطوبولوجيا/);
    fireEvent.change(within(questionBox("S06Q04")).getByLabelText("ربط حاسوب بسويتش"), { target: { value: "r2" } });
    await waitFor(() => expect(s.doc()?.answers.S06Q04).toEqual({ pairs: { l1: "r2" } }));
    goTo(/المقترح والخلفية/);
    fireEvent.change(within(questionBox("S02Q03")).getByLabelText("الهدف — الصف 1"), { target: { value: "ربط الفروع" } });
    await waitFor(() => expect(s.doc()?.answers.S02Q03).toEqual({ rows: [{ goal: "ربط الفروع", where: "" }] }));
  });

  it("another device saved meanwhile: this page's edit and the other device's answer are both kept", async () => {
    const s = server();
    await s.teacher("examForm.open");
    openForm();
    await screen.findByRole("heading", { name: /بطاقة المشروع/ });
    await s.save({ S01Q03: { text: "من الهاتف" } }, 0);                        // another device, after this page loaded
    fireEvent.change(within(questionBox("S01Q01")).getByRole("textbox"), { target: { value: "من الحاسوب" } });
    await waitFor(() => expect(s.doc()?.answers).toEqual({ S01Q03: { text: "من الهاتف" }, S01Q01: { text: "من الحاسوب" } }));
    await waitFor(() => expect((within(questionBox("S01Q03")).getByRole("textbox") as HTMLInputElement).value).toBe("من الهاتف"));
    expect((within(questionBox("S01Q01")).getByRole("textbox") as HTMLInputElement).value).toBe("من الحاسوب");
  });

  it("a failed request keeps the edit pending and the retry button sends it", async () => {
    const s = server();
    await s.teacher("examForm.open");
    openForm();
    await screen.findByRole("heading", { name: /بطاقة المشروع/ });
    const real = globalThis.fetch;
    let failures = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method || "GET") === "POST" && failures < 4) { failures += 1; return { ok: false, status: 503, json: async () => ({ ok: false, error: "حدث تعارض مؤقت أثناء الحفظ. حاول مرة أخرى." }) } as Response; }
      return real(input, init);
    }) as unknown as typeof fetch;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fireEvent.change(within(questionBox("S01Q01")).getByRole("textbox"), { target: { value: "EcoResort" } });
      await vi.advanceTimersByTimeAsync(8000);
    } finally { vi.useRealTimers(); }
    await screen.findByText("تعذر حفظ التغييرات");
    expect(s.doc()).toBeNull();
    expect(failures).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: "إعادة محاولة الحفظ" }));
    await waitFor(() => expect(s.doc()?.answers.S01Q01).toEqual({ text: "EcoResort" }));
    await screen.findByText(/تم الحفظ/);
  });
});

describe("F2-UI submitting", () => {
  it("an incomplete form is not submitted: the missing sections are listed and lead to the question", async () => {
    const s = server();
    await s.teacher("examForm.open");
    await s.save({ S01Q01: { text: "EcoResort" } }, 0);
    openForm();
    await screen.findByRole("heading", { name: /بطاقة المشروع/ });
    goTo(/المرفقات والتسليم/);
    fireEvent.click(screen.getByRole("button", { name: "تسليم الاستمارة" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("أكمل الأسئلة الإلزامية قبل التسليم");
    expect(screen.queryByRole("dialog")).toBeNull();                            // no confirmation for a form that cannot be submitted
    fireEvent.click(within(alert).getByRole("button", { name: /بطاقة المشروع/ }));
    expect(within(questionBox("S01Q02")).getByText("هذا السؤال إلزامي ولم يكتمل بعد.")).toBeTruthy();
    expect(within(questionBox("S01Q01")).queryByText("هذا السؤال إلزامي ولم يكتمل بعد.")).toBeNull();
    expect(s.doc()?.status).toBe("draft");
  });

  it("an edit made just before «تسليم» is counted: the missing list is of the answers as they are now, with no confirmation", async () => {
    const s = server();
    await s.teacher("examForm.open");
    const all = Object.fromEntries(ANSWERABLE.map(q => [q.questionId, fullAnswer(q)]));
    await s.save(all, 0);                                                       // complete
    render(<StudentExamForm token="st" projectCode={CODE} onClose={() => {}} saveDelayMs={60000} />);   // the pause never elapses
    await screen.findByRole("heading", { name: /بطاقة المشروع/ });
    fireEvent.change(within(questionBox("S01Q01")).getByRole("textbox"), { target: { value: "" } });   // now one required answer is empty
    goTo(/المرفقات والتسليم/);
    fireEvent.click(screen.getByRole("button", { name: "تسليم الاستمارة" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("أكمل الأسئلة الإلزامية قبل التسليم (1)");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(s.doc()?.status).toBe("draft");
    expect(s.doc()?.answers.S01Q01).toBeUndefined();
  });

  it("a complete form asks once, is submitted, and becomes a read-only record", async () => {
    const s = server();
    await s.teacher("examForm.open");
    await s.save(Object.fromEntries(ANSWERABLE.map(q => [q.questionId, fullAnswer(q)])), 0);
    openForm();
    await screen.findByRole("heading", { name: /بطاقة المشروع/ });               // nothing missing → opens on the first section
    goTo(/المرفقات والتسليم/);
    fireEvent.click(screen.getByRole("button", { name: "تسليم الاستمارة" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("بعد التسليم لا يمكنك تعديل إجاباتك");
    expect(s.doc()?.status).toBe("draft");
    fireEvent.click(within(dialog).getByRole("button", { name: "تسليم" }));
    await waitFor(() => expect(s.doc()?.status).toBe("submitted"));
    expect((await screen.findByTestId("exam-form-locked")).textContent).toContain("سلّمت هذه الاستمارة");
    expect(screen.getByText("سُلّمت")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "تسليم الاستمارة" })).toBeNull();
    goTo(/بطاقة المشروع/);
    expect((within(questionBox("S01Q01")).getByRole("textbox") as HTMLInputElement).disabled).toBe(true);
  });

  it("an edit made just before submitting is saved first, then the form is submitted with it", async () => {
    const s = server();
    await s.teacher("examForm.open");
    await s.save(Object.fromEntries(ANSWERABLE.map(q => [q.questionId, fullAnswer(q)])), 0);
    render(<StudentExamForm token="st" projectCode={CODE} onClose={() => {}} saveDelayMs={60000} />);   // the pause never elapses
    await screen.findByRole("heading", { name: /بطاقة المشروع/ });
    fireEvent.change(within(questionBox("S01Q01")).getByRole("textbox"), { target: { value: "آخر تعديل" } });
    goTo(/المرفقات والتسليم/);
    fireEvent.click(screen.getByRole("button", { name: "تسليم الاستمارة" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "تسليم" }));
    await waitFor(() => expect(s.doc()?.status).toBe("submitted"));
    expect(s.doc()?.answers.S01Q01).toEqual({ text: "آخر تعديل" });
  });

  it("the draft's own submit saves a pending edit first, whoever calls it", async () => {
    const s = server();
    await s.teacher("examForm.open");
    await s.save(Object.fromEntries(ANSWERABLE.map(q => [q.questionId, fullAnswer(q)])), 0);
    const { result } = renderHook(() => useExamFormDraft("st", CODE, 60000));    // the pause never elapses
    await waitFor(() => expect(result.current.view).not.toBeNull());
    act(() => result.current.setAnswer("S01Q01", { text: "آخر تعديل" }));
    expect(s.doc()?.revision).toBe(1);                                          // not saved yet
    let outcome: SubmitOutcome | null = null;
    await act(async () => { outcome = await result.current.submit(); });
    expect(outcome).toEqual({ ok: true });
    expect(s.doc()?.status).toBe("submitted");
    expect(s.doc()?.answers.S01Q01).toEqual({ text: "آخر تعديل" });
  });

  it("cancelling the confirmation submits nothing", async () => {
    const s = server();
    await s.teacher("examForm.open");
    await s.save(Object.fromEntries(ANSWERABLE.map(q => [q.questionId, fullAnswer(q)])), 0);
    openForm();
    await screen.findByRole("heading", { name: /بطاقة المشروع/ });
    goTo(/المرفقات والتسليم/);
    fireEvent.click(screen.getByRole("button", { name: "تسليم الاستمارة" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.doc()?.status).toBe("draft");
  });
});

describe("F2-UI a form the student cannot write", () => {
  it("a form the teacher closed is a read-only record of the saved answers", async () => {
    const s = server();
    await s.teacher("examForm.open");
    await s.save({ S01Q01: { text: "قبل الإغلاق" } }, 0);
    await s.teacher("examForm.close");
    openForm();
    expect((await screen.findByTestId("exam-form-locked")).textContent).toContain("أغلق المعلم الاستمارة");
    const box = within(questionBox("S01Q01")).getByRole("textbox") as HTMLInputElement;
    expect(box.value).toBe("قبل الإغلاق");
    expect(box.disabled).toBe(true);
    expect(screen.queryByText(/تم الحفظ/)).toBeNull();
  });

  it("the teacher closes the form while the student is typing: the edit is refused, the reason is shown, nothing is lost", async () => {
    const s = server();
    await s.teacher("examForm.open");
    await s.save({ S01Q01: { text: "محفوظ" } }, 0);
    openForm();
    await screen.findByRole("heading", { name: /بطاقة المشروع/ });
    await s.teacher("examForm.close");
    fireEvent.change(within(questionBox("S01Q02")).getByRole("textbox"), { target: { value: "بعد الإغلاق" } });
    expect((await screen.findByTestId("exam-form-locked")).textContent).toContain("أغلق المعلم الاستمارة");
    expect(s.doc()?.answers).toEqual({ S01Q01: { text: "محفوظ" } });
    expect((within(questionBox("S01Q01")).getByRole("textbox") as HTMLInputElement).value).toBe("محفوظ");
  });

  it("a form that was never opened says so and offers the way back", async () => {
    server();
    const onClose = vi.fn();
    openForm(onClose);
    expect(await screen.findByText("الاستمارة غير متاحة الآن.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى المشروع" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
