// Student profile PHOTO — the real personal photo, managed by the TEACHER only (students choose preset avatars
// through /api/student-profile and can never upload, replace or delete a photo). One safe image pipeline
// (profile-image.js: bound → sniff → decode → resize → re-encode WebP, metadata stripped), a dedicated blob
// namespace (never Base64 inside the user document, never a public URL) and metadata-only bookkeeping on the
// user document ({ version, updatedAt }; avatarId is never touched, so it remains the fallback).
//
//   GET  /api/student-profile-photo?studentId=<id>[&v=<version>] → image/webp
//        teacher (builder token): any existing student · student session: OWN photo only (403 otherwise)
//   POST /api/student-profile-photo  { action: "upload", studentId, dataUrl }  |  { action: "remove", studentId }
//        builder token only (a student token is explicitly refused with 403; anonymous 401); audited.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { requireStudentAuth } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
const { ProfileImageError, MESSAGES } = require("../lib/profile-image");
const { photoMeta, storeProfilePhoto, removeProfilePhoto, photoResponse } = require("../lib/profile-photo-store");

const USER_PREFIX = "platform/users/";
const PHOTO_PREFIX = "platform/student-profile-images/";
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const studentPhotoBlobName = studentId => PHOTO_PREFIX + String(studentId) + "/current.webp";
const VALID_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** Teacher (builder) or an active student session — never both, never a body-supplied identity. */
function resolveActor(request, deps) {
  const builder = (deps.requireBuilderAuth || requireBuilderAuth)(request);
  if (builder.ok) return { kind: "teacher", user: builder.user };
  const student = (deps.requireStudentAuth || requireStudentAuth)(request);
  if (student.ok) return { kind: "student", user: student.user };
  return { kind: "denied", response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } };
}

async function handler(request, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const rec = deps.recordAuditEvent || recordAuditEvent;
  try {
    const actor = resolveActor(request, deps);
    if (actor.kind === "denied") return actor.response;
    const container = deps.container || (deps.getContainer || getContainer)();

    if (request.method === "GET") {
      const url = new URL(request.url);
      const requested = String(url.searchParams.get("studentId") || "").trim();
      const studentId = actor.kind === "student" ? String(actor.user.sub) : requested;
      // A student may only ever fetch their OWN photo; naming another id is refused outright.
      if (actor.kind === "student" && requested && requested !== studentId) return { status: 403, jsonBody: { ok: false, error: "غير مسموح." } };
      if (!VALID_ID.test(studentId)) return { status: 400, jsonBody: { ok: false, error: "studentId مطلوب." } };
      const user = await dl(container, USER_PREFIX + studentId + ".json");
      const meta = user && user.role === "student" ? photoMeta(user) : null;
      return photoResponse(container, studentPhotoBlobName(studentId), meta, deps);
    }

    // ---- POST: teacher only ----
    if (actor.kind !== "teacher") return { status: 403, jsonBody: { ok: false, error: "الصورة الشخصية للطالب يحددها المعلم فقط." } };
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const action = String(body?.action || "").trim();
    const studentId = String(body?.studentId || "").trim();
    if (!VALID_ID.test(studentId)) return { status: 400, jsonBody: { ok: false, error: "studentId مطلوب." } };
    const user = await dl(container, USER_PREFIX + studentId + ".json");
    if (!user || user.role !== "student") return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
    const now = new Date().toISOString();

    if (action === "upload") {
      let normalized;
      try {
        normalized = await storeProfilePhoto(container, studentPhotoBlobName(studentId), body?.dataUrl, deps);
      } catch (e) {
        if (e instanceof ProfileImageError) return { status: e.httpStatus || 400, jsonBody: { ok: false, error: e.message, code: e.code } };
        throw e;
      }
      let meta = null;
      try {
        const updated = await (deps.mutateJsonWithRetry || mutateJsonWithRetry)(container, USER_PREFIX + studentId + ".json", current => {
          if (!current) { const err = new Error("الطالب غير موجود."); err.httpStatus = 404; throw err; }
          const prev = photoMeta(current);
          current.profilePhoto = { version: (prev ? prev.version : 0) + 1, updatedAt: now };   // avatarId untouched (fallback)
          current.updatedAt = now;
          return current;
        });
        meta = photoMeta(updated);
      } catch (e) {
        if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        if (e?.httpStatus) return { status: e.httpStatus, jsonBody: { ok: false, error: e.message } };
        throw e;
      }
      await rec(container, { actor: actor.user?.sub, action: "student.photo.upload", targetType: "student", targetId: studentId, targetLabel: String(user.displayName || user.code || ""), details: { version: meta.version, bytes: normalized.buffer.length, width: normalized.width, height: normalized.height, source: normalized.sourceKind } });
      obs?.logInfo("student.photo.uploaded", { version: meta.version });
      return { status: 200, jsonBody: { ok: true, profilePhoto: meta } };
    }

    if (action === "remove") {
      await removeProfilePhoto(container, studentPhotoBlobName(studentId), deps);
      try {
        await (deps.mutateJsonWithRetry || mutateJsonWithRetry)(container, USER_PREFIX + studentId + ".json", current => {
          if (!current) { const err = new Error("الطالب غير موجود."); err.httpStatus = 404; throw err; }
          current.profilePhoto = null;                                                            // avatarId preserved
          current.updatedAt = now;
          return current;
        });
      } catch (e) {
        if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        if (e?.httpStatus) return { status: e.httpStatus, jsonBody: { ok: false, error: e.message } };
        throw e;
      }
      await rec(container, { actor: actor.user?.sub, action: "student.photo.remove", targetType: "student", targetId: studentId, targetLabel: String(user.displayName || user.code || "") });
      return { status: 200, jsonBody: { ok: true, profilePhoto: null } };
    }

    return { status: 400, jsonBody: { ok: false, error: "إجراء غير مدعوم." } };
  } catch (e) {
    obs?.logError("student.photo.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر معالجة الصورة حاليًا." } };
  }
}

app.http("studentProfilePhoto", { methods: ["GET", "POST"], authLevel: "anonymous", route: "student-profile-photo", handler: withObservability("student-profile-photo", handler) });
module.exports = { handler, studentPhotoBlobName, photoMeta, MESSAGES };
