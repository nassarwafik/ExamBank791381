#!/usr/bin/env node
// Tadris+ P11-A — mutation proof for one student account in more than one class (docs/enterprise-shared-enrollment-p11a.md): who may
// reach an assignment (a class of the student's, not archived), who sees a shared student (the class's own teacher only, that class's
// results only), who may change what (the teacher of a shared class removes the student from that class and nothing else; the owner
// enrolls), and the grading-safety guards (leaving a shared class, deleting the account, archiving the class, the roster index, the
// gradebook population and its archive, the submission's class). Same engine and rules as scripts/mutate-p5b3b.mjs: every mutated file
// is restored byte-for-byte (sha256 verified), a timeout is not a kill.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/shared-enrollment-p11a.test.js", "src/owner/OwnerSharedStudents.p11a.test.tsx", "src/students/sharedStudents.p11a.test.tsx"];
const ACCESS = "api/src/lib/student-class-access.js";
const ENROLL = "api/src/lib/shared-enrollment.js";
const ROSTER = "api/src/lib/class-roster-index.js";
const TR = "api/src/lib/teacher-transfer.js";
const MS = "api/src/functions/manage-students.js";
const OC = "api/src/functions/owner-classes.js";
const AR = "api/src/functions/assignment-results.js";
const SUB = "api/src/functions/student-submission.js";
const DASH = "api/src/functions/student-dashboard.js";
const UI_OWNER = "src/owner/OwnerClassRoster.tsx";
const UI_ROSTER = "src/students/RosterPane.tsx";
const UI_LIVE = "src/games/liveChallenge/liveSessionClient.ts";

export const MUTANTS = [
  // ── the student's reach ──
  { id: "P11A-M1", what: "a student reaches the assignment of a class they are not in", edits: [{ file: ACCESS, find: "  if (!shared.includes(classId)) return { denied: \"unavailable\" };", replace: "  if (false) return { denied: \"unavailable\" };" }] },
  { id: "P11A-M2", what: "an archived SHARED class stays open for the student", edits: [{ file: ACCESS, find: "  return archived(classroom) ? { denied: \"archived\" } : { assignment, classId, classroom };", replace: "  return { assignment, classId, classroom };" }] },
  { id: "P11A-M3", what: "an archived HOME class stays open once the student shares another class", edits: [{ file: ACCESS, find: "  if (classId === homeId) return archived(homeClass) ? { denied: \"archived\" } : { assignment, classId, classroom: homeClass };", replace: "  if (classId === homeId) return { assignment, classId, classroom: homeClass };" }] },
  { id: "P11A-M4", what: "the dashboard lists an archived shared class's assignments", edits: [{ file: DASH, find: "if(doc&&normalizeClassStatus(doc)!==\"archived\")sharedOpen.push({classId:id,doc})", replace: "if(doc)sharedOpen.push({classId:id,doc})" }] },
  { id: "P11A-M5", what: "the dashboard ignores the shared classes", edits: [{ file: DASH, find: "const openClassIds=[...(homeId&&!homeArchived?[homeId]:[]),...sharedOpen.map(x=>x.classId)];", replace: "const openClassIds=[...(homeId&&!homeArchived?[homeId]:[])];" }] },
  { id: "P11A-M6", what: "the submission is stamped with the student's home class, not the assignment's", edits: [{ file: SUB, find: "member={...student,classId:access.classId}", replace: "member={...student}" }] },
  // ── who sees a shared student ──
  { id: "P11A-M7", what: "a student shared ANYWHERE is listed in any class asked for", edits: [{ file: MS, find: "    if (classId && isStudentSharedIn(student, classId)) { result.push(sharedRow(student, classId)); continue; }", replace: "    if (classId && sharedClassIds(student).length) { result.push(sharedRow(student, classId)); continue; }" }] },
  { id: "P11A-M8", what: "any teacher opens the profile of a student who shares a class with SOMEONE", edits: [{ file: MS, find: "              viewClassId = sharedClassIds(subject).find(id => classIdAllowed(allowedClasses, id)) || \"\";", replace: "              viewClassId = sharedClassIds(subject)[0] || \"\";" }] },
  { id: "P11A-M9", what: "the shared row counts the other teacher's submissions", edits: [{ file: MS, find: "      if (sharedClassOf.has(cand.studentId) && String(submissions[i]?.classId || \"\") !== sharedClassOf.get(cand.studentId)) return;", replace: "      if (false) return;" }] },
  { id: "P11A-M10", what: "the gradebook leaves the shared student out", edits: [{ file: AR, find: "allUsers.filter(x=>isStudentInClass(x,a.classId)),out=[];", replace: "allUsers.filter(x=>isStudentInClass(x,a.classId)&&String(x.classId||\"\")===String(a.classId)),out=[];" }] },
  { id: "P11A-M11", what: "the teacher cannot act on the shared student's row (retry, extension)", edits: [{ file: AR, find: "&&!isStudentInClass(student,a.classId))return {error:{status:403,", replace: ")return {error:{status:403," }] },
  { id: "P11A-M12", what: "a student who left the class has no result archive", edits: [{ file: AR, find: "&&(movedAt(x)!==null||leftAt(x)!==null));", replace: "&&(movedAt(x)!==null));" }] },
  // ── who may change what ──
  { id: "P11A-M13", what: "a teacher removes a shared student from a class that is not theirs", edits: [{ file: MS, find: "        if (!isSafeId(userId) || !isSafeId(classId) || !(await classOk(classId))) return missing;", replace: "        if (!isSafeId(userId) || !isSafeId(classId)) return missing;" }] },
  { id: "P11A-M14", what: "the TEACHER's import preview offers another class's student to join", edits: [{ file: MS, find: "        if (enrollInto) {", replace: "        if (true) {" }] },
  { id: "P11A-M15", what: "the owner enrolls into an archived class", edits: [{ file: OC, find: "      if (normalizeClassStatus(classroom) === \"archived\") return reply(400, { ok: false, code: \"CLASS_ARCHIVED\", error: \"الصف مؤرشف. استعده أولًا لإضافة طلاب.\" });\n      const userIds =", replace: "      const userIds =" }] },
  { id: "P11A-M16", what: "an archived student is enrolled", edits: [{ file: ENROLL, find: "          if (cur.archived === true) throw new EnrollmentRefusal(409, \"STUDENT_ARCHIVED\",", replace: "          if (false) throw new EnrollmentRefusal(409, \"STUDENT_ARCHIVED\"," }] },
  { id: "P11A-M17", what: "a student already in the class is enrolled again (double membership)", edits: [{ file: ENROLL, find: "          if (String(cur.classId || \"\") === classId || sharedClassIds(cur).includes(classId)) throw new NoWrite();", replace: "          if (false) throw new NoWrite();" }] },
  { id: "P11A-M18", what: "the owner's transfer into a shared class keeps the shared entry (double membership)", edits: [{ file: TR, find: "    const shared = sharedClassIds(cur).includes(toClassId) ? { sharedClasses: sharedClassEntries(cur).filter(e => e.classId !== toClassId) } : {};", replace: "    const shared = {};" }] },
  { id: "P11A-M19", what: "the home teacher's move into a shared class keeps the shared entry", edits: [{ file: MS, find: "      dropSharedClass(current, targetClassId);\n", replace: "" }] },
  // ── grading safety ──
  { id: "P11A-M20", what: "a student with pending work leaves the shared class (pre-check dropped)", edits: [{ file: ENROLL, find: "  if (before > 0) throw new EnrollmentRefusal(409, \"PENDING_GRADING\", pendingMessage(before),", replace: "  if (false) throw new EnrollmentRefusal(409, \"PENDING_GRADING\", pendingMessage(before)," }] },
  { id: "P11A-M21", what: "an attempt started meanwhile does not put the student back (post-check dropped)", edits: [{ file: ENROLL, find: "  if (after > 0) {", replace: "  if (false) {" }] },
  { id: "P11A-M22", what: "the account is deleted while work awaits the teacher of a shared class", edits: [{ file: MS, find: "  if (operation === \"delete\") {\n    const shared = await pendingInSharedClasses(reader, student);", replace: "  if (false) {\n    const shared = await pendingInSharedClasses(reader, student);" }] },
  { id: "P11A-M23", what: "the roster index (count, class-archive guard, repair) ignores shared students", edits: [{ file: ROSTER, find: "    .filter(user => isStudentInClass(user, classId))", replace: "    .filter(user => isStudentInClass(user, classId) && String(user.classId || \"\") === String(classId))" }] },
  { id: "P11A-M24", what: "a delete leaves the id in the shared class's roster index", edits: [{ file: MS, find: "  for (const sharedId of sharedClassIds(fresh || student)) {", replace: "  for (const sharedId of []) {" }] },
  // ── the screens ──
  { id: "P11A-M25", what: "the owner's roster offers to MOVE a shared student from here", edits: [{ file: UI_OWNER, find: "{st.shared || moving?.userId === st.userId ? null :", replace: "{moving?.userId === st.userId ? null :" }] },
  { id: "P11A-M26", what: "the teacher's roster offers the account actions on a shared student", edits: [{ file: UI_ROSTER, find: "{student.shared ? <ActionMenu label=", replace: "{false ? <ActionMenu label=" }] },
  // (until P11-B this mutant was the messaging picker; since P11-B that picker offers shared students on purpose)
  { id: "P11A-M27", what: "the live-game lobby offers a shared student", edits: [{ file: UI_LIVE, find: "j.students.filter((s: { shared?: boolean }) => !s.shared) : [];", replace: "j.students : [];" }] }
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
console.log("\nP11-A: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
