import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/game-live-session-student.js";
import { newSessionDoc, sessionDocName, applyClose } from "../src/lib/live-challenge-session-store.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 4A — STUDENT live-session API through the REAL handler + REAL CAS. Proves active-session auth, teacher-defined
// membership (the code never adds an arbitrary student), studentId derived only from the session, idempotent join/ready,
// closed-lobby handling, concurrent ready preserving both students, and the answer-key non-leak invariant.

const SNAPSHOT = {
  schemaVersion: 1, challengeId: "c1", title: "شبكات", courseId: "791381",
  questions: [{ source: { kind: "manual" }, question: { examQuestionId: "q1", presentationType: "multipleChoice", prompt: "عاصمة؟", options: ["أ", "ب"], correctOptionIndex: 1, answer: "ب", solution: "الحل ب" } }],
};
const ANSWER_KEY_STRINGS = ["challengeSnapshot", "questions", "answer", "correctOptionIndex", "solution", "presentationType", "عاصمة", "الحل ب", "studentId"];

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
    expect(r.jsonBody.session.you).toEqual({ joined: true, ready: false });
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
    expect(r.jsonBody.session.you).toEqual({ joined: true, ready: true });
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
    expect(okTrue.jsonBody.session.you).toEqual({ joined: true, ready: true });
    const okFalse = await call(seedSession(), "s1", "ready", { joinCode: "K7MX4P", ready: false });
    expect(okFalse.status).toBe(200);
    expect(okFalse.jsonBody.session.you).toEqual({ joined: true, ready: false });
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
