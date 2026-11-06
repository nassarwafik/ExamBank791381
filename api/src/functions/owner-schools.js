const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordOwnerAuditEventStrict, recordOwnerChange, recordOwnerChangeAtWrite } = require("../lib/audit-log");   // Tadris+ P10-L
const { requireOwnerSession, stepUpDenial, NO_STORE } = require("../lib/identity/owner-session");
const { isTeacherAccountId } = require("../lib/identity/teacher-token");
const { readTeacherAccount, listTeacherAccounts, mutateTeacherAccount } = require("../lib/identity/teacher-accounts");
const { ProfileImageError, normalizeLogoImage } = require("../lib/profile-image");
const { publishProfilePhoto, removeProfilePhoto, photoResponse, photoRecord } = require("../lib/profile-photo-store");
const {
  isSchoolId, schoolDocName, logoPrefix, normalizeSchoolName, readSchool, listSchools, createSchool, mutateSchool, publicSchool
} = require("../lib/schools");

// Tadris+ P4-C — the owner manages school identities. Route: /api/owner-schools/{action?}   (owner session only)
//
//   GET                         → { schools: [{ schoolId, name, logo, teachers }] }   (teachers = how many accounts link to it)
//   GET logo?schoolId=          → that school's logo (image/webp) for the owner's own preview
//   POST create      { name }                        → 201 { school }
//   POST rename      { schoolId, name }
//   POST logo        { schoolId, dataUrl }           → the SAME safe image pipeline as profile photos (≤ 3 MB, the real bytes
//                                                      must be JPEG / PNG / WebP — never SVG —, decoded, metadata stripped,
//                                                      re-encoded to WebP), fitted inside 512 × 512 (never cropped)
//   POST remove-logo { schoolId }
//   POST link        { accountId, schoolId | null }  → the teacher's school (null = none). The school must exist.
//
// Every POST needs a recent second-factor check (step-up) and is written to the owner audit log. A school is presentation only:
// it grants nothing and changes no data; what teachers and students see changes on their next sign-in / page load.

const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const bad = (code, error) => reply(400, { ok: false, code, error });
const NAME_INVALID = () => bad("SCHOOL_NAME_INVALID", "اسم المدرسة مطلوب (حتى 120 حرفًا).");
const NOT_FOUND = () => reply(404, { ok: false, code: "SCHOOL_NOT_FOUND", error: "المدرسة غير موجودة." });
const TEACHER_NOT_FOUND = () => reply(404, { ok: false, code: "TEACHER_NOT_FOUND", error: "حساب المعلم غير موجود." });

function queryParam(request, name) {
  try { if (request.query && typeof request.query.get === "function") return request.query.get(name) || ""; } catch { /* fall through */ }
  try { return new URL(String(request.url || ""), "http://localhost").searchParams.get(name) || ""; } catch { return ""; }
}

async function handler(request, deps = {}, obs = null) {
  const nowMs = deps.now ? deps.now() : Date.now();
  const iso = new Date(nowMs).toISOString();
  const write = deps.recordOwnerAuditEvent || recordOwnerAuditEventStrict;   // Tadris+ P10-L: every change is recorded BEFORE it happens
  const method = String(request.method || "GET").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();

  const auth = await requireOwnerSession(request, deps);
  if (!auth.ok) return auth.response;
  const { owner, session, container } = auth;
  const actor = "owner:" + owner.accountId;

  try {
    if (method === "GET" && !action) {
      const [schools, teachers] = await Promise.all([listSchools(container), listTeacherAccounts(container)]);
      const counts = new Map();
      for (const t of teachers) if (isSchoolId(t.schoolId)) counts.set(t.schoolId, (counts.get(t.schoolId) || 0) + 1);
      const out = schools.map(s => ({ ...publicSchool(s), teachers: counts.get(s.schoolId) || 0 })).sort((a, b) => a.name.localeCompare(b.name, "ar"));
      return reply(200, { ok: true, schools: out });
    }
    if (method === "GET" && action === "logo") {
      const schoolId = queryParam(request, "schoolId");
      if (!isSchoolId(schoolId)) return bad("SCHOOL_ID_INVALID", "معرّف المدرسة غير صالح.");
      const school = await readSchool(container, schoolId);
      if (!school) return NOT_FOUND();
      const r = await photoResponse(container, photoRecord(school), logoPrefix(schoolId), deps, obs);
      if (r.status !== 200) return reply(404, { ok: false, code: "NO_SCHOOL_LOGO", error: "لا يوجد شعار." });
      return { ...r, headers: { ...r.headers, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin" } };
    }
    if (method !== "POST") return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const denial = stepUpDenial(session, nowMs);
    if (denial) return denial;
    let body = {};
    try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }

    if (action === "create") {
      const name = normalizeSchoolName(body.name);
      if (!name) return NAME_INVALID();
      // the school's id is chosen by createSchool: the record names it at the school's (first) write
      return await recordOwnerChangeAtWrite(container, ({ json }) => ({ actor, action: "owner.school.created", targetType: "school", targetId: String(json && json.schoolId || ""), targetLabel: name }), async guarded => {
        const school = await createSchool(guarded, { name, createdBy: actor, nowMs });
        if (!school) return reply(409, { ok: false, code: "SCHOOL_EXISTS", error: "تعذر إنشاء المدرسة. حاول مرة أخرى." });
        return reply(201, { ok: true, school: { ...publicSchool(school), teachers: 0 } });
      }, { write });
    }

    if (action === "link") {
      const accountId = String(body.accountId || "");
      if (!isTeacherAccountId(accountId)) return bad("ACCOUNT_ID_INVALID", "معرّف الحساب غير صالح.");
      const wanted = body.schoolId === null || body.schoolId === "" ? null : String(body.schoolId || "");
      if (wanted !== null && !isSchoolId(wanted)) return bad("SCHOOL_ID_INVALID", "معرّف المدرسة غير صالح.");
      const account = await readTeacherAccount(container, accountId);
      if (!account) return TEACHER_NOT_FOUND();
      if (wanted !== null && !(await readSchool(container, wanted))) return NOT_FOUND();
      const previous = isSchoolId(account.schoolId) ? account.schoolId : null;
      return await recordOwnerChange(container, { actor, action: "owner.school.linked", targetType: "teacher-account", targetId: accountId, targetLabel: account.username, details: { from: previous, to: wanted } }, async () => {
        await mutateTeacherAccount(container, accountId, a => ({ ...a, schoolId: wanted, updatedAt: iso }));
        return reply(200, { ok: true, accountId, schoolId: wanted });
      }, { write });
    }

    const schoolId = String(body.schoolId || "");
    if (!isSchoolId(schoolId)) return bad("SCHOOL_ID_INVALID", "معرّف المدرسة غير صالح.");
    const school = await readSchool(container, schoolId);
    if (!school) return NOT_FOUND();

    if (action === "rename") {
      const name = normalizeSchoolName(body.name);
      if (!name) return NAME_INVALID();
      return await recordOwnerChange(container, { actor, action: "owner.school.renamed", targetType: "school", targetId: schoolId, targetLabel: name, details: { from: String(school.name || ""), to: name } }, async () => {
        const doc = await mutateSchool(container, schoolId, s => ({ ...s, name, updatedAt: iso }));
        return reply(200, { ok: true, school: publicSchool(doc) });
      }, { write });
    }

    if (action === "logo") {
      // recorded at the first write: an image refused while it is decoded and normalised writes, and records, nothing
      const prevPhoto = photoRecord(school), seq = Number(school.profilePhotoSeq);
      const version = Math.max(Number.isFinite(seq) && seq > 0 ? seq : 0, prevPhoto ? prevPhoto.version : 0) + 1;
      return await recordOwnerChangeAtWrite(container, { actor, action: "owner.school.logo-updated", targetType: "school", targetId: schoolId, targetLabel: String(school.name || ""), details: { version } }, async guarded => {
      let published;
      try {
        published = await publishProfilePhoto(guarded, {
          ownerPrefix: logoPrefix(schoolId), docName: schoolDocName(schoolId), dataUrl: body.dataUrl, now: iso,
          prepareDoc: current => {
            if (!current || current.schoolId !== schoolId) { const e = new Error("SCHOOL_NOT_FOUND"); e.code = "SCHOOL_NOT_FOUND"; throw e; }
            return { ...current, updatedAt: iso };
          }
        }, { ...deps, normalizeProfileImage: deps.normalizeLogoImage || normalizeLogoImage }, obs);
      } catch (e) {
        if (e instanceof ProfileImageError) return reply(e.httpStatus || 400, { ok: false, code: "LOGO_" + e.code, error: e.message });
        throw e;
      }
      return reply(200, { ok: true, school: publicSchool(published.doc) });
      }, { write });
    }

    if (action === "remove-logo") {
      return await recordOwnerChangeAtWrite(container, { actor, action: "owner.school.logo-removed", targetType: "school", targetId: schoolId, targetLabel: String(school.name || "") }, async guarded => {
      const r = await removeProfilePhoto(guarded, {
        ownerPrefix: logoPrefix(schoolId), docName: schoolDocName(schoolId),
        prepareDoc: current => {
          if (!current || current.schoolId !== schoolId) { const e = new Error("SCHOOL_NOT_FOUND"); e.code = "SCHOOL_NOT_FOUND"; throw e; }
          return { ...current, updatedAt: iso };
        }
      }, deps, obs);
      return reply(200, { ok: true, school: publicSchool(r.doc) });
      }, { write });
    }

    return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
  } catch (e) {
    if (e?.code === "SCHOOL_NOT_FOUND") return NOT_FOUND();
    if (e?.code === "TEACHER_NOT_FOUND") return TEACHER_NOT_FOUND();
    obs?.logError("owner.schools.error", e, { action });
    return reply(503, { ok: false, code: "OWNER_SCHOOLS_UNAVAILABLE", error: "تعذر تنفيذ الطلب حاليًا. حاول مرة أخرى." }, { "Retry-After": "5" });
  }
}

app.http("ownerSchools", { methods: ["GET", "POST"], authLevel: "anonymous", route: "owner-schools/{action?}", handler: withObservability("owner-schools", handler) });
module.exports = { handler };
