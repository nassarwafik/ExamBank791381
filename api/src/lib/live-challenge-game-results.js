// Live Challenge — ASSIGNED-GAME RESULT RECORDING (Phase 4E). When a live session reaches the authoritative
// `status === "finished"`, each PLAYING participant's server-derived PERFORMANCE percentage is merged BEST-ONLY into
// their per-student educational-game results store (platform/games/results/<studentId>.json). Those results feed
// Strength `gamePoints` (round(best × 20 / 100), ≤ 20 per assigned game, no global cap).
//
// A teacher-created Live Challenge (the teacher selected the class + students) IS an assigned educational game, so a
// finished session's players are eligible. Free play / unassigned games never call this, so they never award Strength.
// This is RECOGNITION-INDEPENDENT: it reads the game PERCENTAGE (grades), never a medal, podium placement, or rank —
// medals stay 0 Strength. It is SECONDARY and best-effort/isolated: a recording failure never affects the game finish.
// BEST-only + create-only-idempotent: replaying the same challenge only ever RAISES the best; re-recording the same
// finished session writes nothing (mergeBestResult returns changed=false → the CAS callback throws NoChange, no write).

const { mutateJsonWithRetry } = require("./platform-storage");
const { liveChallengeGamePercentages } = require("./live-challenge-standings");
const { gameResultsDocName, mergeBestResult } = require("./game-results-store");

/** Thrown inside the CAS callback to SKIP the write when the merge changes nothing (best not improved) — idempotent. */
class NoChange extends Error {}

/**
 * Record each playing participant's best educational-game result for a FINISHED live session. Returns `{ recorded }`
 * (number of student docs actually written this call). Non-finished → nothing. Each per-student write is an isolated
 * best-effort CAS: one student's failure never blocks another, and the caller also wraps the whole call.
 *
 * @param container storage container
 * @param session   the AUTHORITATIVE finished session document (post-finish CAS result)
 * @param deps      optional DI seam (mutateJsonWithRetry, liveChallengeGamePercentages, now)
 */
async function recordLiveChallengeGameResults(container, session, deps = {}) {
  if (!session || session.status !== "finished") return { recorded: 0 };
  const mutate = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const rows = (deps.liveChallengeGamePercentages || liveChallengeGamePercentages)(session);
  const challengeId = String(session.challengeId || "");
  const title = String(session.challengeTitle || "");
  const now = deps.now || new Date().toISOString();
  // ONE assignment key per authored challenge, so replaying the SAME challenge (a new session) updates that game's best
  // rather than adding a second game; two DIFFERENT challenges are two keys that add separately (each capped 0..20).
  const key = "live_challenge:" + (challengeId || "unknown");
  let recorded = 0;
  for (const row of rows) {
    const studentId = String(row.studentId || "");
    if (!studentId) continue;
    try {
      await mutate(container, gameResultsDocName(studentId), current => {
        const { doc, changed } = mergeBestResult(current, { key, gameType: "live_challenge", challengeId, title, percentage: row.percentage, now });
        if (!changed) throw new NoChange();   // best not improved → no write (idempotent, no churn)
        return doc;
      });
      recorded += 1;
    } catch (e) {
      if (e instanceof NoChange) continue;    // expected best-only skip — not a failure
      // Secondary/isolated: swallow a storage failure for this student so recording never affects gameplay.
    }
  }
  return { recorded };
}

module.exports = { recordLiveChallengeGameResults };
