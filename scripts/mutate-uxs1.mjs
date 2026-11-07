#!/usr/bin/env node
// UX-S1 — mutation proof for the student portal's presentation rules whose failure would mislead the student (design
// docs/enterprise-ux-student-s1.md §5): an optional extra attempt never outranks required work; an unreleased result never shows
// its percentage; logout from the phone menu clears the device's unsent answers; the code is masked by default; the menu keeps
// «تسجيل الخروج». Same engine and rules as scripts/mutate-uxo3.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/student/today/todayPriority.ux-s1.test.ts", "src/student/today/todayPriority.9a.test.ts", "src/shell/StudentShell.ux-s1.test.tsx", "src/student/studentPortal.ux-s1.test.tsx"];
const P = "src/student/today/todayPriority.ts";

export const MUTANTS = [
  { id: "UXS1-M1", what: "an optional extra attempt takes the «موعد قريب» slot again (rule 2 accepts any attemptable item)", edits: [{ file: P, find: "const soon = pickAssignment(assignments, item => isUnstarted(item) && isDueSoon(item, now));", replace: "const soon = pickAssignment(assignments, item => isAttemptable(item) && isDueSoon(item, now));" }] },
  { id: "UXS1-M2", what: "rule 5 no longer prefers an unstarted assignment over an extra attempt", edits: [{ file: P, find: "const open = pickAssignment(assignments, isUnstarted);", replace: "const open = pickAssignment(assignments, isAttemptable);" }] },
  { id: "UXS1-M3", what: "the extra attempt shows the percentage of a result the teacher has not released", edits: [{ file: P, find: "lr && lr.resultsVisible !== false && Number.isFinite", replace: "lr && Number.isFinite" }] },
  { id: "UXS1-M4", what: "logout from the phone menu ends the session without clearing the device's unsent answers", edits: [{ file: "src/shell/StudentShell.tsx", find: "<button type=\"button\" className=\"eb-menu-item is-danger\" onClick={logout}>", replace: "<button type=\"button\" className=\"eb-menu-item is-danger\" onClick={onLogout}>" }] },
  { id: "UXS1-M5", what: "the login code is shown in full by default", edits: [{ file: "src/student/StudentIdentityCard.tsx", find: "const [shown, setShown] = useState(false);", replace: "const [shown, setShown] = useState(true);" }] },
  { id: "UXS1-M6", what: "the phone menu drops «تسجيل الخروج»", edits: [{ file: "src/shell/StudentShell.tsx", find: "            <button type=\"button\" className=\"eb-menu-item is-danger\" onClick={logout}><IconLogout size={16} />تسجيل الخروج</button>\n", replace: "" }] }
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
console.log("\nUX-S1: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
