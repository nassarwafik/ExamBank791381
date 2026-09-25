import { describe, it, expect } from "vitest";
import { handler as teacherFeed } from "../src/functions/teacher-achievement-feed.js";
import { feedBlobName } from "../src/lib/achievement-feed.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// The Teacher Dashboard's «إنجازات الطلاب الأخيرة» follows the dashboard scope: no scope (every class), ?classId
// (that class), ?classId&studentId (that student inside that class, AND on the posts' STORED classId/studentId). The
// scope is applied on the server BEFORE the newest-first MAX_POSTS slice, so a class's older achievements are never
// crowded out by newer posts of other classes.

const MAX_POSTS = 50;
const user = (id, classId, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, classId, displayName: "طالب " + id, ...extra });
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "11", active: true, status: "active", ...extra });
const at = minute => new Date(Date.UTC(2026, 8, 1, 8, minute)).toISOString();
const post = (classId, studentId, key, createdAt) => ({
  schemaVersion: 2, eventType: "medal", postId: key + "_" + studentId, classId, studentId, studentDisplayName: "طالب " + studentId,
  assignmentId: key, assignmentTitle: "واجب " + key, tier: "gold", medal: { tier: "gold", assignmentId: key, assignmentTitle: "واجب " + key },
  shareWithClass: true, createdAt, reactions: {}, teacherReaction: null, teacherNote: ""
});
const put = (seed, p) => { seed[feedBlobName(p.classId, p.postId)] = p; };

/** Classes A, B and H (A1's previous, now archived class). A1 moved H → A and keeps a historical post in H. */
function school(extra = {}) {
  const seed = {
    "platform/classes/A.json": room("A"),
    "platform/classes/B.json": room("B"),
    "platform/classes/H.json": room("H", { active: false, status: "archived" }),
    "platform/users/A1.json": user("A1", "A"),
    "platform/users/A2.json": user("A2", "A"),
    "platform/users/B1.json": user("B1", "B"),
    "platform/users/GONE.json": user("GONE", "A", { archived: true })
  };
  put(seed, post("A", "A1", "a1x", at(1)));
  put(seed, post("A", "A1", "a1y", at(4)));
  put(seed, post("A", "A2", "a2x", at(2)));
  put(seed, post("B", "B1", "b1x", at(3)));
  put(seed, post("H", "A1", "old", at(0)));          // the SAME student, an earlier class
  return createMemoryContainer({ ...seed, ...extra });
}
const deps = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container });
const get = (ctx, query = "") => teacherFeed({ method: "GET", url: "https://x/api/teacher-achievement-feed" + query }, deps(ctx));
const ids = r => r.jsonBody.posts.map(p => p.postId);
const react = (ctx, classId, postId, reaction) => teacherFeed({ method: "POST", url: "https://x/api/teacher-achievement-feed", json: async () => ({ action: "react", classId, postId, reaction }) }, deps(ctx));
const note = (ctx, classId, postId, text) => teacherFeed({ method: "POST", url: "https://x/api/teacher-achievement-feed", json: async () => ({ action: "setNote", classId, postId, note: text }) }, deps(ctx));

describe("GET scope", () => {
  it("1. no params → every class, newest first (unchanged behavior)", async () => {
    const r = await get(school());
    expect(r.status).toBe(200);
    expect(ids(r)).toEqual(["a1y_A1", "b1x_B1", "a2x_A2", "a1x_A1", "old_A1"]);
    expect(r.jsonBody.posts.find(p => p.postId === "b1x_B1")).toMatchObject({ classId: "B", className: "صف B" });
  });

  it("2. ?classId=A → only class A (A1 + A2); never B, never A1's post from another class", async () => {
    const r = await get(school(), "?classId=A");
    expect(r.status).toBe(200);
    expect(ids(r)).toEqual(["a1y_A1", "a2x_A2", "a1x_A1"]);
    expect(r.jsonBody.posts.every(p => p.classId === "A" && p.className === "صف A")).toBe(true);
  });

  it("3. ?classId=A&studentId=A1 → A1's posts in A only (not A2, not A1's historical post in H)", async () => {
    const r = await get(school(), "?classId=A&studentId=A1");
    expect(ids(r)).toEqual(["a1y_A1", "a1x_A1"]);
  });

  it("4. ?classId=A&studentId=A2 → A2 only (no A1)", async () => {
    expect(ids(await get(school(), "?classId=A&studentId=A2"))).toEqual(["a2x_A2"]);
  });

  it("5. ?classId=B → class B only (no class A)", async () => {
    expect(ids(await get(school(), "?classId=B"))).toEqual(["b1x_B1"]);
  });

  it("a class with no achievements → an empty list (never another scope as a fallback)", async () => {
    const ctx = school({ "platform/classes/E.json": room("E"), "platform/users/E1.json": user("E1", "E") });
    expect((await get(ctx, "?classId=E")).jsonBody.posts).toEqual([]);
    expect((await get(ctx, "?classId=E&studentId=E1")).jsonBody.posts).toEqual([]);
  });

  it("the scoped projection is the same public shape as the unscoped one (no studentId added)", async () => {
    const ctx = school();
    const all = (await get(ctx)).jsonBody.posts.find(p => p.postId === "a2x_A2");
    const scoped = (await get(ctx, "?classId=A&studentId=A2")).jsonBody.posts[0];
    expect(scoped).toEqual(all);
    expect(scoped).not.toHaveProperty("studentId");
  });
});

describe("6. the scope is applied BEFORE the MAX_POSTS slice", () => {
  it("an older class-A post outside the newest 50 overall is still returned for ?classId=A", async () => {
    const extra = {};
    for (let i = 0; i < MAX_POSTS + 10; i++) put(extra, post("B", "B1", "n" + i, new Date(Date.UTC(2026, 8, 2, 8, 0, i)).toISOString()));   // all newer
    const ctx = school(extra);
    const global = await get(ctx);
    expect(global.jsonBody.posts).toHaveLength(MAX_POSTS);
    expect(ids(global)).not.toContain("a1x_A1");                              // crowded out of the global newest 50
    const scoped = await get(ctx, "?classId=A");
    expect(ids(scoped)).toEqual(["a1y_A1", "a2x_A2", "a1x_A1"]);
    expect(ids(await get(ctx, "?classId=A&studentId=A1"))).toEqual(["a1y_A1", "a1x_A1"]);
    const b = await get(ctx, "?classId=B");
    expect(b.jsonBody.posts).toHaveLength(MAX_POSTS);                          // the cap still applies inside a scope
    expect(b.jsonBody.posts.every(p => p.classId === "B")).toBe(true);
  });
});

describe("7. validation", () => {
  it("malformed ids → 400; studentId without classId → 400", async () => {
    const ctx = school();
    for (const q of ["?classId=" + encodeURIComponent("../users"), "?classId=" + encodeURIComponent("A/B"), "?classId=%25", "?classId=" + "x".repeat(129),
      "?classId=A&studentId=" + encodeURIComponent("../x"), "?classId=A&studentId=" + encodeURIComponent("A1 ;"), "?studentId=A1"]) {
      const r = await get(ctx, q);
      expect(r.status, q).toBe(400);
      expect(r.jsonBody.ok).toBe(false);
    }
  });
  it("unknown class → 404; a student who is not currently in that class (or archived) → 404", async () => {
    const ctx = school();
    expect((await get(ctx, "?classId=NOPE")).status).toBe(404);
    expect((await get(ctx, "?classId=A&studentId=B1")).status).toBe(404);    // B1 belongs to B
    expect((await get(ctx, "?classId=H&studentId=A1")).status).toBe(404);    // A1 moved away from H
    expect((await get(ctx, "?classId=A&studentId=GONE")).status).toBe(404);  // archived student
    expect((await get(ctx, "?classId=A&studentId=NOBODY")).status).toBe(404);
  });
  it("an archived class can still be viewed on purpose (historical posts stay readable)", async () => {
    expect(ids(await get(school(), "?classId=H"))).toEqual(["old_A1"]);
  });
  it("no auth → 401 before any scope handling", async () => {
    const ctx = school();
    const r = await teacherFeed({ method: "GET", url: "https://x/api/teacher-achievement-feed?classId=A" }, { ...deps(ctx), requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }) });
    expect(r.status).toBe(401);
  });
});

describe("8. reactions and notes keep working with scoped reads", () => {
  it("react / setNote on a class-A post are reflected in the scoped view and nowhere else", async () => {
    const ctx = school();
    expect((await react(ctx, "A", "a2x_A2", "clap")).jsonBody).toEqual({ ok: true, teacherReaction: "clap" });
    expect((await note(ctx, "A", "a2x_A2", "أحسنت")).jsonBody).toEqual({ ok: true, teacherNote: "أحسنت" });
    const scoped = (await get(ctx, "?classId=A&studentId=A2")).jsonBody.posts[0];
    expect(scoped).toMatchObject({ postId: "a2x_A2", teacherReaction: "clap", teacherNote: "أحسنت" });
    expect((await get(ctx, "?classId=B")).jsonBody.posts[0]).toMatchObject({ teacherReaction: null, teacherNote: "" });
    expect((await react(ctx, "A", "a2x_A2", "clap")).jsonBody.teacherReaction).toBeNull();   // toggle off, as before
    expect((await react(ctx, "A", "missing_A2", "clap")).status).toBe(404);
  });
});
