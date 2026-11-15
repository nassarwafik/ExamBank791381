// @vitest-environment happy-dom
/// <reference types="node" />
// Owner decision (2026-11-15): files are not uploaded to the site. A file question of the project exam form stays on the
// student's page as a reminder of what to hand to the teacher: it says so, takes no input, promises no upload, and never
// blocks the submit. Over the REAL handlers (in-memory container), for both bundled forms.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, act, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import StudentExamForm from "./StudentExamForm";

const nodeRequire = createRequire(import.meta.url);
const { handler: studentForm } = nodeRequire("../../../api/src/functions/student-project-exam-form.js");
const { handler: tracker } = nodeRequire("../../../api/src/functions/project-tracker.js");
const { getExamFormTemplate } = nodeRequire("../../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
type Question = { questionId: string; kind: string; required: boolean };
type Section = { sectionId: string; title: string; questions: Question[] };
const NOW = "2026-11-15T00:00:00.000Z";
const sectionsOf = (code: string) => (getExamFormTemplate(code) as { sections: Section[] }).sections;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function server(code: string) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": { classId: "c1", name: "صف c1", active: true, status: "active", studentIds: [], programCodes: [code], schoolYear: "2026", updatedAt: NOW, createdAt: NOW },
    "platform/users/s1.json": { userId: "s1", role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: "طالب s1", code: "Cs1" }
  });
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const studentDeps = { ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) };
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const sent: { method: string; url: string; body?: Body }[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    sent.push({ method, url, body });
    const r = (await studentForm({ method, url: "https://x" + url, json: async () => body ?? {} }, studentDeps)) as { status: number; jsonBody: Body };
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  const open = (extra: Body = {}) => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: code, classId: "c1", action: "examForm.open", ...extra }) }, teacherDeps);
  return { sent, open };
}
const box = (id: string) => document.querySelector('[data-question="' + id + '"]') as HTMLElement | null;
async function goToFileQuestions(code: string) {
  const sections = sectionsOf(code);
  const section = sections.find(s => s.questions.some(q => q.kind === "file"))!;
  const nav = await screen.findByRole("navigation", { name: "أقسام الاستمارة" });
  fireEvent.click(within(nav).getByRole("button", { name: new RegExp(escape(section.title)) }));
  const files = section.questions.filter(q => q.kind === "file");
  await waitFor(() => expect(box(files[0].questionId)).not.toBeNull());
  return files;
}
const settle = async (turns = 5) => { for (let i = 0; i < turns; i += 1) await act(async () => { await new Promise(resolve => { setTimeout(resolve, 10); }); }); };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("no file uploads — a file question is a reminder to hand the file to the teacher", () => {
  for (const [code, count] of [["794589", 2], ["883589", 1]] as const) {
    it(code + ": every file question says so, takes no input and promises no upload", async () => {
      const s = server(code);
      await s.open({ imageAnswers: true });
      render(<StudentExamForm token="st" projectCode={code} onClose={() => {}} saveDelayMs={5} />);
      const files = await goToFileQuestions(code);
      expect(files).toHaveLength(count);
      await settle();
      for (const q of files) {
        const text = box(q.questionId)!.textContent || "";
        expect(text, q.questionId).toContain("سلّم الملف لمعلمك مباشرة");
        expect(text, q.questionId).toContain("الملفات لا تُرفع إلى الموقع");
        expect(text, q.questionId).toContain("لا يمنع التسليم");
        expect(text, q.questionId).not.toContain("قريبًا");
        expect(box(q.questionId)!.querySelectorAll("input, textarea, select, button").length, q.questionId).toBe(0);
      }
      // The note above the sections says the same, and nothing on the page promises a file upload.
      const note = document.querySelector(".eb-sp-form-note")!.textContent || "";
      expect(note).toContain("ولا تُرفع إلى الموقع");
      expect(note).toMatch(count === 1 ? /سؤال واحد يحتاج ملفًا/ : /سؤالان يحتاجان ملفات/);
      expect(document.body.textContent).not.toMatch(/إرفاق الملفات سيتاح/);
      // The page asks the server for the form only: no file is ever sent.
      expect(s.sent.every(r => r.method === "GET")).toBe(true);
    });
  }

  it("a class with image answers off reads the same about files", async () => {
    const s = server("794589");
    await s.open();
    render(<StudentExamForm token="st" projectCode="794589" onClose={() => {}} saveDelayMs={5} />);
    const files = await goToFileQuestions("794589");
    await settle();
    expect(box(files[0].questionId)!.textContent).toContain("سلّم الملف لمعلمك مباشرة");
    const note = document.querySelector(".eb-sp-form-note")!.textContent || "";
    expect(note).toMatch(/15 سؤالًا تحتاج صورًا أو ملفات/);
    expect(note).toContain("الملفات تُسلَّم لمعلمك مباشرة ولا تُرفع إلى الموقع");
    expect(document.body.textContent).not.toMatch(/إرفاق الملفات سيتاح|إرفاقها سيتاح/);
  });
});
