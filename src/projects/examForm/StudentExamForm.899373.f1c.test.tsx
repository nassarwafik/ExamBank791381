// @vitest-environment happy-dom
/// <reference types="node" />
// Phase F1c — the 899373 exam form (the Access project) on the pages the other two forms use, over the REAL handlers
// (in-memory container): the teacher's control shows its size and opens it; the student's project shows the card; the form
// page draws every one of its sections and questions with an input (an image question takes images, a class with image
// answers on); an answer is saved under the 899373 prefix; no question promises or asks for a file upload.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import StudentProjectPanel from "../StudentProjectPanel";
import ProjectExamFormControl from "../ProjectExamFormControl";
import StudentExamForm from "./StudentExamForm";

const nodeRequire = createRequire(import.meta.url);
const { handler: studentTracker } = nodeRequire("../../../api/src/functions/student-project-tracker.js");
const { handler: studentForm } = nodeRequire("../../../api/src/functions/student-project-exam-form.js");
const { handler: tracker } = nodeRequire("../../../api/src/functions/project-tracker.js");
const { getExamFormTemplate, getStorageNamespace } = nodeRequire("../../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
type Question = { questionId: string; kind: string; required: boolean };
type Section = { sectionId: string; title: string; questions: Question[] };
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const NOW = "2026-11-15T00:00:00.000Z";
const SECTIONS = (getExamFormTemplate(CODE) as { sections: Section[] }).sections;
const QUESTIONS = SECTIONS.flatMap(s => s.questions);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  const posts: Body[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") posts.push(body!);
    const r = (await route(url)({ method, url: "https://x" + url, json: async () => body ?? {} })) as { status: number; jsonBody: Body };
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody, text: async () => JSON.stringify(r.jsonBody), headers: new Headers() } as unknown as Response;
  }) as unknown as typeof fetch;
  const open = () => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId: "c1", action: "examForm.open", imageAnswers: true }) }, teacherDeps);
  const doc = () => (ctx.has(NS.examFormAnswersName("c1", "s1")) ? ctx.getJson(NS.examFormAnswersName("c1", "s1")) : null) as { status: string; revision: number; answers: Record<string, Body> } | null;
  const classForm = () => (ctx.has(NS.examFormClassName("c1")) ? ctx.getJson(NS.examFormClassName("c1")) : null) as { state: string; imageAnswers?: boolean; template: { sections: unknown[] } } | null;
  return { ctx, posts, open, doc, classForm };
}
const questionBox = (id: string) => document.querySelector('[data-question="' + id + '"]') as HTMLElement | null;
const nav = () => within(screen.getByRole("navigation", { name: "أقسام الاستمارة" }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("F1c — the 899373 form on the teacher's and the student's pages", () => {
  it("the teacher's control shows the form's size and opens it with image answers on", async () => {
    const s = server();
    render(<ProjectExamFormControl token="t" projectCode={CODE} classId="c1" />);
    const box = await screen.findByTestId("project-exam-form");
    expect(box.textContent).toMatch(/15\s*قسمًا و\s*84\s*سؤالًا/);
    fireEvent.click(within(box).getByRole("button", { name: "فتح الاستمارة للصف" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "فتح الاستمارة" }));
    await waitFor(() => expect(s.classForm()?.state).toBe("open"));
    expect(s.posts).toEqual([{ projectCode: CODE, action: "examForm.open", classId: "c1", imageAnswers: true }]);
    expect(s.classForm()).toMatchObject({ imageAnswers: true });
    expect(s.classForm()!.template.sections).toHaveLength(15);
  });

  it("the student's 899373 project shows the form's card once it is open", async () => {
    const s = server();
    await s.open();
    render(<StudentProjectPanel token="st" />);
    const card = await screen.findByTestId("exam-form-card");
    expect(within(card).getByRole("button", { name: "ابدأ الاستمارة" })).toBeTruthy();
  });

  it("draws every section and question with an input, and nothing asks for a file", async () => {
    const s = server();
    await s.open();
    render(<StudentExamForm token="st" projectCode={CODE} onClose={() => {}} saveDelayMs={5} />);
    await screen.findByRole("navigation", { name: "أقسام الاستمارة" });
    expect(SECTIONS).toHaveLength(15);
    expect(QUESTIONS).toHaveLength(84);
    const drawn: string[] = [];
    for (const section of SECTIONS) {
      fireEvent.click(nav().getByRole("button", { name: new RegExp(escape(section.title)) }));
      await waitFor(() => expect(questionBox(section.questions[0].questionId)).not.toBeNull());
      for (const q of section.questions) {
        const box = questionBox(q.questionId);
        expect(box, q.questionId).not.toBeNull();
        drawn.push(q.questionId);
        // an ordering question is answered with its move buttons; an image question with its file picker
        const controls = box!.querySelectorAll(q.kind === "ordering" ? "button" : "input, textarea, select").length;
        expect(controls, q.questionId + " (" + q.kind + ")").toBeGreaterThan(0);
        if (q.kind === "image") expect(box!.querySelector('input[type="file"]'), q.questionId).not.toBeNull();
        else expect(box!.querySelector('input[type="file"]'), q.questionId).toBeNull();
        expect(box!.textContent, q.questionId).not.toContain("قريبًا");
      }
    }
    expect(drawn).toEqual(QUESTIONS.map(q => q.questionId));
    // Nothing waits for a later phase in this form: no «deferred» note, and the progress counts every question.
    expect(document.querySelector(".eb-sp-form-note")).toBeNull();
    expect(screen.getByText(new RegExp("أجبت عن 0 من 84"))).toBeTruthy();
  });

  it("saves an answer as the student types, under the 899373 prefix", async () => {
    const s = server();
    await s.open();
    render(<StudentExamForm token="st" projectCode={CODE} onClose={() => {}} saveDelayMs={5} />);
    await waitFor(() => expect(questionBox("S01Q01")).not.toBeNull());
    fireEvent.change(questionBox("S01Q01")!.querySelector("input, textarea")!, { target: { value: "قاعدة بيانات مكتبة المدرسة" } });
    await waitFor(() => expect(s.doc()?.answers.S01Q01).toEqual({ text: "قاعدة بيانات مكتبة المدرسة" }));
    expect(s.doc()).toMatchObject({ status: "draft", revision: 1 });
    expect(s.ctx.names("platform/project-exam-forms/").every((name: string) => name.startsWith("platform/project-exam-forms/" + CODE + "/"))).toBe(true);
    await screen.findByText(new RegExp("أجبت عن 1 من 84"));
  });
});
