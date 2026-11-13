// Hotfix — a NEW saved exam can be created by every teacher who may save (found during P6-G, docs/enterprise-library-consent-owner-edit-p6g.md §5).
// The defect: writeSavedExam asked "may this teacher access the stored document?" even when there was NO document yet. A document
// that does not exist has no owner, and the 21G.0 rule hides an unowned (pre-tenancy) document from an Owner-Console account (t_…) —
// so such a teacher could never save a new exam (403 EXAM_FORBIDDEN «لا تملك صلاحية تعديل هذا الامتحان»), and with LEGACY_DATA_OWNER
// set, nobody but that owner could. The ownership rules for documents that DO exist must stay exactly as they are.
// Drives the REAL handlers against the in-memory blob container; it imports only the two route handlers, so it runs unchanged on the
// defective baseline for fail-first evidence.
import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const save = require("../src/functions/save-exam-artifact.js");
const saved = require("../src/functions/manage-saved-exams.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb";
const managed = sub => ({ ok: true, user: { ver: 3, role: "teacher", sub, am: "managed" } });
const multi = sub => ({ ok: true, user: { ver: 2, role: "teacher", sub, am: "multi-user" } });
const req = (method, body) => ({ method, url: "http://x/api", headers: { get: () => "" }, json: async () => body });
const exam = (id, title) => ({ examId: id, title, status: "draft", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "trueFalse", marks: 1, text: "سؤال", answer: { correct: true } }] }] });

function platform(seed = {}) {
  const mem = createMemoryContainer(seed);
  const deps = auth => ({ requireBuilderAuth: () => auth, getContainer: () => mem.container });
  return {
    mem,
    save: (auth, body) => save.handler(req("POST", { kind: "exam", ...body }), deps(auth)),
    load: (auth, blobName) => saved.handler(req("POST", { action: "load", blobName }), deps(auth)),
    list: auth => saved.handler(req("GET"), deps(auth))
  };
}
const saveOf = (p, auth, id, title, extra = {}) => p.save(auth, { exam: exam(id, title), ...extra });
afterEach(() => { delete process.env.LEGACY_DATA_OWNER; });

describe("hotfix: an Owner-Console teacher account (t_…) creates a new saved exam", () => {
  it("first save of a new exam — conditional (the builder) and unconditional — is stored, owned by that account", async () => {
    const p = platform();
    const created = await saveOf(p, managed(SARA), "EXAM-new-1", "امتحان جديد", { conditional: true, baseEtag: null });
    expect([created.status, created.jsonBody.code]).toEqual([200, undefined]);
    expect(p.mem.getJson("exams/EXAM-new-1.json")).toMatchObject({ kind: "saved-exam", ownerId: SARA, exam: { examId: "EXAM-new-1", title: "امتحان جديد" } });
    const plain = await saveOf(p, managed(SARA), "EXAM-new-2", "بلا شرط");
    expect(plain.status).toBe(200);
    expect(p.mem.getJson("exams/EXAM-new-2.json").ownerId).toBe(SARA);
    // and it is the teacher's own exam from then on: listed, reopened, saved again
    expect((await p.list(managed(SARA))).jsonBody.exams.map(e => e.blobName).sort()).toEqual(["exams/EXAM-new-1.json", "exams/EXAM-new-2.json"]);
    const loaded = await p.load(managed(SARA), "exams/EXAM-new-1.json");
    expect(loaded.status).toBe(200);
    expect((await saveOf(p, managed(SARA), "EXAM-new-1", "تعديل", { conditional: true, baseEtag: loaded.jsonBody.etag })).status).toBe(200);
  });

  it("another teacher's exam stays refused (403) and unchanged; it is invisible to them", async () => {
    const p = platform();
    await saveOf(p, managed(SARA), "EXAM-sara", "لسارة", { conditional: true, baseEtag: null });
    const before = JSON.stringify(p.mem.getJson("exams/EXAM-sara.json"));
    for (const extra of [{}, { conditional: true, baseEtag: null }]) {
      const r = await saveOf(p, managed(OMAR), "EXAM-sara", "استيلاء", extra);
      expect([r.status, r.jsonBody.code]).toEqual([403, "EXAM_FORBIDDEN"]);
    }
    expect(JSON.stringify(p.mem.getJson("exams/EXAM-sara.json"))).toBe(before);
    expect((await p.load(managed(OMAR), "exams/EXAM-sara.json")).status).toBe(404);
  });

  it("an unowned pre-tenancy exam stays hidden from a console account and is never claimed by its save", async () => {
    const p = platform({ "exams/EXAM-old.json": { kind: "saved-exam", savedAt: "2026-01-01T00:00:00.000Z", exam: exam("EXAM-old", "قديم") } });
    const r = await saveOf(p, managed(SARA), "EXAM-old", "استيلاء");
    expect([r.status, r.jsonBody.code]).toEqual([403, "EXAM_FORBIDDEN"]);
    expect(p.mem.getJson("exams/EXAM-old.json").ownerId).toBeUndefined();
    expect((await p.load(managed(SARA), "exams/EXAM-old.json")).status).toBe(404);
  });

  it("a stored blob whose content is empty (null) is still decided by the rule — never treated as «no exam» and written over", async () => {
    const p = platform();
    await p.mem.container.getBlockBlobClient("exams/EXAM-null.json").upload("null", 4, {});
    expect(p.mem.names("exams/EXAM-null.json")).toEqual(["exams/EXAM-null.json"]);   // it is stored
    const r = await saveOf(p, managed(SARA), "EXAM-null", "استيلاء");
    expect([r.status, r.jsonBody.code]).toEqual([403, "EXAM_FORBIDDEN"]);
    expect(p.mem.getJson("exams/EXAM-null.json")).toBeNull();                         // still the empty content, not the exam
  });

  it("a create that races another teacher's create of the same exam is refused, never written over", async () => {
    const p = platform();
    // OMAR created it between SARA's read and SARA's write: the create-only write fails, the retry reads OMAR's document and refuses
    const real = p.mem.container.getBlockBlobClient.bind(p.mem.container);
    let raced = false;
    p.mem.container.getBlockBlobClient = name => {
      const client = real(name);
      const upload = client.upload.bind(client);
      client.upload = async (body, len, opts) => {
        if (!raced && name === "exams/EXAM-race.json") { raced = true; p.mem.setJson(name, { kind: "saved-exam", savedAt: "x", exam: exam("EXAM-race", "لعمر"), ownerId: OMAR }); }
        return upload(body, len, opts);
      };
      return client;
    };
    const r = await saveOf(p, managed(SARA), "EXAM-race", "لسارة");
    expect(r.status).toBe(403);
    expect(p.mem.getJson("exams/EXAM-race.json")).toMatchObject({ ownerId: OMAR, exam: { title: "لعمر" } });
  });
});

describe("hotfix: with LEGACY_DATA_OWNER set, every teacher still creates new exams; legacy data keeps its owner", () => {
  it("a teacher other than the legacy owner creates a new exam; the legacy owner's unowned exam stays theirs", async () => {
    process.env.LEGACY_DATA_OWNER = "teacher-legacy";
    const p = platform({ "exams/EXAM-old.json": { kind: "saved-exam", savedAt: "2026-01-01T00:00:00.000Z", exam: exam("EXAM-old", "قديم") } });
    for (const auth of [multi("teacher-other"), managed(SARA)]) {
      const id = "EXAM-new-" + auth.user.sub;
      const r = await saveOf(p, auth, id, "جديد", { conditional: true, baseEtag: null });
      expect([r.status, r.jsonBody.code]).toEqual([200, undefined]);
      expect(p.mem.getJson("exams/" + id + ".json").ownerId).toBe(auth.user.sub);
    }
    expect((await saveOf(p, multi("teacher-other"), "EXAM-old", "استيلاء")).status).toBe(403);
    expect((await saveOf(p, multi("teacher-legacy"), "EXAM-old", "تعديل المالك")).status).toBe(200);
  });
});
