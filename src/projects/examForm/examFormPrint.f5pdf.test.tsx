// @vitest-environment happy-dom
/// <reference types="node" />
// Phase F5 (PDF) — «طباعة / حفظ PDF» of one student's project exam form. The document: right-to-left, every section and
// question with the student's answer by kind, every piece of text escaped, an image only as a raster data URL, never an
// answer key — even when it is built from the teacher's view, which carries the keys. The pages: the student's copy holds
// the review only after the approval; the teacher's copy holds the stored ratings and asks to save unsaved ones first; the
// attached images are read with the reader's session; the document is printed from a hidden iframe that is removed.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import StudentExamForm from "./StudentExamForm";
import TeacherExamFormReview from "./TeacherExamFormReview";
import { buildExamFormPrintHtml, loadPrintImages, printExamFormDocument, printDate, referencedImageIds, IMAGE_DATA_URL, type ExamFormPrintInput, type PrintSection } from "./examFormPrint";
import type { ExamFormAnswers, ExamFormQuestion } from "./types";

const nodeRequire = createRequire(import.meta.url);
const { handler: studentForm } = nodeRequire("../../../api/src/functions/student-project-exam-form.js");
const { handler: tracker } = nodeRequire("../../../api/src/functions/project-tracker.js");
const { getExamFormTemplate, getStorageNamespace } = nodeRequire("../../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../../api/tests/fixtures/memory-container.js");
const sharp = nodeRequire("../../../api/node_modules/sharp");

type Body = Record<string, unknown>;
type KeyedQuestion = ExamFormQuestion & { answer?: { correctOptionId?: string; correctOptionIds?: string[]; pairs?: Record<string, string>; order?: string[] } };
type Section = { sectionId: string; title: string; order: number; weight: number; questions: KeyedQuestion[] };
const CODE = "794589";
const NS = getStorageNamespace(CODE);
const NOW = "2026-11-14T00:00:00.000Z";
const TEMPLATE = getExamFormTemplate(CODE) as { title: string; sections: Section[]; rubric: { levels: { value: number; label: string }[] } };
const SECTIONS = TEMPLATE.sections;
const QUESTIONS = SECTIONS.flatMap(s => s.questions);
const Q = (id: string) => QUESTIONS.find(q => q.questionId === id)!;
const byKind = (kind: string, more: (q: KeyedQuestion) => boolean = () => true) => QUESTIONS.find(q => q.kind === kind && more(q))!;
const ANSWERABLE = QUESTIONS.filter(q => q.kind !== "image" && q.kind !== "file");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// The RIGHT answer of an auto-marked question; a complete, valid answer for any other answerable question.
function answerOf(q: KeyedQuestion): Body {
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

const input = (over: Partial<ExamFormPrintInput> = {}): ExamFormPrintInput => ({
  audience: "student", formTitle: TEMPLATE.title, projectCode: CODE, studentName: "وليد سالم", statusText: "سُلّمت",
  meta: [["الإجابات", "77 من 77"]], sections: SECTIONS as unknown as PrintSection[], answers: {}, images: {}, generatedAt: "14 نوفمبر 2026، 10:00", ...over
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.innerHTML = ""; try { sessionStorage.clear(); } catch { /* no storage */ } });

describe("F5 PDF — the document", () => {
  it("is a right-to-left A4 document with every section and question of the form", () => {
    const html = buildExamFormPrintHtml(input());
    expect(html.startsWith('<!doctype html><html lang="ar" dir="rtl">')).toBe(true);
    expect(html).toContain("@page{size:A4;margin:14mm}");
    expect(html).toContain("<title>" + TEMPLATE.title + " — 794589 — وليد سالم</title>");
    expect(html.match(/<section>/g)).toHaveLength(16);
    expect(html.match(/<div class="q">/g)).toHaveLength(92);
    for (const s of SECTIONS) expect(html).toContain(s.title);
    expect(html).toContain("نسخة الطالب · أُنشئ في 14 نوفمبر 2026، 10:00");
    expect(html).toContain("<dt>الإجابات</dt><dd>77 من 77</dd>");
    expect(html).not.toContain("<script");
  });

  it("prints each kind of answer as text: text, commands left-to-right, a table, options, pairs, an order, a scale, a checklist, a declaration", () => {
    const table = byKind("table"), choice = Q("S04Q04"), multi = Q("S04Q03"), match = Q("S06Q04"), order = Q("S12Q03"), cli = byKind("cli"), scale = byKind("scale"), checklist = byKind("checklist"), declaration = byKind("declaration");
    const answers = allAnswers() as ExamFormAnswers;
    answers[cli.questionId] = { text: "Switch(config)# vlan 10\nSwitch(config-vlan)# name mng" };
    const html = buildExamFormPrintHtml(input({ answers }));
    expect(html).toContain('<p class="text">جواب S01Q01</p>');
    expect(html).toContain('<pre dir="ltr">Switch(config)# vlan 10\nSwitch(config-vlan)# name mng</pre>');
    expect(html).toContain('<th scope="col">' + table.columns![0].title + "</th>");
    expect(html).toContain('<td dir="auto">' + table.columns![0].id + "0</td>");
    expect(html).toContain('<p class="text">' + choice.options!.find(o => o.id === choice.answer!.correctOptionId)!.text + "</p>");
    expect(html).toContain('<span class="lbl">التبرير: </span>لأن البوابة خارج شبكته');
    for (const id of multi.answer!.correctOptionIds!) expect(html).toContain("<li>" + multi.options!.find(o => o.id === id)!.text + "</li>");
    const left = match.left![0];
    expect(html).toContain("<li>" + left.text + ' <span class="lbl">←</span> ' + match.right!.find(r => r.id === match.answer!.pairs![left.id])!.text + "</li>");
    expect(html).toContain("<ol>" + order.answer!.order!.map(id => "<li>" + order.items!.find(i => i.id === id)!.text + "</li>").join("") + "</ol>");
    expect(html).toContain("<li>" + scale.items![0].text + ': <span dir="ltr">' + scale.max + " / " + scale.max + "</span></li>");
    expect(html).toContain("<li>" + checklist.items![0].text + "</li>");
    expect(html).toContain('<p class="text">أوافق.</p>');
    expect(declaration).toBeTruthy();
  });

  it("an unanswered question and an image question with no image say so; a file question says the file is handed to the teacher", () => {
    const html = buildExamFormPrintHtml(input());
    expect(html.match(/<p class="none">لم يُجب\.<\/p>/g)!.length).toBe(ANSWERABLE.length);
    expect(html.match(/<p class="none">لم تُرفق صورة\.<\/p>/g)!.length).toBe(QUESTIONS.filter(q => q.kind === "image").length);
    const fileQuestions = QUESTIONS.filter(q => q.kind === "file").length;
    expect(fileQuestions).toBeGreaterThan(0);
    expect(html.match(/<p class="none">يُسلَّم الملف للمعلم مباشرة: الملفات لا تُرفع إلى الموقع\.<\/p>/g)!.length).toBe(fileQuestions);
  });

  it("escapes every piece of text: an answer, a table cell, a name and a note can never inject markup", () => {
    const table = byKind("table");
    const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const answers: ExamFormAnswers = { S01Q01: { text: evil }, [table.questionId]: { rows: [Object.fromEntries(table.columns!.map(c => [c.id, evil]))] },
      [byKind("cli").questionId]: { text: evil }, S04Q04: { optionId: Q("S04Q04").options![0].id, justification: evil } };
    const html = buildExamFormPrintHtml(input({ answers, studentName: evil, statusText: evil, generalNote: evil, meta: [[evil, evil]],
      ratings: { S01: { level: 2, topLevel: 4, label: evil, note: evil } }, ratingsNote: evil }));
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('onerror="');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;");
    expect(html).toContain('<pre dir="ltr">&lt;img src=x');                      // commands
    expect(html).toContain('<span class="lbl">التبرير: </span>&lt;img src=x');   // a justification
  });

  it("embeds an attached image only as a raster data URL; anything else is a placeholder, never an address", () => {
    const q = byKind("image");
    const answers: ExamFormAnswers = { [q.questionId]: { images: [{ id: "a".repeat(24), width: 1, height: 1, bytes: 1 }, { id: "b".repeat(24), width: 1, height: 1, bytes: 1 }, { id: "c".repeat(24), width: 1, height: 1, bytes: 1 }, { id: "d".repeat(24), width: 1, height: 1, bytes: 1 }] } };
    const html = buildExamFormPrintHtml(input({ answers, images: {
      ["a".repeat(24)]: PNG,
      ["b".repeat(24)]: "https://evil.example/x.png",
      ["c".repeat(24)]: "data:image/svg+xml;base64,PHN2Zy8+",
      ["d".repeat(24)]: 'data:image/png;base64,AAAA" onerror="alert(1)'
    } }));
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain('<img alt="الصورة 1" src="' + PNG + '">');
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("svg+xml");
    expect(html).not.toContain("onerror");
    expect(html.match(/تعذر تضمينها في هذا الملف/g)).toHaveLength(3);
    expect(IMAGE_DATA_URL.test(PNG)).toBe(true);
    expect(referencedImageIds(SECTIONS as unknown as PrintSection[], answers)).toEqual(["a", "b", "c", "d"].map(c => c.repeat(24)));
  });

  it("a file question never prints a file: a reference left in an answer from the removed upload is not named", () => {
    const q = byKind("file");
    const left = { [q.questionId]: { file: { id: "f".repeat(24), name: "شبكة المشروع.pkt", ext: ".pkt", bytes: 188506 } } } as unknown as ExamFormAnswers;
    const html = buildExamFormPrintHtml(input({ answers: left }));
    expect(html).not.toContain("شبكة المشروع.pkt");
    expect(html).not.toContain("f".repeat(24));
    expect(html).not.toContain("ملف مرفق");
    expect(html).toContain("يُسلَّم الملف للمعلم مباشرة: الملفات لا تُرفع إلى الموقع.");
  });

  it.each(["883589", "899373"])("the %s form prints whole from its own template: every section and question, every answer, never a key", code => {
    const template = getExamFormTemplate(code) as { title: string; sections: Section[] };
    const questions = template.sections.flatMap(s => s.questions);
    const answers = Object.fromEntries(questions.filter(q => q.kind !== "image" && q.kind !== "file").map(q => [q.questionId, answerOf(q)])) as ExamFormAnswers;
    const html = buildExamFormPrintHtml(input({ audience: "teacher", formTitle: template.title, projectCode: code, sections: template.sections as unknown as PrintSection[], answers }));
    expect(html.match(/<section>/g)).toHaveLength(template.sections.length);
    expect(html.match(/<div class="q">/g)).toHaveLength(questions.length);
    expect(html).not.toContain("لم يُجب.");                                        // every kind of answer of this form is printed
    for (const key of ["correctOptionId", "correctOptionIds", "الإجابة الصحيحة"]) expect(html).not.toContain(key);
    expect((html.match(/يُسلَّم الملف للمعلم مباشرة/g) || []).length).toBe(questions.filter(q => q.kind === "file").length);
  });

  it("NEVER prints an answer key — not even from the teacher's sections, which carry the keys", () => {
    const answers = { S04Q04: { optionId: Q("S04Q04").options!.find(o => o.id !== Q("S04Q04").answer!.correctOptionId)!.id } } as ExamFormAnswers;   // a WRONG choice
    const html = buildExamFormPrintHtml(input({ audience: "teacher", answers, verdicts: { S04Q04: false, S04Q03: null, S06Q04: null, S12Q03: null } }));
    const right = Q("S04Q04").options!.find(o => o.id === Q("S04Q04").answer!.correctOptionId)!.text;
    expect(html).not.toContain(">" + right + "<");                               // the right option is nowhere on paper
    for (const key of ["correctOptionId", "correctOptionIds", "الإجابة الصحيحة"]) expect(html).not.toContain(key);
    // an unanswered ordering / matching question prints «لم يُجب», not its key
    expect(html).not.toContain("<ol>");
    expect(html).not.toContain('<span class="lbl">←</span>');
    expect(html).toContain("تصحيح آلي: إجابة خاطئة");
    expect(html.match(/تصحيح آلي: بلا إجابة/g)).toHaveLength(3);
    expect(html).toContain("نسخة المعلم — لا تتضمن مفاتيح الإجابة");
  });

  it("the review appears only when it is given: verdicts, section ratings, the general note and the mark", () => {
    const plain = buildExamFormPrintHtml(input({ answers: allAnswers() as ExamFormAnswers }));
    for (const hidden of ["تصحيح آلي", "تقدير القسم", "ملاحظة المعلم", "علامة الاستمارة", "ملاحظة عامة من المعلم"]) expect(plain).not.toContain(hidden);
    const reviewed = buildExamFormPrintHtml(input({ answers: allAnswers() as ExamFormAnswers, verdicts: { S04Q04: true },
      ratings: { S04: { level: 2, topLevel: 4, label: "صحيحة جزئيًا", note: "جدول الشبكات ناقص", weight: 11, points: 5.5 } }, generalNote: "عمل مرتب", mark: { mark: 94.5, outOf: 100 } }));
    expect(reviewed).toContain('<p class="mark">علامة الاستمارة: <span dir="ltr">94.5 / 100</span></p>');
    expect(reviewed).toContain("ملاحظة عامة من المعلم: </span>عمل مرتب");
    expect(reviewed).toContain('تقدير القسم: </span>صحيحة جزئيًا <span dir="ltr">(2/4)</span> · <span dir="ltr">5.5 / 11</span>');
    expect(reviewed).toContain("ملاحظة المعلم: </span>جدول الشبكات ناقص");
    expect(reviewed.match(/class="rating"/g)).toHaveLength(1);                   // only the section that was given
    expect(reviewed.match(/تصحيح آلي: إجابة صحيحة/g)).toHaveLength(1);
    expect(buildExamFormPrintHtml(input({ ratings: { S01: { level: 1, topLevel: 4, label: "ناقص", note: "" } }, ratingsNote: "تقديرات غير معتمدة" }))).toContain('<p class="sub">تقديرات غير معتمدة</p>');
  });

  it("dates in words; nothing for nothing", () => {
    expect(printDate("")).toBe("");
    expect(printDate(null)).toBe("");
    expect(printDate("not a date")).toBe("");
    expect(printDate("2026-11-14T10:00:00.000Z")).toMatch(/2026/);
  });
});

describe("F5 PDF — the images and the print", () => {
  it("reads each image with the reader, keeps raster images only, and one failed image never fails the export", async () => {
    const png = new Blob([Uint8Array.from(atob(PNG.split(",")[1]), c => c.charCodeAt(0))], { type: "image/png" });
    const read = vi.fn(async (id: string) => { if (id === "bad") throw new Error("503"); if (id === "html") return new Blob(["<html>"], { type: "text/html" }); return png; });
    const progress: [number, number][] = [];
    const images = await loadPrintImages(["one", "bad", "html", "two"], read, (done, total) => progress.push([done, total]));
    expect(Object.keys(images)).toEqual(["one", "two"]);
    expect(images.one).toBe(PNG);
    expect(read.mock.calls.map(c => c[0])).toEqual(["one", "bad", "html", "two"]);   // one after another, in order
    expect(progress).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]]);
  });

  it("prints from a hidden iframe and removes it after printing; false when the browser offers no print", () => {
    const print = vi.fn(), append = document.body.appendChild.bind(document.body);
    let frame: HTMLIFrameElement | null = null;
    vi.spyOn(document.body, "appendChild").mockImplementation(<T extends Node>(n: T) => { const r = append(n); frame = n as unknown as HTMLIFrameElement; const w = frame.contentWindow as unknown as { print?: () => void } | null; if (w) w.print = print; return r; });
    expect(printExamFormDocument(buildExamFormPrintHtml(input()))).toBe(true);
    expect(print).toHaveBeenCalledTimes(1);
    expect(frame!.getAttribute("aria-hidden")).toBe("true");
    expect(frame!.contentDocument!.documentElement.getAttribute("dir")).toBe("rtl");
    expect(frame!.isConnected).toBe(true);
    frame!.contentWindow!.dispatchEvent(new Event("afterprint"));
    return new Promise<void>(resolve => setTimeout(() => { expect(frame!.isConnected).toBe(false); resolve(); }, 5));
  });

  it("returns false and leaves nothing behind when the frame cannot print", () => {
    const append = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, "appendChild").mockImplementation(<T extends Node>(n: T) => { const r = append(n); const w = (n as unknown as HTMLIFrameElement).contentWindow as unknown as { print?: unknown } | null; if (w) w.print = undefined; return r; });
    expect(printExamFormDocument("<!doctype html><html></html>")).toBe(false);
    expect(document.querySelector("iframe")).toBeNull();
  });
});

// ---- the two pages, over the real handlers ----
function server() {
  const user = (id: string, name: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: name, code: "C" + id });
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": { classId: "c1", name: "صف c1", active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW },
    "platform/users/s1.json": user("s1", "وليد سالم")
  });
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const studentDeps = { ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) };
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const call = async (method: string, url: string, body?: Body) => {
    const handle = url.startsWith("/api/student-project-exam-form") ? (req: unknown) => studentForm(req, studentDeps) : (req: unknown) => tracker(req, teacherDeps);
    return (await handle({ method, url: "https://x" + url, json: async () => body ?? {} })) as { status: number; jsonBody?: Body; body?: Buffer; headers?: Record<string, string> };
  };
  const sent: { method: string; url: string }[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    sent.push({ method, url });
    const r = await call(method, url, body);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody, text: async () => JSON.stringify(r.jsonBody), headers: new Headers(),
      blob: async () => new Blob([new Uint8Array(r.body as Buffer)], { type: r.headers?.["content-type"] || "" }) } as unknown as Response;
  }) as unknown as typeof fetch;
  const teacher = (action: string, extra: Body = {}) => call("POST", "/api/project-tracker", { projectCode: CODE, classId: "c1", action, ...extra });
  const student = (body: Body) => call("POST", "/api/student-project-exam-form", { projectCode: CODE, ...body });
  const doc = () => ctx.getJson(NS.examFormAnswersName("c1", "s1")) as { revision: number };
  return { ctx, sent, teacher, student, doc };
}
// What the print dialog was handed: the document written into the hidden iframe.
function watchPrint() {
  const printed: string[] = [];
  const append = document.body.appendChild.bind(document.body);
  vi.spyOn(document.body, "appendChild").mockImplementation(<T extends Node>(n: T) => {
    const r = append(n);
    if (n instanceof HTMLIFrameElement && n.contentWindow) (n.contentWindow as unknown as { print: () => void }).print = () => { printed.push(n.contentDocument!.documentElement.outerHTML); };
    return r;
  });
  return printed;
}
const pngDataUrl = async () => "data:image/png;base64," + (await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 20, g: 120, b: 200 } } }).png().toBuffer() as Buffer).toString("base64");
const rateAll = (level: number) => Object.fromEntries(SECTIONS.map(s => [s.sectionId, { level }]));
const IMAGE_Q = byKind("image", q => q.images!.max >= 1);

describe("F5 PDF — the student's copy", () => {
  it("prints the student's own answers and attached image, with their name, and no review before the approval", async () => {
    const s = server();
    await s.teacher("examForm.open", { imageAnswers: true });
    await s.student({ action: "saveDraft", baseRevision: 0, answers: { S01Q01: { text: "EcoResort" } } });
    await s.student({ action: "addImage", questionId: IMAGE_Q.questionId, dataUrl: await pngDataUrl() });
    await s.teacher("examForm.review", { studentId: "s1", expectedRevision: 1, ratings: {} });
    sessionStorage.setItem("examBankSessionDisplayName", "وليد سالم");
    const printed = watchPrint();
    render(<StudentExamForm token="st" projectCode={CODE} onClose={() => {}} saveDelayMs={5} />);
    const button = await screen.findByRole("button", { name: "طباعة / حفظ PDF" });
    await waitFor(() => expect(document.querySelector(".eb-sp-form-image-view img")).not.toBeNull());   // the page's own thumbnail is loaded
    const before = s.sent.filter(r => r.url.includes("image=")).length;
    fireEvent.click(button);
    await waitFor(() => expect(printed).toHaveLength(1));
    const html = printed[0];
    expect(html).toContain("وليد سالم");
    expect(html).toContain("EcoResort");
    expect(html).toContain("نسخة الطالب");
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toMatch(/src="data:image\/webp;base64,/);                       // the stored (sanitized) image, embedded
    expect(s.sent.filter(r => r.url.includes("image=")).length).toBe(before + 1);   // read with the student's session, once for the document
    for (const hidden of ["تصحيح آلي", "تقدير القسم", "علامة الاستمارة", "الإجابة الصحيحة"]) expect(html).not.toContain(hidden);
    expect(html.match(/<section>/g)).toHaveLength(16);                           // the whole form, not the section on screen
  });

  it("after the approval the copy carries the mark, each section's level and note, and right / wrong — never a key", async () => {
    const s = server();
    await s.teacher("examForm.open");
    const answers = allAnswers();
    const q = Q("S04Q04");
    answers.S04Q04 = { ...answerOf(q), optionId: q.options!.find(o => o.id !== q.answer!.correctOptionId)!.id };
    await s.student({ action: "saveDraft", baseRevision: 0, answers });
    await s.student({ action: "submit", baseRevision: 1 });
    await s.teacher("examForm.review", { studentId: "s1", expectedRevision: 2, generalNote: "عمل مرتب", ratings: { ...rateAll(4), S04: { level: 2, note: "جدول الشبكات ناقص" } } });
    expect((await s.teacher("examForm.approve", { studentId: "s1", expectedRevision: 3 })).status).toBe(200);
    const printed = watchPrint();
    render(<StudentExamForm token="st" projectCode={CODE} onClose={() => {}} saveDelayMs={5} />);
    fireEvent.click(await screen.findByRole("button", { name: "طباعة / حفظ PDF" }));
    await waitFor(() => expect(printed).toHaveLength(1));
    const html = printed[0];
    expect(html).toContain('علامة الاستمارة: <span dir="ltr">94.5 / 100</span>');
    expect(html).toContain("عمل مرتب");
    expect(html).toContain("جدول الشبكات ناقص");
    expect(html.match(/class="rating"/g)).toHaveLength(16);
    expect(html.match(/تصحيح آلي: إجابة خاطئة/g)).toHaveLength(1);
    expect(html.match(/تصحيح آلي: إجابة صحيحة/g)).toHaveLength(12);
    expect(html).not.toContain(">" + q.options!.find(o => o.id === q.answer!.correctOptionId)!.text + "<");
    expect(html).toContain("تاريخ الاعتماد");
  });
});

describe("F5 PDF — the teacher's copy", () => {
  const review = () => render(<TeacherExamFormReview token="tt" projectCode={CODE} classId="c1" studentId="s1" onClose={() => {}} />);
  // A class with image answers on: a submit needs every required image, so each question that asks for images gets its minimum.
  const WITH_IMAGES = QUESTIONS.filter(q => q.images && q.images.min > 0);
  const IMAGES = WITH_IMAGES.reduce((n, q) => n + q.images!.min, 0);
  async function submitted() {
    const s = server();
    await s.teacher("examForm.open", { imageAnswers: true });
    expect((await s.student({ action: "saveDraft", baseRevision: 0, answers: allAnswers() })).status).toBe(200);
    const url = await pngDataUrl();
    for (const q of WITH_IMAGES) for (let i = 0; i < q.images!.min; i += 1) expect((await s.student({ action: "addImage", questionId: q.questionId, dataUrl: url })).status).toBe(200);
    expect((await s.student({ action: "submit", baseRevision: s.doc().revision })).status).toBe(200);
    return s;
  }

  it("prints the answers, right / wrong, the stored ratings (said to be not approved) and the image — and no key", async () => {
    const s = await submitted();
    expect((await s.teacher("examForm.review", { studentId: "s1", expectedRevision: s.doc().revision, ratings: { S01: { level: 3, note: "اسم المشروع واضح" } }, generalNote: "ملاحظة عامة" })).status).toBe(200);
    const printed = watchPrint();
    review();
    await screen.findByTestId("exam-form-review");
    await waitFor(() => expect(document.querySelector(".eb-sp-form-image-view img")).not.toBeNull());   // the review's own thumbnails are loaded
    const before = s.sent.filter(r => r.url.includes("resource=exam-form-image")).length;
    fireEvent.click(screen.getByRole("button", { name: "طباعة / حفظ PDF" }));
    await waitFor(() => expect(printed).toHaveLength(1));
    const html = printed[0];
    expect(html).toContain("وليد سالم");
    expect(html).toContain("نسخة المعلم — لا تتضمن مفاتيح الإجابة");
    expect(html.match(/تصحيح آلي: إجابة صحيحة/g)).toHaveLength(13);
    expect(html.match(/class="rating"/g)).toHaveLength(1);
    expect(html).toContain("اسم المشروع واضح");
    expect(html).toContain("تقديرات المعلم المحفوظة — لم تُعتمد بعد، ولا يراها الطالب.");
    expect(html).toContain("ملاحظة عامة");
    expect(html).not.toContain("علامة الاستمارة");                               // no mark before the approval
    expect(html.match(/<img /g)).toHaveLength(IMAGES);                           // every attached image of the form, not only the section on screen
    expect(s.sent.filter(r => r.url.includes("resource=exam-form-image")).length).toBe(before + IMAGES);   // each read once more, with the teacher's session
    for (const key of ["correctOptionId", "الإجابة الصحيحة"]) expect(html).not.toContain(key);
    expect(html).not.toContain("Cs1");                                           // the student's login code is not printed
  });

  it("unsaved ratings are not printed: the page asks to save them first", async () => {
    await submitted();
    const printed = watchPrint();
    review();
    await screen.findByTestId("exam-form-review");
    fireEvent.click(within(screen.getByTestId("exam-form-rating")).getAllByRole("radio")[4]);
    fireEvent.click(screen.getByRole("button", { name: "طباعة / حفظ PDF" }));
    expect((await within(screen.getByTestId("exam-form-print")).findByRole("alert")).textContent).toContain("احفظ التقديرات أولًا");
    expect(printed).toHaveLength(0);
  });

  it("an approved form prints its mark", async () => {
    const s = await submitted();
    expect((await s.teacher("examForm.review", { studentId: "s1", expectedRevision: s.doc().revision, ratings: rateAll(4) })).status).toBe(200);
    expect((await s.teacher("examForm.approve", { studentId: "s1", expectedRevision: s.doc().revision })).status).toBe(200);
    const printed = watchPrint();
    review();
    await screen.findByTestId("exam-form-review");
    fireEvent.click(screen.getByRole("button", { name: "طباعة / حفظ PDF" }));
    await waitFor(() => expect(printed).toHaveLength(1));
    expect(printed[0]).toContain('علامة الاستمارة: <span dir="ltr">100 / 100</span>');
    expect(printed[0]).not.toContain("لم تُعتمد بعد");
    expect(printed[0].match(/class="rating"/g)).toHaveLength(16);
  });

  it("when the browser cannot print, the page says so", async () => {
    await submitted();
    const append = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, "appendChild").mockImplementation(<T extends Node>(n: T) => { const r = append(n); if (n instanceof HTMLIFrameElement && n.contentWindow) (n.contentWindow as unknown as { print?: unknown }).print = undefined; return r; });
    review();
    await screen.findByTestId("exam-form-review");
    fireEvent.click(screen.getByRole("button", { name: "طباعة / حفظ PDF" }));
    expect((await within(screen.getByTestId("exam-form-print")).findByRole("alert")).textContent).toContain("تعذر فتح نافذة الطباعة");
  });
});
