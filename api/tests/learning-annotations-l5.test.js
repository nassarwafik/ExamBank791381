import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { handler } from "../src/functions/learning-annotations.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { loadPageIndex } from "../src/lib/learning-progress.js";
import { annotationsDocName, applyAnnotation, annotationsView, normalizeAnnotationsDoc, LIMITS } from "../src/lib/learning-annotations.js";

// Phase L.5 — a student's PRIVATE reading annotations (bookmarks, one note per page, highlights), over the REAL page index and
// the in-memory container: page authority (the page must exist in the book and its own module must be published to the
// PERSISTED class), bounded documents, idempotent writes (a change that alters nothing writes nothing), the view filtered to
// what the class sees NOW, privacy (one document per student, nobody else's is read or written) and the auth / lifecycle gates.

const INDEX = loadPageIndex("791381");
const C = "791381", M01 = "791381-m01", M02 = "791381-m02";
const P = (m, i) => INDEX.modules[m][i];
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1", ...extra });
const room = (id, visible, extra = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], learningMaterials: visible === null ? [] : [{ courseId: C, visibleModuleIds: visible }], ...extra });
let seq = 0;
const deps = (ctx, id = "u1", extra = {}) => ({ requireStudentAuth: () => ({ ok: true, user: { sub: id, sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container, now: () => "2026-10-17T10:00:00.000Z", newId: () => "h" + (++seq), ...extra });
const get = (d, courseId = C) => handler({ method: "GET", url: "https://x", headers: { get: () => null }, params: { courseId } }, d);
const post = (d, action, body, courseId = C) => handler({ method: "POST", url: "https://x", headers: { get: () => null }, params: { courseId, action }, json: async () => body }, d);
const seed = (visible = [M01, M02], extra = {}) => createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [USR("u2")]: student("u2", "cA"), [CLS("cA")]: room("cA", visible), ...extra });
const NOW = "2026-10-17T10:00:00.000Z";

describe("the annotations document (pure)", () => {
  it("bookmark: added once (its time never moves), removed, and a repeat changes nothing", () => {
    let r = applyAnnotation(null, { courseId: C, pageId: P(M01, 0), change: { kind: "bookmark", on: true } }, NOW);
    expect(r.changed).toBe(true);
    const again = applyAnnotation(r.doc, { courseId: C, pageId: P(M01, 0), change: { kind: "bookmark", on: true } }, "2026-10-18T00:00:00.000Z");
    expect(again.changed).toBe(false);
    expect(again.doc.courses[C].bookmarks[P(M01, 0)]).toBe(NOW);
    r = applyAnnotation(r.doc, { courseId: C, pageId: P(M01, 0), change: { kind: "bookmark", on: false } }, NOW);
    expect(r.changed).toBe(true);
    expect(r.doc.courses[C].bookmarks).toEqual({});
    expect(applyAnnotation(r.doc, { courseId: C, pageId: P(M01, 0), change: { kind: "bookmark", on: "yes" } }, NOW).error).toBe("invalid");
  });

  it("note: set, unchanged text changes nothing, empty text removes it, over NOTE_MAX is a limit; line breaks kept", () => {
    let r = applyAnnotation(null, { courseId: C, pageId: P(M01, 0), change: { kind: "note", text: "  سطر أول\r\nسطر ثانٍ\u0007  " } }, NOW);
    expect(r.doc.courses[C].notes[P(M01, 0)]).toEqual({ text: "سطر أول\nسطر ثانٍ", updatedAt: NOW });
    expect(applyAnnotation(r.doc, { courseId: C, pageId: P(M01, 0), change: { kind: "note", text: "سطر أول\nسطر ثانٍ" } }, NOW).changed).toBe(false);
    expect(applyAnnotation(r.doc, { courseId: C, pageId: P(M01, 0), change: { kind: "note", text: "x".repeat(LIMITS.NOTE_MAX + 1) } }, NOW).error).toBe("limit");
    expect(applyAnnotation(r.doc, { courseId: C, pageId: P(M01, 0), change: { kind: "note", text: "x".repeat(LIMITS.NOTE_MAX) } }, NOW).changed).toBe(true);
    r = applyAnnotation(r.doc, { courseId: C, pageId: P(M01, 0), change: { kind: "note", text: "   " } }, NOW);
    expect(r.changed).toBe(true);
    expect(r.doc.courses[C].notes).toEqual({});
    expect(applyAnnotation(r.doc, { courseId: C, pageId: P(M01, 0), change: { kind: "note", text: "" } }, NOW).changed).toBe(false);
  });

  it("highlight: whitespace collapsed, the same quote kept once, bounded per page and per course; removal by id", () => {
    let r = applyAnnotation(null, { courseId: C, pageId: P(M01, 0), change: { kind: "highlight-add", id: "a1", quote: "  الشبكة\n  مجموعة  " } }, NOW);
    expect(r.doc.courses[C].highlights[P(M01, 0)]).toEqual([{ id: "a1", quote: "الشبكة مجموعة", createdAt: NOW }]);
    expect(applyAnnotation(r.doc, { courseId: C, pageId: P(M01, 0), change: { kind: "highlight-add", id: "a2", quote: "الشبكة مجموعة" } }, NOW).changed).toBe(false);
    for (const q of ["x", "y".repeat(LIMITS.QUOTE_MAX + 1)]) expect(applyAnnotation(r.doc, { courseId: C, pageId: P(M01, 0), change: { kind: "highlight-add", id: "a3", quote: q } }, NOW).error).toBe("invalid");
    let d = r.doc;
    for (let i = 1; i < LIMITS.HIGHLIGHTS_PER_PAGE; i++) d = applyAnnotation(d, { courseId: C, pageId: P(M01, 0), change: { kind: "highlight-add", id: "b" + i, quote: "مقطع " + i } }, NOW).doc;
    expect(d.courses[C].highlights[P(M01, 0)]).toHaveLength(LIMITS.HIGHLIGHTS_PER_PAGE);
    expect(applyAnnotation(d, { courseId: C, pageId: P(M01, 0), change: { kind: "highlight-add", id: "zz", quote: "مقطع زائد" } }, NOW).error).toBe("limit");
    // the course-wide bound: HIGHLIGHTS_PER_COURSE across pages
    let wide = null; let n = 0;
    for (const pageId of Object.values(INDEX.modules).flat()) {
      for (let i = 0; i < LIMITS.HIGHLIGHTS_PER_PAGE && n < LIMITS.HIGHLIGHTS_PER_COURSE; i++, n++) wide = applyAnnotation(wide, { courseId: C, pageId, change: { kind: "highlight-add", id: "w" + n, quote: "مقطع " + n } }, NOW).doc;
      if (n >= LIMITS.HIGHLIGHTS_PER_COURSE) break;
    }
    const last = Object.values(INDEX.modules).flat().at(-1);
    expect(applyAnnotation(wide, { courseId: C, pageId: last, change: { kind: "highlight-add", id: "over", quote: "مقطع آخر" } }, NOW).error).toBe("limit");
    r = applyAnnotation(r.doc, { courseId: C, pageId: P(M01, 0), change: { kind: "highlight-remove", id: "a1" } }, NOW);
    expect(r.changed).toBe(true);
    expect(r.doc.courses[C].highlights).toEqual({});
    expect(applyAnnotation(r.doc, { courseId: C, pageId: P(M01, 0), change: { kind: "highlight-remove", id: "a1" } }, NOW).changed).toBe(false);
    expect(applyAnnotation(r.doc, { courseId: C, pageId: P(M01, 0), change: { kind: "erase-all" } }, NOW).error).toBe("invalid");
  });

  it("a malformed stored document is cleaned field by field; the view is in reading order and only over what the class sees", () => {
    const raw = { courses: {
      [C]: {
        bookmarks: { [P(M02, 0)]: NOW, [P(M01, 1)]: NOW, "../x": NOW, [P(M01, 2)]: "not a date" },
        notes: { [P(M01, 0)]: { text: "ok", updatedAt: NOW }, [P(M01, 1)]: { text: "x".repeat(LIMITS.NOTE_MAX + 1), updatedAt: NOW }, [P(M01, 2)]: "bad" },
        highlights: { [P(M01, 0)]: [{ id: "a", quote: "مقطع", createdAt: NOW }, { id: "a", quote: "مكرر", createdAt: NOW }, { id: "../", quote: "سيئ", createdAt: NOW }], [P(M02, 1)]: "bad" },
      },
      "../evil": { bookmarks: {} },
    } };
    const n = normalizeAnnotationsDoc(raw);
    expect(Object.keys(n.courses)).toEqual([C]);
    expect(Object.keys(n.courses[C].bookmarks)).toEqual([P(M02, 0), P(M01, 1)]);
    expect(Object.keys(n.courses[C].notes)).toEqual([P(M01, 0)]);
    expect(n.courses[C].highlights).toEqual({ [P(M01, 0)]: [{ id: "a", quote: "مقطع", createdAt: NOW }] });
    const all = annotationsView(raw, C, INDEX, () => true);
    expect(all.bookmarks.map(b => b.pageId)).toEqual([P(M01, 1), P(M02, 0)]);                  // reading order, not insertion order
    const onlyM01 = annotationsView(raw, C, INDEX, m => m === M01);
    expect(onlyM01.bookmarks.map(b => b.pageId)).toEqual([P(M01, 1)]);
    expect(onlyM01.notes).toEqual([{ pageId: P(M01, 0), text: "ok", updatedAt: NOW }]);
    expect(onlyM01.highlights).toEqual([{ pageId: P(M01, 0), id: "a", quote: "مقطع", createdAt: NOW }]);
  });
});

describe("GET / POST /api/learning-annotations/{courseId}", () => {
  it("bookmark, note and highlight round-trip through the persisted document; GET returns them", async () => {
    const ctx = seed();
    expect((await get(deps(ctx))).jsonBody).toMatchObject({ ok: true, bookmarks: [], notes: [], highlights: [] });
    expect((await post(deps(ctx), "bookmark", { pageId: P(M01, 0), on: true })).jsonBody.bookmarks).toEqual([{ pageId: P(M01, 0), at: NOW }]);
    expect((await post(deps(ctx), "note", { pageId: P(M01, 0), text: "راجع هذا" })).jsonBody.notes).toEqual([{ pageId: P(M01, 0), text: "راجع هذا", updatedAt: NOW }]);
    const h = await post(deps(ctx, "u1", { newId: () => "hx1" }), "highlight", { pageId: P(M02, 0), quote: "مقطع مهم" });
    expect(h.status).toBe(200);
    expect(h.jsonBody.highlights).toEqual([{ pageId: P(M02, 0), id: "hx1", quote: "مقطع مهم", createdAt: NOW }]);
    const all = (await get(deps(ctx))).jsonBody;
    expect(all.bookmarks).toHaveLength(1); expect(all.notes).toHaveLength(1); expect(all.highlights).toHaveLength(1);
    const un = await post(deps(ctx), "unhighlight", { pageId: P(M02, 0), id: "hx1" });
    expect(un.jsonBody.highlights).toEqual([]);
    expect(ctx.getJson(annotationsDocName("u1")).courses[C].highlights).toEqual({});
  });

  it("a change that alters nothing writes nothing", async () => {
    const ctx = seed();
    let writes = 0;
    const counting = deps(ctx, "u1", { mutateJsonWithRetry: async (c, name, fn) => { writes++; const { mutateJsonWithRetry } = await import("../src/lib/platform-storage.js"); return mutateJsonWithRetry(c, name, fn); } });
    await post(counting, "bookmark", { pageId: P(M01, 0), on: true });
    const again = await post(counting, "bookmark", { pageId: P(M01, 0), on: true });
    expect(again.jsonBody.persisted).toBe(false);
    await post(counting, "note", { pageId: P(M01, 0), text: "" });                               // no note to remove
    await post(counting, "unhighlight", { pageId: P(M01, 0), id: "nope" });
    expect(writes).toBe(1);
  });

  it("refuses an invented page, a page of a hidden unit, a malformed body, an over-limit note; writes nothing for any of them", async () => {
    const ctx = seed([M01]);
    const before = JSON.stringify(ctx.names("").map(n => [n, ctx.getJson(n)]));
    expect((await post(deps(ctx), "bookmark", { pageId: "791381-m99-l01-p01", on: true })).status).toBe(400);
    expect((await post(deps(ctx), "bookmark", { pageId: P(M02, 0), on: true })).status).toBe(403);
    expect((await post(deps(ctx), "bookmark", { pageId: P(M01, 0) })).status).toBe(400);
    expect((await post(deps(ctx), "bookmark", { on: true })).status).toBe(400);
    expect((await post(deps(ctx), "note", { pageId: P(M01, 0), text: "x".repeat(LIMITS.NOTE_MAX + 1) })).status).toBe(413);
    expect((await post(deps(ctx), "highlight", { pageId: P(M01, 0), quote: "x" })).status).toBe(400);
    expect(JSON.stringify(ctx.names("").map(n => [n, ctx.getJson(n)]))).toBe(before);
  });

  it("gates: unauthenticated, archived class, course not attached, unknown course; the PERSISTED class decides", async () => {
    const ctx = seed([M01]);
    expect((await handler({ method: "GET", headers: { get: () => null }, params: { courseId: C } }, { requireStudentAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }), container: ctx.container })).status).toBe(401);
    expect((await get(deps(ctx), "999999")).status).toBe(404);
    ctx.setJson(CLS("cA"), room("cA", null));
    expect((await get(deps(ctx))).status).toBe(403);
    ctx.setJson(CLS("cA"), room("cA", [M01], { status: "archived", active: false }));
    expect((await post(deps(ctx), "bookmark", { pageId: P(M01, 0), on: true })).status).toBe(403);
    expect(ctx.has(annotationsDocName("u1"))).toBe(false);
  });

  it("a unit hidden after annotating disappears from the view and comes back when re-published (nothing is deleted)", async () => {
    const ctx = seed([M01, M02]);
    await post(deps(ctx), "note", { pageId: P(M02, 0), text: "ملاحظة" });
    ctx.setJson(CLS("cA"), room("cA", [M01]));
    expect((await get(deps(ctx))).jsonBody.notes).toEqual([]);
    ctx.setJson(CLS("cA"), room("cA", [M01, M02]));
    expect((await get(deps(ctx))).jsonBody.notes).toEqual([{ pageId: P(M02, 0), text: "ملاحظة", updatedAt: NOW }]);
  });

  it("private: each student has their own document; nobody else's is read or written; nothing else is touched", async () => {
    const ctx = seed([M01]);
    await post(deps(ctx, "u1"), "note", { pageId: P(M01, 0), text: "سرّي" });
    expect((await get(deps(ctx, "u2"))).jsonBody.notes).toEqual([]);
    const names = ctx.names("platform/");
    expect(names.filter(n => !n.startsWith("platform/users/") && !n.startsWith("platform/classes/"))).toEqual([annotationsDocName("u1")]);
  });

  it("a persistent CAS conflict is a retryable 503, never a partial write; a bound reached meanwhile is a 413", async () => {
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", [M01]), [annotationsDocName("u1")]: { schemaVersion: 1, courses: {} } },
      { beforeConditionalUpload: (name, api) => { if (name === annotationsDocName("u1")) api.setJson(name, api.getJson(name)); } });
    const r = await post(deps(ctx), "bookmark", { pageId: P(M01, 0), on: true });
    expect(r.status).toBe(503);
    expect(ctx.getJson(annotationsDocName("u1"))).toEqual({ schemaVersion: 1, courses: {} });
    // Another device filled the page's highlights between the probe and the write: the write keeps the document as it is.
    const full = { schemaVersion: 1, courses: { [C]: { bookmarks: {}, notes: {}, highlights: { [P(M01, 0)]: Array.from({ length: LIMITS.HIGHLIGHTS_PER_PAGE }, (_, i) => ({ id: "f" + i, quote: "مقطع " + i, createdAt: NOW })) } } } };
    const race = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", [M01]) });
    const d = deps(race, "u1", { downloadJsonOrNull: async (c, name) => (name === annotationsDocName("u1") ? null : race.getJson(name)),
      mutateJsonWithRetry: async (c, name, fn) => { const next = await fn(full); race.setJson(name, next); return next; } });
    const capped = await post(d, "highlight", { pageId: P(M01, 0), quote: "مقطع جديد" });
    expect(capped.status).toBe(413);
    expect(race.getJson(annotationsDocName("u1")).courses[C].highlights[P(M01, 0)]).toHaveLength(LIMITS.HIGHLIGHTS_PER_PAGE);
  });

  it("only GET and the four POST actions exist", async () => {
    const ctx = seed([M01]);
    expect((await handler({ method: "DELETE", url: "https://x", headers: { get: () => null }, params: { courseId: C } }, deps(ctx))).status).toBe(405);
    expect((await post(deps(ctx), "export", { pageId: P(M01, 0) })).status).toBe(405);
    expect((await handler({ method: "POST", url: "https://x", headers: { get: () => null }, params: { courseId: C } }, deps(ctx))).status).toBe(405);
  });
});

describe("privacy by construction (D3)", () => {
  it("only the student's own annotations route reads the annotations store; no other endpoint or library touches it", () => {
    const fnDir = path.join(__dirname, "../src/functions"), libDir = path.join(__dirname, "../src/lib");
    const users = [...readdirSync(fnDir).map(f => ["functions/" + f, path.join(fnDir, f)]), ...readdirSync(libDir).map(f => ["lib/" + f, path.join(libDir, f)])]
      .filter(([, full]) => full.endsWith(".js"))
      .filter(([, full]) => /learning-annotations|platform\/learning-annotations/.test(readFileSync(full, "utf8")))
      .map(([name]) => name).sort();
    expect(users).toEqual(["functions/learning-annotations.js", "lib/learning-annotations.js"]);
    expect(readFileSync(path.join(fnDir, "learning-annotations.js"), "utf8")).toContain("requireActiveStudentSession");
    expect(readFileSync(path.join(fnDir, "learning-annotations.js"), "utf8")).not.toContain("requireBuilderAuth");
  });
});
