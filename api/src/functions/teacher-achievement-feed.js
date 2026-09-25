const { app } = require("@azure/functions");
const crypto = require("crypto");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, listJson, downloadJsonOrNull, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { FEED_PREFIX, REACTIONS, feedBlobName, publicPost } = require("../lib/achievement-feed");
const { isSafeId } = require("../lib/message-store");
const { isStudentClassMember } = require("../lib/class-membership");
const { recordEventSafely } = require("../lib/notification-events");

const CLASS_PREFIX = "platform/classes/";
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const MAX_POSTS = 50;
const MAX_NOTE_LENGTH = 200;

const newestFirst = (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""));

/**
 * The dashboard scope of a GET: none (every class), ?classId=<id> (that class), or ?classId=<id>&studentId=<id>
 * (that student inside that class — AND semantics on the posts' stored classId/studentId, never on display names).
 * Malformed ids → 400; a studentId without a classId → 400; an unknown class, or a student who is not currently a
 * member of that class → 404 (the same authority the dashboard's own student picker is built from).
 */
async function readScope(request, container) {
  let url;
  try { url = new URL(request.url); } catch { return { ok: true, classId: "", studentId: "" }; }
  const classId = String(url.searchParams.get("classId") || "").trim();
  const studentId = String(url.searchParams.get("studentId") || "").trim();
  const bad = error => ({ ok: false, response: { status: 400, jsonBody: { ok: false, error } } });
  const missing = error => ({ ok: false, response: { status: 404, jsonBody: { ok: false, error } } });
  if (!classId && !studentId) return { ok: true, classId: "", studentId: "" };
  if (!classId) return bad("studentId requires classId.");
  if (!isSafeId(classId)) return bad("Invalid classId.");
  if (studentId && !isSafeId(studentId)) return bad("Invalid studentId.");
  const classroom = await downloadJsonOrNull(container, CLASS_PREFIX + classId + ".json");
  if (!classroom) return missing("الصف غير موجود.");
  if (studentId) {
    const student = await downloadJsonOrNull(container, "platform/users/" + studentId + ".json");
    if (!isStudentClassMember(student, classId)) return missing("الطالب غير موجود في هذا الصف.");
  }
  return { ok: true, classId, studentId, classroom };
}

// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used); `obs` is the request context withObservability passes as the third argument.
// Neither changes runtime behavior.
async function handler(request, deps = {}, obs = null) {
    try {
      const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
      if (!auth.ok) return auth.response;
      const container = deps.container || (deps.getContainer || getContainer)();

      if (request.method === "GET") {
        const scope = await readScope(request, container);
        if (!scope.ok) return scope.response;
        // Scoped: only that class's feed folder is read, and posts are kept by their STORED classId (+ studentId) —
        // filtered BEFORE the newest-first slice, so a class's older posts are never crowded out by other classes.
        const [posts, classes] = scope.classId
          ? [
              (await listJson(container, FEED_PREFIX + scope.classId + "/"))
                .filter(post => String(post?.classId || "") === scope.classId && (!scope.studentId || String(post?.studentId || "") === scope.studentId)),
              [{ ...scope.classroom, classId: scope.classId }]
            ]
          : await Promise.all([listJson(container, FEED_PREFIX), listJson(container, CLASS_PREFIX)]);
        const classNameById = new Map(classes.map(c => [String(c.classId || ""), String(c.name || "")]));
        const sorted = posts
          .sort(newestFirst)
          .slice(0, MAX_POSTS)
          // The teacher sees every educational achievement event of managed students (shared or not).
          .map(post => ({
            ...publicPost(post),
            classId: String(post.classId || ""),
            className: classNameById.get(String(post.classId || "")) || ""
          }));
        return { status: 200, jsonBody: { ok: true, posts: sorted } };
      }

      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      const action = String(body?.action || "").trim();
      const classId = String(body?.classId || "").trim();
      const postId = String(body?.postId || "").trim();
      if (!classId || !postId) return { status: 400, jsonBody: { ok: false, error: "classId and postId are required." } };

      if (action === "react") {
        const reaction = String(body?.reaction || "").trim();
        if (!REACTIONS.includes(reaction)) return { status: 400, jsonBody: { ok: false, error: "ردّ الفعل غير صالح." } };
        let updated = null, previousReaction = null, committedAt = "";
        try {
          updated = await mutateJsonWithRetry(container, feedBlobName(classId, postId), current => {
            if (!current) { const err = new Error("المنشور غير موجود."); err.httpStatus = 404; throw err; }
            previousReaction = REACTIONS.includes(current.teacherReaction) ? current.teacherReaction : null;
            committedAt = new Date().toISOString();
            current.teacherReaction = current.teacherReaction === reaction ? null : reaction;
            return current;
          });
        } catch (e) {
          if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
          if (e?.httpStatus) return { status: e.httpStatus, jsonBody: { ok: false, error: e.message } };
          throw e;
        }
        // Phase 6D — the post OWNER (from the stored post, never the request) is notified when a reaction is ADDED or
        // CHANGED; removing it (→ null) notifies nothing; classmates are never notified.
        const owner = String(updated.studentId || "");
        if (updated.teacherReaction && updated.teacherReaction !== previousReaction && isSafeId(owner)) {
          await recordEventSafely(container, { scope: "student", studentId: owner, type: "teacher_reaction", dedupeKey: "reaction:" + postId + ":" + updated.teacherReaction + ":" + committedAt, data: { postId, reaction: updated.teacherReaction } }, deps, obs);
        }
        return { status: 200, jsonBody: { ok: true, teacherReaction: updated.teacherReaction || null } };
      }

      if (action === "setNote") {
        const note = String(body?.note || "").trim().slice(0, MAX_NOTE_LENGTH);
        let updated = null, previousNote = "", committedAt = "";
        try {
          updated = await mutateJsonWithRetry(container, feedBlobName(classId, postId), current => {
            if (!current) { const err = new Error("المنشور غير موجود."); err.httpStatus = 404; throw err; }
            previousNote = String(current.teacherNote || "").trim();
            committedAt = new Date().toISOString();
            current.teacherNote = note;
            return current;
          });
        } catch (e) {
          if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
          if (e?.httpStatus) return { status: e.httpStatus, jsonBody: { ok: false, error: e.message } };
          throw e;
        }
        // Phase 6D — a non-empty note that is NEW or CHANGED notifies the post owner; the same note again or a cleared
        // note notifies nothing.
        const owner = String(updated.studentId || "");
        if (note && note !== previousNote && isSafeId(owner)) {
          await recordEventSafely(container, { scope: "student", studentId: owner, type: "teacher_note", dedupeKey: "note:" + postId + ":" + crypto.createHash("sha256").update(note).digest("hex").slice(0, 16) + ":" + committedAt, data: { postId, notePreview: note } }, deps, obs);
        }
        return { status: 200, jsonBody: { ok: true, teacherNote: updated.teacherNote || "" } };
      }

      return { status: 400, jsonBody: { ok: false, error: "Unsupported feed action." } };
    } catch (e) {
      obs?.logError("teacher.feed.error", e);
      return { status: 500, jsonBody: { ok: false, error: "تعذر تنفيذ عملية الإشعارات حاليًا." } };
    }
}

app.http("teacherAchievementFeed", { methods: ["GET", "POST"], authLevel: "anonymous", route: "teacher-achievement-feed", handler: withObservability("teacher-achievement-feed", handler) });
module.exports = { handler };
