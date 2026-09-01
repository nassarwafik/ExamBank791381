const { app } = require("@azure/functions");
const { requireStudentAuth } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull, listJson, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { FEED_PREFIX, REACTIONS, feedBlobName } = require("../lib/achievement-feed");

const UP = "platform/users/";
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const MAX_POSTS = 30;

function reactionCounts(reactions) {
  const out = {};
  for (const key of REACTIONS) out[key] = Array.isArray(reactions?.[key]) ? reactions[key].length : 0;
  return out;
}

function myReaction(reactions, studentId) {
  for (const key of REACTIONS) {
    if (Array.isArray(reactions?.[key]) && reactions[key].includes(studentId)) return key;
  }
  return null;
}

app.http("achievementFeed", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "achievement-feed",
  handler: async request => {
    try {
      const auth = requireStudentAuth(request);
      if (!auth.ok) return auth.response;
      const container = getContainer();
      const student = await downloadJsonOrNull(container, UP + auth.user.sub + ".json");
      if (!student || student.active === false) return { status: 401, jsonBody: { ok: false, error: "الحساب غير فعّال." } };
      const classId = String(student.classId || "");

      if (request.method === "GET") {
        if (!classId) return { status: 200, jsonBody: { ok: true, posts: [] } };
        const posts = (await listJson(container, FEED_PREFIX + classId + "/"))
          .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
          .slice(0, MAX_POSTS)
          .map(post => ({
            postId: String(post.postId || ""),
            studentDisplayName: String(post.studentDisplayName || ""),
            assignmentTitle: String(post.assignmentTitle || ""),
            tier: post.tier,
            createdAt: String(post.createdAt || ""),
            isOwnPost: String(post.studentId || "") === String(student.userId),
            reactionCounts: reactionCounts(post.reactions),
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
    } catch {
      return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل إنجازات الصف حاليًا." } };
    }
  }
});
