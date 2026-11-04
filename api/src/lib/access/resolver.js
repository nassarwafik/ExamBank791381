const storage = require("../platform-storage");
const { LEGACY_TEACHER_ACCOUNT_ID } = require("../identity/teacher-token");
const { sharedPasswordSession } = require("../teacher-session");
const { LEGACY_FULL, preset } = require("./presets");
const { AccessError, readRevision } = require("./revisions");

// Tadris+ P3-A — the resolver: a verified teacher session → its EFFECTIVE capabilities (blueprint §4.3–§4.4).
//
//   managed account WITH a revision     → that revision (read once, cached forever by id: revisions are immutable)
//   managed t_legacy without a revision → legacy-full (the imported shared-password workspace, owner decision D7)
//   managed console account without one → NOTHING (default deny: an account the owner has not given access gets none)
//   BUILDER_USERS session               → legacy-full (an identity that predates the Owner Console, D7)
//   shared-password session (no owner)  → legacy-full (today's behaviour; that mode closes once an owner exists, D6)
//   anything else                       → AccessError PRINCIPAL_UNKNOWN (fail closed)
// P5-A — `courses`: the course entitlement (null = every published course; an array = only those). Owner decisions §19.13.
// P7-A2 — `widgets`: the dashboard-widget entitlement, the same rule (null = every widget; an array = only those).
// P7-B2 — `games`: the educational-game entitlement, the same rule (null = every game; an array = only those).
// P8-A2 — `appearance`: the owner's appearance restriction ({ part: allowed values }; null / a part absent = every value).
// A revision that cannot be trusted (missing, another account's, unknown preset / capability, broken dependency) is an
// AccessError; a storage error propagates. Callers fail closed on both. Capabilities never come from the token or the client.
//
// `user` is what requireTeacherSession returns; for a managed account it carries the account's CURRENT accessRevisionId (read
// from the account on every request), so an access change takes effect on the next request.

const legacyFull = source => {
  const p = preset(LEGACY_FULL.id, LEGACY_FULL.version);
  return { source, revisionId: null, preset: { id: p.id, version: p.version }, capabilities: [...p.capabilities].sort(), courses: null, widgets: null, games: null, appearance: null };
};

async function resolveTeacherAccess(user, deps = {}) {
  if (!user || typeof user !== "object" || typeof user.sub !== "string" || !user.sub) throw new AccessError("PRINCIPAL_UNKNOWN");
  if (user.am === "managed") {
    if (user.accessRevisionId) {
      const container = deps.container || (deps.getContainer || storage.getContainer)();
      const entry = await readRevision(container, user.accessRevisionId, user.sub, deps);
      return { source: "revision", revisionId: entry.revision.revisionId, preset: { ...entry.preset }, capabilities: [...entry.capabilities], courses: entry.courses ? [...entry.courses] : null, widgets: entry.widgets ? [...entry.widgets] : null, games: entry.games ? [...entry.games] : null, appearance: entry.appearance ? { ...entry.appearance } : null };
    }
    if (user.sub === LEGACY_TEACHER_ACCOUNT_ID) return legacyFull("migrated-default");
    return { source: "unassigned", revisionId: null, preset: null, capabilities: [], courses: null, widgets: null, games: null, appearance: null };
  }
  if (user.am === "multi-user") return legacyFull("migrated-default");
  if (sharedPasswordSession(user)) return legacyFull("shared-password");
  throw new AccessError("PRINCIPAL_UNKNOWN");
}

module.exports = { resolveTeacherAccess };
