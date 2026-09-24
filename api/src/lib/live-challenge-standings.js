// Live Challenge — COMPETITION STANDINGS derivation (Phase 4C). Pure, self-contained module (no IO, no store import,
// so there is NO circular dependency: the session store requires THIS file, never the reverse). It derives the live
// leaderboard from the AUTHORITATIVE server document only — specifically each playing participant's stored answer
// records and their SERVER-STORED `grade` — and never trusts any client-provided points/rank/score/correctCount.
//
// Competition points are a SEPARATE, presentation-only ranking signal. They are NOT academic marks: this module never
// mutates `grade.score`/`grade.maxMarks` and its output is never written into any academic / Strength / gamePoints
// total (Phase 4C persists nothing — it only derives a view). There is NO speed bonus: submittedAt / elapsed / order /
// latency never affect points or ranking (submittedAt stays in the record for audit only and is ignored here).
//
// CRITICAL non-leak cutoff: during an ACTIVE round the leaderboard counts ONLY rounds that are strictly COMPLETED —
// those whose questionIndex is < the current question index — even if some students already submitted the current
// round. The current round's points therefore appear only after the teacher advances (next) or finishes. A FINISHED
// session counts every round; a lobby / closed session counts none.

/** Clamp to the [0,1] fraction range (guards a negative or over-max stored score → never a negative or >1000 points). */
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

/**
 * Deterministic competition points for ONE stored grade: fraction = maxMarks>0 ? clamp(score/maxMarks,0,1) : 0, then
 * round(1000 * fraction). Fully correct → 1000, half credit → 500, wrong / ungraded → 0, partial credit supported.
 * Never negative, never above 1000 per question. Uses the SERVER-STORED grade only (never a recompute from the client).
 */
function competitionPointsForGrade(grade) {
  const g = grade && typeof grade === "object" ? grade : {};
  const max = Number(g.maxMarks);
  const score = Number(g.score);
  if (!(max > 0) || !Number.isFinite(score)) return 0;
  return Math.round(1000 * clamp01(score / max));
}

// ── Tolerant readers (self-contained; independent of the store so this file never imports it) ────────────────────
function questionCountOf(session) {
  const s = session && session.challengeSnapshot;
  return s && Array.isArray(s.questions) ? s.questions.length : 0;
}
function currentIndexOf(session) {
  return Number.isInteger(session && session.currentQuestionIndex) ? session.currentQuestionIndex : null;
}
/** The playing set: participants who actually joined before the game started (the answer denominator). */
function playingParticipants(session) {
  return (session && Array.isArray(session.participants) ? session.participants : []).filter(p => p && !!p.joinedAt);
}
function answersOf(participant) {
  return participant && Array.isArray(participant.answers) ? participant.answers : [];
}

/**
 * How many rounds are COMPLETED for standings purposes (the leaderboard cutoff, expressed as a questionIndex boundary):
 *   • active   → the current question index (rounds strictly before the current one; excludes the current round)
 *   • finished → every round (the full question count)
 *   • lobby / closed / anything else → 0 (no leaderboard)
 * An answer counts toward standings iff its questionIndex is < this value.
 */
function completedRoundsCount(session) {
  const status = session && session.status;
  if (status === "finished") return questionCountOf(session);
  if (status === "active") {
    const idx = currentIndexOf(session);
    return Number.isInteger(idx) && idx > 0 ? idx : 0;
  }
  return 0;
}

/**
 * Build the authoritative live standings from the session document. One row per playing participant:
 *   { studentId, displayName, points, correctCount, answeredCount, rank }
 * Only answers for COMPLETED rounds (questionIndex < completedRoundsCount) are counted; an unanswered completed round
 * contributes 0 points and increments nothing. Sort (deterministic, NO speed component):
 *   points desc → correctCount desc → answeredCount desc → original server participant order (stable display tie-break)
 * Ranks are then assigned 1,2,3,… by sorted position. `correctCount` counts answers whose stored grade.correct===true;
 * `answeredCount` counts completed rounds that have an answer record.
 */
function buildLiveStandings(session) {
  const cutoff = completedRoundsCount(session);
  // No meaningful ranking exists until at least one round has COMPLETED: a lobby, a closed session, and an active
  // first question (even if students already submitted it) all have cutoff 0 and return NO standings. This is the
  // authoritative server contract — the server never exposes an artificial 0-point ranking, and the frontend's
  // completedRounds>=1 gate merely mirrors it. Ranking appears only once a round is behind the current one (or finish).
  if (cutoff <= 0) return [];
  const rows = playingParticipants(session).map((p, order) => {
    let points = 0, correctCount = 0, answeredCount = 0;
    for (const a of answersOf(p)) {
      if (!a || !Number.isInteger(a.questionIndex) || a.questionIndex >= cutoff) continue;   // only completed rounds
      answeredCount += 1;
      points += competitionPointsForGrade(a.grade);
      if (a.grade && a.grade.correct === true) correctCount += 1;
    }
    return { studentId: String(p.studentId || ""), displayName: String(p.displayName || ""), points, correctCount, answeredCount, order };
  });
  rows.sort((x, y) =>
    (y.points - x.points) ||
    (y.correctCount - x.correctCount) ||
    (y.answeredCount - x.answeredCount) ||
    (x.order - y.order));   // final tie-break: original server order — a display order only, never a points signal
  return rows.map((r, i) => ({
    studentId: r.studentId, displayName: r.displayName,
    points: r.points, correctCount: r.correctCount, answeredCount: r.answeredCount,
    rank: i + 1,
  }));
}

/**
 * Phase 4E — per playing participant's PERFORMANCE percentage for a FINISHED session, for educational-game Strength.
 * This is the student's academic performance in the game, NOT their placement/medal: for each of their answers the
 * SERVER-stored grade fraction clamp(score/maxMarks,0,1) is summed and divided by the total question count, then × 100
 * (unanswered rounds contribute 0). Returns `{ studentId, displayName, challengeId, percentage }[]` (percentage 0..100).
 * A non-finished session returns [] (only a finished game has an authoritative result to award Strength from).
 */
function liveChallengeGamePercentages(session) {
  if (!session || session.status !== "finished") return [];
  const qCount = questionCountOf(session);
  const challengeId = String(session.challengeId || "");
  return playingParticipants(session).map(p => {
    let fractionSum = 0;
    for (const a of answersOf(p)) {
      if (!a || !Number.isInteger(a.questionIndex) || a.questionIndex < 0 || a.questionIndex >= qCount) continue;
      const g = a.grade && typeof a.grade === "object" ? a.grade : {};
      const max = Number(g.maxMarks), score = Number(g.score);
      if (max > 0 && Number.isFinite(score)) fractionSum += clamp01(score / max);
    }
    const percentage = qCount > 0 ? Math.round(fractionSum / qCount * 100) : 0;
    return { studentId: String(p.studentId || ""), displayName: String(p.displayName || ""), challengeId, percentage: Math.min(100, Math.max(0, percentage)) };
  });
}

module.exports = { competitionPointsForGrade, completedRoundsCount, buildLiveStandings, liveChallengeGamePercentages };
