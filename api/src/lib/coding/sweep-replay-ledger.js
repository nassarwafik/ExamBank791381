// Phase 17D-B1 — durable REPLAY LEDGER for the signed recovery sweep trigger (SA-CODING-SWEEP-1).
//
// Threat: a captured, validly signed POST /api/coding/grading-sweep could be re-submitted while its timestamp is still inside
// the ±SWEEP_MAX_SKEW_SECONDS freshness window. The request id (x-sa-sweep-request-id) is part of the HMAC canonical input, so
// an attacker cannot change it without the key; reserving it ONCE in durable storage makes every signed request execute at
// most once — across concurrent calls and process restarts (no in-memory state).
//
//   • reservation is ONE conditional create (If-None-Match: *, and no other precondition) of
//       platform/system/coding-sweep-replay/<sha256("sa-sweep-replay-v1\n" + requestId)>.json
//     created → accepted. The record already existing is reported as either 409 BlobAlreadyExists or 412 ConditionNotMet
//     (@azure/storage-blob surfaces the latter as RestError { statusCode: 412, code / details.errorCode: "ConditionNotMet" });
//     because If-None-Match: * is this write's ONLY condition, both can mean only "already reserved" → replay. ANY other
//     outcome (5xx, network, auth, 412 / 409 with another, a missing or an inconsistent error code) → the sweep must not run
//     (fail closed). The classification is local to this one write — it is not a general storage-error mapping.
//     The blob name is a fixed prefix + a hex digest: request-id text never becomes a path.
//   • a record holds identifiers-free metadata only: { schemaVersion, protocol, requestDigest, signedAt, acceptedAt, expiresAt }
//     — never the key, the signature, the raw request id, a body, or any student / grading data.
//   • retention: expiresAt = acceptedAt + REPLAY_RETENTION_MS. A request is acceptable only while |now − timestamp| ≤ skew, and
//     its timestamp can be up to `skew` older than its acceptance, so it can be re-presented at most 2·skew after acceptance;
//     REPLAY_RETENTION_MS ≥ 2·skew + REPLAY_SAFETY_MARGIN_MS keeps every record alive long after its request turned stale.
//     The presence of a record ALWAYS means "replay" (expiry never re-admits an id); expiry only makes a record prunable.
//   • cleanup is opportunistic and bounded: one listing page of at most REPLAY_CLEANUP_LIMITS.maxScanned names, at most that many
//     record reads and at most maxDeleted ETag-conditional deletes per call, resuming from a small cursor blob. Cleanup errors
//     are swallowed — replay correctness never depends on cleanup.
const crypto = require("crypto");
const storage = require("../platform-storage");
const { SWEEP_PROTOCOL, SWEEP_MAX_SKEW_SECONDS } = require("./sweep-protocol");

const REPLAY_LEDGER_PREFIX = "platform/system/coding-sweep-replay/";
const REPLAY_CLEANUP_CURSOR_NAME = "platform/system/coding-sweep-replay-cursor.json";
const REPLAY_SAFETY_MARGIN_MS = 60 * 60 * 1000;                                       // 1 h beyond the last possible replay
const REPLAY_RETENTION_MS = 24 * 60 * 60 * 1000;                                      // ≫ 2 · 300 s + 1 h
const REPLAY_CLEANUP_LIMITS = Object.freeze({ maxScanned: 25, maxDeleted: 10 });
const CURSOR_TOKEN_MAX = 4096;
const RECORD_NAME = /^platform\/system\/coding-sweep-replay\/[0-9a-f]{64}\.json$/;

if (REPLAY_RETENTION_MS < 2 * SWEEP_MAX_SKEW_SECONDS * 1000 + REPLAY_SAFETY_MARGIN_MS) throw new Error("replay retention must exceed the freshness window");

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const iso = ms => new Date(ms).toISOString();

/** The ledger digest of an (already validated, HMAC-authenticated) request id. */
function replayDigest(requestId) {
  return crypto.createHash("sha256").update("sa-sweep-replay-v1\n" + String(requestId), "utf8").digest("hex");
}
/** The fixed-prefix ledger blob name of a request id (hex digest only — no request-id text in the path). */
function replayLedgerName(requestId) {
  return REPLAY_LEDGER_PREFIX + replayDigest(requestId) + ".json";
}

// The two representations of "If-None-Match: * failed because the blob exists" for the reservation's create-only write.
const CREATE_ONLY_CONFLICTS = Object.freeze([Object.freeze([409, "BlobAlreadyExists"]), Object.freeze([412, "ConditionNotMet"])]);
const present = v => v !== undefined && v !== null && v !== "";

/** Does a failed reservation write prove the record ALREADY EXISTS? The status and the error code must agree across every place
 *  the SDK reports them and match one create-only conflict exactly (a missing one never matches); anything else is unknown. */
function isExistingReservation(e) {
  if (!e || typeof e !== "object") return false;
  const statuses = [e.statusCode, e.response && e.response.status].filter(present).map(Number);
  const codes = [e.code, e.details && e.details.errorCode].filter(present).map(String);
  if (!statuses.every(s => s === statuses[0]) || !codes.every(c => c === codes[0])) return false;
  return CREATE_ONLY_CONFLICTS.some(([status, code]) => statuses[0] === status && codes[0] === code);
}

/**
 * ATOMICALLY reserves one authenticated request id. Call only AFTER signature, freshness and body validation.
 * → { ok: true } | { ok: false, code: "REPLAYED_REQUEST" } | { ok: false, code: "LEDGER_UNAVAILABLE" }
 */
async function reserveSweepRequest(container, { requestId, timestamp, nowMs = Date.now() }) {
  const requestDigest = replayDigest(requestId);
  const record = { schemaVersion: 1, protocol: SWEEP_PROTOCOL, requestDigest, signedAt: iso(Number(timestamp) * 1000), acceptedAt: iso(nowMs), expiresAt: iso(nowMs + REPLAY_RETENTION_MS) };
  try {
    await storage.uploadJsonConditional(container, REPLAY_LEDGER_PREFIX + requestDigest + ".json", record, null);   // If-None-Match: *
    return { ok: true };
  } catch (e) {
    if (isExistingReservation(e)) return { ok: false, code: "REPLAYED_REQUEST" };
    return { ok: false, code: "LEDGER_UNAVAILABLE" };                                  // fail closed: anything else is not a reservation
  }
}

/**
 * ONE bounded cleanup step: lists one page (≤ maxScanned names) after the stored cursor, reads those records and deletes at
 * most maxDeleted EXPIRED ones (ETag-conditional). Never throws; returns { scanned, deleted }.
 */
async function pruneReplayLedger(container, { nowMs = Date.now(), limits = REPLAY_CLEANUP_LIMITS } = {}) {
  const maxScanned = Math.max(1, Math.min(REPLAY_CLEANUP_LIMITS.maxScanned, Number(limits.maxScanned) || REPLAY_CLEANUP_LIMITS.maxScanned));
  const maxDeleted = Math.max(0, Math.min(REPLAY_CLEANUP_LIMITS.maxDeleted, Number.isInteger(limits.maxDeleted) ? limits.maxDeleted : REPLAY_CLEANUP_LIMITS.maxDeleted));
  const out = { scanned: 0, deleted: 0 };
  try {
    const cursor = await storage.downloadJsonOrNull(container, REPLAY_CLEANUP_CURSOR_NAME).catch(() => null);
    let token = isObj(cursor) && typeof cursor.continuationToken === "string" && cursor.continuationToken.length <= CURSOR_TOKEN_MAX && /^[\x21-\x7e]+$/.test(cursor.continuationToken) ? cursor.continuationToken : null;
    let page;
    try { page = await storage.listBlobNamesPage(container, REPLAY_LEDGER_PREFIX, { continuationToken: token, maxPageSize: maxScanned }); }
    catch (e) { if (e && e.code === "INVALID_CONTINUATION_TOKEN") { token = null; page = await storage.listBlobNamesPage(container, REPLAY_LEDGER_PREFIX, { maxPageSize: maxScanned }); } else throw e; }
    for (const name of page.names.slice(0, maxScanned)) {
      if (!RECORD_NAME.test(name)) continue;
      out.scanned++;
      if (out.deleted >= maxDeleted) continue;
      let entry;
      try { entry = await storage.downloadJsonWithEtagOrNull(container, name); } catch { continue; }
      const exp = isObj(entry.value) ? Date.parse(entry.value.expiresAt) : NaN;
      if (!entry.etag || !Number.isFinite(exp) || exp >= nowMs) continue;               // malformed or unexpired → keep
      try { await storage.deleteBlobConditional(container, name, entry.etag); out.deleted++; } catch { /* changed meanwhile */ }
    }
    await storage.uploadJson(container, REPLAY_CLEANUP_CURSOR_NAME, { schemaVersion: 1, continuationToken: page.continuationToken || null, updatedAt: iso(nowMs) });
  } catch { /* cleanup is best effort; reservation stays authoritative */ }
  return out;
}

module.exports = { REPLAY_LEDGER_PREFIX, REPLAY_CLEANUP_CURSOR_NAME, REPLAY_RETENTION_MS, REPLAY_SAFETY_MARGIN_MS, REPLAY_CLEANUP_LIMITS, replayDigest, replayLedgerName, reserveSweepRequest, pruneReplayLedger };
