// @vitest-environment happy-dom
/// <reference types="node" />
// Phase F3-UI — the teacher's follow-up of the project exam form on the project dashboard, over the REAL handlers (in-memory
// container): hiding questions before the first open, the class list, and one student's review — answers, the evidence of
// the auto-marked questions, section ratings, save, return, approve and taking an approval back.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProjectExamFormControl from "./ProjectExamFormControl";

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { handler: studentForm } = nodeRequire("../../api/src/functions/student-project-exam-form.js");
const { getExamFormTemplate, getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
type Question = { questionId: string; kind: string; grading: string; prompt: string; minRows?: number; columns?: { id: string }[]; options?: { id: string; text: string }[]; justification?: boolean; items?: { id: string }[]; max?: number; answer?: { correctOptionId?: string; correctOptionIds?: string[]; pairs?: Record<string, string>; order?: string[] } };
type Section = { sectionId: string; title: string; weight: number; questions: Question[] };
const CODE = "794589";
const NS = getStorageNamespace(CODE);
const NOW = "2026-11-14T00:00:00.000Z";
const TEMPLATE: { sections: Section[]; rubric: { levels: { value: number; label: string }[] } } = getExamFormTemplate(CODE);
const SECTIONS = TEMPLATE.sections;
const QUESTIONS = SECTIONS.flatMap(s => s.questions);
const Q = (id: string) => QUESTIONS.find(q => q.questionId === id)!;
const ANSWERABLE = QUESTIONS.filter(q => q.kind !== "image" && q.kind !== "file");
const user = (id: string, name: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: name, code: "C" + id });
const room = (over: Body = {}) => ({ classId: "c1", name: "صف c1", active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW, ...over });
// The RIGHT answer of an auto-marked question; a complete, valid answer for any other answerable question.
function answerOf(q: Question): Body {
  if (q.grading === "auto") {
    if (q.kind === "choice") return q.justification ? { optionId: q.answer!.correctOptionId, justification: "لأن البوابة خارج شبكته" } : { optionId: q.answer!.correctOptionId };
    if (q.kind === "multiChoice") return { optionIds: q.answer!.correctOptionIds };
    if (q.kind === "matching") return { pairs: q.answer!.pairs };
    return { order: q.answer!.order };
  }
  switch (q.kind) {
    case "table": return { rows: Array.from({ length: q.minRows || 1 }, (_, i) => Object.fromEntries((q.columns || []).map(c => [c.id, c.id + i]))) };
    case "multiChoice": return { optionIds: [q.options![0].id] };
    case "scale": return { values: Object.fromEntries(q.items!.map(i => [i.id, q.max])) };
    case "checklist": return { checked: [q.items![0].id] };
    case "declaration": return { accepted: true };
    default: return { text: "جواب " + q.questionId };
  }
}
const allAnswers = () => Object.fromEntries(ANSWERABLE.map(q => [q.questionId, answerOf(q)]));
const rateAll = (level: number, except: string[] = []) => Object.fromEntries(SECTIONS.filter(s => !except.includes(s.sectionId)).map(s => [s.sectionId, { level }]));

function server() {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room(),
    "platform/users/s1.json": user("s1", "وليد"), "platform/users/s2.json": user("s2", "بشرى"), "platform/users/s3.json": user("s3", "تامر")
  });
  const audits: Body[] = [];
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c: unknown, ev: Body) => { audits.push(ev); }, recordProjectMilestones: async () => {} };
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const studentDeps = (id: string) => ({ ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: id, sv: 1 }, student: ctx.getJson("platform/users/" + id + ".json") }) });
  const posts: Body[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") posts.push(body!);
    const r = await tracker({ method, url: "https://x" + url, json: async () => body ?? {} }, teacherDeps);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody, text: async () => JSON.stringify(r.jsonBody), headers: new Headers() } as unknown as Response;
  }) as unknown as typeof fetch;
  // Direct calls (not through the page): the teacher from elsewhere, and the students.
  const teacher = async (action: string, extra: Body = {}) => (await tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId: "c1", action, ...extra }) }, teacherDeps)) as { status: number; jsonBody: Body };
  const student = async (id: string, body: Body) => (await studentForm({ method: "POST", url: "https://x/api/student-project-exam-form", json: async () => ({ projectCode: CODE, ...body }) }, studentDeps(id))) as { status: number; jsonBody: Body };
  const studentGet = async (id: string) => (await studentForm({ method: "GET", url: "https://x/api/student-project-exam-form?projectCode=" + CODE, json: async () => ({}) }, studentDeps(id))) as { status: number; jsonBody: Body };
  const doc = (id = "s1") => (ctx.has(NS.examFormAnswersName("c1", id)) ? ctx.getJson(NS.examFormAnswersName("c1", id)) : null) as { status: string; revision: number; review?: { ratings: Record<string, { level: number; note?: string }>; generalNote?: string }; result?: { mark: number }; returnNote?: string } | null;
  const classForm = () => (ctx.has(NS.examFormClassName("c1")) ? ctx.getJson(NS.examFormClassName("c1")) : null) as { state: string; hiddenQuestionIds: string[]; template: { sections: Section[] } } | null;
  return { ctx, audits, posts, teacher, student, studentGet, doc, classForm };
}
// The form is open; s1 submitted a complete form (revision 2), s2 has a draft, s3 never opened it.
async function classWithForms() {
  const s = server();
  await s.teacher("examForm.open");
  expect((await s.student("s1", { action: "saveDraft", baseRevision: 0, answers: allAnswers() })).status).toBe(200);
  expect((await s.student("s1", { action: "submit", baseRevision: 1 })).status).toBe(200);
  await s.student("s2", { action: "saveDraft", baseRevision: 0, answers: { S01Q01: { text: "مسودة" } } });
  s.audits.length = 0; s.posts.length = 0;
  return s;
}
const mount = (readOnly = false) => render(<ProjectExamFormControl token="t" projectCode={CODE} classId="c1" readOnly={readOnly} />);
async function openReview(studentName = "وليد") {
  fireEvent.click(await screen.findByRole("button", { name: "متابعة الاستمارات" }));
  const list = await screen.findByTestId("exam-form-list");
  fireEvent.click(within(list).getByRole("button", { name: new RegExp("استمارة " + studentName) }));
  return screen.findByTestId("exam-form-review");
}
const goTo = (name: RegExp) => fireEvent.click(within(screen.getByRole("navigation", { name: "أقسام الاستمارة" })).getByRole("button", { name }));
const rate = (level: number) => fireEvent.click(within(screen.getByTestId("exam-form-rating")).getAllByRole("radio")[level]);
const questionBox = (id: string) => document.querySelector('[data-question="' + id + '"]') as HTMLElement;

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("F3-UI hiding questions before the first open", () => {
  it("the teacher unticks questions, the confirmation says how many, and the form is frozen without them", async () => {
    const s = server();
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "اختيار الأسئلة" }));
    const picker = await screen.findByTestId("exam-form-picker");
    expect(picker.textContent).toContain("ستُطرح كل الأسئلة");
    expect(within(picker).getAllByRole("checkbox")).toHaveLength(92);
    expect(picker.textContent).not.toContain("correctOption");
    fireEvent.click(within(picker).getByRole("checkbox", { name: new RegExp(Q("S01Q02").prompt.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
    fireEvent.click(within(picker).getByRole("checkbox", { name: new RegExp(Q("S04Q04").prompt.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
    expect(picker.textContent).toMatch(/عدد الأسئلة المخفية عن هذا الصف:\s*2/);
    expect(s.classForm()).toBeNull();                                         // choosing writes nothing

    fireEvent.click(screen.getByRole("button", { name: "فتح الاستمارة للصف" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/عدد الأسئلة المخفية عن هذا الصف: 2\. لا يمكن تغيير ذلك بعد الفتح/);
    fireEvent.click(within(dialog).getByRole("button", { name: "فتح الاستمارة" }));
    await waitFor(() => expect(s.classForm()?.state).toBe("open"));
    expect(s.classForm()!.hiddenQuestionIds).toEqual(["S01Q02", "S04Q04"]);
    expect(s.posts.find(p => p.action === "examForm.open")).toMatchObject({ hiddenQuestionIds: ["S01Q02", "S04Q04"] });
    const box = screen.getByTestId("project-exam-form");
    await waitFor(() => expect(box.textContent).toMatch(/عدد الأسئلة المخفية عن هذا الصف:\s*2/));
    expect(box.textContent).toMatch(/90\s*سؤالًا/);
    expect(screen.queryByRole("button", { name: /اختيار الأسئلة/ })).toBeNull();   // frozen: no picker after the first open
    expect(screen.queryByTestId("exam-form-picker")).toBeNull();
  });

  it("the last shown question of a section cannot be unticked, and «إظهار الكل» clears the choice", async () => {
    server();
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "اختيار الأسئلة" }));
    const picker = await screen.findByTestId("exam-form-picker");
    const first = SECTIONS[0].questions;
    const boxes = within(picker).getAllByRole("checkbox").slice(0, first.length) as HTMLInputElement[];
    for (const box of boxes.slice(0, -1)) fireEvent.click(box);
    const again = within(picker).getAllByRole("checkbox").slice(0, first.length) as HTMLInputElement[];
    expect(again.map(b => b.checked)).toEqual([...first.slice(0, -1).map(() => false), true]);
    expect(again[again.length - 1].disabled).toBe(true);
    fireEvent.click(within(picker).getByRole("button", { name: "إظهار الكل" }));
    expect(picker.textContent).toContain("ستُطرح كل الأسئلة");
  });

  it("a read-only class shows no picker; opening without a choice sends no hidden list", async () => {
    const s = server();
    const view = mount(true);
    await screen.findByTestId("project-exam-form");
    expect(screen.queryByRole("button", { name: /اختيار الأسئلة/ })).toBeNull();
    view.unmount();
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "فتح الاستمارة للصف" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "فتح الاستمارة" }));
    await waitFor(() => expect(s.classForm()?.state).toBe("open"));
    expect("hiddenQuestionIds" in s.posts.find(p => p.action === "examForm.open")!).toBe(false);
    expect(s.classForm()!.hiddenQuestionIds).toEqual([]);
  });
});

describe("F3-UI the class's forms", () => {
  it("is offered only once the form was opened, lists every student by what waits for the teacher, and hides again", async () => {
    const s = server();
    mount();
    await screen.findByTestId("project-exam-form");
    expect(screen.queryByRole("button", { name: "متابعة الاستمارات" })).toBeNull();
    cleanup();
    await s.teacher("examForm.open");
    await s.student("s1", { action: "saveDraft", baseRevision: 0, answers: allAnswers() });
    await s.student("s1", { action: "submit", baseRevision: 1 });
    await s.student("s2", { action: "saveDraft", baseRevision: 0, answers: { S01Q01: { text: "مسودة" } } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "متابعة الاستمارات" }));
    const list = await screen.findByTestId("exam-form-list");
    expect(list.textContent).toMatch(/بانتظار تقديرك:\s*1/);
    expect(list.textContent).toMatch(/قيد التعبئة:\s*1/);
    expect(list.textContent).toMatch(/لم يبدأوا:\s*1/);
    const rows = [...list.querySelectorAll("[data-student]")] as HTMLElement[];
    expect(rows.map(r => r.dataset.student)).toEqual(["s1", "s2", "s3"]);     // submitted, then draft, then not started (not by name: «وليد» is last by name)
    expect(rows[0].textContent).toContain("سُلّمت — بانتظار تقديرك");
    expect(rows[0].textContent).toMatch(/أجاب عن\s*77\s*من\s*77/);
    expect(rows[0].textContent).toMatch(/قُدّر\s*0\s*من\s*16/);
    expect(within(rows[0]).getByRole("button", { name: "تقدير استمارة وليد" })).toBeTruthy();
    expect(within(rows[1]).getByRole("button", { name: "عرض استمارة بشرى" })).toBeTruthy();
    expect(rows[2].textContent).toContain("لم يفتح الاستمارة بعد");
    expect(within(rows[2]).queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "إخفاء المتابعة" }));
    expect(screen.queryByTestId("exam-form-list")).toBeNull();
  });

  it("an approved form shows its mark in the list", async () => {
    const s = await classWithForms();
    await s.teacher("examForm.review", { studentId: "s1", expectedRevision: 2, ratings: { ...rateAll(4), S04: { level: 2 } } });
    await s.teacher("examForm.approve", { studentId: "s1", expectedRevision: 3 });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "متابعة الاستمارات" }));
    const row = (await screen.findByTestId("exam-form-list")).querySelector('[data-student="s1"]') as HTMLElement;
    expect(row.textContent).toContain("اعتُمدت");
    expect(row.textContent).toMatch(/العلامة\s*94\.5\s*\/\s*100/);
  });
});

describe("F3-UI the teacher reviews one student's form", () => {
  it("shows the answers read-only, and for an auto-marked question whether it is right and its key", async () => {
    await classWithForms();
    mount();
    const review = await openReview();
    expect(review.textContent).toContain("استمارة وليد");
    expect(review.textContent).toMatch(/الأسئلة الآلية:\s*13\s*صحيحة من\s*13/);
    const text = within(questionBox("S01Q01")).getByRole("textbox") as HTMLInputElement;
    expect(text.value).toBe("جواب S01Q01");
    expect(text.disabled).toBe(true);
    expect(questionBox("S01Q01").querySelector("[data-verdict]")).toBeNull();         // not auto-marked: no verdict, no key
    goTo(/تخطيط العناوين/);
    const auto = questionBox("S04Q04");
    expect(auto.querySelector('[data-verdict="right"]')).toBeTruthy();
    const right = Q("S04Q04").options!.find(o => o.id === Q("S04Q04").answer!.correctOptionId)!.text;
    expect(auto.textContent).toContain("الإجابة الصحيحة: " + right);
  });

  it("a wrong and an unanswered auto-marked question are told apart", async () => {
    const s = server();
    await s.teacher("examForm.open");
    const answers = allAnswers();
    const q = Q("S04Q04");
    answers.S04Q04 = { ...answerOf(q), optionId: q.options!.find(o => o.id !== q.answer!.correctOptionId)!.id };
    await s.student("s1", { action: "saveDraft", baseRevision: 0, answers });
    await s.student("s1", { action: "saveDraft", baseRevision: 1, answers: { S04Q03: null } });
    mount();
    const review = await openReview();
    expect(review.textContent).toMatch(/الأسئلة الآلية:\s*11\s*صحيحة من\s*13/);
    goTo(/تخطيط العناوين/);
    expect(questionBox("S04Q04").querySelector('[data-verdict="wrong"]')).toBeTruthy();
    expect(questionBox("S04Q03").querySelector('[data-verdict="none"]')).toBeTruthy();
    expect(questionBox("S04Q03").textContent).toContain("لم يُجب الطالب عن هذا السؤال");
  });

  it("a rating and its note are saved for that section only; the student sees nothing before the approval", async () => {
    const s = await classWithForms();
    mount();
    await openReview();
    expect((screen.getByRole("button", { name: "حفظ التقديرات" }) as HTMLButtonElement).disabled).toBe(true);
    rate(3);
    fireEvent.change(within(screen.getByTestId("exam-form-rating")).getByRole("textbox"), { target: { value: "  اسم المشروع واضح  " } });
    expect(screen.getByText("تغييرات غير محفوظة")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "حفظ التقديرات" }));
    await waitFor(() => expect(s.doc()?.review?.ratings).toEqual({ S01: { level: 3, note: "اسم المشروع واضح" } }));
    expect(s.posts.filter(p => p.action === "examForm.review")).toEqual([expect.objectContaining({ expectedRevision: 2, ratings: { S01: { level: 3, note: "اسم المشروع واضح" } } })]);
    expect((await screen.findByRole("status")).textContent).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("تغييرات غير محفوظة")).toBeNull());
    expect(s.doc()).toMatchObject({ status: "submitted", revision: 3 });
    const student = (await s.studentGet("s1")).jsonBody;
    expect(student.result).toBeUndefined();
    expect(JSON.stringify(student)).not.toContain("اسم المشروع واضح");
    // clearing the rating removes it
    fireEvent.click(screen.getByRole("button", { name: "مسح التقدير" }));
    fireEvent.click(screen.getByRole("button", { name: "حفظ التقديرات" }));
    await waitFor(() => expect(s.doc()?.review?.ratings).toEqual({}));
  });

  it("an approval with unrated sections is not sent: the sections are listed and lead to their rating", async () => {
    const s = await classWithForms();
    await s.teacher("examForm.review", { studentId: "s1", expectedRevision: 2, ratings: rateAll(4, ["S07", "S12"]) });
    s.posts.length = 0;
    mount();
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: "اعتماد الاستمارة" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/قدّر كل الأقسام قبل الاعتماد\. بقي\s*2/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(s.posts.some(p => p.action === "examForm.approve")).toBe(false);
    expect(s.doc()?.status).toBe("submitted");
    fireEvent.click(within(alert).getByRole("button", { name: SECTIONS.find(x => x.sectionId === "S07")!.title }));
    expect(screen.getByRole("heading", { level: 4 }).textContent).toContain(SECTIONS.find(x => x.sectionId === "S07")!.title);
  });

  it("the last rating is saved with the approval; the confirmation shows the mark; the approved form is locked and can be taken back", async () => {
    const s = await classWithForms();
    await s.teacher("examForm.review", { studentId: "s1", expectedRevision: 2, ratings: rateAll(4, ["S04"]) });
    s.posts.length = 0; s.audits.length = 0;
    mount();
    const review = await openReview();
    goTo(/تخطيط العناوين/);
    rate(2);
    expect(review.textContent).toMatch(/العلامة حسب تقديراتك\s*94\.5\s*\/\s*100/);
    fireEvent.click(screen.getByRole("button", { name: "اعتماد الاستمارة" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("العلامة 94.5 من 100");
    expect(s.doc()?.review?.ratings.S04).toEqual({ level: 2 });               // saved before the confirmation
    expect(s.doc()?.status).toBe("submitted");
    fireEvent.click(within(dialog).getByRole("button", { name: "اعتماد" }));
    await waitFor(() => expect(s.doc()?.status).toBe("approved"));
    expect(s.doc()?.result?.mark).toBe(94.5);
    expect(s.audits.map(a => a.action)).toEqual(["project.exam_form.approve"]);
    await waitFor(() => expect(review.textContent).toMatch(/العلامة المعتمدة\s*94\.5\s*\/\s*100/));
    expect(screen.getByTestId("exam-form-review-why").textContent).toContain("الاستمارة معتمدة");
    expect((screen.getByTestId("exam-form-rating") as HTMLFieldSetElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "اعتماد الاستمارة" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "إلغاء الاعتماد" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "إلغاء الاعتماد" }));
    await waitFor(() => expect(s.doc()?.status).toBe("submitted"));
    expect(s.doc()?.result).toBeUndefined();
    await waitFor(() => expect(screen.getByRole("button", { name: "اعتماد الاستمارة" })).toBeTruthy());
    expect((screen.getByTestId("exam-form-rating") as HTMLFieldSetElement).disabled).toBe(false);
  });

  it("cancelling the approval's confirmation approves nothing", async () => {
    const s = await classWithForms();
    await s.teacher("examForm.review", { studentId: "s1", expectedRevision: 2, ratings: rateAll(3) });
    mount();
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: "اعتماد الاستمارة" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.doc()).toMatchObject({ status: "submitted", revision: 3 });
    expect(s.posts.some(p => p.action === "examForm.approve")).toBe(false);
  });

  it("returns the form with a note the student will see", async () => {
    const s = await classWithForms();
    mount();
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: "إعادة للتعديل" }));
    const box = screen.getByTestId("exam-form-return");
    expect(s.doc()?.status).toBe("submitted");                               // nothing sent yet
    fireEvent.change(within(box).getByRole("textbox"), { target: { value: "أكمل جدول الشبكات" } });
    fireEvent.click(within(box).getByRole("button", { name: "تأكيد الإعادة" }));
    await waitFor(() => expect(s.doc()?.status).toBe("returned"));
    expect(s.doc()?.returnNote).toBe("أكمل جدول الشبكات");
    expect((await screen.findByTestId("exam-form-review-why")).textContent).toContain("الاستمارة عند الطالب للتعديل");
    expect(screen.queryByRole("button", { name: "اعتماد الاستمارة" })).toBeNull();
    expect((await s.studentGet("s1")).jsonBody).toMatchObject({ status: "returned", returnNote: "أكمل جدول الشبكات" });
  });

  it("cancelling the return sends nothing", async () => {
    const s = await classWithForms();
    mount();
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: "إعادة للتعديل" }));
    fireEvent.click(within(screen.getByTestId("exam-form-return")).getByRole("button", { name: "إلغاء" }));
    expect(screen.queryByTestId("exam-form-return")).toBeNull();
    expect(s.posts.some(p => p.action === "examForm.return")).toBe(false);
    expect(s.doc()?.status).toBe("submitted");
  });

  it("the form changed since the page read it: the save is refused, the form is read again and the typed rating is kept", async () => {
    const s = await classWithForms();
    mount();
    await openReview();
    rate(1);
    await s.teacher("examForm.review", { studentId: "s1", expectedRevision: 2, ratings: { S02: { level: 4 } } });   // another tab → revision 3
    fireEvent.click(screen.getByRole("button", { name: "حفظ التقديرات" }));
    expect((await screen.findByRole("alert")).textContent).toContain("تغيّرت الاستمارة منذ فتحتها");
    expect(s.doc()?.review?.ratings).toEqual({ S02: { level: 4 } });           // the stale save wrote nothing
    expect((within(screen.getByTestId("exam-form-rating")).getAllByRole("radio")[1] as HTMLInputElement).checked).toBe(true);
    // the rating saved from the other page is now shown here, and this page's second save does not clear it
    expect(within(screen.getByRole("navigation", { name: "أقسام الاستمارة" })).getByRole("button", { name: new RegExp(SECTIONS[1].title) }).textContent).toContain("4/4");
    fireEvent.click(screen.getByRole("button", { name: "حفظ التقديرات" }));
    await waitFor(() => expect(s.doc()?.review?.ratings).toEqual({ S01: { level: 1 }, S02: { level: 4 } }));
    const last = s.posts.filter(p => p.action === "examForm.review").pop()!;
    expect(last.expectedRevision).toBe(3);
    expect(last.ratings).toEqual({ S01: { level: 1 } });                       // only what this page changed
  });

  it("a form that was not submitted is shown without any rating or action", async () => {
    const s = await classWithForms();
    mount();
    await openReview("بشرى");
    expect(screen.getByTestId("exam-form-review-why").textContent).toContain("لم يسلّم الطالب الاستمارة بعد");
    expect((screen.getByTestId("exam-form-rating") as HTMLFieldSetElement).disabled).toBe(true);
    for (const name of ["حفظ التقديرات", "إعادة للتعديل", "اعتماد الاستمارة", "إلغاء الاعتماد"]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(s.posts).toEqual([]);
  });

  it("a read-only class shows the submitted form without any action", async () => {
    const s = await classWithForms();
    mount(true);
    await openReview();
    expect(screen.getByTestId("exam-form-review-why").textContent).toContain("العرض فقط");
    expect((screen.getByTestId("exam-form-rating") as HTMLFieldSetElement).disabled).toBe(true);
    for (const name of ["حفظ التقديرات", "إعادة للتعديل", "اعتماد الاستمارة"]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.queryByRole("button", { name: /إغلاق الاستمارة|فتح الاستمارة للصف/ })).toBeNull();
    expect(s.posts).toEqual([]);
  });

  it("leaving with an unsaved rating asks first; the list is shown again after leaving", async () => {
    const s = await classWithForms();
    mount();
    await openReview();
    rate(4);
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى قائمة الطلاب" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("لم تُحفظ");
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("exam-form-review")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى قائمة الطلاب" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "خروج دون حفظ" }));
    expect(await screen.findByTestId("exam-form-list")).toBeTruthy();
    expect(s.doc()?.review).toBeUndefined();
  });
});
