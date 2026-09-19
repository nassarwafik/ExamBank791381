// SERVER-AUTHORITATIVE registry of the learning materials a teacher may publish to a class.
//
// This is the ONLY list the API trusts for course/module ids arriving from the browser (the React catalog is a
// convenience, never an authority). It contains exactly the PRODUCTION-APPROVED, fully converted modules of each
// book — never skeleton-only modules (791381: m03–m06 have no student content yet, so they are absent here and
// can neither be published nor become student-visible).
//
// ORDER is the explicit content order of the book (module `order` in the frontend manifest), NEVER a lexical
// sort of ids: m07 («عناوين IP») is the book's Unit 3 and reads after m02 even though its id is not m03; m08–m10
// are Units 4–6 (orders 4–6), m11–m12 are Units 7–8 (orders 7–8) and m13 is the Batch-3 section «نماذج الاتصال»
// (order 9).
//
// FUTURE CONTENT ONBOARDING RULE: when a new unit is converted and approved, the developer appends its module
// here (id, title, order). That alone makes it PUBLISHABLE (the teacher sees it as «مخفي عن الطلاب»); it is
// NEVER appended to any class's visibleModuleIds automatically — the teacher publishes it explicitly.
// DEPLOYMENT ≠ PUBLICATION.
//
// No page bodies, lesson bodies, answer keys or PDF text live here: identity + title + order only.

const COURSES = [
  {
    courseId: "791381",
    title: "شبكات الاتصال",
    subject: "أنظمة محوسبة",
    modules: [
      { moduleId: "791381-m01", title: "أساسيات الشبكات", order: 1 },
      { moduleId: "791381-m02", title: "الأعداد والموازين", order: 2 },
      { moduleId: "791381-m07", title: "عناوين IP", order: 3 },
      // Units 4–6 phase: publishable (the teacher sees them as «مخفي عن الطلاب»); NEVER auto-published to any class.
      { moduleId: "791381-m08", title: "Class و Subnet و CIDR", order: 4 },
      { moduleId: "791381-m09", title: "أجهزة الشبكات", order: 5 },
      { moduleId: "791381-m10", title: "أنواع شبكات الاتصال", order: 6 },
      // Units 7–8 phase: publishable (the teacher sees them as «مخفي عن الطلاب»); NEVER auto-published to any class.
      { moduleId: "791381-m11", title: "الكوابل وعنوان MAC", order: 7 },
      { moduleId: "791381-m12", title: "أنواع الرسائل", order: 8 },
      // Batch 3 phase: publishable (the teacher sees it as «مخفي عن الطلاب»); NEVER auto-published to any class.
      { moduleId: "791381-m13", title: "نماذج الاتصال: OSI و TCP/IP", order: 9 }
    ]
  }
];

const byOrderThenId = (a, b) => a.order - b.order || (a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0);
const cloneModule = m => ({ moduleId: m.moduleId, title: m.title, order: m.order });
const cloneCourse = c => ({ courseId: c.courseId, title: c.title, subject: c.subject, modules: c.modules.slice().sort(byOrderThenId).map(cloneModule) });
const cleanId = value => String(value || "").trim();

/** Every publishable course with its releasable modules in canonical order. Pure; returns fresh copies. */
function listLearningCourses() {
  return COURSES.map(cloneCourse);
}

/** One course (copy) or null when the id is unknown / empty. Pure. */
function findLearningCourse(courseId) {
  const id = cleanId(courseId);
  const course = id ? COURSES.find(c => c.courseId === id) : null;
  return course ? cloneCourse(course) : null;
}

/** The releasable modules of a course in canonical order ([] for an unknown course). Pure. */
function listLearningModules(courseId) {
  const course = findLearningCourse(courseId);
  return course ? course.modules : [];
}

/** One module (copy) of a course, or null when the course or module is unknown. Pure. */
function findLearningModule(courseId, moduleId) {
  const id = cleanId(moduleId);
  return listLearningModules(courseId).find(m => m.moduleId === id) || null;
}

/**
 * Canonicalize module ids against the registry WITHOUT throwing: trims, drops empties/unknowns/duplicates and
 * returns the survivors in canonical (registry) order — never in the order they arrived. Used for everything
 * that reads STORAGE (a stale or hand-edited id must never surface). [] in → [] out; unknown course → [].
 */
function canonicalizeLearningModuleIds(courseId, moduleIds) {
  const wanted = new Set((Array.isArray(moduleIds) ? moduleIds : []).map(cleanId).filter(Boolean));
  return listLearningModules(courseId).filter(m => wanted.has(m.moduleId)).map(m => m.moduleId);
}

/**
 * Validate ids arriving from a REQUEST: the course must be registered and every non-empty id must be one of its
 * releasable modules, else throws { httpStatus: 400 }. Returns the deduplicated ids in canonical order
 * ([] is valid: the course stays attached with nothing released).
 */
function validateLearningModuleIds(courseId, moduleIds) {
  const course = findLearningCourse(courseId);
  if (!course) { const e = new Error("مادة تعليمية غير مدعومة."); e.httpStatus = 400; throw e; }
  if (moduleIds !== undefined && moduleIds !== null && !Array.isArray(moduleIds)) { const e = new Error("قائمة الفصول غير صالحة."); e.httpStatus = 400; throw e; }
  const known = new Set(course.modules.map(m => m.moduleId));
  for (const raw of (moduleIds || [])) {
    const id = cleanId(raw);
    if (!id) continue;
    if (!known.has(id)) { const e = new Error("فصل غير مدعوم: " + id); e.httpStatus = 400; throw e; }
  }
  return canonicalizeLearningModuleIds(courseId, moduleIds);
}

module.exports = { listLearningCourses, findLearningCourse, listLearningModules, findLearningModule, canonicalizeLearningModuleIds, validateLearningModuleIds };
