const storage = require("../platform-storage");
const { requireBuilderAuth } = require("../builder-auth");
const { requireOwnerSession, verifyOwnerToken, ownerTokenFromRequest, stepUpDenial, NO_STORE } = require("./owner-session");
const { ownerExists, resetOwnerPresenceCache } = require("./owner-presence");
const { managedTeacherClaim } = require("./teacher-token");

// Tadris+ P1-B — the platform's operator tools are the OWNER's (owner decision D9). Blueprint §3.4 S1: before this phase any
// signed-in teacher could rewrite the official question bank, switch the platform-wide assignment index, or list the raw
// imports container.
//
// requireOperator(request) is the single gate every operator tool calls (the tenancy registry pins it):
//   - no owner exists yet (the bootstrap marker is absent) → the tools keep today's behaviour (a teacher session), so the
//     platform keeps working until the owner is created;
//   - an owner exists → only an owner session WITH a recent second-factor check (step-up, 10 minutes) passes:
//       teacher token → 403 OWNER_REQUIRED · no / invalid token → 401 · owner without recent step-up → 403 STEP_UP_REQUIRED;
//   - the owner's existence cannot be read (storage error) → 503, never "allowed".
// Token signatures are checked BEFORE any storage access, so an anonymous or forged request is a 401 that costs no storage call.
// Once seen, the marker is cached for the life of the process (identity/owner-presence.js, shared with P2-B's D6 closure): an
// owner never stops existing, so a later storage hiccup can never re-open the tools to teachers.

function deny(status, code, error) {
  return { ok: false, response: { status, headers: NO_STORE, jsonBody: { ok: false, code, error } } };
}

/**
 * → { ok: true, actor: "owner" | "teacher", user: { sub }, owner? } or { ok: false, response }.
 * `user.sub` keeps the shape the tools already use for audit actors ("owner:<accountId>" for the owner).
 */
async function requireOperator(request, deps = {}) {
  const getContainer = deps.getContainer || storage.getContainer;   // resolved at call time (tests replace it)
  const nowMs = deps.now ? deps.now() : Date.now();
  // Cheap checks first (signatures only, no storage): an anonymous or forged request is refused before any storage access.
  const teacher = (deps.requireBuilderAuth || requireBuilderAuth)(request);
  const ownerClaim = verifyOwnerToken(ownerTokenFromRequest(request), { nowMs, env: deps.env || process.env });
  // Tadris+ P2-A2 — a managed teacher (token v3) is a teacher too: refused 403 once an owner exists (managed accounts exist
  // only after the owner did), never treated as anonymous.
  const managedTeacher = !teacher.ok && Boolean(managedTeacherClaim(request, { nowMs }));
  if (!teacher.ok && !ownerClaim && !managedTeacher) return { ok: false, response: teacher.response };

  let exists;
  try {
    exists = await ownerExists(getContainer());
  } catch {
    return deny(503, "OPERATOR_GATE_UNAVAILABLE", "تعذر التحقق من صلاحية هذه الأداة حاليًا. حاول مرة أخرى.");
  }

  if (!exists) {
    if (!teacher.ok) return { ok: false, response: teacher.response };
    return { ok: true, actor: "teacher", user: teacher.user };
  }

  if (!ownerClaim) return deny(403, "OWNER_REQUIRED", "هذه الأداة لمالك المنصة فقط.");
  const owner = await requireOwnerSession(request, { ...deps, getContainer });
  if (!owner.ok) return owner;
  const stepUp = stepUpDenial(owner.session, nowMs);
  if (stepUp) return { ok: false, response: stepUp };
  return { ok: true, actor: "owner", user: { sub: "owner:" + owner.owner.accountId }, owner: owner.owner };
}

/** Tests only: forget the cached marker between isolated scenarios. */
function resetOperatorGateCache() { resetOwnerPresenceCache(); }

module.exports = { requireOperator, resetOperatorGateCache };
