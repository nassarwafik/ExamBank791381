// Roadmap #7 — assignment archive/restore lifecycle (PURE helpers, no storage/IO).
//
// Deletion is archive-first: ACTIVE/DRAFT/PUBLISHED → ARCHIVED → RESTORE, with a separate, deliberately
// dangerous PURGE for permanent removal. Archiving only makes an assignment unavailable to students; it
// NEVER touches examSnapshot, timing, submissions, attempts, drafts or results. All new fields are
// additive so legacy documents (including a legacy status:"archived" with no metadata) load unchanged.

// The three canonical statuses. Anything unknown normalizes to "draft" (never auto-published).
function normalizeAssignmentStatus(assignment) {
  const s = assignment && assignment.status;
  if (s === "archived") return "archived";
  if (s === "published") return "published";
  return "draft";
}

// Archive: preserve the whole document, remember the prior draft/published state, stamp server metadata.
// Caller guarantees `now` (server ISO) and `actor`. Should only be applied to a non-archived assignment
// (the handler makes archive idempotent), so archivedFromStatus always captures a real prior status.
function applyAssignmentArchive(current, { actor, now, reason = "manual" } = {}) {
  const prior = normalizeAssignmentStatus(current);
  return {
    ...current,
    status: "archived",
    archivedAt: now,
    archivedBy: String(actor || ""),
    archivedFromStatus: prior === "archived" ? "draft" : prior,
    archiveReason: String(reason || "manual"),
    updatedAt: now
  };
}

// Restore: return to archivedFromStatus when it is a valid "draft"/"published"; a legacy archived doc with
// no valid prior status restores to "draft" (NEVER auto-published). Clears the archive metadata. Preserves
// everything else (submissions/results/active attempts are stored separately and untouched here).
function applyAssignmentRestore(current, { now } = {}) {
  const from = current && current.archivedFromStatus;
  const restored = (from === "published" || from === "draft") ? from : "draft";
  const next = { ...current, status: restored, updatedAt: now };
  delete next.archivedAt;
  delete next.archivedBy;
  delete next.archivedFromStatus;
  delete next.archiveReason;
  return next;
}

module.exports = { normalizeAssignmentStatus, applyAssignmentArchive, applyAssignmentRestore };
