const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, downloadJsonOrNull, listJson, mapConcurrent, getReadConcurrency } = require("../lib/platform-storage");
const { tenantOf, canAccessDocument } = require("../lib/teacher-tenancy");
const { isStudentClassMember } = require("../lib/class-membership");
const { classHasLearningCourse, getVisibleLearningModuleIds } = require("../lib/class-learning-materials");
const { listLearningModules } = require("../lib/learning-materials-registry");
const { progressDocName, loadPageIndex, classProgressSummary } = require("../lib/learning-progress");
const { logReadCost } = require("../lib/read-cost-log");

// Phase L.4 — GET /api/learning-class-progress/{classId}/{courseId}: how far a CLASS has read a book, for its teacher.
//   → { ok, classId, courseId, generatedAt, totalPages, modules: [{ moduleId, title, order, total, started, completed, averageRead }],
//       students: [{ userId, displayName, code, modules: { moduleId: pagesRead }, readPages, totalPages, lastReadAt }] }
// Class-scoped (21G.0): the class must be the teacher's own (another teacher's class answers exactly like a missing one), the
// course must be attached to it, and only the units published to it NOW are reported. Members come from the class's own
// studentIds index and are re-checked against their user documents (an archived or moved student is never counted). Read-only:
// one class read, one user read and one progress read per member. Per-unit counts only — never the exact pages a student read.
const CP = "platform/classes/", UP = "platform/users/";
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const NOT_FOUND = { status: 404, jsonBody: { ok: false, error: "الصف أو الكتاب غير موجود." } };

async function handler(request, deps = {}, obs = null) {
  try {
    const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
    if (!auth.ok) return auth.response;
    const classId = String(request.params?.classId || "").trim();
    const courseId = String(request.params?.courseId || "").trim();
    if (!ID.test(classId) || !ID.test(courseId)) return NOT_FOUND;
    const index = loadPageIndex(courseId);
    if (!index) return NOT_FOUND;
    const container = deps.container || (deps.getContainer || getContainer)();
    const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
    const classroom = await dl(container, CP + classId + ".json");
    if (!classroom || !canAccessDocument(classroom, tenantOf(auth.user))) return NOT_FOUND;
    if (!classHasLearningCourse(classroom, courseId)) return NOT_FOUND;

    // Members: the class's denormalized index when present (the normal case), else the authoritative user scan.
    let users;
    if (Array.isArray(classroom.studentIds)) {
      const ids = [...new Set(classroom.studentIds.map(id => String(id || "").trim()).filter(id => ID.test(id)))];
      users = await (deps.mapConcurrent || mapConcurrent)(ids, getReadConcurrency(), id => dl(container, UP + id + ".json"));
    } else {
      users = await (deps.listJson || listJson)(container, UP);
    }
    const members = users.filter(u => isStudentClassMember(u, classId) && u.active !== false);
    const docs = await (deps.mapConcurrent || mapConcurrent)(members, getReadConcurrency(), u => dl(container, progressDocName(u.userId)));
    const visibleIds = new Set(getVisibleLearningModuleIds(classroom, courseId));
    const modules = listLearningModules(courseId).filter(m => visibleIds.has(m.moduleId));
    const summary = classProgressSummary(index, modules, members.map((u, i) => ({ userId: String(u.userId), displayName: String(u.displayName || ""), code: String(u.code || ""), doc: docs[i] })));
    logReadCost(obs, "learning.class_progress.read_cost", { classDocs: 1, userDocs: users.length, progressDocs: members.length });
    return { status: 200, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: true, classId, courseId, generatedAt: new Date(typeof deps.nowMs === "number" ? deps.nowMs : Date.now()).toISOString(), ...summary } };
  } catch (e) {
    obs?.logError?.("learning.class_progress.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل قراءة الصف حاليًا." } };
  }
}

app.http("learningClassProgress", { methods: ["GET"], authLevel: "anonymous", route: "learning-class-progress/{classId}/{courseId}", handler: withObservability("learning-class-progress", handler) });
module.exports = { handler };
