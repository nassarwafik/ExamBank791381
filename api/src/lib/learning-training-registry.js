// The ONE canonical mapping of the book's T-series trainings (تدريبات قصيرة, source page 791381-m02-l01-p08)
// to the REAL Exam Library items and to the module whose PUBLICATION releases them to a class. Shared by the
// learning-training API (student gate + teacher access) — the UI never carries its own copy; the content block
// carries only { trainingId, label, requiredModuleId } (metadata, no questions, no keys, no future titles).
//
// PROGRESSIVE RELEASE (PR #117): a student may open a training only when the course is assigned to the CURRENT
// persisted class and the training's required module is currently published to that class:
//   m01 published → T01 · m02 published → T02 · m07 published → T03 + T04 (hidden m07 → T03/T04 denied, titles
//   not disclosed). Teachers may review/solve any training regardless of class publication.
const { classHasLearningCourse, classCanSeeLearningModule } = require("./class-learning-materials");

const TRAININGS = [
  { trainingId: "T01", order: 1, label: "تدريب 1", title: "أساسيات الشبكات", courseId: "791381", requiredModuleId: "791381-m01" },
  { trainingId: "T02", order: 2, label: "تدريب 2", title: "أنظمة العد", courseId: "791381", requiredModuleId: "791381-m02" },
  { trainingId: "T03", order: 3, label: "تدريب 3", title: "عناوين IPv4 وصلاحية العنوان", courseId: "791381", requiredModuleId: "791381-m07" },
  { trainingId: "T04", order: 4, label: "تدريب 4", title: "العناوين الخاصة والعامة", courseId: "791381", requiredModuleId: "791381-m07" }
];
const clone = t => ({ ...t });

/** Every T-series training in book order (copies). */
function listLearningTrainings() { return TRAININGS.map(clone); }
/** One training (copy) or null for an unknown / empty id (trimmed, case-sensitive: "T01"). */
function findLearningTraining(trainingId) {
  const id = String(trainingId || "").trim();
  const t = id ? TRAININGS.find(x => x.trainingId === id) : null;
  return t ? clone(t) : null;
}
/** The progressive-release gate for a STUDENT of `classroom` (course assigned + required module published). */
function trainingAllowedForClass(classroom, training) {
  if (!training) return false;
  return classHasLearningCourse(classroom, training.courseId) && classCanSeeLearningModule(classroom, training.courseId, training.requiredModuleId);
}

module.exports = { listLearningTrainings, findLearningTraining, trainingAllowedForClass };
