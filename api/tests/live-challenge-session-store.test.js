import { describe, it, expect } from "vitest";
import {
  CODE_ALPHABET, CODE_LENGTH, normalizeJoinCode, isValidJoinCode, generateJoinCode, sessionDocName,
  newSessionDoc, findParticipant, isParticipant, participantCounts,
  applyJoin, applyReady, applyClose, applyStart, applyNext, applyFinish, applyAnswer,
  roundVersionOf, currentIndexOf, questionCount, rawCurrentQuestion, findAnswer, answeredCount, playingParticipants,
  teacherView, studentView, SessionError,
} from "../src/lib/live-challenge-session-store.js";

// Phase 4A live-session store — pure domain: room codes, the fresh lobby document, the lobby → closed transitions and
// the two views. The CRITICAL invariant proven here is that a STUDENT view never carries the challenge snapshot or any
// answer key; the API tests prove it again end-to-end.

const SNAPSHOT = {
  schemaVersion: 1, challengeId: "c1", title: "شبكات", courseId: "791381",
  questions: [{ question: { examQuestionId: "q1", presentationType: "multipleChoice", prompt: "2+2?", options: ["3", "4"], correctOptionIndex: 1, answer: "4" } }],
};
const mk = (over = {}) => newSessionDoc({ joinCode: "K7MX4P", teacherId: "t1", challengeId: "c1", challengeTitle: "شبكات", classId: "cl1", participants: [{ studentId: "s1", displayName: "أحمد" }, { studentId: "s2", displayName: "حلا" }], challengeSnapshot: SNAPSHOT, now: "2026-01-01T00:00:00.000Z", ...over });

describe("room codes", () => {
  it("alphabet excludes ambiguous 0/O/1/I/L and codes are 6 valid chars", () => {
    for (const ch of ["0", "O", "1", "I", "L"]) expect(CODE_ALPHABET.includes(ch)).toBe(false);
    expect(CODE_LENGTH).toBe(6);
    const codes = new Set();
    for (let i = 0; i < 200; i++) { const c = generateJoinCode(); expect(isValidJoinCode(c)).toBe(true); expect(c).toHaveLength(6); codes.add(c); }
    expect(codes.size).toBeGreaterThan(150);   // cryptographically random → effectively no collisions across 200 draws
  });
  it("normalizeJoinCode trims, uppercases, strips invalid chars and caps length; isValidJoinCode is strict", () => {
    expect(normalizeJoinCode("  k7mx4p ")).toBe("K7MX4P");
    expect(normalizeJoinCode("k7-mx4p9z")).toBe("K7MX4P");   // dashes/extras removed, capped at 6
    expect(normalizeJoinCode("oil000")).toBe("");             // all ambiguous/invalid → empty
    expect(isValidJoinCode("K7MX4P")).toBe(true);
    expect(isValidJoinCode("K7MX4")).toBe(false);             // too short
    expect(isValidJoinCode("K7MX40")).toBe(false);            // 0 not in alphabet
    expect(isValidJoinCode("k7mx4p")).toBe(false);            // lowercase not accepted as-is
  });
  it("sessionDocName is a direct, isolated Games key under the sessions prefix", () => {
    expect(sessionDocName("K7MX4P")).toBe("platform/games/live-challenge-sessions/K7MX4P.json");
  });
});

describe("newSessionDoc", () => {
  it("is a fresh lobby: sessionId === joinCode, participants not-yet-joined, snapshot retained server-side", () => {
    const s = mk();
    expect(s).toMatchObject({ kind: "live-challenge-session", schemaVersion: 2, sessionId: "K7MX4P", joinCode: "K7MX4P", teacherId: "t1", challengeId: "c1", challengeTitle: "شبكات", classId: "cl1", status: "lobby", closedAt: null });
    // Phase 4B runtime fields default to the lobby/zero values.
    expect(s).toMatchObject({ currentQuestionIndex: null, roundVersion: 0, startedAt: null, questionStartedAt: null, finishedAt: null });
    expect(s.participants).toEqual([{ studentId: "s1", displayName: "أحمد", joinedAt: null, readyAt: null, answers: [] }, { studentId: "s2", displayName: "حلا", joinedAt: null, readyAt: null, answers: [] }]);
    expect(s.challengeSnapshot).toEqual(SNAPSHOT);
    expect(participantCounts(s)).toEqual({ total: 2, joined: 0, ready: 0 });
  });
});

describe("transitions", () => {
  it("applyJoin is idempotent, stamps joinedAt once, and requires an existing participant + open lobby", () => {
    const s = mk();
    applyJoin(s, "s1", "2026-01-02T00:00:00.000Z");
    const first = findParticipant(s, "s1").joinedAt;
    expect(first).toBe("2026-01-02T00:00:00.000Z");
    applyJoin(s, "s1", "2026-01-03T00:00:00.000Z");
    expect(findParticipant(s, "s1").joinedAt).toBe(first);           // idempotent — not re-stamped
    expect(() => applyJoin(s, "ghost", "t")).toThrow(SessionError);  // not a participant
    try { applyJoin(mk({}), "ghost"); } catch (e) { expect(e.code).toBe("forbidden"); }
    const closed = applyClose(mk());
    try { applyJoin(closed, "s1"); } catch (e) { expect(e.code).toBe("closed"); }
  });
  it("applyReady sets/clears the OWN ready flag (implies joined); ready=false clears; only while lobby", () => {
    const s = mk();
    applyReady(s, "s2", true, "2026-01-02T00:00:00.000Z");
    expect(findParticipant(s, "s2")).toMatchObject({ joinedAt: "2026-01-02T00:00:00.000Z", readyAt: "2026-01-02T00:00:00.000Z" });
    applyReady(s, "s2", false, "2026-01-03T00:00:00.000Z");
    expect(findParticipant(s, "s2").readyAt).toBeNull();
    expect(findParticipant(s, "s2").joinedAt).toBe("2026-01-02T00:00:00.000Z");   // still joined
    expect(() => applyReady(s, "ghost", true)).toThrow(SessionError);
  });
  it("applyClose is idempotent and never deletes data", () => {
    const s = mk();
    applyClose(s, "2026-01-05T00:00:00.000Z");
    expect(s.status).toBe("closed");
    expect(s.closedAt).toBe("2026-01-05T00:00:00.000Z");
    applyClose(s, "2026-01-06T00:00:00.000Z");
    expect(s.closedAt).toBe("2026-01-05T00:00:00.000Z");    // idempotent
    expect(s.participants).toHaveLength(2);                  // history preserved
  });
});

describe("views", () => {
  it("teacherView omits the snapshot and exposes joined/ready per participant + counts", () => {
    const s = mk(); applyReady(s, "s1", true, "t");
    const v = teacherView(s);
    expect(v.challengeSnapshot).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain("challengeSnapshot");
    expect(v.counts).toEqual({ total: 2, joined: 1, ready: 1 });
    expect(v.participants[0]).toMatchObject({ studentId: "s1", displayName: "أحمد", joined: true, ready: true });
    expect(v.participants[1]).toMatchObject({ studentId: "s2", joined: false, ready: false });
  });
  it("CRITICAL: studentView carries NO snapshot, NO question content and NO answer key of any shape", () => {
    const s = mk(); applyJoin(s, "s1", "t");
    const v = studentView(s, "s1");
    expect(v.you).toEqual({ joined: true, ready: false, answered: false });
    expect(v.counts).toEqual({ total: 2, joined: 1, ready: 0 });
    // classmates appear by display name + state only — never an id or any key
    expect(v.participants).toEqual([{ displayName: "أحمد", joined: true, ready: false }, { displayName: "حلا", joined: false, ready: false }]);
    const serialized = JSON.stringify(v);
    // `"answer"` is the quoted answer-key; the benign status field `"answered"` is a different token and is allowed.
    for (const banned of ["challengeSnapshot", "questions", "\"answer\"", "correctOptionIndex", "presentationType", "2+2", "\"4\"", "studentId"]) {
      expect(serialized, banned).not.toContain(banned);
    }
  });
});

// ── Phase 4B live-round transitions & views ─────────────────────────────────────────────────────────────────────
// A richer, secret-laden 2-question snapshot: compound + simple, each carrying answer keys the student must never see.
const RICH_SNAPSHOT = {
  schemaVersion: 1, challengeId: "c9", title: "جولة", courseId: "791381",
  questions: [
    { question: { examQuestionId: "q1", presentationType: "multipleChoice", text: "عاصمة الأردن؟", prompt: "عاصمة؟", options: [{ text: "عمّان" }, { text: "إربد" }], correctOptionIndex: 0, answer: { correctOptionIndex: 0 }, marks: 1, solution: "عمّان هي العاصمة" } },
    { question: { examQuestionId: "q2", presentationType: "trueFalse", text: "١+١=٢", marks: 1, answer: { correct: true } } },
  ],
};
const mkRich = (over = {}) => newSessionDoc({ joinCode: "R1R1R1", teacherId: "t1", challengeId: "c9", challengeTitle: "جولة", classId: "cl1", participants: [{ studentId: "s1", displayName: "أحمد" }, { studentId: "s2", displayName: "حلا" }], challengeSnapshot: RICH_SNAPSHOT, now: "2026-01-01T00:00:00.000Z", ...over });
const joinAll = s => { applyJoin(s, "s1", "j"); applyJoin(s, "s2", "j"); return s; };

describe("Phase 4B — round state machine", () => {
  it("start requires lobby + a snapshot with questions + at least one JOINED participant", () => {
    expect(() => applyStart(mkRich(), "n")).toThrow(SessionError);            // nobody joined yet
    try { applyStart(mkRich(), "n"); } catch (e) { expect(e.code).toBe("no-participants"); }
    const empty = newSessionDoc({ joinCode: "E1E1E1", teacherId: "t1", challengeId: "c0", challengeTitle: "x", classId: "cl1", participants: [{ studentId: "s1", displayName: "أ" }], challengeSnapshot: { questions: [] }, now: "t" });
    applyJoin(empty, "s1", "j");
    try { applyStart(empty, "n"); } catch (e) { expect(e.code).toBe("empty-challenge"); }
    const s = joinAll(mkRich());
    applyStart(s, "2026-02-01T00:00:00.000Z");
    expect(s.status).toBe("active");
    expect(currentIndexOf(s)).toBe(0);
    expect(roundVersionOf(s)).toBe(1);
    expect(s.startedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(s.questionStartedAt).toBe("2026-02-01T00:00:00.000Z");
    try { applyStart(s, "n"); } catch (e) { expect(e.code).toBe("not-lobby"); }   // cannot restart an active game
  });

  it("next advances index + roundVersion, is round-version guarded, and cannot pass the last question", () => {
    const s = applyStart(joinAll(mkRich()), "t");
    try { applyNext(s, 99, "t"); } catch (e) { expect(e.code).toBe("stale-round"); }  // wrong round → no advance
    applyNext(s, 1, "2026-02-01T01:00:00.000Z");
    expect(currentIndexOf(s)).toBe(1);
    expect(roundVersionOf(s)).toBe(2);
    expect(s.questionStartedAt).toBe("2026-02-01T01:00:00.000Z");
    try { applyNext(s, 2, "t"); } catch (e) { expect(e.code).toBe("no-more-questions"); }  // already the last
  });

  it("finish requires the last question + a matching round; close works from active and finished", () => {
    const s = applyStart(joinAll(mkRich()), "t");
    try { applyFinish(s, 1, "t"); } catch (e) { expect(e.code).toBe("not-last-question"); }  // still on Q0
    applyNext(s, 1, "t");
    try { applyFinish(s, 1, "t"); } catch (e) { expect(e.code).toBe("stale-round"); }        // round moved to 2
    applyFinish(s, 2, "2026-02-02T00:00:00.000Z");
    expect(s.status).toBe("finished");
    expect(s.finishedAt).toBe("2026-02-02T00:00:00.000Z");
    const closed = applyClose(s, "2026-02-03T00:00:00.000Z");
    expect(closed.status).toBe("closed");                          // finished → closed
    const active = applyStart(joinAll(mkRich()), "t");
    expect(applyClose(active, "t").status).toBe("closed");         // active → closed also works
  });
});

describe("Phase 4B — answer authority, grading, one-per-round & views", () => {
  const grade = (s, id, rv, response) => applyAnswer(s, id, rv, response, q => require("../src/lib/assignment-grading.js").gradeQuestion(q, response), "a");
  it("applyAnswer grades via the supplied central grader and stores ONE authoritative record per round", () => {
    const s = applyStart(joinAll(mkRich()), "t");
    grade(s, "s1", 1, { kind: "choice", index: 0 });            // correct MCQ (correctOptionIndex 0)
    const rec = findAnswer(findParticipant(s, "s1"), 1);
    expect(rec.grade).toMatchObject({ score: 1, maxMarks: 1, correct: true, manualReview: false });
    expect(rec.response).toEqual({ kind: "choice", index: 0 });
    expect(rec.questionIndex).toBe(0);
    expect(answeredCount(s, 1)).toBe(1);
    // a wrong choice for s2 still records exactly one answer, graded incorrect
    grade(s, "s2", 1, { kind: "choice", index: 1 });
    expect(findAnswer(findParticipant(s, "s2"), 1).grade).toMatchObject({ correct: false });
    expect(answeredCount(s, 1)).toBe(2);
  });
  it("a duplicate answer for the same round throws already-answered (carrying the session) and never overwrites", () => {
    const s = applyStart(joinAll(mkRich()), "t");
    grade(s, "s1", 1, { kind: "choice", index: 0 });
    let thrown;
    try { grade(s, "s1", 1, { kind: "choice", index: 1 }); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(SessionError);
    expect(thrown.code).toBe("already-answered");
    expect(thrown.session).toBe(s);                              // carries the session for idempotent responses
    expect(findAnswer(findParticipant(s, "s1"), 1).response).toEqual({ kind: "choice", index: 0 });  // unchanged
    expect(findParticipant(s, "s1").answers).toHaveLength(1);    // still exactly one record
  });
  it("answer rejects a stale round, a non-participant, and a never-joined participant — with no record written", () => {
    const s = applyStart(joinAll(mkRich()), "t");
    try { grade(s, "s1", 99, { kind: "choice", index: 0 }); } catch (e) { expect(e.code).toBe("stale-round"); }
    expect(findParticipant(s, "s1").answers).toHaveLength(0);
    try { grade(s, "ghost", 1, { kind: "choice", index: 0 }); } catch (e) { expect(e.code).toBe("forbidden"); }
    const s2 = mkRich(); applyJoin(s2, "s1", "j"); applyStart(s2, "t");   // only s1 joined
    try { grade(s2, "s2", 1, { kind: "choice", index: 0 }); } catch (e) { expect(e.code).toBe("not-joined"); }
    expect(findParticipant(s2, "s2").answers).toHaveLength(0);
  });
  it("studentView active: SANITIZED current question only, own answered flag + own submission, NEVER a grade/key", () => {
    const s = applyStart(joinAll(mkRich()), "t");
    let v = studentView(s, "s1");
    expect(v.status).toBe("active");
    expect(v.round).toMatchObject({ roundVersion: 1, questionNumber: 1, questionCount: 2 });
    expect(v.round.question.examQuestionId).toBe("q1");
    expect(v.you.answered).toBe(false);
    // strong key-free check: the correct answer VALUE, keys and other questions never appear
    let sr = JSON.stringify(v);
    for (const banned of ["challengeSnapshot", "correctOptionIndex", "solution", "عمّان هي العاصمة", "\"correct\"", "q2", "١+١=٢"]) expect(sr, banned).not.toContain(banned);
    grade(s, "s1", 1, { kind: "choice", index: 0 });
    v = studentView(s, "s1");
    expect(v.you.answered).toBe(true);
    expect(v.you.submission).toEqual({ response: { kind: "choice", index: 0 }, submittedAt: "a" });
    expect(v.you.grade).toBeUndefined();                          // NEVER the grade during a live round
    sr = JSON.stringify(v);
    for (const banned of ["\"score\"", "\"correct\"", "maxMarks", "correctOptionIndex", "solution"]) expect(sr, banned).not.toContain(banned);
  });
  it("teacherView active: sanitized current question + answered X/Y for the playing set, no raw snapshot", () => {
    const s = applyStart(joinAll(mkRich()), "t");
    grade(s, "s1", 1, { kind: "choice", index: 0 });
    const v = teacherView(s);
    expect(v.status).toBe("active");
    expect(v.round).toMatchObject({ roundVersion: 1, questionNumber: 1, questionCount: 2, answered: 1, playing: 2 });
    expect(v.round.question.examQuestionId).toBe("q1");
    expect(v.participants.find(p => p.studentId === "s1").answered).toBe(true);
    const sr = JSON.stringify(v);
    for (const banned of ["challengeSnapshot", "correctOptionIndex", "solution", "\"correct\"", "عمّان هي العاصمة"]) expect(sr, banned).not.toContain(banned);
  });
  it("a v1 lobby doc (no Phase 4B fields) still reads and is startable", () => {
    const v1 = { kind: "live-challenge-session", schemaVersion: 1, sessionId: "V1V1V1", joinCode: "V1V1V1", teacherId: "t1", status: "lobby", challengeSnapshot: RICH_SNAPSHOT, participants: [{ studentId: "s1", displayName: "أ", joinedAt: "j", readyAt: null }] };
    expect(roundVersionOf(v1)).toBe(0);
    expect(currentIndexOf(v1)).toBe(null);
    expect(playingParticipants(v1)).toHaveLength(1);
    applyStart(v1, "t");
    expect(v1.status).toBe("active");
    expect(rawCurrentQuestion(v1).examQuestionId).toBe("q1");
  });
});
