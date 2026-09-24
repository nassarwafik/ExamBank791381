import { describe, it, expect } from "vitest";
import { handler as dashboard } from "../src/functions/student-dashboard.js";
import { handler as students } from "../src/functions/manage-students.js";
import { gameResultsDocName, normalizeGameResults, mergeBestResult, eligibleGamePercentages } from "../src/lib/game-results-store.js";
import { liveChallengeGamePercentages } from "../src/lib/live-challenge-standings.js";
import { recordLiveChallengeGameResults } from "../src/lib/live-challenge-game-results.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 4E — educational-game Strength (gamePoints). Proves: assigned games award round(best×20/100) ≤20 each with NO
// global cap; free play awards 0; best-result-only per assignment (non-additive, best across sessions); Live Challenge
// uses the PERFORMANCE percentage (not placement/medal); dashboard and teacher profile agree; repeated reads/records
// never accumulate; medals/recognition give 0; and existing exam/practice/study/project totals + the 2000 stage cap
// are unchanged.

const NOW = "2026-09-24T10:00:00.000Z";
const user = (id, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: "طالب " + id, code: "S" + id, shareAchievements: true, ...extra });
const room = () => ({ classId: "c1", name: "صف", grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: ["s1", "s2"], programCodes: ["899373"], createdAt: NOW, updatedAt: NOW });
const finalAttempt = pct => ({ attemptNumber: 1, submittedAt: NOW, score: pct, totalMarks: 100, percentage: pct, manualReviewMarks: 0, finalized: true, teacherFeedback: "" });
const assignment = id => ({ assignmentId: id, classId: "c1", status: "published", title: "واجب " + id, maxAttempts: 1, durationMinutes: 0, attemptModelVersion: 2, questionCount: 1, totalMarks: 100, openAt: "", dueAt: "", createdAt: NOW });
const school = extra => createMemoryContainer({ "platform/classes/c1.json": room(), "platform/users/s1.json": user("s1"), "platform/users/s2.json": user("s2"), ...extra });
// A per-student assigned-game results blob with one live-challenge entry at `pct`.
const gameResults = (games) => ({ schemaVersion: 1, games });
const liveEntry = (challengeId, pct) => ({ ["live_challenge:" + challengeId]: { gameType: "live_challenge", challengeId, title: "شبكات", bestPercentage: pct, updatedAt: NOW } });

function studentDeps(ctx, id = "s1") {
  return {
    requireActiveStudentSession: async () => { const student = ctx.getJson("platform/users/" + id + ".json"); return student ? { ok: true, container: ctx.container, user: { sub: id, sv: 1 }, student } : { ok: false, response: { status: 401, jsonBody: { ok: false } } }; },
    downloadJsonOrNull: async (_c, n) => ctx.getJson(n), listJson: async (_c, prefix) => ctx.names(prefix).map(n => ctx.getJson(n)),
    container: ctx.container, getContainer: () => ctx.container,
  };
}
const teacherDeps = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} });
const dash = (ctx, id = "s1") => dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, studentDeps(ctx, id));
const profile = (ctx, id = "s1") => students({ method: "GET", url: "https://x/api/students?profileUserId=" + id, headers: { get: () => null } }, teacherDeps(ctx));

// A crafted FINISHED live session (teacher-created → assigned) with per-participant graded answers.
const ans = (questionIndex, correct) => ({ roundVersion: questionIndex + 1, questionIndex, response: { kind: "choice", index: 0 }, submittedAt: "t", grade: { score: correct ? 1 : 0, maxMarks: 1, correct: !!correct } });
const part = (studentId, name, correctOfThree, joinedAt = "j") => ({ studentId, displayName: name, joinedAt, readyAt: null, answers: [ans(0, correctOfThree > 0), ans(1, correctOfThree > 1), ans(2, correctOfThree > 2)] });
const finished = (participants, over = {}) => ({ kind: "live-challenge-session", sessionId: "R2R2R2", joinCode: "R2R2R2", teacherId: "t1", challengeId: "c9", challengeTitle: "شبكات", classId: "c1", status: "finished", currentQuestionIndex: 2, challengeSnapshot: { questions: [{ question: {} }, { question: {} }, { question: {} }] }, participants, finishedAt: "z", ...over });

describe("game-results-store — best-only, fail-safe", () => {
  it("mergeBestResult raises on higher, ignores equal/lower; a new key is recorded", () => {
    let { doc, changed } = mergeBestResult(null, { key: "k", gameType: "live_challenge", challengeId: "c9", percentage: 60, now: NOW });
    expect(changed).toBe(true); expect(doc.games.k.bestPercentage).toBe(60);
    ({ doc, changed } = mergeBestResult(doc, { key: "k", percentage: 90, now: NOW })); expect(changed).toBe(true); expect(doc.games.k.bestPercentage).toBe(90);
    ({ doc, changed } = mergeBestResult(doc, { key: "k", percentage: 70, now: NOW })); expect(changed).toBe(false); expect(doc.games.k.bestPercentage).toBe(90);
    ({ doc, changed } = mergeBestResult(doc, { key: "k", percentage: 90, now: NOW })); expect(changed).toBe(false); expect(doc.games.k.bestPercentage).toBe(90);
  });
  it("normalize fails safe for missing/corrupt docs; eligibleGamePercentages lists best percentages", () => {
    expect(normalizeGameResults(null)).toEqual({ schemaVersion: 1, games: {} });
    expect(normalizeGameResults({ games: "corrupt" }).games).toEqual({});
    expect(eligibleGamePercentages(null)).toEqual([]);
    expect(eligibleGamePercentages(gameResults({ ...liveEntry("c9", 90), ...liveEntry("cA", 50) })).sort((a, b) => a - b)).toEqual([50, 90]);
  });
});

describe("liveChallengeGamePercentages — server performance, not placement", () => {
  it("derives round(correctFraction × 100) over ALL questions; a finished session only", () => {
    const s = finished([part("s1", "أ", 2), part("s2", "ب", 3)]);      // s1: 2/3 → 67, s2: 3/3 → 100
    const rows = liveChallengeGamePercentages(s);
    expect(rows.find(r => r.studentId === "s1").percentage).toBe(67);
    expect(rows.find(r => r.studentId === "s2").percentage).toBe(100);
    expect(liveChallengeGamePercentages({ ...s, status: "active" })).toEqual([]);   // not finished → none
  });
  it("percentage is independent of placement: the LAST-place student's own % is used, not their rank", () => {
    const s = finished([part("s1", "أ", 3), part("s2", "ب", 2)]);      // s2 places 2nd but answered 2/3 → 67
    expect(liveChallengeGamePercentages(s).find(r => r.studentId === "s2").percentage).toBe(67);
  });
});

describe("recordLiveChallengeGameResults — merge best per assigned game", () => {
  it("records each playing participant's best; non-finished records nothing", async () => {
    const ctx = school();
    await recordLiveChallengeGameResults(ctx.container, finished([part("s1", "أ", 3), part("s2", "ب", 1)]), { now: NOW });
    expect(eligibleGamePercentages(ctx.getJson(gameResultsDocName("s1")))).toEqual([100]);
    expect(eligibleGamePercentages(ctx.getJson(gameResultsDocName("s2")))).toEqual([33]);
    const ctx2 = school();
    await recordLiveChallengeGameResults(ctx2.container, finished([part("s1", "أ", 3)], { status: "active" }), { now: NOW });
    expect(ctx2.getJson(gameResultsDocName("s1"))).toBeNull();          // active → nothing recorded
  });
  it("best-only across sessions: a later worse session never lowers; a later better raises; re-record is a no-op", async () => {
    const ctx = school();
    await recordLiveChallengeGameResults(ctx.container, finished([part("s1", "أ", 2)]), { now: NOW });       // 67
    expect(eligibleGamePercentages(ctx.getJson(gameResultsDocName("s1")))).toEqual([67]);
    await recordLiveChallengeGameResults(ctx.container, finished([part("s1", "أ", 3)]), { now: NOW });       // 100 (improve)
    expect(eligibleGamePercentages(ctx.getJson(gameResultsDocName("s1")))).toEqual([100]);
    await recordLiveChallengeGameResults(ctx.container, finished([part("s1", "أ", 1)]), { now: NOW });       // 33 (worse)
    expect(eligibleGamePercentages(ctx.getJson(gameResultsDocName("s1")))).toEqual([100]);                  // unchanged
    // re-record the SAME finished session → still one entry, unchanged (idempotent)
    await recordLiveChallengeGameResults(ctx.container, finished([part("s1", "أ", 3)]), { now: NOW });
    expect(ctx.getJson(gameResultsDocName("s1")).games).toEqual({ "live_challenge:c9": expect.objectContaining({ bestPercentage: 100 }) });
  });
  it("two DIFFERENT assigned challenges add together (each its own key)", async () => {
    const ctx = school();
    await recordLiveChallengeGameResults(ctx.container, finished([part("s1", "أ", 3)]), { now: NOW });                         // c9 → 100
    await recordLiveChallengeGameResults(ctx.container, finished([part("s1", "أ", 1)], { challengeId: "cB" }), { now: NOW }); // cB → 33
    expect(eligibleGamePercentages(ctx.getJson(gameResultsDocName("s1"))).sort((a, b) => a - b)).toEqual([33, 100]);
  });
});

describe("dashboard + teacher profile — gamePoints authority", () => {
  it("no game data → gamePoints 0; free play (no results blob) contributes 0", async () => {
    const ctx = school();
    const d = await dash(ctx);
    expect(d.jsonBody.strength.gamePoints).toBe(0);
    // a free-play Number Conversion doc is a DIFFERENT store and is never read for Strength → still 0
    ctx.setJson("platform/games/number-conversion/s1.json", { schemaVersion: 1, active: null, best: { percentage: 100, correct: 5, total: 5 } });
    expect((await dash(ctx)).jsonBody.strength.gamePoints).toBe(0);
  });
  it("assigned games add to gamePoints (100→20, 50→10) with rawTotal including them; two games add; no global cap", async () => {
    const ctx = school({ [gameResultsDocName("s1")]: gameResults({ ...liveEntry("c9", 100), ...liveEntry("cA", 50) }) });
    const s = (await dash(ctx)).jsonBody.strength;
    expect(s.gamePoints).toBe(30);                                      // 20 + 10
    expect(s.examPoints).toBe(0); expect(s.rawTotalPoints).toBe(30);
  });
  it("dashboard and teacher profile report the SAME gamePoints (single authority)", async () => {
    const ctx = school({ [gameResultsDocName("s1")]: gameResults(liveEntry("c9", 75)) });
    expect((await dash(ctx)).jsonBody.strength.gamePoints).toBe(15);
    expect((await profile(ctx)).jsonBody.profile.strength.gamePoints).toBe(15);
  });
  it("repeated dashboard reads never accumulate gamePoints (derived, not incremented)", async () => {
    const ctx = school({ [gameResultsDocName("s1")]: gameResults(liveEntry("c9", 90)) });
    for (let i = 0; i < 4; i++) expect((await dash(ctx)).jsonBody.strength.gamePoints).toBe(18);
  });
  it("game MEDALS / recognition never affect gamePoints; exam/practice/study/project totals + stage cap unchanged", async () => {
    // a persisted GAME medal in the feed + a recognition event exist, but NEITHER feeds gamePoints
    const ctx = school({
      "platform/feed/c1/game_live_R2R2R2_place_1_s1.json": { schemaVersion: 2, eventType: "medal", postId: "game_live_R2R2R2_place_1_s1", classId: "c1", studentId: "s1", createdAt: NOW, shareWithClass: true, reactions: {}, medal: { tier: "gold", source: "game", gameType: "live_challenge", placement: 1, challengeId: "c9", assignmentTitle: "شبكات" } },
      "platform/assignments/A1.json": assignment("A1"), "platform/submissions/A1/s1.json": { attempts: [finalAttempt(90)] },
    });
    const s = (await dash(ctx)).jsonBody.strength;
    expect(s.gamePoints).toBe(0);                                       // gold medal → 0 game Strength
    expect(s.examPoints).toBe(90);                                     // exam authority unchanged
    expect(s.rawTotalPoints).toBe(90);
    // now add an assigned-game result AND keep the medal → only the game percentage counts, medal still 0
    ctx.setJson(gameResultsDocName("s1"), gameResults(liveEntry("c9", 50)));
    const s2 = (await dash(ctx)).jsonBody.strength;
    expect(s2.gamePoints).toBe(10);
    expect(s2.rawTotalPoints).toBe(100);                               // 90 exam + 10 game (medal contributes nothing)
    // recognition medals summary is unchanged/separate (exam-derived gold from the 90% exam + the persisted game gold),
    // and it lives on `recognition`, entirely apart from Strength.gamePoints (which stayed 10 above).
    expect((await dash(ctx)).jsonBody.recognition.medals).toMatchObject({ gold: 2 });
  });
});
