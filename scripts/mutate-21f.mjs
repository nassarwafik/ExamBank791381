#!/usr/bin/env node
// Phase 21F — mutation campaigns for the Exam Studio invariants (AGENTS.md §9). Each mutant plants ONE deliberate defect (an exact,
// unique text replacement), runs the focused Vitest files that guard it, and is KILLED only if a test fails because of it. A run
// that times out is reported as TIMEOUT (never as killed). Every mutated file is restored byte-for-byte and hash-verified after
// each mutant — also when the run throws or the process is interrupted — and `git status` must be clean afterwards.
//
//   node scripts/mutate-21f.mjs <campaign>      campaigns: f0, f1, … (see CAMPAIGNS below)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");

const F0_API = ["api/tests/saved-exam-safety-21f0.test.js"];
const F0_CLIENT = ["src/structuredSaveConditions.21f0.test.ts", "src/App.saveConflict.21f0.test.tsx"];
export const CAMPAIGNS = {
  f0: [
    { id: "F0-M1", what: "conditional save ignores the stated base version (If-Match dropped)", file: "api/src/lib/saved-exam-access.js",
      find: "const matches = expected ? currentEtag === expected : current === null;", replace: "const matches = true;", tests: F0_API },
    { id: "F0-M2", what: "a create-only save (base null) overwrites an existing exam", file: "api/src/lib/saved-exam-access.js",
      find: "const matches = expected ? currentEtag === expected : current === null;", replace: "const matches = expected ? currentEtag === expected : true;", tests: F0_API },
    { id: "F0-M3", what: "the write is not conditional on the version the decision was made on", file: "api/src/lib/saved-exam-access.js",
      find: "await io.uploadJsonConditional(container, blobName, document, currentEtag);", replace: "(await io.uploadJson(container, blobName, document), null);", tests: F0_API },
    { id: "F0-M4", what: "owner comparison removed (any teacher may access any exam)", file: "api/src/lib/saved-exam-access.js",
      find: "return !owner || !stored || stored === owner;", replace: "return true;", tests: F0_API },
    { id: "F0-M5", what: "the owner is never stamped on a saved document", file: "api/src/lib/saved-exam-access.js",
      find: "if (ownerId) document.ownerId = ownerId;", replace: "", tests: F0_API },
    { id: "F0-M6", what: "the saved-exams list shows other teachers' exams", file: "api/src/functions/manage-saved-exams.js",
      find: "!canAccessSavedExam(\n          document,\n          owner\n        )", replace: "false", tests: F0_API },
    { id: "F0-M7", what: "load returns another teacher's exam", file: "api/src/functions/manage-saved-exams.js",
      find: "      // Another teacher's exam is reported exactly like a missing one (its existence is not disclosed).\n      if (!canAccessSavedExam(document, owner)) return notFound;", replace: "", tests: F0_API },
    { id: "F0-M8", what: "delete removes another teacher's exam", file: "api/src/functions/manage-saved-exams.js",
      find: "if (document && !canAccessSavedExam(document, owner)) return notFound;", replace: "", tests: F0_API },
    { id: "F0-M9", what: "the client never states a base version (every save unconditional)", file: "src/structuredSavePolicy.ts",
      find: "  return { conditional: true, baseEtag: serverEtag };", replace: "  return {};", tests: F0_CLIENT },
    { id: "F0-M10", what: "the client keeps the stale base after a successful save", file: "src/examHistory.ts",
      find: "  if (typeof serverEtag === \"string\" && serverEtag) next.serverEtag = serverEtag;", replace: "", tests: F0_CLIENT },
    { id: "F0-M11", what: "a 409 conflict is reported as a plain error (no conflict dialog)", file: "src/structuredSavePolicy.ts",
      find: "  if (p.code !== \"EXAM_CONFLICT\") return null;", replace: "  return null;", tests: F0_CLIENT },
    { id: "F0-M12", what: "new exam ids come from the clock again", file: "src/examBuilderState.ts",
      find: "export function newExamId(): string { return genId(\"EXAM\"); }", replace: "export function newExamId(): string { return \"EXAM-\" + Date.now(); }", tests: F0_CLIENT }
  ]
};

const name = process.argv[2];
const campaign = CAMPAIGNS[name];
if (!campaign) { console.error("usage: node scripts/mutate-21f.mjs <" + Object.keys(CAMPAIGNS).join("|") + ">"); process.exit(2); }

const originals = new Map();
const restoreAll = () => {
  for (const [file, { buf, hash }] of originals) {
    writeFileSync(path.join(root, file), buf);
    if (sha(readFileSync(path.join(root, file))) !== hash) { console.error("RESTORE FAILED for " + file); process.exitCode = 3; }
  }
};
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { restoreAll(); process.exit(130); });
process.on("exit", restoreAll);

const results = [];
for (const m of campaign) {
  const abs = path.join(root, m.file);
  if (!originals.has(m.file)) { const buf = readFileSync(abs); originals.set(m.file, { buf, hash: sha(buf) }); }
  const source = originals.get(m.file).buf.toString("utf8");
  const count = source.split(m.find).length - 1;
  if (count !== 1) { results.push({ ...m, verdict: "INVALID (find matched " + count + "×)" }); continue; }
  writeFileSync(abs, source.replace(m.find, m.replace));
  let verdict, killer = "";
  try {
    const run = spawnSync("npx", ["vitest", "run", ...m.tests], { cwd: root, encoding: "utf8", timeout: 600000 });
    if (run.error && run.error.code === "ETIMEDOUT") verdict = "TIMEOUT";
    else if (run.status === 0) verdict = "SURVIVED";
    else {
      const out = (run.stdout || "") + (run.stderr || "");
      const failed = out.match(/FAIL\s+(\S+)\s+>\s+([^\n]+)/);
      verdict = /Tests\s+\d+ failed/.test(out) ? "KILLED" : "ERROR (suite did not run)";
      killer = failed ? failed[1] + " > " + failed[2].trim() : "";
    }
  } finally {
    const { buf, hash } = originals.get(m.file);
    writeFileSync(abs, buf);
    if (sha(readFileSync(abs)) !== hash) { console.error("RESTORE FAILED for " + m.file); process.exit(3); }
  }
  results.push({ ...m, verdict, killer });
  console.log(m.id + " " + verdict + " — " + m.what + (killer ? "\n    killed by: " + killer : ""));
}
// Every mutated file is back to the exact bytes it had before the campaign (hash-verified above); `git status` then shows only what
// was already there before the run (a campaign is run on a committed tree, so it is clean).
const git = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
const status = git.stdout.trim();
console.log("\n" + name + ": " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
