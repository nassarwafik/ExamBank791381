#!/usr/bin/env node
// Tadris+ P5-B1 — mutation proof for the student permissions: `update` needs students.student.move to change a class and
// students.credential.reset to set a password (fail-first defects), and the teacher's boundaries pinned by acceptance test 10
// (own classes only for create / edit / move; another teacher's student answered like a missing one).
// Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/student-scope-p5b1.test.js"];
const ST = "api/src/functions/manage-students.js";

export const MUTANTS = [
  { id: "P5B1-M1", what: "an edit may change the class without students.student.move", edits: [{ file: ST, find: "        if (newClassId !== String(student.classId || \"\")) {\n          const capabilityDenial", replace: "        if (false) {\n          const capabilityDenial" }] },
  { id: "P5B1-M2", what: "an edit may set a password without students.credential.reset", edits: [{ file: ST, find: "        if (newPassword) {\n          const capabilityDenial", replace: "        if (false) {\n          const capabilityDenial" }] },
  { id: "P5B1-M3", what: "the class change is checked against the edit capability instead of the move one", edits: [{ file: ST, find: "requireCapability(auth, \"manage-students.js\", \"bulk:move\", deps, obs);", replace: "requireCapability(auth, \"manage-students.js\", \"update\", deps, obs);" }] },
  { id: "P5B1-M4", what: "the password is checked against the edit capability instead of the reset one", edits: [{ file: ST, find: "          const capabilityDenial = await requireCapability(auth, \"manage-students.js\", \"resetpassword\", deps, obs);", replace: "          const capabilityDenial = await requireCapability(auth, \"manage-students.js\", \"update\", deps, obs);" }] },
  { id: "P5B1-M5", what: "an edit may move a student into another teacher's class", edits: [{ file: ST, find: "if (newClassId !== String(student.classId || \"\") && (!isSafeId(newClassId) || !(await classOk(newClassId)))) {", replace: "if (newClassId !== String(student.classId || \"\") && (!isSafeId(newClassId))) {" }] },
  { id: "P5B1-M6", what: "a bulk move may target another teacher's class", edits: [{ file: ST, find: "if (operation === \"move\" && (!isSafeId(targetClassId) || !(await classOk(targetClassId)))) {", replace: "if (operation === \"move\" && (!isSafeId(targetClassId))) {" }] },
  { id: "P5B1-M7", what: "the edit route reaches another teacher's student", edits: [{ file: ST, find: "        const student = await downloadJsonOrNull(container, studentBlobName);\n\n        if (!student || student.role !== \"student\" || !(await studentOk(student))) {", replace: "        const student = await downloadJsonOrNull(container, studentBlobName);\n\n        if (!student || student.role !== \"student\") {" }] }
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
console.log("\nP5-B1: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
