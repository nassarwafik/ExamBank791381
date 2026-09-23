// Live Challenge — PERSISTENT PODIUM RECOGNITION (Phase 4D). When a live session reaches the authoritative
// `status === "finished"`, the Phase 4C Top-3 final standings are persisted as REAL recognition medals through the
// EXISTING achievement feed (recordAchievementEvent) — the same create-only, deterministic-id storage that assessment
// medals use. There is NO second ranking authority: the placement comes ONLY from buildLiveStandings(finishedSession).
//
// A game medal is RECOGNITION ONLY. It contributes 0 Strength (nothing here touches student-strength.js), it does not
// mutate any counter, and it is derived from FINAL PLACEMENT alone — never from percentage, academic grade, speed,
// answer time, current-round state, or any client-supplied rank/points. Recognition is SECONDARY: this module is
// best-effort and isolated so a persistence failure can never turn a successful finish into a game failure.

const { buildLiveStandings } = require("./live-challenge-standings");
const { recordAchievementEvent } = require("./achievement-feed");
const { downloadJsonOrNull } = require("./platform-storage");

// Final placement → medal tier. Rank 4+ gets no medal (absent from this map). This is the ONLY placement→tier mapping.
const PLACEMENT_TIER = { 1: "gold", 2: "silver", 3: "bronze" };
const GAME_TYPE = "live_challenge";

/**
 * Persist Top-3 recognition medals for a FINISHED live session. Idempotent per (session, student, placement) via the
 * deterministic create-only event id `game_live_<sessionId>_place_<rank>_<studentId>`: calling it twice for the same
 * finished session creates ZERO duplicates, while a different session legitimately awards its own medals. Returns
 * `{ created }` (number of new medal events written). Never throws for the normal domain cases; the caller also wraps
 * it so an injected/unexpected failure cannot fail the finish.
 *
 * @param container storage container
 * @param session   the AUTHORITATIVE finished session document (post-finish CAS result)
 * @param deps      optional DI seam (downloadJsonOrNull, recordAchievementEvent, buildLiveStandings, now)
 */
async function recordLiveChallengePodiumMedals(container, session, deps = {}) {
  // Only a genuinely finished session awards medals. A lobby / active / closed (aborted) session awards nothing.
  if (!session || session.status !== "finished") return { created: 0 };
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const record = deps.recordAchievementEvent || recordAchievementEvent;
  const standings = (deps.buildLiveStandings || buildLiveStandings)(session);
  const podium = (Array.isArray(standings) ? standings : []).slice(0, 3);   // never more than three
  const sessionId = String(session.sessionId || session.joinCode || "");
  const classId = String(session.classId || "");
  const challengeId = String(session.challengeId || "");
  const challengeTitle = String(session.challengeTitle || "");
  const now = deps.now || new Date().toISOString();
  let created = 0;
  for (const row of podium) {
    const placement = Number(row && row.rank);
    const tier = PLACEMENT_TIER[placement];
    if (!tier) continue;                                        // only ranks 1-3 (defense in depth; podium is ≤3)
    const studentId = String(row.studentId || "");
    if (!studentId || !classId) continue;                       // cannot store a feed post without both
    // PRIVACY: read the winner's CURRENT authoritative profile and honor shareAchievements. Fail PRIVACY-SAFE — if the
    // user record cannot be loaded, classmates must not see the medal (owner + teacher + counts still get it).
    let shareWithClass = false;
    try {
      const user = await dl(container, "platform/users/" + studentId + ".json");
      shareWithClass = !!user && user.shareAchievements !== false;
    } catch { shareWithClass = false; }
    // Deterministic, create-only id: uniquely one student's placement in one finished session; ends `_<studentId>`.
    const postId = "game_live_" + sessionId + "_place_" + placement + "_" + studentId;
    const ok = await record(container, {
      eventType: "medal",
      postId,
      classId,
      studentId,
      studentDisplayName: String(row.displayName || ""),
      shareWithClass,
      now,
      // Backward-compatible medal payload: `assignmentTitle` reuses the existing compatibility title field; the game
      // fields are additive so historical (source-absent) assessment medals keep working unchanged.
      medal: {
        tier,
        source: "game",
        sourceId: sessionId,
        gameType: GAME_TYPE,
        placement,
        challengeId,
        assignmentTitle: challengeTitle,
      },
    });
    if (ok) created += 1;
  }
  return { created };
}

module.exports = { recordLiveChallengePodiumMedals, PLACEMENT_TIER, GAME_TYPE };
