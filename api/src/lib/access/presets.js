// Tadris+ P3-A — ready-made access presets (blueprint §5.4–§5.5). A preset is identified by { id, version }; a published version
// never changes. A revision points at one exact version, so changing a preset later is a NEW version that the owner rolls out to
// chosen teachers — never a silent mass change.
//
//   legacy-full                 = today's behaviour exactly (every teacher capability, nothing from platform.*). Applied
//                                 automatically only to identities that predate the Owner Console (owner decision D7).
//   full-teaching               = Teacher C. Owner decision D18 (revised): the owner creates and manages classes, so no
//                                 classes.class.create / classes.class.manage; a removed student is archived, so no
//                                 students.student.delete.
//   learning-ready-assignments  = Teacher B.
//   learning-only               = Teacher A.
// «read-only-observer» (§5.5) is only proposed; it is added when the owner decides to.
//   full-teaching v2 (Tadris+ P5-B4, owner direction §19.19: «المالك يقوم بانشاء الصفوف وايضا المعلم لديه القدرة») = v1 PLUS
//                                 classes.class.create / classes.class.manage (the teacher may also create and manage classes).
//                                 v1 stays exactly as published: teachers on it keep it until the owner moves them (one click on
//                                 the teacher's page); new teachers are offered the CURRENT version only (`current` below).
const { TEACHER_CAPABILITIES, isCapability, isOwnerOnly, unmetDependencies } = require("./capabilities");

const STUDENT_CARE = ["students.student.view", "students.student.create", "students.student.edit", "students.student.archive", "students.student.restore", "students.credential.reset"];
const LEARNING = ["learning.course.view", "learning.course.assign", "learning.module.release", "learning.progress.view"];
const APPEARANCE = ["appearance.theme.choose", "appearance.palette.choose", "appearance.density.choose", "appearance.layout.choose"];
const BASE = ["classes.class.view", ...STUDENT_CARE, ...LEARNING, "reports.widget.view", ...APPEARANCE, "audit.self.view"];
const NOT_IN_TEACHING = new Set(["classes.class.create", "classes.class.manage", "students.student.delete"]);
const NOT_IN_TEACHING_V2 = new Set(["students.student.delete"]);

const DEFINITIONS = [
  { id: "legacy-full", version: 1, label: "الوصول الحالي", description: "كل ما يستطيعه المعلم اليوم، كما هو. للحسابات التي سبقت لوحة المالك.", capabilities: [...TEACHER_CAPABILITIES] },
  { id: "full-teaching", version: 1, label: "تدريس كامل", description: "كل أدوات التدريس: البنك، ومنشئ الامتحانات، والواجبات، والرسائل، والألعاب، والتقارير. الصفوف ينشئها المالك، وحذف الطالب أرشفة.", capabilities: TEACHER_CAPABILITIES.filter(c => !NOT_IN_TEACHING.has(c)) },
  { id: "full-teaching", version: 2, label: "تدريس كامل مع إدارة الصفوف", description: "كل أدوات التدريس، ويستطيع المعلم أيضًا إنشاء صفوفه وتعديلها وأرشفتها، إلى جانب ما ينشئه المالك. حذف الطالب أرشفة.", capabilities: TEACHER_CAPABILITIES.filter(c => !NOT_IN_TEACHING_V2.has(c)) },
  {
    id: "learning-ready-assignments", version: 1, label: "التعلّم + الواجبات الجاهزة", description: "المقررات، والواجبات الجاهزة من المكتبة وتصحيحها، والرسائل، وتشغيل الألعاب. بلا منشئ امتحانات.",
    capabilities: [...BASE, "examLibrary.item.view", "examLibrary.item.preview", "examBank.collection.view", "assignments.assignment.view", "assignments.ready.assign", "assignments.schedule.set", "assignments.grading.grade", "assignments.results.release",
      "messages.inbox.read", "messages.direct.send", "messages.announcement.send", "messages.history.view", "games.catalog.view", "games.session.run", "games.results.view"]
  },
  { id: "learning-only", version: 1, label: "التعلّم فقط", description: "المقررات وتقدّم الطلاب وإدارة الطلاب. بلا امتحانات ولا واجبات ولا رسائل.", capabilities: [...BASE] }
];

const PRESETS = Object.freeze(DEFINITIONS.map(p => Object.freeze({ ...p, capabilities: Object.freeze([...new Set(p.capabilities)]) })));
const key = (id, version) => id + "@" + version;
const BY_KEY = new Map(PRESETS.map(p => [key(p.id, p.version), p]));

/** Whether a preset version is the CURRENT one of its id (no higher version exists). Superseded versions stay valid for the
 *  teachers already on them; the console offers only current versions to new choices. */
function isCurrentPreset(p) {
  return !PRESETS.some(x => x.id === p.id && x.version > p.version);
}

/** The preset version { id, version }, or null when it does not exist. */
function preset(id, version) {
  return BY_KEY.get(key(String(id), Number(version))) || null;
}

/** Self-check (also run by the tests): every preset uses known teacher capabilities only and meets every dependency. */
function presetProblems() {
  const out = [];
  for (const p of PRESETS) {
    for (const c of p.capabilities) if (!isCapability(c) || isOwnerOnly(c)) out.push(p.id + ": " + c);
    for (const u of unmetDependencies(p.capabilities)) out.push(p.id + ": " + u.capability + " needs " + u.requires);
  }
  return out;
}

const LEGACY_FULL = Object.freeze({ id: "legacy-full", version: 1 });

module.exports = {
  isCurrentPreset, PRESETS, LEGACY_FULL, preset, presetProblems };
