const crypto = require("crypto");
const { downloadJsonOrNull, listJson, deleteBlob, mutateJsonWithRetry } = require("../platform-storage");
const { parseBuilderUsers } = require("../builder-users");
const { validUsername, usernameReservationName, createOnly } = require("./owner-store");
const { isTeacherAccountId } = require("./teacher-token");

// Tadris+ P2-A2 — managed teacher accounts, created by the platform owner (owner decisions §19.3, D13).
//
//   platform/accounts/teachers/<t_…>.json            the account (credential hash, status, authVersion, invitation hash …)
//   platform/accounts/usernames/<sha256>.json         create-only username reservation, SHARED with the owner (role "teacher")
//   platform/accounts/invitations/<sha256(token)>.json pointer token-hash → accountId (the account holds the CURRENT hash, so
//                                                     a newer invitation or a reset makes an older link worthless)
//
// Status: "invited" (no password yet) · "active" · "suspended". A password reset keeps "active" but removes the credential until
// the teacher sets a new one through the reset link. The account id is the session subject and the tenancy owner (ownerId).
//
// Trial accounts — a TRIAL teacher account carries `trial: { days, startedAtMs, endsAtMs }`; a permanent account carries no
// `trial`, or `trial: null`. From `endsAtMs` on, the account is refused everywhere a suspended one is: sign-in, every request,
// and the invitation link. A `trial` value that cannot be read (not an object, no finite end) counts as ENDED (fail closed).
// Ending a trial never deletes, archives or changes any of the teacher's data, and never touches their students' work.

const TEACHER_PREFIX = "platform/accounts/teachers/";
const INVITATION_PREFIX = "platform/accounts/invitations/";
const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
const MAX_TEACHER_SESSIONS = 10;   // Tadris+ P10-A — owner decision §19.37: 10 devices; a new sign-in ends the oldest
const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_ENDED_MESSAGE = "انتهت الفترة التجريبية لحسابك. تواصل مع إدارة المنصة لتمديدها أو لتحويل الحساب إلى حساب دائم.";
const TRIAL_WARNING_DAYS = 7;       // «ينتهي قريبًا»: the last week of a trial (owner decision: the in-app warnings start a week before)
const MIN_TRIAL_DAYS = 1;
const MAX_TRIAL_DAYS = 90;

/** A whole number of trial days the owner may give (1–90), or null. */
function validTrialDays(v) {
  const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v;
  return Number.isInteger(n) && n >= MIN_TRIAL_DAYS && n <= MAX_TRIAL_DAYS ? n : null;
}
/** The trial record of an account created now with `days` trial days. */
function newTrial(days, nowMs) {
  return { days, startedAtMs: nowMs, endsAtMs: nowMs + days * DAY_MS };
}
const isTrial = account => Boolean(account) && account.trial !== undefined && account.trial !== null;
/** Whether the account is a trial whose period is over (or whose trial record cannot be read: fail closed). */
function trialEnded(account, nowMs) {
  if (!isTrial(account)) return false;
  const t = account.trial;
  if (typeof t !== "object" || !Number.isFinite(Number(t.endsAtMs))) return true;
  return !(Number(t.endsAtMs) > nowMs);
}
/** Whether a RUNNING trial ends within the warning window (its last TRIAL_WARNING_DAYS days). An ended trial is not "soon". */
function trialEndingSoon(account, nowMs) {
  if (!isTrial(account) || trialEnded(account, nowMs)) return false;
  return Number(account.trial.endsAtMs) - nowMs <= TRIAL_WARNING_DAYS * DAY_MS;
}
/**
 * What the TEACHER is told about their own trial (display only; the server enforces the end on every request): the end date and
 * whether it is near, or null for a permanent account. Read from the stored account, never from the token or the client.
 */
function teacherTrialView(account, nowMs) {
  if (!isTrial(account) || trialEnded(account, nowMs)) return null;
  return { endsAt: new Date(Number(account.trial.endsAtMs)).toISOString(), endingSoon: trialEndingSoon(account, nowMs) };
}
/** The trial after `days` more days: counted from its end, or from now when it has already ended. */
function extendedTrial(trial, days, nowMs) {
  const end = trial && typeof trial === "object" && Number.isFinite(Number(trial.endsAtMs)) ? Number(trial.endsAtMs) : nowMs;
  const from = Math.max(end, nowMs);
  return { days: (Number(trial && trial.days) || 0) + days, startedAtMs: Number(trial && trial.startedAtMs) || nowMs, endsAtMs: from + days * DAY_MS };
}

const teacherAccountName = id => {
  if (!isTeacherAccountId(id)) throw new Error("Invalid teacher account id.");
  return TEACHER_PREFIX + id + ".json";
};
const sha256Hex = t => crypto.createHash("sha256").update(String(t), "utf8").digest("hex");
const invitationName = token => INVITATION_PREFIX + sha256Hex(token) + ".json";
const newTeacherAccountId = () => "t_" + crypto.randomBytes(8).toString("hex");

async function readTeacherAccount(container, id, opts = {}) {
  if (!isTeacherAccountId(id)) return null;
  const doc = await (opts.downloadJsonOrNull || downloadJsonOrNull)(container, teacherAccountName(id));
  return doc && doc.role === "teacher" && doc.accountId === id ? doc : null;
}

/** `opts.downloadJsonOrNull` lets a caller with an injected storage reader (platform-login's test seam) use it here too. */
async function findTeacherByUsername(container, username, opts = {}) {
  const u = validUsername(username);
  if (!u) return null;
  const reservation = await (opts.downloadJsonOrNull || downloadJsonOrNull)(container, usernameReservationName(u));
  if (!reservation || reservation.role !== "teacher") return null;
  const account = await readTeacherAccount(container, reservation.accountId, opts);
  return account && account.username === u ? account : null;
}

async function listTeacherAccounts(container) {
  const docs = await listJson(container, TEACHER_PREFIX);
  return docs.filter(d => d && d.role === "teacher" && isTeacherAccountId(d.accountId));
}

function mutateTeacherAccount(container, id, mutate) {
  return mutateJsonWithRetry(container, teacherAccountName(id), current => {
    if (!current || current.role !== "teacher" || current.accountId !== id) { const e = new Error("Teacher account not found."); e.code = "TEACHER_NOT_FOUND"; throw e; }
    return mutate(current);
  });
}

/** A fresh invitation: the token (shown ONCE to the owner) and what is stored (its hash). */
function newInvitation(purpose, nowMs) {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, record: { tokenHash: sha256Hex(token), purpose, expiresAtMs: nowMs + INVITATION_TTL_MS, issuedAtMs: nowMs } };
}

async function writeInvitationPointer(container, token, accountId) {
  await createOnly(container, invitationName(token), { schemaVersion: 1, accountId });
}

/**
 * token → { account, invitation } when the link is the account's CURRENT, unexpired invitation; otherwise null.
 * The comparison is on the stored hash, in constant time.
 */
async function resolveInvitation(container, token, nowMs) {
  const text = String(token || "").trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(text)) return null;
  const pointer = await downloadJsonOrNull(container, invitationName(text));
  if (!pointer || !isTeacherAccountId(pointer.accountId)) return null;
  const account = await readTeacherAccount(container, pointer.accountId);
  const inv = account && account.invitation;
  if (!inv || !(Number(inv.expiresAtMs) > nowMs) || account.status === "suspended" || trialEnded(account, nowMs)) return null;
  const a = Buffer.from(String(inv.tokenHash || ""), "hex"), b = Buffer.from(sha256Hex(text), "hex");
  if (a.length !== 32 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { account, invitation: inv };
}

async function deleteInvitationPointer(container, token) {
  await deleteBlob(container, invitationName(token));
}

/** Usernames the owner may give a teacher: valid, not reserved by anyone, and not an existing BUILDER_USERS id (P2-B moves those). */
async function usernameAvailable(container, username, env = process.env) {
  const u = validUsername(username);
  if (!u) return { ok: false, code: "USERNAME_INVALID" };
  const cfg = parseBuilderUsers(env);
  if (cfg.kind === "configured" && Object.keys(cfg.users || {}).some(id => String(id).toLowerCase() === u)) return { ok: false, code: "USERNAME_TAKEN" };
  if (await downloadJsonOrNull(container, usernameReservationName(u))) return { ok: false, code: "USERNAME_TAKEN" };
  return { ok: true, username: u };
}

/** Create-only reservation, then create-only account; the reservation is released if the account cannot be written. */
async function createTeacherAccount(container, account) {
  const reserved = await createOnly(container, usernameReservationName(account.username), { schemaVersion: 1, accountId: account.accountId, role: "teacher", username: account.username, createdAtMs: Date.now() });
  if (!reserved) return { ok: false, code: "USERNAME_TAKEN" };
  try {
    const created = await createOnly(container, teacherAccountName(account.accountId), account);
    if (!created) { await deleteBlob(container, usernameReservationName(account.username)); return { ok: false, code: "ACCOUNT_EXISTS" }; }
  } catch (e) {
    try { await deleteBlob(container, usernameReservationName(account.username)); } catch { /* best effort */ }
    throw e;
  }
  return { ok: true };
}

// Tadris+ P10-A — every issued managed session is RECORDED in the account (approved design docs/enterprise-teacher-sessions-p10a.md):
// `sessions: [{ sidHash, createdAtMs, expiresAtMs, via }]` — only a recorded, unexpired session is accepted (lib/teacher-session.js),
// so a token signed with the right secret but never issued is refused (security review O1). The id itself is never stored (its
// sha256, with a context prefix). Logout removes the entry, so a session never comes back (O6). At most 10: a new sign-in ends the
// oldest. The former `revokedSessions` list is no longer read; every write here drops it.
const sessionHash = sid => sha256Hex("tadris-teacher-session|" + String(sid));
const SESSION_VIA = new Set(["login", "owner-handoff"]);

/** The account's recorded sessions that are well formed and not expired at nowMs, oldest first. */
function liveSessions(account, nowMs) {
  const list = Array.isArray(account && account.sessions) ? account.sessions : [];
  return list
    .filter(s => s && typeof s.sidHash === "string" && /^[0-9a-f]{64}$/.test(s.sidHash) && Number.isFinite(Number(s.expiresAtMs)) && Number(s.expiresAtMs) > nowMs && Number.isFinite(Number(s.createdAtMs)))
    .sort((a, b) => Number(a.createdAtMs) - Number(b.createdAtMs));
}
/** Whether session `sid` was issued for this account and is still live. */
function sessionActive(account, sid, nowMs) {
  if (!sid) return false;
  const h = sessionHash(sid);
  return liveSessions(account, nowMs).some(s => s.sidHash === h);
}
/** The account with session `sid` recorded (expired ones dropped; beyond 10, the oldest ended), and without `revokedSessions`. */
function withTeacherSession(account, { sid, expiresAtMs, nowMs, via }) {
  if (!sid || !Number.isFinite(Number(expiresAtMs))) throw new Error("A recorded teacher session needs its id and its expiry.");
  const h = sessionHash(sid);
  const list = liveSessions(account, nowMs).filter(s => s.sidHash !== h);
  list.push({ sidHash: h, createdAtMs: nowMs, expiresAtMs: Number(expiresAtMs), via: SESSION_VIA.has(via) ? via : "login" });
  const { revokedSessions, ...rest } = account;   // eslint-disable-line no-unused-vars
  return { ...rest, sessions: list.slice(-MAX_TEACHER_SESSIONS) };
}
/** The account without session `sid` (expired ones dropped), and without `revokedSessions`. */
function withoutTeacherSession(account, sid, nowMs) {
  const h = sessionHash(sid);
  const { revokedSessions, ...rest } = account;   // eslint-disable-line no-unused-vars
  return { ...rest, sessions: liveSessions(account, nowMs).filter(s => s.sidHash !== h) };
}
/** The account with NO session (owner end-sessions, suspension, password reset), and without `revokedSessions`. */
function withNoTeacherSessions(account) {
  const { revokedSessions, ...rest } = account;   // eslint-disable-line no-unused-vars
  return { ...rest, sessions: [] };
}

/** What the owner sees about a teacher: never the credential, never an invitation hash. */
function ownerView(a, nowMs = Date.now()) {
  const inv = a.invitation && Number(a.invitation.expiresAtMs) > nowMs ? { purpose: a.invitation.purpose, expiresAt: new Date(Number(a.invitation.expiresAtMs)).toISOString() } : null;
  return {
    accountId: a.accountId, username: a.username, displayName: a.displayName, fullName: a.fullName || "", email: a.email || "", phone: a.phone || "",
    subjects: Array.isArray(a.subjects) ? a.subjects : [], notes: a.adminNotes || "", organizationId: a.organizationId || "default",
    status: a.status, hasPassword: Boolean(a.credential), invitation: inv, origin: a.origin === "shared-password-workspace" ? a.origin : "console",
    // P4-B1 — when and why the owner suspended the account (the owner's own record; empty unless suspended).
    suspendedAt: a.status === "suspended" ? String(a.suspendedAt || "") : "", suspendedReason: a.status === "suspended" ? String(a.suspendedReason || "") : "",
    // Trial accounts — null for a permanent account; `ended` is decided here, on the server clock.
    trial: isTrial(a) ? { days: Number(a.trial && a.trial.days) || 0, endsAt: Number.isFinite(Number(a.trial && a.trial.endsAtMs)) ? new Date(Number(a.trial.endsAtMs)).toISOString() : "", ended: trialEnded(a, nowMs), endingSoon: trialEndingSoon(a, nowMs) } : null,
    // P3-A — the access the owner assigned (display copy written with the revision pointer), or null = the default for the account.
    access: a.accessRevisionId && a.accessPreset && typeof a.accessPreset === "object" ? { revisionId: a.accessRevisionId, preset: { id: String(a.accessPreset.id), version: Number(a.accessPreset.version) }, grants: Number(a.accessGrants) || 0, denies: Number(a.accessDenies) || 0 } : null,
    // P4-C — the school the owner linked the teacher to (null = none).
    schoolId: typeof a.schoolId === "string" && /^sch_[a-f0-9]{16}$/.test(a.schoolId) ? a.schoolId : null,
    createdAt: a.createdAt || "", updatedAt: a.updatedAt || "", lastLoginAt: a.lastLoginAt || ""
  };
}

module.exports = {
  TEACHER_PREFIX, INVITATION_PREFIX, INVITATION_TTL_MS, MAX_TEACHER_SESSIONS, DAY_MS, MIN_TRIAL_DAYS, MAX_TRIAL_DAYS,
  TRIAL_ENDED_MESSAGE, TRIAL_WARNING_DAYS, validTrialDays, newTrial, isTrial, trialEnded, trialEndingSoon, teacherTrialView, extendedTrial,
  teacherAccountName, invitationName, newTeacherAccountId, readTeacherAccount, findTeacherByUsername, listTeacherAccounts,
  mutateTeacherAccount, newInvitation, writeInvitationPointer, resolveInvitation, deleteInvitationPointer, usernameAvailable,
  createTeacherAccount, sessionActive, liveSessions, withTeacherSession, withoutTeacherSession, withNoTeacherSessions, ownerView, sha256Hex
};
