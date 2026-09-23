import { describe, it, expect } from "vitest";
import { handler, createWithUniqueCode } from "../src/functions/game-live-session.js";
import { uploadJsonConditional } from "../src/lib/platform-storage.js";
import { sessionDocName } from "../src/lib/live-challenge-session-store.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 4A — TEACHER live-session API through the REAL handler + REAL platform-storage CAS against the in-memory
// container. Proves creation authorization/validation, the server-side immutable snapshot, room-code collision
// protection, ownership on read/close, and the answer-key-free teacher view.

const CHALLENGE = {
  kind: "live-challenge", schemaVersion: 1, savedAt: "2026-01-01T00:00:00.000Z",
  challenge: {
    schemaVersion: 1, challengeId: "c1", title: "تحدّي الشبكات", courseId: "791381",
    questions: [{ source: { kind: "manual" }, question: { examQuestionId: "q1", presentationType: "multipleChoice", prompt: "2+2?", options: ["3", "4"], correctOptionIndex: 1, answer: "4" } }],
  },
};
const user = (id, over = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: "cl1", displayName: "طالب " + id, ...over });
function school(extra = {}) {
  return createMemoryContainer({
    "platform/games/live-challenge/t1/c1.json": CHALLENGE,
    "platform/classes/cl1.json": { classId: "cl1", name: "صف", status: "active", active: true, studentIds: ["s1", "s2"] },
    "platform/users/s1.json": user("s1"),
    "platform/users/s2.json": user("s2"),
    ...extra,
  });
}
const teacherDeps = (ctx, sub = "t1") => ({ requireBuilderAuth: () => ({ ok: true, user: { sub } }), container: ctx.container });
const req = (action, body) => ({ method: "POST", params: { action }, json: async () => body });
const create = (ctx, body, sub = "t1") => handler(req("create", body), teacherDeps(ctx, sub));

describe("teacher create — authorization & validation", () => {
  it("requires teacher auth", async () => {
    const ctx = school();
    const r = await handler(req("create", {}), { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }), container: ctx.container });
    expect(r.status).toBe(401);
  });
  it("missing challenge → 404", async () => {
    const r = await create(school(), { challengeId: "nope", classId: "cl1", studentIds: ["s1"] });
    expect(r.status).toBe(404);
  });
  it("another teacher's challenge is inaccessible (owned by path prefix) → 404", async () => {
    // The saved challenge lives under t1; teacher t2 cannot start a session from it.
    const r = await create(school(), { challengeId: "c1", classId: "cl1", studentIds: ["s1"] }, "t2");
    expect(r.status).toBe(404);
  });
  it("archived / nonexistent class → rejected", async () => {
    const archived = school({ "platform/classes/cl1.json": { classId: "cl1", status: "archived", active: false } });
    expect((await create(archived, { challengeId: "c1", classId: "cl1", studentIds: ["s1"] })).status).toBe(400);
    const noClass = school({ "platform/classes/cl1.json": undefined });
    // (seed value undefined still creates a key; use a genuinely absent class id instead)
    expect((await create(school(), { challengeId: "c1", classId: "ghost", studentIds: ["s1"] })).status).toBe(400);
  });
  it("empty student selection → 400", async () => {
    expect((await create(school(), { challengeId: "c1", classId: "cl1", studentIds: [] })).status).toBe(400);
    expect((await create(school(), { challengeId: "c1", classId: "cl1" })).status).toBe(400);
  });
  it("duplicate ids are normalized to distinct participants", async () => {
    const r = await create(school(), { challengeId: "c1", classId: "cl1", studentIds: ["s1", "s1", "s2"] });
    expect(r.status).toBe(200);
    expect(r.jsonBody.session.participants.map(p => p.studentId)).toEqual(["s1", "s2"]);
  });
  it("a student outside the class / archived / inactive → explicit 400 (never silently dropped)", async () => {
    const outside = school({ "platform/users/s3.json": user("s3", { classId: "other" }) });
    expect((await create(outside, { challengeId: "c1", classId: "cl1", studentIds: ["s1", "s3"] })).status).toBe(400);
    const archivedStu = school({ "platform/users/s2.json": user("s2", { archived: true }) });
    expect((await create(archivedStu, { challengeId: "c1", classId: "cl1", studentIds: ["s1", "s2"] })).status).toBe(400);
    const inactive = school({ "platform/users/s2.json": user("s2", { active: false }) });
    expect((await create(inactive, { challengeId: "c1", classId: "cl1", studentIds: ["s1", "s2"] })).status).toBe(400);
    const unknown = school();
    expect((await create(unknown, { challengeId: "c1", classId: "cl1", studentIds: ["s1", "ghost"] })).status).toBe(400);
  });
  it("valid create returns a lobby with a room code and NO answer keys in the teacher view", async () => {
    const ctx = school();
    const r = await create(ctx, { challengeId: "c1", classId: "cl1", studentIds: ["s1", "s2"] });
    expect(r.status).toBe(200);
    const s = r.jsonBody.session;
    expect(s.status).toBe("lobby");
    expect(s.joinCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(s.challengeTitle).toBe("تحدّي الشبكات");
    expect(s.counts).toEqual({ total: 2, joined: 0, ready: 0 });
    expect(JSON.stringify(r.jsonBody)).not.toContain("challengeSnapshot");
    expect(JSON.stringify(r.jsonBody)).not.toContain("correctOptionIndex");
    // the session blob DID persist the snapshot server-side (answer key retained for later phases)
    const stored = ctx.getJson(sessionDocName(s.joinCode));
    expect(stored.challengeSnapshot.questions[0].question.answer).toBe("4");
  });
});

describe("server-side snapshot is immutable", () => {
  it("editing the saved challenge AFTER create does not change the live session snapshot", async () => {
    const ctx = school();
    const r = await create(ctx, { challengeId: "c1", classId: "cl1", studentIds: ["s1"] });
    const code = r.jsonBody.session.joinCode;
    // Teacher later edits the saved challenge (new title + different answer).
    ctx.setJson("platform/games/live-challenge/t1/c1.json", { ...CHALLENGE, challenge: { ...CHALLENGE.challenge, title: "عنوان مختلف", questions: [{ source: { kind: "manual" }, question: { examQuestionId: "q1", presentationType: "multipleChoice", prompt: "2+2?", options: ["3", "4"], correctOptionIndex: 0, answer: "3" } }] } });
    const stored = ctx.getJson(sessionDocName(code));
    expect(stored.challengeTitle).toBe("تحدّي الشبكات");                      // original title
    expect(stored.challengeSnapshot.questions[0].question.answer).toBe("4");  // original answer key
  });
});

describe("room-code collision protection", () => {
  it("a colliding generated code never overwrites an existing session — a fresh code is used", async () => {
    // Pre-seed a DIFFERENT teacher's session at code AAAAAA; the generator yields AAAAAA first (collision), then BBBBBB.
    const ctx = school({ [sessionDocName("AAAAAA")]: { kind: "live-challenge-session", sessionId: "AAAAAA", joinCode: "AAAAAA", teacherId: "other", status: "lobby", participants: [] } });
    const seq = ["AAAAAA", "BBBBBB"]; let i = 0;
    const doc = await createWithUniqueCode(ctx.container, code => ({ kind: "live-challenge-session", joinCode: code, teacherId: "t1", participants: [] }), uploadJsonConditional, () => seq[i++]);
    expect(doc.joinCode).toBe("BBBBBB");
    expect(ctx.getJson(sessionDocName("AAAAAA")).teacherId).toBe("other");   // untouched
    expect(ctx.getJson(sessionDocName("BBBBBB")).teacherId).toBe("t1");
  });
});

describe("teacher get / close — ownership", () => {
  it("owner reads the lobby; another teacher gets 404 (no existence leak); close is idempotent lobby→closed", async () => {
    const ctx = school();
    const code = (await create(ctx, { challengeId: "c1", classId: "cl1", studentIds: ["s1"] })).jsonBody.session.joinCode;
    expect((await handler(req("get", { joinCode: code }), teacherDeps(ctx, "t1"))).status).toBe(200);
    expect((await handler(req("get", { joinCode: code }), teacherDeps(ctx, "t2"))).status).toBe(404);   // not owned
    expect((await handler(req("close", { joinCode: code }), teacherDeps(ctx, "t2"))).status).toBe(404); // cannot close another's
    const closed = await handler(req("close", { joinCode: code }), teacherDeps(ctx, "t1"));
    expect(closed.status).toBe(200);
    expect(closed.jsonBody.session.status).toBe("closed");
    const again = await handler(req("close", { joinCode: code }), teacherDeps(ctx, "t1"));
    expect(again.jsonBody.session.status).toBe("closed");   // idempotent
    expect(ctx.getJson(sessionDocName(code)).participants).toHaveLength(1);   // never deletes the blob
  });
});
