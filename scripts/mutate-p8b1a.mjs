#!/usr/bin/env node
// Tadris+ P8-B1a — mutation proof for hiding the tools the teacher's access refuses inside the pages they open (presentation only:
// the server enforces every action): the shared rule (canUse), the reports filters' `available` and the Reports Center, the
// assignments page (sources, saved-exams read, create, menus, gradebook, overview), the students / classes tools and «تذكير» on the
// Today page. Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/shell/hideTools.p8b1a.test.tsx", "src/AppShell.p8b1a.test.tsx", "api/tests/dashboard-sections-p7a1.test.js"];

export const MUTANTS = [
  { id: "P8B1a-M1", what: "the access rule ignores enforcement (a non-enforced session is limited)", edits: [{ file: "src/shell/teacherAccessContext.ts", find: "  if (!access.enforced) return true;\n  const list", replace: "  const list" }] },
  { id: "P8B1a-M2", what: "an unavailable access offers every tool", edits: [{ file: "src/shell/teacherAccessContext.ts", find: "  if (access.status === \"unavailable\") return false;\n  if (!access.enforced) return true;\n  const list", replace: "  if (!access.enforced) return true;\n  const list" }] },
  { id: "P8B1a-M3", what: "the reports filters never say what is available", edits: [{ file: "api/src/functions/reports.js", find: "available: { academic, projects: projectsAllowed } } };", replace: "available: { academic: true, projects: true } } };" }] },
  { id: "P8B1a-M4", what: "the Reports Center offers the assessments report without the academic part", edits: [{ file: "src/reports/ReportsCenter.tsx", find: "    if (type === \"assignments\") return a.academic;\n", replace: "" }] },
  { id: "P8B1a-M5", what: "the Reports Center offers the project reports without the project part", edits: [{ file: "src/reports/ReportsCenter.tsx", find: "    if ([\"project\", \"track\", \"ready\", \"delayed\", \"timeline\"].includes(type)) return a.projects;\n", replace: "" }] },
  { id: "P8B1a-M6", what: "the Reports Center keeps an empty category chip", edits: [{ file: "src/reports/ReportsCenter.tsx", find: "const visibleCategories = CATEGORIES.filter(c => c.key === \"all\" || REPORT_CARDS.some(r => r.category === c.key && offered(r.type)));", replace: "const visibleCategories = CATEGORIES;" }] },
  { id: "P8B1a-M7", what: "the saved exams are read without the builder", edits: [{ file: "src/assignments/useAssignmentComposer.ts", find: "    if (!sources.own || !sources.saved) { setSavedExams([]);", replace: "    if (false) { setSavedExams([]);" }] },
  { id: "P8B1a-M8", what: "the composer does not start on the library for a ready-only teacher", edits: [{ file: "src/assignments/useAssignmentComposer.ts", find: " if (!sources.own && sources.library && sourceMode === \"mine\") void switchSourceMode(\"library\");", replace: "" }] },
  { id: "P8B1a-M9", what: "«امتحاناتي» is offered without assignments.assignment.create", edits: [{ file: "src/assignments/AssignmentComposer.tsx", find: "{p.sources?.own !== false && <button", replace: "{<button" }] },
  { id: "P8B1a-M10", what: "the controller passes every source", edits: [{ file: "src/assignments/useAssignmentsController.ts", find: "  const sources = { own: can(\"assignments.assignment.create\"), saved: can(\"examBuilder.exam.edit\"), library: can(\"examLibrary.item.view\") };", replace: "  const sources = { own: true, saved: true, library: true };" }] },
  { id: "P8B1a-M11", what: "«إنشاء واجب» is offered without create / ready assign", edits: [{ file: "src/AssignmentsPanel.tsx", find: "{can(ASSIGNMENT_CREATE_CAPS)&&<button", replace: "{<button" }] },
  { id: "P8B1a-M12", what: "the schedule actions are offered without schedule", edits: [{ file: "src/assignments/AssignmentList.tsx", find: "const schedule = can(ASSIGNMENT_ACTION_CAPS.schedule),", replace: "const schedule = true," }] },
  { id: "P8B1a-M13", what: "«تعديل العنوان والتعليمات» is offered without content edit", edits: [{ file: "src/assignments/AssignmentList.tsx", find: "details = !!p.onEditDetails && can(ASSIGNMENT_ACTION_CAPS.details),", replace: "details = !!p.onEditDetails," }] },
  { id: "P8B1a-M14", what: "«حذف نهائي» is offered without create", edits: [{ file: "src/assignments/AssignmentList.tsx", find: "purge = can(ASSIGNMENT_ACTION_CAPS.purge);", replace: "purge = true;" }] },
  { id: "P8B1a-M15", what: "an empty assignment menu is still shown", edits: [{ file: "src/assignments/AssignmentList.tsx", find: "  if (archived ? !schedule && !purge : !schedule && !details) return null;\n", replace: "" }] },
  { id: "P8B1a-M16", what: "the gradebook's student menu is offered without schedule", edits: [{ file: "src/assignments/Gradebook.tsx", find: "{!archived && schedule && (", replace: "{!archived && (" }] },
  { id: "P8B1a-M17", what: "the gradebook's selection is offered without schedule", edits: [{ file: "src/assignments/Gradebook.tsx", find: "const sel = archived || !schedule ? undefined : p.selection;", replace: "const sel = archived ? undefined : p.selection;" }] },
  { id: "P8B1a-M18", what: "the marking button is offered without grading", edits: [{ file: "src/assignments/Gradebook.tsx", find: "{grade && s.latestResult && <button", replace: "{s.latestResult && <button" }] },
  { id: "P8B1a-M19", what: "the overview's settings are offered without schedule", edits: [{ file: "src/assignments/AssignmentOverview.tsx", find: "const can = useCan(), schedule = can(\"assignments.schedule.set\"),", replace: "const can = useCan(), schedule = true," }] },
  { id: "P8B1a-M20", what: "«إضافة طالب» is offered without create", edits: [{ file: "src/students/RosterPane.tsx", find: "{can(\"students.student.create\") && <button type=\"button\" className=\"eb-button is-primary\" onClick={p.onAddStudent}", replace: "{<button type=\"button\" className=\"eb-button is-primary\" onClick={p.onAddStudent}" }] },
  { id: "P8B1a-M21", what: "«استيراد» is offered without import", edits: [{ file: "src/students/RosterPane.tsx", find: "{can(\"students.student.import\") && <button type=\"button\" className=\"eb-button\" onClick={p.onImport}", replace: "{<button type=\"button\" className=\"eb-button\" onClick={p.onImport}" }] },
  { id: "P8B1a-M22", what: "the student's «تعديل» is offered without edit", edits: [{ file: "src/students/RosterPane.tsx", find: "{can(\"students.student.edit\") && <button type=\"button\" className=\"eb-menu-item\" onClick={() => p.onEdit(student)}", replace: "{<button type=\"button\" className=\"eb-menu-item\" onClick={() => p.onEdit(student)}" }] },
  { id: "P8B1a-M23", what: "archive is offered without archive", edits: [{ file: "src/students/RosterPane.tsx", find: "{can(student.archived ? \"students.student.restore\" : \"students.student.archive\") && ", replace: "{" }] },
  { id: "P8B1a-M24", what: "delete is offered without delete", edits: [{ file: "src/students/RosterPane.tsx", find: "{can(\"students.student.delete\") && <><hr className=\"eb-menu-sep\" />", replace: "{<><hr className=\"eb-menu-sep\" />" }] },
  { id: "P8B1a-M25", what: "the bulk bar's status group is offered without edit", edits: [{ file: "src/students/BulkActionBar.tsx", find: "{can(\"students.student.edit\") && <div className=\"eb-bulk-group\" role=\"group\" aria-label=\"الحالة\">", replace: "{<div className=\"eb-bulk-group\" role=\"group\" aria-label=\"الحالة\">" }] },
  { id: "P8B1a-M26", what: "«إنشاء صف» is offered without create", edits: [{ file: "src/students/ClassesPane.tsx", find: "{can(\"classes.class.create\") && <button type=\"button\" className=\"eb-button is-primary is-small\" onClick={p.onCreate}>", replace: "{<button type=\"button\" className=\"eb-button is-primary is-small\" onClick={p.onCreate}>" }] },
  { id: "P8B1a-M27", what: "archiving a class is offered without manage", edits: [{ file: "src/students/ClassesPane.tsx", find: "{can(\"classes.class.manage\") && <button type=\"button\" className=\"eb-menu-item\" onClick={() => p.onToggleArchive(classroom)}", replace: "{<button type=\"button\" className=\"eb-menu-item\" onClick={() => p.onToggleArchive(classroom)}" }] },
  { id: "P8B1a-M28", what: "«تذكير» on the Today page is offered without schedule", edits: [{ file: "src/teacher/TeacherTodayHub.tsx", find: "  const mayRemind = can(\"assignments.schedule.set\");", replace: "  const mayRemind = true;" }] },
  { id: "P8B1a-M29", what: "the shell never provides the access to the pages", edits: [{ file: "src/App.tsx", find: "<TeacherAccessContext.Provider value={teacherAccess}>", replace: "<TeacherAccessContext.Provider value={null}>" }] }
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
console.log("\nP8-B1a: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
