import { describe, it, expect } from "vitest";
import { recordLiveChallengePodiumMedals } from "../src/lib/live-challenge-recognition.js";
import { FEED_PREFIX, feedBlobName } from "../src/lib/achievement-feed.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 4D — persistent Top-3 recognition medals from a FINISHED live session. Proves the placement→tier mapping
// (1→gold, 2→silver, 3→bronze, 4+→none) is driven ONLY by the Phase 4C server standings, is idempotent per
// (session, student, placement) through the existing create-only feed writer, honors shareAchievements (privacy-safe
// fallback), awards nothing unless finished, and carries safe game metadata with a deterministic id.

const NOW = "2026-09-23T10:00:00.000Z";
const user = (id, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, classId: "c1", displayName: "طالب " + id, shareAchievements: true, ...extra });
const ans = (questionIndex, correct) => ({ roundVersion: questionIndex + 1, questionIndex, response: { kind: "choice", index: 0 }, submittedAt: "t", grade: { score: correct ? 1 : 0, maxMarks: 1, correct: !!correct } });
const part = (studentId, displayName, correctCount, joinedAt = "j") => {
  const answers = []; for (let i = 0; i < 3; i++) answers.push(ans(i, i < correctCount));
  return { studentId, displayName, joinedAt, readyAt: null, answers };
};
const finished = (participants, over = {}) => ({
  kind: "live-challenge-session", sessionId: "R2R2R2", joinCode: "R2R2R2", teacherId: "t1",
  challengeId: "c9", challengeTitle: "شبكات", classId: "c1", status: "finished",
  currentQuestionIndex: 2, challengeSnapshot: { questions: [{ question: {} }, { question: {} }, { question: {} }] },
  participants, finishedAt: "z", ...over,
});
const school = extra => createMemoryContainer({ "platform/users/A.json": user("A"), "platform/users/B.json": user("B"), "platform/users/C.json": user("C"), "platform/users/D.json": user("D"), ...extra });
const blob = (ctx, postId) => ctx.getJson(feedBlobName("c1", postId));
const gameBlobs = ctx => ctx.names(FEED_PREFIX).filter(n => n.includes("/game_live_")).sort();

describe("Phase 4D — recordLiveChallengePodiumMedals", () => {
  // A>B>C>D by correctCount → points, so ranks are deterministic 1..4.
  const roomFour = () => finished([part("A", "أحمد", 3), part("B", "بلال", 2), part("C", "جود", 1), part("D", "دانا", 0)]);

  it("awards gold/silver/bronze to the top three ONLY (rank 4+ gets nothing), from the final standings", async () => {
    const ctx = school();
    const r = await recordLiveChallengePodiumMedals(ctx.container, roomFour(), { now: NOW });
    expect(r.created).toBe(3);
    expect(blob(ctx, "game_live_R2R2R2_place_1_A").medal).toMatchObject({ tier: "gold", source: "game", gameType: "live_challenge", placement: 1, challengeId: "c9", assignmentTitle: "شبكات" });
    expect(blob(ctx, "game_live_R2R2R2_place_2_B").medal).toMatchObject({ tier: "silver", placement: 2 });
    expect(blob(ctx, "game_live_R2R2R2_place_3_C").medal).toMatchObject({ tier: "bronze", placement: 3 });
    expect(blob(ctx, "game_live_R2R2R2_place_4_D")).toBeNull();      // 4th place → no medal
    expect(gameBlobs(ctx)).toHaveLength(3);
    // deterministic post shape: eventType medal, correct student/class, id ends _<studentId>
    const gold = blob(ctx, "game_live_R2R2R2_place_1_A");
    expect(gold).toMatchObject({ eventType: "medal", studentId: "A", classId: "c1", postId: "game_live_R2R2R2_place_1_A", shareWithClass: true });
  });

  it("two players → gold + silver only; one player → gold only (never a fabricated place)", async () => {
    const ctx2 = school();
    await recordLiveChallengePodiumMedals(ctx2.container, finished([part("A", "أحمد", 2), part("B", "بلال", 1)]), { now: NOW });
    expect(gameBlobs(ctx2).map(n => n.split("/").pop())).toEqual(["game_live_R2R2R2_place_1_A.json", "game_live_R2R2R2_place_2_B.json"]);
    const ctx1 = school();
    await recordLiveChallengePodiumMedals(ctx1.container, finished([part("A", "أحمد", 1)]), { now: NOW });
    expect(gameBlobs(ctx1).map(n => n.split("/").pop())).toEqual(["game_live_R2R2R2_place_1_A.json"]);
  });

  it("awards NOTHING unless the session is authoritatively finished (lobby/active/closed → 0)", async () => {
    for (const status of ["lobby", "active", "closed"]) {
      const ctx = school();
      const r = await recordLiveChallengePodiumMedals(ctx.container, finished([part("A", "أحمد", 3), part("B", "بلال", 1)], { status }), { now: NOW });
      expect(r.created).toBe(0);
      expect(gameBlobs(ctx)).toHaveLength(0);
    }
  });

  it("is idempotent: recording the SAME finished session twice creates zero duplicates", async () => {
    const ctx = school();
    const first = await recordLiveChallengePodiumMedals(ctx.container, roomFour(), { now: NOW });
    const second = await recordLiveChallengePodiumMedals(ctx.container, roomFour(), { now: "2026-09-23T11:00:00.000Z" });
    expect(first.created).toBe(3);
    expect(second.created).toBe(0);                                  // create-only: nothing new
    expect(gameBlobs(ctx)).toHaveLength(3);
    expect(blob(ctx, "game_live_R2R2R2_place_1_A").createdAt).toBe(NOW);   // original post untouched
  });

  it("different sessions award separate medals to the same student", async () => {
    const ctx = school();
    await recordLiveChallengePodiumMedals(ctx.container, finished([part("A", "أحمد", 3), part("B", "بلال", 1)], { sessionId: "AAAAAA", joinCode: "AAAAAA" }), { now: NOW });
    await recordLiveChallengePodiumMedals(ctx.container, finished([part("B", "بلال", 3), part("A", "أحمد", 1)], { sessionId: "BBBBBB", joinCode: "BBBBBB" }), { now: NOW });
    expect(blob(ctx, "game_live_AAAAAA_place_1_A").medal.tier).toBe("gold");   // A gold in session A
    expect(blob(ctx, "game_live_BBBBBB_place_2_A").medal.tier).toBe("silver"); // A silver in session B
    expect(gameBlobs(ctx)).toHaveLength(4);
  });

  it("privacy: shareAchievements=false → shareWithClass:false; unreadable profile fails privacy-safe; owner/teacher keep it", async () => {
    const ctx = school({ "platform/users/A.json": user("A", { shareAchievements: false }) });
    ctx.store.delete("platform/users/C.json");   // C's profile is unreadable → privacy-safe fallback expected
    const r = await recordLiveChallengePodiumMedals(ctx.container, finished([part("A", "أحمد", 3), part("B", "بلال", 2), part("C", "جود", 1)]), { now: NOW });
    expect(r.created).toBe(3);
    expect(blob(ctx, "game_live_R2R2R2_place_1_A").shareWithClass).toBe(false);   // sharing OFF
    expect(blob(ctx, "game_live_R2R2R2_place_2_B").shareWithClass).toBe(true);    // default ON
    expect(blob(ctx, "game_live_R2R2R2_place_3_C").shareWithClass).toBe(false);   // unreadable profile → privacy-safe
  });

  it("no client value can determine tier/placement — only the server standings do", async () => {
    const ctx = school();
    // Even if a participant carries bogus client-ish fields, buildLiveStandings ignores them; ranking is by grades.
    const s = finished([{ studentId: "A", displayName: "أحمد", joinedAt: "j", rank: 1, points: 99999, answers: [ans(0, false), ans(1, false), ans(2, false)] }, part("B", "بلال", 3)]);
    await recordLiveChallengePodiumMedals(ctx.container, s, { now: NOW });
    // B actually answered 3 correct → B is gold, A is silver (server truth), regardless of A's bogus rank/points.
    expect(blob(ctx, "game_live_R2R2R2_place_1_B").medal.tier).toBe("gold");
    expect(blob(ctx, "game_live_R2R2R2_place_2_A").medal.tier).toBe("silver");
  });
});
