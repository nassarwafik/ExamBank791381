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

// Roadmap #26 — the ONE "reportable assessment" predicate for teacher HISTORY/REPORT surfaces (reports center,
// student profile). An assessment belongs to a class's academic record when students could actually have taken
// it: it is PUBLISHED, or it is ARCHIVED after having been published. A draft, and a draft that was archived
// ("deleted" — archive-first deletion since Roadmap #7), was never takeable and must never count as a
// missing/unsubmitted assessment. A legacy archived document with NO archivedFromStatus metadata is kept
// (unknown prior state; excluding it could hide real historical results — unchanged from prior behavior).
// Student-facing availability and the "current" teacher analytics intentionally use the narrower
// normalizeAssignmentStatus(a) === "published" (takeable NOW); this predicate is about the historical record.
function isReportableAssessment(assignment) {
  const status = normalizeAssignmentStatus(assignment);
  if (status === "published") return true;
  if (status === "archived") return assignment.archivedFromStatus !== "draft";
  return false;
}

// Reports R-6 (owner decision D-2) — WHEN an assessment was first published to its students. The server writes it once, at the
// first publication, as an ISO instant (Date#toISOString); it is additive, so a document written before this phase simply has
// none. Anything that is not such an instant — absent, empty, a number, an unparseable or date-only string — is NO stamp: ""
// (it is never read as a date of its own, and never makes an assessment disappear).
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
function publishedAtOf(assignment) {
  const v = assignment && assignment.publishedAt;
  return typeof v === "string" && ISO_INSTANT.test(v) && Number.isFinite(Date.parse(v)) ? v : "";
}

// Stamp the FIRST publication on a document that is being published: `now` when it carries no readable stamp, otherwise the
// stamp it has (unpublishing and publishing again never moves it). The caller applies it ONLY on a real transition to
// "published" — never to a document that already is published (an older published assessment keeps having no stamp: the server
// does not know when it was published and writes no guess). Mutates and returns `current`, like the handler's other edits.
function stampFirstPublication(current, now) {
  if (current && !publishedAtOf(current)) current.publishedAt = now;
  return current;
}

module.exports = { normalizeAssignmentStatus, applyAssignmentArchive, applyAssignmentRestore, isReportableAssessment, publishedAtOf, stampFirstPublication };
