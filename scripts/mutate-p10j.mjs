#!/usr/bin/env node
// Tadris+ P10-J — mutation proof for «enrolling a class in a project is the projects capability» (approved design
// docs/enterprise-project-enrolment-p10j.md, owner decision §19.47): setPrograms / setProgram ask projects.tracker.manage on the
// server, and the class menu offers «المشاريع» by the same capability.
// Same engine and rules as scripts/mutate-p10a.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/project-enrolment-p10j.test.js", "src/students/projectEnrolment.p10j.test.tsx", "api/tests/route-capabilities-p3b.test.js"];
const R = "api/src/lib/access/route-capabilities.js";
const U = "src/students/ClassesPane.tsx";

export const MUTANTS = [
  { id: "P10J-M1", what: "setPrograms asks course assignment again (the O10 defect)", edits: [{ file: R, find: "setprograms: \"projects.tracker.manage\"", replace: "setprograms: \"learning.course.assign\"" }] },
  { id: "P10J-M2", what: "only the legacy setProgram asks course assignment", edits: [{ file: R, find: "setprogram: \"projects.tracker.manage\"", replace: "setprogram: \"learning.course.assign\"" }] },
  { id: "P10J-M3", what: "setPrograms asks nothing beyond the class (falls to the route's default)", edits: [{ file: R, find: "setprograms: \"projects.tracker.manage\", ", replace: "" }] },
  { id: "P10J-M4", what: "the class menu offers «المشاريع» by course assignment again", edits: [{ file: U, find: "can(\"projects.tracker.manage\") && (", replace: "can(\"learning.course.assign\") && (" }] },
  { id: "P10J-M5", what: "removing a course is moved to the projects capability too", edits: [{ file: R, find: "removelearningcourse: \"learning.course.assign\"", replace: "removelearningcourse: \"projects.tracker.manage\"" }] }
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
console.log("\nP10-J: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
