#!/usr/bin/env node
// Tadris+ P2-A1 — mutation campaign for the teacher-session seam (AGENTS.md §9): every teacher route awaits
// requireTeacherSession and none calls requireBuilderAuth itself. Same engine and rules as scripts/mutate-p1a.mjs.
//
//   node scripts/mutate-p2a1.mjs [ids]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/tenancy-registry-21g0.test.js", "api/tests/route-auth-inventory-11a.test.js"];
const SEAM = "api/src/lib/teacher-session.js";

export const MUTANTS = [
  // Follows the seam as P2-A2a / P2-B shaped it (the verifier's result is now named `legacy`).
  { id: "P2A1-M1", what: "the seam accepts any request", edits: [{ file: SEAM, find: "  const legacy = (deps.requireBuilderAuth || requireBuilderAuth)(request);", replace: "  const legacy = { ok: true, user: { sub: \"anyone\" } };" }] },
  { id: "P2A1-M2", what: "a route forgets to await the seam (manage-students)", edits: [{ file: "api/src/functions/manage-students.js", find: "(await requireTeacherSession(request, deps))", replace: "(requireTeacherSession(request, deps))" }] },
  { id: "P2A1-M3", what: "a route forgets to await an authFn alias (manage-assignments)", edits: [{ file: "api/src/functions/manage-assignments.js", find: "await authFn(request, deps)", replace: "authFn(request, deps)" }] },
  { id: "P2A1-M4", what: "a route goes back to calling requireBuilderAuth directly (messages)", edits: [{ file: "api/src/functions/messages.js", find: "(await requireTeacherSession(request, deps))", replace: "(require(\"../lib/builder-auth\").requireBuilderAuth(request))" }] },
  { id: "P2A1-M5", what: "a student-or-teacher route skips the teacher check (learning-content)", edits: [{ file: "api/src/functions/learning-content.js", find: "(await requireTeacherSession(request, deps))", replace: "({ ok: true, user: { sub: \"x\" } })" }] }
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
console.log("\nP2-A1: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
