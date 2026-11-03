#!/usr/bin/env node
// Tadris+ P5-B2 — mutation proof for the owner's management of a teacher's classes (D18 revised): owner session + step-up,
// the class stamped with THAT teacher, an existing teacher required, only teacher-owned classes reachable, the shared lifecycle's
// pending-grading guard, request-key idempotency, the owner audit, and the console tab (one request key per submission, a
// confirmation before archiving). Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/owner-classes-p5b2.test.js", "src/owner/OwnerTeacherClasses.p5b2.test.tsx", "api/tests/classes-students-s1.test.js"];
const OC = "api/src/functions/owner-classes.js";
const MC = "api/src/functions/manage-classrooms.js";
const UI = "src/owner/OwnerTeacherClasses.tsx";

export const MUTANTS = [
  { id: "P5B2-M1", what: "a change is accepted without a recent step-up", edits: [{ file: OC, find: "    if (denial) return denial;", replace: "    if (false) return denial;" }] },
  { id: "P5B2-M2", what: "the created class is not stamped with the teacher", edits: [{ file: OC, find: "buildNewClassroomDocument({ ...fields.value, programCode: \"\" }, iso, accountId, keyedId)", replace: "buildNewClassroomDocument({ ...fields.value, programCode: \"\" }, iso, null, keyedId)" }] },
  { id: "P5B2-M3", what: "a class is created for a teacher account that does not exist", edits: [{ file: OC, find: "      if (!teacher) return TEACHER_NOT_FOUND();", replace: "      if (false) return TEACHER_NOT_FOUND();" }] },
  { id: "P5B2-M4", what: "an unowned (pre-tenancy) class is reachable from the owner route", edits: [{ file: OC, find: " || !(await teacherOf(container, String(current.ownerId || \"\"), deps))) return CLASS_NOT_FOUND();", replace: ") return CLASS_NOT_FOUND();" }] },
  { id: "P5B2-M5", what: "a class with pending grading is archived (shared lifecycle guard dropped)", edits: [{ file: MC, find: "    if (pending > 0) return { status: 409,", replace: "    if (false) return { status: 409," }] },
  { id: "P5B2-M6", what: "«graduate» archives without graduating", edits: [{ file: OC, find: "graduate: \"graduateandarchive\"", replace: "graduate: \"archive\"" }] },
  { id: "P5B2-M7", what: "a created class is not in the owner audit", edits: [{ file: OC, find: "      await audit(container, { actor, action: \"owner.class.created\",", replace: "      false && audit(container, { actor, action: \"owner.class.created\"," }] },
  { id: "P5B2-M8", what: "a repeated submission creates a second class (request key ignored)", edits: [{ file: OC, find: "      const keyedId = classIdForRequestKey(body.requestKey, accountId);", replace: "      const keyedId = null;" }] },
  { id: "P5B2-M9", what: "the owner's list shows other teachers' classes", edits: [{ file: OC, find: "c && c.ownerId === accountId && isSafeId(", replace: "c && isSafeId(" }] },
  { id: "P5B2-M10", what: "the console retries a create with a NEW request key", edits: [{ file: UI, find: "const key = newRequestKey(); return send(() => ownerClassesApi.create(token, accountId, fields, key)", replace: "return send(() => ownerClassesApi.create(token, accountId, fields, newRequestKey())" }] },
  { id: "P5B2-M11", what: "the console archives without a confirmation", edits: [{ file: UI, find: "onClick={() => setConfirm(\"archive\")}", replace: "onClick={() => void act(\"archive\")}" }] }
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
console.log("\nP5-B2: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
