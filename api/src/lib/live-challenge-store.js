// Live Challenge — per-teacher persistence helpers (Phase 3B, challenge AUTHORING only). Pure module (no IO).
//
// One bounded blob per challenge under platform/games/live-challenge/<teacherId>/<challengeId>.json, matching the
// number-conversion game's storage-key convention. A stored document wraps the canonical Challenge Definition (an
// ordered list of immutable question snapshots — each a canonical BuilderQuestion the teacher authored) with a tiny
// envelope. The server is the authority for STRUCTURE only: it validates the shape and never fabricates content
// (challenges are teacher-authored content, including answer keys, retrieved only under teacher auth). There is NO
// live-session/runtime state here (players, lobby, join code, answers, rankings, broadcast, reconnect) — those belong
// to later phases. It does not import the frontend type registry; presentationType is validated as a non-empty string
// so the canonical 11-type registry stays defined once, on the client.

const CHALLENGE_PREFIX = "platform/games/live-challenge/";
const SCHEMA_VERSION = 1;
const COURSE_ID = "791381";
const MAX_QUESTIONS = 200;
const MAX_TITLE = 200;

/** A blob-safe path segment (teacher id / challenge id are ids, not free text). */
const safeSegment = s => String(s == null ? "" : s).trim().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120) || "_";

const teacherPrefix = teacherId => CHALLENGE_PREFIX + safeSegment(teacherId) + "/";
const challengeDocName = (teacherId, challengeId) => teacherPrefix(teacherId) + safeSegment(challengeId) + ".json";

/** A client-safe-ish summary (no question content) for the saved-challenges list. */
function summaryOf(def) {
  return {
    challengeId: String(def.challengeId || ""),
    title: String(def.title || ""),
    questionCount: Array.isArray(def.questions) ? def.questions.length : 0,
    updatedAt: def.updatedAt || undefined,
  };
}

/** One challenge question entry: keep the canonical question snapshot verbatim, tag the source safely. */
function normalizeQuestionEntry(cq) {
  if (!cq || typeof cq !== "object") return null;
  const q = cq.question;
  if (!q || typeof q !== "object") return null;
  if (typeof q.examQuestionId !== "string" || !q.examQuestionId) return null;
  if (typeof q.presentationType !== "string" || !q.presentationType) return null;
  const src = cq.source && typeof cq.source === "object" && typeof cq.source.kind === "string" ? cq.source : { kind: "manual" };
  return { question: q, source: src };
}

/**
 * Validate + normalize a challenge definition supplied by the teacher. Returns { ok, def } or { ok:false, error }.
 * Structural validation only — the question content (including answer keys) is trusted teacher input and kept as-is.
 */
function validateChallengeInput(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, error: "invalid-challenge" };
  if (typeof raw.challengeId !== "string" || !raw.challengeId.trim()) return { ok: false, error: "missing-challengeId" };
  if (!Array.isArray(raw.questions)) return { ok: false, error: "invalid-questions" };
  if (raw.questions.length > MAX_QUESTIONS) return { ok: false, error: "too-many-questions" };
  const questions = [];
  for (const cq of raw.questions) {
    const norm = normalizeQuestionEntry(cq);
    if (!norm) return { ok: false, error: "invalid-question" };
    questions.push(norm);
  }
  const def = {
    schemaVersion: SCHEMA_VERSION,
    challengeId: raw.challengeId.trim(),
    title: typeof raw.title === "string" ? raw.title.slice(0, MAX_TITLE) : "",
    courseId: typeof raw.courseId === "string" && raw.courseId ? raw.courseId : COURSE_ID,
    questions,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
  return { ok: true, def };
}

/** Wrap a validated definition in the stored envelope, stamping save/update time. */
function storedDoc(def, now) {
  const at = now || new Date().toISOString();
  return { kind: "live-challenge", schemaVersion: SCHEMA_VERSION, savedAt: at, challenge: { ...def, createdAt: def.createdAt || at, updatedAt: at } };
}

/** The challenge definition out of a stored document (or null when malformed / not a challenge doc). */
function challengeFromDoc(doc) {
  if (!doc || typeof doc !== "object" || !doc.challenge) return null;
  const v = validateChallengeInput(doc.challenge);
  return v.ok ? v.def : null;
}

module.exports = {
  CHALLENGE_PREFIX, SCHEMA_VERSION, COURSE_ID, MAX_QUESTIONS,
  safeSegment, teacherPrefix, challengeDocName,
  summaryOf, validateChallengeInput, storedDoc, challengeFromDoc, normalizeQuestionEntry,
};
