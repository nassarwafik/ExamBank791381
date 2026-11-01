const storage = require("./platform-storage");
const { requireBuilderAuth } = require("./builder-auth");
const { managedTeacherClaim } = require("./identity/teacher-token");
const { readTeacherAccount, sessionRevoked } = require("./identity/teacher-accounts");
const { ownerExists } = require("./identity/owner-presence");

// Tadris+ P2-A1/P2-A2 — the ONE asynchronous teacher-session check every teacher route awaits (owner decision 2026-11-01: a
// suspended teacher loses access from the NEXT request).
//
//   1. The existing teacher session (HMAC v2 / legacy, BUILDER_USERS or the shared password) — exactly requireBuilderAuth.
//      `deps.requireBuilderAuth` (tests) is honoured. Tadris+ P2-B (owner decision D6): a SHARED-PASSWORD session (any session
//      that is not a BUILDER_USERS one) is accepted only while no platform owner exists. Once the owner exists it is refused
//      (401 LEGACY_SESSION_CLOSED) on the next request — this also ends blueprint S4 (that mode lets the holder of the shared
//      password choose any `sub`). The owner's existence cannot be read → 503, never allowed.
//   2. Otherwise a MANAGED teacher session (token v3, accounts created by the owner): its signature and lifetime, then the stored
//      account on EVERY request — status "active", authVersion equal to the token's, the session id not ended by logout.
//      Suspension, a password reset or «end sessions» therefore take effect on the very next request.
//      Storage unavailable → 503 (fail closed), never allowed.
// The tenancy registry pins that every teacher route awaits this function and none calls requireBuilderAuth directly.

const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };
const unavailable = () => ({ ok: false, response: { status: 503, headers: { ...NO_STORE, "Retry-After": "5" }, jsonBody: { ok: false, code: "TEACHER_SESSION_UNAVAILABLE", error: "تعذر التحقق من الجلسة حاليًا. حاول مرة أخرى." } } });
const LEGACY_CLOSED_MESSAGE = "أُغلق الدخول بكلمة المرور المشتركة بعد إنشاء حساب مالك المنصة. ادخل باسم المستخدم وكلمة المرور الخاصين بك.";
const legacyClosed = () => ({ ok: false, response: { status: 401, headers: NO_STORE, jsonBody: { ok: false, code: "LEGACY_SESSION_CLOSED", error: LEGACY_CLOSED_MESSAGE } } });
const containerOf = deps => deps.container || (deps.getContainer || storage.getContainer)();

/**
 * Whether a session verified by requireBuilderAuth belongs to the shared-password mode. Exactly what that verifier returns in
 * that mode: a v2 token bound to it (`am: "legacy"`), a v2 token issued before sessions carried the claim (14B compatibility: no
 * `am`), or a pre-R8 token (`legacy: true`). A BUILDER_USERS session (`am: "multi-user"`) is not one.
 */
function sharedPasswordSession(user) {
  if (!user || typeof user !== "object") return false;
  return user.am === "legacy" || user.legacy === true || (user.ver === 2 && user.am === undefined);
}

const revoked = () => ({ ok: false, response: { status: 401, headers: NO_STORE, jsonBody: { ok: false, code: "TEACHER_SESSION_REVOKED", error: "انتهت الجلسة. سجّل الدخول مرة أخرى." } } });

async function requireTeacherSession(request, deps = {}) {
  const legacy = (deps.requireBuilderAuth || requireBuilderAuth)(request);
  if (legacy && legacy.ok) {
    if (!sharedPasswordSession(legacy.user)) return legacy;
    let closed;
    try { closed = await ownerExists(() => containerOf(deps)); } catch { return unavailable(); }
    return closed ? legacyClosed() : legacy;
  }
  const nowMs = deps.now ? deps.now() : Date.now();
  const claim = managedTeacherClaim(request, { nowMs });
  if (!claim) return legacy;

  let account;
  try {
    account = await readTeacherAccount(containerOf(deps), claim.sub);
  } catch {
    return unavailable();
  }
  if (!account || account.status !== "active" || !account.credential) return revoked();
  if (account.authVersion !== claim.av || sessionRevoked(account, claim.sid, nowMs)) return revoked();
  return { ok: true, user: { ...claim, displayName: String(account.displayName || "") } };
}

module.exports = { requireTeacherSession, sharedPasswordSession, LEGACY_CLOSED_MESSAGE };
