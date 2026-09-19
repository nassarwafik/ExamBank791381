const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { listJson, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { FEED_PREFIX, REACTIONS, feedBlobName, publicPost, isVisibleToStudent, reactionCounts } = require("../lib/achievement-feed");

const UP = "platform/users/";
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const MAX_POSTS = 30;

function myReaction(reactions, studentId) {
  for (const key of REACTIONS) {
    if (Array.isArray(reactions?.[key]) && reactions[key].includes(studentId)) return key;
  }
  return null;
}

// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used); `obs` is the request context withObservability passes as the third argument.
// Neither changes runtime behavior.
async function handler(request, deps = {}, obs = null) {
    try {
      // Hardened session (§7): active/archived/authVersion validated; loaded student reused (no extra read).
      const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
      if (!sess.ok) return sess.response;
      const container = sess.container;
      const student = sess.student;
      const classId = String(student.classId || "");

      if (request.method === "GET") {
        if (!classId) return { status: 200, jsonBody: { ok: true, posts: [] } };
        // Privacy: a classmate's event is listed only when shared with the class; the student's own events always.
        const posts = (await listJson(container, FEED_PREFIX + classId + "/"))
          .filter(post => isVisibleToStudent(post, student.userId))
          .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
          .slice(0, MAX_POSTS)
          .map(post => ({
            ...publicPost(post),
            isOwnPost: String(post.studentId || "") === String(student.userId),
            myReaction: myReaction(post.reactions, String(student.userId))
          }));
        return { status: 200, jsonBody: { ok: true, posts } };
      }

      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      const action = String(body?.action || "").trim();
      if (action !== "react") return { status: 400, jsonBody: { ok: false, error: "Unsupported feed action." } };

      const postId = String(body?.postId || "").trim();
      const reaction = String(body?.reaction || "").trim();
      if (!postId || !REACTIONS.includes(reaction)) return { status: 400, jsonBody: { ok: false, error: "ردّ الفعل غير صالح." } };

      const studentId = String(student.userId);
      let updatedReactions = null;
      try {
        await mutateJsonWithRetry(container, feedBlobName(classId, postId), current => {
          if (!current) { const err = new Error("المنشور غير موجود."); err.httpStatus = 404; throw err; }
          // A student reacts to a VISIBLE classmate's event only — never their own, never an unshared one.
          if (String(current.studentId || "") === studentId) { const err = new Error("لا يمكنك التفاعل مع إنجازك."); err.httpStatus = 403; throw err; }
          if (!isVisibleToStudent(current, studentId)) { const err = new Error("المنشور غير موجود."); err.httpStatus = 404; throw err; }
          const hadThisReaction = Array.isArray(current.reactions?.[reaction]) && current.reactions[reaction].includes(studentId);
          current.reactions = current.reactions && typeof current.reactions === "object" ? current.reactions : {};
          for (const key of REACTIONS) {
            current.reactions[key] = Array.isArray(current.reactions[key]) ? current.reactions[key].filter(id => id !== studentId) : [];
          }
          if (!hadThisReaction) current.reactions[reaction].push(studentId);
          updatedReactions = current.reactions;
          return current;
        });
      } catch (e) {
        if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        if (e?.httpStatus) return { status: e.httpStatus, jsonBody: { ok: false, error: e.message } };
        throw e;
      }
      return { status: 200, jsonBody: { ok: true, reactionCounts: reactionCounts(updatedReactions), myReaction: myReaction(updatedReactions, studentId) } };
    } catch (e) {
      obs?.logError("student.feed.error", e);
      return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل إنجازات الصف حاليًا." } };
    }
}

app.http("achievementFeed", { methods: ["GET", "POST"], authLevel: "anonymous", route: "achievement-feed", handler: withObservability("achievement-feed", handler) });
module.exports = { handler };
