#!/usr/bin/env node
// Tadris+ P11-D — mutation proof for copying the students of a whole class into another teacher's class: who the server copies
// (archived never, a third teacher's never, added students too, those already there skipped), the refusals (step-up, same class,
// archived target, no target on a POST), the owner audit, and the console's choices (no current teacher, active classes only, one new
// class on a retry, the right source). Same engine and rules as scripts/mutate-p5b3a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/class-copy-p11d.test.js", "src/owner/OwnerClassCopy.p11d.test.tsx"];
const OC = "api/src/functions/owner-classes.js";
const UI = "src/owner/OwnerClassCopy.tsx";

export const MUTANTS = [
  { id: "P11D-M1", what: "archived students are copied too", edits: [{ file: OC, find: "    if (!shared && st.archived === true) { archived++; continue; }", replace: "" }] },
  { id: "P11D-M2", what: "a copy is accepted without a recent step-up", edits: [{ file: OC, find: "    if (denial) return denial;", replace: "    if (false) return denial;" }] },
  { id: "P11D-M3", what: "copying a class into itself is accepted", edits: [{ file: OC, find: "  if (classId === fromClassId) return { refusal: bad(\"SAME_CLASS\",", replace: "  if (false) return { refusal: bad(\"SAME_CLASS\"," }] },
  { id: "P11D-M4", what: "an archived target class is accepted", edits: [{ file: OC, find: "  if (normalizeClassStatus(target) === \"archived\") return { refusal: reply(400, { ok: false, code: \"CLASS_ARCHIVED\", error: \"الصف الهدف مؤرشف. استعده", replace: "  if (false) return { refusal: reply(400, { ok: false, code: \"CLASS_ARCHIVED\", error: \"الصف الهدف مؤرشف. استعده" }] },
  { id: "P11D-M5", what: "the plan does not skip students already in the target", edits: [{ file: OC, find: "    if (targetId && (String(st.classId || \"\") === targetId || sharedClassIds(st).includes(targetId))) { already++; continue; }", replace: "" }] },
  { id: "P11D-M6", what: "the copy is not recorded as such in the owner audit", edits: [{ file: OC, find: "action: \"owner.students.copy.requested\"", replace: "action: \"owner.students.enroll.requested\"" }] },
  { id: "P11D-M7", what: "students added to the source class are left behind", edits: [{ file: OC, find: "  return home.concat(added);", replace: "  return home;" }] },
  { id: "P11D-M8", what: "a student of a third teacher sitting in the source class is copied", edits: [{ file: OC, find: "classStudents(allUsers, classId).filter(st => ownerOfStudent(st, classroom) === classroom.ownerId)", replace: "classStudents(allUsers, classId)" }] },
  { id: "P11D-M9", what: "a POST without a target class is treated as a new class", edits: [{ file: OC, find: "String(body.classId || \"\").trim(), deps, { allowNew: false });", replace: "String(body.classId || \"\").trim(), deps, { allowNew: true });" }] },
  { id: "P11D-M10", what: "the console offers the current teacher", edits: [{ file: UI, find: ".filter(t => t.accountId !== fromAccountId)", replace: ".filter(() => true)" }] },
  { id: "P11D-M11", what: "the console offers archived classes of the other teacher", edits: [{ file: UI, find: "r.data.classes.filter(x => x.status === \"active\")", replace: "r.data.classes.filter(() => true)" }] },
  { id: "P11D-M12", what: "a retry after a failed copy creates a second class", edits: [{ file: UI, find: "    if (created) { void copyInto(created); return; }\n", replace: "" }] },
  { id: "P11D-M13", what: "the console sends a copy to the class it previewed with the wrong source", edits: [{ file: UI, find: "ownerClassCopyApi.copy(token, c.classId, classroom.classId)", replace: "ownerClassCopyApi.copy(token, classroom.classId, classroom.classId)" }] }
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
console.log("\nP11-D: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
