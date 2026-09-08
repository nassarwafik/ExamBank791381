// SINGLE SOURCE OF TRUTH for which project(s) a classroom participates in.
//
// Modern schema: classroom.programCodes: string[]  (authoritative once present, even when []).
// Legacy schema: classroom.programCode: "794589"    (used ONLY when programCodes is absent).
//
// When programCodes exists we do NOT union it with the legacy programCode — otherwise a project the
// teacher removed would silently come back.
const { isSupportedProject } = require("./registry");

function getClassProgramCodes(classroom) {
  if (!classroom) return [];
  if (Array.isArray(classroom.programCodes)) return classroom.programCodes.slice();
  const legacy = String(classroom.programCode || "").trim();
  return legacy ? [legacy] : [];
}

function classHasProject(classroom, projectCode) {
  return getClassProgramCodes(classroom).includes(String(projectCode || ""));
}

// The class's project codes filtered to those the registry supports (for iterating real projects).
function getSupportedClassProgramCodes(classroom) {
  return getClassProgramCodes(classroom).filter(isSupportedProject);
}

// Normalizes an incoming programCodes array: trims, drops empties, de-duplicates. No validation, no
// throwing — a pure shape cleaner.
function normalizeProgramCodes(codes) {
  const seen = new Set();
  const out = [];
  for (const raw of (Array.isArray(codes) ? codes : [])) {
    const code = String(raw || "").trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

// Normalizes AND validates: every remaining code must be a registry-supported project, else throws
// { httpStatus:400 }. Returns the clean, valid array (empty array is allowed).
function validateProgramCodes(codes) {
  const normalized = normalizeProgramCodes(codes);
  for (const code of normalized) {
    if (!isSupportedProject(code)) { const e = new Error("مشروع غير مدعوم: " + code); e.httpStatus = 400; throw e; }
  }
  return normalized;
}

module.exports = { getClassProgramCodes, classHasProject, getSupportedClassProgramCodes, normalizeProgramCodes, validateProgramCodes };
