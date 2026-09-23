import { describe, it, expect } from "vitest";
import { competitionPointsForGrade, completedRoundsCount, buildLiveStandings } from "../src/lib/live-challenge-standings.js";

// Phase 4C — COMPETITION STANDINGS derivation. Proven here in isolation on crafted session docs (the store/API tests
// prove it again through the real state machine + views):
//   • competition points are deterministic and bounded [0,1000] per question, from the STORED grade only, no speed;
//   • the leaderboard cutoff EXCLUDES the current active round (non-leak) and counts everything only when finished;
//   • sorting is points→correct→answered→original order, ranks 1,2,3,…, and only the playing (joined) set is ranked.

// ── crafted-document helpers (independent of the store, matching the persisted answer-record shape) ──
const ans = (questionIndex, score, maxMarks, correct, submittedAt = "t") =>
  ({ roundVersion: questionIndex + 1, questionIndex, response: { kind: "choice", index: 0 }, submittedAt, grade: { score, maxMarks, correct: !!correct, manualReview: false } });
const part = (studentId, displayName, joinedAt, answers = []) => ({ studentId, displayName, joinedAt, readyAt: null, answers });
const sess = ({ status = "active", currentQuestionIndex = 0, qCount = 3, participants = [] }) => ({
  status, currentQuestionIndex,
  challengeSnapshot: { questions: Array.from({ length: qCount }, (_, i) => ({ question: { examQuestionId: "q" + i } })) },
  participants,
});

describe("competitionPointsForGrade", () => {
  it("is round(1000 * clamp(score/maxMarks,0,1)): correct=1000, half=500, wrong=0, partial supported", () => {
    expect(competitionPointsForGrade({ score: 1, maxMarks: 1, correct: true })).toBe(1000);
    expect(competitionPointsForGrade({ score: 0.5, maxMarks: 1 })).toBe(500);
    expect(competitionPointsForGrade({ score: 1, maxMarks: 2 })).toBe(500);
    expect(competitionPointsForGrade({ score: 2, maxMarks: 3 })).toBe(667);     // partial credit, rounded
    expect(competitionPointsForGrade({ score: 0, maxMarks: 1 })).toBe(0);
  });
  it("never negative, never above 1000, and maxMarks<=0 or a bad grade yields 0", () => {
    expect(competitionPointsForGrade({ score: -5, maxMarks: 2 })).toBe(0);      // clamp low → no negative points
    expect(competitionPointsForGrade({ score: 9, maxMarks: 2 })).toBe(1000);    // clamp high → capped at 1000
    expect(competitionPointsForGrade({ score: 1, maxMarks: 0 })).toBe(0);       // maxMarks 0 → 0 (not a division)
    expect(competitionPointsForGrade({ score: 0.5, maxMarks: 0 })).toBe(0);
    expect(competitionPointsForGrade(null)).toBe(0);
    expect(competitionPointsForGrade(undefined)).toBe(0);
    expect(competitionPointsForGrade({})).toBe(0);
    expect(competitionPointsForGrade({ score: "x", maxMarks: 1 })).toBe(0);     // non-numeric score → 0
  });
});

describe("completedRoundsCount (the leaderboard cutoff)", () => {
  it("lobby/closed → 0; active → current index (excludes current round); finished → all questions", () => {
    expect(completedRoundsCount(sess({ status: "lobby", currentQuestionIndex: null }))).toBe(0);
    expect(completedRoundsCount(sess({ status: "closed", currentQuestionIndex: 1 }))).toBe(0);
    expect(completedRoundsCount(sess({ status: "active", currentQuestionIndex: 0 }))).toBe(0);   // Q1 live → 0 completed
    expect(completedRoundsCount(sess({ status: "active", currentQuestionIndex: 2 }))).toBe(2);   // Q3 live → Q1,Q2 done
    expect(completedRoundsCount(sess({ status: "finished", currentQuestionIndex: 2, qCount: 3 }))).toBe(3);
  });
});

describe("buildLiveStandings", () => {
  it("NON-LEAK: an active round's answers are excluded until it completes", () => {
    // Q2 is live (currentQuestionIndex 1). s1 already answered BOTH Q1 (correct) and the live Q2 (correct).
    const s = sess({ status: "active", currentQuestionIndex: 1, participants: [
      part("s1", "أحمد", "j", [ans(0, 1, 1, true), ans(1, 1, 1, true)]),
    ] });
    const [row] = buildLiveStandings(s);
    expect(row).toMatchObject({ studentId: "s1", points: 1000, correctCount: 1, answeredCount: 1, rank: 1 });  // Q2 not counted
    // After finish, the same doc counts BOTH rounds.
    const done = buildLiveStandings({ ...s, status: "finished", qCount: 2, challengeSnapshot: { questions: [{ question: {} }, { question: {} }] } });
    expect(done[0]).toMatchObject({ points: 2000, correctCount: 2, answeredCount: 2 });
  });

  it("sorts points→correctCount→answeredCount→original order and assigns ranks 1,2,3,…", () => {
    const s = sess({ status: "finished", qCount: 3, participants: [
      part("s1", "A", "j", [ans(0, 1, 1, true), ans(1, 0, 1, false), ans(2, 0, 1, false)]),   // 1000, 1 correct, 3 answered
      part("s2", "B", "j", [ans(0, 1, 1, true), ans(1, 1, 1, true)]),                          // 2000, 2 correct, 2 answered
      part("s3", "C", "j", [ans(0, 1, 1, true), ans(1, 1, 1, true), ans(2, 0, 1, false)]),     // 2000, 2 correct, 3 answered
    ] });
    const st = buildLiveStandings(s);
    expect(st.map(r => r.studentId)).toEqual(["s3", "s2", "s1"]);   // s3 & s2 tie on points+correct → answeredCount breaks it
    expect(st.map(r => r.rank)).toEqual([1, 2, 3]);
    expect(st[0]).toMatchObject({ points: 2000, correctCount: 2, answeredCount: 3 });
  });

  it("final tie-break is original server order only (never a points/speed signal)", () => {
    // Two fully-tied students; the one who submitted LATER is listed first in server order → must rank first.
    const s = sess({ status: "finished", qCount: 1, participants: [
      part("first", "F", "j", [ans(0, 1, 1, true, "2026-01-01T00:00:09.000Z")]),   // slower submit, earlier in roster
      part("second", "S", "j", [ans(0, 1, 1, true, "2026-01-01T00:00:01.000Z")]),  // faster submit, later in roster
    ] });
    const st = buildLiveStandings(s);
    expect(st.map(r => r.studentId)).toEqual(["first", "second"]);  // speed did NOT promote the faster submitter
    expect(st.map(r => r.rank)).toEqual([1, 2]);
  });

  it("only the playing (joined) set is ranked; an unanswered completed round adds 0 and increments nothing", () => {
    const s = sess({ status: "finished", qCount: 2, participants: [
      part("s1", "A", "j", [ans(0, 1, 1, true)]),          // answered Q1, skipped Q2
      part("s2", "B", null, [ans(0, 1, 1, true)]),         // never joined → excluded entirely
    ] });
    const st = buildLiveStandings(s);
    expect(st).toHaveLength(1);
    expect(st[0]).toMatchObject({ studentId: "s1", points: 1000, correctCount: 1, answeredCount: 1, rank: 1 });
  });

  it("returns NO standings until a round completes: lobby (even with joined players), closed, and the live first round", () => {
    // lobby — no rounds completed → empty, even though a player has joined
    expect(buildLiveStandings(sess({ status: "lobby", currentQuestionIndex: null, participants: [] }))).toEqual([]);
    const joinedLobby = sess({ status: "lobby", currentQuestionIndex: null, participants: [part("s1", "A", "j", [])] });
    expect(completedRoundsCount(joinedLobby)).toBe(0);
    expect(buildLiveStandings(joinedLobby)).toEqual([]);            // no artificial rank:1 for a lobby
    // closed — no ranking
    const closed = sess({ status: "closed", currentQuestionIndex: 1, participants: [part("s1", "A", "j", [ans(0, 1, 1, true)])] });
    expect(buildLiveStandings(closed)).toEqual([]);
    // active first question — even if the student ALREADY submitted the live Q1, no round has completed yet → empty
    const firstLive = sess({ status: "active", currentQuestionIndex: 0, participants: [part("s1", "A", "j", [ans(0, 1, 1, true)])] });
    expect(completedRoundsCount(firstLive)).toBe(0);
    expect(buildLiveStandings(firstLive)).toEqual([]);
    // once the teacher advances to Q2, Q1 has completed → real standings appear
    const advanced = sess({ status: "active", currentQuestionIndex: 1, participants: [part("s1", "A", "j", [ans(0, 1, 1, true)])] });
    expect(buildLiveStandings(advanced)).toEqual([{ studentId: "s1", displayName: "A", points: 1000, correctCount: 1, answeredCount: 1, rank: 1 }]);
  });

  it("tolerates a backward-compat participant with no answers array (old 4A/4B blob)", () => {
    const s = sess({ status: "finished", qCount: 1, participants: [{ studentId: "s1", displayName: "A", joinedAt: "j" }] });
    expect(buildLiveStandings(s)).toEqual([{ studentId: "s1", displayName: "A", points: 0, correctCount: 0, answeredCount: 0, rank: 1 }]);
  });
});
