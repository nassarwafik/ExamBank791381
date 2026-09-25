// Phase 6B — Web Push subscriptions for STUDENTS (opt-in message notifications).
//
// Storage (Azure Blob, same container as the platform):
//   platform/push/students/<studentId>.json   { schemaVersion, studentId, subscriptions: [{ id, endpoint, keys, createdAt, updatedAt }] }
//   platform/push/endpoints/<id>.json         { schemaVersion, id, studentId, updatedAt }   (one OWNER per browser endpoint)
// `id` = sha256(endpoint) hex. A student may own several subscriptions (phone, tablet, another browser), each stored
// once (deduplicated by endpoint). An endpoint has exactly ONE owner: when another student subscribes the same browser
// (shared device), ownership moves to them and it is removed from the previous student's list, and every send
// re-checks the owner, so a student's notifications never reach a device now registered to someone else.
// Only what Web Push needs is stored (endpoint + p256dh/auth keys + timestamps) — no names, no message data.
// Every write is a CAS read-modify-write (mutateJsonWithRetry). The studentId ALWAYS comes from the verified session.

const crypto = require("crypto");
const { downloadJsonOrNull, mutateJsonWithRetry, uploadJson, deleteBlob } = require("./platform-storage");

const STUDENT_PREFIX = "platform/push/students/";
const ENDPOINT_PREFIX = "platform/push/endpoints/";
const MAX_SUBSCRIPTIONS_PER_STUDENT = 10;
const MAX_ENDPOINT_LENGTH = 2048;

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

function endpointId(endpoint) {
  return crypto.createHash("sha256").update(String(endpoint)).digest("hex");
}

function isAllowedPushHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return PUSH_SERVICE_HOST_SUFFIXES.some(s => host === s || host.endsWith("." + s));
}

function b64urlBytes(value) {
  try { return Buffer.from(String(value).replace(/-/g, "+").replace(/_/g, "/"), "base64").length; } catch { return 0; }
}

/**
 * Validate a browser PushSubscription JSON ({ endpoint, keys: { p256dh, auth } }). Returns the minimal normalized
 * subscription, or null. p256dh must be an uncompressed P-256 point (65 bytes), auth a 16-byte secret.
 */
function normalizeSubscription(input) {
  if (!input || typeof input !== "object") return null;
  const endpoint = typeof input.endpoint === "string" ? input.endpoint.trim() : "";
  if (!endpoint || endpoint.length > MAX_ENDPOINT_LENGTH) return null;
  let url;
  try { url = new URL(endpoint); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || !isAllowedPushHost(url.hostname)) return null;
  const keys = input.keys && typeof input.keys === "object" ? input.keys : null;
  const p256dh = keys && typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = keys && typeof keys.auth === "string" ? keys.auth.trim() : "";
  if (!B64URL.test(p256dh) || !B64URL.test(auth) || p256dh.length > 200 || auth.length > 64) return null;
  if (b64urlBytes(p256dh) !== 65 || b64urlBytes(auth) !== 16) return null;
  return { endpoint, keys: { p256dh, auth } };
}

const studentDocName = studentId => STUDENT_PREFIX + studentId + ".json";
const endpointDocName = id => ENDPOINT_PREFIX + id + ".json";

function cleanList(doc) {
  return doc && Array.isArray(doc.subscriptions) ? doc.subscriptions.filter(s => s && typeof s.id === "string" && typeof s.endpoint === "string" && s.keys) : [];
}

/** All stored subscriptions of one student (possibly empty). */
async function listStudentSubscriptions(container, studentId, deps = {}) {
  if (!SAFE_ID.test(String(studentId || ""))) return [];
  const doc = await (deps.downloadJsonOrNull || downloadJsonOrNull)(container, studentDocName(studentId));
  return cleanList(doc);
}

/** The student who currently owns an endpoint id ("" when unknown). */
async function endpointOwner(container, id, deps = {}) {
  const doc = await (deps.downloadJsonOrNull || downloadJsonOrNull)(container, endpointDocName(id));
  return doc && typeof doc.studentId === "string" ? doc.studentId : "";
}

async function removeFromStudent(container, studentId, ids, deps = {}) {
  const drop = new Set(ids);
  if (!drop.size || !SAFE_ID.test(String(studentId || ""))) return 0;
  let removed = 0;
  await (deps.mutateJsonWithRetry || mutateJsonWithRetry)(container, studentDocName(studentId), current => {
    const list = cleanList(current);
    const kept = list.filter(s => !drop.has(s.id));
    removed = list.length - kept.length;
    return { schemaVersion: 1, studentId, subscriptions: kept, updatedAt: new Date().toISOString() };
  });
  return removed;
}

/**
 * Save (or refresh) THIS browser's subscription for the authenticated student. Idempotent: the same endpoint is kept
 * once (keys/updatedAt refreshed). A shared browser moves to the new student. Returns { id, created }.
 */
async function upsertStudentSubscription(container, studentId, subscription, deps = {}) {
  if (!SAFE_ID.test(String(studentId || ""))) throw new Error("invalid student id");
  const now = (deps.now || (() => new Date()))().toISOString();
  const id = endpointId(subscription.endpoint);
  const previousOwner = await endpointOwner(container, id, deps);
  if (previousOwner && previousOwner !== studentId) await removeFromStudent(container, previousOwner, [id], deps);
  await (deps.uploadJson || uploadJson)(container, endpointDocName(id), { schemaVersion: 1, id, studentId, updatedAt: now });
  let created = false;
  await (deps.mutateJsonWithRetry || mutateJsonWithRetry)(container, studentDocName(studentId), current => {
    const list = cleanList(current);
    const existing = list.find(s => s.id === id);
    let next;
    if (existing) {
      created = false;
      next = list.map(s => (s.id === id ? { ...s, endpoint: subscription.endpoint, keys: subscription.keys, updatedAt: now } : s));
    } else {
      created = true;
      next = [...list, { id, endpoint: subscription.endpoint, keys: subscription.keys, createdAt: now, updatedAt: now }];
      // Bound the list: keep the most recently refreshed devices.
      if (next.length > MAX_SUBSCRIPTIONS_PER_STUDENT) next = next.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, MAX_SUBSCRIPTIONS_PER_STUDENT);
    }
    return { schemaVersion: 1, studentId, subscriptions: next, updatedAt: now };
  });
  return { id, created };
}

/** Remove THIS browser's subscription from the authenticated student only (never another student's). */
async function removeStudentSubscription(container, studentId, endpoint, deps = {}) {
  if (typeof endpoint !== "string" || !endpoint) return { removed: 0 };
  const id = endpointId(endpoint.trim());
  const removed = await removeFromStudent(container, studentId, [id], deps);
  if ((await endpointOwner(container, id, deps)) === studentId) await (deps.deleteBlob || deleteBlob)(container, endpointDocName(id));
  return { removed };
}

/** Drop subscriptions the push service reported as gone (404/410) — only from this student, only if still owned. */
async function removeExpiredSubscriptions(container, studentId, ids, deps = {}) {
  if (!ids.length) return 0;
  const removed = await removeFromStudent(container, studentId, ids, deps);
  for (const id of ids) {
    if ((await endpointOwner(container, id, deps)) === studentId) await (deps.deleteBlob || deleteBlob)(container, endpointDocName(id));
  }
  return removed;
}

module.exports = {
  MAX_SUBSCRIPTIONS_PER_STUDENT, PUSH_SERVICE_HOST_SUFFIXES,
  endpointId, isAllowedPushHost, normalizeSubscription,
  listStudentSubscriptions, endpointOwner, upsertStudentSubscription, removeStudentSubscription, removeExpiredSubscriptions,
  studentDocName, endpointDocName
};
