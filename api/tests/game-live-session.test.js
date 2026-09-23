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

describe("teacher close — zero write on unknown / foreign rooms (Fix 1)", () => {
  // A: an UNKNOWN room must 404 with NO blob write — the CAS callback throws NoCloseTarget instead of returning a
  // placeholder object, so mutateJsonWithRetry never create-writes an empty {} blob for a nonexistent room.
  // This test IS the mutation guard: restoring `return current || {}` would materialize the blob and fail the
  // `ctx.has(name)` assertion below (the status would still read 404, so only the zero-write check catches it).
  it("A — closing an UNKNOWN room returns 404 and creates NO blob", async () => {
    const ctx = school();
    const name = sessionDocName("ZZZZZZ");
    expect(ctx.has(name)).toBe(false);
    const r = await handler(req("close", { joinCode: "ZZZZZZ" }), teacherDeps(ctx, "t1"));
    expect(r.status).toBe(404);
    expect(ctx.has(name)).toBe(false);                       // no empty placeholder blob was materialized
  });

  // B: a FOREIGN teacher's room must 404 and stay BYTE-identical (zero write) — the callback throws before any upload,
  // so neither the blob's content nor its ETag changes and the real owner's room is untouched.
  it("B — closing ANOTHER teacher's room returns 404 and leaves it byte-identical (zero write)", async () => {
    const ctx = school();
    const code = (await create(ctx, { challengeId: "c1", classId: "cl1", studentIds: ["s1"] })).jsonBody.session.joinCode;
    const name = sessionDocName(code);
    const before = ctx.store.get(name);
    const beforeEtag = before.etag, beforeContent = before.content.toString("utf8");
    const r = await handler(req("close", { joinCode: code }), teacherDeps(ctx, "t2"));   // t2 is not the owner
    expect(r.status).toBe(404);
    const after = ctx.store.get(name);
    expect(after.etag).toBe(beforeEtag);                     // ETag unchanged → no write occurred at all
    expect(after.content.toString("utf8")).toBe(beforeContent);
    expect(ctx.getJson(name).status).toBe("lobby");          // still open for its real owner
  });

  // C: the OWNER closes normally (lobby → closed) with history/participants preserved.
  it("C — the OWNER can close (lobby → closed), participants preserved", async () => {
    const ctx = school();
    const code = (await create(ctx, { challengeId: "c1", classId: "cl1", studentIds: ["s1", "s2"] })).jsonBody.session.joinCode;
    const r = await handler(req("close", { joinCode: code }), teacherDeps(ctx, "t1"));
    expect(r.status).toBe(200);
    expect(r.jsonBody.session.status).toBe("closed");
    expect(ctx.getJson(sessionDocName(code)).participants).toHaveLength(2);   // history preserved (never deleted)
  });

  // D: a repeat owner close is idempotent — still closed, still exactly one blob.
  it("D — a repeat owner close is idempotent (stays closed)", async () => {
    const ctx = school();
    const code = (await create(ctx, { challengeId: "c1", classId: "cl1", studentIds: ["s1"] })).jsonBody.session.joinCode;
    expect((await handler(req("close", { joinCode: code }), teacherDeps(ctx, "t1"))).jsonBody.session.status).toBe("closed");
    const again = await handler(req("close", { joinCode: code }), teacherDeps(ctx, "t1"));
    expect(again.status).toBe(200);
    expect(again.jsonBody.session.status).toBe("closed");
    expect(ctx.has(sessionDocName(code))).toBe(true);
  });
});

// ── Phase 4B — teacher round controls (start / next / finish) ───────────────────────────────────────────────────
const CHALLENGE2 = {
  kind: "live-challenge", schemaVersion: 1, savedAt: "2026-01-01T00:00:00.000Z",
  challenge: {
    schemaVersion: 1, challengeId: "c2", title: "جولة", courseId: "791381",
    questions: [
      { source: { kind: "manual" }, question: { examQuestionId: "q1", presentationType: "multipleChoice", text: "عاصمة؟", options: [{ text: "عمّان" }, { text: "إربد" }], correctOptionIndex: 0, answer: { correctOptionIndex: 0 }, marks: 1, solution: "عمّان" } },
      { source: { kind: "manual" }, question: { examQuestionId: "q2", presentationType: "trueFalse", text: "١+١=٢", marks: 1, answer: { correct: true } } },
    ],
  },
};
const CHALLENGE0 = { kind: "live-challenge", schemaVersion: 1, savedAt: "z", challenge: { schemaVersion: 1, challengeId: "c0", title: "فارغ", courseId: "791381", questions: [] } };
const school2 = (extra = {}) => school({ "platform/games/live-challenge/t1/c2.json": CHALLENGE2, "platform/games/live-challenge/t1/c0.json": CHALLENGE0, ...extra });
const act = (ctx, action, body, sub = "t1") => handler(req(action, body), teacherDeps(ctx, sub));

/** Create a 2-question room and mark `joined` of its participants as having joined (so start is allowed). */
async function makeRoom(ctx, challengeId = "c2", joined = ["s1"]) {
  const code = (await create(ctx, { challengeId, classId: "cl1", studentIds: ["s1", "s2"] })).jsonBody.session.joinCode;
  const doc = ctx.getJson(sessionDocName(code));
  for (const id of joined) { const p = doc.participants.find(x => x.studentId === id); if (p) p.joinedAt = "j"; }
  ctx.setJson(sessionDocName(code), doc);
  return code;
}

describe("teacher start — lobby → active", () => {
  it("owner starts: status active, round 1, current sanitized question, answered 0 / playing", async () => {
    const ctx = school2();
    const code = await makeRoom(ctx);
    const r = await act(ctx, "start", { joinCode: code });
    expect(r.status).toBe(200);
    const s = r.jsonBody.session;
    expect(s.status).toBe("active");
    expect(s.round).toMatchObject({ roundVersion: 1, questionNumber: 1, questionCount: 2, answered: 0, playing: 1 });
    expect(s.round.question.examQuestionId).toBe("q1");
    expect(JSON.stringify(r.jsonBody)).not.toContain("challengeSnapshot");
    expect(JSON.stringify(r.jsonBody)).not.toContain("correctOptionIndex");
    expect(JSON.stringify(r.jsonBody)).not.toContain("solution");
  });
  it("cannot start an empty challenge (400) or a room with zero joined students (400)", async () => {
    const ctx = school2();
    const empty = await makeRoom(ctx, "c0", ["s1"]);
    expect((await act(ctx, "start", { joinCode: empty })).jsonBody.code).toBe("empty-challenge");
    const none = await makeRoom(ctx, "c2", []);          // nobody joined
    const r = await act(ctx, "start", { joinCode: none });
    expect(r.status).toBe(400);
    expect(r.jsonBody.code).toBe("no-participants");
  });
  it("start on a FOREIGN teacher's room → 404 with ZERO write (byte-identical)", async () => {
    const ctx = school2();
    const code = await makeRoom(ctx);
    const name = sessionDocName(code);
    const before = ctx.store.get(name);
    const beforeEtag = before.etag, beforeContent = before.content.toString("utf8");
    const r = await act(ctx, "start", { joinCode: code }, "t2");
    expect(r.status).toBe(404);
    expect(ctx.store.get(name).etag).toBe(beforeEtag);
    expect(ctx.store.get(name).content.toString("utf8")).toBe(beforeContent);
    expect(ctx.getJson(name).status).toBe("lobby");       // still a lobby for its owner
  });
  it("start on an UNKNOWN room → 404, no blob created", async () => {
    const ctx = school2();
    expect(ctx.has(sessionDocName("ZZZZZZ"))).toBe(false);
    expect((await act(ctx, "start", { joinCode: "ZZZZZZ" })).status).toBe(404);
    expect(ctx.has(sessionDocName("ZZZZZZ"))).toBe(false);
  });
});

describe("teacher next / finish — round advance & completion", () => {
  it("next advances the round; a stale roundVersion cannot double-advance (409, no change)", async () => {
    const ctx = school2();
    const code = await makeRoom(ctx);
    await act(ctx, "start", { joinCode: code });
    const r1 = await act(ctx, "next", { joinCode: code, roundVersion: 1 });
    expect(r1.status).toBe(200);
    expect(r1.jsonBody.session.round).toMatchObject({ roundVersion: 2, questionNumber: 2 });
    // a stale teacher tab still on round 1 cannot advance again
    const stale = await act(ctx, "next", { joinCode: code, roundVersion: 1 });
    expect(stale.status).toBe(409);
    expect(stale.jsonBody.code).toBe("stale-round");
    expect(ctx.getJson(sessionDocName(code)).roundVersion).toBe(2);   // unchanged
  });
  it("next past the last question → 409 no-more-questions; a non-integer roundVersion → 400", async () => {
    const ctx = school2();
    const code = await makeRoom(ctx);
    await act(ctx, "start", { joinCode: code });
    await act(ctx, "next", { joinCode: code, roundVersion: 1 });      // now on Q2 (last)
    expect((await act(ctx, "next", { joinCode: code, roundVersion: 2 })).jsonBody.code).toBe("no-more-questions");
    expect((await act(ctx, "next", { joinCode: code, roundVersion: "2" })).status).toBe(400);
  });
  it("finish only on the last question (else 409); close still works from active and finished", async () => {
    const ctx = school2();
    const code = await makeRoom(ctx);
    await act(ctx, "start", { joinCode: code });
    expect((await act(ctx, "finish", { joinCode: code, roundVersion: 1 })).jsonBody.code).toBe("not-last-question");
    await act(ctx, "next", { joinCode: code, roundVersion: 1 });
    const fin = await act(ctx, "finish", { joinCode: code, roundVersion: 2 });
    expect(fin.status).toBe(200);
    expect(fin.jsonBody.session.status).toBe("finished");
    const closed = await act(ctx, "close", { joinCode: code });
    expect(closed.jsonBody.session.status).toBe("closed");            // finished → closed
  });
  it("teacher get returns the active runtime view (sanitized current question, no raw snapshot)", async () => {
    const ctx = school2();
    const code = await makeRoom(ctx);
    await act(ctx, "start", { joinCode: code });
    const g = await act(ctx, "get", { joinCode: code });
    expect(g.status).toBe(200);
    expect(g.jsonBody.session.round.question.examQuestionId).toBe("q1");
    expect(JSON.stringify(g.jsonBody)).not.toContain("challengeSnapshot");
    expect(JSON.stringify(g.jsonBody)).not.toContain("correctOptionIndex");
  });
});

// ── Phase 4C — competition standings in the teacher view (server-derived, active EXCLUDES the current round) ────────
describe("teacher competition standings", () => {
  // Inject an authoritative answer record directly (the student-answer path is proven in its own suite); the teacher
  // view derives standings purely from these stored grades.
  const addAnswer = (ctx, code, sid, questionIndex, grade) => {
    const doc = ctx.getJson(sessionDocName(code));
    const p = doc.participants.find(x => x.studentId === sid);
    p.answers = (p.answers || []).concat([{ roundVersion: questionIndex + 1, questionIndex, response: { kind: "choice", index: 0 }, submittedAt: "t", grade }]);
    ctx.setJson(sessionDocName(code), doc);
  };
  const correct = { score: 1, maxMarks: 1, correct: true, manualReview: false };
  const wrong = { score: 0, maxMarks: 1, correct: false, manualReview: false };

  it("active view EXCLUDES the current round; advancing makes the completed round count; finish counts all", async () => {
    const ctx = school2();
    const code = await makeRoom(ctx, "c2", ["s1", "s2"]);
    await act(ctx, "start", { joinCode: code });                 // Q1 live
    addAnswer(ctx, code, "s1", 0, correct);
    addAnswer(ctx, code, "s2", 0, wrong);
    let s = (await act(ctx, "get", { joinCode: code })).jsonBody.session;
    expect(s.competition.completedRounds).toBe(0);               // Q1 is current → not counted yet
    expect(s.competition.standings).toEqual([]);                 // no artificial ranking before any round completes
    // Advance to Q2 → Q1 completes.
    await act(ctx, "next", { joinCode: code, roundVersion: 1 });
    s = (await act(ctx, "get", { joinCode: code })).jsonBody.session;
    expect(s.competition.completedRounds).toBe(1);
    expect(s.competition.standings[0]).toMatchObject({ studentId: "s1", displayName: "طالب s1", points: 1000, correctCount: 1, answeredCount: 1, rank: 1 });
    expect(s.competition.standings[1]).toMatchObject({ studentId: "s2", points: 0, answeredCount: 1, rank: 2 });
    // Answer Q2, finish → both rounds counted.
    addAnswer(ctx, code, "s1", 1, correct);
    addAnswer(ctx, code, "s2", 1, correct);
    await act(ctx, "finish", { joinCode: code, roundVersion: 2 });
    s = (await act(ctx, "get", { joinCode: code })).jsonBody.session;
    expect(s.competition.completedRounds).toBe(2);
    expect(s.competition.standings[0]).toMatchObject({ studentId: "s1", points: 2000, correctCount: 2, answeredCount: 2 });
    expect(JSON.stringify(s.jsonBody || s)).not.toContain("challengeSnapshot");
    expect(s.competition.standings.map(r => r.rank)).toEqual([1, 2]);
  });

  it("a lobby teacher view carries an empty competition (completedRounds 0)", async () => {
    const ctx = school2();
    const code = await makeRoom(ctx, "c2", ["s1"]);
    const s = (await act(ctx, "get", { joinCode: code })).jsonBody.session;
    expect(s.competition).toMatchObject({ completedRounds: 0, standings: [] });   // lobby → no ranking
  });
});
