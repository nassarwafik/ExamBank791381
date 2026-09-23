// Live Challenge — LIVE SESSION / LOBBY store (Phase 4A). Pure module (no IO): builds and shapes the runtime session
// document and exposes the pure state transitions; the API endpoints own storage + CAS (mutateJsonWithRetry) and auth.
//
// A live session is SEPARATE from the authoring ChallengeDefinition (live-challenge-store.js). Starting a session
// SNAPSHOTS the challenge server-side into `challengeSnapshot`; later edits to the saved challenge never touch a live
// session. The snapshot holds the teacher-authored questions INCLUDING answer keys and is SERVER-ONLY — it is never
// placed in any student response (see studentView). The join code is the direct storage lookup key (no scan to resolve
// a room); it is NOT an authorization token — a valid authenticated, teacher-listed student is still required to join.
//
// Phase 4A state machine is intentionally tiny: "lobby" → "closed". No question broadcast, answers, grading, rounds,
// leaderboard, podium, medals, Strength or teams — those are later phases. When answer grading arrives it MUST reuse
// api/src/lib/assignment-grading.js `gradeQuestion(...)` (the central grader for multipleChoice / trueFalse / fields /
// CLI / table / compound …) — never a games-specific grader.

const crypto = require("crypto");
const { sanitizeQuestionForStudent } = require("./student-exam-sanitize");

const SESSION_PREFIX = "platform/games/live-challenge-sessions/";
// v2 (Phase 4B) adds the live-round runtime fields (status active/finished, currentQuestionIndex, roundVersion,
// startedAt/questionStartedAt/finishedAt, participants[].answers). A v1 (Phase 4A) lobby blob is still fully
// readable and startable: the accessors below default every missing runtime field to its lobby value, so an older
// document is never made unreadable merely because the Phase 4B fields are absent.
const SCHEMA_VERSION = 2;
// Teacher-friendly room code: uppercase, no ambiguous 0/O/1/I/L. 6 chars over a 31-symbol alphabet ≈ 8.9e8 codes.
// The code is a lookup key only; membership (server-listed participant) is what authorizes a join, never the code.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_TITLE = 200;

/** A blob-safe path segment (a room code is [A-Z2-9]; this is defense-in-depth against a malformed code). */
const safeSegment = s => String(s == null ? "" : s).trim().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40) || "_";

/** Normalize a client-supplied join code: NFKC, trim, uppercase, keep only alphabet symbols, cap at CODE_LENGTH. */
function normalizeJoinCode(raw) {
  const up = String(raw == null ? "" : raw).normalize("NFKC").trim().toUpperCase();
  let out = "";
  for (const ch of up) { if (CODE_ALPHABET.includes(ch)) out += ch; if (out.length >= CODE_LENGTH) break; }
  return out;
}

/** True when a normalized code is a structurally valid room code (exact length, allowed alphabet). */
function isValidJoinCode(code) {
  return typeof code === "string" && code.length === CODE_LENGTH && [...code].every(ch => CODE_ALPHABET.includes(ch));
}

/** A cryptographically-random room code (rejection sampling keeps the alphabet uniform). `rng` is a test seam. */
function generateJoinCode(rng) {
  const bytes = typeof rng === "function" ? rng(CODE_LENGTH * 2) : crypto.randomBytes(CODE_LENGTH * 2);
  let out = "";
  for (let i = 0; i < bytes.length && out.length < CODE_LENGTH; i++) {
    const v = bytes[i];
    if (v < CODE_ALPHABET.length * Math.floor(256 / CODE_ALPHABET.length)) out += CODE_ALPHABET[v % CODE_ALPHABET.length];
  }
  // Extremely unlikely to run short; top up deterministically if rejection sampling exhausted the buffer.
  while (out.length < CODE_LENGTH) out += CODE_ALPHABET[crypto.randomBytes(1)[0] % CODE_ALPHABET.length];
  return out;
}

/** The blob path for a session — keyed by its (opaque, random) join code so both teacher and student resolve it
 *  DIRECTLY with a single read (never a scan across all sessions). */
const sessionDocName = code => SESSION_PREFIX + safeSegment(code) + ".json";

/** One participant entry — teacher-defined at creation; the student later flips joinedAt / readyAt (own entry only)
 *  and, in Phase 4B, appends ONE authoritative answer record per live round to `answers`. */
function participantEntry(studentId, displayName) {
  return { studentId: String(studentId || ""), displayName: String(displayName || ""), joinedAt: null, readyAt: null, answers: [] };
}

/**
 * Build a fresh lobby session document. `challengeSnapshot` is the SERVER-loaded challenge definition (immutable copy);
 * it is never returned to a student. Participants are the teacher's validated selection (each not-yet-joined).
 */
function newSessionDoc({ joinCode, teacherId, challengeId, challengeTitle, classId, participants, challengeSnapshot, now }) {
  const at = now || new Date().toISOString();
  return {
    kind: "live-challenge-session",
    schemaVersion: SCHEMA_VERSION,
    // In Phase 4A the sessionId and the joinCode are the same opaque code (the single lookup key); a later phase may
    // split them without changing the student/teacher lobby contract.
    sessionId: joinCode,
    joinCode,
    teacherId: String(teacherId || ""),
    challengeId: String(challengeId || ""),
    challengeTitle: String(challengeTitle || "").slice(0, MAX_TITLE),
    classId: String(classId || ""),
    status: "lobby",
    // Live-round runtime (Phase 4B). In the lobby these are all zero/null; applyStart flips them.
    currentQuestionIndex: null,
    roundVersion: 0,
    startedAt: null,
    questionStartedAt: null,
    finishedAt: null,
    participants: (Array.isArray(participants) ? participants : []).map(p => participantEntry(p.studentId, p.displayName)),
    challengeSnapshot: challengeSnapshot || null,
    createdAt: at,
    updatedAt: at,
    closedAt: null,
  };
}

// ── Runtime accessors (tolerant of a v1 lobby doc that predates the Phase 4B fields) ────────────────────────────
/** The server-owned round version (0 in the lobby). A v1 doc with no field reads as 0. */
function roundVersionOf(session) { return Number.isInteger(session && session.roundVersion) ? session.roundVersion : 0; }
/** The current 0-based question index, or null when not in an active round. */
function currentIndexOf(session) { return Number.isInteger(session && session.currentQuestionIndex) ? session.currentQuestionIndex : null; }
/** The snapshot's question entries ({ question, source }[]). */
function snapshotQuestions(session) {
  const s = session && session.challengeSnapshot;
  return s && Array.isArray(s.questions) ? s.questions : [];
}
function questionCount(session) { return snapshotQuestions(session).length; }
/** The RAW canonical current question (server-only — contains answer keys). Null when out of range / not active. */
function rawCurrentQuestion(session) {
  const idx = currentIndexOf(session);
  if (idx == null) return null;
  const entry = snapshotQuestions(session)[idx];
  return entry && entry.question ? entry.question : null;
}
function participantAnswers(participant) { return participant && Array.isArray(participant.answers) ? participant.answers : []; }
/** This participant's authoritative answer for a round, or null. */
function findAnswer(participant, roundVersion) {
  return participantAnswers(participant).find(a => a && a.roundVersion === roundVersion) || null;
}
/** Participants who actually joined before the game started — the running game's playing set / answer denominator. */
function playingParticipants(session) {
  return (session && Array.isArray(session.participants) ? session.participants : []).filter(p => !!p.joinedAt);
}
/** How many playing participants have an authoritative answer for a round. */
function answeredCount(session, roundVersion) {
  return playingParticipants(session).filter(p => findAnswer(p, roundVersion)).length;
}
/** Keep ONLY the central-grader academic fields; never persist a client-supplied score/correct or extra keys. */
function normalizeGrade(grade) {
  const g = grade && typeof grade === "object" ? grade : {};
  const out = {
    score: Number(g.score) || 0,
    maxMarks: Number(g.maxMarks) || 0,
    correct: !!g.correct,
    manualReview: !!g.manualReview,
  };
  if (g.manualReviewMarks != null) out.manualReviewMarks = Number(g.manualReviewMarks) || 0;
  // The central grader returns `parts` as an array (compound) or an object {correct,total} (fields/sequence/table);
  // preserve whichever it produced so Phase 4C has the full per-part / partial-credit breakdown.
  if (g.parts != null && typeof g.parts === "object") out.parts = g.parts;
  return out;
}

function findParticipant(session, studentId) {
  const id = String(studentId || "");
  return (session && Array.isArray(session.participants) ? session.participants : []).find(p => String(p.studentId) === id) || null;
}

function isParticipant(session, studentId) {
  return !!findParticipant(session, studentId);
}

/** Counts for a lobby summary. */
function participantCounts(session) {
  const list = session && Array.isArray(session.participants) ? session.participants : [];
  return {
    total: list.length,
    joined: list.filter(p => !!p.joinedAt).length,
    ready: list.filter(p => !!p.readyAt).length,
  };
}

// ── Pure state transitions (the API wraps these in mutateJsonWithRetry on the freshest document) ────────────────
// Each throws a plain Error tagged with `.code` for a domain (non-retryable) failure; the handler maps `.code` to an
// HTTP status. They MUTATE and return the passed session so they compose inside a CAS callback.

class SessionError extends Error {
  constructor(code, message) { super(message || code); this.name = "SessionError"; this.code = code; }
}

/** A student joins (idempotent): stamps joinedAt once. Requires an open lobby and an existing participant entry. */
function applyJoin(session, studentId, now) {
  if (!session) throw new SessionError("not-found");
  if (session.status !== "lobby") throw new SessionError("closed");
  const p = findParticipant(session, studentId);
  if (!p) throw new SessionError("forbidden");
  if (!p.joinedAt) { p.joinedAt = now || new Date().toISOString(); session.updatedAt = p.joinedAt; }
  return session;
}

/** A student sets/clears their OWN ready flag (idempotent). Only while the lobby is open; ready=false is allowed. */
function applyReady(session, studentId, ready, now) {
  if (!session) throw new SessionError("not-found");
  if (session.status !== "lobby") throw new SessionError("closed");
  const p = findParticipant(session, studentId);
  if (!p) throw new SessionError("forbidden");
  const at = now || new Date().toISOString();
  // Ready implies joined (a student can tap ready without a separate join round-trip).
  if (!p.joinedAt) p.joinedAt = at;
  if (ready) { if (!p.readyAt) p.readyAt = at; }
  else { p.readyAt = null; }
  session.updatedAt = at;
  return session;
}

/** The teacher closes the lobby (idempotent): status → closed, stamps closedAt once. Works from lobby / active /
 *  finished. Never deletes the blob. */
function applyClose(session, now) {
  if (!session) throw new SessionError("not-found");
  if (session.status !== "closed") { const at = now || new Date().toISOString(); session.status = "closed"; session.closedAt = at; session.updatedAt = at; }
  return session;
}

// ── Phase 4B live-round transitions (server is the ONLY academic/round authority) ───────────────────────────────

/** The teacher starts the challenge: lobby → active, first question live (roundVersion 1). Requires a snapshot with
 *  at least one question and at least one participant who actually joined. Idempotent stamps happen once. */
function applyStart(session, now) {
  if (!session) throw new SessionError("not-found");
  if (session.status !== "lobby") throw new SessionError("not-lobby");
  if (questionCount(session) === 0) throw new SessionError("empty-challenge");
  if (playingParticipants(session).length === 0) throw new SessionError("no-participants");
  const at = now || new Date().toISOString();
  session.status = "active";
  session.currentQuestionIndex = 0;
  session.roundVersion = 1;
  session.startedAt = at;
  session.questionStartedAt = at;
  session.updatedAt = at;
  return session;
}

/** The teacher advances to the next question. `roundVersion` is an optimistic-concurrency guard checked against the
 *  FRESHEST document so a stale teacher tab cannot advance twice. Cannot advance past the last question. */
function applyNext(session, roundVersion, now) {
  if (!session) throw new SessionError("not-found");
  if (session.status !== "active") throw new SessionError("not-active");
  if (roundVersionOf(session) !== roundVersion) throw new SessionError("stale-round");
  const idx = currentIndexOf(session);
  if (idx == null || idx >= questionCount(session) - 1) throw new SessionError("no-more-questions");
  const at = now || new Date().toISOString();
  session.currentQuestionIndex = idx + 1;
  session.roundVersion = roundVersionOf(session) + 1;
  session.questionStartedAt = at;
  session.updatedAt = at;
  return session;
}

/** The teacher finishes the challenge (active → finished). Requires the current round to be the LAST question and the
 *  submitted `roundVersion` to match. `close` remains the separate abort path. */
function applyFinish(session, roundVersion, now) {
  if (!session) throw new SessionError("not-found");
  if (session.status !== "active") throw new SessionError("not-active");
  if (roundVersionOf(session) !== roundVersion) throw new SessionError("stale-round");
  const idx = currentIndexOf(session);
  if (idx == null || idx !== questionCount(session) - 1) throw new SessionError("not-last-question");
  const at = now || new Date().toISOString();
  session.status = "finished";
  session.finishedAt = at;
  session.updatedAt = at;
  return session;
}

/**
 * A student submits ONE authoritative answer for the current round. `gradeFn(question)` is supplied by the API and
 * MUST be the central grader (assignment-grading `gradeQuestion`) — the store never grades itself and never trusts a
 * client-provided score/correct. Validation happens on the FRESHEST document:
 *   • active round only; roundVersion must equal the server's current round (else `stale-round`, ZERO write);
 *   • the caller must be a participant who actually joined (else `forbidden` / `not-joined`);
 *   • exactly one answer per participant per round — a duplicate throws `already-answered` carrying the session so the
 *     API can return idempotent success WITHOUT re-writing the blob (a second, different payload never overwrites).
 */
function applyAnswer(session, studentId, roundVersion, response, gradeFn, now) {
  if (!session) throw new SessionError("not-found");
  if (session.status !== "active") throw new SessionError("not-active");
  const p = findParticipant(session, studentId);
  if (!p) throw new SessionError("forbidden");
  if (!p.joinedAt) throw new SessionError("not-joined");
  if (roundVersionOf(session) !== roundVersion) throw new SessionError("stale-round");
  const question = rawCurrentQuestion(session);
  if (!question) throw new SessionError("not-active");
  if (findAnswer(p, roundVersion)) { const e = new SessionError("already-answered"); e.session = session; throw e; }
  const grade = normalizeGrade(gradeFn(question));
  const at = now || new Date().toISOString();
  p.answers = participantAnswers(p).slice();
  p.answers.push({ roundVersion, questionIndex: currentIndexOf(session), response, submittedAt: at, grade });
  session.updatedAt = at;
  return session;
}

// ── Views (what leaves the server) ──────────────────────────────────────────────────────────────────────────

/** Teacher-safe view. NO answer keys / raw snapshot, NO student auth metadata. During an active round it also carries
 *  a bounded runtime view: the SANITIZED current question (answer-key-free, current only — never future questions),
 *  the round version, question number/total, and answered X / Y for the playing (joined) set. The teacher already
 *  owns the authored challenge; this runtime view stays bounded to the current question. */
function teacherView(session) {
  if (!session) return null;
  const counts = participantCounts(session);
  const status = session.status;
  const rv = roundVersionOf(session);
  const playing = playingParticipants(session).length;
  const view = {
    sessionId: session.sessionId,
    joinCode: session.joinCode,
    challengeId: session.challengeId,
    challengeTitle: session.challengeTitle,
    classId: session.classId,
    status,
    counts,
    roundVersion: rv,
    questionCount: questionCount(session),
    playing,
    participants: (session.participants || []).map(p => ({
      studentId: String(p.studentId || ""),
      displayName: String(p.displayName || ""),
      joined: !!p.joinedAt,
      ready: !!p.readyAt,
      answered: status === "active" ? !!findAnswer(p, rv) : false,
      joinedAt: p.joinedAt || null,
      readyAt: p.readyAt || null,
    })),
    startedAt: session.startedAt || null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    finishedAt: session.finishedAt || null,
    closedAt: session.closedAt || null,
  };
  if (status === "active") {
    const idx = currentIndexOf(session);
    const rawQ = rawCurrentQuestion(session);
    view.round = {
      roundVersion: rv,
      questionNumber: idx == null ? null : idx + 1,
      questionCount: questionCount(session),
      questionStartedAt: session.questionStartedAt || null,
      question: rawQ ? sanitizeQuestionForStudent(rawQ) : null,   // SANITIZED — no answer key leaves the server
      answered: answeredCount(session, rv),
      playing,
    };
  }
  return view;
}

/**
 * Student-safe lobby view for `studentId`. CRITICAL: it carries NO question content and NO answer keys — never the
 * challengeSnapshot, never a question/answer/field.correct/part.answer/correctOptionIndex/solution. Phase 4A lobby
 * needs none of that. It exposes only the room status, this student's own joined/ready flags, roster display names +
 * their joined/ready states (classmates, no ids/keys) and simple counts.
 */
function studentView(session, studentId) {
  if (!session) return null;
  const me = findParticipant(session, studentId);
  const counts = participantCounts(session);
  const status = session.status;
  const rv = roundVersionOf(session);
  const view = {
    sessionId: session.sessionId,
    joinCode: session.joinCode,
    challengeTitle: session.challengeTitle,
    status,
    you: { joined: !!(me && me.joinedAt), ready: !!(me && me.readyAt), answered: false },
    counts,
    participants: (session.participants || []).map(p => ({
      displayName: String(p.displayName || ""),
      joined: !!p.joinedAt,
      ready: !!p.readyAt,
    })),
    updatedAt: session.updatedAt,
    closedAt: session.closedAt || null,
  };
  // Round content is delivered ONLY to a participant who actually joined before the game started (the playing set).
  // Defense in depth: even if this is called for a preselected-but-never-joined participant during an active round,
  // it returns NO round.question and NO own submission — the API also rejects that case as not-joined.
  if (status === "active" && me && me.joinedAt) {
    const idx = currentIndexOf(session);
    const rawQ = rawCurrentQuestion(session);
    const mine = findAnswer(me, rv);
    view.round = {
      roundVersion: rv,
      questionNumber: idx == null ? null : idx + 1,
      questionCount: questionCount(session),
      questionStartedAt: session.questionStartedAt || null,
      // SANITIZED current question ONLY (no answer key, no future questions, never the raw challengeSnapshot).
      question: rawQ ? sanitizeQuestionForStudent(rawQ) : null,
    };
    view.you.answered = !!mine;
    // The student's OWN submitted response is safe to return (lets the UI restore locked controls after refresh).
    // The server grade/correctness is NEVER returned during a live round.
    if (mine) view.you.submission = { response: mine.response, submittedAt: mine.submittedAt };
  }
  return view;
}

module.exports = {
  SESSION_PREFIX, SCHEMA_VERSION, CODE_ALPHABET, CODE_LENGTH,
  safeSegment, normalizeJoinCode, isValidJoinCode, generateJoinCode, sessionDocName,
  participantEntry, newSessionDoc, findParticipant, isParticipant, participantCounts,
  roundVersionOf, currentIndexOf, snapshotQuestions, questionCount, rawCurrentQuestion,
  findAnswer, playingParticipants, answeredCount, normalizeGrade,
  SessionError, applyJoin, applyReady, applyClose, applyStart, applyNext, applyFinish, applyAnswer,
  teacherView, studentView,
};
