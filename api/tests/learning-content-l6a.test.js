import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { handler } from "../src/functions/learning-content.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase L.6a — GET /api/learning-content/{courseId}/{moduleId}: the ONLY way the app reads a learning module body. A student
// receives a module only while it is published to the PERSISTED class (archived class, course not attached, hidden module →
// refused, before anything is served); a teacher receives any module of the book; anyone else is refused. Strong ETag +
// `private, no-cache`; a 304 only after the gate passed. Read-only.

const C = "791381", M01 = "791381-m01", M02 = "791381-m02";
const dataFile = id => JSON.parse(readFileSync(path.join(__dirname, "../src/data/learning-content", C, id + ".json"), "utf8"));
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, ...extra });
const room = (id, visible, extra = {}) => ({ classId: id, name: "صف", active: true, status: "active", learningMaterials: visible === null ? [] : [{ courseId: C, visibleModuleIds: visible }], ...extra });
const seed = (visible = [M01], extra = {}) => createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", visible), ...extra });
const noTeacher = () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } });
const asStudent = (ctx, id = "u1") => ({ requireBuilderAuth: noTeacher, requireStudentAuth: () => ({ ok: true, user: { sub: id, sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container });
const asTeacher = () => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "t1", am: "multi-user" } }) });
const get = (deps, moduleId = M01, courseId = C, headers = {}) => handler({ method: "GET", url: "https://x", headers: { get: k => headers[k.toLowerCase()] ?? null }, params: { courseId, moduleId } }, deps);

describe("GET /api/learning-content/{courseId}/{moduleId}", () => {
  it("a teacher receives any module, byte-equal to the committed data, with a strong ETag and private no-cache", async () => {
    for (const id of [M01, M02, "791381-m28"]) {
      const r = await get(asTeacher(), id);
      expect(r.status).toBe(200);
      expect(r.jsonBody).toEqual({ ok: true, courseId: C, module: dataFile(id) });
      expect(r.headers["Cache-Control"]).toBe("private, no-cache");
      expect(r.headers.ETag).toMatch(/^"[A-Za-z0-9_-]{22}"$/);
    }
    const a = await get(asTeacher(), M01), b = await get(asTeacher(), M02);
    expect(a.headers.ETag).not.toBe(b.headers.ETag);
  });

  it("a student receives a module published to the class; a hidden module and a course not attached are refused", async () => {
    const ctx = seed([M01]);
    const ok = await get(asStudent(ctx), M01);
    expect(ok.status).toBe(200);
    expect(ok.jsonBody.module.id).toBe(M01);
    const hidden = await get(asStudent(ctx), M02);
    expect(hidden.status).toBe(403);
    expect(hidden.jsonBody.module).toBeUndefined();
    ctx.setJson(CLS("cA"), room("cA", null));
    expect((await get(asStudent(ctx), M01)).status).toBe(403);
  });

  it("an archived class, a student without a class, and an unauthenticated caller are refused", async () => {
    const ctx = seed([M01]);
    ctx.setJson(CLS("cA"), room("cA", [M01], { status: "archived", active: false }));
    expect((await get(asStudent(ctx), M01)).status).toBe(403);
    const lone = createMemoryContainer({ [USR("u2")]: student("u2", "") });
    expect((await get(asStudent(lone, "u2"), M01)).status).toBe(403);
    expect((await get({ requireBuilderAuth: noTeacher, requireStudentAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }), container: ctx.container })).status).toBe(401);
  });

  it("the PERSISTED class decides, never the token's class claim", async () => {
    // the token says "STALE"; the user document says cA, where M01 is published
    const ctx = seed([M01], { [CLS("STALE")]: room("STALE", []) });
    expect((await get(asStudent(ctx), M01)).status).toBe(200);
  });

  it("revalidation: If-None-Match → 304 only after the gate passed; a hidden module is refused even with a matching tag", async () => {
    const tag = (await get(asTeacher(), M02)).headers.ETag;
    const ctx = seed([M01, M02]);
    const fresh = await get(asStudent(ctx), M02, C, { "if-none-match": tag });
    expect(fresh.status).toBe(304);
    expect(fresh.jsonBody).toBeUndefined();
    expect(fresh.headers.ETag).toBe(tag);
    ctx.setJson(CLS("cA"), room("cA", [M01]));                                       // the teacher hides m02 later
    expect((await get(asStudent(ctx), M02, C, { "if-none-match": tag })).status).toBe(403);
    expect((await get(asTeacher(), M02, C, { "if-none-match": '"other"' })).status).toBe(200);
  });

  it("unknown or malformed ids are a 404 (never a path outside the data); only GET exists; nothing is written", async () => {
    for (const [c, m] of [[C, "791381-m99"], ["999999", M01], [C, "../../package"], ["..", M01], [C, ""]]) expect((await get(asTeacher(), m, c)).status, c + "/" + m).toBe(404);
    const ctx = seed([M01]);
    expect((await get(asStudent(ctx), "791381-m99")).status).toBe(403);             // not published (and unknown) — refused at the gate
    expect((await handler({ method: "POST", headers: { get: () => null }, params: { courseId: C, moduleId: M01 } }, asTeacher())).status).toBe(405);
    const before = JSON.stringify(ctx.names("").map(n => [n, ctx.getJson(n)]));
    await get(asStudent(ctx), M01);
    expect(JSON.stringify(ctx.names("").map(n => [n, ctx.getJson(n)]))).toBe(before);
  });
});
