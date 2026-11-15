// @vitest-environment happy-dom
/// <reference types="node" />
// What is left to answer — the student's exam form says, without a submit attempt, which required questions still wait:
// a count on every section, a tag on every such question, and one button that goes to the next unanswered question
// (its section, the question itself, the focus in its field). Over the REAL handlers (in-memory container), for the
// forms of the three projects. The list is the server's (`progress.missing`), so it follows each save.
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
type Entry = { id: string };
type Question = { questionId: string; kind: string; required: boolean; grading: string; minRows?: number; columns?: Entry[]; options?: Entry[]; justification?: boolean; left?: Entry[]; right?: Entry[]; items?: Entry[]; max?: number };
type Section = { sectionId: string; title: string; order: number; questions: Question[] };
const NOW = "2026-11-15T00:00:00.000Z";
const CODES = ["794589", "883589", "899373"] as const;
const sectionsOf = (code: string) => (getExamFormTemplate(code) as { sections: Section[] }).sections;
// With image answers off (the class of these tests) image and file questions wait and are never «missing».
const countsFor = (code: string) => sectionsOf(code).map(s => s.questions.filter(q => q.required && q.kind !== "image" && q.kind !== "file").length);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

function server(code: string) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": { classId: "c1", name: "صف c1", active: true, status: "active", studentIds: [], programCodes: [code], schoolYear: "2026", updatedAt: NOW, createdAt: NOW },
    "platform/users/s1.json": { userId: "s1", role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: "طالب s1", code: "Cs1" }
  });
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const studentDeps = { ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) };
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const student = async (method: string, body?: Body) => (await studentForm({ method, url: "https://x/api/student-project-exam-form?projectCode=" + code, json: async () => ({ projectCode: code, ...(body || {}) }) }, studentDeps)) as { status: number; jsonBody: Body };
  globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const r = await student(init?.method || "GET", init?.body ? JSON.parse(String(init.body)) as Body : undefined);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  const open = () => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: code, classId: "c1", action: "examForm.open" }) }, teacherDeps);
  // Every answerable question answered, except the ones named.
  const answerAllBut = async (skip: string[]) => {
    const answers = Object.fromEntries(sectionsOf(code).flatMap(s => s.questions).filter(q => q.kind !== "image" && q.kind !== "file" && !skip.includes(q.questionId)).map(q => [q.questionId, fullAnswer(q)]));
    expect((await student("POST", { action: "saveDraft", baseRevision: 0, answers })).status).toBe(200);
  };
  return { open, student, answerAllBut };
}
const mount = (code: string) => render(<StudentExamForm token="st" projectCode={code} onClose={() => {}} saveDelayMs={5} />);
const nav = () => within(screen.getByRole("navigation", { name: "أقسام الاستمارة" }));
const chips = () => nav().getAllByRole("button").map(b => b.textContent || "");
const bar = () => screen.queryByTestId("exam-form-remaining");
const box = (id: string) => document.querySelector('[data-question="' + id + '"]') as HTMLElement | null;
const unansweredOnPage = () => Array.from(document.querySelectorAll('[data-unanswered="true"]')).map(e => e.getAttribute("data-question"));
const next = () => fireEvent.click(within(bar()!).getByRole("button", { name: "انتقل إلى السؤال التالي غير المُجاب" }));
const settle = async (turns = 5) => { for (let i = 0; i < turns; i += 1) await act(async () => { await new Promise(resolve => { setTimeout(resolve, 10); }); }); };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("what is left — every bundled form", () => {
  for (const code of CODES) {
    it(code + ": a new form shows what is left on every section and tags every required question", async () => {
      const s = server(code);
      await s.open();
      mount(code);
      await screen.findByRole("navigation", { name: "أقسام الاستمارة" });
      const sections = sectionsOf(code), counts = countsFor(code), total = counts.reduce((a, b) => a + b, 0);
      expect(chips()).toEqual(sections.map((sec, i) => sec.order + " " + sec.title + (counts[i] ? " · بقي " + counts[i] : " · مكتمل")));
      expect(bar()!.textContent).toContain("بقي " + total + " سؤالًا إلزاميًا في " + (counts.filter(Boolean).length > 10 ? counts.filter(Boolean).length + " قسمًا" : counts.filter(Boolean).length + " أقسام"));
      // The first section: its required answerable questions are tagged, the others are not.
      for (const q of sections[0].questions) {
        const waits = q.required && q.kind !== "image" && q.kind !== "file";
        expect(box(q.questionId)!.getAttribute("data-unanswered"), q.questionId).toBe(waits ? "true" : null);
        expect((box(q.questionId)!.querySelector("legend")!.textContent || "").includes("لم يُجب بعد"), q.questionId).toBe(waits);
      }
    });
  }
});

describe("what is left — following the student's work (883589)", () => {
  const CODE = "883589";
  const SECTIONS = sectionsOf(CODE);
  // Three required questions left, in three different sections, none of them the first of its section.
  const LEFT = [SECTIONS[1].questions[1], SECTIONS[6].questions[2], SECTIONS[11].questions[3]];

  it("an answer that is saved leaves the list: the tag goes, the section's count and the total go down", async () => {
    const s = server(CODE);
    await s.open();
    mount(CODE);
    await screen.findByRole("navigation", { name: "أقسام الاستمارة" });
    const first = SECTIONS[0].questions[0];
    const before = countsFor(CODE);
    expect(box(first.questionId)!.getAttribute("data-unanswered")).toBe("true");
    fireEvent.change(box(first.questionId)!.querySelector("input, textarea")!, { target: { value: "نظام مكتبة" } });
    await waitFor(() => expect(box(first.questionId)!.getAttribute("data-unanswered")).toBeNull());
    expect(box(first.questionId)!.textContent).not.toContain("لم يُجب بعد");
    expect(chips()[0]).toBe("1 " + SECTIONS[0].title + " · بقي " + (before[0] - 1));
    expect(bar()!.textContent).toContain("بقي " + (before.reduce((a, b) => a + b, 0) - 1) + " سؤالًا إلزاميًا");
  });

  it("coming back to a partly filled form: the button goes from one unanswered question to the next, across sections, and around", async () => {
    const s = server(CODE);
    await s.open();
    await s.answerAllBut(LEFT.map(q => q.questionId));
    mount(CODE);
    await screen.findByRole("navigation", { name: "أقسام الاستمارة" });
    expect(bar()!.textContent).toContain("بقي 3 أسئلة إلزامية في 3 أقسام");
    const done = chips().filter(c => c.endsWith(" · مكتمل")).length;
    expect(done).toBe(SECTIONS.length - 3);
    expect(chips().filter(c => c.endsWith(" · بقي 1"))).toHaveLength(3);
    // The page resumed at the first section that misses something; only the one question there is tagged.
    await waitFor(() => expect(box(LEFT[0].questionId)).not.toBeNull());
    expect(unansweredOnPage()).toEqual([LEFT[0].questionId]);

    for (const q of [LEFT[0], LEFT[1], LEFT[2], LEFT[0]]) {                          // … and around to the first again
      next();
      await waitFor(() => expect(box(q.questionId)).not.toBeNull());
      await settle(2);
      expect(nav().getByRole("button", { current: "step" }).textContent).toContain(SECTIONS.find(x => x.questions.includes(q))!.title);
      expect(box(q.questionId)!.contains(document.activeElement), q.questionId).toBe(true);
      expect(unansweredOnPage()).toEqual([q.questionId]);
    }
  });

  it("from a section the student opened by hand, the button starts at that section", async () => {
    const s = server(CODE);
    await s.open();
    await s.answerAllBut(LEFT.map(q => q.questionId));
    mount(CODE);
    await screen.findByRole("navigation", { name: "أقسام الاستمارة" });
    fireEvent.click(nav().getByRole("button", { name: new RegExp(escape(SECTIONS[8].title)) }));     // past the second one left
    await waitFor(() => expect(box(SECTIONS[8].questions[0].questionId)).not.toBeNull());
    next();
    await waitFor(() => expect(box(LEFT[2].questionId)).not.toBeNull());
    expect(box(LEFT[2].questionId)!.contains(document.activeElement)).toBe(true);
  });

  it("with every required question answered the line says so and offers the way to the submit", async () => {
    const s = server(CODE);
    await s.open();
    await s.answerAllBut([]);
    mount(CODE);
    await screen.findByRole("navigation", { name: "أقسام الاستمارة" });
    expect(bar()!.textContent).toContain("أجبت عن كل الأسئلة الإلزامية");
    expect(within(bar()!).queryByRole("button", { name: /غير المُجاب/ })).toBeNull();
    expect(chips().every(c => c.endsWith(" · مكتمل"))).toBe(true);
    expect(unansweredOnPage()).toEqual([]);
    fireEvent.click(within(bar()!).getByRole("button", { name: "انتقل إلى التسليم" }));
    expect(await screen.findByRole("button", { name: "تسليم الاستمارة" })).toBeTruthy();
    expect(within(bar()!).queryByRole("button", { name: "انتقل إلى التسليم" })).toBeNull();          // already there
  });

  it("a submitted form is a record: no line, no tags, no counts", async () => {
    const s = server(CODE);
    await s.open();
    await s.answerAllBut([]);
    expect((await s.student("POST", { action: "submit", baseRevision: 1 })).status).toBe(200);
    mount(CODE);
    await screen.findByRole("navigation", { name: "أقسام الاستمارة" });
    await settle();
    expect(bar()).toBeNull();
    expect(unansweredOnPage()).toEqual([]);
    expect(chips().some(c => c.includes("بقي"))).toBe(false);
    expect(document.body.textContent).not.toContain("لم يُجب بعد");
  });
});
