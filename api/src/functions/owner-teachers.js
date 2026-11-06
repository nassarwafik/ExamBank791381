const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordOwnerAuditEvent } = require("../lib/audit-log");
const { requireOwnerSession, stepUpDenial, NO_STORE } = require("../lib/identity/owner-session");
const { isTeacherAccountId, LEGACY_TEACHER_ACCOUNT_ID } = require("../lib/identity/teacher-token");
const {
  newTeacherAccountId, readTeacherAccount, listTeacherAccounts, mutateTeacherAccount, newInvitation, writeInvitationPointer,
  usernameAvailable, createTeacherAccount, ownerView, validTrialDays, newTrial, isTrial, extendedTrial, MIN_TRIAL_DAYS, MAX_TRIAL_DAYS,
  withNoTeacherSessions   // Tadris+ P10-A
} = require("../lib/identity/teacher-accounts");
const { createOnly } = require("../lib/identity/owner-store");
const { builderAuthConfigurationStatus } = require("../lib/builder-auth");
const { legacyDataOwner } = require("../lib/teacher-tenancy");
const { downloadJsonOrNull } = require("../lib/platform-storage");
const { profileDocName, normalizeDisplayName, VALID_AVATARS } = require("../lib/teacher-profile");
const { AccessError, buildRevision, writeRevision } = require("../lib/access/revisions");
const { reservedAdditions } = require("../lib/access/capabilities");   // Tadris+ P10-K
const { readAccessMode } = require("../lib/access/access-mode");
const { ACCESS_REFUSAL } = require("../lib/access/messages");

// Tadris+ P2-A2 — the platform owner manages teacher accounts. Route: /api/owner-teachers/{action?}   (owner session only)
//
//   GET                                   → every managed teacher (owner view: never a credential or an invitation hash)
//   POST create        { username, displayName, fullName?, email?, phone?, subjects?, notes?, presetId?, presetVersion?, trialDays? }
//                      → invitation link (shown once). P3-B2: with a preset, the teacher starts with that access (an immutable
//                      revision, written BEFORE the account so the account never exists without it); while enforcement is on (or
//                      its mode cannot be read) a preset is REQUIRED, so no new teacher lands with no access at all.
//                      P4-B2: `grants?` / `denies?` (with a preset only) and `accessReason?` — the wizard's «copy from a teacher»
//                      sends the source's current preset / grants / denies; they are validated exactly like an assignment
//                      (refused with their code, never corrected). P5-A: `courses?` (with a preset) — the course entitlement.
//                      Trial accounts: `trialDays` (a whole number 1–90) makes it a TRIAL account that ends that many days after
//                      its creation; from then on it is refused like a suspended one (lib/identity/teacher-accounts.js).
//   POST extend-trial  { accountId, days } → the trial ends `days` (1–90) later, counted from its end (or from now if it ended)
//   POST end-trial     { accountId }      → the trial account becomes a permanent account (no end date)
//   POST reinvite      { accountId }      → a new invitation link; the previous one stops working
//   POST reset         { accountId }      → the password is removed, every session ends, a reset link is issued
//   POST suspend       { accountId, reason? } → no access from the next request (status + authVersion + 1). P4-B1: an optional
//                      reason (≤ 200 characters) for the owner's own record — shown only in the Owner Console, never to the teacher.
//   POST reactivate    { accountId }      → the reason is cleared
//   POST end-sessions  { accountId }      → every session of that teacher ends (authVersion + 1)
//   POST update        { accountId, displayName?, fullName?, email?, phone?, subjects?, notes? }
//   POST import-legacy { username, displayName, fullName?, email?, phone?, subjects?, notes? }   (P2-B, owner decisions D6 / D7)
//        → the account of the shared-password workspace, ONCE: fixed id t_legacy, an invitation link like any new teacher. It sees
//          the pre-tenancy (unowned) data exactly as the shared-password sign-in did; no data document is read, moved or changed.
//          Only in the shared-password mode (BUILDER_USERS absent) and only while LEGACY_DATA_OWNER is not set (that setting would
//          already name another owner for that data). The GET answer says whether it is available (`legacyImport`).
//
// Every POST needs a recent second-factor check (step-up, 10 minutes). Every change is written to the owner audit log.
// The invitation token is returned ONCE as `invitationPath` ("#/invite/<token>"): it lives in the URL fragment, which browsers
// never send to a server, and only its SHA-256 is stored.

const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const bad = (code, error) => reply(400, { ok: false, code, error });
const notFound = () => reply(404, { ok: false, code: "TEACHER_NOT_FOUND", error: "حساب المعلم غير موجود." });
const unavailable = () => reply(503, { ok: false, code: "OWNER_TEACHERS_UNAVAILABLE", error: "تعذر تنفيذ الطلب حاليًا. حاول مرة أخرى." }, { "Retry-After": "5" });

const MAX_SUSPEND_REASON = 200;
const TRIAL_DAYS_ERROR = `مدة التجربة: عدد صحيح من الأيام بين ${MIN_TRIAL_DAYS} و${MAX_TRIAL_DAYS}.`;
const text = (v, max) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
function profileFields(body) {
  const out = {};
  if (body.displayName !== undefined) out.displayName = text(body.displayName, 60);
  if (body.fullName !== undefined) out.fullName = text(body.fullName, 120);
  if (body.email !== undefined) out.email = text(body.email, 160);
  if (body.phone !== undefined) out.phone = text(body.phone, 40);
  if (body.notes !== undefined) out.adminNotes = String(body.notes ?? "").trim().slice(0, 1000);
  if (body.subjects !== undefined) out.subjects = (Array.isArray(body.subjects) ? body.subjects : []).map(x => text(x, 60)).filter(Boolean).slice(0, 20);
  return out;
}
function validProfile(fields) {
  if (fields.displayName !== undefined && !fields.displayName) return "DISPLAY_NAME_INVALID";
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) return "EMAIL_INVALID";
  return null;
}
/** Whether the owner may import the shared-password workspace now, and if not why (a code, never a setting's value). */
async function legacyImportState(container, env) {
  let mode = "configuration-error";
  try { mode = builderAuthConfigurationStatus(env).mode; } catch { mode = "configuration-error"; }
  if (mode !== "legacy") return { available: false, reason: "NOT_SHARED_PASSWORD_MODE" };
  if (legacyDataOwner(env)) return { available: false, reason: "LEGACY_DATA_OWNER_SET" };
  if (await readTeacherAccount(container, LEGACY_TEACHER_ACCOUNT_ID)) return { available: false, reason: "ALREADY_IMPORTED", accountId: LEGACY_TEACHER_ACCOUNT_ID };
  return { available: true };
}
const LEGACY_REFUSAL = {
  NOT_SHARED_PASSWORD_MODE: "هذا الاستيراد لمساحة الدخول بكلمة المرور المشتركة فقط، والمنصة لا تعمل بهذا الوضع.",
  LEGACY_DATA_OWNER_SET: "البيانات القديمة مُسندة لمعلم آخر بإعداد على الخادم (LEGACY_DATA_OWNER). أزل هذا الإعداد أولًا أو تواصل مع المسؤول التقني.",
  ALREADY_IMPORTED: "المساحة القديمة استُوردت من قبل. لا يمكن استيرادها لحساب ثانٍ."
};

/** The shared-password workspace's own profile (name / preset avatar), copied once when it is a known subject. Best effort. */
async function copyLegacyProfile(container, env, iso) {
  const code = String(env.BUILDER_USER_CODE || "").trim();
  if (!code) return false;
  const doc = await downloadJsonOrNull(container, profileDocName(code));
  if (!doc || typeof doc !== "object") return false;
  const out = { schemaVersion: 1, teacherId: LEGACY_TEACHER_ACCOUNT_ID, createdAt: iso, updatedAt: iso };
  const name = normalizeDisplayName(doc.displayName);
  if (name) out.displayName = name;
  if (VALID_AVATARS.has(String(doc.avatarId || ""))) out.avatarId = String(doc.avatarId);
  if (!out.displayName && !out.avatarId) return false;
  return createOnly(container, profileDocName(LEGACY_TEACHER_ACCOUNT_ID), out);
}

const invitationOut = (token, record) => ({ invitationPath: "#/invite/" + token, purpose: record.purpose, expiresAt: new Date(record.expiresAtMs).toISOString() });

async function handler(request, deps = {}, obs = null) {
  const nowMs = deps.now ? deps.now() : Date.now();
  const env = deps.env || process.env;
  const audit = deps.recordOwnerAuditEvent || recordOwnerAuditEvent;
  const method = String(request.method || "GET").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();

  const auth = await requireOwnerSession(request, deps);
  if (!auth.ok) return auth.response;
  const { owner, session, container } = auth;
  const actor = "owner:" + owner.accountId;
  const iso = new Date(nowMs).toISOString();

  try {
    if (method === "GET" && !action) {
      const list = (await listTeacherAccounts(container)).map(a => ownerView(a, nowMs)).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "ar"));
      return reply(200, { ok: true, teachers: list, legacyImport: await legacyImportState(container, env) });
    }
    if (method !== "POST") return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const denial = stepUpDenial(session, nowMs);
    if (denial) return denial;
    let body = {};
    try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }

    if (action === "create" || action === "import-legacy") {
      const importing = action === "import-legacy";
      if (importing) {
        const state = await legacyImportState(container, env);
        if (!state.available) return reply(409, { ok: false, code: "LEGACY_IMPORT_" + state.reason, error: LEGACY_REFUSAL[state.reason] });
      }
      const name = await usernameAvailable(container, body.username, env);
      if (!name.ok) return name.code === "USERNAME_TAKEN"
        ? reply(409, { ok: false, code: "USERNAME_TAKEN", error: "اسم المستخدم مستخدم. اختر اسمًا آخر." })
        : bad("USERNAME_INVALID", "اسم المستخدم: 3–64 حرفًا إنجليزيًا صغيرًا أو أرقامًا أو . _ - ، ولا يكون أرقامًا فقط.");
      const fields = profileFields({ displayName: "", ...body });
      const problem = validProfile(fields);
      if (problem) return bad(problem, problem === "EMAIL_INVALID" ? "البريد الإلكتروني غير صالح." : "اسم العرض مطلوب (60 حرفًا على الأكثر).");
      let trialDays = null;
      if (!importing && body.trialDays !== undefined && body.trialDays !== null && body.trialDays !== "") {
        trialDays = validTrialDays(body.trialDays);
        if (!trialDays) return bad("TRIAL_DAYS_INVALID", TRIAL_DAYS_ERROR);
      }
      const accountId = importing ? LEGACY_TEACHER_ACCOUNT_ID : newTeacherAccountId();
      let initialAccess = null;
      if (!importing) {
        const wantsPreset = body.presetId !== undefined && body.presetId !== null && body.presetId !== "";
        const hasLists = (Array.isArray(body.grants) && body.grants.length > 0) || (Array.isArray(body.denies) && body.denies.length > 0) || Array.isArray(body.courses) || Array.isArray(body.widgets) || Array.isArray(body.games) || (body.appearance !== undefined && body.appearance !== null);
        if (!wantsPreset && hasLists) return bad("ACCESS_PRESET_MISSING", ACCESS_REFUSAL.ACCESS_PRESET_MISSING);
        if (!wantsPreset) {
          let mode = "enforce";                                   // unreadable → treated as enforce (fail safe)
          try { mode = (await readAccessMode(container)).mode; } catch { mode = "enforce"; }
          if (mode === "enforce") return bad("PRESET_REQUIRED", ACCESS_REFUSAL.PRESET_REQUIRED);
        } else {
          try {
            const note = text(body.accessReason, 200);
            const built = buildRevision({
              accountId, parentRevisionId: null, presetId: body.presetId, presetVersion: body.presetVersion,
              grants: body.grants === undefined ? [] : body.grants, denies: body.denies === undefined ? [] : body.denies,
              resources: {   // P5-A courses, P7-A2 widgets (absent / null = all)
                ...(body.courses === undefined || body.courses === null ? {} : { courses: body.courses }),
                ...(body.widgets === undefined || body.widgets === null ? {} : { widgets: body.widgets }),
                ...(body.games === undefined || body.games === null ? {} : { games: body.games }),   // P7-B2
                ...(body.appearance === undefined || body.appearance === null ? {} : { appearance: body.appearance })   // P8-A2
              },
              reason: "initial access at creation" + (note ? " — " + note : ""), createdBy: actor, nowMs
            });
            // Tadris+ P10-K (O11) — a new teacher holds no revision yet, so every reserved grant or deny is a new one.
            const added = reservedAdditions(built.revision, {}, built.capabilities);
            if (added.length) return reply(400, { ok: false, code: "CAPABILITY_RESERVED", error: ACCESS_REFUSAL.CAPABILITY_RESERVED, details: { capabilities: added } });
            initialAccess = built.revision;
          } catch (e) {
            if (e instanceof AccessError) return bad(e.code, ACCESS_REFUSAL[e.code] || ACCESS_REFUSAL.REVISION_MALFORMED);
            throw e;
          }
        }
      }
      const inv = newInvitation("invite", nowMs);
      const account = {
        schemaVersion: 1, accountId, role: "teacher", organizationId: "default", username: name.username,
        displayName: fields.displayName, fullName: fields.fullName || "", email: fields.email || "", phone: fields.phone || "",
        subjects: fields.subjects || [], adminNotes: fields.adminNotes || "",
        status: "invited", credential: null, invitation: inv.record, authVersion: 1, sessions: [],
        ...(importing ? { origin: "shared-password-workspace", importedAt: iso } : {}),
        ...(trialDays ? { trial: newTrial(trialDays, nowMs) } : {}),
        ...(initialAccess ? { accessRevisionId: initialAccess.revisionId, accessPreset: { ...initialAccess.preset }, accessGrants: initialAccess.grants.length, accessDenies: initialAccess.denies.length } : {}),
        createdAt: iso, createdBy: actor, updatedAt: iso
      };
      if (initialAccess) await writeRevision(container, initialAccess);   // an orphan if the account below is refused (harmless)
      const created = await createTeacherAccount(container, account);
      if (!created.ok) {
        // Create-only: a second (even concurrent) import finds the account already there and is refused.
        if (importing && created.code === "ACCOUNT_EXISTS") return reply(409, { ok: false, code: "LEGACY_IMPORT_ALREADY_IMPORTED", error: LEGACY_REFUSAL.ALREADY_IMPORTED });
        return reply(409, { ok: false, code: "USERNAME_TAKEN", error: "اسم المستخدم مستخدم. اختر اسمًا آخر." });
      }
      await writeInvitationPointer(container, inv.token, accountId);
      let profileCopied = false;
      if (importing) { try { profileCopied = await copyLegacyProfile(container, env, iso); } catch (e) { obs?.logWarn("owner.teachers.legacy_profile_copy_failed", { reason: String(e?.code || "error") }); } }
      await audit(container, {
        actor, action: importing ? "owner.teacher.legacy-imported" : "owner.teacher.created", targetType: "teacher-account", targetId: accountId, targetLabel: account.username,
        ...(importing ? { details: { profileCopied } } : (initialAccess || trialDays) ? { details: {
          ...(initialAccess ? { revisionId: initialAccess.revisionId, preset: initialAccess.preset, ...(initialAccess.grants.length || initialAccess.denies.length ? { grants: initialAccess.grants, denies: initialAccess.denies } : {}) } : {}),
          ...(trialDays ? { trialDays, trialEndsAt: new Date(account.trial.endsAtMs).toISOString() } : {})
        } } : {})
      });
      return reply(201, { ok: true, teacher: ownerView(account, nowMs), invitation: invitationOut(inv.token, inv.record) });
    }

    const accountId = String(body.accountId || "");
    if (!isTeacherAccountId(accountId)) return bad("ACCOUNT_ID_INVALID", "معرّف الحساب غير صالح.");
    const current = await readTeacherAccount(container, accountId);
    if (!current) return notFound();

    if (action === "reinvite" || action === "reset") {
      if (action === "reinvite" && current.credential) return reply(409, { ok: false, code: "ALREADY_ACTIVE", error: "المعلم وضع كلمة مروره. استخدم «إعادة تعيين كلمة المرور»." });
      if (current.status === "suspended") return reply(409, { ok: false, code: "SUSPENDED", error: "الحساب موقوف. أعد تفعيله أولًا." });
      const inv = newInvitation(action === "reset" ? "reset" : "invite", nowMs);
      const next = await mutateTeacherAccount(container, accountId, a => ({
        ...(action === "reset" ? withNoTeacherSessions(a) : a), invitation: inv.record, updatedAt: iso,
        ...(action === "reset" ? { credential: null, authVersion: Number(a.authVersion) + 1 } : {})
      }));
      await writeInvitationPointer(container, inv.token, accountId);
      await audit(container, { actor, action: action === "reset" ? "owner.teacher.password-reset" : "owner.teacher.reinvited", targetType: "teacher-account", targetId: accountId, targetLabel: current.username });
      return reply(200, { ok: true, teacher: ownerView(next, nowMs), invitation: invitationOut(inv.token, inv.record) });
    }

    if (action === "extend-trial" || action === "end-trial") {
      if (!isTrial(current)) return reply(409, { ok: false, code: "NOT_A_TRIAL", error: "هذا الحساب دائم وليس حسابًا تجريبيًا." });
      let days = null;
      if (action === "extend-trial") { days = validTrialDays(body.days); if (!days) return bad("TRIAL_DAYS_INVALID", TRIAL_DAYS_ERROR); }
      const next = await mutateTeacherAccount(container, accountId, a => {
        if (!isTrial(a)) { const e = new Error("not a trial"); e.code = "NOT_A_TRIAL"; throw e; }
        return action === "end-trial"
          ? { ...a, trial: null, trialConvertedAt: iso, updatedAt: iso }
          : { ...a, trial: extendedTrial(a.trial, days, nowMs), updatedAt: iso };
      });
      await audit(container, {
        actor, action: action === "end-trial" ? "owner.teacher.trial-converted" : "owner.teacher.trial-extended", targetType: "teacher-account", targetId: accountId, targetLabel: current.username,
        ...(days ? { details: { days, trialEndsAt: new Date(next.trial.endsAtMs).toISOString() } } : {})
      });
      return reply(200, { ok: true, teacher: ownerView(next, nowMs) });
    }

    if (action === "suspend" || action === "reactivate" || action === "end-sessions" || action === "update") {
      let fields = null;
      if (action === "update") {
        fields = profileFields(body);
        const problem = validProfile(fields);
        if (problem) return bad(problem, problem === "EMAIL_INVALID" ? "البريد الإلكتروني غير صالح." : "اسم العرض مطلوب (60 حرفًا على الأكثر).");
      }
      const reason = action === "suspend" ? text(body.reason, MAX_SUSPEND_REASON) : "";
      const next = await mutateTeacherAccount(container, accountId, a => {
        if (action === "suspend") return { ...withNoTeacherSessions(a), status: "suspended", authVersion: Number(a.authVersion) + 1, suspendedAt: iso, suspendedReason: reason, updatedAt: iso };
        if (action === "reactivate") return { ...a, status: a.credential ? "active" : "invited", suspendedAt: null, suspendedReason: null, updatedAt: iso };
        if (action === "end-sessions") return { ...withNoTeacherSessions(a), authVersion: Number(a.authVersion) + 1, updatedAt: iso };
        return { ...a, ...fields, updatedAt: iso };
      });
      await audit(container, { actor, action: "owner.teacher." + action, targetType: "teacher-account", targetId: accountId, targetLabel: current.username, ...(reason ? { details: { reason } } : {}) });
      return reply(200, { ok: true, teacher: ownerView(next, nowMs) });
    }

    return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
  } catch (e) {
    if (e?.code === "TEACHER_NOT_FOUND") return notFound();
    if (e?.code === "NOT_A_TRIAL") return reply(409, { ok: false, code: "NOT_A_TRIAL", error: "هذا الحساب دائم وليس حسابًا تجريبيًا." });
    obs?.logError("owner.teachers.error", e, { action });
    return unavailable();
  }
}

app.http("ownerTeachers", { methods: ["GET", "POST"], authLevel: "anonymous", route: "owner-teachers/{action?}", handler: withObservability("owner-teachers", handler) });
module.exports = { handler };
