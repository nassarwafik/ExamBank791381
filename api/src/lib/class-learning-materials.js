// SINGLE NORMALIZATION AUTHORITY for a classroom's learning materials (class assignment + module publication).
//
// Two distinct concepts live in ONE field so a class document stays small and self-describing:
//   * COURSE ASSIGNMENT  — the class uses book/course X          → an entry { courseId } exists
//   * MODULE PUBLICATION — which of X's modules students may see  → that entry's visibleModuleIds
//
// Canonical storage shape (authorization/delivery METADATA only — never lesson bodies, pages, blocks or PDF text):
//   classroom.learningMaterials = [ { courseId: "791381", visibleModuleIds: ["791381-m01", "791381-m02"] } ]
//
// DEFAULT-DENY: a missing / malformed field normalizes to [] (no course, nothing published). Nothing is ever
// assigned or published automatically — not by deploying new book content, not by registering a new module.
// Every consumer (class list, mutations, the student endpoint) goes through these helpers; nothing re-implements
// the normalization. `registry` is an injectable seam for tests (production callers pass nothing).
//
// This domain is INDEPENDENT of project membership (programCodes) and of exam assignments: the helpers here never
// read or write any other classroom field.

const defaultRegistry = require("./learning-materials-registry");

const FIELD = "learningMaterials";
const cleanId = value => String(value || "").trim();

/** The RAW stored entries (untrusted shape) — internal; consumers use the normalized getters. */
function rawEntries(classroom) {
  const raw = classroom && typeof classroom === "object" ? classroom[FIELD] : undefined;
  return Array.isArray(raw) ? raw : [];
}

/**
 * Normalized, canonical view: one entry per REGISTERED course (unknown courses are default-denied), duplicate
 * course entries merged (their published ids united — a teacher's publication is never silently lost by a
 * malformed document), visibleModuleIds trimmed / de-duplicated / filtered to the registry / in canonical order.
 * Entry order follows the registry's course order. Pure; never mutates the classroom.
 */
function getClassLearningMaterials(classroom, registry = defaultRegistry) {
  const merged = new Map();   // courseId -> Set(rawModuleIds)
  for (const entry of rawEntries(classroom)) {
    if (!entry || typeof entry !== "object") continue;
    const courseId = cleanId(entry.courseId);
    if (!courseId || !registry.findLearningCourse(courseId)) continue;
    if (!merged.has(courseId)) merged.set(courseId, new Set());
    const ids = Array.isArray(entry.visibleModuleIds) ? entry.visibleModuleIds : [];
    for (const id of ids) { const clean = cleanId(id); if (clean) merged.get(courseId).add(clean); }
  }
  const out = [];
  for (const course of registry.listLearningCourses()) {
    if (!merged.has(course.courseId)) continue;
    out.push({ courseId: course.courseId, visibleModuleIds: registry.canonicalizeLearningModuleIds(course.courseId, [...merged.get(course.courseId)]) });
  }
  return out;
}

/** The normalized entry for one course, or null when the class does not use that course. */
function getClassLearningCourse(classroom, courseId, registry = defaultRegistry) {
  const id = cleanId(courseId);
  return getClassLearningMaterials(classroom, registry).find(e => e.courseId === id) || null;
}

/** Whether the course is attached to the class (even with zero published modules). */
function classHasLearningCourse(classroom, courseId, registry = defaultRegistry) {
  return getClassLearningCourse(classroom, courseId, registry) !== null;
}

/** The module ids of a course that are CURRENTLY student-visible, canonical order ([] when not attached). */
function getVisibleLearningModuleIds(classroom, courseId, registry = defaultRegistry) {
  const entry = getClassLearningCourse(classroom, courseId, registry);
  return entry ? entry.visibleModuleIds.slice() : [];
}

/** Whether students of this class may see one specific module (attached course + published + registry-known). */
function classCanSeeLearningModule(classroom, courseId, moduleId, registry = defaultRegistry) {
  return getVisibleLearningModuleIds(classroom, courseId, registry).includes(cleanId(moduleId));
}

/**
 * Pure mutation: attach the course if needed and set its published modules (already VALIDATED + canonical ids —
 * callers validate through the registry first). Returns a NEW classroom object; every other field, including any
 * other course entry, is preserved untouched. The stored field is rewritten in canonical shape.
 */
function setClassLearningCourseModules(classroom, courseId, canonicalModuleIds, registry = defaultRegistry) {
  const id = cleanId(courseId);
  const others = getClassLearningMaterials(classroom, registry).filter(e => e.courseId !== id);
  const next = [...others, { courseId: id, visibleModuleIds: registry.canonicalizeLearningModuleIds(id, canonicalModuleIds) }];
  // keep registry course order in storage too (deterministic documents)
  const rank = new Map(registry.listLearningCourses().map((c, i) => [c.courseId, i]));
  next.sort((a, b) => (rank.get(a.courseId) ?? 1e9) - (rank.get(b.courseId) ?? 1e9));
  return { ...classroom, [FIELD]: next };
}

/**
 * Pure mutation: detach a course from the class (its publication list goes with it). Idempotent — removing a
 * course that is not attached returns an equal document with `changed:false`. Stale/unknown stored entries for
 * that courseId are cleaned as well. Nothing else on the classroom is touched.
 */
function removeClassLearningCourse(classroom, courseId, registry = defaultRegistry) {
  const id = cleanId(courseId);
  const before = rawEntries(classroom);
  const hadAny = before.some(e => e && typeof e === "object" && cleanId(e.courseId) === id);
  const next = getClassLearningMaterials({ [FIELD]: before.filter(e => !(e && typeof e === "object" && cleanId(e.courseId) === id)) }, registry);
  return { classroom: { ...classroom, [FIELD]: next }, changed: hadAny };
}

/**
 * The SAFE student catalog for a class: only attached courses with at least one published module, each carrying
 * ONLY its published modules (id, title, order) in canonical order. Hidden modules, their titles, their count and
 * skeleton modules never appear. Pure registry filtering — no storage, no bodies.
 */
function buildStudentLearningMaterials(classroom, registry = defaultRegistry) {
  const out = [];
  for (const entry of getClassLearningMaterials(classroom, registry)) {
    if (!entry.visibleModuleIds.length) continue;
    const course = registry.findLearningCourse(entry.courseId);
    if (!course) continue;
    const visible = new Set(entry.visibleModuleIds);
    out.push({ courseId: course.courseId, title: course.title, modules: course.modules.filter(m => visible.has(m.moduleId)).map(m => ({ moduleId: m.moduleId, title: m.title, order: m.order })) });
  }
  return out;
}

module.exports = {
  LEARNING_MATERIALS_FIELD: FIELD,
  getClassLearningMaterials, getClassLearningCourse, classHasLearningCourse, getVisibleLearningModuleIds, classCanSeeLearningModule,
  setClassLearningCourseModules, removeClassLearningCourse, buildStudentLearningMaterials
};
