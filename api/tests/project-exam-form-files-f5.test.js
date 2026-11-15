import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { getExamFormTemplate, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { isAnswered, formProgress, normalizeAnswer, deferredKindsOf } from "../src/lib/project-tracker/exam-form-answers.js";
import { MAX_FILE_BYTES, isFileId, describeFileName, decodeFileUpload, assertFileContent, applySetFile, applyRemoveFile, referencedFile, attachmentDisposition } from "../src/lib/project-tracker/exam-form-files.js";
import { handler as studentForm } from "../src/functions/student-project-exam-form.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase F5 (files, server side) — the file a student attaches to a file question of the project exam form («أرفق ملف Packet
// Tracer», «أرفق كتاب المشروع»): a class's file answers are off until its teacher switches them on; an upload is bounded,
// named, checked against the kind the question asks for and stored as opaque bytes under the student who owns it; a
// reference is written only by the server; one file per question; a file is served only as a download, to its owner and to
// the teacher of the class; with files on, a required file question counts for a submit
// (docs/enterprise-project-exam-form-f5-files.md).

const CODE = "794589";
const NS = getStorageNamespace(CODE);
const NOW = "2026-11-14T08:00:00.000Z";
const TEMPLATE = getExamFormTemplate(CODE);
const QUESTIONS = TEMPLATE.sections.flatMap(s => s.questions);
const FILE_QUESTIONS = QUESTIONS.filter(q => q.kind === "file");
const PKT = FILE_QUESTIONS.find(q => q.accept.includes(".pkt"));                         // «أرفق ملف Packet Tracer النهائي»
const BOOK = FILE_QUESTIONS.find(q => q.accept.includes(".docx"));                       // «أرفق كتاب المشروع النهائي» (.docx / .pdf)
const TEXT = QUESTIONS.find(q => q.kind === "shortText" && !q.images);
const IMAGE = QUESTIONS.find(q => q.kind === "image");
const TEXT_ANSWERABLE = QUESTIONS.filter(q => q.kind !== "image" && q.kind !== "file");
const ON = { fileAnswers: true };
const clone = v => JSON.parse(JSON.stringify(v));
const user = (id, cid, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id, ...extra });
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "12", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [CODE], createdAt: NOW, updatedAt: NOW, ...extra });

function fullAnswer(q) {
  switch (q.kind) {
    case "shortText": case "paragraph": case "cli": return { text: "جواب " + q.questionId };
    case "table": return { rows: Array.from({ length: q.minRows }, (_, i) => Object.fromEntries(q.columns.map(c => [c.id, c.id + i]))) };
    case "choice": return q.justification ? { optionId: q.options[0].id, justification: "تبرير" } : { optionId: q.options[0].id };
    case "multiChoice": return { optionIds: [q.options[0].id] };
    case "matching": return { pairs: Object.fromEntries(q.left.map((l, i) => [l.id, q.right[i % q.right.length].id])) };
    case "ordering": return { order: q.items.map(i => i.id) };
    case "scale": return { values: Object.fromEntries(q.items.map(i => [i.id, q.max])) };
    case "checklist": return { checked: [q.items[0].id] };
    case "declaration": return { accepted: true };
    default: throw new Error("no answer for " + q.kind);
  }
}
const textAnswers = () => Object.fromEntries(TEXT_ANSWERABLE.map(q => [q.questionId, fullAnswer(q)]));

// Bytes of each kind. The ZIP is a real (stored) archive built here: local headers, a central directory and its end record.
function zip(entries) {
  const locals = [], central = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const n = Buffer.from(name), data = Buffer.from(content), crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt32LE(crc, 16); head.writeUInt32LE(data.length, 20); head.writeUInt32LE(data.length, 24); head.writeUInt16LE(n.length, 28); head.writeUInt32LE(offset, 42);
    locals.push(local, n, data); central.push(head, n);
    offset += 30 + n.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const docx = (extra = []) => zip([["[Content_Types].xml", "<Types/>"], ["word/document.xml", "<w:document/>"], ...extra]);
const pdf = () => Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
// A Packet Tracer file has no published signature: an opaque binary stream (the first bytes of a real one are 34 1e a0 e7).
const pkt = (size = 4096) => { const b = Buffer.alloc(size, 0xa7); Buffer.from([0x34, 0x1e, 0xa0, 0xe7, 0x0b, 0xf3, 0x72, 0x0f]).copy(b); return b; };
const b64 = buffer => buffer.toString("base64");

function setup(extra = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"), "platform/classes/c2.json": room("c2"),
    "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1"), "platform/users/s3.json": user("s3", "c2"),
    ...extra
  });
  const audits = [];
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, ev) => { audits.push(ev); } };
  const studentDeps = id => ({ ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: id, sv: 1 }, student: ctx.getJson("platform/users/" + id + ".json") }) });
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const get = (id = "s1", params = {}) => studentForm({ method: "GET", url: "https://x/api/student-project-exam-form?" + new URLSearchParams({ projectCode: CODE, ...params }), json: async () => ({}) }, studentDeps(id));
  const post = (body, id = "s1") => studentForm({ method: "POST", url: "https://x/api/student-project-exam-form", json: async () => ({ projectCode: CODE, ...body }) }, studentDeps(id));
  const add = (questionId, fileName, buffer, id = "s1") => post({ action: "addFile", questionId, fileName, dataBase64: Buffer.isBuffer(buffer) ? b64(buffer) : buffer }, id);
  const remove = (questionId, fileId, id = "s1") => post({ action: "removeFile", questionId, fileId }, id);
  const teacher = (body, classId = "c1") => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId, ...body }) }, teacherDeps);
  const teacherGet = (params, classId = "c1") => tracker({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: CODE, classId, ...params }), json: async () => ({}) }, teacherDeps);
  const open = (options = ON, classId = "c1") => teacher({ action: "examForm.open", ...options }, classId);
  const doc = (id = "s1", classId = "c1") => (ctx.has(NS.examFormAnswersName(classId, id)) ? ctx.getJson(NS.examFormAnswersName(classId, id)) : null);
  const classForm = (classId = "c1") => ctx.getJson(NS.examFormClassName(classId));
  const fileBlobs = () => ctx.names("platform/project-exam-forms/" + CODE + "/files/");
  return { ctx, audits, get, post, add, remove, teacher, teacherGet, open, doc, classForm, fileBlobs };
}

describe("F5 — a class's file answers are off until its teacher switches them on", () => {
  it("the default open leaves file questions deferred, exactly as before F5", async () => {
    const t = setup();
    await t.open({});
    expect("fileAnswers" in t.classForm()).toBe(false);
    const body = (await t.get()).jsonBody;
    expect(body.deferredKinds).toEqual(["image", "file"]);
    expect(body.progress.total).toBe(TEXT_ANSWERABLE.length);
    const refused = await t.add(PKT.questionId, "net.pkt", pkt());
    expect(refused.status).toBe(400);
    expect(refused.jsonBody.code).toBe("KIND_NOT_AVAILABLE");
    expect(t.fileBlobs()).toEqual([]);                                           // nothing was stored for a refused upload
    expect(t.doc()).toBeNull();
    expect((await t.teacherGet({ resource: "exam-form" })).jsonBody.examForm.fileAnswers).toBeUndefined();
  });

  it("the first open can switch them on: file questions become answerable, images stay deferred, and it is audited", async () => {
    const t = setup();
    const r = await t.open({ fileAnswers: true });
    expect(r.jsonBody).toMatchObject({ changed: true, examForm: { state: "open", fileAnswers: true } });
    expect(r.jsonBody.examForm.imageAnswers).toBeUndefined();
    expect(t.classForm()).toMatchObject({ fileAnswers: true, fileAnswersAt: expect.any(String), fileAnswersBy: "teacher-1" });
    expect(t.audits.map(a => [a.action, a.details.firstOpen, a.details.fileAnswers, a.details.imageAnswers])).toEqual([["project.exam_form.open", true, true, undefined]]);
    const body = (await t.get()).jsonBody;
    expect(body.deferredKinds).toEqual(["image"]);
    expect(body.progress.total).toBe(TEXT_ANSWERABLE.length + FILE_QUESTIONS.length);
    expect(body.progress.deferred).toBe(QUESTIONS.filter(q => q.kind === "image").length);
  });

  it("a later open can switch them on (audited as a change), never off; a repeat changes nothing", async () => {
    const t = setup();
    await t.open({});
    const on = await t.open({ fileAnswers: true });
    expect(on.jsonBody).toMatchObject({ changed: true, examForm: { fileAnswers: true } });
    expect(t.audits.map(a => a.details.fileAnswers)).toEqual([undefined, true]);
    const again = await t.open({ fileAnswers: true });
    expect(again.jsonBody.changed).toBe(false);
    expect(t.audits).toHaveLength(2);
    const off = await t.open({ fileAnswers: false });
    expect(off.status).toBe(409);
    expect(off.jsonBody.code).toBe("FILES_FROZEN");
    expect(t.classForm().fileAnswers).toBe(true);
    expect((await t.open({})).jsonBody.examForm.fileAnswers).toBe(true);          // an open that does not mention it keeps it on
  });

  it("the switch is per class, independent of the image switch, and only a boolean is accepted", async () => {
    const t = setup();
    await t.open({ fileAnswers: true });
    await t.open({ imageAnswers: true }, "c2");
    expect((await t.get("s1")).jsonBody.deferredKinds).toEqual(["image"]);
    expect((await t.get("s3")).jsonBody.deferredKinds).toEqual(["file"]);
    expect((await t.open({ imageAnswers: true })).jsonBody.examForm).toMatchObject({ imageAnswers: true, fileAnswers: true });
    expect((await t.get("s1")).jsonBody.deferredKinds).toEqual([]);
    for (const bad of ["yes", 1, null, {}]) {
      const r = await t.open({ fileAnswers: bad }, "c2");
      expect(r.status).toBe(400);
      expect(r.jsonBody.code).toBe("BAD_FILE_ANSWERS");
    }
    expect("fileAnswers" in t.classForm("c2")).toBe(false);
  });
});

describe("F5 — attaching a file", () => {
  it("stores the bytes unchanged under the student, references them from the answer, and does not move the revision", async () => {
    const t = setup();
    await t.open();
    await t.post({ action: "saveDraft", baseRevision: 0, answers: { [TEXT.questionId]: { text: "نص" } } });
    const bytes = pkt(5000);
    const r = await t.add(PKT.questionId, "final-network.pkt", bytes);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, changed: true, revision: 1, file: { name: "final-network.pkt", ext: ".pkt", bytes: 5000 } });
    expect(isFileId(r.jsonBody.file.id)).toBe(true);
    const stored = t.doc().answers[PKT.questionId];
    expect(stored).toEqual({ file: { id: r.jsonBody.file.id, name: "final-network.pkt", ext: ".pkt", bytes: 5000, addedAt: expect.any(String) } });
    expect(t.doc().answers[TEXT.questionId]).toEqual({ text: "نص" });             // other answers untouched
    const name = NS.examFormFileName("c1", "s1", r.jsonBody.file.id);
    expect(t.fileBlobs()).toEqual([name]);
    expect(name.endsWith(".bin")).toBe(true);                                    // the stored name never carries the uploaded extension
    expect(name).toContain("/files/c1/s1/");
    expect(Buffer.compare(t.ctx.getBinary(name).buffer, bytes)).toBe(0);
    expect(t.ctx.getBinary(name).contentType).toBe("application/octet-stream");
    expect(r.jsonBody.progress.answered).toBe(2);
  });

  it("a book question takes a Word document or a PDF, with an Arabic name", async () => {
    const t = setup();
    await t.open();
    const word = await t.add(BOOK.questionId, "كتاب المشروع.docx", docx());
    expect(word.status).toBe(200);
    expect(word.jsonBody.file).toMatchObject({ name: "كتاب المشروع.docx", ext: ".docx" });
    const asPdf = await t.add(BOOK.questionId, "Book.PDF", pdf());
    expect(asPdf.status).toBe(200);
    expect(asPdf.jsonBody.file).toMatchObject({ name: "Book.pdf", ext: ".pdf" });
  });

  it("one file per question: a second upload replaces the first, and the replaced bytes are removed", async () => {
    const t = setup();
    await t.open();
    const first = (await t.add(PKT.questionId, "v1.pkt", pkt(1000))).jsonBody.file;
    const second = (await t.add(PKT.questionId, "v2.pkt", pkt(2000))).jsonBody.file;
    expect(second.id).not.toBe(first.id);
    expect(t.doc().answers[PKT.questionId].file).toMatchObject({ id: second.id, name: "v2.pkt", bytes: 2000 });
    expect(t.fileBlobs()).toEqual([NS.examFormFileName("c1", "s1", second.id)]);
    expect((await t.get("s1", { file: first.id })).status).toBe(404);
  });

  it("the name is a label, never a path: only the last segment is kept, control characters dropped, the length bounded", async () => {
    const t = setup();
    await t.open();
    const r = await t.add(PKT.questionId, "..\\..\\secret/dir/my\u0000 net\u202e.pkt", pkt());
    expect(r.jsonBody.file.name).toBe("my net.pkt");
    const long = await t.add(PKT.questionId, "ا".repeat(400) + ".pkt", pkt());
    expect(long.jsonBody.file.name).toHaveLength(120);
    expect(long.jsonBody.file.name.endsWith(".pkt")).toBe(true);
    expect(t.fileBlobs().every(n => /\/files\/c1\/s1\/[a-f0-9]{24}\.bin$/.test(n))).toBe(true);
  });

  describe("an upload that is not what the question asks for is refused, and nothing is stored", () => {
    const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200, 1)]);
    const cases = [
      ["an extension the question does not accept", () => [PKT.questionId, "book.docx", docx()], 400, "FILE_TYPE"],
      ["a PDF on the Packet Tracer question", () => [PKT.questionId, "net.pdf", pdf()], 400, "FILE_TYPE"],
      ["a Packet Tracer file on the book question", () => [BOOK.questionId, "net.pkt", pkt()], 400, "FILE_TYPE"],
      ["an executable named .pkt", () => [PKT.questionId, "net.pkt", exe], 400, "FILE_CONTENT"],
      ["a ZIP archive named .pkt", () => [PKT.questionId, "net.pkt", zip([["a.txt", "x"]])], 400, "FILE_CONTENT"],
      ["a PDF named .pkt", () => [PKT.questionId, "net.pkt", pdf()], 400, "FILE_CONTENT"],
      ["an HTML page named .pkt", () => [PKT.questionId, "net.pkt", Buffer.from("<!DOCTYPE html><html><script>alert(1)</script></html>")], 400, "FILE_CONTENT"],
      ["an SVG named .pkt", () => [PKT.questionId, "net.pkt", Buffer.from("  <svg xmlns='http://www.w3.org/2000/svg' onload='x()'/>")], 400, "FILE_CONTENT"],
      ["a shell script named .pkt", () => [PKT.questionId, "net.pkt", Buffer.from("#!/bin/sh\nrm -rf /\n")], 400, "FILE_CONTENT"],
      ["text named .pdf", () => [BOOK.questionId, "book.pdf", Buffer.from("just some text, not a PDF")], 400, "FILE_CONTENT"],
      ["a ZIP that is not a Word document, named .docx", () => [BOOK.questionId, "book.docx", zip([["readme.txt", "x"]])], 400, "FILE_CONTENT"],
      ["a PDF named .docx", () => [BOOK.questionId, "book.docx", pdf()], 400, "FILE_CONTENT"],
      ["a Word document with a macro project", () => [BOOK.questionId, "book.docx", docx([["word/vbaProject.bin", "macro"]])], 400, "FILE_MACROS"],
      ["a macro-enabled extension", () => [BOOK.questionId, "book.docm", docx()], 400, "FILE_TYPE"],
      ["a double extension that ends in a refused one", () => [BOOK.questionId, "book.docx.exe", docx()], 400, "FILE_TYPE"],
      ["a name without an extension", () => [PKT.questionId, "network", pkt()], 400, "FILE_NAME"],
      ["a name that is only an extension", () => [PKT.questionId, ".pkt", pkt()], 400, "FILE_NAME"],
      ["a name that is not text", () => [PKT.questionId, 42, pkt()], 400, "FILE_NAME"],
      ["an empty upload", () => [PKT.questionId, "net.pkt", ""], 400, "EMPTY"],
      ["an upload that is not base64", () => [PKT.questionId, "net.pkt", "data:application/octet-stream;base64,AAAA"], 400, "FILE_ENCODING"],
      ["an upload that is not text", () => [PKT.questionId, "net.pkt", { bytes: [1, 2] }], 400, "EMPTY"]
    ];
    for (const [name, make, status, code] of cases) {
      it(name, async () => {
        const t = setup();
        await t.open();
        const [questionId, fileName, data] = make();
        const r = await t.add(questionId, fileName, data);
        expect(r.status).toBe(status);
        expect(r.jsonBody.code).toBe(code);
        expect(t.fileBlobs()).toEqual([]);
        expect(t.doc()).toBeNull();
      });
    }
  });

  it("the size is bounded before anything is stored: just inside is accepted, just over is 413", async () => {
    const t = setup();
    await t.open();
    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
    const inside = await t.add(PKT.questionId, "big.pkt", pkt(MAX_FILE_BYTES));
    expect(inside.status).toBe(200);
    const over = await t.add(PKT.questionId, "huge.pkt", pkt(MAX_FILE_BYTES + 1));
    expect(over.status).toBe(413);
    expect(over.jsonBody.code).toBe("TOO_LARGE");
    expect(t.fileBlobs()).toHaveLength(1);                                       // the accepted one stays; the refused one stored nothing
    expect(t.doc().answers[PKT.questionId].file.name).toBe("big.pkt");
  });

  it("refuses a question that is not a file question, an unknown question and a hidden one", async () => {
    const t = setup();
    await t.teacher({ action: "examForm.open", fileAnswers: true, hiddenQuestionIds: [BOOK.questionId] });
    for (const [questionId, code] of [[TEXT.questionId, "NO_FILE_HERE"], [IMAGE.questionId, "NO_FILE_HERE"], ["S99Q01", "UNKNOWN_QUESTION"], [BOOK.questionId, "UNKNOWN_QUESTION"], [undefined, "UNKNOWN_QUESTION"]]) {
      const r = await t.add(questionId, "x.pkt", pkt());
      expect(r.status).toBe(400);
      expect(r.jsonBody.code).toBe(code);
    }
    expect(t.fileBlobs()).toEqual([]);
  });

  it("a closed form, a submitted form, an approved form and an archived class take no file; a returned form does", async () => {
    const t = setup();
    await t.open();
    await t.teacher({ action: "examForm.close" });
    const closed = await t.add(PKT.questionId, "net.pkt", pkt());
    expect([closed.status, closed.jsonBody.code]).toEqual([409, "FORM_CLOSED"]);
    await t.open({});
    // a complete form: every text answer and both files
    await t.post({ action: "saveDraft", baseRevision: 0, answers: textAnswers() });
    await t.add(PKT.questionId, "net.pkt", pkt());
    await t.add(BOOK.questionId, "book.pdf", pdf());
    expect((await t.post({ action: "submit", baseRevision: 1 })).status).toBe(200);
    const before = t.fileBlobs();
    const submitted = await t.add(PKT.questionId, "late.pkt", pkt());
    expect([submitted.status, submitted.jsonBody.code]).toEqual([409, "FORM_SUBMITTED"]);
    const removeSubmitted = await t.remove(PKT.questionId, t.doc().answers[PKT.questionId].file.id);
    expect([removeSubmitted.status, removeSubmitted.jsonBody.code]).toEqual([409, "FORM_SUBMITTED"]);
    expect(t.fileBlobs()).toEqual(before);                                       // the refused upload left no orphan blob
    // returned: writable again
    await t.teacher({ action: "examForm.return", studentId: "s1", expectedRevision: 2 });
    const returned = await t.add(PKT.questionId, "fixed.pkt", pkt(3000));
    expect(returned.status).toBe(200);
    expect(t.doc().answers[PKT.questionId].file.name).toBe("fixed.pkt");
    // approved: final
    await t.post({ action: "submit", baseRevision: t.doc().revision });
    await t.teacher({ action: "examForm.review", studentId: "s1", expectedRevision: t.doc().revision, ratings: Object.fromEntries(TEMPLATE.sections.map(s => [s.sectionId, { level: 4 }])) });
    await t.teacher({ action: "examForm.approve", studentId: "s1", expectedRevision: t.doc().revision });
    const approved = await t.add(PKT.questionId, "after.pkt", pkt());
    expect([approved.status, approved.jsonBody.code]).toEqual([409, "FORM_APPROVED"]);
    // archived class
    t.ctx.setJson("platform/classes/c1.json", room("c1", { status: "archived", active: false }));
    expect((await t.add(PKT.questionId, "x.pkt", pkt(), "s2")).status).toBe(403);
  });

  it("the student and the class come from the session only", async () => {
    const t = setup();
    await t.open();
    const r = await t.post({ action: "addFile", questionId: PKT.questionId, fileName: "net.pkt", dataBase64: b64(pkt()), studentId: "s2", classId: "c2" }, "s1");
    expect(r.status).toBe(200);
    expect(t.fileBlobs()).toEqual([NS.examFormFileName("c1", "s1", r.jsonBody.file.id)]);
    expect(t.doc("s2")).toBeNull();
    // a student of a class whose form was never opened
    const other = await t.add(PKT.questionId, "net.pkt", pkt(), "s3");
    expect(other.status).toBe(404);
    expect(t.fileBlobs()).toHaveLength(1);
  });
});

describe("F5 — removing a file", () => {
  it("removes the reference and the bytes; a repeat changes nothing; the answer is not left as an empty shell", async () => {
    const t = setup();
    await t.open();
    const file = (await t.add(PKT.questionId, "net.pkt", pkt())).jsonBody.file;
    const r = await t.remove(PKT.questionId, file.id);
    expect(r.status).toBe(200);
    expect(r.jsonBody.changed).toBe(true);
    expect(PKT.questionId in t.doc().answers).toBe(false);
    expect(t.fileBlobs()).toEqual([]);
    const again = await t.remove(PKT.questionId, file.id);
    expect(again.status).toBe(200);
    expect(again.jsonBody.changed).toBe(false);
  });

  it("another id, another student's file and a malformed id remove nothing", async () => {
    const t = setup();
    await t.open();
    const mine = (await t.add(PKT.questionId, "mine.pkt", pkt())).jsonBody.file;
    const theirs = (await t.add(PKT.questionId, "theirs.pkt", pkt(), "s2")).jsonBody.file;
    expect((await t.remove(PKT.questionId, theirs.id)).jsonBody.changed).toBe(false);        // s1 names s2's file
    expect((await t.remove(PKT.questionId, "f".repeat(24))).jsonBody.changed).toBe(false);
    expect((await t.remove(PKT.questionId, "../" + mine.id)).status).toBe(400);
    expect(t.fileBlobs()).toHaveLength(2);
    expect(t.doc("s1").answers[PKT.questionId].file.id).toBe(mine.id);
    expect(t.doc("s2").answers[PKT.questionId].file.id).toBe(theirs.id);
  });
});

describe("F5 — reading a file", () => {
  it("the owner downloads the same bytes, always as an attachment of an opaque type", async () => {
    const t = setup();
    await t.open();
    const bytes = docx();
    const file = (await t.add(BOOK.questionId, "كتاب (نهائي).docx", bytes)).jsonBody.file;
    const r = await t.get("s1", { file: file.id });
    expect(r.status).toBe(200);
    expect(Buffer.compare(r.body, bytes)).toBe(0);
    expect(r.headers["content-type"]).toBe("application/octet-stream");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["cache-control"]).toBe("private, no-store");
    expect(r.headers["content-disposition"]).toBe("attachment; filename=\"file.docx\"; filename*=UTF-8''" + encodeURIComponent("كتاب (نهائي).docx").replace(/[()]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase()));
  });

  it("a PDF is a download too: never inline, never application/pdf", async () => {
    const t = setup();
    await t.open();
    const file = (await t.add(BOOK.questionId, "book.pdf", pdf())).jsonBody.file;
    const r = await t.get("s1", { file: file.id });
    expect(r.headers["content-type"]).toBe("application/octet-stream");
    expect(r.headers["content-disposition"].startsWith("attachment;")).toBe(true);
    const teacher = await t.teacherGet({ resource: "exam-form-file", studentId: "s1", fileId: file.id });
    expect(teacher.headers["content-type"]).toBe("application/octet-stream");
    expect(teacher.headers["content-disposition"].startsWith("attachment;")).toBe(true);
    expect(teacher.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("a classmate, an unreferenced id, a malformed id and an orphan blob are all 404", async () => {
    const t = setup();
    await t.open();
    const file = (await t.add(PKT.questionId, "net.pkt", pkt())).jsonBody.file;
    expect((await t.get("s2", { file: file.id })).status).toBe(404);                         // a classmate
    expect((await t.get("s1", { file: "a".repeat(24) })).status).toBe(404);
    expect((await t.get("s1", { file: "../" + file.id })).status).toBe(404);
    expect((await t.get("s1", { file: "" })).status).toBe(404);
    // a blob under the student's prefix that the answers do not reference is never served
    const orphan = "b".repeat(24);
    await t.ctx.container.getBlockBlobClient(NS.examFormFileName("c1", "s1", orphan)).upload(Buffer.from("orphan"), 6, { blobHTTPHeaders: { blobContentType: "application/octet-stream" } });
    expect(t.fileBlobs()).toContain(NS.examFormFileName("c1", "s1", orphan));
    expect((await t.get("s1", { file: orphan })).status).toBe(404);
    expect((await t.teacherGet({ resource: "exam-form-file", studentId: "s1", fileId: orphan })).status).toBe(404);
    // an archived class keeps its record readable
    t.ctx.setJson("platform/classes/c1.json", room("c1", { status: "archived", active: false }));
    expect((await t.get("s1", { file: file.id })).status).toBe(200);
  });

  it("the teacher of the class downloads it; another class, another student and a former member do not", async () => {
    const t = setup();
    await t.open();
    await t.open(ON, "c2");
    const bytes = pkt(2222);
    const file = (await t.add(PKT.questionId, "net.pkt", bytes)).jsonBody.file;
    const ok = await t.teacherGet({ resource: "exam-form-file", studentId: "s1", fileId: file.id });
    expect(ok.status).toBe(200);
    expect(Buffer.compare(ok.body, bytes)).toBe(0);
    expect((await t.teacherGet({ resource: "exam-form-file", studentId: "s2", fileId: file.id })).status).toBe(404);   // another student's id
    expect((await t.teacherGet({ resource: "exam-form-file", studentId: "s1", fileId: file.id }, "c2")).status).toBe(404);   // through another class
    expect((await t.teacherGet({ resource: "exam-form-file", fileId: file.id })).status).toBe(404);
    expect((await t.teacherGet({ resource: "exam-form-file", studentId: "s1" })).status).toBe(404);
    // the student leaves the class: the file is no longer served through it
    t.ctx.setJson("platform/users/s1.json", user("s1", "c2"));
    expect((await t.teacherGet({ resource: "exam-form-file", studentId: "s1", fileId: file.id })).status).toBe(404);
  });

  it("the teacher's review of the student carries the file reference with its name and size", async () => {
    const t = setup();
    await t.open();
    const file = (await t.add(PKT.questionId, "net.pkt", pkt(1234))).jsonBody.file;
    const view = (await t.teacherGet({ resource: "exam-form-student", studentId: "s1" })).jsonBody;
    expect(view.answers[PKT.questionId].file).toMatchObject({ id: file.id, name: "net.pkt", ext: ".pkt", bytes: 1234 });
  });
});

describe("F5 — drafts never write a file", () => {
  it("a draft that names a file question is refused, with or without a forged reference; the stored file stays", async () => {
    const t = setup();
    await t.open();
    const file = (await t.add(PKT.questionId, "net.pkt", pkt())).jsonBody.file;
    for (const forged of [{ file: { id: "c".repeat(24), name: "x.pkt", ext: ".pkt", bytes: 1 } }, { text: "x" }, null]) {
      const r = await t.post({ action: "saveDraft", baseRevision: t.doc().revision, answers: { [PKT.questionId]: forged } });
      expect(r.status).toBe(400);
      expect(r.jsonBody.code).toBe("FILE_VIA_UPLOAD");
    }
    expect(t.doc().answers[PKT.questionId].file.id).toBe(file.id);
    // a forged reference on another kind of question is dropped
    const text = await t.post({ action: "saveDraft", baseRevision: t.doc().revision, answers: { [TEXT.questionId]: { text: "نص", file: { id: "d".repeat(24), name: "x.pkt" } } } });
    expect(text.status).toBe(200);
    expect(t.doc().answers[TEXT.questionId]).toEqual({ text: "نص" });
  });

  it("with files off a draft naming a file question is «not available», as before F5", async () => {
    const t = setup();
    await t.open({});
    const r = await t.post({ action: "saveDraft", baseRevision: 0, answers: { [PKT.questionId]: null } });
    expect(r.status).toBe(400);
    expect(r.jsonBody.code).toBe("KIND_NOT_AVAILABLE");
  });
});

describe("F5 — progress and submit", () => {
  it("with files on, a required file question blocks the submit until its file is attached", async () => {
    const t = setup();
    await t.open();
    await t.post({ action: "saveDraft", baseRevision: 0, answers: textAnswers() });
    const blocked = await t.post({ action: "submit", baseRevision: 1 });
    expect(blocked.status).toBe(400);
    expect(blocked.jsonBody.code).toBe("FORM_INCOMPLETE");
    expect(blocked.jsonBody.missing.sort()).toEqual([PKT.questionId, BOOK.questionId].sort());
    await t.add(PKT.questionId, "net.pkt", pkt());
    const one = await t.post({ action: "submit", baseRevision: 1 });
    expect(one.jsonBody.missing).toEqual([BOOK.questionId]);
    await t.add(BOOK.questionId, "book.docx", docx());
    const done = await t.post({ action: "submit", baseRevision: 1 });
    expect(done.status).toBe(200);
    expect(done.jsonBody).toMatchObject({ status: "submitted", progress: { missing: [], answered: TEXT_ANSWERABLE.length + 2 } });
  });

  it("with files off, file questions never count and never block (as before F5)", async () => {
    const t = setup();
    await t.open({});
    await t.post({ action: "saveDraft", baseRevision: 0, answers: textAnswers() });
    const done = await t.post({ action: "submit", baseRevision: 1 });
    expect(done.status).toBe(200);
    expect(done.jsonBody.progress).toMatchObject({ total: TEXT_ANSWERABLE.length, deferred: QUESTIONS.length - TEXT_ANSWERABLE.length });
  });

  it("the class list counts file questions where the class switched them on", async () => {
    const t = setup();
    await t.open();
    await t.add(PKT.questionId, "net.pkt", pkt());
    const row = (await t.teacherGet({ resource: "exam-form-students" })).jsonBody.students.find(s => s.studentId === "s1");
    expect(row).toMatchObject({ status: "draft", answered: 1, total: TEXT_ANSWERABLE.length + FILE_QUESTIONS.length });
  });
});

describe("F5 — the pure rules", () => {
  const file = { id: "a".repeat(24), name: "net.pkt", ext: ".pkt", bytes: 10 };
  const identity = { projectCode: CODE, classId: "c1", studentId: "s1" };

  it("deferred kinds follow the two switches independently", () => {
    expect([...deferredKindsOf(undefined)]).toEqual(["image", "file"]);
    expect([...deferredKindsOf({ imageAnswers: true })]).toEqual(["file"]);
    expect([...deferredKindsOf({ fileAnswers: true })]).toEqual(["image"]);
    expect([...deferredKindsOf({ imageAnswers: true, fileAnswers: true })]).toEqual([]);
    expect([...deferredKindsOf({ fileAnswers: "yes" })]).toEqual(["image", "file"]);        // only `true` switches it on
  });

  it("a file question is answered only by a stored file, and only where files are on", () => {
    expect(isAnswered(PKT, { file }, ON)).toBe(true);
    expect(isAnswered(PKT, { file }, {})).toBe(false);
    expect(isAnswered(PKT, { file }, { imageAnswers: true })).toBe(false);
    expect(isAnswered(PKT, {}, ON)).toBe(false);
    expect(isAnswered(PKT, { file: { id: "nope" } }, ON)).toBe(false);
    expect(isAnswered(PKT, { text: "x" }, ON)).toBe(false);
    expect(formProgress(TEMPLATE, { [PKT.questionId]: { file } }, ON)).toMatchObject({ answered: 1, missing: expect.arrayContaining([BOOK.questionId]) });
    expect(() => normalizeAnswer(PKT, { file }, ON)).toThrow(expect.objectContaining({ code: "FILE_VIA_UPLOAD" }));
    expect(() => normalizeAnswer(PKT, { file }, {})).toThrow(expect.objectContaining({ code: "KIND_NOT_AVAILABLE" }));
  });

  it("applySetFile / applyRemoveFile never change the document they are given", () => {
    const first = applySetFile(null, TEMPLATE, { questionId: PKT.questionId, file, identity, now: NOW, rules: ON });
    expect(first).toMatchObject({ replacedId: null, doc: { status: "draft", revision: 0 } });
    const frozen = JSON.stringify(first.doc);
    const other = { ...file, id: "b".repeat(24), name: "v2.pkt" };
    const second = applySetFile(first.doc, TEMPLATE, { questionId: PKT.questionId, file: other, identity, now: NOW, rules: ON });
    expect(second.replacedId).toBe(file.id);
    expect(second.doc.revision).toBe(0);
    const removed = applyRemoveFile(second.doc, TEMPLATE, { questionId: PKT.questionId, fileId: other.id, now: NOW, rules: ON });
    expect(removed.changed).toBe(true);
    expect(JSON.stringify(first.doc)).toBe(frozen);
    expect(referencedFile(second.doc, other.id)).toMatchObject({ name: "v2.pkt" });
    expect(referencedFile(second.doc, file.id)).toBeNull();
    expect(referencedFile(removed.doc, other.id)).toBeNull();
    expect(referencedFile(null, other.id)).toBeNull();
    expect(applyRemoveFile(null, TEMPLATE, { questionId: PKT.questionId, fileId: other.id, now: NOW, rules: ON })).toEqual({ doc: null, changed: false });
    expect(() => applySetFile(null, TEMPLATE, { questionId: PKT.questionId, file: { ...file, id: "../x" }, identity, now: NOW, rules: ON })).toThrow();
    expect(() => applySetFile(clone({ ...first.doc, status: "submitted" }), TEMPLATE, { questionId: PKT.questionId, file, identity, now: NOW, rules: ON })).toThrow(expect.objectContaining({ code: "FORM_SUBMITTED" }));
  });

  it("names, sizes and contents", () => {
    expect(describeFileName(PKT, "a/b\\c.PKT")).toEqual({ name: "c.pkt", ext: ".pkt" });
    expect(() => describeFileName(PKT, "c.pkt.docx")).toThrow(expect.objectContaining({ code: "FILE_TYPE" }));
    expect(decodeFileUpload(b64(pkt(10)))).toHaveLength(10);
    expect(() => decodeFileUpload("A".repeat(Math.ceil(MAX_FILE_BYTES * 4 / 3) + 8))).toThrow(expect.objectContaining({ code: "TOO_LARGE", httpStatus: 413 }));
    expect(() => assertFileContent(".pkt", pkt())).not.toThrow();
    expect(() => assertFileContent(".docx", docx())).not.toThrow();
    expect(() => assertFileContent(".pdf", pdf())).not.toThrow();
    expect(() => assertFileContent(".exe", pkt())).toThrow(expect.objectContaining({ code: "FILE_CONTENT" }));
    expect(attachmentDisposition("my net (final).pkt", ".pkt")).toBe("attachment; filename=\"my_net_final.pkt\"; filename*=UTF-8''my%20net%20%28final%29.pkt");
    expect(attachmentDisposition("a\"b.pkt", ".pkt")).toBe("attachment; filename=\"a_b.pkt\"; filename*=UTF-8''a%22b.pkt");
  });
});

describe("F5 — the other bundled form", () => {
  it("883589: its book question takes a file the same way", async () => {
    const code = "883589";
    const ns = getStorageNamespace(code);
    const book = getExamFormTemplate(code).sections.flatMap(s => s.questions).find(q => q.kind === "file");
    const ctx = createMemoryContainer({ "platform/classes/c1.json": { ...room("c1"), programCodes: [code] }, "platform/users/s1.json": user("s1", "c1") });
    const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} };
    const sDeps = { ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) };
    const tDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
    await tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: code, classId: "c1", action: "examForm.open", fileAnswers: true }) }, tDeps);
    const r = await studentForm({ method: "POST", url: "https://x/api/student-project-exam-form", json: async () => ({ projectCode: code, action: "addFile", questionId: book.questionId, fileName: "book.pdf", dataBase64: b64(pdf()) }) }, sDeps);
    expect(r.status).toBe(200);
    expect(ctx.names("platform/project-exam-forms/" + code + "/files/")).toEqual([ns.examFormFileName("c1", "s1", r.jsonBody.file.id)]);
  });
});
