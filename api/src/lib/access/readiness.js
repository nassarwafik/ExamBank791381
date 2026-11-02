const { listTeacherAccounts } = require("../identity/teacher-accounts");
const { LEGACY_TEACHER_ACCOUNT_ID } = require("../identity/teacher-token");
const { readObservations } = require("./observations");

// Tadris+ P3-B — readiness for enforcement: every managed teacher with the access in force (assigned by the owner, or the
// account's default) and what the observe mode recorded. READY = no active or invited teacher is left without access: a console
// account without an assigned preset holds nothing (default deny), so enforcing would refuse it everything. A suspended teacher
// is not counted (they cannot sign in); the imported workspace (t_legacy) defaults to legacy-full (owner decision D7).
// P3-B2: the owner can switch to enforce only while this answers ready (owner-access.js).

async function computeReadiness(container, deps = {}) {
  const accounts = await (deps.listTeacherAccounts || listTeacherAccounts)(container);
  const teachers = [];
  for (const a of accounts) {
    const assigned = a.accessRevisionId && a.accessPreset ? { revisionId: a.accessRevisionId, preset: { id: String(a.accessPreset.id), version: Number(a.accessPreset.version) } } : null;
    const defaultAccess = assigned ? null : a.accountId === LEGACY_TEACHER_ACCOUNT_ID ? "legacy-full" : "none";
    const seen = await readObservations(container, a.accountId);
    const wouldDeny = Object.entries(seen).map(([capability, v]) => ({ capability, count: Number(v && v.count) || 0, lastAt: String(v && v.lastAt || "") })).sort((x, y) => y.lastAt.localeCompare(x.lastAt));
    teachers.push({ accountId: a.accountId, username: a.username, displayName: a.displayName, status: a.status, access: assigned, defaultAccess, wouldDeny });
  }
  teachers.sort((x, y) => String(x.displayName).localeCompare(String(y.displayName), "ar"));
  const missing = teachers.filter(t => t.status !== "suspended" && !t.access && t.defaultAccess !== "legacy-full");
  return { ready: missing.length === 0, teachers, missing: missing.map(t => ({ accountId: t.accountId, displayName: t.displayName })) };
}

module.exports = { computeReadiness };
