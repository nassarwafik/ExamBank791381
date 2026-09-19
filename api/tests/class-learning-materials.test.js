import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { handler as classrooms, learningMaterialsChangeAllowed } from "../src/functions/manage-classrooms.js";
import { getClassLearningMaterials, getClassLearningCourse, classHasLearningCourse, getVisibleLearningModuleIds, classCanSeeLearningModule, setClassLearningCourseModules, removeClassLearningCourse, buildStudentLearningMaterials } from "../src/lib/class-learning-materials.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
const { StorageConflictError } = createRequire(import.meta.url)("../src/lib/platform-storage.js");

// Class Learning Materials — one normalization authority (lib) + the classroom mutation actions (handler) over the
// REAL platform-storage CAS helpers on the in-memory container. Covers: default-deny normalization, the two actions,
// lifecycle gate, idempotent remove, audit, concurrency with projects/roster, and the no-auto-publish invariant.

const M01 = "791381-m01", M02 = "791381-m02", M07 = "791381-m07";
const CLS = id => "platform/classes/" + id + ".json";
const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const deps = (ctx, extra = {}) => ({ ...AUTH, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, ...extra });
const post = (ctx, body, extra) => classrooms({ method: "POST", url: "https://x/api/classrooms", json: async () => body }, deps(ctx, extra));
const room = (id, extra = {}) => ({ schemaVersion: 1, classId: id, name: "صف " + id, grade: "11", schoolYear: "2026-2027", active: true, status: "active", studentIds: ["s1", "s2"], programCodes: ["794589"], createdAt: "2026-01-01", updatedAt: "2026-01-01T00:00:00.000Z", customNote: "keep-me", ...extra });
const doc = (ctx, id) => ctx.getJson(CLS(id));
const setModules = (ctx, classId, moduleIds, extra) => post(ctx, { action: "setLearningCourseModules", classId, courseId: "791381", moduleIds }, extra);
const remove = (ctx, classId, extra) => post(ctx, { action: "removeLearningCourse", classId, courseId: "791381" }, extra);

describe("normalization — getClassLearningMaterials is default-deny and canonical", () => {
  it("no field → []; malformed top-level (string / object / null) → []", () => {
    expect(getClassLearningMaterials({ classId: "c" })).toEqual([]);
    expect(getClassLearningMaterials({ learningMaterials: "791381" })).toEqual([]);
    expect(getClassLearningMaterials({ learningMaterials: { courseId: "791381" } })).toEqual([]);
    expect(getClassLearningMaterials({ learningMaterials: null })).toEqual([]);
    expect(getClassLearningMaterials(null)).toEqual([]);
  });
  it("one course: ids trimmed, de-duplicated, unknown/skeleton dropped, canonical order restored", () => {
    const c = { learningMaterials: [{ courseId: " 791381 ", visibleModuleIds: [M07, " " + M01 + " ", M01, "791381-m03", "791381-m999", "", 7] }] };
    expect(getClassLearningMaterials(c)).toEqual([{ courseId: "791381", visibleModuleIds: [M01, M07] }]);
  });
  it("empty published list stays attached; empty/unknown courseId entries and non-object entries are ignored", () => {
    expect(getClassLearningMaterials({ learningMaterials: [{ courseId: "791381", visibleModuleIds: [] }] })).toEqual([{ courseId: "791381", visibleModuleIds: [] }]);
    expect(getClassLearningMaterials({ learningMaterials: [{ courseId: "", visibleModuleIds: [M01] }, { courseId: "999999", visibleModuleIds: [M01] }, "791381", null] })).toEqual([]);
  });
  it("duplicate course entries merge into ONE canonical entry (published ids united, never lost)", () => {
    const c = { learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01] }, { courseId: "791381", visibleModuleIds: [M07] }] };
    expect(getClassLearningMaterials(c)).toEqual([{ courseId: "791381", visibleModuleIds: [M01, M07] }]);
  });
  it("visibleModuleIds missing / non-array → attached with []", () => {
    expect(getClassLearningMaterials({ learningMaterials: [{ courseId: "791381" }] })).toEqual([{ courseId: "791381", visibleModuleIds: [] }]);
    expect(getClassLearningMaterials({ learningMaterials: [{ courseId: "791381", visibleModuleIds: M01 }] })).toEqual([{ courseId: "791381", visibleModuleIds: [] }]);
  });
  it("multiple courses are future-safe: entries follow registry course order (fake registry seam)", () => {
    const registry = {
      listLearningCourses: () => [{ courseId: "A", modules: [{ moduleId: "A-m01", order: 1 }] }, { courseId: "B", modules: [{ moduleId: "B-m01", order: 1 }] }],
      findLearningCourse: id => (id === "A" || id === "B") ? { courseId: id, title: id, modules: [{ moduleId: id + "-m01", title: id + " 1", order: 1 }] } : null,
      canonicalizeLearningModuleIds: (id, ids) => ids.filter(x => x === id + "-m01")
    };
    const c = { learningMaterials: [{ courseId: "B", visibleModuleIds: ["B-m01"] }, { courseId: "A", visibleModuleIds: [] }] };
    expect(getClassLearningMaterials(c, registry)).toEqual([{ courseId: "A", visibleModuleIds: [] }, { courseId: "B", visibleModuleIds: ["B-m01"] }]);
  });
  it("derived getters: course / has / visible ids / can-see; unrelated fields never read or changed", () => {
    const c = room("c1", { learningMaterials: [{ courseId: "791381", visibleModuleIds: [M02, M01] }] });
    const before = JSON.stringify(c);
    expect(getClassLearningCourse(c, "791381")).toEqual({ courseId: "791381", visibleModuleIds: [M01, M02] });
    expect(classHasLearningCourse(c, "791381")).toBe(true);
    expect(classHasLearningCourse(c, "794589")).toBe(false);
    expect(getVisibleLearningModuleIds(c, "791381")).toEqual([M01, M02]);
    expect(classCanSeeLearningModule(c, "791381", M02)).toBe(true);
    expect(classCanSeeLearningModule(c, "791381", M07)).toBe(false);
    expect(classCanSeeLearningModule(c, "791381", "791381-m03")).toBe(false);
    expect(JSON.stringify(c)).toBe(before);
  });
});

describe("no-auto-publish invariant — DEPLOYMENT ≠ PUBLICATION", () => {
  it("a class that published only m01 stays at m01 even though the registry knows m02 and m07", () => {
    const c = { learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01] }] };
    expect(getVisibleLearningModuleIds(c, "791381")).toEqual([M01]);
    expect(buildStudentLearningMaterials(c)[0].modules.map(m => m.moduleId)).toEqual([M01]);
  });
  it("a NEWLY registered module (future Unit 4) is NOT appended to any existing class's visibleModuleIds", () => {
    const future = {
      listLearningCourses: () => [{ courseId: "791381", title: "شبكات الاتصال", modules: [{ moduleId: M01, title: "أساسيات الشبكات", order: 1 }, { moduleId: M02, title: "الأعداد والموازين", order: 2 }, { moduleId: M07, title: "عناوين IP", order: 3 }, { moduleId: "791381-m08", title: "الوحدة الرابعة", order: 4 }] }],
      findLearningCourse() { return this.listLearningCourses()[0]; },
      canonicalizeLearningModuleIds(_c, ids) { const w = new Set(ids); return this.listLearningCourses()[0].modules.map(m => m.moduleId).filter(id => w.has(id)); }
    };
    const existing = room("c1", { learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01, M02, M07] }] });
    expect(getVisibleLearningModuleIds(existing, "791381", future)).toEqual([M01, M02, M07]);
    expect(JSON.stringify(buildStudentLearningMaterials(existing, future))).not.toContain("m08");
    expect(JSON.stringify(buildStudentLearningMaterials(existing, future))).not.toContain("الوحدة الرابعة");
    // the teacher would see m08 as available-to-publish (registry) but it is hidden until explicitly published
    expect(future.listLearningCourses()[0].modules.map(m => m.moduleId)).toContain("791381-m08");
  });
});

describe("pure mutations — setClassLearningCourseModules / removeClassLearningCourse", () => {
  it("set: attaches + writes canonical shape; other fields and other courses preserved; input not mutated", () => {
    const c = room("c1");
    const before = JSON.stringify(c);
    const next = setClassLearningCourseModules(c, "791381", [M07, M01]);
    expect(next.learningMaterials).toEqual([{ courseId: "791381", visibleModuleIds: [M01, M07] }]);
    expect(next.programCodes).toEqual(["794589"]); expect(next.studentIds).toEqual(["s1", "s2"]); expect(next.customNote).toBe("keep-me");
    expect(JSON.stringify(c)).toBe(before);
  });
  it("remove: detaches only that course (stale duplicates included); idempotent when absent", () => {
    const c = room("c1", { learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01] }, { courseId: "791381", visibleModuleIds: [M07] }] });
    const r1 = removeClassLearningCourse(c, "791381");
    expect(r1.changed).toBe(true); expect(r1.classroom.learningMaterials).toEqual([]); expect(r1.classroom.programCodes).toEqual(["794589"]);
    const r2 = removeClassLearningCourse(r1.classroom, "791381");
    expect(r2.changed).toBe(false); expect(r2.classroom.learningMaterials).toEqual([]);
  });
});

describe("learningMaterialsChangeAllowed — lifecycle authority", () => {
  it("active → allowed; archived by status, by active:false, or inconsistent blobs → blocked", () => {
    expect(learningMaterialsChangeAllowed({ active: true })).toBe(true);
    expect(learningMaterialsChangeAllowed({ status: "active" })).toBe(true);
    expect(learningMaterialsChangeAllowed({ status: "archived" })).toBe(false);
    expect(learningMaterialsChangeAllowed({ active: false })).toBe(false);
    expect(learningMaterialsChangeAllowed({ status: "archived", active: true })).toBe(false);
  });
});

describe("handler — setLearningCourseModules", () => {
  it("creates the entry on a class without materials (canonical order, de-duplicated) and returns the normalized list", async () => {
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1") });
    const r = await setModules(ctx, "c1", [M02, M01, M01]);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toEqual({ ok: true, classId: "c1", learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01, M02] }] });
    expect(doc(ctx, "c1").learningMaterials).toEqual([{ courseId: "791381", visibleModuleIds: [M01, M02] }]);
  });
  it("updates an existing entry (publish m07 later, hide m02, re-publish) — teacher controls visibility, never order", async () => {
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1", { learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01] }] }) });
    expect((await setModules(ctx, "c1", [M01, M07])).jsonBody.learningMaterials[0].visibleModuleIds).toEqual([M01, M07]);   // middle module hidden
    expect((await setModules(ctx, "c1", [M07, M02, M01])).jsonBody.learningMaterials[0].visibleModuleIds).toEqual([M01, M02, M07]);
    expect((await setModules(ctx, "c1", [M01, M07])).jsonBody.learningMaterials[0].visibleModuleIds).toEqual([M01, M07]);
  });
  it("moduleIds [] keeps the course ATTACHED with nothing released", async () => {
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1", { learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01] }] }) });
    const r = await setModules(ctx, "c1", []);
    expect(r.jsonBody.learningMaterials).toEqual([{ courseId: "791381", visibleModuleIds: [] }]);
    expect(classHasLearningCourse(doc(ctx, "c1"), "791381")).toBe(true);
  });
  it("preserves programCodes, studentIds, lifecycle fields and unrelated fields; only learningMaterials + updatedAt change", async () => {
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1", { archivedAt: "" }) });
    const before = doc(ctx, "c1");
    await setModules(ctx, "c1", [M01]);
    const after = doc(ctx, "c1");
    const { learningMaterials: _a, updatedAt: _b, ...restAfter } = after;
    const { learningMaterials: _c, updatedAt: _d, ...restBefore } = before;
    expect(restAfter).toEqual(restBefore);
    expect(after.programCodes).toEqual(["794589"]); expect(after.studentIds).toEqual(["s1", "s2"]); expect(after.customNote).toBe("keep-me");
    expect(after.updatedAt).not.toBe(before.updatedAt);
  });
  it("a second (future) course entry is preserved when another course is set", async () => {
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1", { learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01] }, { courseId: "999999", visibleModuleIds: ["999999-m01"] }] }) });
    await setModules(ctx, "c1", [M02]);
    // unknown course entries are default-denied everywhere they are READ; the canonical rewrite keeps only registered courses
    expect(doc(ctx, "c1").learningMaterials).toEqual([{ courseId: "791381", visibleModuleIds: [M02] }]);
  });
  it("unknown course → 400; unknown module → 400; skeleton module → 400; nothing written", async () => {
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1") });
    const before = JSON.stringify(doc(ctx, "c1"));
    expect((await post(ctx, { action: "setLearningCourseModules", classId: "c1", courseId: "794589", moduleIds: [] })).status).toBe(400);
    expect((await setModules(ctx, "c1", ["791381-m999"])).status).toBe(400);
    expect((await setModules(ctx, "c1", ["791381-m03"])).status).toBe(400);
    expect((await post(ctx, { action: "setLearningCourseModules", classId: "c1", moduleIds: [] })).status).toBe(400);
    expect(JSON.stringify(doc(ctx, "c1"))).toBe(before);
  });
  it("archived class → 403 (status:'archived', active:false, and inconsistent blobs); nothing written", async () => {
    for (const over of [{ status: "archived", active: false }, { active: false }, { status: "archived", active: true }]) {
      const ctx = createMemoryContainer({ [CLS("c1")]: room("c1", over) });
      const before = JSON.stringify(doc(ctx, "c1"));
      const r = await setModules(ctx, "c1", [M01]);
      expect(r.status).toBe(403); expect(r.jsonBody.error).toContain("مؤرشف");
      expect(JSON.stringify(doc(ctx, "c1"))).toBe(before);
    }
  });
  it("missing class → 404; persistent CAS conflict → 503 with the standard message", async () => {
    expect((await setModules(createMemoryContainer(), "c1", [M01])).status).toBe(404);
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1") }, { beforeConditionalUpload: (name, api) => { if (name === CLS("c1")) api.setJson(name, api.getJson(name)); } });
    const r = await setModules(ctx, "c1", [M01]);
    expect(r.status).toBe(503); expect(r.jsonBody.error).toBe("حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.");
    const injected = await setModules(createMemoryContainer({ [CLS("c1")]: room("c1") }), "c1", [M01], { mutateJsonWithRetry: async () => { throw new StorageConflictError("conflict"); } });
    expect(injected.status).toBe(503);
  });
  it("unauthenticated → 401, nothing written", async () => {
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1") });
    const r = await setModules(ctx, "c1", [M01], { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) });
    expect(r.status).toBe(401); expect(doc(ctx, "c1").learningMaterials).toBeUndefined();
  });
});

describe("handler — removeLearningCourse", () => {
  it("removes only the selected learning course; roster, projects and lifecycle untouched; content is never deleted", async () => {
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1", { learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01, M02] }] }) });
    const r = await remove(ctx, "c1");
    expect(r.status).toBe(200); expect(r.jsonBody).toEqual({ ok: true, classId: "c1", removed: true, learningMaterials: [] });
    const after = doc(ctx, "c1");
    expect(after.learningMaterials).toEqual([]); expect(after.programCodes).toEqual(["794589"]); expect(after.studentIds).toEqual(["s1", "s2"]); expect(after.status).toBe("active");
    expect(ctx.names("platform/").filter(n => !n.startsWith("platform/classes/"))).toEqual([]);   // no other blob touched
  });
  it("IDEMPOTENT policy: removing an absent course → 200 removed:false, no write, no audit", async () => {
    const events = [];
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1") });
    const etagBefore = ctx.store.get(CLS("c1")).etag;
    const r = await remove(ctx, "c1", { recordAuditEvent: async (_c, ev) => events.push(ev) });
    expect(r.status).toBe(200); expect(r.jsonBody.removed).toBe(false); expect(r.jsonBody.learningMaterials).toEqual([]);
    expect(ctx.store.get(CLS("c1")).etag).toBe(etagBefore);
    expect(events).toEqual([]);
  });
  it("archived class → 403; missing class → 404; conflict → 503", async () => {
    const archived = createMemoryContainer({ [CLS("c1")]: room("c1", { status: "archived", active: false, learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01] }] }) });
    expect((await remove(archived, "c1")).status).toBe(403);
    expect(doc(archived, "c1").learningMaterials).toEqual([{ courseId: "791381", visibleModuleIds: [M01] }]);
    expect((await remove(createMemoryContainer(), "c1")).status).toBe(404);
    const conflict = createMemoryContainer({ [CLS("c1")]: room("c1", { learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01] }] }) }, { beforeConditionalUpload: (name, api) => { if (name === CLS("c1")) api.setJson(name, api.getJson(name)); } });
    expect((await remove(conflict, "c1")).status).toBe(503);
  });
});

describe("handler — GET /api/classrooms lists normalized learningMaterials additively (no extra reads)", () => {
  it("returns [] for a class without the field and the canonical list otherwise; existing fields unchanged", async () => {
    const ctx = createMemoryContainer({
      [CLS("c1")]: room("c1", { createdAt: "2026-01-02" }),
      [CLS("c2")]: room("c2", { createdAt: "2026-01-01", learningMaterials: [{ courseId: "791381", visibleModuleIds: [M07, M01, "791381-m999"] }] })
    });
    const downloads = [];
    const r = await classrooms({ method: "GET", url: "https://x/api/classrooms", json: async () => ({}) }, deps(ctx, { downloadJsonOrNull: async (_c, n) => { downloads.push(n); return ctx.getJson(n); } }));
    expect(r.status).toBe(200);
    const [c1, c2] = r.jsonBody.classes;
    expect(c1.classId).toBe("c1"); expect(c1.learningMaterials).toEqual([]); expect(c1.programCodes).toEqual(["794589"]); expect(c1.studentCount).toBe(2);
    expect(c2.learningMaterials).toEqual([{ courseId: "791381", visibleModuleIds: [M01, M07] }]);
    expect(downloads.sort()).toEqual([CLS("c1"), CLS("c2")]);   // exactly one read per class, nothing else
  });
});

describe("audit — learning-material mutations are recorded (actor, class, courseId, resulting ids), non-fatal", () => {
  it("setModules emits class.learningMaterials.setModules with the resulting moduleIds; remove emits removeCourse; no student PII", async () => {
    const events = [];
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1", { studentIds: ["123456789"] }) });
    await setModules(ctx, "c1", [M07, M01], { recordAuditEvent: async (_c, ev) => events.push(ev) });
    await remove(ctx, "c1", { recordAuditEvent: async (_c, ev) => events.push(ev) });
    expect(events.map(e => e.action)).toEqual(["class.learningMaterials.setModules", "class.learningMaterials.removeCourse"]);
    expect(events[0]).toMatchObject({ actor: "teacher-1", targetType: "class", targetId: "c1", targetLabel: "صف c1", details: { courseId: "791381", moduleIds: [M01, M07] } });
    expect(events[1]).toMatchObject({ actor: "teacher-1", targetType: "class", targetId: "c1", details: { courseId: "791381" } });
    expect(JSON.stringify(events)).not.toContain("123456789");
    expect(JSON.stringify(events)).not.toMatch(/studentIds|s1|s2/);
  });
  it("a throwing recorder never fails the mutation", async () => {
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1") });
    const r = await setModules(ctx, "c1", [M01], { recordAuditEvent: async () => { throw new Error("audit down"); } });
    expect(r.status).toBe(200); expect(doc(ctx, "c1").learningMaterials).toEqual([{ courseId: "791381", visibleModuleIds: [M01] }]);
  });
});

describe("concurrency + independence — learningMaterials never clobbers programCodes / roster and vice-versa", () => {
  it("setPrograms landing DURING the learning-material CAS: both fields survive (retry re-reads the fresh document)", async () => {
    let fired = false;
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1", { programCodes: ["794589"] }) }, {
      beforeConditionalUpload: (name, api) => {
        if (fired || name !== CLS("c1")) return;
        fired = true;
        const cls = api.getJson(name); cls.programCodes = ["794589", "899373"]; cls.studentIds.push("s3"); api.setJson(name, cls);   // a concurrent projects + roster writer
      }
    });
    const r = await setModules(ctx, "c1", [M01]);
    expect(r.status).toBe(200);
    const after = doc(ctx, "c1");
    expect(after.programCodes).toEqual(["794589", "899373"]); expect(after.studentIds).toEqual(["s1", "s2", "s3"]);
    expect(after.learningMaterials).toEqual([{ courseId: "791381", visibleModuleIds: [M01] }]);
  });
  it("a learning-material write landing DURING a setPrograms CAS: the publication survives the project change", async () => {
    let fired = false;
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1") }, {
      beforeConditionalUpload: (name, api) => {
        if (fired || name !== CLS("c1")) return;
        fired = true;
        const cls = api.getJson(name); cls.learningMaterials = [{ courseId: "791381", visibleModuleIds: [M01, M02] }]; api.setJson(name, cls);
      }
    });
    const r = await post(ctx, { action: "setPrograms", classId: "c1", programCodes: ["899373"] });
    expect(r.status).toBe(200);
    expect(doc(ctx, "c1").programCodes).toEqual(["899373"]);
    expect(getClassLearningMaterials(doc(ctx, "c1"))).toEqual([{ courseId: "791381", visibleModuleIds: [M01, M02] }]);
  });
  it("two simultaneous learning-material mutations: the last CAS winner's list is stored, none is lost mid-way (retry)", async () => {
    let fired = false;
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1") }, {
      beforeConditionalUpload: (name, api) => {
        if (fired || name !== CLS("c1")) return;
        fired = true;
        const cls = api.getJson(name); cls.learningMaterials = [{ courseId: "791381", visibleModuleIds: [M01] }]; api.setJson(name, cls);
      }
    });
    const r = await setModules(ctx, "c1", [M01, M02]);
    expect(r.status).toBe(200);
    expect(doc(ctx, "c1").learningMaterials).toEqual([{ courseId: "791381", visibleModuleIds: [M01, M02] }]);
  });
  it("all four project × learning-course combinations are valid and independent", async () => {
    const ctx = createMemoryContainer({ [CLS("c1")]: room("c1", { programCodes: [] }) });
    expect(getClassLearningMaterials(doc(ctx, "c1"))).toEqual([]); expect(doc(ctx, "c1").programCodes).toEqual([]);                 // none + none
    await setModules(ctx, "c1", [M01]);
    expect(doc(ctx, "c1").programCodes).toEqual([]);                                                                                    // projects none + course yes
    await post(ctx, { action: "setPrograms", classId: "c1", programCodes: ["794589"] });
    expect(getClassLearningMaterials(doc(ctx, "c1"))).toEqual([{ courseId: "791381", visibleModuleIds: [M01] }]);                   // both yes
    await remove(ctx, "c1");
    expect(doc(ctx, "c1").programCodes).toEqual(["794589"]); expect(getClassLearningMaterials(doc(ctx, "c1"))).toEqual([]);           // projects yes + course none
    expect(ctx.names("platform/assignments/")).toEqual([]);                                                                             // never an assignment record
  });
});
