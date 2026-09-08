const { app } = require("@azure/functions");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, downloadJsonOrNull, uploadJson, listJson, listBlobNames, deleteBlob, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { PROGRAM_CODE, TEMPLATE_VERSION, buildClassSnapshotFromDefault, buildUpgradedSnapshot } = require("../lib/project-794589-template");
const { classHasMeaningfulProgress } = require("../lib/project-794589-migration");
const core = require("../lib/project-794589-core");
const analytics = require("../lib/project-794589-analytics");
const { applyProgressUpdate } = require("../lib/project-794589-progress");
const { classHasProject } = require("../lib/project-tracker/class-programs");

const CLASS_PREFIX = "platform/classes/";
const USER_PREFIX = "platform/users/";
const CONFIG_PREFIX = "platform/project-trackers/classes/";
const PROGRESS_PREFIX = "platform/project-progress/";
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";

const classConfigName = classId => CONFIG_PREFIX + classId + ".json";
const progressName = (classId, studentId) => PROGRESS_PREFIX + classId + "/" + studentId + ".json";
const progressPrefixFor = classId => PROGRESS_PREFIX + classId + "/";

async function loadClassroom(container, classId) {
  return downloadJsonOrNull(container, CLASS_PREFIX + classId + ".json");
}

// Returns the class snapshot, creating+persisting it on first access for an ACTIVE 794589 class.
// For an archived class with no snapshot yet, returns an in-memory default so history still renders
// without writing to an archived class.
async function ensureClassConfig(container, classroom) {
  const classId = classroom.classId;
  const now = new Date().toISOString();
  const existing = await downloadJsonOrNull(container, classConfigName(classId));
  const isActive = normalizeClassStatus(classroom) === "active";

  if (!existing) {
    const snapshot = buildClassSnapshotFromDefault(classId, now);
    if (isActive) await uploadJson(container, classConfigName(classId), snapshot);
    return snapshot;
  }

  // Version-aware, NON-DESTRUCTIVE upgrade. Only an ACTIVE class whose snapshot predates the current
  // template AND that has NO meaningful student progress is auto-upgraded (safe — the spec allows a
  // direct upgrade for a class that hasn't really started). A class with real progress is left
  // exactly as-is and never silently reset; migrating its progress is a separate, explicit decision.
  if (isActive && Number(existing.templateVersion || 1) < TEMPLATE_VERSION) {
    const progressDocs = await listJson(container, progressPrefixFor(classId));
    if (!classHasMeaningfulProgress(progressDocs)) {
      const upgraded = buildUpgradedSnapshot(existing, classId, now);
      await uploadJson(container, classConfigName(classId), upgraded);
      await recordAuditEvent(container, {
        actor: "system", action: "project.template.upgrade",
        targetType: "project-template", targetId: classId, targetLabel: classroom.name || "",
        details: { fromVersion: Number(existing.templateVersion || 1), toVersion: TEMPLATE_VERSION, reason: "no-meaningful-progress" }
      });
      return upgraded;
    }
  }
  return existing;
}

async function listClassStudents(container, classId) {
  const all = await listJson(container, USER_PREFIX);
  return all
    .filter(u => u && u.role === "student" && String(u.classId || "") === String(classId) && u.archived !== true)
    .map(u => ({ studentId: u.userId, displayName: u.displayName || (u.firstName + " " + u.familyName).trim(), code: u.code }))
    .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "ar"));
}

async function loadProgressEntries(container, classId, students) {
  const blobs = await listJson(container, progressPrefixFor(classId));
  const byId = new Map(blobs.filter(Boolean).map(p => [String(p.studentId), p]));
  return students.map(s => ({ studentId: s.studentId, displayName: s.displayName, code: s.code, progress: byId.get(String(s.studentId)) || null }));
}

app.http("project794589", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "project-794589",
  handler: async request => {
    try {
      const auth = requireBuilderAuth(request);
      if (!auth.ok) return auth.response;
      const container = getContainer();
      const now = new Date().toISOString();

      if (request.method === "GET") {
        const url = new URL(request.url);
        const resource = String(url.searchParams.get("resource") || "").trim();
        const classId = String(url.searchParams.get("classId") || "").trim();

        // Catalog of 794589 classes for the class selector (no classId needed).
        if (resource === "classes") {
          const classes = (await listJson(container, CLASS_PREFIX))
            .filter(c => c && classHasProject(c, PROGRAM_CODE))
            .map(c => ({
              classId: c.classId, name: c.name, grade: c.grade, schoolYear: c.schoolYear,
              status: normalizeClassStatus(c), archivedAt: c.archivedAt || "", studentCount: Array.isArray(c.studentIds) ? c.studentIds.length : 0
            }))
            .sort((a, b) => String(b.schoolYear).localeCompare(String(a.schoolYear)));
          return { status: 200, jsonBody: { ok: true, classes } };
        }

        if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
        const classroom = await loadClassroom(container, classId);
        if (!classroom) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
        // Multi-project enrollment gate: this legacy route only serves a class enrolled in 794589
        // (via modern programCodes[] or the legacy programCode). A class whose 794589 link was
        // removed (or that never had it) has no project section here.
        if (!classHasProject(classroom, PROGRAM_CODE)) {
          return { status: 403, jsonBody: { ok: false, error: "الصف غير مسجَّل في مشروع 794589." } };
        }
        const readOnly = normalizeClassStatus(classroom) === "archived";
        const config = await ensureClassConfig(container, classroom);

        if (resource === "template") {
          return { status: 200, jsonBody: { ok: true, template: config, readOnly } };
        }

        // A single student's file: load just that one user blob directly (addressed by id) instead
        // of scanning every platform user — the old full scan made opening a student file slow.
        if (resource === "student") {
          const studentId = String(url.searchParams.get("studentId") || "").trim();
          if (!studentId) return { status: 400, jsonBody: { ok: false, error: "studentId مطلوب." } };
          const u = await downloadJsonOrNull(container, USER_PREFIX + studentId + ".json");
          const belongs = u && u.role === "student" && String(u.classId || "") === String(classId);
          const student = belongs
            ? { studentId: u.userId, displayName: u.displayName || (u.firstName + " " + u.familyName).trim(), code: u.code }
            : { studentId, displayName: "", code: "" };
          const progress = await downloadJsonOrNull(container, progressName(classId, studentId));
          const summary = core.buildStudentSummary(config, progress, now);
          return {
            status: 200,
            jsonBody: {
              ok: true, readOnly,
              student,
              summary,
              stages: config.stages,
              groups: config.groups,
              trackWeights: config.trackWeights,
              config: config.config,
              progress: progress ? progress.stages : {},
              history: progress ? (progress.history || []) : [],
              nextBookStage: core.getNextStage(config.stages, progress, "book"),
              nextPacketTracerStage: core.getNextStage(config.stages, progress, "packetTracer"),
              balance: core.getBalanceInsight(summary.bookProgress, summary.packetTracerProgress, config.config && config.config.balanceWarningThreshold)
            }
          };
        }

        const students = await listClassStudents(container, classId);

        if (resource === "summary") {
          const entries = await loadProgressEntries(container, classId, students);
          const summary = analytics.buildClassSummary(config, entries, now);
          return { status: 200, jsonBody: { ok: true, summary, readOnly, className: classroom.name, schoolYear: classroom.schoolYear } };
        }

        if (resource === "students") {
          const entries = await loadProgressEntries(container, classId, students);
          const cards = entries.map(e => ({
            studentId: e.studentId, displayName: e.displayName, code: e.code,
            ...core.buildStudentSummary(config, e.progress, now)
          }));
          return { status: 200, jsonBody: { ok: true, students: cards, readOnly } };
        }

        if (resource === "analytics") {
          const entries = await loadProgressEntries(container, classId, students);
          return { status: 200, jsonBody: { ok: true, analytics: analytics.buildAnalytics(config, entries, now), readOnly } };
        }

        return { status: 400, jsonBody: { ok: false, error: "resource غير معروف." } };
      }

      // ---- POST ----
      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      const action = String(body.action || "").trim().toLowerCase();
      const classId = String(body.classId || "").trim();
      if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
      const classroom = await loadClassroom(container, classId);
      if (!classroom) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };

      // Multi-project enrollment gate: every write here (project.reset included) requires the class
      // to be enrolled in 794589. Removing the 794589 link blocks these routes without touching the
      // class's stored 794589 snapshot/progress.
      if (!classHasProject(classroom, PROGRAM_CODE)) {
        return { status: 403, jsonBody: { ok: false, error: "الصف غير مسجَّل في مشروع 794589." } };
      }

      // Every write is blocked on an archived class (read-only history).
      if (normalizeClassStatus(classroom) === "archived") {
        return { status: 403, jsonBody: { ok: false, error: "الصف مؤرشف — المتابعة للقراءة فقط." } };
      }

      if (action === "project.reset") {
        // Wipes ONLY this class's Project-794589 data: its snapshot + every student progress blob.
        // The classroom and the student accounts are NOT touched. Next open re-seeds a fresh V2
        // snapshot with all stages not_started. Blocked on archived classes by the check above.
        const progressBlobs = await listBlobNames(container, progressPrefixFor(classId));
        for (const name of progressBlobs) await deleteBlob(container, name);
        await deleteBlob(container, classConfigName(classId));
        await recordAuditEvent(container, {
          actor: auth.user?.sub, action: "project.reset",
          targetType: "project-tracker", targetId: classId, targetLabel: classroom.name || "",
          details: { deletedProgressCount: progressBlobs.length }
        });
        return { status: 200, jsonBody: { ok: true, deletedProgressCount: progressBlobs.length } };
      }

      if (action === "program.activate") {
        const config = await ensureClassConfig(container, classroom);
        return { status: 200, jsonBody: { ok: true, template: config } };
      }

      if (action === "progress.update") {
        const studentId = String(body.studentId || "").trim();
        const stageId = String(body.stageId || "").trim();
        if (!studentId || !stageId) return { status: 400, jsonBody: { ok: false, error: "studentId وstageId مطلوبان." } };
        const config = await ensureClassConfig(container, classroom);
        const stage = (config.stages || []).find(s => s.stageId === stageId && s.active === true);
        if (!stage) return { status: 400, jsonBody: { ok: false, error: "المرحلة غير موجودة أو غير مفعّلة." } };

        let outcome = null;
        try {
          const written = await mutateJsonWithRetry(container, progressName(classId, studentId), current =>
            (outcome = applyProgressUpdate(current, {
              stageId, status: body.status, note: body.note, actor: auth.user?.sub, now,
              programCode: PROGRAM_CODE, classId, studentId
            })).doc
          );
          const summary = core.buildStudentSummary(config, written, now);
          if (outcome.statusChanged) {
            await recordAuditEvent(container, {
              actor: auth.user?.sub,
              action: outcome.toStatus === "approved" ? "project.stage.approve" : "project.stage.status_change",
              targetType: "project-stage", targetId: classId + "/" + studentId + "/" + stageId,
              targetLabel: stage.title, details: { fromStatus: outcome.fromStatus, toStatus: outcome.toStatus }
            });
          }
          if (outcome.noteChanged) {
            await recordAuditEvent(container, {
              actor: auth.user?.sub, action: "project.stage.note",
              targetType: "project-stage", targetId: classId + "/" + studentId + "/" + stageId, targetLabel: stage.title
            });
          }
          // Return the full set of derived fields the detail view shows, so the client can update
          // in place WITHOUT a second (expensive) resource=student round-trip.
          return {
            status: 200,
            jsonBody: {
              ok: true,
              summary,
              stage: { stageId, ...written.stages[stageId] },
              nextBookStage: core.getNextStage(config.stages, written, "book"),
              nextPacketTracerStage: core.getNextStage(config.stages, written, "packetTracer"),
              balance: core.getBalanceInsight(summary.bookProgress, summary.packetTracerProgress, config.config && config.config.balanceWarningThreshold),
              history: (written.history || []).slice(-20)
            }
          };
        } catch (e) {
          if (e && e.code === "NO_CHANGE") return { status: 200, jsonBody: { ok: true, noChange: true } };
          if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
          if (e && e.httpStatus) return { status: e.httpStatus, jsonBody: { ok: false, error: e.message } };
          throw e;
        }
      }

      if (action === "template.update") {
        const patch = body.template && typeof body.template === "object" ? body.template : {};
        try {
          const written = await mutateJsonWithRetry(container, classConfigName(classId), current => {
            const config = current || buildClassSnapshotFromDefault(classId, now);
            if (Array.isArray(patch.stages)) config.stages = patch.stages;
            if (Array.isArray(patch.groups)) config.groups = patch.groups;
            if (patch.trackWeights && typeof patch.trackWeights === "object") config.trackWeights = patch.trackWeights;
            if (patch.config && typeof patch.config === "object") config.config = { ...config.config, ...patch.config };
            config.updatedAt = now;
            return config;
          });
          await recordAuditEvent(container, {
            actor: auth.user?.sub, action: "project.template.update",
            targetType: "project-template", targetId: classId, targetLabel: classroom.name || ""
          });
          return { status: 200, jsonBody: { ok: true, template: written } };
        } catch (e) {
          if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
          throw e;
        }
      }

      return { status: 400, jsonBody: { ok: false, error: "إجراء غير معروف." } };
    } catch {
      return { status: 500, jsonBody: { ok: false, error: "تعذر تنفيذ عملية متابعة المشروع حاليًا." } };
    }
  }
});
