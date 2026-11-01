const { requireBuilderAuth } = require("./builder-auth");

// Tadris+ P2-A1 — the ONE asynchronous teacher-session check every teacher route awaits (owner decision 2026-11-01: a suspended
// teacher loses access from the NEXT request).
//
// Today it is exactly requireBuilderAuth: the HMAC v2 teacher token, its role, lifetime, global version and binding to the
// server's account configuration (BUILDER_USERS / legacy). Nothing about who may sign in, or what a session can do, changes in
// P2-A1. Its purpose is the seam: requireBuilderAuth is synchronous and cannot read storage, so it could never notice that an
// account was suspended after its token was issued. From P2-A2 on, a session of a MANAGED teacher account (created by the owner)
// is re-checked here against the stored account on every request — status, authVersion and the session id — and refused at
// once when the owner suspends the account, resets its password or ends its sessions. Storage unavailable → 503, never allowed.
//
// The tenancy registry pins that every teacher route awaits this function and none calls requireBuilderAuth directly.
// `deps.requireBuilderAuth` (tests) is honoured exactly as before.

async function requireTeacherSession(request, deps = {}) {
  return (deps.requireBuilderAuth || requireBuilderAuth)(request);
}

module.exports = { requireTeacherSession };
