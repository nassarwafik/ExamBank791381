// Phase 21F.0 — saved-exam save safety: no silent overwrite of a newer version (conditional saves) and no cross-teacher access
// in multi-user mode (ownership). Drives the REAL handlers against the shared in-memory blob container with Azure-faithful
// ETag semantics. Written to run unchanged against the pre-21F.0 baseline (613bda55) for fail-first evidence: it imports only
// the two route handlers, never the new library.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const save = require("../src/functions/save-exam-artifact.js");
const saved = require("../src/functions/manage-saved-exams.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const multi = sub => ({ ok: true, user: { ver: 2, role: "teacher", sub, am: "multi-user" } });
const legacy = () => ({ ok: true, user: { ver: 2, role: "teacher", sub: "builder", am: "legacy" } });
const req = (method, body) => ({ method, url: "http://x/api", headers: { get: () => "" }, json: async () => body });
const exam = (id, title, extra = {}) => ({ examId: id, title, status: "draft", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "trueFalse", marks: 1, text: title, answer: { correct: true } }] }], ...extra });

function platform(seed = {}) {
  const mem = createMemoryContainer(seed);
  const deps = auth => ({ requireBuilderAuth: () => auth, getContainer: () => mem.container });
  return {
    mem,
    save: (auth, body) => save.handler(req("POST", { kind: "exam", ...body }), deps(auth)),
    load: (auth, blobName) => saved.handler(req("POST", { action: "load", blobName }), deps(auth)),
    del: (auth, blobName) => saved.handler(req("POST", { action: "delete", blobName }), deps(auth)),
    list: auth => saved.handler(req("GET"), deps(auth))
  };
}

describe("21F.0 conditional saves never overwrite a newer version", () => {
  it("a stale editor (older ETag) is refused with 409 EXAM_CONFLICT and the newer version stays", async () => {
    const p = platform();
    const created = await p.save(legacy(), { exam: exam("EXAM-A", "الأصل"), conditional: true, baseEtag: null });
    expect(created.status).toBe(200);
    const tabA = await p.load(legacy(), "exams/EXAM-A.json");
    const tabB = await p.load(legacy(), "exams/EXAM-A.json");
    expect(tabA.jsonBody.etag).toBeTruthy();
    expect(tabB.jsonBody.etag).toBe(tabA.jsonBody.etag);

    const first = await p.save(legacy(), { exam: exam("EXAM-A", "تعديل التبويب الأول"), conditional: true, baseEtag: tabA.jsonBody.etag });
    expect(first.status).toBe(200);
    const second = await p.save(legacy(), { exam: exam("EXAM-A", "تعديل التبويب الثاني"), conditional: true, baseEtag: tabB.jsonBody.etag });
    expect(second.status).toBe(409);
    expect(second.jsonBody.code).toBe("EXAM_CONFLICT");
    expect(second.jsonBody.serverEtag).toBe(first.jsonBody.etag);
    expect(p.mem.getJson("exams/EXAM-A.json").exam.title).toBe("تعديل التبويب الأول");
  });

  it("the ETag returned with the 409 lets the teacher deliberately replace the server copy", async () => {
    const p = platform();
    await p.save(legacy(), { exam: exam("EXAM-B", "١"), conditional: true, baseEtag: null });
    const loaded = await p.load(legacy(), "exams/EXAM-B.json");
    await p.save(legacy(), { exam: exam("EXAM-B", "٢"), conditional: true, baseEtag: loaded.jsonBody.etag });
    const refused = await p.save(legacy(), { exam: exam("EXAM-B", "٣"), conditional: true, baseEtag: loaded.jsonBody.etag });
    expect(refused.status).toBe(409);
    const replaced = await p.save(legacy(), { exam: exam("EXAM-B", "٣"), conditional: true, baseEtag: refused.jsonBody.serverEtag });
    expect(replaced.status).toBe(200);
    expect(p.mem.getJson("exams/EXAM-B.json").exam.title).toBe("٣");
  });

  it("creating an exam whose id already exists is refused instead of replacing the stored one", async () => {
    const p = platform();
    await p.save(legacy(), { exam: exam("EXAM-SAME", "امتحان المعلم الأول"), conditional: true, baseEtag: null });
    const collision = await p.save(legacy(), { exam: exam("EXAM-SAME", "امتحان المعلم الثاني"), conditional: true, baseEtag: null });
    expect(collision.status).toBe(409);
    expect(collision.jsonBody.code).toBe("EXAM_CONFLICT");
    expect(p.mem.getJson("exams/EXAM-SAME.json").exam.title).toBe("امتحان المعلم الأول");
  });

  it("every successful save returns the new ETag, which the next conditional save uses", async () => {
    const p = platform();
    const a = await p.save(legacy(), { exam: exam("EXAM-C", "١"), conditional: true, baseEtag: null });
    const b = await p.save(legacy(), { exam: exam("EXAM-C", "٢"), conditional: true, baseEtag: a.jsonBody.etag });
    const c = await p.save(legacy(), { exam: exam("EXAM-C", "٣"), conditional: true, baseEtag: b.jsonBody.etag });
    expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
    expect(new Set([a.jsonBody.etag, b.jsonBody.etag, c.jsonBody.etag]).size).toBe(3);
  });

  it("a save that does not opt in keeps last-write-wins (the legacy flat editor is unchanged)", async () => {
    const p = platform();
    expect((await p.save(legacy(), { exam: exam("EXAM-L", "١") })).status).toBe(200);
    expect((await p.save(legacy(), { exam: exam("EXAM-L", "٢") })).status).toBe(200);
    expect(p.mem.getJson("exams/EXAM-L.json").exam.title).toBe("٢");
  });
});

describe("21F.0 ownership in multi-user mode", () => {
  it("another teacher can neither list, load, save over nor delete an owned exam", async () => {
    const p = platform();
    expect((await p.save(multi("t-ahmad"), { exam: exam("EXAM-O", "امتحان أحمد"), conditional: true, baseEtag: null })).status).toBe(200);
    const stored = p.mem.getJson("exams/EXAM-O.json");
    expect(stored.ownerId).toBe("t-ahmad");
    expect(stored.exam).not.toHaveProperty("ownerId");

    const otherList = await p.list(multi("t-sara"));
    expect(otherList.jsonBody.exams.map(e => e.examId)).not.toContain("EXAM-O");
    expect((await p.list(multi("t-ahmad"))).jsonBody.exams.map(e => e.examId)).toContain("EXAM-O");

    const otherLoad = await p.load(multi("t-sara"), "exams/EXAM-O.json");
    expect(otherLoad.status).toBe(404);
    expect(JSON.stringify(otherLoad.jsonBody)).not.toContain("امتحان أحمد");

    const overwrite = await p.save(multi("t-sara"), { exam: exam("EXAM-O", "استبدال") });
    expect(overwrite.status).toBe(403);
    const conditionalOverwrite = await p.save(multi("t-sara"), { exam: exam("EXAM-O", "استبدال"), conditional: true, baseEtag: null });
    expect(conditionalOverwrite.status).toBe(403);
    expect(p.mem.getJson("exams/EXAM-O.json").exam.title).toBe("امتحان أحمد");

    const otherDelete = await p.del(multi("t-sara"), "exams/EXAM-O.json");
    expect(otherDelete.status).toBe(404);
    expect(p.mem.has("exams/EXAM-O.json")).toBe(true);

    expect((await p.load(multi("t-ahmad"), "exams/EXAM-O.json")).status).toBe(200);
  });

  it("an exam saved before ownership existed stays shared and is claimed by the next multi-user save (D2)", async () => {
    const p = platform({ "exams/EXAM-OLD.json": { kind: "saved-exam", savedAt: "2026-01-01T00:00:00.000Z", exam: exam("EXAM-OLD", "قديم") } });
    expect((await p.list(multi("t-sara"))).jsonBody.exams.map(e => e.examId)).toContain("EXAM-OLD");
    expect((await p.load(multi("t-sara"), "exams/EXAM-OLD.json")).status).toBe(200);
    expect((await p.save(multi("t-sara"), { exam: exam("EXAM-OLD", "قديم معدّل") })).status).toBe(200);
    expect(p.mem.getJson("exams/EXAM-OLD.json").ownerId).toBe("t-sara");
    expect((await p.load(multi("t-ahmad"), "exams/EXAM-OLD.json")).status).toBe(404);
  });

  it("legacy single-password mode neither stamps nor enforces an owner", async () => {
    const p = platform();
    await p.save(legacy(), { exam: exam("EXAM-SHARED", "مشترك") });
    expect(p.mem.getJson("exams/EXAM-SHARED.json")).not.toHaveProperty("ownerId");
    expect((await p.load(legacy(), "exams/EXAM-SHARED.json")).status).toBe(200);
  });

  it("a deployment switched back to legacy mode keeps the owner already stamped on a document", async () => {
    const p = platform();
    await p.save(multi("t-ahmad"), { exam: exam("EXAM-KEEP", "١") });
    await p.save(legacy(), { exam: exam("EXAM-KEEP", "٢") });
    expect(p.mem.getJson("exams/EXAM-KEEP.json").ownerId).toBe("t-ahmad");
  });
});
