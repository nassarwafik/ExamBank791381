// The ONE canonical mapping of the book's Learning-Practice items — the T-series trainings (T01–T30) and the
// F-series final exams for training (F01–F06) — to the REAL Exam Library items and to the module whose
// PUBLICATION releases them to a class. Shared by the learning-training API (student gate + teacher access) — the
// UI never carries its own copy; the content block carries only { trainingId, label, requiredModuleId }
// (metadata, no questions, no keys, no titles). `title` here is the Exam Library catalog title (pinned equal by
// tests) so the API discloses the real library title only when the item is available to the caller.
//
// PROGRESSIVE RELEASE (PR #117): a student may open an item only when the course is assigned to the CURRENT
// persisted class and the item's required module is currently published to that class. The PAGE on which the
// book prints an item and the MODULE that releases it are separate concepts: `requiredModuleId` is the LATEST
// learning module needed to understand the item (T03/T04 are printed on PDF 22 but gated by m07; T05 is printed
// on PDF 106 but gated by m08; T14 on PDF 119 by m18; T18 on PDF 119 by m21; T23 on PDF 191 by m27; T24 on PDF 191
// by m06; T25/T26 — the comprehensive basic-section exams — by m24; T27–T30 and F01–F06 by m06). Teachers may
// review/solve any item regardless of class publication. Nothing here auto-publishes any module.
const { classHasLearningCourse, classCanSeeLearningModule } = require("./class-learning-materials");

const TRAININGS = [
  { trainingId: "T01", order: 1, label: "تدريب 1", title: "أساسيات الشبكات", courseId: "791381", requiredModuleId: "791381-m01" },
  { trainingId: "T02", order: 2, label: "تدريب 2", title: "أنظمة العد", courseId: "791381", requiredModuleId: "791381-m02" },
  { trainingId: "T03", order: 3, label: "تدريب 3", title: "عناوين IPv4 وصلاحية العنوان", courseId: "791381", requiredModuleId: "791381-m07" },
  { trainingId: "T04", order: 4, label: "تدريب 4", title: "العناوين الخاصة والعامة", courseId: "791381", requiredModuleId: "791381-m07" },
  // Reader position 98 (791381-m16-l05-p01, PDF 106): T05–T12 — each released by its own section's module.
  { trainingId: "T05", order: 5, label: "تدريب 5", title: "Class وSubnet وCIDR", courseId: "791381", requiredModuleId: "791381-m08" },
  { trainingId: "T06", order: 6, label: "تدريب 6", title: "أجهزة الشبكات", courseId: "791381", requiredModuleId: "791381-m09" },
  { trainingId: "T07", order: 7, label: "تدريب 7", title: "أشكال توصيل الشبكات", courseId: "791381", requiredModuleId: "791381-m10" },
  { trainingId: "T08", order: 8, label: "تدريب 8", title: "الكوابل وعنوان MAC", courseId: "791381", requiredModuleId: "791381-m11" },
  { trainingId: "T09", order: 9, label: "تدريب 9", title: "Unicast وMulticast وBroadcast", courseId: "791381", requiredModuleId: "791381-m12" },
  { trainingId: "T10", order: 10, label: "تدريب 10", title: "نماذج OSI وTCP/IP", courseId: "791381", requiredModuleId: "791381-m13" },
  { trainingId: "T11", order: 11, label: "تدريب 11", title: "البروتوكولات الأساسية", courseId: "791381", requiredModuleId: "791381-m14" },
  { trainingId: "T12", order: 12, label: "تدريب 12", title: "أوامر فحص الشبكة", courseId: "791381", requiredModuleId: "791381-m15" },
  // Reader position 110 (791381-m18-l03-p01, PDF 119): T13–T18.
  { trainingId: "T13", order: 13, label: "تدريب 13", title: "المجالات والمفاهيم", courseId: "791381", requiredModuleId: "791381-m16" },
  { trainingId: "T14", order: 14, label: "تدريب 14", title: "أمان الشبكات وتجزئة البيانات", courseId: "791381", requiredModuleId: "791381-m18" },
  { trainingId: "T15", order: 15, label: "تدريب 15", title: "برمجة السويتش وVLAN الأساسية", courseId: "791381", requiredModuleId: "791381-m03" },
  { trainingId: "T16", order: 16, label: "تدريب 16", title: "بروتوكول VTP", courseId: "791381", requiredModuleId: "791381-m19" },
  { trainingId: "T17", order: 17, label: "تدريب 17", title: "Trunk وdot1Q وRouter-on-a-Stick", courseId: "791381", requiredModuleId: "791381-m04" },
  { trainingId: "T18", order: 18, label: "تدريب 18", title: "DMZ وWi-Fi وIPv6 والمنافذ", courseId: "791381", requiredModuleId: "791381-m21" },
  // Reader position 145 (791381-m04-l03-p02, PDF 157): T19–T22.
  { trainingId: "T19", order: 19, label: "تدريب 19", title: "بروتوكول DHCP", courseId: "791381", requiredModuleId: "791381-m22" },
  { trainingId: "T20", order: 20, label: "تدريب 20", title: "Port Security وحماية Cisco", courseId: "791381", requiredModuleId: "791381-m24" },
  { trainingId: "T21", order: 21, label: "تدريب 21", title: "مرجع أوامر Cisco", courseId: "791381", requiredModuleId: "791381-m05" },
  { trainingId: "T22", order: 22, label: "تدريب 22", title: "الشبكات الواسعة WAN", courseId: "791381", requiredModuleId: "791381-m26" },
  // Reader position 178 (791381-m24-l03-p01, PDF 191): T23–T26 (T25/T26 are the comprehensive basic-section exams).
  { trainingId: "T23", order: 23, label: "تدريب 23", title: "بروتوكولات التوجيه", courseId: "791381", requiredModuleId: "791381-m27" },
  { trainingId: "T24", order: 24, label: "تدريب 24", title: "قوائم التحكم ACL", courseId: "791381", requiredModuleId: "791381-m06" },
  { trainingId: "T25", order: 25, label: "تدريب 25", title: "امتحان شامل للقسم الأساسي — A", courseId: "791381", requiredModuleId: "791381-m24" },
  { trainingId: "T26", order: 26, label: "تدريب 26", title: "امتحان شامل للقسم الأساسي — B", courseId: "791381", requiredModuleId: "791381-m24" },
  // Reader position 214 (791381-m06-l02-p01, PDF 228): T27–T30 (exam reviews).
  { trainingId: "T27", order: 27, label: "تدريب 27", title: "مراجعة امتحان 2021", courseId: "791381", requiredModuleId: "791381-m06" },
  { trainingId: "T28", order: 28, label: "تدريب 28", title: "مراجعة امتحان 2022", courseId: "791381", requiredModuleId: "791381-m06" },
  { trainingId: "T29", order: 29, label: "تدريب 29", title: "مراجعة امتحان 2023", courseId: "791381", requiredModuleId: "791381-m06" },
  { trainingId: "T30", order: 30, label: "تدريب 30", title: "مراجعة إضافية 2023", courseId: "791381", requiredModuleId: "791381-m06" },
  // Reader position 215 (791381-m06-l02-p02, PDF 229): F01–F06 «امتحانات نهائية للتدريب».
  { trainingId: "F01", order: 31, label: "الامتحان الأول", title: "نموذج A — 2025", courseId: "791381", requiredModuleId: "791381-m06" },
  { trainingId: "F02", order: 32, label: "الامتحان الثاني", title: "نموذج C — 2025", courseId: "791381", requiredModuleId: "791381-m06" },
  { trainingId: "F03", order: 33, label: "الامتحان الثالث", title: "نموذج D — 2025", courseId: "791381", requiredModuleId: "791381-m06" },
  { trainingId: "F04", order: 34, label: "الامتحان الرابع", title: "نموذج B — 2024", courseId: "791381", requiredModuleId: "791381-m06" },
  { trainingId: "F05", order: 35, label: "الامتحان الخامس", title: "بجروت صيف 2024", courseId: "791381", requiredModuleId: "791381-m06" },
  { trainingId: "F06", order: 36, label: "الامتحان السادس", title: "بجروت صيف 2025", courseId: "791381", requiredModuleId: "791381-m06" }
];
const clone = t => ({ ...t });

/** Every Learning-Practice item (T01–T30, F01–F06) in book order (copies). */
function listLearningTrainings() { return TRAININGS.map(clone); }
/** One item (copy) or null for an unknown / empty id (trimmed, case-sensitive: "T01", "F01"). */
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
