import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/game-live-session-student.js";
import { newSessionDoc, sessionDocName, applyClose, applyJoin, applyStart, applyNext } from "../src/lib/live-challenge-session-store.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 4A — STUDENT live-session API through the REAL handler + REAL CAS. Proves active-session auth, teacher-defined
// membership (the code never adds an arbitrary student), studentId derived only from the session, idempotent join/ready,
// closed-lobby handling, concurrent ready preserving both students, and the answer-key non-leak invariant.

const SNAPSHOT = {
  schemaVersion: 1, challengeId: "c1", title: "شبكات", courseId: "791381",
  questions: [{ source: { kind: "manual" }, question: { examQuestionId: "q1", presentationType: "multipleChoice", prompt: "عاصمة؟", options: ["أ", "ب"], correctOptionIndex: 1, answer: "ب", solution: "الحل ب" } }],
};
// `"answer"` is the quoted answer-key; the benign lobby status field `"answered"` is a different token (allowed).
const ANSWER_KEY_STRINGS = ["challengeSnapshot", "questions", "\"answer\"", "correctOptionIndex", "solution", "presentationType", "عاصمة", "الحل ب", "studentId"];

function seedSession(over = {}, hooks) {
  const doc = newSessionDoc({ joinCode: "K7MX4P", teacherId: "t1", challengeId: "c1", challengeTitle: "شبكات", classId: "cl1", participants: [{ studentId: "s1", displayName: "أحمد" }, { studentId: "s2", displayName: "حلا" }], challengeSnapshot: SNAPSHOT, now: "2026-01-01T00:00:00.000Z", ...over });
  const ctx = createMemoryContainer({ [sessionDocName(doc.joinCode)]: doc }, hooks);
  return ctx;
}
const studentDeps = (ctx, sub) => ({
  requireActiveStudentSession: async () => ({ ok: true, user: { sub }, student: { userId: sub, role: "student", active: true, archived: false, classId: "cl1", displayName: "طالب " + sub }, container: ctx.container }),
  container: ctx.container,
});
const req = (action, body) => ({ method: "POST", params: { action }, json: async () => body });
const call = (ctx, sub, action, body = { joinCode: "K7MX4P" }) => handler(req(action, body), studentDeps(ctx, sub));

const noLeak = jsonBody => { const s = JSON.stringify(jsonBody); for (const banned of ANSWER_KEY_STRINGS) expect(s, banned).not.toContain(banned); };

describe("student join — auth & membership", () => {
  it("requires an ACTIVE student session", async () => {
    const ctx = seedSession();
    const r = await handler(req("join", { joinCode: "K7MX4P" }), { requireActiveStudentSession: async () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) });
    expect(r.status).toBe(401);
  });
  it("a teacher-listed student can join; join is idempotent and stamps once", async () => {
    const ctx = seedSession();
    const r = await call(ctx, "s1", "join");
    expect(r.status).toBe(200);
    expect(r.jsonBody.session.you).toEqual({ joined: true, ready: false, answered: false });
    const firstJoinedAt = ctx.getJson(sessionDocName("K7MX4P")).participants.find(p => p.studentId === "s1").joinedAt;
    await call(ctx, "s1", "join");
    expect(ctx.getJson(sessionDocName("K7MX4P")).participants.find(p => p.studentId === "s1").joinedAt).toBe(firstJoinedAt);
    noLeak(r.jsonBody);
  });
  it("an unassigned student is forbidden (the code never adds an arbitrary student)", async () => {
    const ctx = seedSession();
    expect((await call(ctx, "s9", "join")).status).toBe(403);
    expect((await call(ctx, "s9", "get")).status).toBe(403);
    expect((await call(ctx, "s9", "ready", { joinCode: "K7MX4P", ready: true })).status).toBe(403);
  });
  it("studentId cannot be spoofed via the body — identity comes from the session", async () => {
    const ctx = seedSession();
    await call(ctx, "s1", "join", { joinCode: "K7MX4P", studentId: "s2" });   // body says s2, session is s1
    const parts = ctx.getJson(sessionDocName("K7MX4P")).participants;
    expect(parts.find(p => p.studentId === "s1").joinedAt).toBeTruthy();
    expect(parts.find(p => p.studentId === "s2").joinedAt).toBeNull();          // s2 untouched
  });
  it("join cannot reopen a closed lobby → 409", async () => {
    const ctx = seedSession();
    const doc = applyClose(ctx.getJson(sessionDocName("K7MX4P")), "2026-01-02T00:00:00.000Z");
    ctx.setJson(sessionDocName("K7MX4P"), doc);
    expect((await call(ctx, "s1", "join")).status).toBe(409);
  });
  it("an unknown room code → 404 (generic)", async () => {
    const ctx = seedSession();
    expect((await call(ctx, "s1", "join", { joinCode: "ZZZZZZ" })).status).toBe(404);
  });
});

describe("student ready", () => {
  it("a student sets/clears only their OWN ready flag; ready=false is allowed while lobby", async () => {
    const ctx = seedSession();
    const r = await call(ctx, "s1", "ready", { joinCode: "K7MX4P", ready: true });
    expect(r.jsonBody.session.you).toEqual({ joined: true, ready: true, answered: false });
    const parts = () => ctx.getJson(sessionDocName("K7MX4P")).participants;
    expect(parts().find(p => p.studentId === "s2").readyAt).toBeNull();        // s2 untouched
    await call(ctx, "s1", "ready", { joinCode: "K7MX4P", ready: false });
    expect(parts().find(p => p.studentId === "s1").readyAt).toBeNull();
    expect(parts().find(p => p.studentId === "s1").joinedAt).toBeTruthy();     // still joined
    noLeak(r.jsonBody);
  });
  it("ready requires a STRICT boolean — malformed values are 400 and never mutate the participant (Fix 3)", async () => {
    // ready:true and ready:false are the only accepted payloads; "false" / 1 / {} / null / missing → 400 with NO mutation.
    const okTrue = await call(seedSession(), "s1", "ready", { joinCode: "K7MX4P", ready: true });
    expect(okTrue.status).toBe(200);
    expect(okTrue.jsonBody.session.you).toEqual({ joined: true, ready: true, answered: false });
    const okFalse = await call(seedSession(), "s1", "ready", { joinCode: "K7MX4P", ready: false });
    expect(okFalse.status).toBe(200);
    expect(okFalse.jsonBody.session.you).toEqual({ joined: true, ready: false, answered: false });
    for (const bad of ["false", 1, 0, {}, null, undefined]) {
      const ctx = seedSession();
      const r = await call(ctx, "s1", "ready", { joinCode: "K7MX4P", ready: bad });
      expect(r.status, JSON.stringify(bad)).toBe(400);                              // rejected, not coerced to true
      const p = ctx.getJson(sessionDocName("K7MX4P")).participants.find(x => x.studentId === "s1");
      expect(p.joinedAt, JSON.stringify(bad)).toBeNull();                            // no mutation whatsoever
      expect(p.readyAt, JSON.stringify(bad)).toBeNull();
    }
    // a missing `ready` key (the classic coercion trap that made {} → true) is also a 400.
    const missing = await call(seedSession(), "s1", "ready", { joinCode: "K7MX4P" });
    expect(missing.status).toBe(400);
  });
  it("concurrent ready from two students preserves BOTH (CAS retry on a stale read)", async () => {
    // Inject s2's ready right before s1's conditional write, forcing a 412 and a retry on the fresh document.
    let fired = false;
    const ctx = seedSession({}, {
      beforeConditionalUpload(name, api) {
        if (fired) return; fired = true;
        const doc = api.getJson(name); const p = doc.participants.find(x => x.studentId === "s2");
        p.joinedAt = "2026-01-02T00:00:00.000Z"; p.readyAt = "2026-01-02T00:00:00.000Z"; api.setJson(name, doc);
      },
    });
    const r = await call(ctx, "s1", "ready", { joinCode: "K7MX4P", ready: true });
    expect(r.status).toBe(200);
    const parts = ctx.getJson(sessionDocName("K7MX4P")).participants;
    expect(parts.find(p => p.studentId === "s1").readyAt).toBeTruthy();        // s1's write survived the retry
    expect(parts.find(p => p.studentId === "s2").readyAt).toBeTruthy();        // s2's concurrent write was NOT lost
  });
});

describe("student get — safe view & closed state", () => {
  it("get returns the safe lobby (status visible when closed) and never any answer key", async () => {
    const ctx = seedSession();
    await call(ctx, "s1", "join");
    const open = await call(ctx, "s1", "get");
    expect(open.jsonBody.session.status).toBe("lobby");
    noLeak(open.jsonBody);
    // teacher closes → student get reflects closed (so the UI can stop polling)
    ctx.setJson(sessionDocName("K7MX4P"), applyClose(ctx.getJson(sessionDocName("K7MX4P")), "2026-01-03T00:00:00.000Z"));
    const closed = await call(ctx, "s1", "get");
    expect(closed.status).toBe(200);
    expect(closed.jsonBody.session.status).toBe("closed");
    noLeak(closed.jsonBody);
  });
  it("EVERY student response is answer-key-free across join / ready / get", async () => {
    const ctx = seedSession();
    noLeak((await call(ctx, "s1", "join")).jsonBody);
    noLeak((await call(ctx, "s2", "ready", { joinCode: "K7MX4P", ready: true })).jsonBody);
    noLeak((await call(ctx, "s1", "get")).jsonBody);
  });
});

// ── Phase 4B — student answer endpoint (grading authority, one-per-round, stale, reconnect) ─────────────────────
const ROUND_SNAPSHOT = {
  schemaVersion: 1, challengeId: "c9", title: "جولة", courseId: "791381",
  questions: [
    { question: { examQuestionId: "q1", presentationType: "multipleChoice", text: "عاصمة؟", options: [{ text: "عمّان" }, { text: "إربد" }], correctOptionIndex: 0, answer: { correctOptionIndex: 0 }, marks: 1, solution: "عمّان" } },
    { question: { examQuestionId: "q2", presentationType: "trueFalse", text: "١+١=٢", marks: 1, answer: { correct: true } } },
  ],
};
/** Seed a session already ACTIVE on round 1 with s1 & s2 joined. */
function seedActive(over = {}) {
  const doc = newSessionDoc({ joinCode: "R2R2R2", teacherId: "t1", challengeId: "c9", challengeTitle: "جولة", classId: "cl1", participants: [{ studentId: "s1", displayName: "أحمد" }, { studentId: "s2", displayName: "حلا" }], challengeSnapshot: ROUND_SNAPSHOT, now: "2026-01-01T00:00:00.000Z", ...over });
  applyJoin(doc, "s1", "j"); applyJoin(doc, "s2", "j"); applyStart(doc, "2026-02-01T00:00:00.000Z");
  return createMemoryContainer({ [sessionDocName(doc.joinCode)]: doc });
}
const ans = (ctx, sub, body) => handler(req("answer", { joinCode: "R2R2R2", ...body }), studentDeps(ctx, sub));

describe("Phase 4B — student answer: authority & grading", () => {
  it("a joined student answers the current round; the SERVER grades via the central grader (no client score)", async () => {
    const ctx = seedActive();
    const r = await ans(ctx, "s1", { roundVersion: 1, response: { kind: "choice", index: 0 }, score: 999, correct: true });
    expect(r.status).toBe(200);
    expect(r.jsonBody.session.you.answered).toBe(true);
    const rec = ctx.getJson(sessionDocName("R2R2R2")).participants.find(p => p.studentId === "s1").answers[0];
    expect(rec.grade).toMatchObject({ score: 1, maxMarks: 1, correct: true, manualReview: false });   // server-derived
    expect(rec.grade.score).not.toBe(999);                                                             // client score ignored
    expect(rec.response).toEqual({ kind: "choice", index: 0 });                                        // no client score persisted
    expect(JSON.stringify(rec.response)).not.toContain("999");
  });
  it("studentId in the body is ignored — the answer is recorded under the authenticated student only", async () => {
    const ctx = seedActive();
    await ans(ctx, "s1", { roundVersion: 1, response: { kind: "choice", index: 0 }, studentId: "s2" });
    const parts = ctx.getJson(sessionDocName("R2R2R2")).participants;
    expect(parts.find(p => p.studentId === "s1").answers).toHaveLength(1);   // authenticated s1
    expect(parts.find(p => p.studentId === "s2").answers).toHaveLength(0);   // body spoof ignored
  });
  it("the active studentView returns ONLY the sanitized current question — no key, no future question", async () => {
    const ctx = seedActive();
    const v = (await call(ctx, "s1", "get", { joinCode: "R2R2R2" })).jsonBody.session;
    expect(v.status).toBe("active");
    expect(v.round).toMatchObject({ roundVersion: 1, questionNumber: 1, questionCount: 2 });
    expect(v.round.question.examQuestionId).toBe("q1");
    const s = JSON.stringify(v);
    for (const banned of ["challengeSnapshot", "correctOptionIndex", "solution", "\"correct\"", "q2", "١+١=٢", "\"score\""]) expect(s, banned).not.toContain(banned);
  });
  it("after answering, get restores the OWN submission (locked) but NEVER the grade", async () => {
    const ctx = seedActive();
    await ans(ctx, "s1", { roundVersion: 1, response: { kind: "choice", index: 1 } });
    const v = (await call(ctx, "s1", "get", { joinCode: "R2R2R2" })).jsonBody.session;
    expect(v.you.answered).toBe(true);
    expect(v.you.submission.response).toEqual({ kind: "choice", index: 1 });
    expect(v.you.grade).toBeUndefined();
    for (const banned of ["\"score\"", "\"correct\"", "maxMarks", "correctOptionIndex"]) expect(JSON.stringify(v), banned).not.toContain(banned);
  });
});

describe("Phase 4B — student answer: one-per-round, stale, membership, validation", () => {
  it("a duplicate answer for the same round is idempotent — 200, original kept, NO second write", async () => {
    const ctx = seedActive();
    await ans(ctx, "s1", { roundVersion: 1, response: { kind: "choice", index: 0 } });
    const name = sessionDocName("R2R2R2");
    const before = ctx.store.get(name);
    const beforeEtag = before.etag, beforeContent = before.content.toString("utf8");
    const dup = await ans(ctx, "s1", { roundVersion: 1, response: { kind: "choice", index: 1 } });   // different payload
    expect(dup.status).toBe(200);                                             // idempotent success
    const after = ctx.store.get(name);
    expect(after.etag).toBe(beforeEtag);                                      // ZERO write
    expect(after.content.toString("utf8")).toBe(beforeContent);
    const rec = ctx.getJson(name).participants.find(p => p.studentId === "s1").answers;
    expect(rec).toHaveLength(1);                                              // still one record
    expect(rec[0].response).toEqual({ kind: "choice", index: 0 });           // original NOT overwritten
  });
  it("a stale-round answer (previous round after teacher advanced) → 409 stale-round, ZERO mutation", async () => {
    const ctx = seedActive();
    const name = sessionDocName("R2R2R2");
    ctx.setJson(name, applyNext(ctx.getJson(name), 1, "t"));                  // teacher advanced to round 2
    const before = ctx.store.get(name).content.toString("utf8");
    const r = await ans(ctx, "s1", { roundVersion: 1, response: { kind: "choice", index: 0 } });   // old round
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("stale-round");
    expect(ctx.store.get(name).content.toString("utf8")).toBe(before);       // unchanged
  });
  it("a future roundVersion → 409 stale-round; a malformed roundVersion → 400; both with no mutation", async () => {
    const ctx = seedActive();
    expect((await ans(ctx, "s1", { roundVersion: 5, response: { kind: "choice", index: 0 } })).jsonBody.code).toBe("stale-round");
    expect((await ans(ctx, "s1", { roundVersion: "1", response: { kind: "choice", index: 0 } })).status).toBe(400);
    expect((await ans(ctx, "s1", { response: { kind: "choice", index: 0 } })).status).toBe(400);
    expect(ctx.getJson(sessionDocName("R2R2R2")).participants.find(p => p.studentId === "s1").answers).toHaveLength(0);
  });
  it("a non-participant → 403; a preselected-but-never-joined participant → 403 not-joined (no record)", async () => {
    expect((await ans(seedActive(), "s9", { roundVersion: 1, response: { kind: "choice", index: 0 } })).status).toBe(403);
    // only s1 joined before start → s2 never joined and cannot answer the running game
    const doc = newSessionDoc({ joinCode: "R2R2R2", teacherId: "t1", challengeId: "c9", challengeTitle: "جولة", classId: "cl1", participants: [{ studentId: "s1", displayName: "أ" }, { studentId: "s2", displayName: "ب" }], challengeSnapshot: ROUND_SNAPSHOT, now: "t" });
    applyJoin(doc, "s1", "j"); applyStart(doc, "t");
    const ctx = createMemoryContainer({ [sessionDocName("R2R2R2")]: doc });
    const r = await ans(ctx, "s2", { roundVersion: 1, response: { kind: "choice", index: 0 } });
    expect(r.status).toBe(403);
    expect(r.jsonBody.code).toBe("not-joined");
    expect(ctx.getJson(sessionDocName("R2R2R2")).participants.find(p => p.studentId === "s2").answers).toHaveLength(0);
  });
  it("a malformed / oversized response → 400 before any mutation", async () => {
    const ctx = seedActive();
    const name = sessionDocName("R2R2R2");
    const before = ctx.store.get(name).content.toString("utf8");
    expect((await ans(ctx, "s1", { roundVersion: 1, response: { kind: "evil", data: 1 } })).status).toBe(400);
    expect((await ans(ctx, "s1", { roundVersion: 1, response: { kind: "text", value: "x".repeat(30000) } })).status).toBe(400);
    expect((await ans(ctx, "s1", { roundVersion: 1, response: "not-an-object" })).status).toBe(400);
    expect(ctx.store.get(name).content.toString("utf8")).toBe(before);       // no mutation from any malformed attempt
  });
  it("answering is rejected once the room is not active (finished / closed) and stays answer-key-free", async () => {
    const ctx = seedActive();
    const name = sessionDocName("R2R2R2");
    ctx.setJson(name, applyClose(ctx.getJson(name), "t"));
    const r = await ans(ctx, "s1", { roundVersion: 1, response: { kind: "choice", index: 0 } });
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("not-active");
  });
});

// ── Review fix 1 — ACTIVE GET requires an actually-joined student ────────────────────────────────────────────────
describe("Phase 4B review fix — active GET requires a joined player", () => {
  function seedActivePartial() {   // only s1 joined before start; s2 is preselected-but-never-joined
    const doc = newSessionDoc({ joinCode: "R2R2R2", teacherId: "t1", challengeId: "c9", challengeTitle: "جولة", classId: "cl1", participants: [{ studentId: "s1", displayName: "أحمد" }, { studentId: "s2", displayName: "حلا" }], challengeSnapshot: ROUND_SNAPSHOT, now: "t" });
    applyJoin(doc, "s1", "j"); applyStart(doc, "2026-02-01T00:00:00.000Z");
    return createMemoryContainer({ [sessionDocName(doc.joinCode)]: doc });
  }
  it("a joined student gets the sanitized current question", async () => {
    const r = await call(seedActivePartial(), "s1", "get", { joinCode: "R2R2R2" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.session.round.question.examQuestionId).toBe("q1");
  });
  it("a preselected-but-never-joined student → 403 not-joined, and receives NO current question / snapshot / key", async () => {
    const r = await call(seedActivePartial(), "s2", "get", { joinCode: "R2R2R2" });
    expect(r.status).toBe(403);
    expect(r.jsonBody.code).toBe("not-joined");
    const s = JSON.stringify(r.jsonBody);
    for (const banned of ["round", "question", "challengeSnapshot", "correctOptionIndex", "solution", "\"answer\""]) expect(s, banned).not.toContain(banned);
  });
  it("defense in depth: studentView for a never-joined participant during an active round carries NO round content", async () => {
    // Directly exercise the view (the API also rejects this path as not-joined).
    const { studentView } = await import("../src/lib/live-challenge-session-store.js");
    const doc = newSessionDoc({ joinCode: "R2R2R2", teacherId: "t1", challengeId: "c9", challengeTitle: "جولة", classId: "cl1", participants: [{ studentId: "s1", displayName: "أ" }, { studentId: "s2", displayName: "ب" }], challengeSnapshot: ROUND_SNAPSHOT, now: "t" });
    applyJoin(doc, "s1", "j"); applyStart(doc, "t");
    const v = studentView(doc, "s2");
    expect(v.status).toBe("active");
    expect(v.round).toBeUndefined();
    expect(v.you.answered).toBe(false);
    expect(v.you.submission).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain("q1");
  });
});

// ── Review fix 2 — student response is canonicalized before grading AND storage ──────────────────────────────────
describe("Phase 4B review fix — response canonicalization strips untrusted fields", () => {
  const storedResponse = ctx => ctx.getJson(sessionDocName("R2R2R2")).participants.find(p => p.studentId === "s1").answers[0].response;
  it("choice: score/correct/studentId/questionIndex are stripped; grade stays server-derived", async () => {
    const ctx = seedActive();
    await ans(ctx, "s1", { roundVersion: 1, response: { kind: "choice", index: 0, score: 999, correct: true, studentId: "s2", questionIndex: 77 } });
    expect(storedResponse(ctx)).toEqual({ kind: "choice", index: 0 });
    const rec = ctx.getJson(sessionDocName("R2R2R2")).participants.find(p => p.studentId === "s1").answers[0];
    expect(rec.grade).toMatchObject({ score: 1, maxMarks: 1, correct: true });   // central grader (index 0 is correct)
    const s = JSON.stringify(rec.response);
    for (const banned of ["999", "studentId", "questionIndex", "\"correct\""]) expect(s, banned).not.toContain(banned);
  });
  it("text: only kind + value persisted", async () => {
    const ctx = seedActive();
    await ans(ctx, "s1", { roundVersion: 1, response: { kind: "text", value: "إجابتي", score: 5, note: "x" } });
    expect(storedResponse(ctx)).toEqual({ kind: "text", value: "إجابتي" });
  });
  it("fields: only canonical values survive, no arbitrary metadata", async () => {
    const ctx = seedActive();
    await ans(ctx, "s1", { roundVersion: 1, response: { kind: "fields", values: { a: "x", b: true, c: ["y"] }, evil: "z" } });
    expect(storedResponse(ctx)).toEqual({ kind: "fields", values: { a: "x", b: true, c: ["y"] } });
  });
  it("compound: nested part extras are stripped recursively", async () => {
    const ctx = seedActive();
    await ans(ctx, "s1", { roundVersion: 1, response: { kind: "compound", parts: { p1: { kind: "choice", index: 1, score: 9, correct: true } }, extra: 1 } });
    expect(storedResponse(ctx)).toEqual({ kind: "compound", parts: { p1: { kind: "choice", index: 1 } } });
  });
  it("no grading drift: the canonical response grades identically to the raw submission", async () => {
    const { gradeQuestion } = await import("../src/lib/assignment-grading.js");
    const ctx = seedActive();
    await ans(ctx, "s1", { roundVersion: 1, response: { kind: "choice", index: 0, score: 999 } });
    const rec = ctx.getJson(sessionDocName("R2R2R2")).participants.find(p => p.studentId === "s1").answers[0];
    const q = ROUND_SNAPSHOT.questions[0].question;
    const expected = gradeQuestion(q, { kind: "choice", index: 0 });
    expect(rec.grade).toMatchObject({ score: expected.score, correct: expected.correct, maxMarks: expected.maxMarks });
  });
  it("a huge RAW extra field is rejected BEFORE canonicalization (raw size bound), with no mutation", async () => {
    const ctx = seedActive();
    const name = sessionDocName("R2R2R2");
    const before = ctx.store.get(name).content.toString("utf8");
    // the canonicalizer would strip `junk`, but the raw payload must be rejected on size before it ever runs
    const r = await ans(ctx, "s1", { roundVersion: 1, response: { kind: "choice", index: 0, junk: "x".repeat(25000) } });
    expect(r.status).toBe(400);
    expect(ctx.store.get(name).content.toString("utf8")).toBe(before);       // mutation callback never reached
    expect(ctx.getJson(name).participants.find(p => p.studentId === "s1").answers).toHaveLength(0);
    // a small unknown-field payload still succeeds (stripped, not rejected)
    const okr = await ans(ctx, "s1", { roundVersion: 1, response: { kind: "choice", index: 0, score: 999, correct: true } });
    expect(okr.status).toBe(200);
    expect(ctx.getJson(name).participants.find(p => p.studentId === "s1").answers[0].response).toEqual({ kind: "choice", index: 0 });
  });
});
