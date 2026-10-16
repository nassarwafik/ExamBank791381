// Phase 21G.0 — a teacher's authored content (saved exams, exam templates) belongs to that teacher in multi-user mode. Drives the
// REAL handlers over the shared in-memory blob container. Pre-tenancy content follows the platform rule (shared until the operator
// names LEGACY_DATA_OWNER, then that teacher's only). The list pages count only the teacher's own documents. Imports only the route
// handlers, so it runs unchanged against the pre-21G.0 baseline (fail-first evidence).
import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const save = require("../src/functions/save-exam-artifact.js");
const saved = require("../src/functions/manage-saved-exams.js");
const templates = require("../src/functions/manage-templates.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const multi = sub => ({ ok: true, user: { ver: 2, role: "teacher", sub, am: "multi-user" } });
const legacy = () => ({ ok: true, user: { ver: 2, role: "teacher", sub: "builder", am: "legacy" } });
const req = (method, body) => ({ method, url: "http://x/api", headers: { get: () => "" }, json: async () => body });
const exam = (id, title) => ({ examId: id, title, status: "draft", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "trueFalse", marks: 1, text: title, answer: { correct: true } }] }] });
const oldExam = (id, title) => ({ kind: "saved-exam", savedAt: "2026-01-01T00:00:00.000Z", exam: exam(id, title) });
const oldTemplate = (title) => ({ schemaVersion: 1, kind: "exam-template", templateId: "TPL-1", title, savedAt: "2026-01-01T00:00:00.000Z", plan: { totalQuestions: 1 } });
afterEach(() => { delete process.env.LEGACY_DATA_OWNER; });

function platform(seed = {}) {
  const mem = createMemoryContainer(seed);
  const deps = auth => ({ requireBuilderAuth: () => auth, getContainer: () => mem.container });
  return {
    mem,
    save: (auth, body) => save.handler(req("POST", { kind: "exam", ...body }), deps(auth)),
    saveTemplate: async (auth, title) => (await save.handler(req("POST", { kind: "template", exam: exam("T-" + title, title) }), deps(auth))).jsonBody.blobName,
    examIds: async auth => (await saved.handler(req("GET"), deps(auth))).jsonBody.exams.map(e => e.examId).sort(),
    loadExam: (auth, blobName) => saved.handler(req("POST", { action: "load", blobName }), deps(auth)),
    templateTitles: async auth => (await templates.handler(req("GET"), deps(auth))).jsonBody.templates.map(t => t.title).sort(),
    templatePost: (auth, body) => templates.handler(req("POST", body), deps(auth))
  };
}

describe("21G.0 saved exams follow the platform tenancy rule", () => {
  it("an exam saved before ownership belongs to LEGACY_DATA_OWNER once the operator names it", async () => {
    const p = platform({ "exams/EXAM-OLD.json": oldExam("EXAM-OLD", "قديم") });
    process.env.LEGACY_DATA_OWNER = "teacher-a";
    expect(await p.examIds(multi("teacher-a"))).toEqual(["EXAM-OLD"]);
    expect(await p.examIds(multi("teacher-b"))).toEqual([]);
    expect((await p.loadExam(multi("teacher-b"), "exams/EXAM-OLD.json")).status).toBe(404);
    // Teacher B can no longer claim it by saving over it (D2 applies only while no legacy owner is named).
    expect((await p.save(multi("teacher-b"), { exam: exam("EXAM-OLD", "استيلاء") })).status).toBe(403);
    expect(p.mem.getJson("exams/EXAM-OLD.json").exam.title).toBe("قديم");
  });

  it("the 100-exam list page counts only the teacher's own exams", async () => {
    const seed = {};
    for (let i = 0; i < 120; i++) seed["exams/A-" + String(i).padStart(3, "0") + ".json"] = { ...oldExam("A-" + i, "امتحان أ"), ownerId: "teacher-a" };
    seed["exams/Z-B.json"] = { ...oldExam("Z-B", "امتحان ب"), ownerId: "teacher-b" };
    const p = platform(seed);
    expect(await p.examIds(multi("teacher-b"))).toEqual(["Z-B"]);
    expect((await p.examIds(multi("teacher-a"))).length).toBe(100);
  });
});

describe("21G.0 exam templates belong to the teacher who saved them", () => {
  it("a teacher lists only their own templates; legacy mode sees every template", async () => {
    const p = platform();
    await p.saveTemplate(multi("teacher-a"), "قالب أ");
    await p.saveTemplate(multi("teacher-b"), "قالب ب");
    expect(await p.templateTitles(multi("teacher-a"))).toEqual(["قالب أ"]);
    expect(await p.templateTitles(multi("teacher-b"))).toEqual(["قالب ب"]);
    expect(await p.templateTitles(legacy())).toEqual(["قالب أ", "قالب ب"]);
  });

  it("another teacher's template cannot be loaded or deleted and answers exactly like a missing one", async () => {
    const p = platform();
    const blob = await p.saveTemplate(multi("teacher-a"), "قالب أ");
    expect(p.mem.getJson(blob).ownerId).toBe("teacher-a");
    for (const action of ["load", "delete"]) {
      const res = await p.templatePost(multi("teacher-b"), { action, blobName: blob });
      const missing = await p.templatePost(multi("teacher-b"), { action, blobName: "templates/2026-01-01/none.json" });
      expect(res.status).toBe(missing.status);
      expect(res.jsonBody).toEqual(missing.jsonBody);
    }
    expect(p.mem.has(blob)).toBe(true);
    expect((await p.templatePost(multi("teacher-a"), { action: "load", blobName: blob })).status).toBe(200);
    expect((await p.templatePost(multi("teacher-a"), { action: "delete", blobName: blob })).jsonBody.deleted).toBe(true);
  });

  it("pre-tenancy templates stay shared until LEGACY_DATA_OWNER names their owner", async () => {
    const p = platform({ "templates/2026-01-01/old.json": oldTemplate("قالب قديم") });
    expect(await p.templateTitles(multi("teacher-b"))).toEqual(["قالب قديم"]);
    process.env.LEGACY_DATA_OWNER = "teacher-a";
    expect(await p.templateTitles(multi("teacher-b"))).toEqual([]);
    expect(await p.templateTitles(multi("teacher-a"))).toEqual(["قالب قديم"]);
  });
});
