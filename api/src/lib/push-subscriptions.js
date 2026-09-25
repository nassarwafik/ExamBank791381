// Phase 6B — Web Push subscriptions for STUDENTS (opt-in message notifications).
//
// Storage (Azure Blob, same container as the platform):
//   platform/push/students/<studentId>.json   { schemaVersion, studentId, subscriptions: [{ id, endpoint, keys, claim, createdAt, updatedAt }] }
//   platform/push/endpoints/<id>.json         { schemaVersion, id, studentId, claim, updatedAt }   (the ONE owner of a browser endpoint)
// `id` = sha256(canonical endpoint) hex. A student may own several subscriptions (phone, tablet, another browser), each
// stored once. Every registration gets a random `claim`, written to BOTH the owner record and the student's list entry.
//
// Ownership rules (the blobs cannot be updated atomically together, so each step is individually safe):
//  - The owner record is the authority. It only changes by compare-and-set (ETag) — never a blind overwrite or delete.
//    Releasing it (unsubscribe, expired endpoint, device-cap eviction) writes studentId "" and ONLY if it still names
//    the same student (and, for automatic cleanup, the same claim), so a stale operation can never undo a newer owner.
//  - Sends are FAIL-CLOSED: a device is used only when its owner record explicitly names the student (push-notify).
//    A missing, released or foreign owner record means "do not send" (and the stale list entry is cleaned up).
//  - List cleanup removes an entry only when its claim is unchanged, so a fresh re-registration is never deleted by
//    an older, slower cleanup.
// Only what Web Push needs is stored (endpoint + p256dh/auth keys + timestamps) — no names, no message data.
// The studentId ALWAYS comes from the verified session.

const crypto = require("crypto");
const {
  downloadJsonOrNull, mutateJsonWithRetry, downloadJsonWithEtagOrNull, uploadJsonConditional, isConcurrencyConflict,
  StorageConflictError
} = require("./platform-storage");

const STUDENT_PREFIX = "platform/push/students/";
const ENDPOINT_PREFIX = "platform/push/endpoints/";
const MAX_SUBSCRIPTIONS_PER_STUDENT = 10;
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_CAS_ATTEMPTS = 5;

// Browser push services only (the backend POSTs to the endpoint, so an arbitrary URL would be an SSRF vector).
const PUSH_SERVICE_HOST_SUFFIXES = [
  "fcm.googleapis.com",            // Chrome, Edge (Chromium), Samsung Internet, Opera on Android
  "android.googleapis.com",        // legacy GCM endpoints
  "push.services.mozilla.com",     // Firefox
  "push.apple.com",                // Safari / iOS home-screen web apps (web.push.apple.com)
  "notify.windows.com"             // legacy Edge / Windows (WNS)
];

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;
// The literal authority of an accepted endpoint: plain DNS labels only (no userinfo, port, percent-encoding, IPv6
// brackets or anything another URL parser could read differently).
const LITERAL_HTTPS_AUTHORITY = /^https:\/\/([A-Za-z0-9.-]+)(?:[/?][^#]*)?$/;

function endpointId(endpoint) {
  return crypto.createHash("sha256").update(String(endpoint)).digest("hex");
}

function isAllowedPushHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return PUSH_SERVICE_HOST_SUFFIXES.some(s => host === s || host.endsWith("." + s));
}

/** Whitespace, control characters or a backslash anywhere: parsers disagree on these, so they are never accepted. */
function hasUnsafeUrlChar(raw) {
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f || c === 0x5c) return true;
  }
  return false;
}

/**
 * THE endpoint rule. Returns the canonical endpoint (WHATWG `url.href`) or null. The canonical value — never the raw
 * input — is what is stored, hashed, compared, owned, unsubscribed and handed to the push sender, so validation and
 * sending can never see two different URLs. Required: literally "https://<host>/…", host = a known push service (after
 * WHATWG normalization, which must agree with the literal host), default port only, no userinfo, no fragment, no
 * whitespace/control characters.
 */
function canonicalEndpoint(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > MAX_ENDPOINT_LENGTH || hasUnsafeUrlChar(raw)) return null;
  const literal = LITERAL_HTTPS_AUTHORITY.exec(raw);
  if (!literal) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port !== "" || url.hash) return null;
  if (url.hostname !== literal[1].toLowerCase() || url.hostname.endsWith(".")) return null;
  if (!isAllowedPushHost(url.hostname)) return null;
  return url.href.length <= MAX_ENDPOINT_LENGTH ? url.href : null;
}

function b64urlBytes(value) {
  try { return Buffer.from(String(value).replace(/-/g, "+").replace(/_/g, "/"), "base64").length; } catch { return 0; }
}

/**
 * Validate a browser PushSubscription JSON ({ endpoint, keys: { p256dh, auth } }). Returns the minimal normalized
 * subscription with the CANONICAL endpoint, or null. p256dh must be an uncompressed P-256 point (65 bytes), auth a
 * 16-byte secret.
 */
function normalizeSubscription(input) {
  if (!input || typeof input !== "object") return null;
  const endpoint = canonicalEndpoint(input.endpoint);
  if (!endpoint) return null;
  const keys = input.keys && typeof input.keys === "object" ? input.keys : null;
  const p256dh = keys && typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = keys && typeof keys.auth === "string" ? keys.auth.trim() : "";
  if (!B64URL.test(p256dh) || !B64URL.test(auth) || p256dh.length > 200 || auth.length > 64) return null;
  if (b64urlBytes(p256dh) !== 65 || b64urlBytes(auth) !== 16) return null;
  return { endpoint, keys: { p256dh, auth } };
}

const studentDocName = studentId => STUDENT_PREFIX + studentId + ".json";
const endpointDocName = id => ENDPOINT_PREFIX + id + ".json";
const newClaim = () => crypto.randomBytes(12).toString("hex");
const nowIso = deps => (deps.now || (() => new Date()))().toISOString();

function cleanList(doc) {
  return doc && Array.isArray(doc.subscriptions) ? doc.subscriptions.filter(s => s && typeof s.id === "string" && typeof s.endpoint === "string" && s.keys) : [];
}
function ownerOf(doc) {
  return doc && typeof doc.studentId === "string" ? { studentId: doc.studentId, claim: typeof doc.claim === "string" ? doc.claim : "" } : null;
}
const claimOf = entry => (entry && typeof entry.claim === "string" ? entry.claim : "");

/** Compare-and-set on one JSON blob. `decide(current)` returns the next value, or undefined to leave it untouched. */
async function casJson(container, name, decide, deps = {}) {
  const read = deps.downloadJsonWithEtagOrNull || downloadJsonWithEtagOrNull;
  const write = deps.uploadJsonConditional || uploadJsonConditional;
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const { value, etag } = await read(container, name);
    const next = decide(value);
    if (next === undefined) return false;
    try { await write(container, name, next, etag); return true; }
    catch (e) { if (!isConcurrencyConflict(e)) throw e; }
  }
  throw new StorageConflictError("Optimistic concurrency conflict after " + MAX_CAS_ATTEMPTS + " attempts.");
}

/** All stored subscriptions of one student (possibly empty). */
async function listStudentSubscriptions(container, studentId, deps = {}) {
  if (!SAFE_ID.test(String(studentId || ""))) return [];
  const doc = await (deps.downloadJsonOrNull || downloadJsonOrNull)(container, studentDocName(studentId));
  return cleanList(doc);
}

/** The owner record of an endpoint id: { studentId, claim } (studentId "" = released), or null when there is none. */
async function ownerRecord(container, id, deps = {}) {
  return ownerOf(await (deps.downloadJsonOrNull || downloadJsonOrNull)(container, endpointDocName(id)));
}
/** The student who currently owns an endpoint id ("" when unknown or released). */
async function endpointOwner(container, id, deps = {}) {
  const owner = await ownerRecord(container, id, deps);
  return owner ? owner.studentId : "";
}

const ANY_CLAIM = Symbol("anyClaim");

/** Remove entries from ONE student's list. Each target is { id, claim } (claim ANY_CLAIM = regardless of claim). */
async function removeFromStudent(container, studentId, targets, deps = {}) {
  if (!targets.length || !SAFE_ID.test(String(studentId || ""))) return 0;
  const matches = s => targets.some(t => t.id === s.id && (t.claim === ANY_CLAIM || claimOf(s) === (t.claim || "")));
  let removed = 0;
  await (deps.mutateJsonWithRetry || mutateJsonWithRetry)(container, studentDocName(studentId), current => {
    const list = cleanList(current);
    const kept = list.filter(s => !matches(s));
    removed = list.length - kept.length;
    return { schemaVersion: 2, studentId, subscriptions: kept, updatedAt: new Date().toISOString() };
  });
  return removed;
}

/** Release an owner record, but only while it still names `studentId` (and `claim`, unless ANY_CLAIM). CAS-guarded. */
async function releaseOwner(container, id, studentId, claim, deps = {}) {
  return casJson(container, endpointDocName(id), current => {
    const owner = ownerOf(current);
    if (!owner || !owner.studentId || owner.studentId !== studentId) return undefined;
    if (claim !== ANY_CLAIM && owner.claim !== (claim || "")) return undefined;
    return { schemaVersion: 2, id, studentId: "", claim: "", updatedAt: nowIso(deps) };
  }, deps);
}

/**
 * Save (or refresh) THIS browser's subscription for the authenticated student. Idempotent per endpoint. A shared
 * browser moves to the new student. Returns { id, created, owned }.
 *  1. Take the owner record (CAS). The previous student's list entry for that registration (same claim) is removed.
 *  2. Add/refresh the entry in this student's list with the same claim (evicting beyond the device cap).
 *  3. Converge: if ownership already moved on to another student, drop this (now stale) entry again.
 *  4. Release the owner records of evicted devices that still belong to this registration.
 */
async function upsertStudentSubscription(container, studentId, subscription, deps = {}) {
  if (!SAFE_ID.test(String(studentId || ""))) throw new Error("invalid student id");
  const endpoint = canonicalEndpoint(subscription && subscription.endpoint);
  if (!endpoint) throw new Error("invalid push endpoint");
  const keys = subscription.keys;
  const now = nowIso(deps);
  const id = endpointId(endpoint);
  const claim = (deps.newClaim || newClaim)();

  let previous = null;
  await casJson(container, endpointDocName(id), current => {
    previous = ownerOf(current);
    return { schemaVersion: 2, id, studentId, claim, updatedAt: now };
  }, deps);
  if (previous && previous.studentId && previous.studentId !== studentId) {
    await removeFromStudent(container, previous.studentId, [{ id, claim: previous.claim }], deps);
  }

  let created = false;
  let evicted = [];
  await (deps.mutateJsonWithRetry || mutateJsonWithRetry)(container, studentDocName(studentId), current => {
    const list = cleanList(current);
    evicted = [];
    const existing = list.find(s => s.id === id);
    created = !existing;
    let next = existing
      ? list.map(s => (s.id === id ? { ...s, endpoint, keys, claim, updatedAt: now } : s))
      : [...list, { id, endpoint, keys, claim, createdAt: now, updatedAt: now }];
    if (next.length > MAX_SUBSCRIPTIONS_PER_STUDENT) {
      // Bound the list: keep the most recently refreshed devices (this one always stays).
      const ordered = next.slice().sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : String(b.updatedAt).localeCompare(String(a.updatedAt))));
      const keep = new Set(ordered.slice(0, MAX_SUBSCRIPTIONS_PER_STUDENT).map(s => s.id));
      evicted = next.filter(s => !keep.has(s.id)).map(s => ({ id: s.id, claim: claimOf(s) }));
      next = next.filter(s => keep.has(s.id));
    }
    return { schemaVersion: 2, studentId, subscriptions: next, updatedAt: now };
  });

  const after = await ownerRecord(container, id, deps);
  let owned = !!after && after.studentId === studentId;
  if (!owned) {
    await removeFromStudent(container, studentId, [{ id, claim }], deps);
  } else if (after.claim !== claim) {
    // A newer registration of the same device by the same student won the owner record: align this entry's claim so
    // later cleanups compare against the live registration.
    await (deps.mutateJsonWithRetry || mutateJsonWithRetry)(container, studentDocName(studentId), current => {
      const list = cleanList(current).map(s => (s.id === id && claimOf(s) === claim ? { ...s, claim: after.claim } : s));
      return { schemaVersion: 2, studentId, subscriptions: list, updatedAt: nowIso(deps) };
    });
  }
  for (const e of evicted) await releaseOwner(container, e.id, studentId, e.claim, deps);
  return { id, created, owned };
}

/** Remove THIS browser's subscription from the authenticated student only (never another student's owner record). */
async function removeStudentSubscription(container, studentId, endpoint, deps = {}) {
  const canonical = canonicalEndpoint(endpoint);
  if (!canonical || !SAFE_ID.test(String(studentId || ""))) return { removed: 0 };
  const id = endpointId(canonical);
  const removed = await removeFromStudent(container, studentId, [{ id, claim: ANY_CLAIM }], deps);
  await releaseOwner(container, id, studentId, ANY_CLAIM, deps);
  return { removed };
}

/**
 * Cleanup after a send: `entries` = [{ id, claim }] as they were when the send started (expired 404/410, or no longer
 * owned by this student). A list entry is removed only if its claim is unchanged (not re-registered since), and the
 * owner record is released only if it still names this student with that same claim.
 */
async function removeExpiredSubscriptions(container, studentId, entries, deps = {}) {
  if (!entries.length) return 0;
  const targets = entries.map(e => ({ id: e.id, claim: e.claim || "" }));
  const removed = await removeFromStudent(container, studentId, targets, deps);
  for (const t of targets) await releaseOwner(container, t.id, studentId, t.claim, deps);
  return removed;
}

module.exports = {
  MAX_SUBSCRIPTIONS_PER_STUDENT, PUSH_SERVICE_HOST_SUFFIXES,
  endpointId, isAllowedPushHost, canonicalEndpoint, normalizeSubscription,
  listStudentSubscriptions, ownerRecord, endpointOwner, upsertStudentSubscription, removeStudentSubscription,
  removeExpiredSubscriptions, studentDocName, endpointDocName
};
