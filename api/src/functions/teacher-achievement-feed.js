const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, listJson, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { FEED_PREFIX, REACTIONS, feedBlobName, publicPost } = require("../lib/achievement-feed");

const CLASS_PREFIX = "platform/classes/";
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const MAX_POSTS = 50;
const MAX_NOTE_LENGTH = 200;

// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used); `obs` is the request context withObservability passes as the third argument.
// Neither changes runtime behavior.
async function handler(request, deps = {}, obs = null) {
    try {
      const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
      if (!auth.ok) return auth.response;
      const container = deps.container || (deps.getContainer || getContainer)();

      if (request.method === "GET") {
        const [posts, classes] = await Promise.all([
          listJson(container, FEED_PREFIX),
          listJson(container, CLASS_PREFIX)
        ]);
        const classNameById = new Map(classes.map(c => [String(c.classId || ""), String(c.name || "")]));
        const sorted = posts
          .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
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
        let updated = null;
        try {
          updated = await mutateJsonWithRetry(container, feedBlobName(classId, postId), current => {
            if (!current) { const err = new Error("المنشور غير موجود."); err.httpStatus = 404; throw err; }
            current.teacherReaction = current.teacherReaction === reaction ? null : reaction;
            return current;
          });
        } catch (e) {
          if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
          if (e?.httpStatus) return { status: e.httpStatus, jsonBody: { ok: false, error: e.message } };
          throw e;
        }
        return { status: 200, jsonBody: { ok: true, teacherReaction: updated.teacherReaction || null } };
      }

      if (action === "setNote") {
        const note = String(body?.note || "").trim().slice(0, MAX_NOTE_LENGTH);
        let updated = null;
        try {
          updated = await mutateJsonWithRetry(container, feedBlobName(classId, postId), current => {
            if (!current) { const err = new Error("المنشور غير موجود."); err.httpStatus = 404; throw err; }
            current.teacherNote = note;
            return current;
          });
        } catch (e) {
          if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
          if (e?.httpStatus) return { status: e.httpStatus, jsonBody: { ok: false, error: e.message } };
          throw e;
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
