const { isCapability, isOwnerOnly } = require("./capabilities");
const { authorize } = require("./authorize");
const { capabilityFor } = require("./route-capabilities");
const { recordObservation } = require("./observations");
const storage = require("../platform-storage");

// Tadris+ P3-B — the call every teacher route makes at its dispatch point, after requireTeacherSession succeeded:
//
//   const denied = await requireCapability(auth, "manage-students.js", action, deps, obs);
//   if (denied) return denied;
//
// → null (go on) or the response to return (403 CAPABILITY_DENIED / 503 ACCESS_UNAVAILABLE — only in the enforce mode).
//
// Only a MANAGED teacher session is evaluated. Every other verified teacher session is an identity that predates the Owner Console
// — the shared password (before an owner exists), BUILDER_USERS — and the resolver gives those legacy-full, which holds EVERY
// teacher capability; routes only ever ask for teacher capabilities (pinned by the route-capability registry test). Evaluating them
// would always answer «allowed», so they skip the evaluation and its storage read. (The imported t_legacy workspace IS a managed
// session and is evaluated like any other.)

async function requireCapability(session, file, key, deps = {}, obs = null) {
  const wanted = capabilityFor(file, key);
  const list = Array.isArray(wanted) ? wanted : [wanted];
  for (const c of list) if (!isCapability(c) || isOwnerOnly(c)) throw new Error("requireCapability(): not a teacher capability: " + String(c));
  const user = session && session.user;
  if (!user || user.am !== "managed") return null;
  const r = await authorize(user, wanted, deps, obs);
  if (r.decision === "would-deny") {
    // Observe mode: remember it for the owner's review (best effort — never changes the answer).
    try { await recordObservation(deps.container || (deps.getContainer || storage.getContainer)(), user.sub, list.join("|"), Date.now(), deps); } catch { /* recording is secondary */ }
  }
  return r.allowed ? null : r.response;
}

module.exports = { requireCapability };
