#!/usr/bin/env node
// Tadris+ P5-B3b — mutation proof for moving one student to another teacher (owner decisions §19.21, D16): the pending guard and
// its post-write re-check, the compare-and-set against the previewed class, the new owner stamp and transfer moment, the new
// teacher's read marker, and the visibility rules (profile grades by the viewer's classes, the thread from the transfer on, old
// messages not editable, the «منقول» archive), plus the console. Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/student-transfer-p5b3b.test.js", "src/owner/OwnerClassRoster.p5b3b.test.tsx", "src/assignments/MovedStudents.p5b3b.test.tsx"];
const TR = "api/src/lib/teacher-transfer.js";
const MS = "api/src/functions/manage-students.js";
const MSG = "api/src/functions/messages.js";
const AR = "api/src/functions/assignment-results.js";
const OC = "api/src/functions/owner-classes.js";
const UI = "src/owner/OwnerClassRoster.tsx";

export const MUTANTS = [
  { id: "P5B3B-M1", what: "a student with pending work is moved (pre-check dropped)", edits: [{ file: TR, find: "  if (before > 0) throw new TransferRefusal(409,", replace: "  if (false) throw new TransferRefusal(409," }] },
  { id: "P5B3B-M2", what: "an attempt started meanwhile does not revert the move (post-check dropped)", edits: [{ file: TR, find: "  if (after > 0) {", replace: "  if (false) {" }] },
  { id: "P5B3B-M3", what: "the student is moved from whatever class it is in now (no compare-and-set)", edits: [{ file: TR, find: "    if (String(cur.classId || \"\") !== fromClassId) throw new TransferRefusal(409,", replace: "    if (false) throw new TransferRefusal(409," }] },
  { id: "P5B3B-M4", what: "the student keeps the former teacher's owner stamp", edits: [{ file: TR, find: "return { ...cur, classId: toClassId, ownerId: to, directSince: at,", replace: "return { ...cur, classId: toClassId, directSince: at," }] },
  { id: "P5B3B-M5", what: "no transfer moment (the whole old conversation shows)", edits: [{ file: TR, find: "return { ...cur, classId: toClassId, ownerId: to, directSince: at,", replace: "return { ...cur, classId: toClassId, ownerId: to," }] },
  { id: "P5B3B-M6", what: "the new teacher's read marker is not started (old messages count as unread)", edits: [{ file: TR, find: "  try { await startReadMarker(container, to, userId, deps); } catch (e) {", replace: "  try { } catch (e) {" }] },
  { id: "P5B3B-M7", what: "the profile lists every class's grades", edits: [{ file: MS, find: "    if (latest && (!visibleClass || visibleClass(String(assignment.classId || \"\")))) {", replace: "    if (latest) {" }] },
  { id: "P5B3B-M8", what: "the thread shows the conversation before the transfer", edits: [{ file: MSG, find: "        const visible = since ? page.messages.filter(m => String(m.createdAt || \"\") >= since) : page.messages;", replace: "        const visible = page.messages;" }] },
  { id: "P5B3B-M9", what: "a message from before the transfer can be deleted by the new teacher", edits: [{ file: MSG, find: "        if (doc && String(doc.createdAt || \"\") < target.directSince) return notFound(", replace: "        if (false) return notFound(" }] },
  { id: "P5B3B-M10", what: "the former teacher loses the moved student's result (no «منقول» archive)", edits: [{ file: AR, find: "&&x.transferHistory.some(t=>t&&t.fromClassId===String(a.classId)));", replace: "&&false);" }] },
  // the same-teacher rule is enforced twice (the route, then the library): dropping one layer alone is equivalent — both are dropped
  { id: "P5B3B-M11", what: "a transfer between two classes of the SAME teacher is accepted here", edits: [{ file: OC, find: "  if (String(target.ownerId) === from) return { refusal: bad(\"SAME_TEACHER\",", replace: "  if (false) return { refusal: bad(\"SAME_TEACHER\"," }, { file: TR, find: "  if (!from || !to || from === to) throw new TransferRefusal(400, \"SAME_TEACHER\", \"اختر صفًا لمعلم آخر غير المعلم الحالي.\");", replace: "  if (!from || !to) throw new TransferRefusal(400, \"SAME_TEACHER\", \"اختر صفًا لمعلم آخر غير المعلم الحالي.\");" }] },
  { id: "P5B3B-M12", what: "a student is moved into an archived class", edits: [{ file: OC, find: "  if (normalizeClassStatus(target) === \"archived\") return { refusal: reply(400, { ok: false, code: \"CLASS_ARCHIVED\", error: \"الصف الهدف مؤرشف.\" }) };", replace: "" }] },
  { id: "P5B3B-M13", what: "the console offers the new teacher's archived classes", edits: [{ file: UI, find: "setClasses(r.data.classes.filter(c => c.status === \"active\"))", replace: "setClasses(r.data.classes)" }] },
  { id: "P5B3B-M14", what: "the console lets the owner confirm while work is pending", edits: [{ file: UI, find: "disabled={busy || preview.pendingGrading > 0} onClick={confirm}", replace: "disabled={busy} onClick={confirm}" }] }
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
console.log("\nP5-B3b: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
