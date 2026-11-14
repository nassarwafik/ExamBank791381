// @vitest-environment happy-dom
/// <reference types="node" />
// Phase F3 — what the STUDENT's page does with the teacher's review, over the REAL handlers (in-memory container): a form
// the teacher returned can be edited and submitted again, with the teacher's note shown; an approved form is a read-only
// record that shows its mark; the teacher's ratings are invisible before the approval.
// Phase F3-UI — the approved form's result: each section's level, the teacher's notes and right / wrong per auto-marked
// question, never a key.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import StudentProjectPanel from "../StudentProjectPanel";
import StudentExamForm from "./StudentExamForm";

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
  const teacher = (action: string, extra: Body = {}) => call("POST", "/api/project-tracker", { projectCode: CODE, classId: "c1", action, ...extra });
  const save = (answers: Body, baseRevision: number) => call("POST", "/api/student-project-exam-form", { projectCode: CODE, action: "saveDraft", baseRevision, answers });
  const doc = () => (ctx.has(NS.examFormAnswersName("c1", "s1")) ? ctx.getJson(NS.examFormAnswersName("c1", "s1")) : null) as { status: string; revision: number; answers: Record<string, Body> } | null;
  return { ctx, requests, teacher, save, doc };
}
const openForm = (onClose = () => {}) => render(<StudentExamForm token="st" projectCode={CODE} onClose={onClose} saveDelayMs={5} />);
const questionBox = (id: string) => document.querySelector('[data-question="' + id + '"]') as HTMLElement;
const goTo = (name: RegExp) => fireEvent.click(within(screen.getByRole("navigation", { name: "أقسام الاستمارة" })).getByRole("button", { name }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const SECTIONS: string[] = getExamFormTemplate(CODE).sections.map((s: { sectionId: string }) => s.sectionId);
// The form is open and the student's complete form is submitted (revision 2).
async function submittedForm() {
  const s = server();
  await s.teacher("examForm.open");
  await s.save(Object.fromEntries(ANSWERABLE.map(q => [q.questionId, fullAnswer(q)])), 0);
  const r = await fetch("/api/student-project-exam-form", { method: "POST", body: JSON.stringify({ projectCode: CODE, action: "submit", baseRevision: 1 }) });
  expect(r.status).toBe(200);
  return s;
}
const rateAll = (level: number) => Object.fromEntries(SECTIONS.map(id => [id, { level }]));

describe("F3 a form the teacher returned for correction", () => {
  it("shows the teacher's note, can be edited, and is submitted again", async () => {
    const s = await submittedForm();
    expect((await s.teacher("examForm.return", { studentId: "s1", expectedRevision: 2, note: "أكمل جدول الشبكات" })).status).toBe(200);
    openForm();
    const notice = await screen.findByTestId("exam-form-returned");
    expect(notice.textContent).toContain("أكمل جدول الشبكات");
    expect(screen.getByText("أُعيدت للتعديل")).toBeTruthy();
    expect(screen.queryByTestId("exam-form-locked")).toBeNull();
    const input = within(questionBox("S01Q01")).getByRole("textbox") as HTMLInputElement;
    expect(input.disabled).toBe(false);
    fireEvent.change(input, { target: { value: "بعد التعديل" } });
    await waitFor(() => expect(s.doc()?.answers.S01Q01).toEqual({ text: "بعد التعديل" }));
    expect(s.doc()?.status).toBe("returned");
    goTo(/المرفقات والتسليم/);
    fireEvent.click(screen.getByRole("button", { name: "تسليم الاستمارة" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "تسليم" }));
    await waitFor(() => expect(s.doc()?.status).toBe("submitted"));
    await waitFor(() => expect(screen.queryByTestId("exam-form-returned")).toBeNull());
    expect((await screen.findByTestId("exam-form-locked")).textContent).toContain("سلّمت هذه الاستمارة");
  });

  it("the project page's card says «أُعيدت للتعديل» and offers to edit and submit again", async () => {
    const s = await submittedForm();
    await s.teacher("examForm.return", { studentId: "s1", expectedRevision: 2 });
    render(<StudentProjectPanel token="st" />);
    const card = await screen.findByTestId("exam-form-card");
    expect(card.textContent).toContain("أُعيدت للتعديل");
    expect(within(card).getByRole("button", { name: "عدّل وأعد التسليم" })).toBeTruthy();
  });
});

describe("F3 the teacher's review and the student's page", () => {
  it("ratings saved before the approval show nothing to the student: no mark, the form stays «سُلّمت»", async () => {
    const s = await submittedForm();
    expect((await s.teacher("examForm.review", { studentId: "s1", expectedRevision: 2, ratings: rateAll(1), generalNote: "ملاحظة المعلم" })).status).toBe(200);
    openForm();
    expect((await screen.findByTestId("exam-form-locked")).textContent).toContain("سلّمت هذه الاستمارة");
    expect(screen.queryByTestId("exam-form-mark")).toBeNull();
    expect(document.body.textContent).not.toContain("ملاحظة المعلم");
    cleanup();
    render(<StudentProjectPanel token="st" />);
    const card = await screen.findByTestId("exam-form-card");
    expect(card.textContent).toContain("سُلّمت");
    expect(card.textContent).not.toContain("علامة الاستمارة");
  });

  it("an approved form shows its mark, is a read-only record, and its card shows the mark", async () => {
    const s = await submittedForm();
    await s.teacher("examForm.review", { studentId: "s1", expectedRevision: 2, ratings: { ...rateAll(4), S04: { level: 2 } } });
    expect((await s.teacher("examForm.approve", { studentId: "s1", expectedRevision: 3 })).status).toBe(200);
    openForm();
    const mark = await screen.findByTestId("exam-form-mark");
    expect(mark.textContent).toMatch(/94\.5\s*\/\s*100/);
    expect(screen.getByText("اعتُمدت")).toBeTruthy();
    expect(screen.getByTestId("exam-form-locked").textContent).toContain("اعتمد معلمك هذه الاستمارة");
    expect((within(questionBox("S01Q01")).getByRole("textbox") as HTMLInputElement).disabled).toBe(true);
    goTo(/المرفقات والتسليم/);
    expect(screen.queryByRole("button", { name: "تسليم الاستمارة" })).toBeNull();
    expect(s.requests.filter(r => r.method === "POST" && r.url.startsWith("/api/student-project-exam-form") && r.body?.action === "saveDraft")).toHaveLength(0);
    cleanup();
    render(<StudentProjectPanel token="st" />);
    const card = await screen.findByTestId("exam-form-card");
    expect(card.textContent).toContain("اعتُمدت");
    expect(card.textContent).toMatch(/علامة الاستمارة:\s*94\.5\s*\/\s*100/);
    expect(within(card).getByRole("button", { name: "عرض الاستمارة" })).toBeTruthy();
  });

  it("the result of an approved form: each section's level and note, the general note, right / wrong per auto question — no key", async () => {
    const s = await submittedForm();
    await s.teacher("examForm.review", { studentId: "s1", expectedRevision: 2, generalNote: "عمل مرتب",
      ratings: { ...rateAll(4), S04: { level: 2, note: "جدول الشبكات ناقص" } } });
    expect((await s.teacher("examForm.approve", { studentId: "s1", expectedRevision: 3 })).status).toBe(200);
    openForm();
    const result = await screen.findByTestId("exam-form-result");
    expect(result.textContent).toContain("ملاحظة معلمك: عمل مرتب");
    const rows = [...result.querySelectorAll("[data-section]")] as HTMLElement[];
    expect(rows).toHaveLength(16);
    const s04 = result.querySelector('[data-section="S04"]') as HTMLElement;
    expect(s04.textContent).toContain("تخطيط العناوين");
    expect(s04.textContent).toMatch(/\(2\/4\)/);
    expect(s04.textContent).toMatch(/5\.5\s*من\s*11/);
    expect(s04.textContent).toContain("ملاحظة: جدول الشبكات ناقص");
    // the section's own page: its level and note, and a verdict on each auto-marked question
    fireEvent.click(within(s04).getByRole("button", { name: /تخطيط العناوين/ }));
    expect((await screen.findByTestId("exam-form-section-result")).textContent).toContain("جدول الشبكات ناقص");
    const auto = questionBox("S04Q04");
    expect(auto.querySelector('[data-verdict="right"]')).toBeTruthy();
    expect(auto.textContent).toContain("إجابة صحيحة");
    expect(questionBox("S04Q01").querySelector("[data-verdict]")).toBeNull();       // a teacher-marked question has no verdict
    expect(document.body.textContent).not.toContain("الإجابة الصحيحة");               // never a key
  });

  it("a returned or a submitted form shows no result panel", async () => {
    const s = await submittedForm();
    await s.teacher("examForm.review", { studentId: "s1", expectedRevision: 2, ratings: rateAll(3) });
    openForm();
    await screen.findByTestId("exam-form-locked");
    expect(screen.queryByTestId("exam-form-result")).toBeNull();
    expect(document.querySelector("[data-verdict]")).toBeNull();
    expect(screen.queryByTestId("exam-form-section-result")).toBeNull();
  });
});
