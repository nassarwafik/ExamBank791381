// Pure progress-document transitions for the Project 794589 tracker. Given the current progress
// blob (or null) and one update, returns the next document plus what changed - so the mutate
// callback stays deterministic and unit-testable, and history/audit are derived consistently.
const crypto = require("crypto");
const { STATUSES } = require("./project-794589-core");

function emptyProgress({ programCode, classId, studentId, now }) {
  return {
    schemaVersion: 1,
    programCode,
    classId,
    studentId,
    startedAt: now,
    updatedAt: now,
    stages: {},
    history: []
  };
}

// update: { stageId, status?, note?, actor, now, programCode, classId, studentId }
// Returns { doc, statusChanged, noteChanged, fromStatus, toStatus }.
function applyProgressUpdate(current, update) {
  const { stageId, actor, now } = update;
  const doc = current
    ? JSON.parse(JSON.stringify(current))
    : emptyProgress(update);
  if (!doc.stages) doc.stages = {};
  if (!Array.isArray(doc.history)) doc.history = [];
  if (!doc.startedAt) doc.startedAt = now;

  const prev = doc.stages[stageId] || { status: "not_started" };
  const fromStatus = STATUSES.includes(prev.status) ? prev.status : "not_started";
  const next = { ...prev };

  let statusChanged = false;
  let toStatus = fromStatus;
  if (update.status !== undefined) {
    if (!STATUSES.includes(update.status)) {
      const err = new Error("حالة المرحلة غير صحيحة.");
      err.httpStatus = 400;
      throw err;
    }
    toStatus = update.status;
    if (toStatus !== fromStatus) statusChanged = true;
    next.status = toStatus;
    if (toStatus === "approved") {
      next.approvedAt = now;
      next.approvedBy = actor || "";
    } else {
      // Leaving approved clears the approval stamp so it never counts as approved again.
      delete next.approvedAt;
      delete next.approvedBy;
    }
  } else if (!next.status) {
    next.status = fromStatus;
  }

  let noteChanged = false;
  if (update.note !== undefined) {
    const note = String(update.note);
    if (note !== (prev.note || "")) noteChanged = true;
    next.note = note;
  }

  if (!statusChanged && !noteChanged) {
    // Nothing to do - signal a no-op so the caller can avoid a pointless write/audit.
    const err = new Error("لا يوجد تغيير.");
    err.code = "NO_CHANGE";
    throw err;
  }

  next.updatedAt = now;
  doc.stages[stageId] = next;
  doc.updatedAt = now;

  if (statusChanged) {
    doc.history.push({
      eventId: crypto.randomUUID(),
      stageId,
      type: "status",
      fromStatus,
      toStatus,
      actor: actor || "",
      createdAt: now
    });
  }
  if (noteChanged) {
    // Record that the note changed, not its text (keep history free of free-text content).
    doc.history.push({
      eventId: crypto.randomUUID(),
      stageId,
      type: "note",
      actor: actor || "",
      createdAt: now
    });
  }

  return { doc, statusChanged, noteChanged, fromStatus, toStatus };
}

module.exports = { emptyProgress, applyProgressUpdate };
