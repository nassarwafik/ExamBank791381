const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { listJson, downloadJsonOrNull, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { withheldAssignmentIds } = require("../lib/results-release");
const { FEED_PREFIX, REACTIONS, feedBlobName, publicPost, isVisibleToStudent, reactionCounts } = require("../lib/achievement-feed");
const { isSafeSegment } = require("../lib/blob-names");
const { normalizeClassStatus } = require("../lib/class-lifecycle");

const UP = "platform/users/", AP = "platform/assignments/";
// Phase 21G.5 (D2) — an assessment medal reveals a mark band, so its post is shown (to anyone, its owner included) only once the
// assignment's results are released. Game medals carry no assignment and are unaffected.
const assessmentMedalOf = post => { const raw = post && post.medal && typeof post.medal === "object" ? post.medal : null; if (raw && raw.source === "game") return ""; const m = publicPost(post).medal; return m ? String(m.assignmentId || "") : ""; };
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
// QA2-9 — «شارك إنجازاتي مع الصف» is the student's CURRENT choice: turning it off withdraws their earlier events from classmates too (a
// post's own shareWithClass flag only records the choice at the time it was made). The author always keeps seeing their own events;
// teachers are unaffected. Reads one user document per distinct classmate author (bounded by the class size).
async function authorsNotSharing(container, dl, posts, viewerId) {
  const ids = [...new Set(posts.map(p => String(p && p.studentId || "")).filter(id => id && id !== String(viewerId)))];
  const off = new Set();
  for (const id of ids) { const u = await dl(container, "platform/users/" + id + ".json"); if (u && u.shareAchievements === false) off.add(id); }
  return off;
}

async function handler(request, deps = {}, obs = null) {
    try {
      // Hardened session (§7): active/archived/authVersion validated; loaded student reused (no extra read).
      const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
      if (!sess.ok) return sess.response;
      const container = sess.container;
      const student = sess.student;
      const classId = String(student.classId || "");
      // QA-15 — an archived class is read-only: its feed stays readable as a record (flagged readOnly) but takes no reaction.
      const dlc = deps.downloadJsonOrNull || downloadJsonOrNull;
      const classroom = classId ? await dlc(container, "platform/classes/" + classId + ".json") : null;
      const archived = !!classroom && normalizeClassStatus(classroom) === "archived";

      if (request.method === "GET") {
        if (!classId) return { status: 200, jsonBody: { ok: true, posts: [] } };
        // Privacy: a classmate's event is listed only when shared with the class; the student's own events always.
        const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
        const visible = (await listJson(container, FEED_PREFIX + classId + "/")).filter(post => isVisibleToStudent(post, student.userId));
        const notSharing = await authorsNotSharing(container, dl, visible, student.userId);   // QA2-9
        const listed = visible.filter(post => !notSharing.has(String(post.studentId || "")));
        const withheld = await withheldAssignmentIds(listed.map(assessmentMedalOf), id => dl(container, AP + id + ".json"));
        const posts = listed
          .filter(post => !withheld.has(assessmentMedalOf(post)))
          .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
          .slice(0, MAX_POSTS)
          .map(post => ({
            ...publicPost(post),
            isOwnPost: String(post.studentId || "") === String(student.userId),
            myReaction: myReaction(post.reactions, String(student.userId))
          }));
        return { status: 200, jsonBody: { ok: true, posts, ...(archived ? { readOnly: true } : {}) } };
      }

      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      const action = String(body?.action || "").trim();
      if (action !== "react") return { status: 400, jsonBody: { ok: false, error: "Unsupported feed action." } };

      const postId = String(body?.postId || "").trim();
      const reaction = String(body?.reaction || "").trim();
      if (!postId || !REACTIONS.includes(reaction)) return { status: 400, jsonBody: { ok: false, error: "ردّ الفعل غير صالح." } };
      if (archived) return { status: 403, jsonBody: { ok: false, error: "الصف مؤرشف — لا يمكن التفاعل مع الإنجازات." } };   // QA-15
      // The post id becomes part of a blob name: one safe segment only (a "../" id would leave the class's feed folder).
      if (!isSafeSegment(postId)) return { status: 400, jsonBody: { ok: false, error: "معرّف المنشور غير صالح." } };

      const studentId = String(student.userId);
      // A medal post that is not shown (its assignment's results are not released) cannot be reacted to either.
      const target = await (deps.downloadJsonOrNull || downloadJsonOrNull)(container, feedBlobName(classId, postId));
      const unreleasedMedal = !!target && (await withheldAssignmentIds([assessmentMedalOf(target)], id => (deps.downloadJsonOrNull || downloadJsonOrNull)(container, AP + id + ".json"))).size > 0;
      const authorNotSharing = !!target && (await authorsNotSharing(container, deps.downloadJsonOrNull || downloadJsonOrNull, [target], studentId)).size > 0;   // QA2-9
      let updatedReactions = null;
      try {
        await mutateJsonWithRetry(container, feedBlobName(classId, postId), current => {
          if (!current) { const err = new Error("المنشور غير موجود."); err.httpStatus = 404; throw err; }
          // A student reacts to a VISIBLE classmate's event only — never their own, never an unshared one.
          if (String(current.studentId || "") === studentId) { const err = new Error("لا يمكنك التفاعل مع إنجازك."); err.httpStatus = 403; throw err; }
          if (unreleasedMedal || authorNotSharing) { const err = new Error("المنشور غير موجود."); err.httpStatus = 404; throw err; }
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
