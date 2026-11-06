// Tadris+ P3-A — the capability registry v1 (blueprint §5.2–§5.3). A capability is an ACTION on a TYPE of resource,
// named <module>.<resource>.<action>. This file is the one list: the resolver, the presets, revision validation, authorize() and
// the Owner Console all read it, and nothing outside it is a capability (an unknown name is refused, never ignored).
//
//   ownerOnly  — platform.* capabilities belong to the platform owner. They can never be granted to a teacher: a revision that
//                tries is refused when it is saved, and the resolver removes them from any teacher's effective set anyway.
//   requires   — dependencies (§5.3). A revision whose effective set breaks one is refused when it is saved — never corrected
//                silently — and refused again (fail closed) if such a revision is ever read back.
//
// Owner decision D18 (2026-11-01, revised): the owner creates classes; a teacher adds, edits, archives and restores students, and
// «حذف الطالب من قِبل المعلم يكون أرشفة تحفظ نتائجه». The permanent deletion of a student is therefore its own capability
// (students.student.delete), held by no teaching preset; the owner grants it explicitly.

const MODULE_LABEL = Object.freeze({
  classes: "الصفوف", students: "الطلاب", learning: "التعلّم", examLibrary: "مكتبة الامتحانات", examBank: "بنك الأسئلة",
  examBuilder: "منشئ الامتحانات", examGovernance: "حوكمة الامتحانات", assignments: "الواجبات", games: "الألعاب", messages: "الرسائل",
  reports: "التقارير", projects: "المشاريع", appearance: "المظهر", audit: "السجل", platform: "المنصة (للمالك)"
});

const LIST = [
  ["classes.class.view", "رؤية صفوفه"],
  ["classes.class.create", "إنشاء صف بنفسه"],
  ["classes.class.manage", "تعديل صفوفه وأرشفتها واستعادتها"],
  ["students.student.view", "رؤية طلابه"],
  ["students.student.create", "إضافة طالب"],
  ["students.student.edit", "تعديل بيانات طالب"],
  ["students.student.archive", "أرشفة طالب (تبقى نتائجه)"],
  ["students.student.restore", "استعادة طالب من الأرشيف"],
  ["students.student.delete", "حذف طالب نهائيًا"],
  ["students.student.import", "استيراد طلاب دفعة واحدة"],
  ["students.credential.reset", "إعادة تعيين كلمة مرور طالب"],
  ["students.student.move", "نقل طالب بين صفوفه"],
  ["learning.course.view", "رؤية المقررات المخوّلة ومعاينتها"],
  ["learning.course.assign", "إسناد مقرر لصف"],
  ["learning.module.release", "نشر الوحدات وإخفاؤها", ["learning.course.assign"]],
  ["learning.progress.view", "تقدّم القراءة لطلابه"],
  ["examLibrary.item.view", "قائمة مكتبة الامتحانات"],
  ["examLibrary.item.preview", "معاينة بلا مفاتيح إجابة"],
  ["examLibrary.item.viewKeys", "رؤية مفاتيح الإجابة"],
  ["examLibrary.item.copy", "نسخ عنصر إلى امتحاناته", ["examBuilder.exam.create"]],
  ["examLibrary.item.assign", "إسناد عنصر كواجب"],
  ["examBank.collection.view", "تصفّح مجموعات البنك"],
  ["examBank.question.select", "اختيار أسئلة لامتحان"],
  ["examBank.question.create", "إضافة أسئلته الخاصة"],
  ["examBank.question.edit", "تعديل أسئلته الخاصة"],
  ["examBank.import.use", "استيراد أسئلة (HTML / ملف / رابط)"],
  ["examBuilder.exam.create", "إنشاء امتحان"],
  ["examBuilder.exam.edit", "تعديل امتحان"],
  ["examBuilder.exam.save", "حفظ امتحان"],
  ["examBuilder.exam.publish", "نشر امتحان"],
  ["examBuilder.ai.use", "التأليف بالذكاء الاصطناعي"],
  ["examGovernance.exam.author", "حوكمة: تأليف"],
  ["examGovernance.exam.review", "حوكمة: مراجعة"],
  ["examGovernance.exam.approve", "حوكمة: اعتماد"],
  ["examGovernance.exam.publish", "حوكمة: نشر"],
  ["assignments.assignment.view", "رؤية الواجبات"],
  ["assignments.ready.assign", "إسناد واجب جاهز من المكتبة"],
  ["assignments.assignment.create", "إنشاء واجب من امتحاناته"],
  ["assignments.content.edit", "تعديل عنوان الواجب وتعليماته"],
  ["assignments.schedule.set", "تحديد بدء الواجب ونهايته"],
  ["assignments.grading.grade", "التصحيح"],
  ["assignments.results.release", "نشر النتائج"],
  ["games.catalog.view", "قائمة الألعاب"],
  ["games.session.run", "تشغيل لعبة لصف"],
  ["games.challenge.create", "إنشاء تحدٍّ"],
  ["games.results.view", "نتائج الألعاب"],
  ["messages.inbox.read", "قراءة الرسائل"],
  ["messages.direct.send", "إرسال رسالة مباشرة"],
  ["messages.announcement.send", "إرسال إعلان"],
  ["messages.history.view", "سجل الرسائل"],
  ["reports.widget.view", "لوحات التقارير"],
  ["reports.export.use", "تصدير التقارير"],
  ["reports.ai.use", "التقارير بالذكاء الاصطناعي"],
  ["projects.tracker.view", "رؤية متابعة المشاريع"],
  ["projects.tracker.manage", "إدارة متابعة المشاريع"],
  ["appearance.theme.choose", "اختيار السمة"],
  ["appearance.palette.choose", "اختيار لوحة الألوان"],
  ["appearance.density.choose", "اختيار الكثافة"],
  ["appearance.layout.choose", "اختيار التخطيط"],
  ["audit.self.view", "سجل عملياته"],
  ["platform.teachers.manage", "إدارة المعلمين"],
  ["platform.access.manage", "إدارة الصلاحيات"],
  ["platform.catalog.manage", "إدارة الكتالوج"],
  ["platform.assignmentLibrary.manage", "إدارة مكتبة الواجبات"],
  ["platform.audit.viewAll", "كل سجلات التدقيق"],
  ["platform.operations.run", "أدوات التشغيل"],
  ["platform.system.view", "حالة النظام"],
  ["platform.legacyData.assign", "إسناد البيانات القديمة"]
];

// Tadris+ P10-K (O11, owner decision §19.48) — RESERVED: a capability no route enforces yet. The Owner Console shows it «محجوزة»
// with this reason, and the owner's save refuses a NEW grant or deny of it (reservedAdditions): a choice that changes nothing is
// not offered as one. Reading a stored revision never looks at this, so no teacher is ever blocked by it. When a route starts to
// ask one of these, it leaves this list in that phase (the static guard api/tests/reserved-capabilities-p10k.test.js holds both
// directions: every other teacher capability is asked somewhere in the API, and a reserved one nowhere).
const RESERVED = Object.freeze({
  "examLibrary.item.copy": "النسخة تُفتح في المنشئ، والحفظ يحكمه «حفظ امتحان».",
  "examLibrary.item.assign": "يحكم الإسناد من المكتبة: «إسناد واجب جاهز من المكتبة».",
  "examBuilder.exam.publish": "النشر في حوكمة الامتحانات، بصلاحية «حوكمة: نشر».",
  "games.results.view": "لا عرض مستقلًا لنتائج الألعاب بعد.",
  "messages.history.view": "سجل الرسائل هو صندوق الرسائل نفسه: «قراءة الرسائل».",
  "reports.export.use": "التصدير يُبنى في المتصفح من تقرير يراه المعلم أصلًا: «لوحات التقارير»."
});

const NAME_RE = /^[a-z][A-Za-z]*\.[a-z][A-Za-z]*\.[a-z][A-Za-z]*$/;

const CAPABILITIES = Object.freeze(LIST.map(([id, label, requires = []]) => {
  const module = id.split(".")[0];
  const reserved = Object.prototype.hasOwnProperty.call(RESERVED, id);
  return Object.freeze({ id, module, moduleLabel: MODULE_LABEL[module], label, ownerOnly: module === "platform", requires: Object.freeze([...requires]), reserved, reservedNote: reserved ? RESERVED[id] : "" });
}));
const BY_ID = new Map(CAPABILITIES.map(c => [c.id, c]));

const isCapability = id => typeof id === "string" && BY_ID.has(id);
const capability = id => BY_ID.get(id) || null;
const isOwnerOnly = id => Boolean(BY_ID.get(id) && BY_ID.get(id).ownerOnly);
/** Every capability a teacher may ever hold (the registry minus platform.*), in registry order. */
const TEACHER_CAPABILITIES = Object.freeze(CAPABILITIES.filter(c => !c.ownerOnly).map(c => c.id));

/** The dependencies an effective set breaks: [{ capability, requires }] (empty = consistent). */
function unmetDependencies(set) {
  const has = set instanceof Set ? set : new Set(set);
  const out = [];
  for (const id of has) {
    const c = BY_ID.get(id);
    if (!c) continue;
    for (const r of c.requires) if (!has.has(r)) out.push({ capability: id, requires: r });
  }
  return out;
}

const isReserved = id => Boolean(BY_ID.get(id) && BY_ID.get(id).reserved);

/**
 * Tadris+ P10-K — the reserved entries a SAVE would add by the owner's own choice (empty = acceptable):
 *   a grant not already granted by the teacher's current revision (`parent`);
 *   a deny not already denied by it, unless a dependency forces it (one of its requirements is missing from the new effective set).
 * Removing an entry is always acceptable; `parent` is { grants, denies } of the current revision ({} for a new teacher).
 */
function reservedAdditions({ grants = [], denies = [] }, parent, effective) {
  const prev = { grants: new Set((parent && parent.grants) || []), denies: new Set((parent && parent.denies) || []) };
  const has = effective instanceof Set ? effective : new Set(effective || []);
  const forced = id => BY_ID.get(id).requires.some(r => !has.has(r));
  return [
    ...grants.filter(id => isReserved(id) && !prev.grants.has(id)),
    ...denies.filter(id => isReserved(id) && !prev.denies.has(id) && !forced(id))
  ];
}

module.exports = { CAPABILITIES, TEACHER_CAPABILITIES, MODULE_LABEL, NAME_RE, RESERVED, isCapability, capability, isOwnerOnly, isReserved, reservedAdditions, unmetDependencies };
