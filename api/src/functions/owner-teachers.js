const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordOwnerAuditEvent } = require("../lib/audit-log");
const { requireOwnerSession, stepUpDenial, NO_STORE } = require("../lib/identity/owner-session");
const { ACCOUNT_ID_RE } = require("../lib/identity/teacher-token");
const {
  newTeacherAccountId, readTeacherAccount, listTeacherAccounts, mutateTeacherAccount, newInvitation, writeInvitationPointer,
  usernameAvailable, createTeacherAccount, ownerView
} = require("../lib/identity/teacher-accounts");

// Tadris+ P2-A2 — the platform owner manages teacher accounts. Route: /api/owner-teachers/{action?}   (owner session only)
//
//   GET                                   → every managed teacher (owner view: never a credential or an invitation hash)
//   POST create        { username, displayName, fullName?, email?, phone?, subjects?, notes? }   → invitation link (shown once)
//   POST reinvite      { accountId }      → a new invitation link; the previous one stops working
//   POST reset         { accountId }      → the password is removed, every session ends, a reset link is issued
//   POST suspend       { accountId }      → no access from the next request (status + authVersion + 1)
//   POST reactivate    { accountId }
//   POST end-sessions  { accountId }      → every session of that teacher ends (authVersion + 1)
//   POST update        { accountId, displayName?, fullName?, email?, phone?, subjects?, notes? }
//
// Every POST needs a recent second-factor check (step-up, 10 minutes). Every change is written to the owner audit log.
// The invitation token is returned ONCE as `invitationPath` ("#/invite/<token>"): it lives in the URL fragment, which browsers
// never send to a server, and only its SHA-256 is stored.

const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const bad = (code, error) => reply(400, { ok: false, code, error });
const notFound = () => reply(404, { ok: false, code: "TEACHER_NOT_FOUND", error: "حساب المعلم غير موجود." });
const unavailable = () => reply(503, { ok: false, code: "OWNER_TEACHERS_UNAVAILABLE", error: "تعذر تنفيذ الطلب حاليًا. حاول مرة أخرى." }, { "Retry-After": "5" });

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
      return reply(200, { ok: true, teachers: list });
    }
    if (method !== "POST") return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const denial = stepUpDenial(session, nowMs);
    if (denial) return denial;
    let body = {};
    try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }

    if (action === "create") {
      const name = await usernameAvailable(container, body.username, env);
      if (!name.ok) return name.code === "USERNAME_TAKEN"
        ? reply(409, { ok: false, code: "USERNAME_TAKEN", error: "اسم المستخدم مستخدم. اختر اسمًا آخر." })
        : bad("USERNAME_INVALID", "اسم المستخدم: 3–64 حرفًا إنجليزيًا صغيرًا أو أرقامًا أو . _ - ، ولا يكون أرقامًا فقط.");
      const fields = profileFields({ displayName: "", ...body });
      const problem = validProfile(fields);
      if (problem) return bad(problem, problem === "EMAIL_INVALID" ? "البريد الإلكتروني غير صالح." : "اسم العرض مطلوب (60 حرفًا على الأكثر).");
      const accountId = newTeacherAccountId();
      const inv = newInvitation("invite", nowMs);
      const account = {
        schemaVersion: 1, accountId, role: "teacher", organizationId: "default", username: name.username,
        displayName: fields.displayName, fullName: fields.fullName || "", email: fields.email || "", phone: fields.phone || "",
        subjects: fields.subjects || [], adminNotes: fields.adminNotes || "",
        status: "invited", credential: null, invitation: inv.record, authVersion: 1, revokedSessions: [],
        createdAt: iso, createdBy: actor, updatedAt: iso
      };
      const created = await createTeacherAccount(container, account);
      if (!created.ok) return reply(409, { ok: false, code: "USERNAME_TAKEN", error: "اسم المستخدم مستخدم. اختر اسمًا آخر." });
      await writeInvitationPointer(container, inv.token, accountId);
      await audit(container, { actor, action: "owner.teacher.created", targetType: "teacher-account", targetId: accountId, targetLabel: account.username });
      return reply(201, { ok: true, teacher: ownerView(account, nowMs), invitation: invitationOut(inv.token, inv.record) });
    }

    const accountId = String(body.accountId || "");
    if (!ACCOUNT_ID_RE.test(accountId)) return bad("ACCOUNT_ID_INVALID", "معرّف الحساب غير صالح.");
    const current = await readTeacherAccount(container, accountId);
    if (!current) return notFound();

    if (action === "reinvite" || action === "reset") {
      if (action === "reinvite" && current.credential) return reply(409, { ok: false, code: "ALREADY_ACTIVE", error: "المعلم وضع كلمة مروره. استخدم «إعادة تعيين كلمة المرور»." });
      if (current.status === "suspended") return reply(409, { ok: false, code: "SUSPENDED", error: "الحساب موقوف. أعد تفعيله أولًا." });
      const inv = newInvitation(action === "reset" ? "reset" : "invite", nowMs);
      const next = await mutateTeacherAccount(container, accountId, a => ({
        ...a, invitation: inv.record, updatedAt: iso,
        ...(action === "reset" ? { credential: null, authVersion: Number(a.authVersion) + 1 } : {})
      }));
      await writeInvitationPointer(container, inv.token, accountId);
      await audit(container, { actor, action: action === "reset" ? "owner.teacher.password-reset" : "owner.teacher.reinvited", targetType: "teacher-account", targetId: accountId, targetLabel: current.username });
      return reply(200, { ok: true, teacher: ownerView(next, nowMs), invitation: invitationOut(inv.token, inv.record) });
    }

    if (action === "suspend" || action === "reactivate" || action === "end-sessions" || action === "update") {
      let fields = null;
      if (action === "update") {
        fields = profileFields(body);
        const problem = validProfile(fields);
        if (problem) return bad(problem, problem === "EMAIL_INVALID" ? "البريد الإلكتروني غير صالح." : "اسم العرض مطلوب (60 حرفًا على الأكثر).");
      }
      const next = await mutateTeacherAccount(container, accountId, a => {
        if (action === "suspend") return { ...a, status: "suspended", authVersion: Number(a.authVersion) + 1, suspendedAt: iso, updatedAt: iso };
        if (action === "reactivate") return { ...a, status: a.credential ? "active" : "invited", suspendedAt: null, updatedAt: iso };
        if (action === "end-sessions") return { ...a, authVersion: Number(a.authVersion) + 1, revokedSessions: [], updatedAt: iso };
        return { ...a, ...fields, updatedAt: iso };
      });
      await audit(container, { actor, action: "owner.teacher." + action, targetType: "teacher-account", targetId: accountId, targetLabel: current.username });
      return reply(200, { ok: true, teacher: ownerView(next, nowMs) });
    }

    return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
  } catch (e) {
    if (e?.code === "TEACHER_NOT_FOUND") return notFound();
    obs?.logError("owner.teachers.error", e, { action });
    return unavailable();
  }
}

app.http("ownerTeachers", { methods: ["GET", "POST"], authLevel: "anonymous", route: "owner-teachers/{action?}", handler: withObservability("owner-teachers", handler) });
module.exports = { handler };
