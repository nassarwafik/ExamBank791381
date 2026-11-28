// @vitest-environment happy-dom
/// <reference types="node" />
// DG8 — «أرفق بالاستمارة» (docs/enterprise-diagram-editor-design.md §20), end to end over the REAL form handlers (in-memory container) with
// a real PNG: the picture of a diagram attached to an image question of the student's own project form through the form's own image
// request — nothing new on the server, which sniffs, bounds, re-encodes and stores it as it does a photo.
//   • the image questions of the form, in order, with their counts; «أرفق هنا» sends ONE addImage request with a PNG data URL, the
//     server stores the image under the question, the count follows and a full question's button is off;
//   • nothing is offered (and nothing is sent) while the form is not opened, its image answers are off, or it is closed / submitted;
//   • a refusal from the server (the teacher closed the form meanwhile) is shown as it comes, and the panel never sends two at once;
//   • a picture that is not an image is refused before anything is sent.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, act, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import DiagramAttachPanel, { attachBlockedReason, imageQuestionsOf } from "./DiagramAttachPanel";

const nodeRequire = createRequire(import.meta.url);
const { handler: studentForm } = nodeRequire("../../../api/src/functions/student-project-exam-form.js");
const { handler: tracker } = nodeRequire("../../../api/src/functions/project-tracker.js");
const { getExamFormTemplate, getStorageNamespace } = nodeRequire("../../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../../api/tests/fixtures/memory-container.js");
const sharp = nodeRequire("../../../api/node_modules/sharp");

type Body = Record<string, unknown>;
type Question = { questionId: string; kind: string; prompt: string; images?: { min: number; max: number } };
type Section = { sectionId: string; title: string; order: number; questions: Question[] };
type Doc = { answers: Record<string, { images?: { id: string }[] }> };
const CODE = "794589";
const NS = getStorageNamespace(CODE);
const NOW = "2026-11-14T00:00:00.000Z";
const SECTIONS = (getExamFormTemplate(CODE) as { sections: Section[] }).sections;
const IMAGE_QUESTIONS = SECTIONS.flatMap(s => s.questions).filter(q => q.kind === "image");
const ONE = IMAGE_QUESTIONS.find(q => q.images!.min === 1 && q.images!.max === 1)!;
const MANY = IMAGE_QUESTIONS.find(q => q.images!.max === 3)!;
type Sent = { method: string; url: string; body?: Body };

function server() {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": { classId: "c1", name: "صف c1", active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW },
    "platform/users/s1.json": { userId: "s1", role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: "طالب s1", code: "Cs1" }
  });
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const studentDeps = { ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) };
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const call = async (method: string, url: string, body?: Body) => {
    const handle = url.startsWith("/api/student-project-exam-form") ? (req: unknown) => studentForm(req, studentDeps) : (req: unknown) => tracker(req, teacherDeps);
    return (await handle({ method, url: "https://x" + url, json: async () => body ?? {} })) as { status: number; jsonBody?: Body };
  };
  const sent: Sent[] = [];
  const state = { inFlight: 0, mostAtOnce: 0, hold: null as Promise<void> | null };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    sent.push({ method, url, body });
    if (method === "POST") { state.inFlight += 1; state.mostAtOnce = Math.max(state.mostAtOnce, state.inFlight); }
    try {
      if (state.hold && body?.action === "addImage") await state.hold;
      const r = await call(method, url, body);
      return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as unknown as Response;
    } finally { if (method === "POST") state.inFlight -= 1; }
  }) as unknown as typeof fetch;
  const teacher = (action: string, extra: Body = {}) => call("POST", "/api/project-tracker", { projectCode: CODE, classId: "c1", action, ...extra });
  const doc = () => (ctx.has(NS.examFormAnswersName("c1", "s1")) ? ctx.getJson(NS.examFormAnswersName("c1", "s1")) : null) as Doc | null;
  const posts = () => sent.filter(r => r.method === "POST");
  return { sent, state, teacher, doc, posts };
}

/** A real PNG, as the editor's «حفظ صورة PNG» makes one. */
const picture = async (width = 900, height = 600) => new Blob([new Uint8Array(await sharp({ create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer())], { type: "image/png" });
const settle = async (turns = 6) => { for (let i = 0; i < turns; i += 1) await act(async () => { await new Promise(resolve => { setTimeout(resolve, 12); }); }); };
const show = (blob: Blob, onAttached = vi.fn()) => { render(<DiagramAttachPanel token="st" projectCode={CODE} picture={blob} title="مخطط الأصناف" onClose={() => {}} onAttached={onAttached} />); return onAttached; };
const row = (q: Question) => screen.getByTestId("diagram-attach-to-" + q.questionId).closest("li")!;

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("DG8 — attaching the diagram's picture to the form", () => {
  it("lists the image questions in the form's order with their counts; «أرفق هنا» sends one addImage that the server stores", async () => {
    const s = server();
    await s.teacher("examForm.open", { imageAnswers: true });
    const onAttached = show(await picture());
    await screen.findByTestId("diagram-attach-questions");
    expect(screen.getByTestId("diagram-attach-preview").getAttribute("alt")).toBe("صورة مخطط الأصناف التي ستُرفق");
    expect([...screen.getByTestId("diagram-attach-questions").querySelectorAll("li strong")].map(e => e.textContent)).toEqual(IMAGE_QUESTIONS.map(q => q.prompt));
    expect(row(ONE).textContent).toContain("0 من 1 صورة");
    fireEvent.click(screen.getByTestId("diagram-attach-to-" + ONE.questionId));
    await screen.findByTestId("diagram-attach-done");
    const adds = s.posts().filter(r => r.body?.action === "addImage");
    expect(adds).toHaveLength(1);
    expect(adds[0].body).toMatchObject({ projectCode: CODE, action: "addImage", questionId: ONE.questionId });
    expect(String(adds[0].body!.dataUrl)).toMatch(/^data:image\/png;base64,/);
    // the server's own record: one image under the question
    expect(s.doc()!.answers[ONE.questionId].images).toHaveLength(1);
    expect(screen.getByTestId("diagram-attach-done").textContent).toContain("أُرفقت صورة مخطط الأصناف بالسؤال «" + ONE.prompt + "»");
    expect(row(ONE).textContent).toContain("1 من 1 صورة — اكتمل العدد");
    expect((screen.getByTestId("diagram-attach-to-" + ONE.questionId) as HTMLButtonElement).disabled).toBe(true);
    expect(onAttached).toHaveBeenCalledTimes(1);
  });

  it("a question that takes several: each «أرفق هنا» adds one more, up to its maximum", async () => {
    const s = server();
    await s.teacher("examForm.open", { imageAnswers: true });
    show(await picture());
    await screen.findByTestId("diagram-attach-questions");
    for (let i = 1; i <= MANY.images!.max; i++) {
      fireEvent.click(screen.getByTestId("diagram-attach-to-" + MANY.questionId));
      await waitFor(() => expect(row(MANY).textContent).toContain(i + " من " + MANY.images!.max));
    }
    expect(s.doc()!.answers[MANY.questionId].images).toHaveLength(MANY.images!.max);
    expect((screen.getByTestId("diagram-attach-to-" + MANY.questionId) as HTMLButtonElement).disabled).toBe(true);
  });

  it("nothing is offered, and nothing sent, while the form is not opened or its image answers are off", async () => {
    const s = server();
    show(await picture());
    expect((await screen.findByTestId("diagram-attach-blocked")).textContent).toBe("لم يفتح معلمك استمارة هذا المشروع بعد.");
    cleanup();
    await s.teacher("examForm.open");
    show(await picture());
    expect((await screen.findByTestId("diagram-attach-blocked")).textContent).toBe("أسئلة الصور غير مفعّلة في استمارة هذا المشروع بعد.");
    await settle();
    expect(screen.queryByTestId("diagram-attach-questions")).toBeNull();
    expect(s.posts()).toEqual([]);
  });

  it("a form the teacher closed meanwhile: the server refuses, and its words are shown; never two requests at once", async () => {
    const s = server();
    await s.teacher("examForm.open", { imageAnswers: true });
    show(await picture());
    await screen.findByTestId("diagram-attach-questions");
    await s.teacher("examForm.close");
    let release!: () => void;
    s.state.hold = new Promise<void>(r => { release = r; });
    fireEvent.click(screen.getByTestId("diagram-attach-to-" + MANY.questionId));
    await waitFor(() => expect(screen.getByTestId("diagram-attach-to-" + MANY.questionId).textContent).toBe("جارٍ الإرفاق…"));
    fireEvent.click(screen.getByTestId("diagram-attach-to-" + MANY.questionId));
    fireEvent.click(screen.getByTestId("diagram-attach-to-" + ONE.questionId));
    release();
    const error = await screen.findByTestId("diagram-attach-error");
    expect(error.textContent).toBeTruthy();
    expect(s.posts().filter(r => r.body?.action === "addImage")).toHaveLength(1);
    expect(s.state.mostAtOnce).toBe(1);
    expect(s.doc()?.answers?.[MANY.questionId]?.images ?? []).toHaveLength(0);
  });

  it("a picture that is not an image is refused before anything is sent", async () => {
    const s = server();
    await s.teacher("examForm.open", { imageAnswers: true });
    show(new Blob(["not a picture"], { type: "text/plain" }));
    await screen.findByTestId("diagram-attach-questions");
    fireEvent.click(screen.getByTestId("diagram-attach-to-" + ONE.questionId));
    expect((await screen.findByTestId("diagram-attach-error")).textContent).toMatch(/نوع الملف غير مدعوم/);
    expect(s.posts()).toEqual([]);
  });
});

describe("the panel's own readers", () => {
  it("why nothing can be attached, by the form's state; and the image questions in the sections' order", () => {
    const base = { ok: true, projectCode: CODE, available: true, state: "open", form: { projectCode: CODE, formVersion: 1, title: "t", sections: [
      { sectionId: "b", title: "ب", order: 2, questions: [{ questionId: "q2", prompt: "صورة 2", kind: "image", grading: "teacher", required: false, images: { min: 0, max: 2 } }] },
      { sectionId: "a", title: "أ", order: 1, questions: [{ questionId: "q0", prompt: "نص", kind: "shortText", grading: "teacher", required: false }, { questionId: "q1", prompt: "صورة 1", kind: "image", grading: "teacher", required: true }] },
    ] }, answers: { q2: { images: [{ id: "i1", width: 1, height: 1, bytes: 1 }] } }, revision: 1, status: "draft", submittedAt: "", updatedAt: "", progress: { total: 3, answered: 0, deferred: 0, missing: [] }, deferredKinds: [] } as const;
    const v = base as unknown as Parameters<typeof imageQuestionsOf>[0];
    expect(imageQuestionsOf(v).map(q => [q.section, q.question.questionId, q.count, q.max])).toEqual([["أ", "q1", 0, 1], ["ب", "q2", 1, 2]]);
    expect(attachBlockedReason(v)).toBeNull();
    expect(attachBlockedReason(null)).toMatch(/لم يفتح معلمك/);
    expect(attachBlockedReason({ ...v, deferredKinds: ["image"] })).toMatch(/غير مفعّلة/);
    expect(attachBlockedReason({ ...v, status: "submitted" })).toMatch(/سلّمت الاستمارة/);
    expect(attachBlockedReason({ ...v, status: "approved" })).toMatch(/اعتمد معلمك/);
    expect(attachBlockedReason({ ...v, status: "returned" })).toBeNull();
    expect(attachBlockedReason({ ...v, state: "closed" })).toMatch(/مغلقة/);
    expect(attachBlockedReason({ ...v, readOnly: true })).toMatch(/مغلقة/);
    expect(attachBlockedReason({ ...v, form: { ...v.form, sections: [] } })).toMatch(/لا سؤال صورة/);
  });
});
