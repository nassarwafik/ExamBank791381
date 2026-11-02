const storage = require("../platform-storage");
const { AccessError } = require("./revisions");

// Tadris+ P3-A — the rollout mode (blueprint §4.5): platform/system/access-control.json, written by the owner.
//   legacy  (default; also when the document does not exist) — capabilities are not enforced: today's behaviour exactly;
//   observe — authorize() computes the decision and records «would have been refused», never blocking;
//   enforce — full enforcement. P3-B2: the owner can switch to it only through owner-access.js, which first checks that no active
//             teacher is left without access and then passes { enforceReady: true }; nothing else can write it.
// A document that exists but cannot be understood is an AccessError (callers fail closed), never "legacy".

const ACCESS_CONTROL_DOC = "platform/system/access-control.json";
const MODES = Object.freeze(["legacy", "observe", "enforce"]);
const SETTABLE_MODES = Object.freeze(["legacy", "observe"]);   // "enforce" only with { enforceReady: true } (P3-B2 readiness gate)

async function readAccessMode(container, deps = {}) {
  const doc = await (deps.downloadJsonOrNull || storage.downloadJsonOrNull)(container, ACCESS_CONTROL_DOC);
  if (doc === null || doc === undefined) return { mode: "legacy", updatedAt: "", updatedBy: "" };
  if (typeof doc !== "object" || doc.schemaVersion !== 1 || !MODES.includes(doc.mode)) throw new AccessError("ACCESS_MODE_INVALID");
  return { mode: doc.mode, updatedAt: String(doc.updatedAt || ""), updatedBy: String(doc.updatedBy || "") };
}

/**
 * Compare-and-set write of the mode. Throws AccessError("ACCESS_MODE_NOT_SETTABLE") for an unknown mode, and for "enforce" unless
 * the caller checked readiness (`opts.enforceReady === true`).
 */
async function writeAccessMode(container, mode, actor, nowMs = Date.now(), deps = {}, opts = {}) {
  const allowed = SETTABLE_MODES.includes(mode) || (mode === "enforce" && opts.enforceReady === true);
  if (!allowed) throw new AccessError("ACCESS_MODE_NOT_SETTABLE", { mode: String(mode) });
  const iso = new Date(nowMs).toISOString();
  let previous = "legacy";
  await (deps.mutateJsonWithRetry || storage.mutateJsonWithRetry)(container, ACCESS_CONTROL_DOC, current => {
    if (current && MODES.includes(current.mode)) previous = current.mode;
    return { schemaVersion: 1, mode, updatedAt: iso, updatedBy: String(actor || "") };
  });
  return { mode, previous, updatedAt: iso };
}

module.exports = { ACCESS_CONTROL_DOC, MODES, SETTABLE_MODES, readAccessMode, writeAccessMode };
