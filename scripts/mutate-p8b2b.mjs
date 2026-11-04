#!/usr/bin/env node
// Tadris+ P8-B2b — mutation proof for the table and view preferences on this device (owner decisions §19.31): validation on read,
// the default as the key's absence, only the chosen part stored (never a search text), storage failures, the test reset, and each
// page's own preference (roster, gradebook order, bank filters, the classes / assignments / project-students views). Same engine and
// rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/ui/devicePrefs.p8b2b.test.tsx", "src/TeacherPlatform.ux4.test.tsx"];

export const MUTANTS = [
  { id: "P8B2b-M1", what: "a stored value is not validated on read", edits: [{ file: "src/ui/devicePrefs.ts", find: "    return raw === null ? null : parse(JSON.parse(raw));", replace: "    return raw === null ? null : JSON.parse(raw);" }] },
  { id: "P8B2b-M2", what: "the default is stored instead of removed", edits: [{ file: "src/ui/devicePrefs.ts", find: "      writeDevicePref(key, same(v, fallback) ? null : stored(v));", replace: "      writeDevicePref(key, stored(v));" }] },
  { id: "P8B2b-M3", what: "the whole value is stored (the search text too)", edits: [{ file: "src/ui/devicePrefs.ts", find: "      writeDevicePref(key, same(v, fallback) ? null : stored(v));", replace: "      writeDevicePref(key, same(v, fallback) ? null : v);" }] },
  { id: "P8B2b-M4", what: "an unreadable storage throws", edits: [{ file: "src/ui/devicePrefs.ts", find: "    return raw === null ? null : parse(JSON.parse(raw));\n  } catch { return null; }", replace: "    return raw === null ? null : parse(JSON.parse(raw));\n  } finally { /* */ }" }] },
  { id: "P8B2b-M5", what: "clearing removes every key, not this module's", edits: [{ file: "src/ui/devicePrefs.ts", find: "if (k && k.startsWith(PREFIX)) keys.push(k);", replace: "if (k) keys.push(k);" }] },
  { id: "P8B2b-M6", what: "the roster's status filter is not remembered", edits: [{ file: "src/TeacherPlatform.tsx", find: "useDevicePref<StatusFilter>(\"roster.status\",\"all\",ROSTER_STATUS);", replace: "useState<StatusFilter>(\"all\");" }] },
  { id: "P8B2b-M7", what: "the roster accepts an unknown sort key", edits: [{ file: "src/TeacherPlatform.tsx", find: "const key=o?ROSTER_SORT_KEYS(o.key):null;", replace: "const key=o?(o.key as SortKey):null;" }] },
  { id: "P8B2b-M8", what: "the gradebook's order resets on every assignment", edits: [{ file: "src/assignments/useAssignmentsController.ts", find: " setGbSearch(\"\"); setGbFilter(\"all\"); setDrillFocus(null);", replace: " setGbSearch(\"\"); setGbFilter(\"all\"); setGbSort(\"name\"); setDrillFocus(null);" }] },
  { id: "P8B2b-M9", what: "the gradebook's order is not remembered", edits: [{ file: "src/assignments/useAssignmentsController.ts", find: "useDevicePref<GradebookSort>(\"gradebook.sort\", \"name\", GRADEBOOK_SORTS);", replace: "useDevicePref<GradebookSort>(\"gradebook.sort.\" + Math.random(), \"name\", GRADEBOOK_SORTS);" }] },
  { id: "P8B2b-M10", what: "the bank accepts an unknown remembered section", edits: [{ file: "src/bank/ExamBankPage.tsx", find: "section: pick(\"section\", x => (SECTIONS as readonly string[]).includes(x)),", replace: "section: pick(\"section\", () => true)," }] },
  { id: "P8B2b-M11", what: "the bank keeps the search text", edits: [{ file: "src/bank/ExamBankPage.tsx", find: "const storedBankFilters = ({ section, type, difficulty, source }: BankFilters) => ({ section, type, difficulty, source });", replace: "const storedBankFilters = (f: BankFilters) => f;" }] },
  { id: "P8B2b-M12", what: "the bank's filters are not remembered", edits: [{ file: "src/bank/ExamBankPage.tsx", find: "useDevicePref<BankFilters>(\"bank.filters\",", replace: "useDevicePref<BankFilters>(\"bank.filters.\" + Math.random()," }] },
  { id: "P8B2b-M13", what: "the classes' compact view is not applied", edits: [{ file: "src/students/ClassesPane.tsx", find: "(listView === \"compact\" ? \" is-compact\" : \"\")", replace: "\"\"" }] },
  { id: "P8B2b-M14", what: "the classes' view is not remembered", edits: [{ file: "src/students/ClassesPane.tsx", find: "useDevicePref<ListView>(\"view.classes\", \"cards\", CLASS_VIEWS);", replace: "useDevicePref<ListView>(\"view.classes.\" + Math.random(), \"cards\", CLASS_VIEWS);" }] },
  { id: "P8B2b-M15", what: "the assignments' compact view is not applied", edits: [{ file: "src/assignments/AssignmentList.tsx", find: "(p.view === \"compact\" ? \" is-compact\" : \"\")", replace: "\"\"" }] },
  { id: "P8B2b-M16", what: "the assignments' view does not reach the list", edits: [{ file: "src/AssignmentsPanel.tsx", find: "now={c.home.now} view={listView}/>", replace: "now={c.home.now}/>" }] },
  { id: "P8B2b-M17", what: "the project students' view is not remembered", edits: [{ file: "src/projects/ProjectStudentCards.tsx", find: "useDevicePref<StudentsView>(\"view.projectStudents\", \"cards\", STUDENTS_VIEWS);", replace: "useDevicePref<StudentsView>(\"view.projectStudents.\" + Math.random(), \"cards\", STUDENTS_VIEWS);" }] }
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
console.log("\nP8-B2b: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
