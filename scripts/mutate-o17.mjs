#!/usr/bin/env node
// Tadris+ O17 — mutation proof for «a BUILDER_USERS account with a managed id form is skipped, alone» (approved design
// docs/enterprise-info-items-o15-o17.md). Identity / tenancy is a critical invariant: every mutant must be killed.
// Same engine and rules as scripts/mutate-p10l.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/builder-users-o17.test.js", "api/tests/builder-users-14b.test.js", "api/tests/builder-auth-cutover-14b.test.js"];
const U = "api/src/lib/builder-users.js";

export const MUTANTS = [
  { id: "O17-M1", what: "the reserved-id check is dropped (t_legacy / t_<16 hex> accepted again)", edits: [{ file: U, find: "    if (isReservedManagedId(id)) { reservedSkipped++; continue; }   // Tadris+ O17\n", replace: "" }] },
  { id: "O17-M2", what: "a reserved id fails the WHOLE configuration (every teacher locked out)", edits: [{ file: U, find: "    if (isReservedManagedId(id)) { reservedSkipped++; continue; }", replace: "    if (isReservedManagedId(id)) return error(\"reserved account id\");" }] },
  { id: "O17-M3", what: "t_legacy is no longer reserved", edits: [{ file: U, find: "const RESERVED_MANAGED_ID = /^(t_[0-9a-f]{16}|t_legacy)$/;", replace: "const RESERVED_MANAGED_ID = /^(t_[0-9a-f]{16})$/;" }] },
  { id: "O17-M4", what: "a configuration left with no account is accepted (fails open)", edits: [{ file: U, find: "  if (!Object.keys(out).length) return error(\"no accounts\");", replace: "" }] },
  { id: "O17-M5", what: "the reserved pattern is unanchored (look-alike ids are skipped too)", edits: [{ file: U, find: "const RESERVED_MANAGED_ID = /^(t_[0-9a-f]{16}|t_legacy)$/;", replace: "const RESERVED_MANAGED_ID = /(t_[0-9a-f]{16}|t_legacy)/i;" }] }
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
console.log("\nO17: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
