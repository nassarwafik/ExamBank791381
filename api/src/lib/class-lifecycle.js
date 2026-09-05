function normalizeClassStatus(classroom) {
  if (classroom?.status === "archived") return "archived";
  if (classroom?.active === false) return "archived";
  return "active";
}

function deriveGraduationYear(schoolYear) {
  const raw = String(schoolYear || "").trim();
  const match = raw.match(/^(\d{4})\s*[-–/]\s*(\d{4})$/);
  if (match) return match[2];
  return raw;
}

function applyClassLifecycleAction(current, action, { actor, now }) {
  if (action === "archive" || action === "graduateandarchive") {
    const next = {
      ...current,
      status: "archived",
      active: false,
      archivedAt: now,
      archivedBy: actor || "",
      archiveReason: action === "graduateandarchive" ? "graduated" : "manual",
      updatedAt: now
    };
    if (action === "graduateandarchive") {
      next.graduationYear = deriveGraduationYear(current?.schoolYear);
    }
    return next;
  }

  if (action === "unarchive") {
    const next = { ...current, status: "active", active: true, updatedAt: now };
    delete next.archivedAt;
    delete next.archivedBy;
    delete next.archiveReason;
    delete next.graduationYear;
    return next;
  }

  const err = new Error("Unsupported class lifecycle action.");
  err.httpStatus = 400;
  throw err;
}

module.exports = { normalizeClassStatus, deriveGraduationYear, applyClassLifecycleAction };
