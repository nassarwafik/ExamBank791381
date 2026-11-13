#!/usr/bin/env node
// Hotfix — mutation proof that every teacher who may save can CREATE a new saved exam, while the ownership rules for an exam that
// exists stay exactly as they were (api/src/lib/saved-exam-access.js; docs/enterprise-library-consent-owner-edit-p6g.md §5).
// Same engine and rules as scripts/mutate-p6g.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/saved-exam-create-console-hotfix.test.js", "api/tests/saved-exam-safety-21f0.test.js", "api/tests/legacy-data-managed-hotfix.test.js", "api/tests/saved-exams-list-21f7.test.js"];
const SA = "api/src/lib/saved-exam-access.js";

const m = (id, what, ...edits) => ({ id, what, edits: edits.map(([file, find, replace]) => ({ file, find, replace })) });
export const MUTANTS = [
  m("HNE-M1", "the defect itself: «no document» is decided by the access rule (a console account cannot create)", [SA, "const exists = current !== null || !!currentEtag;", "const exists = true;"]),
  m("HNE-M2", "a stored blob with empty content is treated as «no exam» (written over)", [SA, "const exists = current !== null || !!currentEtag;", "const exists = current !== null;"]),
  m("HNE-M3", "the access rule is skipped for an exam that exists", [SA, "if (exists && !canAccessSavedExam(current, owner)) throw", "if (false && !canAccessSavedExam(current, owner)) throw"]),
  m("HNE-M4", "a new exam is not stamped with its owner", [SA, "    if (ownerId) document.ownerId = ownerId;\n", ""]),
  m("HNE-M5", "the create is not create-only (a racing teacher's exam is written over)", [SA, "const etag = await io.uploadJsonConditional(container, blobName, document, currentEtag);", "const etag = (await io.uploadJson(container, blobName, document), null);"])
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
console.log("\nHotfix (new saved exam): " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
