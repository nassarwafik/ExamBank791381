#!/usr/bin/env node
// Tadris+ P5-A1 — mutation proof for course entitlements (blueprint §10, owner decisions §19.13): the catalog status (fail-closed
// reading, archive everywhere), the per-teacher narrowing (enforce only, fail closed on an unreadable mode / revision, lists too),
// the class owner (D15, pre-tenancy data → t_legacy), the course decision in every learning route (teacher and student), the history
// rule (reads of the student's own progress / notes stay), the class release, the revision rules and the owner API.
// Same engine and rules as scripts/mutate-p1a.mjs (byte-for-byte, hash-verified restore after every mutant).
// Not run as a mutant: narrowing an identity that predates the console (`user.am !== "managed"`) — equivalent: such a session
// resolves to legacy-full, whose courses are null (every published course), as pinned by a test.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/course-entitlements-p5a.test.js", "api/tests/access-registry-p3a.test.js"];
const CA = "api/src/lib/access/course-access.js";
const CONTENT = "api/src/functions/learning-content.js";
const STUDY = "api/src/functions/learning-study.js";
const EXAM = "api/src/functions/learning-exam-item.js";
const TRAIN = "api/src/functions/learning-training.js";
const PROGRESS = "api/src/functions/learning-progress.js";
const NOTES = "api/src/functions/learning-annotations.js";
const CATALOG = "api/src/functions/learning-materials-catalog.js";
const MATERIALS = "api/src/functions/student-learning-materials.js";
const CLASSES = "api/src/functions/manage-classrooms.js";
const REV = "api/src/lib/access/revisions.js";
const OA = "api/src/functions/owner-access.js";
const RES = "api/src/lib/access/resolver.js";

export const MUTANTS = [
  { id: "P5A-M1", what: "a catalog document that cannot be understood counts as published", edits: [{ file: CA, find: "STATUSES.includes(doc.status) ? doc.status : \"archived\";", replace: "STATUSES.includes(doc.status) ? doc.status : \"published\";" }] },
  { id: "P5A-M2", what: "an archived course stays open", edits: [{ file: CA, find: "  if ((await readCourseStatus(container, courseId, deps)) !== \"published\") return { ok: false, code: \"COURSE_ARCHIVED\" };", replace: "  if (false) return { ok: false, code: \"COURSE_ARCHIVED\" };" }] },
  { id: "P5A-M3", what: "the entitlement is ignored", edits: [{ file: CA, find: "  if (list !== null && !list.includes(courseId)) return { ok: false, code: \"COURSE_NOT_ENTITLED\" };", replace: "  if (false) return { ok: false, code: \"COURSE_NOT_ENTITLED\" };" }] },
  { id: "P5A-M4", what: "the narrowing applies outside enforce", edits: [{ file: CA, find: "  try { return (await readAccessMode(container, deps)).mode === \"enforce\"; } catch { return true; }", replace: "  try { await readAccessMode(container, deps); return true; } catch { return true; }" }] },
  { id: "P5A-M5", what: "an unreadable mode opens everything", edits: [{ file: CA, find: "  try { return (await readAccessMode(container, deps)).mode === \"enforce\"; } catch { return true; }", replace: "  try { return (await readAccessMode(container, deps)).mode === \"enforce\"; } catch { return false; }" }] },
  { id: "P5A-M6", what: "the student's class owner is ignored", edits: [{ file: CA, find: "  let owner = classroom && typeof classroom.ownerId === \"string\" && classroom.ownerId ? classroom.ownerId : null;", replace: "  let owner = null;" }] },
  { id: "P5A-M7", what: "D15 broken: a suspended teacher's students lose everything", edits: [{ file: CA, find: "  if (!account) return null;                                            // the shared-password workspace not imported: today's access\n", replace: "  if (!account) return null;\n  if (account.status !== \"active\") return [];\n" }] },
  { id: "P5A-M8", what: "pre-tenancy data no longer follows the imported workspace", edits: [{ file: CA, find: "  if (!owner) owner = legacyDataOwner(env) || LEGACY_TEACHER_ACCOUNT_ID;", replace: "  if (!owner) owner = legacyDataOwner(env);" }] },
  { id: "P5A-M9", what: "a failure opens the course", edits: [{ file: CA, find: "const safely = async fn => { try { return await fn(); } catch { return { ok: false, code: \"COURSE_ACCESS_UNAVAILABLE\" }; } };", replace: "const safely = async fn => { try { return await fn(); } catch { return { ok: true }; } };" }] },
  { id: "P5A-M10", what: "a failure opens every course of a list", edits: [{ file: CA, find: "  try { list = await entitled(); } catch { return []; }", replace: "  try { list = await entitled(); } catch { list = null; }" }] },
  { id: "P5A-M11", what: "the teacher's content bypass is back", edits: [{ file: CONTENT, find: "      if (!course.ok) return course.code === \"COURSE_UNKNOWN\" ? NOT_FOUND : courseRefusal(course, { teacher: true });", replace: "      if (false) return course.code === \"COURSE_UNKNOWN\" ? NOT_FOUND : courseRefusal(course, { teacher: true });" }] },
  { id: "P5A-M12", what: "the student's content ignores the course decision", edits: [{ file: CONTENT, find: "      if (!course.ok) return courseRefusal(course);", replace: "      if (false) return courseRefusal(course);" }] },
  { id: "P5A-M13", what: "study ignores the teacher's course decision", edits: [{ file: STUDY, find: "      if (!course.ok) return course.code === \"COURSE_UNKNOWN\" ? NOT_FOUND : courseRefusal(course, { teacher: true });", replace: "      if (false) return NOT_FOUND;" }] },
  { id: "P5A-M14", what: "study ignores the class's course decision", edits: [{ file: STUDY, find: "      if (!course.ok) return courseRefusal(course);", replace: "      if (false) return courseRefusal(course);" }] },
  { id: "P5A-M15", what: "the item preview ignores the teacher's course decision", edits: [{ file: EXAM, find: "      if (!course.ok) return course.code === \"COURSE_UNKNOWN\" ? NOT_FOUND : courseRefusal(course, { teacher: true });", replace: "      if (false) return NOT_FOUND;" }] },
  { id: "P5A-M16", what: "the item ignores the class's course decision", edits: [{ file: EXAM, find: "      if (!course.ok) return courseRefusal(course);", replace: "      if (false) return courseRefusal(course);" }] },
  { id: "P5A-M17", what: "trainings ignore their courses", edits: [{ file: TRAIN, find: "trainingReleases(t).some(r => okCourses.includes(r.courseId) &&", replace: "trainingReleases(t).some(r => true &&" }] },
  { id: "P5A-M18", what: "new progress is not gated", edits: [{ file: PROGRESS, find: "    if (method !== \"GET\") {", replace: "    if (false) {" }] },
  { id: "P5A-M19", what: "the student's own notes become unreadable", edits: [{ file: NOTES, find: "    if (method !== \"GET\") {", replace: "    if (true) {" }] },
  { id: "P5A-M20", what: "the teacher catalog is unfiltered", edits: [{ file: CATALOG, find: "courses: all.filter(c => allowed.has(c.courseId))", replace: "courses: all" }] },
  { id: "P5A-M21", what: "the student's materials are unfiltered", edits: [{ file: MATERIALS, find: "materials: materials.filter(m => allowed.has(m.courseId))", replace: "materials" }] },
  { id: "P5A-M22", what: "a course can be released to a class without the decision", edits: [{ file: CLASSES, find: "      if (!courseDecision.ok) return courseRefusal(courseDecision, { teacher: true });", replace: "      if (false) return courseRefusal(courseDecision, { teacher: true });" }] },
  { id: "P5A-M23", what: "an unknown course is accepted in a revision", edits: [{ file: REV, find: "      if (unknown.length) return { ok: false, code: \"COURSE_UNKNOWN\"", replace: "      if (false) return { ok: false, code: \"COURSE_UNKNOWN\"" }] },
  { id: "P5A-M24", what: "a duplicated course is accepted", edits: [{ file: REV, find: "      if (new Set(r.courses).size !== r.courses.length) return { ok: false, code: \"COURSE_DUPLICATE\" };", replace: "      if (false) return { ok: false, code: \"COURSE_DUPLICATE\" };" }] },
  { id: "P5A-M25", what: "another resource key is accepted", edits: [{ file: REV, find: "Object.keys(r).some(k => k !== \"courses\")", replace: "false" }] },
  { id: "P5A-M26", what: "a restore drops the courses", edits: [{ file: OA, find: "resources: resourcesOf(coursesOf(target))", replace: "resources: {}" }] },
  { id: "P5A-M27", what: "assign drops the courses", edits: [{ file: OA, find: "resources: resourcesOf(body.courses), reason: body.reason", replace: "resources: {}, reason: body.reason" }] },
  { id: "P5A-M28", what: "the resolver loses the courses", edits: [{ file: RES, find: "capabilities: [...entry.capabilities], courses: entry.courses ? [...entry.courses] : null };", replace: "capabilities: [...entry.capabilities], courses: null };" }] }
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
console.log("\nP5-A1: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
