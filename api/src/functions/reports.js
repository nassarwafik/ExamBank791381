// Reports Center backend (teacher only). One function, many report types, all returning AGGREGATED
// data (never raw blobs). Project reports reuse the generic Project Tracker engine, so they work for
// every registered project and any future one. Never leaks answer keys, passwords, codes or tokens.
const { app } = require("@azure/functions");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, downloadJsonOrNull, listJson, mapConcurrent, getReadConcurrency } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { isReportableAssessment } = require("../lib/assignment-lifecycle");
const { isSupportedProject, getProjectDefinition, getStorageNamespace, getProjectMeta, getSupportedProjects } = require("../lib/project-tracker/registry");
const svc = require("../lib/project-tracker/service");
const core = require("../lib/project-tracker/core");
const analytics = require("../lib/project-tracker/analytics");
const agg = require("../lib/reports/aggregate");
const { parseDateRange, inRange } = require("../lib/reports/date-range");
const { buildHistoryTimeline } = require("../lib/reports/timeline");
const { getClassProgramCodes, getSupportedClassProgramCodes, classHasProject } = require("../lib/project-tracker/class-programs");

const CLASS_PREFIX = "platform/classes/";
const USER_PREFIX = "platform/users/";
const ASSIGN_PREFIX = "platform/assignments/";
const SUB_PREFIX = "platform/submissions/";

async function loadClass(container, classId) { return downloadJsonOrNull(container, CLASS_PREFIX + classId + ".json"); }
function classMeta(c) {
  return { classId: c.classId, name: c.name, grade: c.grade || "", schoolYear: c.schoolYear || "", status: normalizeClassStatus(c), programCodes: getClassProgramCodes(c), studentCount: Array.isArray(c.studentIds) ? c.studentIds.length : 0 };
}
async function classStudents(container, classId) {
  const all = await listJson(container, USER_PREFIX);
  // Same population predicate as the project tracker (single source), so class reports and project
  // analytics always count the exact same students: exclude only archived; keep login-disabled.
  return all.filter(u => svc.studentBelongsToClass(u, classId))
    .map(u => ({ studentId: u.userId, displayName: u.displayName || ((u.firstName || "") + " " + (u.familyName || "")).trim(), code: u.code }))
    .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "ar"));
}
// Roadmap #26: the class's REPORTABLE assessments — published, or archived after being published — through the
// ONE canonical predicate. Drafts and archived-from-draft ("deleted") drafts were never takeable and must not
// count as unsubmitted assessments (they inflated the assessment count and deflated the submission rate).
async function classAssignments(container, classId) {
  return (await listJson(container, ASSIGN_PREFIX))
    .filter(a => a && String(a.classId || "") === String(classId) && isReportableAssessment(a))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}
// One prefix scan per assignment -> Map studentId -> submission.
async function submissionsFor(container, assignmentId) {
  const blobs = await listJson(container, SUB_PREFIX + assignmentId + "/");
  return new Map(blobs.filter(Boolean).map(s => [String(s.studentId), s]));
}
// Roadmap #27: the per-assignment submission scans are independent, so run a few at a time (each scan already
// downloads its blobs concurrently). Results stay aligned with `assignments` so every aggregation is unchanged.
const ASSIGNMENT_SCAN_CONCURRENCY = 4;
async function submissionsForAll(container, assignments) {
  return mapConcurrent(assignments, Math.min(ASSIGNMENT_SCAN_CONCURRENCY, getReadConcurrency()), a => submissionsFor(container, a.assignmentId));
}

// Project working definition + progress entries for a class (reused by every project report).
async function projectContext(container, projectCode, classroom) {
  const config = await svc.ensureClassConfig(container, projectCode, classroom);
  const workDef = svc.workingDefinition(projectCode, config);
  const students = await svc.listClassStudents(container, classroom.classId);
  const entries = await svc.loadProgressEntries(container, projectCode, classroom.classId, students);
  return { config, workDef, students, entries };
}

// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used). It does not change runtime behavior.
async function handler(request, deps = {}) {
    try {
      const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
      if (!auth.ok) return auth.response;
      const container = deps.container || (deps.getContainer || getContainer)();
      const now = new Date().toISOString();
      const url = new URL(request.url);
      const type = String(url.searchParams.get("type") || "").trim();
      const classId = String(url.searchParams.get("classId") || "").trim();
      const studentId = String(url.searchParams.get("studentId") || "").trim();
      const projectCode = String(url.searchParams.get("projectCode") || "").trim();
      const track = String(url.searchParams.get("track") || "").trim();
      const groupId = String(url.searchParams.get("groupId") || "").trim();
      // Date range applies ONLY to time-meaningful data (assessments by createdAt, timeline by week).
      // It never touches current project progress snapshots.
      let range;
      try { range = parseDateRange(url.searchParams.get("from"), url.searchParams.get("to")); }
      catch (e) { return { status: e.httpStatus || 400, jsonBody: { ok: false, error: e.message } }; }

      // Filter options for the global filter bar (school years incl. archived, classes, projects).
      if (type === "filters") {
        const classes = (await listJson(container, CLASS_PREFIX)).filter(Boolean).map(classMeta)
          .sort((a, b) => String(b.schoolYear).localeCompare(String(a.schoolYear)) || String(a.name).localeCompare(String(b.name), "ar"));
        const schoolYears = [...new Set(classes.map(c => c.schoolYear).filter(Boolean))].sort((a, b) => String(b).localeCompare(String(a)));
        const projects = getSupportedProjects().map(getProjectMeta);
        return { status: 200, jsonBody: { ok: true, schoolYears, classes, projects } };
      }

      // Students of one class, for the student/timeline filter dropdowns.
      if (type === "classStudents") {
        if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
        return { status: 200, jsonBody: { ok: true, students: await classStudents(container, classId) } };
      }

      // ---------- Academic reports ----------
      if (type === "class") {
        if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
        const c = await loadClass(container, classId);
        if (!c) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
        const students = await classStudents(container, classId);
        const assignments = (await classAssignments(container, classId)).filter(a => inRange(a.createdAt, range));
        const allPcts = [];
        let submittedCells = 0;
        const subsByAssignment = await submissionsForAll(container, assignments);
        for (let i = 0; i < assignments.length; i++) {
          const subs = subsByAssignment[i];
          for (const s of students) {
            const o = agg.studentOutcome(subs.get(String(s.studentId)));
            if (o.state === "submitted") { submittedCells += 1; allPcts.push(o.percentage); }
          }
        }
        const totalCells = students.length * assignments.length;
        const meta = classMeta(c);
        // A class may be in several projects — report each independently (never combine their %).
        const projects = [];
        for (const pCode of getSupportedClassProgramCodes(c)) {
          const ctx = await projectContext(container, pCode, c);
          const sum = analytics.buildClassSummary(ctx.workDef, ctx.entries, now);
          projects.push({ projectCode: pCode, title: getProjectDefinition(pCode).title, tracks: getProjectDefinition(pCode).tracks, avgOverall: sum.avgOverall, trackAverages: sum.trackAverages, completedCount: sum.completedCount });
        }
        return { status: 200, jsonBody: { ok: true, type, class: meta, kpis: {
          assignments: assignments.length,
          averageScore: agg.average(allPcts),
          submissionRate: totalCells ? Math.round((submittedCells / totalCells) * 100) : 0
        }, projects } };
      }

      if (type === "student") {
        if (!studentId) return { status: 400, jsonBody: { ok: false, error: "studentId مطلوب." } };
        const u = await downloadJsonOrNull(container, USER_PREFIX + studentId + ".json");
        if (!u || u.role !== "student") return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
        const sClassId = String(u.classId || "");
        const c = sClassId ? await loadClass(container, sClassId) : null;
        const assignments = c ? (await classAssignments(container, sClassId)).filter(a => inRange(a.createdAt, range)) : [];
        // Roadmap #27: the student's per-assignment submissions are independent reads → bounded concurrency, aligned.
        const mySubs = await mapConcurrent(assignments, getReadConcurrency(), a => downloadJsonOrNull(container, SUB_PREFIX + a.assignmentId + "/" + studentId + ".json"));
        let submittedCount = 0;
        for (const s of mySubs) if (agg.studentOutcome(s).state === "submitted") submittedCount += 1;
        const acad = agg.studentAcademicAverage(mySubs);
        // One entry per project of the student's class — each independent.
        const projects = [];
        if (c) for (const pCode of getSupportedClassProgramCodes(c)) {
          const ns = getStorageNamespace(pCode);
          const config = await svc.ensureClassConfig(container, pCode, c);
          const workDef = svc.workingDefinition(pCode, config);
          const progress = await downloadJsonOrNull(container, ns.progressName(sClassId, studentId));
          const summary = core.buildStudentSummary(workDef, progress, now);
          projects.push({
            projectCode: pCode, title: getProjectDefinition(pCode).title, tracks: getProjectDefinition(pCode).tracks,
            summary, nextStages: core.getNextStages(workDef, progress),
            balance: core.getBalanceInsight(summary.trackProgress, workDef),
            lastActivity: progress ? (progress.updatedAt || "") : ""
          });
        }
        return { status: 200, jsonBody: { ok: true, type,
          student: { studentId, displayName: u.displayName || "", classId: sClassId, className: c ? c.name : "", schoolYear: c ? c.schoolYear : "" },
          // Single assessments average — the schema has no exam/assignment distinction, so no duplicate metrics.
          academic: { average: acad.average, submittedCount, assessmentCount: assignments.length, submissionRate: assignments.length ? Math.round((submittedCount / assignments.length) * 100) : 0 },
          projects } };
      }

      // Unified assessments report. The schema has no field distinguishing exam vs assignment, so a
      // single report covers every published assessment (no duplicate exam/assignment reports).
      if (type === "assignments") {
        if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
        const c = await loadClass(container, classId);
        if (!c) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
        const students = await classStudents(container, classId);
        const assignments = (await classAssignments(container, classId)).filter(a => inRange(a.createdAt, range));
        const perAssignment = [];
        const pooledPcts = [];
        const matrix = [];
        let submittedCells = 0;
        const subsByAssignment = await submissionsForAll(container, assignments);
        for (let i = 0; i < assignments.length; i++) {
          const a = assignments[i];
          const subs = subsByAssignment[i];
          const entries = students.map(s => ({ studentId: s.studentId, submission: subs.get(String(s.studentId)) }));
          const st = agg.assignmentStats(entries);
          perAssignment.push({ assignmentId: a.assignmentId, title: a.title, ...st });
          matrix.push({ assignmentId: a.assignmentId, title: a.title, cells: entries.map(e => { const o = agg.studentOutcome(e.submission); return { studentId: e.studentId, state: o.state, percentage: o.percentage }; }) });
          for (const e of entries) { const o = agg.studentOutcome(e.submission); if (o.state === "submitted") { pooledPcts.push(o.percentage); submittedCells += 1; } }
        }
        const totalCells = students.length * assignments.length;
        return { status: 200, jsonBody: { ok: true, type, class: classMeta(c),
          students: students.map(s => ({ studentId: s.studentId, displayName: s.displayName })),
          overall: { assessmentCount: assignments.length, participants: pooledPcts.length, average: agg.average(pooledPcts), submissionRate: totalCells ? Math.round((submittedCells / totalCells) * 100) : 0, distribution: agg.gradeDistribution(pooledPcts) },
          perAssignment, matrix } };
      }

      // ---------- Project reports (generic) ----------
      if (["project", "track", "ready", "delayed", "timeline"].includes(type)) {
        if (!isSupportedProject(projectCode)) return { status: 400, jsonBody: { ok: false, error: "مشروع غير مدعوم." } };
        if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
        const c = await loadClass(container, classId);
        if (!c) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
        if (!classHasProject(c, projectCode)) return { status: 400, jsonBody: { ok: false, error: "الصف غير مسجَّل في هذا المشروع." } };
        const { config, workDef, entries } = await projectContext(container, projectCode, c);
        const tracks = getProjectDefinition(projectCode).tracks;

        if (type === "project") {
          return { status: 200, jsonBody: { ok: true, type, projectCode, tracks, class: classMeta(c),
            summary: analytics.buildClassSummary(workDef, entries, now), analytics: analytics.buildAnalytics(workDef, entries, now) } };
        }
        if (type === "track") {
          const activeTrack = track || (tracks[0] && tracks[0].trackId);
          const stages = (config.stages || []).filter(s => s.active === true && s.track === activeTrack && (!groupId || s.groupId === groupId));
          const rows = stages.map(stage => {
            const counts = { approved: 0, ready_for_review: 0, in_progress: 0, not_started: 0 };
            for (const e of entries) counts[core.stageStatus(e.progress, stage.stageId)] += 1;
            const n = entries.length;
            return { stageId: stage.stageId, title: stage.title, groupId: stage.groupId, ...counts, approvedPct: n ? Math.round((counts.approved / n) * 100) : 0 };
          });
          return { status: 200, jsonBody: { ok: true, type, projectCode, tracks, track: activeTrack, groups: config.groups.filter(g => g.track === activeTrack), class: classMeta(c), rows } };
        }
        if (type === "ready") {
          const byStudent = entries.map(e => {
            const stages = (config.stages || []).filter(s => s.active === true && core.stageStatus(e.progress, s.stageId) === "ready_for_review")
              .map(s => ({ stageId: s.stageId, title: s.title, track: s.track }));
            return { studentId: e.studentId, displayName: e.displayName, stages };
          }).filter(s => s.stages.length);
          return { status: 200, jsonBody: { ok: true, type, projectCode, tracks, class: classMeta(c), students: byStudent, totalReady: byStudent.reduce((a, s) => a + s.stages.length, 0) } };
        }
        if (type === "delayed") {
          const cfg = config.config || {};
          const lateThreshold = Number.isFinite(Number(cfg.lateThreshold)) ? Number(cfg.lateThreshold) : 40;
          const rows = entries.map(e => {
            const summary = core.buildStudentSummary(workDef, e.progress, now);
            const reasons = [];
            if (summary.stale) reasons.push("بلا تحديث " + (cfg.staleDays || 7) + "+ أيام");
            if (!summary.complete && summary.overallProgress < lateThreshold) reasons.push("تقدّم أقل من " + lateThreshold + "%");
            return { studentId: e.studentId, displayName: e.displayName, overall: summary.overallProgress, trackProgress: summary.trackProgress, updatedAt: summary.updatedAt, complete: summary.complete, reasons };
          }).filter(r => r.reasons.length);
          return { status: 200, jsonBody: { ok: true, type, projectCode, tracks, lateThreshold, class: classMeta(c), students: rows } };
        }
        if (type === "timeline") {
          // Built from REAL recorded status history (handles later un-approvals); range-clipped; no
          // invented points when there is no history.
          if (studentId) {
            const membership = await svc.requireStudentInClass(container, studentId, classId);
            if (!membership.ok) return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود في هذا الصف." } };
            const ns = getStorageNamespace(projectCode);
            const progress = await downloadJsonOrNull(container, ns.progressName(classId, studentId));
            const trend = buildHistoryTimeline(workDef, [{ studentId, progress }], range, now);
            return { status: 200, jsonBody: { ok: true, type, projectCode, tracks, class: classMeta(c), scope: "student", studentId, trend } };
          }
          return { status: 200, jsonBody: { ok: true, type, projectCode, tracks, class: classMeta(c), scope: "class", trend: buildHistoryTimeline(workDef, entries, range, now) } };
        }
      }

      return { status: 400, jsonBody: { ok: false, error: "نوع تقرير غير معروف." } };
    } catch {
      return { status: 500, jsonBody: { ok: false, error: "تعذر تجهيز التقرير حاليًا." } };
    }
}

app.http("reports", { methods: ["GET"], authLevel: "anonymous", route: "reports", handler });
module.exports = { handler };
