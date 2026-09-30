const { downloadJsonOrNull } = require("./platform-storage");
const { listBuilderAccounts } = require("./builder-users");
const { governanceDirectorySnapshot, governanceWorkflowMode } = require("./exam-governance-capabilities");
const { profileDocName, normalizeDisplayName } = require("./teacher-profile");

// Phase 14B §9 — the ONE server-owned governance actor directory, derived from (1) the authenticated teacher-account
// configuration (BUILDER_USERS), (2) the server capability configuration and (3) optionally the stored teacher profile.
// Display-name precedence: stored profile displayName → configured account displayName → account id. The result is
// display / selection data for the authoring UI (actorId, displayName, capabilities) — never passwordEnv, never a secret,
// never raw configuration, never token data. It enumerates only server-configured accounts (no arbitrary profile lookup),
// and the authority re-validates every assignment against the id snapshot, not against anything the client selected.
async function listGovernanceActors(container, env = process.env, deps = {}) {
  const snapshot = governanceDirectorySnapshot(env);
  if (snapshot.mode !== "assigned") return { mode: governanceWorkflowMode(env), actors: [] };
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const names = new Map(listBuilderAccounts(env).map(a => [a.actorId, a.displayName]));
  const actors = [];
  for (const actor of snapshot.actors) {
    let profileName = null;
    try { const doc = await dl(container, profileDocName(actor.actorId)); profileName = doc ? normalizeDisplayName(doc.displayName) : null; } catch { profileName = null; }
    actors.push({ actorId: actor.actorId, displayName: profileName || names.get(actor.actorId) || actor.actorId, capabilities: actor.capabilities });
  }
  return { mode: "assigned", actors };
}

module.exports = { listGovernanceActors };
