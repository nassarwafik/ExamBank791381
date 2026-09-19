// Student profile PHOTO — the real personal photo, managed by the TEACHER only (students choose preset avatars
// through /api/student-profile and can never upload, replace or delete a photo). One safe image pipeline
// (profile-image.js: bound → sniff → decode → resize → re-encode WebP, metadata stripped), a dedicated blob
// namespace of IMMUTABLE revisions (never Base64 inside the user document, never a public URL, never overwritten in
// place) and metadata bookkeeping on the user document via the ONE publication authority (profile-photo-store.js):
// the active photo is exactly the blob the committed metadata references. avatarId is never touched (fallback).
//
//   GET  /api/student-profile-photo?studentId=<id>[&v=<version>] → image/webp
//        teacher (builder token): any existing student
//        student: HARDENED session only (requireActiveStudentSession: token → current persisted document →
//        active / not archived / sv === authVersion) and OWN photo only (naming another id → 403). `v` is cache
//        context only — the server metadata selects the blob.
//   POST /api/student-profile-photo  { action: "upload", studentId, dataUrl }  |  { action: "remove", studentId }
//        builder token only. An ACTIVE student session is refused with 403 (explicit product message); a revoked /
//        inactive / archived student token is 401 like everywhere else in the portal; anonymous 401. Audited.
//   Lifecycle policy: the same as «تعديل تفاصيل الطالب» — the teacher may edit an archived student's identity
//   (only account activation is blocked for archived students), so photo upload / remove follow that same policy.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull, StorageConflictError } = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
const { ProfileImageError, MESSAGES } = require("../lib/profile-image");
const { photoMeta, photoRecord, publishProfilePhoto, removeProfilePhoto, photoResponse } = require("../lib/profile-photo-store");

const USER_PREFIX = "platform/users/";
const PHOTO_PREFIX = "platform/student-profile-images/";
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const VALID_ID = /^[A-Za-z0-9_-]{1,80}$/;
/** The owner's photo namespace (every revision of this student's photo lives under it). */
const studentPhotoPrefix = studentId => PHOTO_PREFIX + String(studentId) + "/";
const userDocName = studentId => USER_PREFIX + String(studentId) + ".json";

/**
 * Teacher (builder) or a HARDENED student session — never both, never a body-supplied identity. A student actor
 * carries the loaded current document + container from the session helper (no duplicate read).
 */
async function resolveActor(request, deps) {
  const builder = (deps.requireBuilderAuth || requireBuilderAuth)(request);
  if (builder.ok) return { kind: "teacher", user: builder.user };
  const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
  if (sess.ok) return { kind: "student", user: sess.user, student: sess.student, container: sess.container };
  return { kind: "denied", response: sess.response || { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } };
}

/** The user-document guard shared by publish / remove: the student must still exist at commit time. */
const requireStudentDoc = now => current => {
  if (!current || current.role !== "student") { const err = new Error("الطالب غير موجود."); err.httpStatus = 404; throw err; }
  current.updatedAt = now;
  return current;                                                          // avatarId and everything else untouched
};

async function handler(request, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const rec = deps.recordAuditEvent || recordAuditEvent;
  try {
    const actor = await resolveActor(request, deps);
    if (actor.kind === "denied") return actor.response;
    const container = actor.container || deps.container || (deps.getContainer || getContainer)();

    if (request.method === "GET") {
      const url = new URL(request.url);
      const requested = String(url.searchParams.get("studentId") || "").trim();
      if (actor.kind === "student") {
        // OWN photo only: naming another id is refused outright; the session's loaded document is the authority.
        const own = String(actor.user.sub);
        if (requested && requested !== own) return { status: 403, jsonBody: { ok: false, error: "غير مسموح." } };
        return photoResponse(container, photoRecord(actor.student), studentPhotoPrefix(own), deps, obs);
      }
      if (!VALID_ID.test(requested)) return { status: 400, jsonBody: { ok: false, error: "studentId مطلوب." } };
      const user = await dl(container, userDocName(requested));
      const record = user && user.role === "student" ? photoRecord(user) : null;
      return photoResponse(container, record, studentPhotoPrefix(requested), deps, obs);
    }

    // ---- POST: teacher only (an active student session gets the explicit product refusal) ----
    if (actor.kind !== "teacher") return { status: 403, jsonBody: { ok: false, error: "الصورة الشخصية للطالب يحددها المعلم فقط." } };
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const action = String(body?.action || "").trim();
    const studentId = String(body?.studentId || "").trim();
    if (!VALID_ID.test(studentId)) return { status: 400, jsonBody: { ok: false, error: "studentId مطلوب." } };
    const user = await dl(container, userDocName(studentId));
    if (!user || user.role !== "student") return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
    const now = new Date().toISOString();
    const label = String(user.displayName || user.code || "");

    if (action === "upload") {
      let published;
      try {
        published = await publishProfilePhoto(container, { ownerPrefix: studentPhotoPrefix(studentId), docName: userDocName(studentId), dataUrl: body?.dataUrl, now, prepareDoc: requireStudentDoc(now) }, deps, obs);
      } catch (e) {
        if (e instanceof ProfileImageError) return { status: e.httpStatus || 400, jsonBody: { ok: false, error: e.message, code: e.code } };
        if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };   // previous photo untouched
        if (e?.httpStatus) return { status: e.httpStatus, jsonBody: { ok: false, error: e.message } };
        throw e;
      }
      const { meta, normalized } = published;
      await rec(container, { actor: actor.user?.sub, action: "student.photo.upload", targetType: "student", targetId: studentId, targetLabel: label, details: { version: meta.version, bytes: normalized.buffer.length, width: normalized.width, height: normalized.height, source: normalized.sourceKind, previousCleaned: published.cleanedPrevious } });
      obs?.logInfo("student.photo.uploaded", { version: meta.version });
      return { status: 200, jsonBody: { ok: true, profilePhoto: meta } };
    }

    if (action === "remove") {
      let removed;
      try {
        removed = await removeProfilePhoto(container, { ownerPrefix: studentPhotoPrefix(studentId), docName: userDocName(studentId), prepareDoc: requireStudentDoc(now) }, deps, obs);
      } catch (e) {
        if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };   // old metadata + photo remain usable
        if (e?.httpStatus) return { status: e.httpStatus, jsonBody: { ok: false, error: e.message } };
        throw e;
      }
      await rec(container, { actor: actor.user?.sub, action: "student.photo.remove", targetType: "student", targetId: studentId, targetLabel: label, details: { previousCleaned: removed.cleanedPrevious } });
      return { status: 200, jsonBody: { ok: true, profilePhoto: null } };
    }

    return { status: 400, jsonBody: { ok: false, error: "إجراء غير مدعوم." } };
  } catch (e) {
    obs?.logError("student.photo.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر معالجة الصورة حاليًا." } };
  }
}

app.http("studentProfilePhoto", { methods: ["GET", "POST"], authLevel: "anonymous", route: "student-profile-photo", handler: withObservability("student-profile-photo", handler) });
module.exports = { handler, studentPhotoPrefix, photoMeta, MESSAGES };
