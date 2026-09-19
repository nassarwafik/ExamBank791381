// Teacher SELF profile — builder-authenticated, always the token subject (never a body-supplied teacher id):
//   GET  /api/teacher-profile                → { ok, profile }
//   POST /api/teacher-profile { action: "setAvatar" | "uploadPhoto" | "removePhoto" | "setDisplayName", ... }
//   GET  /api/teacher-profile-photo?v=<n>    → the teacher's OWN photo (image/webp)
// A student token and anonymous callers are denied (403 / 401). The photo uses the SAME safe image pipeline and the
// SAME publication authority (profile-photo-store: immutable revision → CAS metadata commit → cleanup) as the
// teacher-managed student photo — no weaker path; the profile document keeps metadata only (blobKey stays internal).
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { requireStudentAuth } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
const { ProfileImageError } = require("../lib/profile-image");
const { photoRecord, publishProfilePhoto, removeProfilePhoto, photoResponse } = require("../lib/profile-photo-store");
const { VALID_AVATARS, MAX_NAME_LENGTH, teacherKey, profileDocName, teacherPhotoPrefix, normalizeDisplayName, publicTeacherProfile } = require("../lib/teacher-profile");

const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const STUDENT_DENIED = { status: 403, jsonBody: { ok: false, error: "هذه الخدمة للمعلم فقط." } };

function resolveTeacher(request, deps) {
  const builder = (deps.requireBuilderAuth || requireBuilderAuth)(request);
  if (builder.ok && teacherKey(builder.user && builder.user.sub)) return { kind: "teacher", sub: String(builder.user.sub) };
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
    const actor = resolveTeacher(request, deps);
    if (actor.kind === "student") return STUDENT_DENIED;
    if (actor.kind !== "teacher") return { status: 401, jsonBody: { ok: false, error: "Unauthorized" } };
    const container = deps.container || (deps.getContainer || getContainer)();
    const sub = actor.sub;
    const url = new URL(request.url);
    const isPhotoRoute = /\/teacher-profile-photo\/?$/.test(url.pathname);

    if (request.method === "GET") {
      const doc = await dl(container, profileDocName(sub));
      if (isPhotoRoute) return photoResponse(container, photoRecord(doc), teacherPhotoPrefix(sub), deps, obs);   // the committed record selects the blob; `?v=` is cache context only
      return { status: 200, jsonBody: { ok: true, profile: publicTeacherProfile(sub, doc) } };
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
