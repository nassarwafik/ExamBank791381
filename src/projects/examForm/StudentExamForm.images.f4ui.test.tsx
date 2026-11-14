// @vitest-environment happy-dom
/// <reference types="node" />
// Phase F4-UI — the images of the student's project exam form, end to end over the REAL handlers (in-memory container) with
// real images: where the class has image answers on, an image question takes images from the page (sanitized and stored by
// the server, shown from the student's own session), up to the question's maximum; one can be removed after a confirmation;
// a file that is not an image is refused; a code question keeps its text and its images together; the page sends one
// request at a time; a required image question blocks the submit until it is attached; a submitted form shows the images
// read-only. Where the class has them off, the page is exactly what it was.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, act, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import StudentExamForm from "./StudentExamForm";

const nodeRequire = createRequire(import.meta.url);
const { handler: studentForm } = nodeRequire("../../../api/src/functions/student-project-exam-form.js");
const { handler: tracker } = nodeRequire("../../../api/src/functions/project-tracker.js");
const { getExamFormTemplate, getStorageNamespace } = nodeRequire("../../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../../api/tests/fixtures/memory-container.js");
const sharp = nodeRequire("../../../api/node_modules/sharp");

type Body = Record<string, unknown>;
type Entry = { id: string };
type Question = { questionId: string; kind: string; required: boolean; images?: { min: number; max: number }; minRows?: number; columns?: Entry[]; options?: Entry[]; justification?: boolean; left?: Entry[]; right?: Entry[]; items?: Entry[]; max?: number };
type Section = { sectionId: string; title: string; questions: Question[] };
type Ref = { id: string; width: number; height: number; bytes: number };
type Doc = { status: string; revision: number; answers: Record<string, { text?: string; images?: Ref[] }> };
const CODE = "794589";
const NS = getStorageNamespace(CODE);
const NOW = "2026-11-14T00:00:00.000Z";
const SECTIONS = (getExamFormTemplate(CODE) as { sections: Section[] }).sections;
const QUESTIONS = SECTIONS.flatMap(s => s.questions);
const IMAGE_QUESTIONS = QUESTIONS.filter(q => q.kind === "image");
const ONE = IMAGE_QUESTIONS.find(q => q.images!.min === 1 && q.images!.max === 1)!;          // exactly one image
const MANY = IMAGE_QUESTIONS.find(q => q.images!.min === 2 && q.images!.max === 3)!;         // two to three
const HOST = QUESTIONS.find(q => q.kind === "cli" && q.images)!;                             // commands, and images beside them
const TEXT = QUESTIONS.find(q => q.kind === "shortText")!;
const WITH_IMAGES = QUESTIONS.filter(q => q.kind !== "file");                                // what counts where images are on
const sectionOf = (q: Question) => SECTIONS.find(s => s.questions.includes(q))!;
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

// Real images, made by the library the server's pipeline uses.
const pngBytes = (width = 320, height = 200, shade = 120): Promise<Buffer> => sharp({ create: { width, height, channels: 3, background: { r: 20, g: shade, b: 200 } } }).png().toBuffer();
const pngFile = async (name = "screen.png", width = 320, height = 200, shade = 120) => new File([new Uint8Array(await pngBytes(width, height, shade))], name, { type: "image/png" });
const pngDataUrl = async (shade = 120) => "data:image/png;base64," + (await pngBytes(64, 48, shade)).toString("base64");

type Sent = { method: string; url: string; body?: Body; headers: Record<string, string> };

function server({ images = true }: { images?: boolean } = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": { classId: "c1", name: "صف c1", active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW },
    "platform/users/s1.json": { userId: "s1", role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: "طالب s1", code: "Cs1" }
  });
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const studentDeps = { ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) };
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const call = async (method: string, url: string, body?: Body) => {
    const handle = url.startsWith("/api/student-project-exam-form") ? (req: unknown) => studentForm(req, studentDeps) : (req: unknown) => tracker(req, teacherDeps);
    return (await handle({ method, url: "https://x" + url, json: async () => body ?? {} })) as { status: number; jsonBody?: Body; body?: Buffer; headers?: Record<string, string> };
  };
  const sent: Sent[] = [];
  const state: { inFlight: number; mostAtOnce: number; failImageReads: number; holdSaves: Promise<void> | null; holdUploads: Promise<void> | null } = { inFlight: 0, mostAtOnce: 0, failImageReads: 0, holdSaves: null, holdUploads: null };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    sent.push({ method, url, body, headers: (init?.headers || {}) as Record<string, string> });
    const write = method === "POST";
    if (write) { state.inFlight += 1; state.mostAtOnce = Math.max(state.mostAtOnce, state.inFlight); }
    try {
      if (state.holdSaves && body?.action === "saveDraft") await state.holdSaves;
      if (state.holdUploads && body?.action === "addImage") await state.holdUploads;
      if (!write && url.includes("image=") && state.failImageReads > 0) { state.failImageReads -= 1; return { ok: false, status: 503, json: async () => ({}), blob: async () => new Blob(["{}"]) } as unknown as Response; }
      const r = await call(method, url, body);
      return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody, blob: async () => new Blob([new Uint8Array(r.body as Buffer)], { type: r.headers?.["content-type"] || "" }) } as unknown as Response;
    } finally {
      if (write) state.inFlight -= 1;
    }
  }) as unknown as typeof fetch;
  const teacher = (action: string, extra: Body = {}) => call("POST", "/api/project-tracker", { projectCode: CODE, classId: "c1", action, ...extra });
  const student = (body: Body) => call("POST", "/api/student-project-exam-form", { projectCode: CODE, ...body });
  const addImage = async (questionId: string, shade = 120) => student({ action: "addImage", questionId, dataUrl: await pngDataUrl(shade) });
  const doc = () => (ctx.has(NS.examFormAnswersName("c1", "s1")) ? ctx.getJson(NS.examFormAnswersName("c1", "s1")) : null) as Doc | null;
  const blobs = () => (ctx.names("platform/project-exam-forms/" + CODE + "/images/") as string[]);
  const posts = () => sent.filter(r => r.method === "POST");
  return { ctx, sent, state, teacher, student, addImage, doc, blobs, posts, open: () => teacher("examForm.open", images ? { imageAnswers: true } : {}) };
}

const openForm = () => render(<StudentExamForm token="st" projectCode={CODE} onClose={() => {}} saveDelayMs={5} />);
const box = (q: Question) => document.querySelector('[data-question="' + q.questionId + '"]') as HTMLElement | null;
const nav = () => within(screen.getByRole("navigation", { name: "أقسام الاستمارة" }));
async function goTo(q: Question) {
  await screen.findByRole("navigation", { name: "أقسام الاستمارة" });
  fireEvent.click(nav().getByRole("button", { name: new RegExp(escape(sectionOf(q).title)) }));
  await waitFor(() => expect(box(q)).not.toBeNull());
  return box(q)!;
}
const fileInput = (q: Question) => box(q)!.querySelector('input[type="file"]') as HTMLInputElement | null;
const pick = (q: Question, files: File[]) => fireEvent.change(fileInput(q)!, { target: { files } });
const thumbnails = (q: Question) => Array.from(box(q)!.querySelectorAll("img"));
// Lets every pending request, timer and render finish: an assertion that something did NOT happen is made on a settled page.
const settle = async (turns = 6) => { for (let i = 0; i < turns; i += 1) await act(async () => { await new Promise(resolve => { setTimeout(resolve, 12); }); }); };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("F4-UI — a class with image answers off", () => {
  it("shows an image question as a notice with no input, and never asks for an image", async () => {
    const s = server({ images: false });
    await s.open();
    openForm();
    const q = await goTo(ONE);
    await settle();
    expect(q.textContent).toContain("إرفاق الصور سيتاح قريبًا");
    expect(q.querySelectorAll("input, button").length).toBe(0);
    expect(q.querySelector('[data-testid="exam-form-images"]')).toBeNull();
    expect(screen.getByText(/سؤالًا تحتاج صورًا أو ملفات/)).toBeTruthy();
    const host = await goTo(HOST);
    await settle();
    expect(host.textContent).toContain("إرفاق الصورة المطلوبة هنا سيتاح قريبًا");
    expect(host.querySelector('input[type="file"]')).toBeNull();
    expect(s.sent.every(r => r.method === "GET" && !r.url.includes("image="))).toBe(true);
  });
});

describe("F4-UI — attaching an image", () => {
  it("sends the picked image, shows what the server stored, and counts the question as answered", async () => {
    const s = server();
    await s.open();
    openForm();
    const q = await goTo(ONE);
    expect(q.textContent).toContain("لم تُرفق صورة بعد");
    expect(q.textContent).toContain("المطلوب صورة واحدة");
    expect(within(q).getByRole("button", { name: "إرفاق صورة" })).toBeTruthy();
    expect(fileInput(ONE)!.accept).toBe("image/jpeg,image/png,image/webp");
    expect(screen.getByText(new RegExp("أجبت عن 0 من " + WITH_IMAGES.length))).toBeTruthy();
    expect(screen.getByText(/سؤالان يحتاجان ملفات/)).toBeTruthy();                   // only the two file questions still wait

    pick(ONE, [await pngFile("cover.png", 2400, 1200)]);
    await waitFor(() => expect(s.doc()?.answers[ONE.questionId]?.images).toHaveLength(1));
    const stored = s.doc()!.answers[ONE.questionId].images![0];
    // The request names the project, the question and the image only: the student and the class come from the session.
    const post = s.posts()[0];
    expect(Object.keys(post.body!).sort()).toEqual(["action", "dataUrl", "projectCode", "questionId"]);
    expect(post.body).toMatchObject({ projectCode: CODE, action: "addImage", questionId: ONE.questionId });
    expect(String(post.body!.dataUrl).startsWith("data:image/png;base64,")).toBe(true);
    // What is stored is the server's sanitized image, inside its 1600 px box, under this student.
    expect(stored).toMatchObject({ width: 1600, height: 800 });
    expect(s.blobs()).toEqual([NS.examFormImageName("c1", "s1", stored.id)]);
    expect(s.doc()).toMatchObject({ status: "draft", revision: 0 });

    // The thumbnail is read with the student's session (no public address) and shown from memory.
    await waitFor(() => expect(thumbnails(ONE)).toHaveLength(1));
    const read = s.sent.find(r => r.method === "GET" && r.url.includes("image="))!;
    expect(read.url).toBe("/api/student-project-exam-form?projectCode=" + CODE + "&image=" + stored.id);
    expect(read.headers).toMatchObject({ "x-student-token": "st", Authorization: "Bearer st" });
    const img = thumbnails(ONE)[0];
    expect(img.getAttribute("src")).toMatch(/^blob:/);
    expect(img.getAttribute("alt")).toBe("الصورة 1 المرفقة");
    expect(img.getAttribute("src")).not.toContain(stored.id);

    // The question is full (max 1): no more attaching; the server's progress counts it.
    await settle();
    expect(fileInput(ONE)).toBeNull();
    expect(within(box(ONE)!).queryByRole("button", { name: /إرفاق/ })).toBeNull();
    expect(box(ONE)!.textContent).toMatch(/الصور المرفقة:\s*1\s*من\s*1/);
    expect(screen.getByText(new RegExp("أجبت عن 1 من " + WITH_IMAGES.length))).toBeTruthy();
  });

  it("enlarges a thumbnail in place and back", async () => {
    const s = server();
    await s.open();
    await s.addImage(ONE.questionId);
    openForm();
    await goTo(ONE);
    const view = await within(box(ONE)!).findByRole("button", { name: "تكبير الصورة 1" });
    expect(view.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(view);
    expect(within(box(ONE)!).getByRole("button", { name: "تصغير الصورة 1" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(within(box(ONE)!).getByRole("button", { name: "تصغير الصورة 1" }));
    expect(within(box(ONE)!).getByRole("button", { name: "تكبير الصورة 1" })).toBeTruthy();
  });

  it("takes several picked images one after the other, and no more than the question holds", async () => {
    const s = server();
    await s.open();
    openForm();
    await goTo(MANY);
    expect(box(MANY)!.textContent).toContain("المطلوب 2 صور على الأقل، وحتى 3");
    expect(fileInput(MANY)!.multiple).toBe(true);
    pick(MANY, [await pngFile("a.png", 300, 200, 10), await pngFile("b.png", 300, 200, 60), await pngFile("c.png", 300, 200, 110), await pngFile("d.png", 300, 200, 160)]);
    await waitFor(() => expect(s.doc()?.answers[MANY.questionId]?.images).toHaveLength(3));
    await settle();
    expect(s.posts()).toHaveLength(3);                                              // the fourth was never sent
    expect(s.state.mostAtOnce).toBe(1);
    expect(s.blobs()).toHaveLength(3);
    expect(box(MANY)!.textContent).toContain("ما يسعه السؤال فقط (3)");
    await waitFor(() => expect(thumbnails(MANY)).toHaveLength(3));
    expect(fileInput(MANY)).toBeNull();
  });

  it("offers another image while the question has room", async () => {
    const s = server();
    await s.open();
    openForm();
    await goTo(MANY);
    pick(MANY, [await pngFile("a.png")]);
    await waitFor(() => expect(s.doc()?.answers[MANY.questionId]?.images).toHaveLength(1));
    expect(await within(box(MANY)!).findByRole("button", { name: "إرفاق صورة أخرى" })).toBeTruthy();
    expect(box(MANY)!.textContent).toMatch(/الصور المرفقة:\s*1\s*من\s*3/);
    // one of the two required images is there: the question is not answered yet
    expect(screen.getByText(new RegExp("أجبت عن 0 من " + WITH_IMAGES.length))).toBeTruthy();
  });
});

describe("F4-UI — files that are not acceptable", () => {
  it("refuses a file that is not an image without sending it", async () => {
    const s = server();
    await s.open();
    openForm();
    await goTo(ONE);
    pick(ONE, [new File(["router#show ip route"], "notes.txt", { type: "text/plain" })]);
    expect((await within(box(ONE)!).findByRole("alert")).textContent).toContain("نوع الملف غير مدعوم");
    await settle();
    expect(s.posts()).toEqual([]);
    expect(s.doc()).toBeNull();
    expect(within(box(ONE)!).getByRole("button", { name: "إرفاق صورة" })).toBeTruthy();
  });

  it("shows the server's refusal of a file that only claims to be an image, and stores nothing", async () => {
    const s = server();
    await s.open();
    openForm();
    await goTo(ONE);
    pick(ONE, [new File(["<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"], "shot.png", { type: "image/png" })]);
    const alert = await within(box(ONE)!).findByRole("alert");
    expect(alert.textContent!.length).toBeGreaterThan(5);
    await settle();
    expect(s.posts()).toHaveLength(1);
    expect(s.blobs()).toEqual([]);
    expect(s.doc()?.answers[ONE.questionId]).toBeUndefined();
    expect(thumbnails(ONE)).toHaveLength(0);
    // The page is still a working form: a real image is taken right after.
    pick(ONE, [await pngFile()]);
    await waitFor(() => expect(s.doc()?.answers[ONE.questionId]?.images).toHaveLength(1));
    await waitFor(() => expect(within(box(ONE)!).queryByRole("alert")).toBeNull());
  });
});

describe("F4-UI — removing an image", () => {
  it("removes one image only after the confirmation", async () => {
    const s = server();
    await s.open();
    await s.addImage(MANY.questionId, 10);
    await s.addImage(MANY.questionId, 200);
    const [first, second] = s.doc()!.answers[MANY.questionId].images!;
    openForm();
    await goTo(MANY);
    await waitFor(() => expect(thumbnails(MANY)).toHaveLength(2));

    fireEvent.click(within(box(MANY)!).getByRole("button", { name: "حذف الصورة 1" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await settle();
    expect(s.posts()).toEqual([]);
    expect(s.blobs()).toHaveLength(2);

    fireEvent.click(within(box(MANY)!).getByRole("button", { name: "حذف الصورة 1" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "حذف الصورة" }));
    await waitFor(() => expect(s.doc()?.answers[MANY.questionId]?.images).toEqual([expect.objectContaining({ id: second.id })]));
    expect(s.posts().map(r => r.body)).toEqual([{ projectCode: CODE, action: "removeImage", questionId: MANY.questionId, imageId: first.id }]);
    expect(s.blobs()).toEqual([NS.examFormImageName("c1", "s1", second.id)]);
    await waitFor(() => expect(thumbnails(MANY)).toHaveLength(1));
    expect(box(MANY)!.textContent).toMatch(/الصور المرفقة:\s*1\s*من\s*3/);
  });
});

describe("F4-UI — a question with text and images", () => {
  it("keeps the images on the page while the text is edited, and stores both", async () => {
    const s = server();
    await s.open();
    openForm();
    await goTo(HOST);
    const commands = () => box(HOST)!.querySelector("textarea") as HTMLTextAreaElement;
    expect(fileInput(HOST)).not.toBeNull();
    expect(box(HOST)!.textContent).not.toContain("سيتاح قريبًا");

    fireEvent.change(commands(), { target: { value: "access-list 10 permit 10.0.0.0" } });
    await waitFor(() => expect(s.doc()?.answers[HOST.questionId]?.text).toBe("access-list 10 permit 10.0.0.0"));
    pick(HOST, [await pngFile("acl.png")]);
    await waitFor(() => expect(s.doc()?.answers[HOST.questionId]?.images).toHaveLength(1));
    await waitFor(() => expect(thumbnails(HOST)).toHaveLength(1));

    // An edit of the text after the image: the thumbnail stays at once (no flash to «no image») and after the save.
    fireEvent.change(commands(), { target: { value: "access-list 10 permit 10.0.0.0 0.0.0.255" } });
    expect(thumbnails(HOST)).toHaveLength(1);
    await waitFor(() => expect(s.doc()?.answers[HOST.questionId]?.text).toBe("access-list 10 permit 10.0.0.0 0.0.0.255"));
    await settle();
    expect(thumbnails(HOST)).toHaveLength(1);
    expect(commands().value).toBe("access-list 10 permit 10.0.0.0 0.0.0.255");
    expect(s.doc()!.answers[HOST.questionId].images).toHaveLength(1);
    // The page never sends an image list of its own.
    expect(s.posts().filter(r => r.body!.action === "saveDraft").every(r => !JSON.stringify(r.body).includes('"images"'))).toBe(true);

    // Clearing the text keeps the images, on the page and on the server.
    fireEvent.change(commands(), { target: { value: "" } });
    expect(thumbnails(HOST)).toHaveLength(1);
    await waitFor(() => expect(s.doc()?.answers[HOST.questionId]?.text ?? "").toBe(""));
    await settle();
    expect(thumbnails(HOST)).toHaveLength(1);
    expect(s.doc()!.answers[HOST.questionId].images).toHaveLength(1);
  });

  it("an image that arrives while a text edit is still unsaved is shown beside that edit", async () => {
    const s = server();
    await s.open();
    openForm();
    await goTo(HOST);
    const commands = () => box(HOST)!.querySelector("textarea") as HTMLTextAreaElement;
    // Both requests are held by the test, so the order is the test's, not the clock's.
    let releaseUpload = () => {}, release = () => {};
    s.state.holdUploads = new Promise<void>(resolve => { releaseUpload = resolve; });
    s.state.holdSaves = new Promise<void>(resolve => { release = resolve; });
    pick(HOST, [await pngFile("acl.png")]);
    await waitFor(() => expect(s.posts().some(r => r.body!.action === "addImage")).toBe(true));
    fireEvent.change(commands(), { target: { value: "typed while the image travels" } });
    await settle();
    expect(s.posts().map(r => r.body!.action)).toEqual(["addImage"]);                // the save waits for the image
    expect(s.doc()).toBeNull();
    releaseUpload();
    // The image is stored and shown; the text is still on its way (its save is held).
    await waitFor(() => expect(thumbnails(HOST)).toHaveLength(1));
    expect(commands().value).toBe("typed while the image travels");
    expect(s.doc()!.answers[HOST.questionId].text).toBeUndefined();
    release();
    await waitFor(() => expect(s.doc()?.answers[HOST.questionId]?.text).toBe("typed while the image travels"));
    await settle();
    expect(thumbnails(HOST)).toHaveLength(1);
    expect(s.doc()!.answers[HOST.questionId].images).toHaveLength(1);
  });

  it("sends one request at a time: a save and an image never travel together, and nothing typed meanwhile is lost", async () => {
    const s = server();
    await s.open();
    openForm();
    await goTo(HOST);
    const commands = () => box(HOST)!.querySelector("textarea") as HTMLTextAreaElement;
    const actions = () => s.posts().map(r => r.body!.action);
    // Both requests are held by the test, so the order is the test's, not the clock's.
    let releaseSave = () => {}, releaseUpload = () => {};
    s.state.holdSaves = new Promise<void>(resolve => { releaseSave = resolve; });
    s.state.holdUploads = new Promise<void>(resolve => { releaseUpload = resolve; });

    fireEvent.change(commands(), { target: { value: "first" } });
    await waitFor(() => expect(actions()).toEqual(["saveDraft"]));                   // the save is travelling
    pick(HOST, [await pngFile("one.png", 300, 200, 30)]);                            // picked while it travels
    await settle();
    expect(actions()).toEqual(["saveDraft"]);                                        // the image waits for the save
    releaseSave();
    await waitFor(() => expect(actions()).toEqual(["saveDraft", "addImage"]));
    expect(s.doc()!.answers[HOST.questionId].text).toBe("first");

    fireEvent.change(commands(), { target: { value: "second, typed while the image travels" } });
    await settle();
    expect(actions()).toEqual(["saveDraft", "addImage"]);                            // the new save waits for the image
    releaseUpload();
    await waitFor(() => expect(s.doc()?.answers[HOST.questionId]?.text).toBe("second, typed while the image travels"));
    await settle();
    expect(actions()).toEqual(["saveDraft", "addImage", "saveDraft"]);
    expect(s.state.mostAtOnce).toBe(1);
    expect(s.doc()!.answers[HOST.questionId].images).toHaveLength(1);
    expect(commands().value).toBe("second, typed while the image travels");
    await waitFor(() => expect(thumbnails(HOST)).toHaveLength(1));
  });
});

describe("F4-UI — thumbnails", () => {
  it("offers a retry when an image cannot be read", async () => {
    const s = server();
    await s.open();
    await s.addImage(ONE.questionId);
    s.state.failImageReads = 1;
    openForm();
    await goTo(ONE);
    const retry = await within(box(ONE)!).findByRole("button", { name: "إعادة المحاولة" });
    expect(box(ONE)!.textContent).toContain("تعذر عرض الصورة");
    expect(thumbnails(ONE)).toHaveLength(0);                                        // an error answer is never shown as an image
    fireEvent.click(retry);
    await waitFor(() => expect(thumbnails(ONE)).toHaveLength(1));
    expect(box(ONE)!.textContent).not.toContain("تعذر عرض الصورة");
  });
});

describe("F4-UI — the submit and the read-only record", () => {
  // Every question answered, and every required image attached except ONE's.
  async function almostComplete(s: ReturnType<typeof server>) {
    await s.open();
    const answers = Object.fromEntries(QUESTIONS.filter(q => q.kind !== "image" && q.kind !== "file").map(q => [q.questionId, fullAnswer(q)]));
    expect((await s.student({ action: "saveDraft", baseRevision: 0, answers })).status).toBe(200);
    for (const q of QUESTIONS.filter(q => q.images && q.images.min > 0 && q !== ONE)) for (let i = 0; i < q.images!.min; i += 1) expect((await s.addImage(q.questionId, 40 + i * 50)).status).toBe(200);
  }
  const last = SECTIONS[SECTIONS.length - 1];

  it("a required image question blocks the submit until its image is attached; the submitted form shows the images read-only", async () => {
    const s = server();
    await almostComplete(s);
    openForm();
    // The page resumes at the one section that still misses something: ONE's.
    await waitFor(() => expect(box(ONE)).not.toBeNull());
    fireEvent.click(nav().getByRole("button", { name: new RegExp(escape(last.title)) }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الاستمارة" }));
    const missing = await screen.findByText(/أكمل الأسئلة الإلزامية قبل التسليم \(1\)/);
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(s.doc()!.status).toBe("draft");
    fireEvent.click(within(missing.closest("div")!).getByRole("button", { name: new RegExp(escape(sectionOf(ONE).title)) }));
    await waitFor(() => expect(box(ONE)).not.toBeNull());
    expect(box(ONE)!.textContent).toContain("هذا السؤال إلزامي ولم يكتمل بعد");

    pick(ONE, [await pngFile()]);
    await waitFor(() => expect(s.doc()?.answers[ONE.questionId]?.images).toHaveLength(1));
    fireEvent.click(nav().getByRole("button", { name: new RegExp(escape(last.title)) }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الاستمارة" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "تسليم" }));
    expect((await screen.findByTestId("exam-form-locked")).textContent).toContain("سلّمت هذه الاستمارة");
    expect(s.doc()!.status).toBe("submitted");

    // The record: the image is shown, nothing can be attached or removed.
    await goTo(ONE);
    await waitFor(() => expect(thumbnails(ONE)).toHaveLength(1));
    await settle();
    expect(fileInput(ONE)).toBeNull();
    expect(within(box(ONE)!).queryByRole("button", { name: /إرفاق|حذف/ })).toBeNull();
    expect(within(box(ONE)!).getByRole("button", { name: "تكبير الصورة 1" })).toBeTruthy();
  });

  it("a form the teacher closed while the student was attaching becomes read-only, with the reason, and stores nothing", async () => {
    const s = server();
    await s.open();
    openForm();
    await goTo(ONE);
    await s.teacher("examForm.close");
    pick(ONE, [await pngFile()]);
    expect((await within(box(ONE)!).findByRole("alert")).textContent!.length).toBeGreaterThan(5);
    expect((await screen.findByTestId("exam-form-locked")).textContent).toContain("أغلق المعلم الاستمارة");
    await settle();
    expect(s.blobs()).toEqual([]);
    expect(fileInput(ONE)).toBeNull();
    expect(box(ONE)!.textContent).toContain("لم تُرفق صورة.");
  });

  it("a text question of the same form is saved as before", async () => {
    const s = server();
    await s.open();
    openForm();
    await goTo(TEXT);
    fireEvent.change(box(TEXT)!.querySelector("input")!, { target: { value: "شبكة مدرسة" } });
    await waitFor(() => expect(s.doc()?.answers[TEXT.questionId]).toEqual({ text: "شبكة مدرسة" }));
    expect(s.doc()).toMatchObject({ status: "draft", revision: 1 });
  });
});
