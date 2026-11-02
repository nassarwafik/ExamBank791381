const storage = require("../platform-storage");
const { AccessError } = require("./revisions");

// Tadris+ P3-A — the rollout mode (blueprint §4.5): platform/system/access-control.json, written by the owner.
//   legacy  (default; also when the document does not exist) — capabilities are not enforced: today's behaviour exactly;
//   observe — authorize() computes the decision and records «would have been refused», never blocking;
//   enforce — full enforcement. It can be read here, but the owner cannot switch to it before P3-B wires every route.
// A document that exists but cannot be understood is an AccessError (callers fail closed), never "legacy".

const ACCESS_CONTROL_DOC = "platform/system/access-control.json";
const MODES = Object.freeze(["legacy", "observe", "enforce"]);
const SETTABLE_MODES = Object.freeze(["legacy", "observe"]);   // P3-B adds "enforce"

async function readAccessMode(container, deps = {}) {
  const doc = await (deps.downloadJsonOrNull || storage.downloadJsonOrNull)(container, ACCESS_CONTROL_DOC);
  if (doc === null || doc === undefined) return { mode: "legacy", updatedAt: "", updatedBy: "" };
  if (typeof doc !== "object" || doc.schemaVersion !== 1 || !MODES.includes(doc.mode)) throw new AccessError("ACCESS_MODE_INVALID");
  return { mode: doc.mode, updatedAt: String(doc.updatedAt || ""), updatedBy: String(doc.updatedBy || "") };
}

/** Compare-and-set write of the mode. Throws AccessError("ACCESS_MODE_NOT_SETTABLE") for a mode the owner may not choose yet. */
async function writeAccessMode(container, mode, actor, nowMs = Date.now(), deps = {}) {
  if (!SETTABLE_MODES.includes(mode)) throw new AccessError("ACCESS_MODE_NOT_SETTABLE", { mode: String(mode) });
  const iso = new Date(nowMs).toISOString();
  let previous = "legacy";
  await (deps.mutateJsonWithRetry || storage.mutateJsonWithRetry)(container, ACCESS_CONTROL_DOC, current => {
    if (current && MODES.includes(current.mode)) previous = current.mode;
    return { schemaVersion: 1, mode, updatedAt: iso, updatedBy: String(actor || "") };
  });
  return { mode, previous, updatedAt: iso };
}

module.exports = { ACCESS_CONTROL_DOC, MODES, SETTABLE_MODES, readAccessMode, writeAccessMode };
