const storage = require("../platform-storage");
const { isTeacherAccountId } = require("../identity/teacher-token");

// Tadris+ P3-B — what the OBSERVE mode saw: «this teacher would have been refused this capability». One small document per
// teacher, so the owner can review it in the console before turning enforcement on:
//   platform/access/observations/<accountId>.json
//   { schemaVersion: 1, accountId, capabilities: { "<capability>": { count, firstAt, lastAt } }, updatedAt }
// `count` counts RECORDED observations: the same teacher + capability is written at most once per 10 minutes per process, so a busy
// screen never turns into a write per request. Recording is best effort: it never changes the answer and never blocks.

const OBSERVATION_PREFIX = "platform/access/observations/";
const THROTTLE_MS = 10 * 60 * 1000;
const MAX_TRACKED = 2000;
const recent = new Map();

const observationName = accountId => {
  if (!isTeacherAccountId(accountId)) throw new Error("Invalid teacher account id.");
  return OBSERVATION_PREFIX + accountId + ".json";
};

/** → true when written, false when throttled; throws on a storage error (the caller ignores it). */
async function recordObservation(container, accountId, capability, nowMs = Date.now(), deps = {}) {
  const key = accountId + "|" + capability;
  const last = recent.get(key);
  if (last !== undefined && nowMs - last < THROTTLE_MS) return false;
  if (recent.size >= MAX_TRACKED) recent.clear();
  recent.set(key, nowMs);
  const iso = new Date(nowMs).toISOString();
  await (deps.mutateJsonWithRetry || storage.mutateJsonWithRetry)(container, observationName(accountId), current => {
    const doc = current && typeof current === "object" && current.schemaVersion === 1 ? current : { schemaVersion: 1, accountId, capabilities: {} };
    const entry = doc.capabilities[capability] || { count: 0, firstAt: iso };
    doc.capabilities[capability] = { count: Number(entry.count || 0) + 1, firstAt: entry.firstAt || iso, lastAt: iso };
    doc.updatedAt = iso;
    return doc;
  });
  return true;
}

/** The stored observations of one teacher (or an empty set). */
async function readObservations(container, accountId, deps = {}) {
  const doc = await (deps.downloadJsonOrNull || storage.downloadJsonOrNull)(container, observationName(accountId));
  if (!doc || doc.schemaVersion !== 1 || doc.accountId !== accountId || !doc.capabilities || typeof doc.capabilities !== "object") return {};
  return doc.capabilities;
}

/** Tests only. */
function resetObservationThrottle() { recent.clear(); }

module.exports = { OBSERVATION_PREFIX, observationName, recordObservation, readObservations, resetObservationThrottle };
