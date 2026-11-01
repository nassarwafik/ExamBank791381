const storage = require("./platform-storage");
const { requireBuilderAuth } = require("./builder-auth");
const { managedTeacherClaim } = require("./identity/teacher-token");
const { readTeacherAccount, sessionRevoked } = require("./identity/teacher-accounts");

// Tadris+ P2-A1/P2-A2 — the ONE asynchronous teacher-session check every teacher route awaits (owner decision 2026-11-01: a
// suspended teacher loses access from the NEXT request).
//
//   1. The existing teacher session (HMAC v2 / legacy, BUILDER_USERS or the shared password) — exactly requireBuilderAuth,
//      unchanged. `deps.requireBuilderAuth` (tests) is honoured.
//   2. Otherwise a MANAGED teacher session (token v3, accounts created by the owner): its signature and lifetime, then the stored
//      account on EVERY request — status "active", authVersion equal to the token's, the session id not ended by logout.
//      Suspension, a password reset or «end sessions» therefore take effect on the very next request.
//      Storage unavailable → 503 (fail closed), never allowed.
// The tenancy registry pins that every teacher route awaits this function and none calls requireBuilderAuth directly.

const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };
const revoked = () => ({ ok: false, response: { status: 401, headers: NO_STORE, jsonBody: { ok: false, code: "TEACHER_SESSION_REVOKED", error: "انتهت الجلسة. سجّل الدخول مرة أخرى." } } });

async function requireTeacherSession(request, deps = {}) {
  const legacy = (deps.requireBuilderAuth || requireBuilderAuth)(request);
  if (legacy && legacy.ok) return legacy;
  const nowMs = deps.now ? deps.now() : Date.now();
  const claim = managedTeacherClaim(request, { nowMs });
  if (!claim) return legacy;

  let account;
  try {
    const container = deps.container || (deps.getContainer || storage.getContainer)();
    account = await readTeacherAccount(container, claim.sub);
  } catch {
    return { ok: false, response: { status: 503, headers: { ...NO_STORE, "Retry-After": "5" }, jsonBody: { ok: false, code: "TEACHER_SESSION_UNAVAILABLE", error: "تعذر التحقق من الجلسة حاليًا. حاول مرة أخرى." } } };
  }
  if (!account || account.status !== "active" || !account.credential) return revoked();
  if (account.authVersion !== claim.av || sessionRevoked(account, claim.sid, nowMs)) return revoked();
  return { ok: true, user: { ...claim, displayName: String(account.displayName || "") } };
}

module.exports = { requireTeacherSession };
