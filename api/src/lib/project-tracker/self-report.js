// Phase P2 — student self-report: the student marks project stages they completed. Owner decision: a marked stage COUNTS
// IMMEDIATELY (it becomes `approved`, so progress / Strength move at once), carries no attachment, and stays visibly the
// student's own until the teacher confirms it (re-approval) or cancels it (any other status) — see
// project-794589-progress.applyProgressUpdate, the teacher-side writer.
//
// A self-reported entry is `{ status: "approved", approvedAt, approvedBy: <studentId>, selfReportedAt, selfReportedBy,
// selfReportedFrom }`. The student may:
//   • mark a stage that is not approved                        → approved + selfReported* (selfReportedFrom = old status)
//   • unmark a stage THEY marked that the teacher has not confirmed → back to selfReportedFrom, stamps removed
// The student can never touch a teacher-approved stage, a score or a note. Pure and deterministic; storage-free.
const crypto = require("crypto");
const { STATUSES } = require("../project-794589-core");
const { emptyProgress } = require("../project-794589-progress");

const isSelfReported = entry => !!entry && entry.status === "approved" && typeof entry.selfReportedAt === "string" && entry.selfReportedAt !== "";

/**
 * Applies ONE student decision to MANY stages of the student's progress document (one CAS round for the caller).
 * `stageIds` must already be filtered to stages active in the class snapshot. Returns { doc, results, changed } where
 * results[i] = { stageId, ok, changed, error? } in input order; error "teacher_approved" when the student tries to unmark
 * a stage the teacher approved. Throws a NO_CHANGE error when nothing changed (the caller skips the write).
 */
function applySelfReport(current, { stageIds, mark, studentId, now, programCode, classId }) {
  const doc = current ? JSON.parse(JSON.stringify(current)) : emptyProgress({ programCode, classId, studentId, now });
  if (!doc.stages || typeof doc.stages !== "object") doc.stages = {};
  if (!Array.isArray(doc.history)) doc.history = [];
  if (!doc.startedAt) doc.startedAt = now;
  const results = [];
  let changed = 0;
  for (const stageId of stageIds) {
    const prev = doc.stages[stageId] || { status: "not_started" };
    const fromStatus = STATUSES.includes(prev.status) ? prev.status : "not_started";
    let next = null;
    if (mark) {
      if (fromStatus !== "approved") {
        next = { ...prev, status: "approved", approvedAt: now, approvedBy: studentId, selfReportedAt: now, selfReportedBy: studentId, selfReportedFrom: fromStatus };
      }
    } else if (isSelfReported(prev)) {
      const back = STATUSES.includes(prev.selfReportedFrom) && prev.selfReportedFrom !== "approved" ? prev.selfReportedFrom : "not_started";
      next = { ...prev, status: back };
      for (const k of ["approvedAt", "approvedBy", "selfReportedAt", "selfReportedBy", "selfReportedFrom"]) delete next[k];
    } else if (fromStatus === "approved") {
      results.push({ stageId, ok: false, changed: false, error: "teacher_approved" });
      continue;
    }
    if (!next) { results.push({ stageId, ok: true, changed: false }); continue; }
    next.updatedAt = now;
    doc.stages[stageId] = next;
    doc.history.push({ eventId: crypto.randomUUID(), stageId, type: "status", fromStatus, toStatus: next.status, source: "student", actor: studentId, createdAt: now });
    results.push({ stageId, ok: true, changed: true, status: next.status });
    changed += 1;
  }
  if (!changed) { const err = new Error("لا يوجد تغيير."); err.code = "NO_CHANGE"; err.results = results; throw err; }
  doc.updatedAt = now;
  return { doc, results, changed };
}

module.exports = { applySelfReport, isSelfReported };
