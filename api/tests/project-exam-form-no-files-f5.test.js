import { describe, it, expect } from "vitest";
import { handler as studentForm } from "../src/functions/student-project-exam-form.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { getExamFormTemplate, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Owner decision (2026-11-15): files are not uploaded to the site. The file upload that two merged phases had added
// (PR #638 server, PR #639 screens) is removed. What must hold now: the server refuses a request to switch file answers
// on and writes nothing; the student route has no file action; a class form left with the old switch stored reads as any
// other class (its file questions wait and never block a submit); nothing stored is deleted
// (docs/enterprise-project-exam-form-no-file-uploads.md).

const CODE = "794589";
const NS = getStorageNamespace(CODE);
const NOW = "2026-11-15T09:00:00.000Z";
const QUESTIONS = getExamFormTemplate(CODE).sections.flatMap(s => s.questions);
const FILE_QUESTIONS = QUESTIONS.filter(q => q.kind === "file");
const room = id => ({ classId: id, name: "صف " + id, grade: "12", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [CODE], createdAt: NOW, updatedAt: NOW });
const user = (id, cid) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });

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

function setup() {
  const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1") });
  const audits = [];
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, ev) => { audits.push(ev); } };
  const studentDeps = { ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) };
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const teacher = body => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId: "c1", ...body }) }, teacherDeps);
  const state = async () => (await tracker({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: CODE, classId: "c1", resource: "exam-form" }), json: async () => ({}) }, teacherDeps)).jsonBody.examForm;
  const get = (extra = {}) => studentForm({ method: "GET", url: "https://x/api/student-project-exam-form?" + new URLSearchParams({ projectCode: CODE, ...extra }), json: async () => ({}) }, studentDeps);
  const post = body => studentForm({ method: "POST", url: "https://x/api/student-project-exam-form", json: async () => ({ projectCode: CODE, ...body }) }, studentDeps);
  return { ctx, audits, teacher, state, get, post };
}

describe("no file uploads — the teacher cannot switch file answers on", () => {
  it("refuses the switch at a first open and writes nothing", async () => {
    const t = setup();
    for (const value of [true, false, "yes", null]) {
      const r = await t.teacher({ action: "examForm.open", fileAnswers: value });
      expect(r.status, String(value)).toBe(409);
      expect(r.jsonBody).toMatchObject({ ok: false, code: "FILES_NOT_OFFERED" });
      expect(r.jsonBody.error).toContain("رفع الملفات غير متاح");
    }
    expect(t.ctx.names("platform/project-exam-forms/")).toEqual([]);                 // the form was not even opened
    expect(t.audits).toEqual([]);
    expect(await t.state()).toMatchObject({ hasForm: true, state: "none" });
  });

  it("refuses the switch on an open form, with or without the image switch, and leaves the class as it was", async () => {
    const t = setup();
    expect((await t.teacher({ action: "examForm.open" })).status).toBe(200);
    const before = JSON.stringify(t.ctx.getJson(NS.examFormClassName("c1")));
    t.audits.length = 0;
    expect((await t.teacher({ action: "examForm.open", fileAnswers: true })).status).toBe(409);
    const both = await t.teacher({ action: "examForm.open", imageAnswers: true, fileAnswers: true });
    expect(both.status).toBe(409);
    expect(JSON.stringify(t.ctx.getJson(NS.examFormClassName("c1")))).toBe(before);  // not even the image switch moved
    expect(t.audits).toEqual([]);
    // Without the file switch the same requests work as before.
    const images = await t.teacher({ action: "examForm.open", imageAnswers: true });
    expect(images.status).toBe(200);
    expect(await t.state()).toMatchObject({ state: "open", imageAnswers: true });
    expect("fileAnswers" in (await t.state())).toBe(false);
  });
});

describe("no file uploads — the student route has no file action", () => {
  it("refuses attach and remove, and a file read is not a download", async () => {
    const t = setup();
    await t.teacher({ action: "examForm.open", imageAnswers: true });
    const q = FILE_QUESTIONS[0].questionId;
    for (const body of [
      { action: "addFile", questionId: q, name: "book.pdf", dataUrl: "data:application/pdf;base64,JVBERi0xLjQK" },
      { action: "removeFile", questionId: q }
    ]) {
      const r = await t.post(body);
      expect(r.status, body.action).toBe(400);
      expect(r.jsonBody.ok).toBe(false);
    }
    // A draft cannot write a file question either: it waits, as before the removed phases.
    const draft = await t.post({ action: "saveDraft", baseRevision: 0, answers: { [q]: { file: { id: "a".repeat(24), name: "book.pdf", ext: ".pdf", bytes: 10 } } } });
    expect(draft.status).toBe(400);
    expect(draft.jsonBody.code).toBe("KIND_NOT_AVAILABLE");
    const read = await t.get({ file: "a".repeat(24) });
    expect(read.status).toBe(200);
    expect(read.body).toBeUndefined();                                               // never bytes
    expect(read.jsonBody).toMatchObject({ available: true, deferredKinds: ["file"] });
    expect(t.ctx.names("platform/project-exam-forms/").filter(name => name.includes("/files/"))).toEqual([]);
  });
});

describe("no file uploads — a class left with the old switch stored", () => {
  it("reads as any other class: its file questions wait, never block, and what is stored stays", async () => {
    const t = setup();
    await t.teacher({ action: "examForm.open", imageAnswers: true });
    // What the removed phases could have left behind: the switch on the class form, a file reference and its blob.
    const formName = NS.examFormClassName("c1");
    t.ctx.setJson(formName, { ...t.ctx.getJson(formName), fileAnswers: true, fileAnswersAt: NOW, fileAnswersBy: "teacher-1" });
    const blobName = "platform/project-exam-forms/" + CODE + "/files/c1/s1/" + "b".repeat(24) + ".bin";
    t.ctx.setJson(blobName, { left: "by the removed phase" });
    const answers = Object.fromEntries(QUESTIONS.filter(x => x.kind !== "image" && x.kind !== "file").map(x => [x.questionId, fullAnswer(x)]));
    expect((await t.post({ action: "saveDraft", baseRevision: 0, answers })).status).toBe(200);
    const name = NS.examFormAnswersName("c1", "s1");
    const doc = t.ctx.getJson(name);
    let n = 0;
    for (const x of QUESTIONS.filter(x => x.images && x.images.min > 0)) doc.answers[x.questionId] = { ...(doc.answers[x.questionId] || {}), images: Array.from({ length: x.images.min }, () => ({ id: (n++).toString(16).padStart(24, "0"), width: 800, height: 600, bytes: 1000, addedAt: NOW })) };
    doc.answers[FILE_QUESTIONS[0].questionId] = { file: { id: "b".repeat(24), name: "final.pkt", ext: ".pkt", bytes: 10, addedAt: NOW } };
    t.ctx.setJson(name, doc);

    const view = (await t.get()).jsonBody;
    expect(view.deferredKinds).toEqual(["file"]);
    expect(view.progress).toMatchObject({ deferred: FILE_QUESTIONS.length, missing: [] });
    expect("fileAnswers" in (await t.state())).toBe(false);
    const submitted = await t.post({ action: "submit", baseRevision: 1 });
    expect(submitted.status).toBe(200);                                             // the file questions did not block it
    expect(submitted.jsonBody.status).toBe("submitted");
    // Nothing that was stored is deleted or rewritten by reading or submitting.
    expect(t.ctx.getJson(formName).fileAnswers).toBe(true);
    expect(t.ctx.has(blobName)).toBe(true);
    expect(t.ctx.getJson(name).answers[FILE_QUESTIONS[0].questionId].file.id).toBe("b".repeat(24));
  });
});
