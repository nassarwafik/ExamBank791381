#!/usr/bin/env node
// Tadris+ P11-C — mutation proof for the services of a shared class (docs/enterprise-shared-services-p11c.md): the ONE serving rule
// (open classes in order, home first; the first that has the thing serves it), that a shared class only ADDS (never overrides the
// home class, never merges), that an archived / left / third teacher's class gives nothing, whose games apply (the class's own
// teacher), the feed across classes, and that the teacher's analytics and reports count a shared student in the shared class and
// only there. Same engine and rules as scripts/mutate-p11a.mjs: every mutated file is restored byte-for-byte (sha256 verified), a
// timeout is not a kill.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/shared-services-p11c.test.js", "src/projects/StudentProjectPanel.p11c.test.tsx", "src/reports/ReportsCenter.ux6b.test.tsx", "src/students/sharedStudents.p11a.test.tsx"];
const LIB = "api/src/lib/student-classes.js";
const MAT = "api/src/functions/student-learning-materials.js";
const TRAIN = "api/src/functions/learning-training.js";
const CONTENT = "api/src/functions/learning-content.js";
const SPT = "api/src/functions/student-project-tracker.js";
const SP = "api/src/lib/project-tracker/student-projects.js";
const SVC = "api/src/lib/project-tracker/service.js";
const ATT = "api/src/lib/project-tracker/evaluation-attention.js";
const LCP = "api/src/functions/learning-class-progress.js";
const LIVE = "api/src/functions/game-live-session.js";
const LIVES = "api/src/functions/game-live-session-student.js";
const NUM = "api/src/functions/game-number-conversion.js";
const FEED = "api/src/functions/achievement-feed.js";
const TFEED = "api/src/functions/teacher-achievement-feed.js";
const AN = "api/src/lib/teacher-analytics-core.js";
const REP = "api/src/functions/reports.js";
const CENTER = "api/src/lib/notification-center.js";
const NOTIF = "api/src/functions/student-notifications.js";
const PANEL = "src/projects/StudentProjectPanel.tsx";
const RV = "src/reports/ReportViews.tsx";
const UI_LIVE = "src/games/liveChallenge/liveSessionClient.ts";

export const MUTANTS = [
  // ── the serving rule ──
  { id: "P11C-M1", what: "an archived shared class counts as an open class", edits: [{ file: LIB, find: "for (const s of shared) if (!s.archived) open.push(", replace: "for (const s of shared) open.push(" }] },
  { id: "P11C-M2", what: "the LAST open class that has the thing serves it (a shared class overrides the home class)", edits: [{ file: LIB, find: "return classes.open.find(c => has(c.classroom)) || null;", replace: "return [...classes.open].reverse().find(c => has(c.classroom)) || null;" }] },
  { id: "P11C-M3", what: "a class that attached a course but published nothing counts as offering it", edits: [{ file: LIB, find: "getVisibleLearningModuleIds(classroom, courseId).length > 0;", replace: "getVisibleLearningModuleIds(classroom, courseId).length >= 0;" }] },
  { id: "P11C-M4", what: "the learning routes get the home class whatever serves the course", edits: [{ file: LIB, find: "return serving ? serving.classroom : classes.home.classroom;", replace: "return classes.home.classroom;" }] },
  { id: "P11C-M5", what: "the student of a shared class keeps the HOME teacher's owner stamp", edits: [{ file: LIB, find: "  delete subject.ownerId;\n  if (classroom &&", replace: "  if (classroom &&" }] },
  // ── learning materials and trainings ──
  { id: "P11C-M6", what: "one learning route reads the home class on its own", edits: [{ file: CONTENT, find: "await classroomServing(sess.student, ", replace: "await (async (st, load) => load(\"platform/classes/\" + st.classId + \".json\"))(sess.student, " }] },
  { id: "P11C-M7", what: "a course both classes offer is listed from both", edits: [{ file: MAT, find: "buildStudentLearningMaterials(c.classroom).filter(m => !served.has(m.courseId));", replace: "buildStudentLearningMaterials(c.classroom);" }] },
  { id: "P11C-M8", what: "the materials list asks the home class only", edits: [{ file: MAT, find: "      for (const c of classes.open) {", replace: "      for (const c of classes.open.slice(0, 1)) {" }] },
  { id: "P11C-M9", what: "the trainings gate asks the home class only", edits: [{ file: TRAIN, find: "gateClasses = classes.open.map(c => c.classroom);", replace: "gateClasses = classes.open.slice(0, 1).map(c => c.classroom);" }] },
  { id: "P11C-M10", what: "a training is released by ANY class that publishes its module (not the class serving the course)", edits: [{ file: TRAIN, find: "gates.find(g => offersCourse(courseId)(g.classroom))", replace: "gates[gates.length - 1]" }] },
  { id: "P11C-M11", what: "the bell announces a shared class's module although another class serves the course", edits: [{ file: CENTER, find: "const serving = ctx.openClasses.find(c => offersCourse(ev.courseId)(c.classroom));", replace: "const serving = ctx.openClasses.find(c => c.classId === stream.key);" }] },
  { id: "P11C-M12", what: "the bell never announces a shared class's module", edits: [{ file: CENTER, find: "if (!serving || serving.classId !== stream.key) return null;", replace: "if (serving || !serving) return null;" }] },
  // ── projects ──
  { id: "P11C-M13", what: "a project both classes run is written in the LAST class", edits: [{ file: SPT, find: "if (!servedBy.has(code)) servedBy.set(code, c);", replace: "servedBy.set(code, c);" }] },
  { id: "P11C-M14", what: "a project both classes run is listed twice", edits: [{ file: SP, find: "getSupportedClassProgramCodes(c.classroom).filter(code => !served.has(code));", replace: "getSupportedClassProgramCodes(c.classroom);" }] },
  { id: "P11C-M15", what: "an archived home class's project hides the open shared class's", edits: [{ file: SPT, find: "if (classes.home.classroom && classes.home.archived) classList.push(", replace: "if (classes.home.classroom && classes.home.archived) classList.unshift(" }] },
  { id: "P11C-M16", what: "the project of an archived class is not marked read-only", edits: [{ file: SPT, find: "...(normalizeClassStatus(served) !== \"active\" ? { readOnly: true } : {}) } : {}),", replace: "} : {})," }] },
  { id: "P11C-M17", what: "the teacher's project roster (tracker, reports) leaves the shared student out", edits: [{ file: SVC, find: "  return isStudentInClass(user, classId);\n}", replace: "  return isStudentInClass(user, classId) && String(user.classId || \"\") === String(classId);\n}" }] },
  { id: "P11C-M18", what: "the project evaluation follow-up leaves the shared student out", edits: [{ file: ATT, find: "u.role === \"student\" && isStudentInClass(u, src.classId));", replace: "u.role === \"student\" && isStudentInClass(u, src.classId) && String(u.classId || \"\") === String(src.classId));" }] },
  { id: "P11C-M19", what: "the class reading of a course leaves the shared student out", edits: [{ file: LCP, find: "users.filter(u => isStudentInClass(u, classId) && u.active !== false);", replace: "users.filter(u => isStudentInClass(u, classId) && String(u.classId || \"\") === classId && u.active !== false);" }] },
  { id: "P11C-M20", what: "the class reading of a course lists whoever is in the class's index", edits: [{ file: LCP, find: "users.filter(u => isStudentInClass(u, classId) && u.active !== false);", replace: "users.filter(u => u && u.role === \"student\" && u.active !== false);" }] },
  // ── games ──
  { id: "P11C-M21", what: "a live room refuses the shared student", edits: [{ file: LIVE, find: "if (!isStudentInClass(user, classId) || user.active === false) {", replace: "if (!isStudentInClass(user, classId) || String(user.classId || \"\") !== classId || user.active === false) {" }] },
  { id: "P11C-M22", what: "a live room takes a student who is not of the class", edits: [{ file: LIVE, find: "if (!isStudentInClass(user, classId) || user.active === false) {", replace: "if (!user || user.active === false) {" }] },
  { id: "P11C-M23", what: "the shared student cannot enter the shared class's room", edits: [{ file: LIVES, find: "return !roomClassId || studentClassIds(auth.student).includes(roomClassId);", replace: "return !roomClassId || String(auth.student && auth.student.classId || \"\") === roomClassId;" }] },
  { id: "P11C-M24", what: "a student on the list enters a room of a class that is not theirs", edits: [{ file: LIVES, find: "return !roomClassId || studentClassIds(auth.student).includes(roomClassId);", replace: "return true;" }] },
  { id: "P11C-M25", what: "the shared class's room follows the HOME teacher's games", edits: [{ file: LIVES, find: "if (roomClassId && isStudentSharedIn(auth.student, roomClassId)) {", replace: "if (false) {" }] },
  { id: "P11C-M26", what: "the number game asks the home class only", edits: [{ file: NUM, find: "      for (const c of classes.open) {", replace: "      for (const c of classes.open.slice(0, 1)) {" }] },
  { id: "P11C-M27", what: "the number game asks every class with the HOME teacher's games", edits: [{ file: NUM, find: "c.home ? sess.student : studentOfClass(sess.student, c.classroom)", replace: "sess.student" }] },
  { id: "P11C-M28", what: "the number game opens although no teacher offers it", edits: [{ file: NUM, find: "      if (!offered) return firstDenial;\n", replace: "" }] },
  { id: "P11C-M29", what: "the games entry ignores the shared class's teacher", edits: [{ file: NOTIF, find: "if (!shared.archived) games = [...new Set([...games, ...offer.games])];", replace: "" }] },
  { id: "P11C-M30", what: "the games entry counts an archived shared class's teacher", edits: [{ file: NOTIF, find: "if (!shared.archived) games = [...new Set([...games, ...offer.games])];", replace: "games = [...new Set([...games, ...offer.games])];" }] },
  // ── the achievement feed ──
  { id: "P11C-M31", what: "the student's feed lists the home class only", edits: [{ file: FEED, find: "...classes.shared.filter(c => !c.archived).map(c => ({ classId: c.classId, archived: false, name: String(c.classroom.name || \"\") }))", replace: "" }] },
  { id: "P11C-M32", what: "the student's feed lists an archived shared class", edits: [{ file: FEED, find: "...classes.shared.filter(c => !c.archived).map(", replace: "...classes.shared.map(" }] },
  { id: "P11C-M33", what: "a reaction is looked for in the home feed only", edits: [{ file: FEED, find: "      for (const feed of feeds) {\n        const found", replace: "      for (const feed of feeds.slice(0, 1)) {\n        const found" }] },
  { id: "P11C-M34", what: "a post of an archived class takes a reaction", edits: [{ file: FEED, find: "        if (feed.archived) return { status: 403,", replace: "        if (false) return { status: 403," }] },
  { id: "P11C-M35", what: "a post is not marked with its class / its read-only state", edits: [{ file: FEED, find: "all.push(several ? { ...post, __feed: feed } : post);", replace: "all.push(post);" }] },
  { id: "P11C-M36", what: "the teacher's feed refuses the shared student's scope", edits: [{ file: TFEED, find: "if (!isStudentInClass(student, classId)) return missing(", replace: "if (!isStudentInClass(student, classId) || String(student.classId || \"\") !== classId) return missing(" }] },
  // ── analytics and reports ──
  { id: "P11C-M37", what: "analytics leave the shared student out of the shared class", edits: [{ file: AN, find: "    ...sharedClassIds(item).map(classId => ({ ...item, classId, archived: false, shared: true }))\n", replace: "" }] },
  { id: "P11C-M38", what: "analytics count the shared student in the HOME class twice (the shared row keeps the home class id)", edits: [{ file: AN, find: "({ ...item, classId, archived: false, shared: true })", replace: "({ ...item, archived: false, shared: true })" }] },
  { id: "P11C-M39", what: "a student of two classes of one teacher is counted twice", edits: [{ file: AN, find: "      activeStudents: scopedPeople.length,", replace: "      activeStudents: scopedStudents.length," }] },
  { id: "P11C-M40", what: "…and offered twice in the student picker", edits: [{ file: AN, find: "    students: (mode === \"student\" ? rosterStudents : scopedPeople)", replace: "    students: rosterStudents" }] },
  { id: "P11C-M41", what: "the student scope accepts a student of another class", edits: [{ file: AN, find: "String(item.userId || \"\") === requestedStudentId && String(item.classId || \"\") === requestedClassId) || null;", replace: "String(item.userId || \"\") === requestedStudentId) || null;" }] },
  { id: "P11C-M42", what: "the report gate lets any student through once a class is named", edits: [{ file: REP, find: "named.role === \"student\" && isStudentSharedIn(named, classId);", replace: "named.role === \"student\";" }] },
  { id: "P11C-M43", what: "the report gate refuses the shared student", edits: [{ file: REP, find: "if (!sharedHere && !(await studentAccessible(load, named, tenant)))", replace: "if (!(await studentAccessible(load, named, tenant)))" }] },
  { id: "P11C-M44", what: "the student report uses the named class without asking whether the student is in it", edits: [{ file: REP, find: "const rawClassId = classId && isStudentInClass(u, classId) ? classId : String(u.classId || \"\");", replace: "const rawClassId = classId ? classId : String(u.classId || \"\");" }] },
  { id: "P11C-M45", what: "the student report ignores the named class (always the home class)", edits: [{ file: REP, find: "const rawClassId = classId && isStudentInClass(u, classId) ? classId : String(u.classId || \"\");", replace: "const rawClassId = String(u.classId || \"\");" }] },
  // ── the screens ──
  { id: "P11C-M46", what: "the project card does not name the class", edits: [{ file: PANEL, find: "{project.className && <div><dt>الصف</dt>", replace: "{false && <div><dt>الصف</dt>" }] },
  { id: "P11C-M47", what: "an archived class's project is offered «أنجزتها» among open ones", edits: [{ file: PANEL, find: "readOnly={!!(load?.data?.readOnly || open.readOnly)}", replace: "readOnly={!!load?.data?.readOnly}" }] },
  { id: "P11C-M48", what: "the student report request does not name the class", edits: [{ file: RV, find: "...(filters.classId ? { classId: filters.classId } : {}) }", replace: "}" }] },
  { id: "P11C-M49", what: "the live-game lobby leaves the shared student out", edits: [{ file: UI_LIVE, find: "return Array.isArray(j.students) ? j.students : [];", replace: "return Array.isArray(j.students) ? j.students.filter((s: { shared?: boolean }) => !s.shared) : [];" }] }
];

const originals = new Map();
const restoreAll = () => {
  for (const [file, { buf, hash }] of originals) {
    writeFileSync(path.join(root, file), buf);
    if (sha(readFileSync(path.join(root, file))) !== hash) { console.error("RESTORE FAILED for " + file); process.exitCode = 3; }
  }
};
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { restoreAll(); process.exit(130); });
process.on("exit", restoreAll);

const only = process.argv[2] ? new Set(process.argv[2].split(",")) : null;
const results = [];
for (const m of MUTANTS.filter(x => !only || only.has(x.id))) {
  for (const e of m.edits) if (!originals.has(e.file)) { const buf = readFileSync(path.join(root, e.file)); originals.set(e.file, { buf, hash: sha(buf) }); }
  // Apply every edit to the ORIGINAL text of its file (several edits on one file are applied in sequence).
  const next = new Map();
  let invalid = "";
  for (const e of m.edits) {
    const source = next.get(e.file) ?? originals.get(e.file).buf.toString("utf8");
    const count = source.split(e.find).length - 1;
    if (count !== 1) { invalid = "INVALID (find matched " + count + "× in " + e.file + ")"; break; }
    next.set(e.file, source.replace(e.find, e.replace));
  }
  if (invalid) { results.push({ ...m, verdict: invalid }); console.log(m.id + " " + invalid); continue; }
  let verdict, killer = "";
  try {
    for (const [file, text] of next) writeFileSync(path.join(root, file), text);
    const run = spawnSync("npx", ["vitest", "run", ...TESTS], { cwd: root, encoding: "utf8", timeout: 600000 });
    if (run.error && run.error.code === "ETIMEDOUT") verdict = "TIMEOUT";
    else if (run.status === 0) verdict = "SURVIVED";
    else {
      const out = (run.stdout || "") + (run.stderr || "");
      const failed = out.match(/FAIL\s+(\S+)\s+>\s+([^\n]+)/);
      verdict = /Tests\s+\d+ failed/.test(out) ? "KILLED" : "ERROR (suite did not run)";
      killer = failed ? failed[1] + " > " + failed[2].trim() : "";
    }
  } finally {
    for (const file of next.keys()) {
      const { buf, hash } = originals.get(file);
      writeFileSync(path.join(root, file), buf);
      if (sha(readFileSync(path.join(root, file))) !== hash) { console.error("RESTORE FAILED for " + file); process.exit(3); }
    }
  }
  results.push({ ...m, verdict, killer });
  console.log(m.id + " " + verdict + " — " + m.what + (killer ? "\n    killed by: " + killer : ""));
}
const git = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
const status = git.stdout.trim();
console.log("\nP11-C: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
