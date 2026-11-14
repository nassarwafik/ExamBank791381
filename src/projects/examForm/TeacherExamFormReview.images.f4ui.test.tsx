// @vitest-environment happy-dom
/// <reference types="node" />
// Phase F4-UI — the images of a student's exam form in the teacher's review, over the REAL handlers (in-memory container)
// with real images: the review shows what the student attached, read with the teacher's session through the class's own
// route (never a public address); the page offers nothing that changes them; an image the server will not serve (it
// belongs to another student) is never shown; a failed read can be tried again; an expired session signs the teacher out.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, act, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import TeacherExamFormReview from "./TeacherExamFormReview";
import { TEACHER_SESSION_EXPIRED_EVENT, teacherFetchBlob } from "../../teacherFetch";

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../../api/src/functions/project-tracker.js");
const { handler: studentForm } = nodeRequire("../../../api/src/functions/student-project-exam-form.js");
const { getExamFormTemplate, getStorageNamespace } = nodeRequire("../../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../../api/tests/fixtures/memory-container.js");
const sharp = nodeRequire("../../../api/node_modules/sharp");

type Body = Record<string, unknown>;
type Question = { questionId: string; kind: string; images?: { min: number; max: number } };
type Section = { sectionId: string; title: string; questions: Question[] };
type Ref = { id: string };
type Doc = { answers: Record<string, { text?: string; images?: Ref[] }> };
const CODE = "794589";
const NS = getStorageNamespace(CODE);
const NOW = "2026-11-14T00:00:00.000Z";
const SECTIONS = (getExamFormTemplate(CODE) as { sections: Section[] }).sections;
const QUESTIONS = SECTIONS.flatMap(s => s.questions);
const MANY = QUESTIONS.find(q => q.kind === "image" && q.images!.max >= 2)!;
const HOST = QUESTIONS.find(q => q.kind === "cli" && q.images)!;
const sectionOf = (q: Question) => SECTIONS.find(s => s.questions.includes(q))!;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const user = (id: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: "طالب " + id, code: "C" + id });
const png = async (shade: number) => "data:image/png;base64," + (await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 20, g: shade, b: 200 } } }).png().toBuffer() as Buffer).toString("base64");

type Sent = { method: string; url: string; headers: Record<string, string> };

function server() {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": { classId: "c1", name: "صف c1", active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW },
    "platform/users/s1.json": user("s1"), "platform/users/s2.json": user("s2")
  });
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const studentDeps = (id: string) => ({ ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: id, sv: 1 }, student: ctx.getJson("platform/users/" + id + ".json") }) });
  const sent: Sent[] = [];
  const state = { failImageReads: 0 };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    sent.push({ method, url, headers: Object.fromEntries(Array.from(new Headers(init?.headers || {}).entries()).map(([key, value]) => [key.toLowerCase(), value])) });
    if (url.includes("resource=exam-form-image") && state.failImageReads > 0) { state.failImageReads -= 1; return { ok: false, status: 503, json: async () => ({}), blob: async () => new Blob(["{}"]), headers: new Headers() } as unknown as Response; }
    const r = (await tracker({ method, url: "https://x" + url, json: async () => body ?? {} }, teacherDeps)) as { status: number; jsonBody?: Body; body?: Buffer; headers?: Record<string, string> };
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody, text: async () => JSON.stringify(r.jsonBody), blob: async () => new Blob([new Uint8Array(r.body as Buffer)], { type: r.headers?.["content-type"] || "" }), headers: new Headers() } as unknown as Response;
  }) as unknown as typeof fetch;
  const teacher = (action: string, extra: Body = {}) => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId: "c1", action, ...extra }) }, teacherDeps);
  const student = async (id: string, body: Body) => (await studentForm({ method: "POST", url: "https://x/api/student-project-exam-form", json: async () => ({ projectCode: CODE, ...body }) }, studentDeps(id))) as { status: number };
  const doc = (id: string) => ctx.getJson(NS.examFormAnswersName("c1", id)) as Doc;
  const imageReads = () => sent.filter(r => r.url.includes("resource=exam-form-image"));
  return { ctx, sent, state, teacher, student, doc, imageReads };
}
// The class has image answers on; s1 attached two images to MANY, and commands with one image to HOST.
async function classWithImages() {
  const s = server();
  await s.teacher("examForm.open", { imageAnswers: true });
  expect((await s.student("s1", { action: "addImage", questionId: MANY.questionId, dataUrl: await png(10) })).status).toBe(200);
  expect((await s.student("s1", { action: "addImage", questionId: MANY.questionId, dataUrl: await png(200) })).status).toBe(200);
  expect((await s.student("s1", { action: "saveDraft", baseRevision: 0, answers: { [HOST.questionId]: { text: "access-list 10 permit any" } } })).status).toBe(200);
  expect((await s.student("s1", { action: "addImage", questionId: HOST.questionId, dataUrl: await png(90) })).status).toBe(200);
  return s;
}
const mount = (studentId = "s1") => render(<TeacherExamFormReview token="t" projectCode={CODE} classId="c1" studentId={studentId} onClose={() => {}} />);
const box = (q: Question) => document.querySelector('[data-question="' + q.questionId + '"]') as HTMLElement;
async function goTo(q: Question) {
  const nav = await screen.findByRole("navigation", { name: "أقسام الاستمارة" });
  fireEvent.click(within(nav).getByRole("button", { name: new RegExp(escape(sectionOf(q).title)) }));
  await waitFor(() => expect(box(q)).not.toBeNull());
  return box(q);
}
const settle = async (turns = 6) => { for (let i = 0; i < turns; i += 1) await act(async () => { await new Promise(resolve => { setTimeout(resolve, 12); }); }); };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("F4-UI — the student's images in the teacher's review", () => {
  it("shows the attached images, read with the teacher's session through the class's own route", async () => {
    const s = await classWithImages();
    const [first, second] = s.doc("s1").answers[MANY.questionId].images!;
    mount();
    const q = await goTo(MANY);
    await waitFor(() => expect(q.querySelectorAll("img")).toHaveLength(2));
    expect(q.querySelector("[data-images]")?.getAttribute("data-images")).toBe("2");
    expect(q.textContent).toMatch(/أرفق الطالب صورًا لهذا السؤال \(العدد:\s*2\)/);
    expect(q.textContent).not.toContain("يُضاف مع واجهة الصور");
    expect(s.imageReads().map(r => r.url).sort()).toEqual([first.id, second.id].map(id => "/api/project-tracker?projectCode=" + CODE + "&resource=exam-form-image&classId=c1&studentId=s1&imageId=" + id).sort());
    expect(s.imageReads().every(r => r.method === "GET" && r.headers["x-builder-token"] === "t" && r.headers.authorization === "Bearer t")).toBe(true);
    for (const img of Array.from(q.querySelectorAll("img"))) {
      expect(img.getAttribute("src")).toMatch(/^blob:/);
      expect(img.getAttribute("src")).not.toContain(first.id);
    }
    // To look at, and to enlarge: nothing here attaches or removes.
    await settle();
    expect(q.querySelector('input[type="file"]')).toBeNull();
    expect(within(q).queryByRole("button", { name: /إرفاق|حذف/ })).toBeNull();
    fireEvent.click(within(q).getByRole("button", { name: "تكبير الصورة 1" }));
    expect(within(q).getByRole("button", { name: "تصغير الصورة 1" })).toBeTruthy();
    expect(s.sent.every(r => r.method === "GET")).toBe(true);
  });

  it("shows the commands of a code question together with its image", async () => {
    await classWithImages();
    mount();
    const q = await goTo(HOST);
    await waitFor(() => expect(q.querySelectorAll("img")).toHaveLength(1));
    const commands = q.querySelector("textarea") as HTMLTextAreaElement;
    expect(commands.value).toBe("access-list 10 permit any");
    expect(commands.disabled).toBe(true);
    expect(q.textContent).toMatch(/العدد:\s*1/);
    expect(q.textContent).not.toContain("سيتاح قريبًا");
  });

  it("never shows an image the server does not serve for this student", async () => {
    const s = await classWithImages();
    // s2's answers are made to name an image that belongs to s1: the route answers 404 (the blob is s1's).
    const stolen = s.doc("s1").answers[MANY.questionId].images![0];
    await s.student("s2", { action: "saveDraft", baseRevision: 0, answers: { S01Q01: { text: "مسودة" } } });
    const name = NS.examFormAnswersName("c1", "s2");
    const forged = s.ctx.getJson(name) as Doc;
    forged.answers[MANY.questionId] = { images: [stolen] };
    s.ctx.setJson(name, forged);
    mount("s2");
    const q = await goTo(MANY);
    await waitFor(() => expect(q.textContent).toContain("تعذر عرض الصورة"));
    await settle();
    expect(q.querySelectorAll("img")).toHaveLength(0);
    expect(s.imageReads().map(r => r.url)).toEqual(["/api/project-tracker?projectCode=" + CODE + "&resource=exam-form-image&classId=c1&studentId=s2&imageId=" + stolen.id]);
  });

  it("offers a retry when an image cannot be read", async () => {
    const s = await classWithImages();
    s.state.failImageReads = 1;
    mount();
    const q = await goTo(HOST);
    const retry = await within(q).findByRole("button", { name: "إعادة المحاولة" });
    expect(q.querySelectorAll("img")).toHaveLength(0);
    fireEvent.click(retry);
    await waitFor(() => expect(q.querySelectorAll("img")).toHaveLength(1));
    expect(q.textContent).not.toContain("تعذر عرض الصورة");
  });
});

describe("F4-UI — the teacher's read of a protected file", () => {
  const answer = (status: number, body = "bytes") => { globalThis.fetch = vi.fn(async () => ({ ok: status < 400, status, blob: async () => new Blob([body]), headers: new Headers() })) as unknown as typeof fetch; };

  it("returns the bytes of a served file, sent with the teacher's session", async () => {
    answer(200);
    const blob = await teacherFetchBlob("tok", "/api/project-tracker?x=1");
    expect(blob.size).toBe(5);
    expect(vi.mocked(globalThis.fetch).mock.calls[0]).toEqual(["/api/project-tracker?x=1", { headers: { "x-builder-token": "tok", Authorization: "Bearer tok" } }]);
  });

  it("a refusal is an error, never the body returned as a file", async () => {
    answer(404, '{"ok":false}');
    await expect(teacherFetchBlob("tok", "/u", "تعذر تحميل الصورة.")).rejects.toMatchObject({ status: 404, message: "تعذر تحميل الصورة." });
    globalThis.fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(teacherFetchBlob("tok", "/u")).rejects.toMatchObject({ status: 0 });
  });

  it("an expired session is announced once and fails with the session text", async () => {
    answer(401);
    const heard = vi.fn();
    window.addEventListener(TEACHER_SESSION_EXPIRED_EVENT, heard);
    await expect(teacherFetchBlob("tok", "/u")).rejects.toMatchObject({ status: 401 });
    window.removeEventListener(TEACHER_SESSION_EXPIRED_EVENT, heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
