#!/usr/bin/env node
// Tadris+ O5 — mutation proof for «training never reveals the keys of an open official homework, nor to a teacher without viewKeys»
// (approved design docs/enterprise-training-keys-o5.md). Answer-key secrecy is a critical invariant: every mutant must be killed.
// Same engine and rules as scripts/mutate-p10l.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/learning-training-o5.test.js", "api/tests/learning-training.test.js", "src/learning/training/LearningTrainingRunner.o5.test.tsx"];
const F = "api/src/functions/learning-training.js";
const U = "src/learning/training/LearningTrainingRunner.tsx";

export const MUTANTS = [
  { id: "O5-M1", what: "the open-homework check is dropped (a student always gets the full review)", edits: [{ file: F, find: "    return open.some(a => a && a.source && a.source.kind === \"library\" && String(a.source.itemId || \"\") === trainingId) ? \"assignment\" : null;", replace: "    return null;" }] },
  { id: "O5-M2", what: "the reason is set but the review is still sent", edits: [{ file: F, find: "review: withheld ? [] : review,", replace: "review," }] },
  { id: "O5-M3", what: "the token's class decides instead of the persisted one", edits: [{ file: F, find: "  const classId = String(actor.student?.classId || \"\").trim();", replace: "  const classId = String(actor.user?.classId || actor.student?.classId || \"\").trim();" }] },
  { id: "O5-M4", what: "a failed read of the class's assignments reveals the review", edits: [{ file: F, find: "  } catch { return \"assignment\"; }", replace: "  } catch { return null; }" }] },
  { id: "O5-M5", what: "any library homework of the class withholds, whatever its item", edits: [{ file: F, find: "a.source.kind === \"library\" && String(a.source.itemId || \"\") === trainingId)", replace: "a.source.kind === \"library\")" }] },
  { id: "O5-M6", what: "a teacher whose capability cannot be decided gets the keys", edits: [{ file: F, find: "    } catch { return \"keys\"; }", replace: "    } catch { return null; }" }] },
  { id: "O5-M7", what: "the runner shows the per-question review even when the server withheld it", edits: [{ file: U, find: "        {result.reviewWithheld ? (", replace: "        {false ? (" }] }
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
console.log("\nO5: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
