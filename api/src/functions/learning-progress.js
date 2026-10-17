const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { downloadJsonOrNull, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { classHasLearningCourse, classCanSeeLearningModule } = require("../lib/class-learning-materials");
const { progressDocName, loadPageIndex, moduleOfPage, normalizeProgressDoc, visitIsNoop, applyVisit, progressView } = require("../lib/learning-progress");

// Phase L.3 — Reading Progress API (students only; a teacher preview neither reads nor writes progress). Routes (one function):
//   GET  /api/learning-progress/{courseId}        → the caller's progress in the course, restricted to the modules the class
//                                                   can see now: { lastPageId, lastReadAt, visited[], modules{ read, total } }
//   POST /api/learning-progress/{courseId}/visit  → { pageId } — the page must exist in the generated page index and its own
//                                                   module must be published to the student's class; records it as read and
//                                                   as the last page (idempotent; a repeat of the current page writes nothing)
// The persisted class is the authority (never a claim in the token or the body). Progress is never a grade.
const CLASS_PREFIX = "platform/classes/";
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const ARCHIVED = { status: 403, jsonBody: { ok: false, error: "هذا الصف مؤرشف وانتهت السنة الدراسية." } };
const UNAVAILABLE = { status: 403, jsonBody: { ok: false, error: "هذه الصفحة غير متاحة لصفك بعد." } };
const NOT_FOUND = { status: 404, jsonBody: { ok: false, error: "الكتاب غير موجود." } };
const BAD_REQUEST = { status: 400, jsonBody: { ok: false, error: "طلب غير صالح." } };
const ID = /^[A-Za-z0-9_-]{1,64}$/;

async function handler(request, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const now = deps.now || (() => new Date().toISOString());
  try {
    const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
    if (!sess.ok) return sess.response;
    const courseId = String(request.params?.courseId || "").trim();
    const action = String(request.params?.action || "").trim().toLowerCase();
    const method = String(request.method || "GET").toUpperCase();
    if (!ID.test(courseId)) return NOT_FOUND;
    const index = loadPageIndex(courseId);
    if (!index) return NOT_FOUND;

    // Persisted class → lifecycle → course attached (ONE class read).
    const classId = String(sess.student?.classId || "").trim();
    const classroom = classId ? await dl(sess.container, CLASS_PREFIX + classId + ".json") : null;
    if (classroom && normalizeClassStatus(classroom) === "archived") return ARCHIVED;
    if (!classroom || !classHasLearningCourse(classroom, courseId)) return UNAVAILABLE;
    const canSee = moduleId => classCanSeeLearningModule(classroom, courseId, moduleId);
    const docName = progressDocName(sess.student.userId);

    if (method === "GET" && !action) {
      const doc = await dl(sess.container, docName);
      return { status: 200, jsonBody: { ok: true, courseId, ...progressView(doc, courseId, index, canSee) } };
    }

    if (method === "POST" && action === "visit") {
      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      if (!body || typeof body !== "object" || typeof body.pageId !== "string") return BAD_REQUEST;
      const pageId = body.pageId.trim();
      const moduleId = moduleOfPage(index, pageId);
      if (!moduleId) return BAD_REQUEST;                                  // not a page of this book
      if (!canSee(moduleId)) return UNAVAILABLE;                           // its module is not published to the class
      const current = await dl(sess.container, docName);
      if (visitIsNoop(current, { courseId, pageId })) {
        return { status: 200, jsonBody: { ok: true, courseId, persisted: false, ...progressView(current, courseId, index, canSee) } };
      }
      let finalDoc = null;
      const at = now();
      try {
        await mut(sess.container, docName, fresh => (finalDoc = applyVisit(fresh, { courseId, moduleId, pageId }, at)));
      } catch (e) {
        if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        throw e;
      }
      return { status: 200, jsonBody: { ok: true, courseId, persisted: true, ...progressView(normalizeProgressDoc(finalDoc), courseId, index, canSee) } };
    }

    return { status: 405, jsonBody: { ok: false, error: "Unsupported learning-progress request." } };
  } catch (e) {
    obs?.logError("learning.progress.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر حفظ تقدّم القراءة حاليًا." } };
  }
}

app.http("learningProgress", { methods: ["GET", "POST"], authLevel: "anonymous", route: "learning-progress/{courseId}/{action?}", handler: withObservability("learning-progress", handler) });

module.exports = { handler };
