const { app } = require("@azure/functions");
const { randomUUID } = require("node:crypto");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { downloadJsonOrNull, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { classHasLearningCourse, classCanSeeLearningModule } = require("../lib/class-learning-materials");
const { loadPageIndex, moduleOfPage } = require("../lib/learning-progress");
const { annotationsDocName, applyAnnotation, annotationsView, normalizeAnnotationsDoc } = require("../lib/learning-annotations");

// Phase L.5 — the student's PRIVATE reading annotations (students only; no teacher route reads them). Routes (one function):
//   GET  /api/learning-annotations/{courseId}            → { bookmarks[], notes[], highlights[] } over the units the class sees now
//   POST /api/learning-annotations/{courseId}/bookmark   → { pageId, on }
//   POST /api/learning-annotations/{courseId}/note       → { pageId, text }        (empty text removes the note)
//   POST /api/learning-annotations/{courseId}/highlight  → { pageId, quote }       (the server issues the id)
//   POST /api/learning-annotations/{courseId}/unhighlight → { pageId, id }
// Every write: the page must exist in the generated page index and its own module must be published to the PERSISTED class
// (never a claim in the token or the body). A change that alters nothing writes nothing. Writes go through CAS.
const CLASS_PREFIX = "platform/classes/";
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const ARCHIVED = { status: 403, jsonBody: { ok: false, error: "هذا الصف مؤرشف وانتهت السنة الدراسية." } };
const UNAVAILABLE = { status: 403, jsonBody: { ok: false, error: "هذه الصفحة غير متاحة لصفك بعد." } };
const NOT_FOUND = { status: 404, jsonBody: { ok: false, error: "الكتاب غير موجود." } };
const BAD_REQUEST = { status: 400, jsonBody: { ok: false, error: "طلب غير صالح." } };
const TOO_LARGE = { status: 413, jsonBody: { ok: false, error: "تجاوزت الحد المسموح (الملاحظة حتى 1000 حرف، والتظليل حتى 10 مقاطع في الصفحة)." } };
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const ACTIONS = new Set(["bookmark", "note", "highlight", "unhighlight"]);

function changeFor(action, body, newId) {
  if (action === "bookmark") return { kind: "bookmark", on: body.on };
  if (action === "note") return { kind: "note", text: body.text };
  if (action === "highlight") return { kind: "highlight-add", quote: body.quote, id: newId() };
  return { kind: "highlight-remove", id: typeof body.id === "string" ? body.id : "" };
}

async function handler(request, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const now = deps.now || (() => new Date().toISOString());
  const newId = deps.newId || (() => randomUUID().replace(/-/g, "").slice(0, 16));
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
    const docName = annotationsDocName(sess.student.userId);

    if (method === "GET" && !action) {
      const doc = await dl(sess.container, docName);
      return { status: 200, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: true, courseId, ...annotationsView(doc, courseId, index, canSee) } };
    }

    if (method === "POST" && ACTIONS.has(action)) {
      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      if (!body || typeof body !== "object" || typeof body.pageId !== "string") return BAD_REQUEST;
      const pageId = body.pageId.trim();
      const moduleId = moduleOfPage(index, pageId);
      if (!moduleId) return BAD_REQUEST;                                  // not a page of this book
      if (!canSee(moduleId)) return UNAVAILABLE;                           // its module is not published to the class
      const change = changeFor(action, body, newId);
      const at = now();
      const current = await dl(sess.container, docName);
      const probe = applyAnnotation(current, { courseId, pageId, change }, at);
      if (probe.error === "limit") return TOO_LARGE;
      if (probe.error) return BAD_REQUEST;
      if (!probe.changed) {
        return { status: 200, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: true, courseId, persisted: false, ...annotationsView(current, courseId, index, canSee) } };
      }
      let finalDoc = null, failure = null;
      try {
        // Applied again to the FRESHEST document inside the CAS loop; a bound reached meanwhile keeps the document unchanged.
        await mut(sess.container, docName, fresh => {
          const r = applyAnnotation(fresh, { courseId, pageId, change }, at);
          if (r.error) { failure = r.error; return (finalDoc = normalizeAnnotationsDoc(fresh)); }
          failure = null;
          return (finalDoc = r.doc);
        });
      } catch (e) {
        if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        throw e;
      }
      if (failure === "limit") return TOO_LARGE;
      if (failure) return BAD_REQUEST;
      return { status: 200, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: true, courseId, persisted: true, ...annotationsView(finalDoc, courseId, index, canSee) } };
    }

    return { status: 405, jsonBody: { ok: false, error: "Unsupported learning-annotations request." } };
  } catch (e) {
    obs?.logError?.("learning.annotations.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر حفظ ملاحظاتك حاليًا." } };
  }
}

app.http("learningAnnotations", { methods: ["GET", "POST"], authLevel: "anonymous", route: "learning-annotations/{courseId}/{action?}", handler: withObservability("learning-annotations", handler) });

module.exports = { handler };
