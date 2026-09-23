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

const SESSION_PREFIX = "platform/games/live-challenge-sessions/";
const SCHEMA_VERSION = 1;
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

/** One participant entry — teacher-defined at creation; the student later flips joinedAt / readyAt (own entry only). */
function participantEntry(studentId, displayName) {
  return { studentId: String(studentId || ""), displayName: String(displayName || ""), joinedAt: null, readyAt: null };
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
    participants: (Array.isArray(participants) ? participants : []).map(p => participantEntry(p.studentId, p.displayName)),
    challengeSnapshot: challengeSnapshot || null,
    createdAt: at,
    updatedAt: at,
    closedAt: null,
  };
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

/** The teacher closes the lobby (idempotent): status → closed, stamps closedAt once. Never deletes the blob. */
function applyClose(session, now) {
  if (!session) throw new SessionError("not-found");
  if (session.status !== "closed") { const at = now || new Date().toISOString(); session.status = "closed"; session.closedAt = at; session.updatedAt = at; }
  return session;
}

// ── Views (what leaves the server) ──────────────────────────────────────────────────────────────────────────

/** Teacher-safe lobby view: NO answer keys / snapshot, NO student auth metadata (password, id number, authVersion). */
function teacherView(session) {
  if (!session) return null;
  const counts = participantCounts(session);
  return {
    sessionId: session.sessionId,
    joinCode: session.joinCode,
    challengeId: session.challengeId,
    challengeTitle: session.challengeTitle,
    classId: session.classId,
    status: session.status,
    counts,
    participants: (session.participants || []).map(p => ({
      studentId: String(p.studentId || ""),
      displayName: String(p.displayName || ""),
      joined: !!p.joinedAt,
      ready: !!p.readyAt,
      joinedAt: p.joinedAt || null,
      readyAt: p.readyAt || null,
    })),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    closedAt: session.closedAt || null,
  };
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
  return {
    sessionId: session.sessionId,
    joinCode: session.joinCode,
    challengeTitle: session.challengeTitle,
    status: session.status,
    you: { joined: !!(me && me.joinedAt), ready: !!(me && me.readyAt) },
    counts,
    participants: (session.participants || []).map(p => ({
      displayName: String(p.displayName || ""),
      joined: !!p.joinedAt,
      ready: !!p.readyAt,
    })),
    updatedAt: session.updatedAt,
    closedAt: session.closedAt || null,
  };
}

module.exports = {
  SESSION_PREFIX, SCHEMA_VERSION, CODE_ALPHABET, CODE_LENGTH,
  safeSegment, normalizeJoinCode, isValidJoinCode, generateJoinCode, sessionDocName,
  participantEntry, newSessionDoc, findParticipant, isParticipant, participantCounts,
  SessionError, applyJoin, applyReady, applyClose, teacherView, studentView,
};
