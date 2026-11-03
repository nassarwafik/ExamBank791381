#!/usr/bin/env node
// Tadris+ P5-B3a — mutation proof for moving a whole class to another teacher: the compare-and-set against the expected owner, every
// student moved (archived included, a third teacher's never), resumable completion, the ledger and the owner audit, step-up, and the
// console's choice and unchanged retry. Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/class-transfer-p5b3a.test.js", "src/owner/OwnerClassTransfer.p5b3a.test.tsx"];
const TR = "api/src/lib/teacher-transfer.js";
const OC = "api/src/functions/owner-classes.js";
const UI = "src/owner/OwnerClassTransfer.tsx";

export const MUTANTS = [
  { id: "P5B3A-M1", what: "the class moves whoever owns it (no compare-and-set against the expected owner)", edits: [{ file: TR, find: "    if (current.ownerId !== from) throw new TransferRefusal(409,", replace: "    if (false) throw new TransferRefusal(409," }] },
  { id: "P5B3A-M2", what: "the students do not move with the class", edits: [{ file: TR, find: "return { ...cur, ownerId: to, profileRevision:", replace: "return { ...cur, ownerId: cur.ownerId, profileRevision:" }] },
  { id: "P5B3A-M3", what: "archived students stay behind", edits: [{ file: TR, find: "String(u.classId || \"\") === classId && typeof u.userId", replace: "String(u.classId || \"\") === classId && u.archived !== true && typeof u.userId" }] },
  { id: "P5B3A-M4", what: "a third teacher's student is moved too", edits: [{ file: TR, find: "        if (typeof cur.ownerId === \"string\" && cur.ownerId && cur.ownerId !== from) { outcome = \"skipped\"; return cur; }", replace: "" }] },
  { id: "P5B3A-M5", what: "an interrupted transfer cannot be completed", edits: [{ file: TR, find: "      if (last && last.from === from && last.to === to) { resumed = true; return current; }", replace: "" }] },
  { id: "P5B3A-M6", what: "no ledger record", edits: [{ file: TR, find: "  await (deps.uploadJsonConditional || storage.uploadJsonConditional)(container, LEDGER_PREFIX + transferId + \".json\", ledger, null);", replace: "" }] },
  { id: "P5B3A-M7", what: "the transfer is not in the owner audit", edits: [{ file: OC, find: "      await audit(container, { actor, action: \"owner.class.transferred\",", replace: "      false && audit(container, { actor, action: \"owner.class.transferred\"," }] },
  { id: "P5B3A-M8", what: "a transfer is accepted without a recent step-up", edits: [{ file: OC, find: "    if (denial) return denial;", replace: "    if (false) return denial;" }] },
  { id: "P5B3A-M9", what: "a transfer to the same teacher is accepted", edits: [{ file: TR, find: "  if (!from || !to || from === to) throw new TransferRefusal(400,", replace: "  if (!from || !to) throw new TransferRefusal(400," }] },
  { id: "P5B3A-M10", what: "the console offers the current teacher", edits: [{ file: UI, find: ".filter(t => t.accountId !== fromAccountId)", replace: ".filter(() => true)" }] },
  { id: "P5B3A-M11", what: "the console does not state the owner it saw (stale transfers undetectable)", edits: [{ file: UI, find: "ownerTransferApi.transfer(token, c.classId, to, fromAccountId, reason.trim())", replace: "ownerTransferApi.transfer(token, c.classId, to, \"\", reason.trim())" }] }
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
console.log("\nP5-B3a: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
