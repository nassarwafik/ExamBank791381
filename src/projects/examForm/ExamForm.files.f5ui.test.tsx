// @vitest-environment happy-dom
/// <reference types="node" />
// Phase F5-UI — the files of the project exam form, end to end over the REAL handlers (in-memory container): where the class
// has file answers on, a file question takes one file from the student's page (checked and stored by the server), it can be
// replaced, removed after a confirmation and downloaded with the student's session; a file the question does not accept is
// refused on the page and by the server; a required file question blocks the submit; the teacher's review offers the same
// download with the teacher's session; the teacher switches file answers on per class from the form's control. Where the
// class has them off, the pages are what they were.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, act, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import StudentExamForm from "./StudentExamForm";
import TeacherExamFormReview from "./TeacherExamFormReview";
import ProjectExamFormControl from "../ProjectExamFormControl";
import { FILE_MAX_BYTES, fileRefusal, fileSizeText } from "./fileRules";

const nodeRequire = createRequire(import.meta.url);
const { handler: studentForm } = nodeRequire("../../../api/src/functions/student-project-exam-form.js");
const { handler: tracker } = nodeRequire("../../../api/src/functions/project-tracker.js");
const { getExamFormTemplate, getStorageNamespace } = nodeRequire("../../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
type Entry = { id: string };
type Question = { questionId: string; kind: string; required: boolean; accept?: string[]; minRows?: number; columns?: Entry[]; options?: Entry[]; justification?: boolean; left?: Entry[]; right?: Entry[]; items?: Entry[]; max?: number };
type Section = { sectionId: string; title: string; questions: Question[] };
type FileRef = { id: string; name: string; ext: string; bytes: number };
type Doc = { status: string; revision: number; answers: Record<string, { text?: string; file?: FileRef }> };
const CODE = "794589";
const NS = getStorageNamespace(CODE);
const NOW = "2026-11-14T00:00:00.000Z";
const SECTIONS = (getExamFormTemplate(CODE) as { sections: Section[] }).sections;
const QUESTIONS = SECTIONS.flatMap(s => s.questions);
const PKT = QUESTIONS.find(q => q.kind === "file" && q.accept!.includes(".pkt"))!;           // «أرفق ملف Packet Tracer النهائي»
const BOOK = QUESTIONS.find(q => q.kind === "file" && q.accept!.includes(".docx"))!;         // «أرفق كتاب المشروع النهائي»
const TEXT_ANSWERABLE = QUESTIONS.filter(q => q.kind !== "image" && q.kind !== "file");
const sectionOf = (q: Question) => SECTIONS.find(s => s.questions.includes(q))!;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const user = (id: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: "طالب " + id, code: "C" + id });

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

// Bytes of each kind. A Packet Tracer file is an opaque binary stream; the PDF starts as a PDF does.
const pktBytes = (size = 3000, fill = 0xa7) => { const b = Buffer.alloc(size, fill); Buffer.from([0x34, 0x1e, 0xa0, 0xe7]).copy(b); return b; };
const pdfBytes = () => Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const asFile = (bytes: Buffer, name: string) => new File([new Uint8Array(bytes)], name, { type: "application/octet-stream" });

type Sent = { method: string; url: string; body?: Body; headers: Record<string, string> };

function server() {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": { classId: "c1", name: "صف c1", active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW },
    "platform/users/s1.json": user("s1"), "platform/users/s2.json": user("s2")
  });
  const audits: Body[] = [];
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c: unknown, ev: Body) => { audits.push(ev); }, recordProjectMilestones: async () => {} };
  const studentDeps = (id: string) => ({ ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: id, sv: 1 }, student: ctx.getJson("platform/users/" + id + ".json") }) });
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const call = async (method: string, url: string, body?: Body, as = "s1") => {
    const handle = url.startsWith("/api/student-project-exam-form") ? (req: unknown) => studentForm(req, studentDeps(as)) : (req: unknown) => tracker(req, teacherDeps);
    return (await handle({ method, url: "https://x" + url, json: async () => body ?? {} })) as { status: number; jsonBody?: Body; body?: Buffer; headers?: Record<string, string> };
  };
  const sent: Sent[] = [];
  const state = { failFileReads: 0 };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    sent.push({ method, url, body, headers: Object.fromEntries(Array.from(new Headers(init?.headers || {}).entries()).map(([key, value]) => [key.toLowerCase(), value])) });
    if (method === "GET" && (url.includes("file=") || url.includes("resource=exam-form-file")) && state.failFileReads > 0) {
      state.failFileReads -= 1;
      return { ok: false, status: 503, json: async () => ({}), text: async () => "{}", blob: async () => new Blob(["{}"]), headers: new Headers() } as unknown as Response;
    }
    const r = await call(method, url, body);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody, text: async () => JSON.stringify(r.jsonBody), headers: new Headers(),
      blob: async () => new Blob([new Uint8Array(r.body as Buffer)], { type: r.headers?.["content-type"] || "" }) } as unknown as Response;
  }) as unknown as typeof fetch;
  const teacher = (action: string, extra: Body = {}) => call("POST", "/api/project-tracker", { projectCode: CODE, classId: "c1", action, ...extra });
  const student = (body: Body, as = "s1") => call("POST", "/api/student-project-exam-form", { projectCode: CODE, ...body }, as);
  const addFile = (q: Question, name: string, bytes: Buffer, as = "s1") => student({ action: "addFile", questionId: q.questionId, fileName: name, dataBase64: bytes.toString("base64") }, as);
  const doc = (id = "s1") => (ctx.has(NS.examFormAnswersName("c1", id)) ? ctx.getJson(NS.examFormAnswersName("c1", id)) : null) as Doc | null;
  const classForm = () => (ctx.has(NS.examFormClassName("c1")) ? ctx.getJson(NS.examFormClassName("c1")) : null) as { state: string; fileAnswers?: boolean; imageAnswers?: boolean } | null;
  const blobs = () => (ctx.names("platform/project-exam-forms/" + CODE + "/files/") as string[]);
  const stored = (name: string) => (ctx.getBinary(name) as { buffer: Buffer }).buffer;
  const posts = () => sent.filter(r => r.method === "POST");
  return { ctx, audits, sent, state, teacher, student, addFile, doc, classForm, blobs, stored, posts, open: (files = true) => teacher("examForm.open", files ? { fileAnswers: true } : {}) };
}

// What the browser was handed as a download: the name on the link and the bytes behind its address.
function watchDownloads() {
  const saved: { name: string; blob: Blob }[] = [];
  const blobs = new Map<string, Blob>();
  const create = URL.createObjectURL.bind(URL);
  vi.spyOn(URL, "createObjectURL").mockImplementation((obj: Blob | MediaSource) => { const address = create(obj); blobs.set(address, obj as Blob); return address; });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { saved.push({ name: this.download, blob: blobs.get(this.href)! }); });
  return saved;
}
const bytesOf = async (blob: Blob) => Buffer.from(await blob.arrayBuffer());

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
const pick = (q: Question, file: File) => fireEvent.change(fileInput(q)!, { target: { files: [file] } });
const settle = async (turns = 6) => { for (let i = 0; i < turns; i += 1) await act(async () => { await new Promise(resolve => { setTimeout(resolve, 12); }); }); };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("F5-UI — a class with file answers off", () => {
  it("shows a file question as a notice with no input, and never sends a file", async () => {
    const s = server();
    await s.open(false);
    openForm();
    const q = await goTo(PKT);
    await settle();
    expect(q.textContent).toContain("إرفاق الملفات سيتاح قريبًا");
    expect(fileInput(PKT)).toBeNull();
    expect(q.querySelector('[data-testid="exam-form-file"]')).toBeNull();
    expect(s.sent.some(r => r.body?.action === "addFile" || r.url.includes("file="))).toBe(false);
  });
});

describe("F5-UI — the student attaches a file", () => {
  it("sends the picked file's name and bytes, shows it with its size, and counts the question as answered", async () => {
    const s = server();
    await s.open();
    openForm();
    const q = await goTo(PKT);
    expect(q.textContent).toContain("لم يُرفق ملف بعد");
    expect(within(q).getByRole("button", { name: "إرفاق ملف" })).toBeTruthy();
    expect(fileInput(PKT)!.getAttribute("accept")).toBe(".pkt");
    const bytes = pktBytes(3000);
    pick(PKT, asFile(bytes, "final-network.pkt"));
    await waitFor(() => expect(s.doc()?.answers[PKT.questionId]?.file?.name).toBe("final-network.pkt"));
    const post = s.posts().find(r => r.body?.action === "addFile")!;
    expect(Object.keys(post.body!).sort()).toEqual(["action", "dataBase64", "fileName", "projectCode", "questionId"]);   // no student, no class: the session decides
    expect(post.body).toMatchObject({ questionId: PKT.questionId, fileName: "final-network.pkt", dataBase64: bytes.toString("base64") });
    expect(s.blobs()).toHaveLength(1);
    expect(Buffer.compare(s.stored(s.blobs()[0]), bytes)).toBe(0);
    const line = await within(q).findByTestId("exam-form-file-line");
    expect(line.textContent).toContain("final-network.pkt");
    expect(line.textContent).toContain("3 كيلوبايت");
    expect(within(q).getByRole("button", { name: "استبدال الملف" })).toBeTruthy();
    expect(within(q).getByRole("button", { name: /حذف الملف/ })).toBeTruthy();
    await waitFor(() => expect(document.body.textContent).toMatch(new RegExp("أجبت عن\\s*1\\s*من\\s*" + (TEXT_ANSWERABLE.length + 2))));   // the two file questions count now, one is answered
    expect(s.doc()!.revision).toBe(0);                                          // a file does not move the answers' revision
  });

  it("a second file replaces the first: one file per question", async () => {
    const s = server();
    await s.open();
    await s.addFile(PKT, "v1.pkt", pktBytes(1000));
    openForm();
    const q = await goTo(PKT);
    expect((await within(q).findByTestId("exam-form-file-line")).textContent).toContain("v1.pkt");
    const next = pktBytes(2048, 0x11);
    pick(PKT, asFile(next, "v2.pkt"));
    await waitFor(() => expect(s.doc()?.answers[PKT.questionId]?.file?.name).toBe("v2.pkt"));
    await waitFor(() => expect(within(q).getByTestId("exam-form-file-line").textContent).toContain("v2.pkt"));
    expect(within(q).getAllByTestId("exam-form-file-line")).toHaveLength(1);
    expect(s.blobs()).toHaveLength(1);
    expect(Buffer.compare(s.stored(s.blobs()[0]), next)).toBe(0);
  });

  it("a file the question does not accept, and one over the size bound, are refused on the page with no request", async () => {
    const s = server();
    await s.open();
    openForm();
    const q = await goTo(PKT);
    pick(PKT, asFile(pdfBytes(), "book.pdf"));
    expect((await within(q).findByRole("alert")).textContent).toContain("نوع الملف غير مقبول لهذا السؤال");
    pick(PKT, asFile(Buffer.alloc(FILE_MAX_BYTES + 1, 0xa7), "huge.pkt"));
    await waitFor(() => expect(within(q).getByRole("alert").textContent).toContain("أكبر من الحد المسموح"));
    await settle();
    expect(s.posts().some(r => r.body?.action === "addFile")).toBe(false);
    expect(s.blobs()).toEqual([]);
    expect(s.doc()).toBeNull();
  });

  it("the server's refusal is shown as it says it, nothing is stored, and the form is not read again", async () => {
    const s = server();
    await s.open();
    openForm();
    const q = await goTo(PKT);
    await settle();
    const reads = s.sent.filter(r => r.method === "GET").length;
    const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(300, 1)]);
    pick(PKT, asFile(exe, "net.pkt"));                                          // the right extension, the wrong content
    expect((await within(q).findByRole("alert")).textContent).toContain("محتوى الملف لا يطابق نوعه");
    await settle();
    expect(s.blobs()).toEqual([]);
    expect(s.doc()).toBeNull();
    expect(s.sent.filter(r => r.method === "GET").length).toBe(reads);
    expect(within(q).getByRole("button", { name: "إرفاق ملف" })).toBeTruthy();   // the student can try again
  });

  it("removes the file only after a confirmation", async () => {
    const s = server();
    await s.open();
    await s.addFile(PKT, "net.pkt", pktBytes());
    openForm();
    const q = await goTo(PKT);
    fireEvent.click(await within(q).findByRole("button", { name: /حذف الملف/ }));
    const first = await screen.findByRole("dialog");
    expect(first.textContent).toContain("سيُحذف هذا الملف من إجابتك");
    fireEvent.click(within(first).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await settle();
    expect(s.doc()!.answers[PKT.questionId].file!.name).toBe("net.pkt");
    expect(s.posts().some(r => r.body?.action === "removeFile")).toBe(false);

    fireEvent.click(within(q).getByRole("button", { name: /حذف الملف/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "حذف الملف" }));
    await waitFor(() => expect(PKT.questionId in s.doc()!.answers).toBe(false));
    await waitFor(() => expect(within(q).queryByTestId("exam-form-file-line")).toBeNull());
    expect(s.blobs()).toEqual([]);
    expect(q.textContent).toContain("لم يُرفق ملف بعد");
  });

  it("downloads the file with the student's session, under its own name, as the same bytes", async () => {
    const s = server();
    await s.open();
    const bytes = pdfBytes();
    await s.addFile(BOOK, "كتاب المشروع.pdf", bytes);
    const saved = watchDownloads();
    openForm();
    const q = await goTo(BOOK);
    fireEvent.click(await within(q).findByRole("button", { name: "تنزيل الملف كتاب المشروع.pdf" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].name).toBe("كتاب المشروع.pdf");
    // the name is shown whole, with its extension as a left-to-right run of its own (never drawn reversed beside Arabic)
    const label = q.querySelector(".eb-sp-form-file-label") as HTMLElement;
    expect(label.textContent).toBe("كتاب المشروع.pdf");
    expect((label.querySelector('[dir="ltr"]') as HTMLElement).textContent).toBe(".pdf");
    expect(Buffer.compare(await bytesOf(saved[0].blob), bytes)).toBe(0);
    const read = s.sent.find(r => r.method === "GET" && r.url.includes("file="))!;
    expect(read.url).toContain("file=" + s.doc()!.answers[BOOK.questionId].file!.id);
    expect(read.headers["x-student-token"]).toBe("st");
    expect(q.querySelector("a[href]")).toBeNull();                              // the file never has an address in the page
    expect(q.querySelector("iframe, embed, object, img")).toBeNull();           // and is never shown in it
  });

  it("a failed download says so and can be tried again", async () => {
    const s = server();
    await s.open();
    await s.addFile(PKT, "net.pkt", pktBytes());
    const saved = watchDownloads();
    s.state.failFileReads = 1;
    openForm();
    const q = await goTo(PKT);
    fireEvent.click(await within(q).findByRole("button", { name: "تنزيل الملف net.pkt" }));
    expect((await within(q).findByRole("alert")).textContent).toContain("تعذر تنزيل الملف");
    expect(saved).toHaveLength(0);
    fireEvent.click(within(q).getByRole("button", { name: "تنزيل الملف net.pkt" }));
    await waitFor(() => expect(saved).toHaveLength(1));
  });
});

describe("F5-UI — files and the submit", () => {
  it("a required file question blocks the submit until its file is attached; the submitted record keeps the download only", async () => {
    const s = server();
    await s.open();
    await s.student({ action: "saveDraft", baseRevision: 0, answers: Object.fromEntries(TEXT_ANSWERABLE.map(q => [q.questionId, fullAnswer(q)])) });
    await s.addFile(BOOK, "book.pdf", pdfBytes());
    openForm();
    const q = await goTo(PKT);                                                  // resumes on the section with the missing file
    fireEvent.click(screen.getByRole("button", { name: "تسليم الاستمارة" }));
    expect((await screen.findByText(/أكمل الأسئلة الإلزامية قبل التسليم/)).textContent).toContain("1");
    expect(s.doc()!.status).toBe("draft");
    pick(PKT, asFile(pktBytes(), "net.pkt"));
    await waitFor(() => expect(s.doc()!.answers[PKT.questionId]?.file?.name).toBe("net.pkt"));
    fireEvent.click(screen.getByRole("button", { name: "تسليم الاستمارة" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "تسليم" }));
    await waitFor(() => expect(s.doc()!.status).toBe("submitted"));
    await waitFor(() => expect(fileInput(PKT)).toBeNull());
    expect(within(q).getByTestId("exam-form-file-line").textContent).toContain("net.pkt");
    expect(within(q).getByRole("button", { name: "تنزيل الملف net.pkt" })).toBeTruthy();
    expect(within(q).queryByRole("button", { name: /استبدال الملف|حذف الملف|إرفاق ملف/ })).toBeNull();
  });
});

describe("F5-UI — the teacher's review", () => {
  const review = () => render(<TeacherExamFormReview token="tt" projectCode={CODE} classId="c1" studentId="s1" onClose={() => {}} />);
  async function section(q: Question) {
    const page = await screen.findByTestId("exam-form-review");
    fireEvent.click(within(within(page).getByRole("navigation", { name: "أقسام الاستمارة" })).getByRole("button", { name: new RegExp(escape(sectionOf(q).title)) }));
    await waitFor(() => expect(box(q)).not.toBeNull());
    return box(q)!;
  }

  it("shows the student's file with its name and size and downloads it with the teacher's session", async () => {
    const s = server();
    await s.open();
    const bytes = pktBytes(5000);
    await s.addFile(PKT, "final.pkt", bytes);
    const saved = watchDownloads();
    review();
    const q = await section(PKT);
    expect(q.querySelector("[data-file]")).toBeTruthy();
    expect(q.textContent).toContain("أرفق الطالب ملفًا لهذا السؤال");
    expect(q.textContent).not.toContain("يُفحص من كتاب الطالب");
    expect(within(q).getByTestId("exam-form-file-line").textContent).toContain("final.pkt");
    expect(within(q).getByTestId("exam-form-file-line").textContent).toContain("5 كيلوبايت");
    expect(box(BOOK)!.textContent).toContain("يُفحص من كتاب الطالب");            // a file question with no file is still checked from the book
    fireEvent.click(within(q).getByRole("button", { name: "تنزيل الملف final.pkt" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].name).toBe("final.pkt");
    expect(Buffer.compare(await bytesOf(saved[0].blob), bytes)).toBe(0);
    const read = s.sent.find(r => r.url.includes("resource=exam-form-file"))!;
    const params = new URL("https://x" + read.url).searchParams;
    expect([params.get("classId"), params.get("studentId"), params.get("fileId")]).toEqual(["c1", "s1", s.doc()!.answers[PKT.questionId].file!.id]);
    expect(read.headers["x-builder-token"]).toBe("tt");
    expect(q.querySelector("a[href], iframe, embed, object")).toBeNull();
    expect(within(q).queryByRole("button", { name: /استبدال الملف|حذف الملف|إرفاق ملف/ })).toBeNull();   // the teacher only reads
  });

  it("a failed download says so", async () => {
    const s = server();
    await s.open();
    await s.addFile(PKT, "final.pkt", pktBytes());
    const saved = watchDownloads();
    s.state.failFileReads = 1;
    review();
    const q = await section(PKT);
    fireEvent.click(within(q).getByRole("button", { name: "تنزيل الملف final.pkt" }));
    expect((await within(q).findByRole("alert")).textContent).toContain("تعذر تنزيل الملف");
    expect(saved).toHaveLength(0);
  });
});

describe("F5-UI — the teacher's switch", () => {
  const control = (readOnly = false) => render(<ProjectExamFormControl token="tt" projectCode={CODE} classId="c1" readOnly={readOnly} />);

  it("a first open from the control does not switch files on (it is the teacher's own step)", async () => {
    const s = server();
    control();
    fireEvent.click(await screen.findByRole("button", { name: "فتح الاستمارة للصف" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "فتح الاستمارة" }));
    await waitFor(() => expect(s.classForm()?.state).toBe("open"));
    expect("fileAnswers" in s.posts().find(r => r.body?.action === "examForm.open")!.body!).toBe(false);
    expect(s.classForm()!.fileAnswers).toBeUndefined();
    expect((await screen.findByTestId("project-exam-form-files")).textContent).toContain("غير مفعّلة");
    expect(screen.getByRole("button", { name: "تفعيل أسئلة الملفات" })).toBeTruthy();
  });

  it("switches file answers on after a confirmation that says what a student's file is; then the switch is gone", async () => {
    const s = server();
    await s.open(false);
    s.audits.length = 0;
    control();
    fireEvent.click(await screen.findByRole("button", { name: "تفعيل أسئلة الملفات" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("الإلزامي منها يصبح شرطًا للتسليم");
    expect(dialog.textContent).toContain("لا يفحصها من الفيروسات");
    expect(dialog.textContent).toContain("لا يمكن إلغاء التفعيل بعد ذلك");
    expect(s.classForm()!.fileAnswers).toBeUndefined();                          // nothing before the confirmation
    fireEvent.click(within(dialog).getByRole("button", { name: "تفعيل" }));
    await waitFor(() => expect(s.classForm()!.fileAnswers).toBe(true));
    expect(s.posts().pop()!.body).toEqual({ projectCode: CODE, action: "examForm.open", classId: "c1", fileAnswers: true });
    expect(s.audits.map(a => [a.action, (a.details as Body).fileAnswers])).toEqual([["project.exam_form.open", true]]);
    await waitFor(() => expect(screen.getByTestId("project-exam-form-files").textContent).toContain("أسئلة الملفات مفعّلة"));
    expect(screen.queryByRole("button", { name: "تفعيل أسئلة الملفات" })).toBeNull();
  });

  it("cancelling the confirmation switches nothing", async () => {
    const s = server();
    await s.open(false);
    control();
    fireEvent.click(await screen.findByRole("button", { name: "تفعيل أسئلة الملفات" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.posts()).toEqual([]);
    expect(s.classForm()!.fileAnswers).toBeUndefined();
  });

  it("is not offered before the first open, on a closed form or on a read-only class", async () => {
    const s = server();
    const before = control();
    await screen.findByTestId("project-exam-form");
    expect(screen.queryByRole("button", { name: "تفعيل أسئلة الملفات" })).toBeNull();
    expect(screen.queryByTestId("project-exam-form-files")).toBeNull();
    before.unmount();
    await s.open(false);
    const readOnly = control(true);
    expect((await screen.findByTestId("project-exam-form-files")).textContent).toContain("غير مفعّلة");
    expect(screen.queryByRole("button", { name: "تفعيل أسئلة الملفات" })).toBeNull();
    readOnly.unmount();
    await s.teacher("examForm.close");
    control();
    await screen.findByTestId("project-exam-form-files");
    expect(screen.queryByRole("button", { name: "تفعيل أسئلة الملفات" })).toBeNull();
  });
});

describe("F5-UI — what the page says about a picked file", () => {
  it("sizes in words", () => {
    expect(fileSizeText(188506)).toBe("184 كيلوبايت");
    expect(fileSizeText(2278973)).toBe("2.2 ميغابايت");
    expect(fileSizeText(10)).toBe("1 كيلوبايت");
    expect(fileSizeText(0)).toBe("");
  });
  it("refuses by extension and size only (the server checks the content)", () => {
    expect(fileRefusal([".pkt"], "net.pkt", 100)).toBe("");
    expect(fileRefusal([".pkt"], "NET.PKT", 100)).toBe("");
    expect(fileRefusal([".docx", ".pdf"], "book.pdf", FILE_MAX_BYTES)).toBe("");
    expect(fileRefusal([".pkt"], "net.pkt.exe", 100)).toContain("نوع الملف غير مقبول");
    expect(fileRefusal([".pkt"], "network", 100)).toContain("نوع الملف غير مقبول");
    expect(fileRefusal([".pkt"], "net.pkt", 0)).toBe("الملف فارغ.");
    expect(fileRefusal([".pkt"], "net.pkt", FILE_MAX_BYTES + 1)).toContain("10 ميغابايت");
  });
});
