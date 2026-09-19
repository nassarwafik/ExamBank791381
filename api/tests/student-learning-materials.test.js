import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { handler as studentMaterials } from "../src/functions/student-learning-materials.js";
import { handler as catalog } from "../src/functions/learning-materials-catalog.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Class Learning Materials — the STUDENT entitlement endpoint. Drives the REAL requireActiveStudentSession (token
// verification stubbed) over the in-memory container, so the persisted student document is proven to be the
// authority (never the token's classId), plus the teacher catalog endpoint.

const M01 = "791381-m01", M02 = "791381-m02", M07 = "791381-m07";
const USR = id => "platform/users/" + id + ".json";
const CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي حسن", code: "S1", identityNumber: "123456789", ...extra });
const room = (id, materials, extra = {}) => ({ classId: id, name: "صف " + id, grade: "11", schoolYear: "2026-2027", active: true, status: "active", studentIds: [], ...(materials === undefined ? {} : { learningMaterials: materials }), ...extra });
const req = () => ({ method: "GET", url: "https://x/api/student-learning-materials", headers: { get: () => null }, query: new Map([["classId", "cB"]]) });
// Real session helper; the token claims (with a STALE classId) are injected — exactly what a real token carries.
function deps(ctx, tokenClassId = "cA", extra = {}) {
  const reads = [];
  const d = {
    requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student", classId: tokenClassId } }),
    container: ctx.container, getContainer: () => ctx.container,
    downloadJsonOrNull: async (_c, name) => { reads.push(name); return ctx.getJson(name); },
    ...extra
  };
  return { d, reads };
}
const call = (ctx, tokenClassId, extra) => { const { d, reads } = deps(ctx, tokenClassId, extra); return studentMaterials(req(), d).then(r => ({ r, reads })); };

describe("student-learning-materials — safe catalog from the class's publication", () => {
  it("Case 1: class 791381 → m01,m02 published: exactly those two, canonical order, with titles; nothing else", async () => {
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", [{ courseId: "791381", visibleModuleIds: [M02, M01] }]) });
    const { r } = await call(ctx);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toEqual({ ok: true, materials: [{ courseId: "791381", title: "شبكات الاتصال", modules: [{ moduleId: M01, title: "أساسيات الشبكات", order: 1 }, { moduleId: M02, title: "الأعداد والموازين", order: 2 }] }] });
  });
  it("Case 2: m07 hidden → m07 absent: no id, no title «عناوين IP», no hidden count", async () => {
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", [{ courseId: "791381", visibleModuleIds: [M01, M02] }]) });
    const { r } = await call(ctx);
    const text = JSON.stringify(r.jsonBody);
    expect(text).not.toContain(M07); expect(text).not.toContain("عناوين IP"); expect(text).not.toMatch(/hidden|total|count/i);
    expect(r.jsonBody.materials[0].modules.length).toBe(2);
  });
  it("Case 3: course attached with [] → materials: [] (no student card for a course with nothing released)", async () => {
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", [{ courseId: "791381", visibleModuleIds: [] }]) });
    const { r } = await call(ctx);
    expect(r.jsonBody).toEqual({ ok: true, materials: [] });
  });
  it("Case 4: storage contains m999 (+ skeleton m03): omitted, default-denied; nothing echoed", async () => {
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", [{ courseId: "791381", visibleModuleIds: [M01, "791381-m999", "791381-m03"] }, { courseId: "999999", visibleModuleIds: ["999999-m01"] }]) });
    const { r } = await call(ctx);
    expect(r.jsonBody.materials).toEqual([{ courseId: "791381", title: "شبكات الاتصال", modules: [{ moduleId: M01, title: "أساسيات الشبكات", order: 1 }] }]);
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/m999|m03|999999/);
  });
  it("Case 5: token says class A, persisted student is in class B → class B's publication wins", async () => {
    const ctx = createMemoryContainer({
      [USR("u1")]: student("u1", "cB"),
      [CLS("cA")]: room("cA", [{ courseId: "791381", visibleModuleIds: [M01, M02, M07] }]),
      [CLS("cB")]: room("cB", [{ courseId: "791381", visibleModuleIds: [M01] }])
    });
    const { r, reads } = await call(ctx, "cA");
    expect(r.jsonBody.materials[0].modules.map(m => m.moduleId)).toEqual([M01]);
    expect(reads).toEqual([USR("u1"), CLS("cB")]);   // class A is never even read; the browser's ?classId is ignored
  });
  it("Case 6: student moved A→B between two calls → the next read reflects B immediately", async () => {
    const ctx = createMemoryContainer({
      [USR("u1")]: student("u1", "cA"),
      [CLS("cA")]: room("cA", [{ courseId: "791381", visibleModuleIds: [M01, M02, M07] }]),
      [CLS("cB")]: room("cB", [{ courseId: "791381", visibleModuleIds: [] }])
    });
    expect((await call(ctx, "cA")).r.jsonBody.materials[0].modules.length).toBe(3);
    ctx.setJson(USR("u1"), student("u1", "cB"));
    expect((await call(ctx, "cA")).r.jsonBody).toEqual({ ok: true, materials: [] });
  });
  it("Case 7: archived class → 403 with the same lifecycle message as the dashboard (no weaker path)", async () => {
    for (const over of [{ status: "archived", active: false }, { active: false }, { status: "archived", active: true }]) {
      const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", [{ courseId: "791381", visibleModuleIds: [M01] }], over) });
      const { r } = await call(ctx);
      expect(r.status).toBe(403); expect(r.jsonBody).toEqual({ ok: false, error: "هذا الصف مؤرشف وانتهت السنة الدراسية." });
    }
  });
  it("Case 8: inactive / archived / missing student, or stale session version → 401 from the session authority", async () => {
    const seeds = [student("u1", "cA", { active: false }), student("u1", "cA", { archived: true }), student("u1", "cA", { authVersion: 2 }), null];
    for (const s of seeds) {
      const ctx = createMemoryContainer({ ...(s ? { [USR("u1")]: s } : {}), [CLS("cA")]: room("cA", [{ courseId: "791381", visibleModuleIds: [M01] }]) });
      const { r } = await call(ctx);
      expect(r.status).toBe(401);
    }
    const noToken = createMemoryContainer({ [USR("u1")]: student("u1", "cA") });
    expect((await call(noToken, "cA", { requireStudentAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) })).r.status).toBe(401);
  });
  it("no classId on the student, or a missing class document → ok with materials: []", async () => {
    expect((await call(createMemoryContainer({ [USR("u1")]: student("u1", "") }))).r.jsonBody).toEqual({ ok: true, materials: [] });
    expect((await call(createMemoryContainer({ [USR("u1")]: student("u1", "cGone") }))).r.jsonBody).toEqual({ ok: true, materials: [] });
  });
});

describe("student-learning-materials — storage read path + safety", () => {
  it("exactly ONE user read + ONE class read; no classroom/student scan, no module or assignment blobs, no writes", async () => {
    const ctx = createMemoryContainer({
      [USR("u1")]: student("u1", "cA"), [USR("u2")]: student("u2", "cA"),
      [CLS("cA")]: room("cA", [{ courseId: "791381", visibleModuleIds: [M01, M02, M07] }]), [CLS("cB")]: room("cB", []),
      "platform/assignments/a1.json": { assignmentId: "a1" }
    });
    const namesBefore = ctx.names("").sort(); const etags = ctx.names("").map(n => ctx.store.get(n).etag);
    const { r, reads } = await call(ctx);
    expect(r.status).toBe(200);
    expect(reads).toEqual([USR("u1"), CLS("cA")]);
    expect(ctx.names("").sort()).toEqual(namesBefore); expect(ctx.names("").map(n => ctx.store.get(n).etag)).toEqual(etags);
  });
  it("the response never carries page/lesson bodies, PDF text, answer keys or student PII", async () => {
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", [{ courseId: "791381", visibleModuleIds: [M01, M02, M07] }]) });
    const { r } = await call(ctx);
    const text = JSON.stringify(r.jsonBody);
    expect(text).not.toMatch(/blocks|pages|lessons|pdf|answer|123456789|identityNumber|passwordHash/i);
  });
  it("storage failure → generic 500 (no internals leaked)", async () => {
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA") });
    const { r } = await call(ctx, "cA", { downloadJsonOrNull: async (_c, n) => { if (n === CLS("cA")) { const e = new Error("secret-marker"); e.statusCode = 503; throw e; } return ctx.getJson(n); } });
    expect(r.status).toBe(500); expect(JSON.stringify(r.jsonBody)).not.toContain("secret-marker");
  });
  it("source guard: the endpoint reads the class through the persisted student's classId, never the request, and is wrapped", () => {
    const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "functions", "student-learning-materials.js"), "utf8");
    expect(src).toMatch(/withObservability\("student-learning-materials",\s*handler\)/);
    expect(src).toMatch(/module\.exports\s*=\s*\{\s*handler\s*\}/);
    expect(src).toContain("student?.classId");
    expect(src).not.toMatch(/request\.query|request\.params|body\.classId|user\.classId/);
    expect(src).not.toMatch(/listJson|listBlobsFlat|platform\/users\//);   // no scans, no direct user reads (the session owns that)
  });
});

describe("learning-materials-catalog — teacher catalog endpoint", () => {
  const breq = () => ({ method: "GET", url: "https://x/api/learning-materials-catalog", headers: { get: () => null } });
  it("builder-authenticated → the exact publishable catalog (metadata only)", async () => {
    const r = await catalog(breq(), { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toEqual({ ok: true, courses: [{ courseId: "791381", title: "شبكات الاتصال", subject: "أنظمة محوسبة", modules: [
      { moduleId: M01, title: "أساسيات الشبكات", order: 1 }, { moduleId: M02, title: "الأعداد والموازين", order: 2 }, { moduleId: M07, title: "عناوين IP", order: 3 },
      // Units 4–6 phase: publishable metadata only — being listed here NEVER makes a module visible to any class.
      { moduleId: "791381-m08", title: "Class و Subnet و CIDR", order: 4 }, { moduleId: "791381-m09", title: "أجهزة الشبكات", order: 5 }, { moduleId: "791381-m10", title: "أنواع شبكات الاتصال", order: 6 },
      // Units 7–8 phase: same rule — listed = publishable, never auto-visible.
      { moduleId: "791381-m11", title: "الكوابل وعنوان MAC", order: 7 }, { moduleId: "791381-m12", title: "أنواع الرسائل", order: 8 },
      // Batch 3 phase: same rule — listed = publishable, never auto-visible.
      { moduleId: "791381-m13", title: "نماذج الاتصال: OSI و TCP/IP", order: 9 }
    ] }] });
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/m03|m04|m05|m06|pages|lessons|blocks|answer|pdf/i);
  });
  it("unauthenticated → 401", async () => {
    const r = await catalog(breq(), { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) });
    expect(r.status).toBe(401);
  });
});
