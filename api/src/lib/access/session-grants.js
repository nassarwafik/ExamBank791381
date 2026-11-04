const storage = require("../platform-storage");
const { readAccessMode } = require("./access-mode");
const { resolveTeacherAccess } = require("./resolver");
const { accessUnavailableResponse } = require("./authorize");
const { isCapability } = require("./capabilities");

// Tadris+ P7-A1 — which capabilities THIS teacher session holds, for a route that serves several sections behind ONE gate (the
// dashboard's «اليوم», the analytics, the reports): each section is served only with the capability behind it (blueprint §9.2).
// The same rules as authorize() / requireCapability(), read ONCE per request:
//
//   not a managed session (shared password, BUILDER_USERS)  → every section (legacy-full holds every teacher capability)
//   mode legacy / observe                                    → every section (nothing is narrowed before enforcement, exactly like
//                                                              the capabilities themselves)
//   mode enforce                                             → only the sections whose capabilities the session's revision holds
//   the mode or the revision cannot be read                  → { ok: false, response: 503 ACCESS_UNAVAILABLE } (fail closed: never
//                                                              a full answer, never a silently narrowed one)
//
// Tadris+ P7-A2 — `widgets`: the revision's widget entitlement (`resources.widgets`), applied with the capabilities (enforce only):
// null = every widget; a Set = only those.
//
// → { ok: true, narrowed: boolean, has(capability), widgets: Set | null } | { ok: false, response }

const known = c => { if (!isCapability(c)) throw new Error("sessionGrants(): unknown capability " + String(c)); return c; };
const EVERYTHING = Object.freeze({ ok: true, narrowed: false, has: c => !!known(c), widgets: null, games: null });

async function sessionGrants(user, deps = {}, obs = null) {
  if (!user || user.am !== "managed") return EVERYTHING;
  const container = deps.container || (deps.getContainer || storage.getContainer)();
  let mode;
  try { mode = (await readAccessMode(container, deps)).mode; } catch {
    obs?.logWarn?.("access.sections.unavailable", { reason: "mode" });
    return { ok: false, response: accessUnavailableResponse() };
  }
  if (mode !== "enforce") return EVERYTHING;
  let access;
  try { access = await resolveTeacherAccess(user, { ...deps, container }); } catch (e) {
    obs?.logWarn?.("access.sections.unavailable", { reason: String(e && e.code || "error") });
    return { ok: false, response: accessUnavailableResponse() };
  }
  const held = new Set(access.capabilities);
  return Object.freeze({
    ok: true, narrowed: true,
    has: c => held.has(known(c)),
    widgets: Array.isArray(access.widgets) ? new Set(access.widgets) : null,
    games: Array.isArray(access.games) ? new Set(access.games) : null   // Tadris+ P7-B2
  });
}

module.exports = { sessionGrants };
