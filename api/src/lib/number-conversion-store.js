// Number Conversion Challenge — the per-student game document (Phase 2, FREE PLAY only). ONE bounded blob per
// student at platform/games/number-conversion/<studentId>.json:
//
//   { schemaVersion: 1, active: <attempt snapshot> | null, best: <best record> | null }
//
// The active attempt SNAPSHOTS its generated round (server-side, including each task's value), so a refresh/reconnect
// resumes the SAME tasks and a completed task can never be re-answered or farmed. The answer flow is forgiving:
// first wrong → a guiding hint (retry); second wrong → the correct bits are revealed with a short explanation and the
// round advances (that task counts as incorrect). The result and the best record are SERVER-derived; the client's
// score is never trusted. Best is a non-additive "best record" merge, not a mutable counter. Pure module (no IO).
const {
  generateRound, evaluateBits, solutionBits, hintForTask, explanationForTask, publicTask,
  PATHS, ASSISTANCE_LEVELS, DEFAULT_ROUND_SIZE,
} = require("./number-conversion");

const GAME_PREFIX = "platform/games/number-conversion/";
const gameDocName = studentId => GAME_PREFIX + String(studentId || "").trim() + ".json";
const MAX_ATTEMPTS = 2;   // first wrong → hint; second wrong → reveal + advance

const isPath = p => Object.prototype.hasOwnProperty.call(PATHS, String(p));
const isLevel = l => ASSISTANCE_LEVELS.includes(String(l));

/** A safe non-negative integer. */
function count(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }

/** A well-formed game document from whatever is stored (missing/malformed → empty). Never trusts stored derived values. */
function normalizeGameDoc(doc) {
  const out = { schemaVersion: 1, active: null, best: null };
  if (!doc || typeof doc !== "object") return out;
  if (doc.active && typeof doc.active === "object" && Array.isArray(doc.active.tasks) && doc.active.tasks.length) {
    const a = doc.active;
    out.active = {
      attemptId: String(a.attemptId || ""),
      path: isPath(a.path) ? String(a.path) : "mixed",
      level: isLevel(a.level) ? String(a.level) : "guided",
      seed: String(a.seed || ""),
      startedAt: String(a.startedAt || ""),
      tasks: a.tasks.map(t => ({ ...t })),
      index: Math.min(count(a.index), a.tasks.length),
      currentAttempts: Math.min(count(a.currentAttempts), MAX_ATTEMPTS),
      outcomes: Array.isArray(a.outcomes) ? a.outcomes.filter(o => o && typeof o === "object").map(o => ({ taskId: String(o.taskId || ""), status: o.status === "correct" ? "correct" : "revealed", attempts: count(o.attempts) })) : [],
    };
  }
  if (doc.best && typeof doc.best === "object") {
    const b = doc.best;
    out.best = { percentage: count(b.percentage), correct: count(b.correct), total: count(b.total), bestStreak: count(b.bestStreak), elapsedMs: count(b.elapsedMs), at: String(b.at || "") };
  }
  return out;
}

/** The current + best streak from an outcomes sequence (trailing run of "correct", and the longest run). */
function streaksOf(outcomes) {
  let current = 0, best = 0, run = 0;
  for (const o of outcomes) {
    if (o.status === "correct") { run++; best = Math.max(best, run); } else { run = 0; }
  }
  // current = trailing run
  for (let i = outcomes.length - 1; i >= 0 && outcomes[i].status === "correct"; i--) current++;
  return { current, best };
}

/** The client-safe view of the active attempt — NO task values / solutions. currentTask is null once the round is done. */
function publicActive(active) {
  if (!active) return null;
  const total = active.tasks.length;
  const done = active.index >= total;
  const { current, best } = streaksOf(active.outcomes);
  const correct = active.outcomes.filter(o => o.status === "correct").length;
  return {
    attemptId: active.attemptId,
    path: active.path,
    level: active.level,
    total,
    index: active.index,
    taskNumber: Math.min(active.index + 1, total),
    currentTask: done ? null : publicTask(active.tasks[active.index]),
    attemptsOnCurrent: done ? 0 : active.currentAttempts,
    resolved: active.outcomes.length,
    correct,
    streak: current,
    bestStreak: best,
    startedAt: active.startedAt,
    done,
  };
}

/** Start a fresh attempt, replacing any previous active/round. Deterministic tasks from `seed`. */
function startAttempt(doc, { path, level, seed, attemptId, count: roundSize, now }) {
  const normalized = normalizeGameDoc(doc);
  const p = isPath(path) ? String(path) : "mixed";
  const l = isLevel(level) ? String(level) : "guided";
  const size = roundSize ? Math.max(1, Math.min(50, Math.floor(Number(roundSize)))) : DEFAULT_ROUND_SIZE;
  const tasks = generateRound(seed, { path: p, count: size });
  normalized.active = {
    attemptId: String(attemptId || seed), path: p, level: l, seed: String(seed || ""),
    startedAt: String(now || new Date().toISOString()), tasks, index: 0, currentAttempts: 0, outcomes: [],
  };
  return normalized;
}

/** Compute the SERVER-authoritative result of a finished active attempt. */
function computeResult(active, now) {
  const total = active.tasks.length;
  const correct = active.outcomes.filter(o => o.status === "correct").length;
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  const { best } = streaksOf(active.outcomes);
  const startedMs = Date.parse(active.startedAt);
  const nowMs = Date.parse(String(now)) || Date.now();
  const elapsedMs = Number.isFinite(startedMs) ? Math.max(0, nowMs - startedMs) : 0;
  return { correct, total, percentage, bestStreak: best, elapsedMs, at: String(now || new Date().toISOString()) };
}

/** Non-additive best-record merge: keep the better of (percentage ↓, correct ↓, elapsed ↑). Idempotent. */
function mergeBest(prevBest, result) {
  if (!prevBest) return { ...result };
  if (result.percentage !== prevBest.percentage) return result.percentage > prevBest.percentage ? { ...result } : prevBest;
  if (result.correct !== prevBest.correct) return result.correct > prevBest.correct ? { ...result } : prevBest;
  if (result.elapsedMs !== prevBest.elapsedMs) return result.elapsedMs < prevBest.elapsedMs ? { ...result } : prevBest;
  return prevBest;
}

/**
 * Apply an eight-bit submission to the current task. Returns { doc, response, changed }. Server-authoritative:
 * validates the task identity, grades the bits, enforces the attempt/hint/reveal policy, advances the round, and on
 * completion computes the result and merges the best record (clearing the active attempt).
 */
function applyAnswer(doc, { taskId, bits, now }) {
  const normalized = normalizeGameDoc(doc);
  const active = normalized.active;
  if (!active) return { doc: normalized, response: { ok: false, error: "no-active-attempt" }, changed: false };
  if (active.index >= active.tasks.length) return { doc: normalized, response: { ok: false, error: "round-complete" }, changed: false };
  const task = active.tasks[active.index];
  // A completed / mismatched task can never be re-answered (anti-farming, refresh-safe).
  if (String(taskId) !== String(task.taskId)) return { doc: normalized, response: { ok: false, error: "stale-task", expectedTaskId: task.taskId }, changed: false };

  const { correct } = evaluateBits(task, bits);
  if (correct) {
    const attempts = active.currentAttempts + 1;
    active.outcomes.push({ taskId: task.taskId, status: "correct", attempts });
    active.index += 1; active.currentAttempts = 0;
    return finalizeIfDone(normalized, { ok: true, correct: true, attempts, explanation: explanationForTask(task), taskId: task.taskId }, now);
  }
  // wrong
  active.currentAttempts += 1;
  if (active.currentAttempts < MAX_ATTEMPTS) {
    return { doc: normalized, response: { ok: true, correct: false, attempts: active.currentAttempts, hint: hintForTask(task, bits, active.level), taskId: task.taskId }, changed: true };
  }
  // exhausted → reveal + advance (counts incorrect)
  const attempts = active.currentAttempts;
  active.outcomes.push({ taskId: task.taskId, status: "revealed", attempts });
  active.index += 1; active.currentAttempts = 0;
  return finalizeIfDone(normalized, { ok: true, correct: false, revealed: true, attempts, solutionBits: solutionBits(task), explanation: explanationForTask(task), taskId: task.taskId }, now);
}

/** After advancing, either report progress or (when the round is finished) compute the result + merge best + clear. */
function finalizeIfDone(normalized, base, now) {
  const active = normalized.active;
  const pub = publicActive(active);
  if (active.index < active.tasks.length) {
    return { doc: normalized, response: { ...base, done: false, state: pub }, changed: true };
  }
  const result = computeResult(active, now);
  normalized.best = mergeBest(normalized.best, result);
  const best = normalized.best;
  normalized.active = null;   // round finished — clear the active attempt
  return { doc: normalized, response: { ...base, done: true, result, best, state: { ...pub, currentTask: null } }, changed: true };
}

module.exports = {
  GAME_PREFIX, gameDocName, MAX_ATTEMPTS, isPath, isLevel,
  normalizeGameDoc, publicActive, startAttempt, applyAnswer, computeResult, mergeBest, streaksOf,
};
