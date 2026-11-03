#!/usr/bin/env node
// Tadris+ P6 (P6-A + P6-C; risks S2 / S5, owner decision D8) — mutation proof for the exam library's answer keys (viewKeys only;
// the keyless variant sanitized, with its own ETag; preview / viewKeys needed for an item) and for library assignments built by
// the server from `libraryRef` (the server's copy wins, unknown items refused, source recorded, ready-only teachers cannot send
// their own snapshot), plus the browser side (assign by reference; a keyless item never copied into the builder).
// Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/library-keys-p6a.test.js", "src/assignments/libraryRef.p6.test.tsx", "src/bank/ExamBankPage.ux6c.test.tsx"];
const LIB = "api/src/functions/exam-library.js";
const ASSIGN = "api/src/functions/manage-assignments.js";
const CTRL = "src/assignments/useAssignmentsController.ts";
const COMPOSER = "src/assignments/useAssignmentComposer.ts";
const BANK = "src/bank/ExamBankPage.tsx";

export const MUTANTS = [
  { id: "P6-M1", what: "the answer keys go to everyone", edits: [{ file: LIB, find: "      if (!keys.allowed) entry = keylessEntry(entry);", replace: "      if (false) entry = keylessEntry(entry);" }] },
  { id: "P6-M2", what: "an item is served without preview / viewKeys", edits: [{ file: LIB, find: "      if (!item.allowed) return item.response;", replace: "      if (false) return item.response;" }] },
  { id: "P6-M3", what: "the keyless variant shares the keyed ETag", edits: [{ file: LIB, find: "etag: String(entry.etag).replace(/\"$/, \"-nokeys\\\"\")", replace: "etag: entry.etag" }] },
  { id: "P6-M4", what: "the keyless variant still carries the keys", edits: [{ file: LIB, find: "examSnapshot: sanitizeExamForStudent(entry.value.examSnapshot)", replace: "examSnapshot: entry.value.examSnapshot" }] },
  { id: "P6-M5", what: "libraryRef is ignored", edits: [{ file: ASSIGN, find: "if(b.libraryRef!==undefined&&b.libraryRef!==null){", replace: "if(false){" }] },
  { id: "P6-M6", what: "the browser's snapshot wins over the library's", edits: [{ file: ASSIGN, find: "exam=cleanExam(entry.value.examSnapshot);", replace: "exam=cleanExam(b.examSnapshot||entry.value.examSnapshot);" }] },
  { id: "P6-M7", what: "a ready-assignments-only teacher may send their own snapshot", edits: [{ file: ASSIGN, find: "if(!own.allowed&&own.decision!==\"unavailable\")return {status:403", replace: "if(false)return {status:403" }] },
  { id: "P6-M8", what: "the library source is not recorded", edits: [{ file: ASSIGN, find: "source={kind:\"library\",itemId,etag:String(entry.etag||\"\")};", replace: "source=null;" }] },
  { id: "P6-M9", what: "an unknown library item is accepted", edits: [{ file: ASSIGN, find: "    if(!entry||!entry.value||!entry.value.examSnapshot)return {status:404", replace: "    if(false)return {status:404" }] },
  { id: "P6-M10", what: "the composer sends the fetched exam instead of libraryRef", edits: [{ file: CTRL, find: "? { libraryRef: { itemId: composer.library.librarySelectedId } } : { examSnapshot: sourceExam }", replace: "? { examSnapshot: sourceExam } : { examSnapshot: sourceExam }" }] },
  { id: "P6-M11", what: "the composer copies a keyless item into the builder", edits: [{ file: COMPOSER, find: "      if (r.item?.answerKeys === false) { setError(", replace: "      if (false) { setError(" }] },
  { id: "P6-M12", what: "the bank page opens a keyless item in the builder", edits: [{ file: BANK, find: "      if (r.item?.answerKeys === false) { setActionError(", replace: "      if (false) { setActionError(" }] }
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
console.log("\nP6: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
