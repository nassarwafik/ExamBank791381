#!/usr/bin/env node
// Tadris+ P8-B1b — mutation proof for hiding the tools the teacher's access refuses inside the remaining pages (presentation only: the
// server enforces every action): messages (each composer, edit / delete), games («إنشاء تحدٍّ», owner decision §19.30), the project
// tracker (sections, the student's profile), the class reading panel, the question bank (saved-exams read, sections, tools) and the
// dashboard's AI section. Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/shell/hideTools.p8b1b.test.tsx", "src/projects/ProjectAccess.p8b1b.test.tsx", "src/TeacherDashboard.scope8a.test.tsx"];

export const MUTANTS = [
  { id: "P8B1b-M1", what: "the direct composer is offered without direct send", edits: [{ file: "src/messages/TeacherMessagesPage.tsx", find: "const mayDirect = can(\"messages.direct.send\"),", replace: "const mayDirect = true," }] },
  { id: "P8B1b-M2", what: "the announcement composer is offered without announcement send", edits: [{ file: "src/messages/TeacherMessagesPage.tsx", find: "mayAnnounce = can(\"messages.announcement.send\"),", replace: "mayAnnounce = true," }] },
  { id: "P8B1b-M3", what: "editing / deleting is offered without any send capability", edits: [{ file: "src/messages/TeacherMessagesPage.tsx", find: "    if (!key || !edit || !remove || !mayManage) return undefined;", replace: "    if (!key || !edit || !remove) return undefined;" }] },
  { id: "P8B1b-M4", what: "«إنشاء تحدٍّ» is offered without games.challenge.create", edits: [{ file: "src/games/TeacherGamesPage.tsx", find: "g.id === \"live-challenge\" && mayAuthor ? {", replace: "g.id === \"live-challenge\" ? {" }] },
  { id: "P8B1b-M5", what: "the games page still promises authoring", edits: [{ file: "src/games/TeacherGamesPage.tsx", find: "description={mayAuthor ? ", replace: "description={true ? " }] },
  { id: "P8B1b-M6", what: "the tracker offers every section without manage", edits: [{ file: "src/projects/ProjectTracker.tsx", find: "  const views = manage ? VIEWS : VIEWS.filter(v => v.key !== \"bulk\" && v.key !== \"settings\");", replace: "  const views = VIEWS;" }] },
  { id: "P8B1b-M7", what: "a student's project profile is editable without manage", edits: [{ file: "src/projects/ProjectStudentDetail.tsx", find: "  const locked = !useCan()(\"projects.tracker.manage\");", replace: "  const locked = !useCan()(\"projects.tracker.manage\") && false;" }] },
  { id: "P8B1b-M8", what: "«إدارة النشر» is offered without module release", edits: [{ file: "src/learning/classReading/ClassReadingPanel.tsx", find: "{mayRelease && <button type=\"button\" className=\"eb-button is-quiet is-small\" aria-expanded={managing}", replace: "{<button type=\"button\" className=\"eb-button is-quiet is-small\" aria-expanded={managing}" }] },
  { id: "P8B1b-M9", what: "«إضافة إلى الصف» is offered without module release", edits: [{ file: "src/learning/classReading/ClassReadingPanel.tsx", find: "{mayRelease && otherClasses.length > 0 && <AttachToClass", replace: "{otherClasses.length > 0 && <AttachToClass" }] },
  { id: "P8B1b-M10", what: "the bank reads the saved exams without the builder", edits: [{ file: "src/bank/ExamBankPage.tsx", find: "    if (!may.saved) return;\n", replace: "" }] },
  { id: "P8B1b-M11", what: "the bank offers the saved-exams section without the builder", edits: [{ file: "src/bank/ExamBankPage.tsx", find: "(v.key !== \"exams\" || may.saved)", replace: "(v.key !== \"exams\" || true)" }] },
  { id: "P8B1b-M12", what: "the bank offers the library section without library access", edits: [{ file: "src/bank/ExamBankPage.tsx", find: "(v.key !== \"library\" || may.library)", replace: "(v.key !== \"library\" || true)" }] },
  { id: "P8B1b-M13", what: "the bank shows the saved-exams count without the builder", edits: [{ file: "src/bank/ExamBankPage.tsx", find: "{may.saved && <StatCard label=\"الامتحانات المحفوظة\"", replace: "{<StatCard label=\"الامتحانات المحفوظة\"" }] },
  { id: "P8B1b-M14", what: "«إضافة سؤال» is offered without question create", edits: [{ file: "src/bank/ExamBankPage.tsx", find: "create: can(\"examBank.question.create\"),", replace: "create: true," }] },
  { id: "P8B1b-M15", what: "«استيراد» is offered without import", edits: [{ file: "src/bank/ExamBankPage.tsx", find: "import: can(\"examBank.import.use\"),", replace: "import: true," }] },
  { id: "P8B1b-M16", what: "a question's «تعديل» / «حذف» are offered without question edit", edits: [{ file: "src/bank/ExamBankPage.tsx", find: "edit: can(\"examBank.question.edit\"),", replace: "edit: true," }] },
  { id: "P8B1b-M17", what: "«إنشاء امتحان جديد» / the library copy are offered without the builder", edits: [{ file: "src/bank/ExamBankPage.tsx", find: "builder: can([\"examBuilder.exam.edit\", \"examBuilder.exam.create\"]),", replace: "builder: true," }] },
  { id: "P8B1b-M18", what: "the dashboard offers the AI analysis without reports.ai.use", edits: [{ file: "src/TeacherDashboard.tsx", find: "const mayAi=useCan()(\"reports.ai.use\");", replace: "const mayAi=true;" }] }
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
console.log("\nP8-B1b: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
