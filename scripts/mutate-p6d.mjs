#!/usr/bin/env node
// Tadris+ P6-D — mutation proof for each teacher's own exam bank: the audience («all» / «selected»), the launch default, the
// teacher-facing enforcement (catalog, item, assigning by reference), fail-closed reads, the owner's two ways of choosing (one exam
// for a group / everyone; one teacher's bank, an «all» exam never removed for one teacher), and the console's diff-only save.
// Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/teacher-exam-bank-p6d.test.js", "src/owner/OwnerLibrary.p6d.test.tsx"];
const LA = "api/src/lib/access/library-access.js";
const LIB = "api/src/functions/exam-library.js";
const AS = "api/src/functions/manage-assignments.js";
const OL = "api/src/functions/owner-library.js";
const TAB = "src/owner/OwnerTeacherExams.tsx";

export const MUTANTS = [
  { id: "P6D-M1", what: "a «selected» exam is in every bank", edits: [{ file: LA, find: "  return a.audience === \"all\" || a.teachers.includes(accountId);", replace: "  return true;" }] },
  { id: "P6D-M2", what: "an exam added later is «all» by default (not for nobody)", edits: [{ file: LA, find: "audience: LAUNCH_ITEMS.has(itemId) ? \"all\" : \"selected\"", replace: "audience: \"all\"" }] },
  { id: "P6D-M3", what: "the launch exams start for nobody (teachers lose their bank on day one)", edits: [{ file: LA, find: "audience: LAUNCH_ITEMS.has(itemId) ? \"all\" : \"selected\"", replace: "audience: \"selected\"" }] },
  { id: "P6D-M4", what: "the narrowing applies before enforcement", edits: [{ file: LA, find: "try { return (await readAccessMode(container, deps)).mode === \"enforce\"; } catch { return true; }", replace: "return true;" }] },
  { id: "P6D-M5", what: "an unreadable audience record opens the whole library (fail open)", edits: [{ file: LA, find: "  if (doc.schemaVersion !== 1 || !doc.items || typeof doc.items !== \"object\" || Array.isArray(doc.items)) throw new LibraryAccessError(\"audience document invalid\");\n  for (const [id, e] of Object.entries(doc.items)) if (!ITEM_ID.test(id) || !validEntry(e)) throw new LibraryAccessError(\"audience entry invalid: \" + id);", replace: "" }] },
  { id: "P6D-M6", what: "the catalog is not narrowed", edits: [{ file: LIB, find: "    if (bank && !id) entry = bankCatalog(entry, bank);", replace: "" }] },
  { id: "P6D-M7", what: "an exam outside the bank is served by id", edits: [{ file: LIB, find: "    if (bank && id && !bank(id)) return", replace: "    if (false) return" }] },
  { id: "P6D-M8", what: "an exam outside the bank can be assigned by reference", edits: [{ file: AS, find: "    if(bank&&!bank(itemId))return", replace: "    if(false)return" }] },
  { id: "P6D-M9", what: "the narrowed catalog keeps the whole library's ETag", edits: [{ file: LIB, find: "  if (value.length === entry.value.length) return entry;", replace: "  return { value, etag: entry.etag };" }] },
  { id: "P6D-M10", what: "an «all» exam can be removed for one teacher", edits: [{ file: OL, find: "          if (forAll.length) throw new Refusal(", replace: "          if (false) throw new Refusal(" }] },
  { id: "P6D-M11", what: "an unknown teacher can be put in an audience", edits: [{ file: OL, find: "      if (unknown.length) return reply(404, { ok: false, code: \"TEACHER_NOT_FOUND\", error: \"حساب المعلم غير موجود.\", unknown });", replace: "" }] },
  { id: "P6D-M12", what: "a change is accepted without a recent step-up", edits: [{ file: OL, find: "    if (denial) return denial;", replace: "    if (false) return denial;" }] },
  { id: "P6D-M13", what: "set-teacher does not add the teacher", edits: [{ file: OL, find: "teachers: [...a.teachers, accountId].sort()", replace: "teachers: a.teachers" }] },
  { id: "P6D-M14", what: "the console sends the whole selection instead of what changed", edits: [{ file: TAB, find: "ownerLibraryApi.setTeacher(token, accountId, include, exclude)", replace: "ownerLibraryApi.setTeacher(token, accountId, [...chosen], exclude)" }] },
  { id: "P6D-M15", what: "the console lets an «all» exam be unticked", edits: [{ file: TAB, find: "<input type=\"checkbox\" checked disabled />", replace: "<input type=\"checkbox\" checked={chosen.has(i.libraryItemId)} onChange={() => toggle(i.libraryItemId)} />" }] }
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
console.log("\nP6-D: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
