#!/usr/bin/env node
// Tadris+ O4 — mutation proof for «سجل نشاطي» per teacher (approved design docs/enterprise-teacher-activity-log-o4.md): the
// reader uses the teacher's own index, re-checks ownership on the event, the pointer is written before the event, a strict write
// refuses without its pointer, and the inverted stamp lists newest first. Same engine and rules as scripts/mutate-p10l.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/audit-history-o4.test.js", "api/tests/audit-history-r19.test.js", "api/tests/audit-retention-p9b3.test.js"];
const R = "api/src/functions/audit-history.js";
const L = "api/src/lib/audit-log.js";

export const MUTANTS = [
  { id: "O4-M1", what: "the reader ignores the index (back to the platform-wide window only)", edits: [{ file: R, find: "    if (tenant && indexableId(tenant)) {", replace: "    if (false && tenant && indexableId(tenant)) {" }] },
  { id: "O4-M2", what: "a pointer is trusted without re-checking whose event it leads to", edits: [{ file: R, find: "        if (!stored || !mine(stored)) continue;\n        take(stored, key);\n      }\n    }\n\n    // Today's window", replace: "        if (!stored) continue;\n        take(stored, key);\n      }\n    }\n\n    // Today's window" }] },
  { id: "O4-M3", what: "the event is written before its pointers", edits: [{ file: L, find: "    if (prefix === AUDIT_PREFIX) {\n      for (const teacher of indexOwners(event)) {", replace: "    await uploadJson(container, name, record);\n    if (prefix === AUDIT_PREFIX) {\n      for (const teacher of indexOwners(event)) {" }, { file: L, find: "      }\n    }\n    await uploadJson(container, name, record);\n", replace: "      }\n    }\n" }] },
  { id: "O4-M4", what: "a strict write goes on without its pointer", edits: [{ file: L, find: "        catch (e) { if (strict) throw e; }\n      }\n    }", replace: "        catch { /* swallowed */ }\n      }\n    }" }] },
  { id: "O4-M5", what: "the stamp is not inverted (the oldest pointers are listed first)", edits: [{ file: L, find: "String(INVERT_BASE - ms).padStart(13, \"0\")", replace: "String(ms).padStart(13, \"0\")" }] },
  { id: "O4-M6", what: "an unsafe id (a path) is indexed", edits: [{ file: L, find: "const INDEX_ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;", replace: "const INDEX_ID_RE = /^.{1,64}$/;" }] }
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
console.log("\nO4: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
