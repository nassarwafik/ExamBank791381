const storage = require("../platform-storage");
const { isCapability, isOwnerOnly } = require("./capabilities");
const { readAccessMode } = require("./access-mode");
const { resolveTeacherAccess } = require("./resolver");

// Tadris+ P3-A — authorize(): the ONE capability decision for a verified teacher session (blueprint §4.3). P3-B calls it from
// every teacher route; in P3-A it is the library (and its tests) only, so nothing changes yet.
//
//   unknown capability          → a programming error: throws (a route can never ask for a capability that does not exist)
//   platform.* capability       → refused in EVERY mode (owner routes never pass through observe; a teacher never holds one)
//   mode legacy                 → allowed, nothing is computed (today's behaviour)
//   mode observe                → computed; «would deny» and «could not decide» are logged, the request is ALLOWED
//   mode enforce                → computed; not granted → 403 CAPABILITY_DENIED; could not decide → 503 ACCESS_UNAVAILABLE
//   the mode cannot be read     → 503 ACCESS_UNAVAILABLE (fail closed: we cannot know enforcement is off)
// → { allowed: true, mode, decision, access? } | { allowed: false, mode, decision, response }

const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };
const denied = capability => ({ status: 403, headers: NO_STORE, jsonBody: { ok: false, code: "CAPABILITY_DENIED", error: "هذه الأداة غير مفعّلة لحسابك. تواصل مع إدارة المنصة.", capability } });
const unavailable = () => ({ status: 503, headers: { ...NO_STORE, "Retry-After": "5" }, jsonBody: { ok: false, code: "ACCESS_UNAVAILABLE", error: "تعذر التحقق من الصلاحيات حاليًا. حاول مرة أخرى." } });

async function authorize(user, capabilityId, deps = {}, obs = null) {
  if (!isCapability(capabilityId)) throw new Error("authorize(): unknown capability " + String(capabilityId));
  if (isOwnerOnly(capabilityId)) return { allowed: false, mode: "any", decision: "deny", response: denied(capabilityId) };
  const containerOf = () => deps.container || (deps.getContainer || storage.getContainer)();
  let mode;
  try { mode = (await readAccessMode(containerOf(), deps)).mode; } catch {
    obs?.logWarn?.("access.mode.unavailable", { capability: capabilityId });
    return { allowed: false, mode: "unknown", decision: "unavailable", response: unavailable() };
  }
  if (mode === "legacy") return { allowed: true, mode, decision: "not-evaluated" };

  let access = null;
  try { access = await resolveTeacherAccess(user, { ...deps, container: deps.container, getContainer: deps.getContainer }); } catch (e) {
    obs?.logWarn?.(mode === "observe" ? "access.observe.unavailable" : "access.unavailable", { capability: capabilityId, reason: String(e && e.code || "error") });
    if (mode === "observe") return { allowed: true, mode, decision: "unavailable" };
    return { allowed: false, mode, decision: "unavailable", response: unavailable() };
  }
  const granted = access.capabilities.includes(capabilityId);
  if (granted) return { allowed: true, mode, decision: "allow", access };
  if (mode === "observe") {
    obs?.logWarn?.("access.observe.would_deny", { capability: capabilityId, source: access.source, preset: access.preset ? access.preset.id : "none" });
    return { allowed: true, mode, decision: "would-deny", access };
  }
  obs?.logWarn?.("access.denied", { capability: capabilityId, source: access.source });
  return { allowed: false, mode, decision: "deny", access, response: denied(capabilityId) };
}

module.exports = { authorize };
