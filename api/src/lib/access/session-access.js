const { resolveTeacherAccess } = require("./resolver");
const { readAccessMode } = require("./access-mode");

// Tadris+ P3-C — the `access` a teacher's session answer carries (sign-in and the session probe), so the UI knows which tools to
// offer without an extra request:
//   { status: "ok", source, preset, capabilities, enforced } — `enforced`: whether the server limits THIS session right now (a
//   managed session while the owner's mode is enforce); every other verified teacher session is never limited (legacy-full);
//   { status: "unavailable", capabilities: [] } — it could not be resolved (the UI then offers nothing: fail closed).
// Never throws.
async function sessionAccess(user, deps = {}, obs = null) {
  try {
    const a = await resolveTeacherAccess(user, deps);
    const containerOf = () => deps.container || deps.getContainer();
    const enforced = user && user.am === "managed" ? (await readAccessMode(containerOf(), deps)).mode === "enforce" : false;
    return { status: "ok", source: a.source, preset: a.preset, capabilities: a.capabilities, enforced };
  } catch (e) {
    obs?.logWarn?.("access.resolve.unavailable", { reason: String(e && e.code || "error") });
    return { status: "unavailable", capabilities: [] };
  }
}

module.exports = { sessionAccess };
