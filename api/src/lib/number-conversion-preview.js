// Number Conversion Challenge — TEACHER PREVIEW continuation (stateless, NON-persistent). The teacher previews the
// SAME server engine students play (generateRound / startAttempt / applyAnswer / publicActive), but nothing is stored:
// between requests the browser holds only an OPAQUE continuation token that the server sealed (AES-256-GCM, a
// purpose-derived key). The token carries the minimum needed to rebuild the round deterministically — seed, path,
// level, size, startedAt — plus the progress (index, current attempts, outcomes); it never exposes the seed or any
// task value to the browser, and a tampered/foreign/expired token is rejected rather than trusted. On each answer the
// server opens it, regenerates the SAME round from the seed, and replays the progress through the real store rules.
// Pure module (crypto only — no storage IO).
const crypto = require("crypto");
const { normalizeGameDoc, startAttempt, isPath, isLevel, MAX_ATTEMPTS } = require("./number-conversion-store");

// Explicit purpose context: the preview key is derived from the shared server secret + this label, so a preview
// continuation can never be confused with (or validate as) a teacher/student session token.
const PREVIEW_CONTEXT = "ExamBank791381:number-conversion-teacher-preview:v1";
const PREVIEW_VERSION = 1;
const MAX_PREVIEW_AGE_MS = 8 * 60 * 60 * 1000;   // a preview round never outlives a teacher session
const MAX_CONTINUATION_LENGTH = 4096;
const MAX_ROUND_SIZE = 50;

/** The AES-256 key for preview continuations derived from a server secret (null when no secret is configured). */
function previewKeyFrom(secret) {
  const s = String(secret || "");
  return s ? crypto.createHmac("sha256", s).update(PREVIEW_CONTEXT).digest() : null;
}
function defaultPreviewKey() {
  return previewKeyFrom(process.env.BUILDER_SESSION_SECRET || process.env.BANK_SETUP_KEY || "");
}

function seal(payload, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(PREVIEW_CONTEXT, "utf8"));
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}
function unseal(token, key) {
  try {
    const raw = Buffer.from(String(token), "base64url");
    if (raw.length < 12 + 16 + 2) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(PREVIEW_CONTEXT, "utf8"));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch { return null; }
}

/** Seal the continuation of an ACTIVE preview attempt for `sub` (the teacher). */
function sealPreview(active, { sub, key }) {
  return seal({
    v: PREVIEW_VERSION, sub: String(sub),
    seed: active.seed, attemptId: active.attemptId, path: active.path, level: active.level,
    count: active.tasks.length, startedAt: active.startedAt,
    index: active.index, currentAttempts: active.currentAttempts,
    outcomes: active.outcomes.map(o => ({ taskId: o.taskId, status: o.status, attempts: o.attempts })),
  }, key);
}

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/**
 * Open a continuation for `sub` and rebuild the preview game document (same shape the store uses) by regenerating the
 * round from its seed and restoring the progress. Every field is validated against the regenerated round; anything
 * inconsistent → { ok:false }. Returns { ok:true, doc } with doc = { schemaVersion, active, best:null }.
 */
function openPreview(token, { sub, key, now }) {
  if (typeof token !== "string" || !token || token.length > MAX_CONTINUATION_LENGTH || !key) return { ok: false };
  const p = unseal(token, key);
  if (!p || p.v !== PREVIEW_VERSION || String(p.sub) !== String(sub)) return { ok: false };
  if (typeof p.seed !== "string" || !p.seed || typeof p.attemptId !== "string" || !p.attemptId) return { ok: false };
  if (!isPath(p.path) || !isLevel(p.level) || !isInt(p.count, 1, MAX_ROUND_SIZE)) return { ok: false };
  const startedMs = Date.parse(String(p.startedAt));
  const nowMs = Date.parse(String(now)) || Date.now();
  if (!Number.isFinite(startedMs) || nowMs - startedMs > MAX_PREVIEW_AGE_MS) return { ok: false };

  // Regenerate the SAME round through the real store (deterministic from the seed).
  const base = startAttempt(null, { path: p.path, level: p.level, seed: p.seed, attemptId: p.attemptId, count: p.count, now: p.startedAt });
  const tasks = base.active.tasks;
  if (!isInt(p.index, 0, tasks.length - 1) || !isInt(p.currentAttempts, 0, MAX_ATTEMPTS - 1)) return { ok: false };
  if (!Array.isArray(p.outcomes) || p.outcomes.length !== p.index) return { ok: false };
  const outcomesOk = p.outcomes.every((o, i) => o && o.taskId === tasks[i].taskId
    && (o.status === "correct" || o.status === "revealed") && isInt(o.attempts, 1, MAX_ATTEMPTS));
  if (!outcomesOk) return { ok: false };

  const doc = normalizeGameDoc({ active: { ...base.active, index: p.index, currentAttempts: p.currentAttempts, outcomes: p.outcomes } });
  doc.best = null;   // a preview never has a best record
  return { ok: true, doc };
}

module.exports = { PREVIEW_CONTEXT, MAX_CONTINUATION_LENGTH, previewKeyFrom, defaultPreviewKey, sealPreview, openPreview };
