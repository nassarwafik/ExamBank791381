// SINGLE SOURCE OF TRUTH for which project(s) a classroom participates in.
//
// Modern schema: classroom.projectCodes: string[]  (authoritative once present, even when []).
// Legacy schema: classroom.programCode: "794589"    (used ONLY when projectCodes is absent).
//
// When projectCodes exists we do NOT union it with the legacy programCode — otherwise a project the
// teacher removed would silently come back.
const { isSupportedProject } = require("./registry");

function getClassProjectCodes(classroom) {
  if (!classroom) return [];
  if (Array.isArray(classroom.projectCodes)) return classroom.projectCodes.slice();
  const legacy = String(classroom.programCode || "").trim();
  return legacy ? [legacy] : [];
}

function classHasProject(classroom, projectCode) {
  return getClassProjectCodes(classroom).includes(String(projectCode || ""));
}

// The class's project codes filtered to those the registry supports (for iterating real projects).
function getSupportedClassProjectCodes(classroom) {
  return getClassProjectCodes(classroom).filter(isSupportedProject);
}

// Validates/normalizes an incoming projectCodes array: trims, drops empties, de-duplicates, and
// rejects any unsupported code. Throws { httpStatus:400 } on an unsupported code.
function normalizeProjectCodes(codes) {
  const seen = new Set();
  const out = [];
  for (const raw of (Array.isArray(codes) ? codes : [])) {
    const code = String(raw || "").trim();
    if (!code) continue;
    if (!isSupportedProject(code)) { const e = new Error("مشروع غير مدعوم: " + code); e.httpStatus = 400; throw e; }
    if (!seen.has(code)) { seen.add(code); out.push(code); }
  }
  return out;
}

module.exports = { getClassProjectCodes, classHasProject, getSupportedClassProjectCodes, normalizeProjectCodes };
