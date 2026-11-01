// Phase 21G.2 — GET /api/assignment-progress: the PROGRESS of the teacher's published assignments, for the assignments home
// (progress bars, «بانتظار التصحيح», «يحاولون الآن», the KPI strip). Read-only and derived: the SAME scoped read shape as the
// Today hub (the published assignments of the teacher's ACTIVE classes through the Phase 12E-B per-class index, one submission
// folder per published assignment, the class members) and the SAME rules as the gradebook (lib/assignment-progress.js). Nothing is
// persisted; drafts, archived assignments and archived classes are never read; another teacher's classes are never read (21G.0).
//
//   → { ok, generatedAt, progress: [{ assignmentId, classId, expected, submitted, notSubmitted, pendingReview, graded, active, average, lastSubmittedAt }] }
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { getContainer, listJson, listBlobNames, downloadManyJson, getReadConcurrency, mapConcurrent } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { normalizeAssignmentStatus } = require("../lib/assignment-lifecycle");
const { isStudentClassMember } = require("../lib/class-membership");
const { loadPublishedAssignmentsForClasses } = require("../lib/class-assignment-index");
const { deriveAssignmentProgress } = require("../lib/assignment-progress");
const { logReadCost } = require("../lib/read-cost-log");
const { tenantOf, filterAccessible } = require("../lib/teacher-tenancy");

const CP = "platform/classes/", UP = "platform/users/", SP = "platform/submissions/";

/** The submission documents of ONE assignment folder, keyed by the student id THE DOCUMENT names (never the file name). */
async function loadFolder(container, assignmentId, deps, tally) {
  const list = deps.listBlobNames || listBlobNames, many = deps.downloadManyJson || downloadManyJson;
  const names = (await list(container, SP + assignmentId + "/")).filter(n => n.endsWith(".json"));
  const docs = await many(container, names, getReadConcurrency());
  tally.submissionDocsLoaded += names.length;
  const byStudent = new Map();
  for (const d of docs) if (d && typeof d === "object" && String(d.assignmentId || "") === assignmentId && d.studentId) byStudent.set(String(d.studentId), d);
  return byStudent;
}

async function handler(request, deps = {}, obs = null) {
  try {
    const auth = (await requireTeacherSession(request, deps));
    if (!auth.ok) return auth.response;
    const container = deps.container || (deps.getContainer || getContainer)();
    const lj = deps.listJson || listJson, nowMs = typeof deps.nowMs === "number" ? deps.nowMs : Date.now();
    const [allClasses, users] = await Promise.all([lj(container, CP), lj(container, UP)]);
    const classes = filterAccessible(allClasses, tenantOf(auth.user));
    const activeIds = new Set(classes.filter(c => c && c.classId && normalizeClassStatus(c) === "active").map(c => String(c.classId)));
    const idx = await loadPublishedAssignmentsForClasses(container, [...activeIds], { ...deps, listJson: lj }, obs);
    const published = [...idx.byClass.values()].flat().filter(a => a && a.assignmentId && normalizeAssignmentStatus(a) === "published" && activeIds.has(String(a.classId || "")));
    const members = new Map();
    for (const u of users) { if (!u || u.role !== "student") continue; const cid = String(u.classId || ""); if (activeIds.has(cid) && isStudentClassMember(u, cid)) { if (!members.has(cid)) members.set(cid, []); members.get(cid).push(u); } }
    const tally = { submissionDocsLoaded: 0 };
    const folders = await (deps.mapConcurrent || mapConcurrent)(published, getReadConcurrency(), a => loadFolder(container, String(a.assignmentId), deps, tally));
    const progress = published.map((a, i) => ({ assignmentId: String(a.assignmentId), classId: String(a.classId), ...deriveAssignmentProgress(members.get(String(a.classId)) || [], folders[i]) }));
    logReadCost(obs, "assignment.progress.read_cost", { classDocsScanned: allClasses.length, userDocsScanned: users.length, publishedActiveAssignments: published.length, submissionFolderListings: published.length, submissionDocsLoaded: tally.submissionDocsLoaded, assignmentDocsScanned: idx.stats.assignmentDocsLoaded });
    return { status: 200, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: true, generatedAt: new Date(nowMs).toISOString(), progress } };
  } catch (e) {
    obs?.logError?.("assignment.progress.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل تقدم الواجبات حاليًا." } };
  }
}

app.http("assignmentProgress", { methods: ["GET"], authLevel: "anonymous", route: "assignment-progress", handler: withObservability("assignment-progress", handler) });
module.exports = { handler };
