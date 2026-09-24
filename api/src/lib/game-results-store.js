// Educational-game RESULTS store (Phase 4E) — the per-student record of teacher-ASSIGNED game performance that feeds
// Strength `gamePoints`. ONE bounded blob per student at platform/games/results/<studentId>.json:
//
//   { schemaVersion: 1, games: { "<assignmentKey>": { gameType, challengeId, title, bestPercentage, updatedAt } } }
//
// Only ASSIGNED games are ever written here (a finished teacher-created Live Challenge; free-play Number Conversion is
// never recorded), so eligibility is established BY CONSTRUCTION — a game present in this store is an assigned game.
// The stored percentage is the SERVER-authoritative game PERFORMANCE percentage (never a placement, medal tier, or a
// client value). BEST-only is enforced by mergeBestResult: a later attempt/session of the SAME assignment key only ever
// RAISES bestPercentage, never lowers it and never accumulates; two DIFFERENT games are two keys that add separately.
// Pure module (no IO): the caller owns storage + CAS. Tolerant of missing/corrupt data (fails safe to an empty record).

const GAME_RESULTS_PREFIX = "platform/games/results/";
/** The blob path for a student's assigned-game results. */
const gameResultsDocName = studentId => GAME_RESULTS_PREFIX + String(studentId || "").trim() + ".json";

/** A percentage clamped to an integer 0..100 (NaN / malformed / <0 / >100 → safe 0..100). */
function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** A well-formed results document from whatever is stored (missing / malformed / corrupt → an empty record). Never
 *  trusts a stored Strength/points value — only the best PERCENTAGE per game is kept, and it is re-clamped on read. */
function normalizeGameResults(doc) {
  const out = { schemaVersion: 1, games: {} };
  if (!doc || typeof doc !== "object" || !doc.games || typeof doc.games !== "object") return out;
  for (const [key, entry] of Object.entries(doc.games)) {
    if (!key || !entry || typeof entry !== "object") continue;
    out.games[String(key)] = {
      gameType: String(entry.gameType || ""),
      challengeId: String(entry.challengeId || ""),
      title: String(entry.title || ""),
      bestPercentage: clampPct(entry.bestPercentage),
      updatedAt: String(entry.updatedAt || ""),
    };
  }
  return out;
}

/**
 * Merge a game result into the store as BEST-ONLY. Returns `{ doc, changed }`:
 *   • a NEW assignment key → recorded (changed);
 *   • a HIGHER percentage than the stored best → raised (changed);
 *   • an equal / LOWER percentage → left unchanged (changed=false), so a replay at the same or a worse score never
 *     lowers Strength and re-recording the same finished session is a no-op (idempotent, no write).
 * The percentage is clamped 0..100. The caller passes only assigned-game results (free play is never merged here).
 */
function mergeBestResult(doc, { key, gameType, challengeId, title, percentage, now } = {}) {
  const normalized = normalizeGameResults(doc);
  const k = String(key || "");
  if (!k) return { doc: normalized, changed: false };
  const pct = clampPct(percentage);
  const existing = normalized.games[k];
  if (existing && pct <= existing.bestPercentage) return { doc: normalized, changed: false };   // best-only, non-additive
  normalized.games[k] = {
    gameType: String(gameType || (existing && existing.gameType) || ""),
    challengeId: String(challengeId != null ? challengeId : (existing && existing.challengeId) || ""),
    title: String(title != null ? title : (existing && existing.title) || ""),
    bestPercentage: pct,
    updatedAt: String(now || new Date().toISOString()),
  };
  return { doc: normalized, changed: true };
}

/** The list of best percentages across ALL recorded (assigned) games — the input Strength sums into gamePoints. Each
 *  recorded game is eligible by construction. A missing/corrupt document fails safe to []. */
function eligibleGamePercentages(doc) {
  const normalized = normalizeGameResults(doc);
  return Object.values(normalized.games).map(g => g.bestPercentage);
}

module.exports = {
  GAME_RESULTS_PREFIX, gameResultsDocName,
  clampPct, normalizeGameResults, mergeBestResult, eligibleGamePercentages,
};
