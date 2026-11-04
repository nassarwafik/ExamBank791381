// Teacher SELF profile — builder-authenticated, always the token subject (never a body-supplied teacher id):
//   GET  /api/teacher-profile                → { ok, profile }
//   POST /api/teacher-profile { action: "setAvatar" | "uploadPhoto" | "removePhoto" | "setDisplayName" | "setDashboardLayout" | "setAppearance", ... }
//   Tadris+ P8-A1 — GET also answers `appearance` { theme, palette, density } and `appearanceChoosable`; «setAppearance» stores the
//   registered values only, each part needing its capability (appearance.theme / palette / density.choose). Presentation only.
//   Tadris+ P7-A2 — GET also answers `dashboardLayout` (the teacher's arrangement of the «اليوم» cards, or null) and
//   `layoutChoosable`; «setDashboardLayout» { order, hidden } needs appearance.layout.choose (evaluated like every capability:
//   a managed session while the owner enforces access). Presentation only — it never changes what the server serves.
//   GET  /api/teacher-profile-photo?v=<n>    → the teacher's OWN photo (image/webp)
// A student token and anonymous callers are denied (403 / 401). The photo uses the SAME safe image pipeline and the
// SAME publication authority (profile-photo-store: immutable revision → CAS metadata commit → cleanup) as the
// teacher-managed student photo — no weaker path; the profile document keeps metadata only (blobKey stays internal).
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireStudentAuth } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
const { ProfileImageError } = require("../lib/profile-image");
const { photoRecord, publishProfilePhoto, removeProfilePhoto, photoResponse } = require("../lib/profile-photo-store");
const { VALID_AVATARS, MAX_NAME_LENGTH, teacherKey, profileDocName, teacherPhotoPrefix, normalizeDisplayName, publicTeacherProfile, validateDashboardLayout, dashboardLayoutOf, APPEARANCE, validateAppearance, appearanceOf } = require("../lib/teacher-profile");
const { sessionGrants } = require("../lib/access/session-grants");   // Tadris+ P7-A2
const LAYOUT_CAPABILITY = "appearance.layout.choose";

const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const STUDENT_DENIED = { status: 403, jsonBody: { ok: false, error: "هذه الخدمة للمعلم فقط." } };

async function resolveTeacher(request, deps) {
  const builder = (await requireTeacherSession(request, deps));
  if (builder.ok && teacherKey(builder.user && builder.user.sub)) return { kind: "teacher", sub: String(builder.user.sub), user: builder.user };
  const student = (deps.requireStudentAuth || requireStudentAuth)(request);
  if (student.ok) return { kind: "student" };
  return { kind: "denied" };
}

/** The profile document to commit (created on first write) — shared by every mutation, including the photo store. */
const prepareProfileDoc = (sub, now) => current => {
  const doc = current && typeof current === "object" ? current : { schemaVersion: 1, teacherId: sub, createdAt: now };
  doc.updatedAt = now;
  return doc;
};

async function mutateProfile(container, sub, deps, mutate) {
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const now = new Date().toISOString();
  const prepare = prepareProfileDoc(sub, now);
  return mut(container, profileDocName(sub), current => { const doc = prepare(current); mutate(doc); return doc; });
}

async function handler(request, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const rec = deps.recordAuditEvent || recordAuditEvent;
  try {
    const actor = await resolveTeacher(request, deps);
    if (actor.kind === "student") return STUDENT_DENIED;
    if (actor.kind !== "teacher") return { status: 401, jsonBody: { ok: false, error: "Unauthorized" } };
    const container = deps.container || (deps.getContainer || getContainer)();
    const sub = actor.sub;
    const url = new URL(request.url);
    const isPhotoRoute = /\/teacher-profile-photo\/?$/.test(url.pathname);

    if (request.method === "GET") {
      const doc = await dl(container, profileDocName(sub));
      if (isPhotoRoute) return photoResponse(container, photoRecord(doc), teacherPhotoPrefix(sub), deps, obs);   // the committed record selects the blob; `?v=` is cache context only
      // P7-A2: whether the arrangement can be changed; an unresolvable access answers «not choosable» (the profile itself still loads).
      const grants = await sessionGrants(actor.user, { ...deps, container }, obs);
      // P8-A1: the teacher's appearance and which of its parts they may change (presentation only — never read by a security check).
      const appearanceChoosable = Object.fromEntries(Object.entries(APPEARANCE).map(([k, spec]) => [k, grants.ok && grants.has(spec.capability)]));
      return { status: 200, jsonBody: { ok: true, profile: publicTeacherProfile(sub, doc), dashboardLayout: dashboardLayoutOf(doc), layoutChoosable: grants.ok && grants.has(LAYOUT_CAPABILITY), appearance: appearanceOf(doc), appearanceChoosable } };
    }
    if (isPhotoRoute) return { status: 405, jsonBody: { ok: false, error: "Method not allowed." } };

    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const action = String(body?.action || "").trim();
    // `targetTeacherId` / `teacherId` in the body are IGNORED by design — self-service only.
    try {
      if (action === "setAvatar") {
        const avatarId = String(body?.avatarId || "").trim();
        if (!VALID_AVATARS.has(avatarId)) return { status: 400, jsonBody: { ok: false, error: "الأيقونة غير صالحة." } };
        const updated = await mutateProfile(container, sub, deps, doc => { doc.avatarId = avatarId; });
        await rec(container, { actor: sub, action: "teacher.profile.setAvatar", targetType: "teacher", targetId: sub, details: { avatarId } });
        return { status: 200, jsonBody: { ok: true, profile: publicTeacherProfile(sub, updated) } };
      }
      if (action === "setDisplayName") {
        const name = normalizeDisplayName(body?.displayName);
        if (!name) return { status: 400, jsonBody: { ok: false, error: "الاسم مطلوب (حتى " + MAX_NAME_LENGTH + " حرفًا)." } };
        const updated = await mutateProfile(container, sub, deps, doc => { doc.displayName = name; });
        await rec(container, { actor: sub, action: "teacher.profile.setDisplayName", targetType: "teacher", targetId: sub });
        return { status: 200, jsonBody: { ok: true, profile: publicTeacherProfile(sub, updated) } };
      }
      if (action === "setDashboardLayout") {   // Tadris+ P7-A2
        const grants = await sessionGrants(actor.user, { ...deps, container }, obs);
        if (!grants.ok) return grants.response;
        if (!grants.has(LAYOUT_CAPABILITY)) return { status: 403, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: false, code: "CAPABILITY_DENIED", error: "ترتيب اللوحة غير مفعّل لحسابك.", capability: LAYOUT_CAPABILITY } };
        const v = validateDashboardLayout(body?.layout);
        if (!v.ok) return { status: 400, jsonBody: { ok: false, code: "LAYOUT_INVALID", error: v.error } };
        const updated = await mutateProfile(container, sub, deps, doc => { doc.appearance = { ...(doc.appearance && typeof doc.appearance === "object" ? doc.appearance : {}), dashboardLayout: v.layout }; });
        await rec(container, { actor: sub, action: "teacher.profile.setDashboardLayout", targetType: "teacher", targetId: sub, details: { order: v.layout.order.length, hidden: v.layout.hidden.length } });
        return { status: 200, jsonBody: { ok: true, profile: publicTeacherProfile(sub, updated), dashboardLayout: dashboardLayoutOf(updated) } };
      }
      if (action === "setAppearance") {   // Tadris+ P8-A1 — { appearance: { theme?, palette?, density? } }; «default» = the field removed
        const v = validateAppearance(body?.appearance);
        if (!v.ok) return { status: 400, jsonBody: { ok: false, code: "APPEARANCE_INVALID", error: v.error } };
        const grants = await sessionGrants(actor.user, { ...deps, container }, obs);
        if (!grants.ok) return grants.response;
        const refused = Object.keys(v.changes).find(k => !grants.has(APPEARANCE[k].capability));
        if (refused) return { status: 403, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: false, code: "CAPABILITY_DENIED", error: "هذا الخيار من المظهر غير مفعّل لحسابك.", capability: APPEARANCE[refused].capability } };
        const updated = await mutateProfile(container, sub, deps, doc => {
          const next = { ...(doc.appearance && typeof doc.appearance === "object" ? doc.appearance : {}) };
          for (const [k, value] of Object.entries(v.changes)) { if (value === APPEARANCE[k].fallback) delete next[k]; else next[k] = value; }
          doc.appearance = next;
        });
        await rec(container, { actor: sub, action: "teacher.profile.setAppearance", targetType: "teacher", targetId: sub, details: { ...v.changes } });
        return { status: 200, jsonBody: { ok: true, profile: publicTeacherProfile(sub, updated), appearance: appearanceOf(updated) } };
      }
      if (action === "uploadPhoto") {
        // new immutable revision → CAS commit of the profile document → cleanup of the previous revision (store order).
        let published;
        try { published = await publishProfilePhoto(container, { ownerPrefix: teacherPhotoPrefix(sub), docName: profileDocName(sub), dataUrl: body?.dataUrl, prepareDoc: prepareProfileDoc(sub, new Date().toISOString()) }, deps, obs); }
        catch (e) { if (e instanceof ProfileImageError) return { status: e.httpStatus || 400, jsonBody: { ok: false, error: e.message, code: e.code } }; throw e; }   // conflicts → the 503 below; previous photo untouched
        const { doc: updated, meta, normalized } = published;
        await rec(container, { actor: sub, action: "teacher.profile.photo.upload", targetType: "teacher", targetId: sub, details: { version: meta.version, bytes: normalized.buffer.length, width: normalized.width, height: normalized.height, previousCleaned: published.cleanedPrevious } });
        return { status: 200, jsonBody: { ok: true, profile: publicTeacherProfile(sub, updated) } };
      }
      if (action === "removePhoto") {
        // CAS-clear the metadata first; the previously referenced revision is deleted only after that succeeds.
        const removed = await removeProfilePhoto(container, { ownerPrefix: teacherPhotoPrefix(sub), docName: profileDocName(sub), prepareDoc: prepareProfileDoc(sub, new Date().toISOString()) }, deps, obs);   // avatarId preserved
        await rec(container, { actor: sub, action: "teacher.profile.photo.remove", targetType: "teacher", targetId: sub, details: { previousCleaned: removed.cleanedPrevious } });
        return { status: 200, jsonBody: { ok: true, profile: publicTeacherProfile(sub, removed.doc) } };
      }
    } catch (e) {
      if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
      throw e;
    }
    return { status: 400, jsonBody: { ok: false, error: "إجراء غير مدعوم." } };
  } catch (e) {
    obs?.logError("teacher.profile.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر تحديث ملف المعلم حاليًا." } };
  }
}

app.http("teacherProfile", { methods: ["GET", "POST"], authLevel: "anonymous", route: "teacher-profile", handler: withObservability("teacher-profile", handler) });
app.http("teacherProfilePhoto", { methods: ["GET"], authLevel: "anonymous", route: "teacher-profile-photo", handler: withObservability("teacher-profile-photo", handler) });
module.exports = { handler };
