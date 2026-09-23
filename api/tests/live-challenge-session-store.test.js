import { describe, it, expect } from "vitest";
import {
  CODE_ALPHABET, CODE_LENGTH, normalizeJoinCode, isValidJoinCode, generateJoinCode, sessionDocName,
  newSessionDoc, findParticipant, isParticipant, participantCounts,
  applyJoin, applyReady, applyClose, teacherView, studentView, SessionError,
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
    expect(s).toMatchObject({ kind: "live-challenge-session", schemaVersion: 1, sessionId: "K7MX4P", joinCode: "K7MX4P", teacherId: "t1", challengeId: "c1", challengeTitle: "شبكات", classId: "cl1", status: "lobby", closedAt: null });
    expect(s.participants).toEqual([{ studentId: "s1", displayName: "أحمد", joinedAt: null, readyAt: null }, { studentId: "s2", displayName: "حلا", joinedAt: null, readyAt: null }]);
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
    expect(v.you).toEqual({ joined: true, ready: false });
    expect(v.counts).toEqual({ total: 2, joined: 1, ready: 0 });
    // classmates appear by display name + state only — never an id or any key
    expect(v.participants).toEqual([{ displayName: "أحمد", joined: true, ready: false }, { displayName: "حلا", joined: false, ready: false }]);
    const serialized = JSON.stringify(v);
    for (const banned of ["challengeSnapshot", "questions", "answer", "correctOptionIndex", "presentationType", "2+2", "\"4\"", "studentId"]) {
      expect(serialized, banned).not.toContain(banned);
    }
  });
});
