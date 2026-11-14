// @vitest-environment happy-dom
/// <reference types="node" />
// Phase F1b on the F2-UI page — the 883589 exam form in the student's page, end to end over the REAL handlers (in-memory
// container). F2-UI was written and tested with the 794589 form; this file runs the same page with the 883589 question
// bank: the card appears on the 883589 project once the teacher opened the form, every one of its questions is drawn in
// its section (image and file questions without an input), an answer is saved under the 883589 prefix, and a complete form
// is submitted. Nothing here is specific to one project in the page itself; the test pins that it stays so.
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
type Entry = { id: string };
type Question = { questionId: string; kind: string; required: boolean; minRows?: number; columns?: Entry[]; options?: Entry[]; justification?: boolean; left?: Entry[]; right?: Entry[]; items?: Entry[]; max?: number };
type Section = { sectionId: string; title: string; questions: Question[] };
const CODE = "883589";
const NS = getStorageNamespace(CODE);
const NOW = "2026-11-14T00:00:00.000Z";
const TEMPLATE = getExamFormTemplate(CODE) as { formVersion: number; sections: Section[] };
const QUESTIONS = TEMPLATE.sections.flatMap(s => s.questions);
const DEFERRED = (q: Question) => q.kind === "image" || q.kind === "file";
const ANSWERABLE = QUESTIONS.filter(q => !DEFERRED(q));

function fullAnswer(q: Question): Body {
  switch (q.kind) {
    case "table": return { rows: Array.from({ length: q.minRows || 1 }, (_, i) => Object.fromEntries((q.columns || []).map(c => [c.id, c.id + i]))) };
    case "choice": return q.justification ? { optionId: q.options![0].id, justification: "تبرير" } : { optionId: q.options![0].id };
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
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": { classId: "c1", name: "صف c1", active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW },
    "platform/users/s1.json": { userId: "s1", role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: "طالب s1", code: "Cs1" }
  });
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const studentDeps = { ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) };
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const route = (url: string) => url.startsWith("/api/student-project-exam-form") ? (req: unknown) => studentForm(req, studentDeps)
    : url.startsWith("/api/student-project-tracker") ? (req: unknown) => studentTracker(req, studentDeps) : (req: unknown) => tracker(req, teacherDeps);
  const call = async (method: string, url: string, body?: Body) => (await route(url)({ method, url: "https://x" + url, json: async () => body ?? {} })) as { status: number; jsonBody: Body };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const r = await call(init?.method || "GET", String(input), init?.body ? JSON.parse(String(init.body)) as Body : undefined);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  const open = () => call("POST", "/api/project-tracker", { projectCode: CODE, classId: "c1", action: "examForm.open" });
  const doc = () => (ctx.has(NS.examFormAnswersName("c1", "s1")) ? ctx.getJson(NS.examFormAnswersName("c1", "s1")) : null) as { status: string; revision: number; answers: Record<string, Body> } | null;
  return { ctx, call, open, doc };
}
const questionBox = (id: string) => document.querySelector('[data-question="' + id + '"]') as HTMLElement | null;
const nav = () => within(screen.getByRole("navigation", { name: "أقسام الاستمارة" }));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("F1b — the 883589 form in the student's page", () => {
  it("the 883589 project shows the form's card only after the teacher opened it, with the count of answerable questions", async () => {
    const s = server();
    const before = await s.call("GET", "/api/student-project-tracker");
    expect("examForm" in (before.jsonBody.projects as Body[])[0]).toBe(false);

    expect((await s.open()).status).toBe(200);
    expect(s.ctx.has(NS.examFormClassName("c1"))).toBe(true);                       // stored under the 883589 prefix
    const after = await s.call("GET", "/api/student-project-tracker");
    expect((after.jsonBody.projects as { projectCode: string; examForm: Body }[])[0]).toMatchObject({ projectCode: CODE, examForm: { state: "open", status: "draft", started: false, answered: 0, total: ANSWERABLE.length } });

    render(<StudentProjectPanel token="st" />);
    const card = await screen.findByTestId("exam-form-card");
    expect(within(card).getByRole("button", { name: "ابدأ الاستمارة" })).toBeTruthy();
  });

  it("draws every section and every question of the 883589 form; image and file questions take no input", async () => {
    const s = server();
    await s.open();
    render(<StudentExamForm token="st" projectCode={CODE} onClose={() => {}} saveDelayMs={5} />);
    await screen.findByRole("navigation", { name: "أقسام الاستمارة" });
    expect(TEMPLATE.sections).toHaveLength(16);
    expect(QUESTIONS).toHaveLength(95);

    const drawn: string[] = [];
    for (const section of TEMPLATE.sections) {
      fireEvent.click(nav().getByRole("button", { name: new RegExp(escape(section.title)) }));
      await waitFor(() => expect(questionBox(section.questions[0].questionId)).not.toBeNull());
      for (const q of section.questions) {
        const box = questionBox(q.questionId);
        expect(box, q.questionId).not.toBeNull();
        drawn.push(q.questionId);
        // an ordering question is answered with its move buttons; every other answerable kind has a field
        const controls = box!.querySelectorAll(q.kind === "ordering" ? "button" : "input, textarea, select").length;
        if (DEFERRED(q)) expect(box!.querySelectorAll("input, textarea, select").length, q.questionId + " (deferred)").toBe(0);
        else expect(controls, q.questionId + " (" + q.kind + ")").toBeGreaterThan(0);
      }
    }
    expect(drawn).toEqual(QUESTIONS.map(q => q.questionId));
    // What the page received carries no answer key.
    const read = await s.call("GET", "/api/student-project-exam-form?projectCode=" + CODE);
    expect(JSON.stringify(read.jsonBody)).not.toMatch(/correctOption|"answer"\s*:/);
  });

  it("saves an answer as the student types, under the 883589 prefix", async () => {
    const s = server();
    await s.open();
    render(<StudentExamForm token="st" projectCode={CODE} onClose={() => {}} saveDelayMs={5} />);
    await waitFor(() => expect(questionBox("S01Q01")).not.toBeNull());
    fireEvent.change(questionBox("S01Q01")!.querySelector("input, textarea")!, { target: { value: "نظام إدارة مكتبة المدرسة" } });
    await waitFor(() => expect(s.doc()?.answers.S01Q01).toEqual({ text: "نظام إدارة مكتبة المدرسة" }));
    expect(s.doc()).toMatchObject({ status: "draft", revision: 1 });
    expect(s.ctx.names("platform/project-exam-forms/").every((name: string) => name.startsWith("platform/project-exam-forms/" + CODE + "/"))).toBe(true);
    await screen.findByText(new RegExp("أجبت عن 1 من " + ANSWERABLE.length));
  });

  it("a complete 883589 form is submitted from the page and becomes read-only", async () => {
    const s = server();
    await s.open();
    s.ctx.setJson(NS.examFormAnswersName("c1", "s1"), {
      schemaVersion: 1, projectCode: CODE, classId: "c1", studentId: "s1", formVersion: TEMPLATE.formVersion, status: "draft",
      answers: Object.fromEntries(ANSWERABLE.map(q => [q.questionId, fullAnswer(q)])), revision: 4, startedAt: NOW, updatedAt: NOW, submittedAt: null
    });
    render(<StudentExamForm token="st" projectCode={CODE} onClose={() => {}} saveDelayMs={5} />);
    await screen.findByRole("navigation", { name: "أقسام الاستمارة" });
    fireEvent.click(nav().getByRole("button", { name: /المرفقات والتسليم/ }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الاستمارة" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "تسليم" }));
    expect((await screen.findByTestId("exam-form-locked")).textContent).toContain("سلّمت هذه الاستمارة");
    expect(s.doc()).toMatchObject({ status: "submitted", revision: 5 });
  });
});
