import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { getExamFormTemplate, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { isAnswered, formProgress, applyDraft, normalizeAnswer, deferredKindsOf, DEFERRED_KINDS } from "../src/lib/project-tracker/exam-form-answers.js";
import { applyAddImage, applyRemoveImage, referencesImage, isImageId } from "../src/lib/project-tracker/exam-form-images.js";
import { normalizeEvidenceImage, EVIDENCE_OUTPUT_SIZE, EVIDENCE_MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES, OUTPUT_SIZE, normalizeProfileImage } from "../src/lib/profile-image.js";
import { handler as studentForm } from "../src/functions/student-project-exam-form.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase F4 (server side) — the images a student attaches to the project exam form: a class's image answers are off until
// its teacher switches them on; an upload goes through the platform's one image pipeline and is stored under the student
// who owns it; a reference is written only by the server; an image is served only to its owner and to the teacher of the
// class; with images on, a required image question counts for a submit (docs/enterprise-project-exam-form-f4.md).
const require_ = createRequire(import.meta.url);
const sharp = require_("sharp");

const CODE = "794589";
const NS = getStorageNamespace(CODE);
const NOW = "2026-11-14T08:00:00.000Z";
const TEMPLATE = getExamFormTemplate(CODE);
const QUESTIONS = TEMPLATE.sections.flatMap(s => s.questions);
const IMAGE_QUESTIONS = QUESTIONS.filter(q => q.kind === "image");
const ONE = IMAGE_QUESTIONS.find(q => q.images.min === 1 && q.images.max === 1);          // exactly one image
const MANY = IMAGE_QUESTIONS.find(q => q.images.min === 2);                              // at least two
const OPTIONAL = IMAGE_QUESTIONS.find(q => q.images.min === 0);                          // an optional image question
const HOST = QUESTIONS.find(q => q.kind !== "image" && q.images);                        // a code question that also asks for images
const TEXT = QUESTIONS.find(q => q.kind === "shortText" && !q.images);
const TEXT_ANSWERABLE = QUESTIONS.filter(q => q.kind !== "image" && q.kind !== "file");
const ON = { imageAnswers: true };
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

// Real images, made by the same library the pipeline uses.
const raster = (width, height, format = "png", background = { r: 20, g: 120, b: 200 }) => sharp({ create: { width, height, channels: 3, background } })[format]().toBuffer();
const dataUrl = (buffer, mime = "image/png") => "data:" + mime + ";base64," + buffer.toString("base64");
const png = async (width = 320, height = 200) => dataUrl(await raster(width, height));

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
  const add = (questionId, url, id = "s1") => post({ action: "addImage", questionId, dataUrl: url }, id);
  const remove = (questionId, imageId, id = "s1") => post({ action: "removeImage", questionId, imageId }, id);
  const teacher = (body, classId = "c1") => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId, ...body }) }, teacherDeps);
  const teacherGet = (params, classId = "c1") => tracker({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: CODE, classId, ...params }), json: async () => ({}) }, teacherDeps);
  const open = (options = { imageAnswers: true }, classId = "c1") => teacher({ action: "examForm.open", ...options }, classId);
  const doc = (id = "s1", classId = "c1") => ctx.getJson(NS.examFormAnswersName(classId, id));
  const classForm = (classId = "c1") => ctx.getJson(NS.examFormClassName(classId));
  const imageBlobs = () => ctx.names("platform/project-exam-forms/" + CODE + "/images/");
  return { ctx, audits, get, post, add, remove, teacher, teacherGet, open, doc, classForm, imageBlobs };
}

describe("F4 — a class's image answers are off until its teacher switches them on", () => {
  it("the default open leaves image questions deferred, exactly as before F4", async () => {
    const t = setup();
    await t.open({});
    expect("imageAnswers" in t.classForm()).toBe(false);
    const body = (await t.get()).jsonBody;
    expect(body.deferredKinds).toEqual(["image", "file"]);
    expect(body.progress.total).toBe(TEXT_ANSWERABLE.length);
    const refused = await t.add(ONE.questionId, await png());
    expect(refused.status).toBe(400);
    expect(refused.jsonBody.code).toBe("KIND_NOT_AVAILABLE");
    expect(t.imageBlobs()).toEqual([]);                                          // nothing was stored for a refused upload
    expect(t.doc()).toBeNull();
    expect((await t.teacherGet({ resource: "exam-form" })).jsonBody.examForm.imageAnswers).toBeUndefined();
  });

  it("the first open can switch them on: image questions become answerable, files stay deferred, and it is audited", async () => {
    const t = setup();
    const r = await t.open({ imageAnswers: true });
    expect(r.jsonBody).toMatchObject({ changed: true, examForm: { state: "open", imageAnswers: true } });
    expect(t.classForm()).toMatchObject({ imageAnswers: true, imageAnswersAt: expect.any(String), imageAnswersBy: "teacher-1" });
    expect(t.audits.map(a => [a.action, a.details.firstOpen, a.details.imageAnswers])).toEqual([["project.exam_form.open", true, true]]);
    const body = (await t.get()).jsonBody;
    expect(body.deferredKinds).toEqual(["file"]);
    expect(body.progress.total).toBe(TEXT_ANSWERABLE.length + IMAGE_QUESTIONS.length);
    expect(body.progress.deferred).toBe(QUESTIONS.filter(q => q.kind === "file").length);
  });

  it("a later open can switch them on (audited as a change), never off; a repeat changes nothing", async () => {
    const t = setup();
    await t.open({});
    const on = await t.open({ imageAnswers: true });
    expect(on.jsonBody).toMatchObject({ changed: true, examForm: { state: "open", imageAnswers: true } });
    expect(t.audits.map(a => [a.action, a.details.firstOpen, a.details.imageAnswers])).toEqual([["project.exam_form.open", true, undefined], ["project.exam_form.open", false, true]]);
    expect((await t.open({ imageAnswers: true })).jsonBody.changed).toBe(false);
    expect((await t.open({})).jsonBody).toMatchObject({ changed: false, examForm: { imageAnswers: true } });   // an open that says nothing keeps them on
    const off = await t.open({ imageAnswers: false });
    expect(off.status).toBe(409);
    expect(off.jsonBody.code).toBe("IMAGES_FROZEN");
    expect(t.classForm().imageAnswers).toBe(true);
    expect(t.audits).toHaveLength(2);
    const bad = await t.open({ imageAnswers: "yes" });
    expect(bad.status).toBe(400);
  });

  it("switching images on does not touch another class of the project", async () => {
    const t = setup();
    await t.open({ imageAnswers: true });
    await t.open({}, "c2");
    expect((await t.get("s3")).jsonBody.deferredKinds).toEqual(["image", "file"]);
    expect((await t.add(ONE.questionId, await png(), "s3")).jsonBody.code).toBe("KIND_NOT_AVAILABLE");
  });
});

describe("F4 — attaching an image", () => {
  it("stores a sanitized WebP under the student's own prefix and references it from the answer; the revision does not move", async () => {
    const t = setup();
    await t.open();
    const r = await t.add(ONE.questionId, await png(640, 360));
    expect(r.status).toBe(200);
    const image = r.jsonBody.image;
    expect(isImageId(image.id)).toBe(true);
    expect(image).toMatchObject({ width: 640, height: 360 });
    expect(r.jsonBody.answers[ONE.questionId]).toEqual({ images: [{ id: image.id, width: 640, height: 360, bytes: image.bytes, addedAt: expect.any(String) }] });
    expect(r.jsonBody.revision).toBe(0);
    expect(t.doc()).toMatchObject({ status: "draft", revision: 0, studentId: "s1", classId: "c1", projectCode: CODE });
    expect(t.imageBlobs()).toEqual([NS.examFormImageName("c1", "s1", image.id)]);
    const stored = t.ctx.getBinary(NS.examFormImageName("c1", "s1", image.id));
    expect(stored.contentType).toBe("image/webp");
    expect(stored.buffer.length).toBe(image.bytes);
    expect((await sharp(stored.buffer).metadata()).format).toBe("webp");
    expect(r.jsonBody.progress.answered).toBe(1);
  });

  it("a large photo is fitted inside the bounded box, never enlarged, and its metadata does not survive", async () => {
    const t = setup();
    await t.open();
    const photo = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 60, b: 60 } } })
      .withMetadata({ exif: { IFD0: { Copyright: "private-owner", Artist: "student-name" } } }).jpeg().toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeTruthy();                    // the upload really carries metadata
    const big = await t.add(MANY.questionId, dataUrl(photo, "image/jpeg"));
    expect(big.jsonBody.image).toMatchObject({ width: EVIDENCE_OUTPUT_SIZE, height: Math.round(EVIDENCE_OUTPUT_SIZE * 2000 / 3000) });
    const stored = t.ctx.getBinary(NS.examFormImageName("c1", "s1", big.jsonBody.image.id));
    const meta = await sharp(stored.buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(stored.buffer.includes(Buffer.from("private-owner"))).toBe(false);
    const small = await t.add(MANY.questionId, await png(100, 50));
    expect(small.jsonBody.image).toMatchObject({ width: 100, height: 50 });       // never enlarged
  });

  it("refuses what is not a JPEG / PNG / WebP image, and stores nothing", async () => {
    const t = setup();
    await t.open();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const gif = Buffer.from("GIF89a" + "\0".repeat(40), "binary");
    const fakePng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("not really a png, just the signature")]);
    const cases = [
      ["an SVG declared as PNG", dataUrl(svg), 400, "UNSUPPORTED"],
      ["an SVG data URL", "data:image/svg+xml;base64," + svg.toString("base64"), 400, "UNSUPPORTED"],
      ["a GIF declared as PNG", dataUrl(gif), 400, "UNSUPPORTED"],
      ["HTML declared as JPEG", dataUrl(Buffer.from("<html><body>x</body></html>"), "image/jpeg"), 400, "UNSUPPORTED"],
      ["a PNG signature with no image behind it", dataUrl(fakePng), 400, "UNDECODABLE"],
      ["no data", "", 400, "EMPTY"],
      ["a plain URL", "https://example.test/a.png", 400, "UNSUPPORTED"],
      ["not a string", { url: "x" }, 400, "UNSUPPORTED"]
    ];
    for (const [name, url, status, code] of cases) {
      const r = await t.add(ONE.questionId, url);
      expect(r.status, name).toBe(status);
      expect(r.jsonBody.code, name).toBe(code);
    }
    expect(t.imageBlobs()).toEqual([]);
    expect(t.doc()).toBeNull();
  });

  it("accepts an upload larger than the personal-photo bound and smaller than the evidence bound", async () => {
    const t = setup();
    await t.open();
    // Noise does not compress: a 1250 × 1250 PNG of random pixels is between 3 MB and 6 MB.
    const noise = Buffer.alloc(1250 * 1250 * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761 + (i >>> 3) * 40503) >>> 24 & 255;
    const heavy = await sharp(noise, { raw: { width: 1250, height: 1250, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
    expect(heavy.length).toBeGreaterThan(MAX_UPLOAD_BYTES);
    expect(heavy.length).toBeLessThan(EVIDENCE_MAX_UPLOAD_BYTES);
    const r = await t.add(ONE.questionId, dataUrl(heavy));
    expect(r.status).toBe(200);
    expect(r.jsonBody.image).toMatchObject({ width: 1250, height: 1250 });
  });

  it("refuses an upload over the bound before decoding it", async () => {
    const t = setup();
    await t.open();
    expect(EVIDENCE_MAX_UPLOAD_BYTES).toBeGreaterThan(MAX_UPLOAD_BYTES);
    const tooBig = "data:image/png;base64," + "A".repeat(Math.ceil(EVIDENCE_MAX_UPLOAD_BYTES * 4 / 3) + 64);
    const r = await t.add(ONE.questionId, tooBig);
    expect(r.status).toBe(413);
    expect(r.jsonBody.code).toBe("TOO_LARGE");
    expect(r.jsonBody.error).toContain("6");
    expect(t.imageBlobs()).toEqual([]);
  });

  it("holds each question to its maximum, and the refused image leaves no blob behind", async () => {
    const t = setup();
    await t.open();
    const first = await t.add(ONE.questionId, await png());
    expect(first.status).toBe(200);
    const second = await t.add(ONE.questionId, await png(200, 100));
    expect(second.status).toBe(409);
    expect(second.jsonBody.code).toBe("IMAGE_LIMIT");
    expect(t.doc().answers[ONE.questionId].images).toHaveLength(1);
    expect(t.imageBlobs()).toEqual([NS.examFormImageName("c1", "s1", first.jsonBody.image.id)]);
    for (let i = 0; i < MANY.images.max; i++) expect((await t.add(MANY.questionId, await png(120 + i, 80))).status).toBe(200);
    expect((await t.add(MANY.questionId, await png())).jsonBody.code).toBe("IMAGE_LIMIT");
    expect(t.imageBlobs()).toHaveLength(1 + MANY.images.max);
  });

  it("refuses a question that takes no image, an unknown question and a hidden one", async () => {
    const t = setup();
    await t.teacher({ action: "examForm.open", imageAnswers: true, hiddenQuestionIds: [MANY.questionId] });
    for (const [questionId, code] of [[TEXT.questionId, "NO_IMAGES_HERE"], ["S99Q99", "UNKNOWN_QUESTION"], [MANY.questionId, "UNKNOWN_QUESTION"], [undefined, "UNKNOWN_QUESTION"], [{ $ne: 1 }, "UNKNOWN_QUESTION"]]) {
      const r = await t.add(questionId, await png());
      expect(r.status, String(questionId)).toBe(400);
      expect(r.jsonBody.code, String(questionId)).toBe(code);
    }
    expect(t.imageBlobs()).toEqual([]);
  });

  it("refuses a closed form, a submitted or approved form, an archived class and a student of another class; a returned form takes images again", async () => {
    const t = setup({ "platform/classes/c7.json": room("c7", { status: "archived", active: false }), "platform/users/s7.json": user("s7", "c7") });
    await t.open();
    const kept = await t.add(ONE.questionId, await png());
    expect(kept.status).toBe(200);

    await t.teacher({ action: "examForm.close" });
    const closed = await t.add(MANY.questionId, await png());
    expect([closed.status, closed.jsonBody.code]).toEqual([409, "FORM_CLOSED"]);
    await t.open({});

    for (const [status, code] of [["submitted", "FORM_SUBMITTED"], ["approved", "FORM_APPROVED"]]) {
      t.ctx.setJson(NS.examFormAnswersName("c1", "s1"), { ...t.doc(), status });
      const r = await t.add(MANY.questionId, await png());
      expect([r.status, r.jsonBody.code], status).toEqual([409, code]);
      const gone = await t.remove(ONE.questionId, kept.jsonBody.image.id);
      expect([gone.status, gone.jsonBody.code], status).toEqual([409, code]);
    }
    expect(t.doc().answers[ONE.questionId].images).toHaveLength(1);
    expect(t.imageBlobs()).toEqual([NS.examFormImageName("c1", "s1", kept.jsonBody.image.id)]);

    t.ctx.setJson(NS.examFormAnswersName("c1", "s1"), { ...t.doc(), status: "returned" });
    expect((await t.add(MANY.questionId, await png())).status).toBe(200);

    expect((await t.add(ONE.questionId, await png(), "s7")).status).toBe(403);    // archived class: read-only record
    expect((await t.add(ONE.questionId, await png(), "s3")).status).toBe(404);    // a class whose form was never opened
  });

  it("the student and the class come from the session: a body that names another student attaches to the caller", async () => {
    const t = setup();
    await t.open();
    const r = await t.post({ action: "addImage", questionId: ONE.questionId, dataUrl: await png(), studentId: "s2", classId: "c2" }, "s1");
    expect(r.status).toBe(200);
    expect(t.imageBlobs()).toEqual([NS.examFormImageName("c1", "s1", r.jsonBody.image.id)]);
    expect(t.doc("s2")).toBeNull();
  });
});

describe("F4 — removing an image", () => {
  it("removes the reference, then the blob; a repeat changes nothing; an empty answer is not kept", async () => {
    const t = setup();
    await t.open();
    const a = (await t.add(MANY.questionId, await png())).jsonBody.image.id;
    const b = (await t.add(MANY.questionId, await png(200, 120))).jsonBody.image.id;
    const first = await t.remove(MANY.questionId, a);
    expect(first.jsonBody).toMatchObject({ ok: true, changed: true });
    expect(t.doc().answers[MANY.questionId].images.map(i => i.id)).toEqual([b]);
    expect(t.imageBlobs()).toEqual([NS.examFormImageName("c1", "s1", b)]);
    expect((await t.remove(MANY.questionId, a)).jsonBody.changed).toBe(false);
    await t.remove(MANY.questionId, b);
    expect(MANY.questionId in t.doc().answers).toBe(false);
    expect(t.imageBlobs()).toEqual([]);
    expect((await t.remove(MANY.questionId, "zz")).status).toBe(400);
  });

  it("one student cannot remove another student's image", async () => {
    const t = setup();
    await t.open();
    const id = (await t.add(ONE.questionId, await png(), "s1")).jsonBody.image.id;
    const r = await t.remove(ONE.questionId, id, "s2");
    expect(r.jsonBody.changed).toBe(false);
    expect(t.doc("s1").answers[ONE.questionId].images).toHaveLength(1);
    expect(t.imageBlobs()).toEqual([NS.examFormImageName("c1", "s1", id)]);
  });
});

describe("F4 — an image is served only to its owner and to the teacher of the class", () => {
  it("the owner reads their image; nobody else's id, an unreferenced id or a malformed id gets one", async () => {
    const t = setup();
    await t.open();
    const id = (await t.add(ONE.questionId, await png(300, 150))).jsonBody.image.id;
    const own = await t.get("s1", { image: id });
    expect(own.status).toBe(200);
    expect(own.headers).toMatchObject({ "content-type": "image/webp", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" });
    expect((await sharp(own.body).metadata())).toMatchObject({ format: "webp", width: 300, height: 150 });
    expect(own.jsonBody).toBeUndefined();

    expect((await t.get("s2", { image: id })).status).toBe(404);                  // a classmate
    expect((await t.get("s1", { image: "0".repeat(24) })).status).toBe(404);      // well-formed, not referenced
    for (const bad of ["", "../" + id, id + "/..", id.toUpperCase(), "x"]) expect((await t.get("s1", { image: bad })).status, bad).toBe(404);
  });

  it("a blob that exists but is no longer referenced is not served", async () => {
    const t = setup();
    await t.open();
    const id = (await t.add(MANY.questionId, await png())).jsonBody.image.id;
    const stored = t.ctx.getBinary(NS.examFormImageName("c1", "s1", id));
    await t.remove(MANY.questionId, id);
    t.ctx.store.set(NS.examFormImageName("c1", "s1", id), { content: stored.buffer, contentType: "image/webp" });   // an orphan left by a failed delete
    expect((await t.get("s1", { image: id })).status).toBe(404);
    expect((await t.teacherGet({ resource: "exam-form-image", studentId: "s1", imageId: id })).status).toBe(404);
  });

  it("the teacher of the class reads a student's image; not through another class, another student or without a student", async () => {
    const t = setup();
    await t.open();
    const id = (await t.add(ONE.questionId, await png(300, 150))).jsonBody.image.id;
    const ok = await t.teacherGet({ resource: "exam-form-image", studentId: "s1", imageId: id });
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toBe("image/webp");
    expect((await sharp(ok.body).metadata()).width).toBe(300);
    expect((await t.teacherGet({ resource: "exam-form-image", studentId: "s2", imageId: id })).status).toBe(404);    // another student of the class
    expect((await t.teacherGet({ resource: "exam-form-image", studentId: "s3", imageId: id })).status).toBe(404);    // not a member of this class
    expect((await t.teacherGet({ resource: "exam-form-image", imageId: id })).status).toBe(404);
    expect((await t.teacherGet({ resource: "exam-form-image", studentId: "s1", imageId: id }, "c2")).status).toBe(404);   // through another class
    // A student who left the class: their record stays stored, and is not served through the class any more.
    t.ctx.setJson("platform/users/s1.json", user("s1", "c2"));
    expect((await t.teacherGet({ resource: "exam-form-image", studentId: "s1", imageId: id })).status).toBe(404);
    t.ctx.setJson("platform/users/s1.json", user("s1", "c1"));
    // The teacher's review read carries the references it needs to ask for the images.
    const review = (await t.teacherGet({ resource: "exam-form-student", studentId: "s1" })).jsonBody;
    expect(review.answers[ONE.questionId].images.map(i => i.id)).toEqual([id]);
  });
});

describe("F4 — a draft save never writes an image and never loses one", () => {
  it("refuses a draft answer for an image question, and drops an image list sent with a text answer", async () => {
    const t = setup();
    await t.open();
    const forged = { images: [{ id: "a".repeat(24), width: 1, height: 1, bytes: 1, addedAt: NOW }] };
    const r = await t.post({ action: "saveDraft", baseRevision: 0, answers: { [ONE.questionId]: forged } });
    expect(r.status).toBe(400);
    expect(r.jsonBody.code).toBe("IMAGE_VIA_UPLOAD");
    expect(t.doc()).toBeNull();
    const host = await t.post({ action: "saveDraft", baseRevision: 0, answers: { [HOST.questionId]: { text: "show vlan brief", ...forged } } });
    expect(host.status).toBe(200);
    expect(t.doc().answers[HOST.questionId]).toEqual({ text: "show vlan brief" });      // rebuilt from the fields the question allows
  });

  it("keeps the images of a question when its text is rewritten or cleared", async () => {
    const t = setup();
    await t.open();
    const id = (await t.add(HOST.questionId, await png())).jsonBody.image.id;
    expect(t.doc().answers[HOST.questionId]).toEqual({ images: [expect.objectContaining({ id })] });
    await t.post({ action: "saveDraft", baseRevision: 0, answers: { [HOST.questionId]: { text: "show run" } } });
    expect(t.doc().answers[HOST.questionId]).toMatchObject({ text: "show run", images: [{ id }] });
    await t.post({ action: "saveDraft", baseRevision: 1, answers: { [HOST.questionId]: null } });
    expect(t.doc().answers[HOST.questionId]).toEqual({ images: [expect.objectContaining({ id })] });   // the text went, the image stayed
    expect(t.imageBlobs()).toHaveLength(1);
    await t.remove(HOST.questionId, id);
    expect(HOST.questionId in t.doc().answers).toBe(false);
  });
});

describe("F4 — progress and submit with image answers on", () => {
  it("an image question counts once it holds its minimum; a code question that asks for images needs them beside its text", () => {
    const img = n => ({ images: Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(24, "0") })) });
    expect(isAnswered(ONE, img(1), ON)).toBe(true);
    expect(isAnswered(ONE, img(0), ON)).toBe(false);
    expect(isAnswered(MANY, img(MANY.images.min - 1), ON)).toBe(false);
    expect(isAnswered(MANY, img(MANY.images.min), ON)).toBe(true);
    expect(isAnswered(OPTIONAL, img(0), ON)).toBe(false);                        // nothing attached is not «answered», even with min 0
    expect(isAnswered(OPTIONAL, img(1), ON)).toBe(true);
    expect(isAnswered(HOST, { text: "x" }, ON)).toBe(false);
    expect(isAnswered(HOST, { text: "x", ...img(HOST.images.min) }, ON)).toBe(true);
    expect(isAnswered(HOST, img(HOST.images.min), ON)).toBe(false);
    // With images off nothing changes: an image question is never answered, and the code question needs its text only.
    expect(isAnswered(ONE, img(1))).toBe(false);
    expect(isAnswered(ONE, img(1), { imageAnswers: false })).toBe(false);
    expect(isAnswered(HOST, { text: "x" })).toBe(true);
    expect([...deferredKindsOf(ON)]).toEqual(["file"]);
    expect(deferredKindsOf({})).toBe(DEFERRED_KINDS);
    expect(deferredKindsOf(undefined)).toBe(DEFERRED_KINDS);
  });

  it("a submit is refused while a required image question lacks its images, and accepted once they are attached", async () => {
    const t = setup();
    await t.open();
    const saved = await t.post({ action: "saveDraft", baseRevision: 0, answers: textAnswers() });
    expect(saved.status).toBe(200);
    const required = IMAGE_QUESTIONS.filter(q => q.required);
    expect(saved.jsonBody.progress.missing.sort()).toEqual([...required.map(q => q.questionId), HOST.questionId].sort());
    const refused = await t.post({ action: "submit", baseRevision: 1 });
    expect([refused.status, refused.jsonBody.code]).toEqual([400, "FORM_INCOMPLETE"]);
    expect(refused.jsonBody.missing).toContain(ONE.questionId);

    for (const q of [...required, HOST]) for (let i = 0; i < Math.max(1, q.images.min); i++) expect((await t.add(q.questionId, await png(64 + i, 48))).status, q.questionId).toBe(200);
    const ready = (await t.get()).jsonBody;
    expect(ready.progress.missing).toEqual([]);
    expect(ready.revision).toBe(1);                                              // attaching images did not move the revision
    const done = await t.post({ action: "submit", baseRevision: 1 });
    expect(done.status).toBe(200);
    expect(done.jsonBody.status).toBe("submitted");
    expect(t.doc().answers[ONE.questionId].images).toHaveLength(1);              // the images are part of what was submitted
    expect(t.audits.some(a => a.action === "project.exam_form.submit")).toBe(true);
  });

  it("with images off the same text answers submit as before F4", async () => {
    const t = setup();
    await t.open({});
    await t.post({ action: "saveDraft", baseRevision: 0, answers: textAnswers() });
    const done = await t.post({ action: "submit", baseRevision: 1 });
    expect(done.status).toBe(200);
    expect(done.jsonBody.progress).toMatchObject({ total: TEXT_ANSWERABLE.length, answered: TEXT_ANSWERABLE.length, missing: [] });
  });

  it("the teacher's class list and the student's card count image questions only where images are on", async () => {
    const t = setup();
    await t.open();
    await t.add(ONE.questionId, await png());
    const row = (await t.teacherGet({ resource: "exam-form-students" })).jsonBody.students.find(s => s.studentId === "s1");
    expect(row).toMatchObject({ status: "draft", answered: 1, total: TEXT_ANSWERABLE.length + IMAGE_QUESTIONS.length });
    const review = (await t.teacherGet({ resource: "exam-form-student", studentId: "s1" })).jsonBody;
    expect(review.progress).toMatchObject({ answered: 1, total: TEXT_ANSWERABLE.length + IMAGE_QUESTIONS.length });
  });
});

describe("F4 — the pure rules", () => {
  const identity = { projectCode: CODE, classId: "c1", studentId: "s1" };
  const image = id => ({ id, width: 10, height: 10, bytes: 100 });
  const ID = "ab".repeat(12);

  it("applyAddImage creates the document when it is the student's first write, and never mutates its input", () => {
    const { doc } = applyAddImage(null, TEMPLATE, { questionId: ONE.questionId, image: image(ID), identity, now: NOW, rules: ON });
    expect(doc).toMatchObject({ ...identity, status: "draft", revision: 0, answers: { [ONE.questionId]: { images: [{ id: ID, addedAt: NOW }] } } });
    const before = clone(doc);
    expect(() => applyAddImage(doc, TEMPLATE, { questionId: ONE.questionId, image: image("cd".repeat(12)), identity, now: NOW, rules: ON })).toThrow(/الحد الأقصى/);
    expect(doc).toEqual(before);
    for (const bad of [null, {}, { id: "short" }, { id: ID.toUpperCase() }, "x"]) expect(() => applyAddImage(null, TEMPLATE, { questionId: ONE.questionId, image: bad, identity, now: NOW, rules: ON }), JSON.stringify(bad)).toThrow();
    expect(() => applyAddImage(null, TEMPLATE, { questionId: ONE.questionId, image: image(ID), identity, now: NOW, rules: {} })).toThrow(/غير متاح/);
    expect(() => applyAddImage(null, TEMPLATE, { questionId: ONE.questionId, image: image(ID), identity, now: NOW })).toThrow(/غير متاح/);
  });

  it("applyRemoveImage keeps the text of a question that also holds text, and refuses a form of another version", () => {
    const base = { schemaVersion: 1, ...identity, formVersion: TEMPLATE.formVersion, status: "draft", revision: 3, answers: { [HOST.questionId]: { text: "x", images: [image(ID)] } }, startedAt: NOW, updatedAt: NOW, submittedAt: null };
    const r = applyRemoveImage(base, TEMPLATE, { questionId: HOST.questionId, imageId: ID, now: NOW, rules: ON });
    expect(r.changed).toBe(true);
    expect(r.doc.answers[HOST.questionId]).toEqual({ text: "x" });
    expect(r.doc.revision).toBe(3);
    expect(base.answers[HOST.questionId].images).toHaveLength(1);                // the input is untouched
    expect(applyRemoveImage(null, TEMPLATE, { questionId: HOST.questionId, imageId: ID, now: NOW, rules: ON })).toEqual({ doc: null, changed: false });
    expect(() => applyRemoveImage({ ...base, formVersion: 99 }, TEMPLATE, { questionId: HOST.questionId, imageId: ID, now: NOW, rules: ON })).toThrow(/نسخة الاستمارة/);
  });

  it("referencesImage looks only inside the document it is given", () => {
    const doc = { answers: { [ONE.questionId]: { images: [image(ID)] }, [TEXT.questionId]: { text: ID } } };
    expect(referencesImage(doc, ID)).toBe(true);
    expect(referencesImage(doc, "cd".repeat(12))).toBe(false);
    expect(referencesImage({ answers: { [TEXT.questionId]: { text: ID } } }, ID)).toBe(false);   // the id as text is not a reference
    for (const bad of [null, undefined, {}, { answers: null }]) expect(referencesImage(bad, ID)).toBe(false);
    expect(referencesImage(doc, "../" + ID)).toBe(false);
  });

  it("a draft with image answers on still refuses an image question and keeps stored images (pure)", () => {
    expect(() => normalizeAnswer(ONE, { images: [] }, ON)).toThrow(/إرفاق الصورة/);
    expect(() => normalizeAnswer(ONE, { images: [] })).toThrow(/غير متاح بعد/);
    const current = { schemaVersion: 1, ...identity, formVersion: TEMPLATE.formVersion, status: "draft", revision: 0, answers: { [HOST.questionId]: { images: [image(ID)] } }, startedAt: NOW, updatedAt: NOW, submittedAt: null };
    const { doc } = applyDraft(current, TEMPLATE, { patch: { [HOST.questionId]: { text: "ping 10.0.0.1" } }, baseRevision: 0, identity, now: NOW, rules: ON });
    expect(doc.answers[HOST.questionId]).toEqual({ text: "ping 10.0.0.1", images: [image(ID)] });
    expect(formProgress(TEMPLATE, doc.answers, ON).answered).toBe(1);
    expect(formProgress(TEMPLATE, doc.answers).answered).toBe(1);                // with images off the text alone answers it
  });
});

describe("F4 — the image pipeline's second profile", () => {
  it("an evidence image keeps its shape inside 1600 px; the personal-photo profile is unchanged", async () => {
    const wide = await normalizeEvidenceImage(await raster(4000, 1000));
    expect([wide.width, wide.height, wide.contentType]).toEqual([1600, 400, "image/webp"]);
    const tall = await normalizeEvidenceImage(await raster(500, 2500));
    expect([tall.width, tall.height]).toEqual([320, 1600]);
    const photo = await normalizeProfileImage(await raster(2000, 1000));
    expect([photo.width, photo.height]).toEqual([OUTPUT_SIZE, OUTPUT_SIZE]);      // still a cover-cropped square
    await expect(normalizeProfileImage(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 1))).rejects.toMatchObject({ code: "TOO_LARGE", httpStatus: 413 });
  });
});
