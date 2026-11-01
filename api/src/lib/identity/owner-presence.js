const storage = require("../platform-storage");
const { BOOTSTRAP_MARKER } = require("./owner-store");

// Tadris+ P1-B / P2-B — "does a platform owner exist?" — the one answer two rules depend on:
//   - P1-B (D9): the operator tools become owner-only (identity/operator-gate.js);
//   - P2-B (D6): the shared-password teacher mode closes for teachers (teacher-session.js, the two sign-in routes, the session probe).
// The answer is the bootstrap marker (written once, when the owner is created). Once seen it is cached for the life of the process:
// an owner never stops existing, so a later storage hiccup can never re-open what the owner's existence closed. A read error is
// thrown to the caller, which fails closed (503), never "no owner".

let ownerSeen = false;

/**
 * `containerOrGetter`: the container, or a function returning it — resolved only when the answer is not cached yet, so a known
 * owner needs no storage at all. `opts.downloadJsonOrNull` lets a caller with an injected storage reader (the sign-in routes' test
 * seam) use it here too.
 */
async function ownerExists(containerOrGetter, opts = {}) {
  if (ownerSeen) return true;
  const container = typeof containerOrGetter === "function" ? containerOrGetter() : containerOrGetter;
  const marker = await (opts.downloadJsonOrNull || storage.downloadJsonOrNull)(container, BOOTSTRAP_MARKER);
  if (marker) ownerSeen = true;
  return Boolean(marker);
}

/** Tests only: forget the cached marker between isolated scenarios. */
function resetOwnerPresenceCache() { ownerSeen = false; }

module.exports = { ownerExists, resetOwnerPresenceCache };
