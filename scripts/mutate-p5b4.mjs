#!/usr/bin/env node
// Tadris+ P5-B4 — mutation proof for: the owner adding students to a teacher's class (step-up, active teacher-owned class only, the
// preview never writes, the import retry key, the owner audit, the console's valid-rows-only import with one key), the teacher
// route's shared student functions and the P5-B2 missing-await fix (refusals and failures stay the route's own answers), and
// full-teaching v2 (class create / manage, still no permanent delete; the console offers current versions, keeps the teacher's own).
// Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/owner-students-p5b4.test.js", "api/tests/full-teaching-v2-p5b4.test.js", "api/tests/classroom-errors-p5b4.test.js", "api/tests/student-action-error-semantics-r29.test.js", "src/owner/OwnerClassStudents.p5b4.test.tsx"];
const OC = "api/src/functions/owner-classes.js";
const MS = "api/src/functions/manage-students.js";
const MC = "api/src/functions/manage-classrooms.js";
const PR = "api/src/lib/access/presets.js";
const WIZ = "src/owner/TeacherWizard.tsx";
const DET = "src/owner/OwnerTeacherDetails.tsx";
const UI = "src/owner/OwnerClassStudents.tsx";

export const MUTANTS = [
  { id: "P5B4-M1", what: "students are added without a recent step-up", edits: [{ file: OC, find: "    if (denial) return denial;", replace: "    if (false) return denial;" }] },
  { id: "P5B4-M2", what: "students are added to an archived class", edits: [{ file: OC, find: "if (normalizeClassStatus(classroom) === \"archived\") return reply(400, { ok: false, code: \"CLASS_ARCHIVED\"", replace: "if (false) return reply(400, { ok: false, code: \"CLASS_ARCHIVED\"" }] },
  { id: "P5B4-M3", what: "students are added to an unowned (pre-tenancy) class", edits: [{ file: OC, find: " || !(await teacherOf(container, String(classroom.ownerId || \"\"), deps))) return CLASS_NOT_FOUND();", replace: ") return CLASS_NOT_FOUND();" }] },
  { id: "P5B4-M4", what: "the owner's student changes are not in the owner audit", edits: [{ file: OC, find: "        await audit(container, { actor, ...ev, action: \"owner.\" + ev.action, details: { ...(ev.details || {}), accountId } });\n", replace: "" }] },
  { id: "P5B4-M5", what: "the preview creates the students", edits: [{ file: OC, find: "        if (action === \"preview-import\") {", replace: "        if (false) {" }] },
  { id: "P5B4-M6", what: "the owner's import ignores its retry key", edits: [{ file: OC, find: "{ importId: body.importId, visible: null, record, obs }", replace: "{ importId: \"\", visible: null, record, obs }" }] },
  { id: "P5B4-M7", what: "the teacher's create no longer awaits the shared function (a refusal escapes its 4xx answer)", edits: [{ file: MS, find: "        return await addStudentToClass(container, classroom, body,", replace: "        return addStudentToClass(container, classroom, body," }] },
  { id: "P5B4-M8", what: "the P5-B2 regression: the class edit is returned without await", edits: [{ file: MC, find: "      return await updateClassLabels(container, classId, body,", replace: "      return updateClassLabels(container, classId, body," }] },
  { id: "P5B4-M9", what: "the P5-B2 regression: the class lifecycle is returned without await", edits: [{ file: MC, find: "      return await changeClassLifecycle(container, classId, action,", replace: "      return changeClassLifecycle(container, classId, action," }] },
  { id: "P5B4-M10", what: "full-teaching v2 allows the permanent delete", edits: [{ file: PR, find: "const NOT_IN_TEACHING_V2 = new Set([\"students.student.delete\"]);", replace: "const NOT_IN_TEACHING_V2 = new Set([]);" }] },
  { id: "P5B4-M11", what: "full-teaching v2 cannot manage classes", edits: [{ file: PR, find: "const NOT_IN_TEACHING_V2 = new Set([\"students.student.delete\"]);", replace: "const NOT_IN_TEACHING_V2 = new Set([\"students.student.delete\", \"classes.class.manage\"]);" }] },
  { id: "P5B4-M12", what: "the wizard offers superseded preset versions", edits: [{ file: WIZ, find: "presets.filter(p => p.id !== \"legacy-full\" && p.current !== false)", replace: "presets.filter(p => p.id !== \"legacy-full\")" }] },
  { id: "P5B4-M13", what: "the access editor hides the teacher's own superseded version", edits: [{ file: DET, find: "catalog.presets.filter(p => p.current !== false || presetKey(p) === initialKey)", replace: "catalog.presets.filter(p => p.current !== false)" }] },
  { id: "P5B4-M14", what: "the console imports the duplicate / invalid rows too", edits: [{ file: UI, find: "    const payload = valid.map(r =>", replace: "    const payload = (preview || []).map(r =>" }] },
  { id: "P5B4-M15", what: "the console sends a new retry key on the step-up retry", edits: [{ file: UI, find: "ownerStudentsApi.import(token, classId, payload, importId)", replace: "ownerStudentsApi.import(token, classId, payload, newImportId())" }] }
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
console.log("\nP5-B4: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
