#!/usr/bin/env node
// Tadris+ P7-A1 — mutation proof for serving each dashboard section only with the capability behind it (blueprint §9.2): the session
// grants (enforce only, fail closed), the widget rule (ALL capabilities), the Today hub's withheld reads (assignments, messages,
// projects), the analytics without the assignment sources, the AI analysis refusal, the reports' academic / project parts, and the UI
// following `widgets`. Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/dashboard-sections-p7a1.test.js", "src/teacher/TeacherTodayHub.p7a1.test.tsx", "src/TeacherDashboard.p7a1.test.tsx", "src/reports/ReportViews.p7a1.test.tsx"];
const SG = "api/src/lib/access/session-grants.js";
const DW = "api/src/lib/dashboard-widgets.js";
const TT = "api/src/functions/teacher-today.js";
const TA = "api/src/functions/teacher-analytics.js";
const CORE = "api/src/lib/teacher-analytics-core.js";
const AI = "api/src/functions/teacher-analytics-ai.js";
const RP = "api/src/functions/reports.js";
const HUB = "src/teacher/TeacherTodayHub.tsx";
const DASH = "src/TeacherDashboard.tsx";
const RV = "src/reports/ReportViews.tsx";

export const MUTANTS = [
  { id: "P7A1-M1", what: "sections are never narrowed, even while enforcing", edits: [{ file: SG, find: "  if (mode !== \"enforce\") return EVERYTHING;", replace: "  return EVERYTHING;" }] },
  { id: "P7A1-M2", what: "an unreadable revision answers every section (fail open)", edits: [{ file: SG, find: "    obs?.logWarn?.(\"access.sections.unavailable\", { reason: String(e && e.code || \"error\") });\n    return { ok: false, response: accessUnavailableResponse() };", replace: "    return EVERYTHING;" }] },
  { id: "P7A1-M3", what: "a widget is shown when ANY of its capabilities is held", edits: [{ file: DW, find: "x.capabilities.every(c => has(c))", replace: "x.capabilities.some(c => has(c))" }] },
  { id: "P7A1-M4", what: "the Today hub reads the assignments without assignments.assignment.view", edits: [{ file: TT, find: "const withAssignments=ASSIGNMENT_WIDGETS.some(shows),", replace: "const withAssignments=true," }] },
  { id: "P7A1-M5", what: "the Today hub reads the unread messages without messages.inbox.read", edits: [{ file: TT, find: "  if(withMessages){", replace: "  if(true){" }] },
  { id: "P7A1-M6", what: "the Today hub reads the project progress without projects.tracker.view", edits: [{ file: TT, find: "   withProjects?(deps.loadProjectEvaluationSources", replace: "   true?(deps.loadProjectEvaluationSources" }] },
  { id: "P7A1-M7", what: "the Today hub sends the project block without projects.tracker.view", edits: [{ file: TT, find: "...(withProjects?{projectEvaluation}:{})", replace: "projectEvaluation" }] },
  { id: "P7A1-M8", what: "the analytics read the assignments without assignments.assignment.view", edits: [{ file: TA, find: "        assignments: grants.has(ASSIGNMENTS_CAPABILITY)", replace: "        assignments: true" }] },
  { id: "P7A1-M9", what: "the analytics core lists the assignment documents anyway", edits: [{ file: CORE, find: "    withAssignments ? listJson(container, ASSIGNMENT_PREFIX) : Promise.resolve([]),", replace: "    listJson(container, ASSIGNMENT_PREFIX)," }] },
  { id: "P7A1-M10", what: "the class comparison is computed without the assignments", edits: [{ file: CORE, find: "  const classComparison = mode !== \"global\" || !withAssignments ? [] : classes", replace: "  const classComparison = mode !== \"global\" ? [] : classes" }] },
  { id: "P7A1-M11", what: "the insights speak of assignments a teacher without them cannot see", edits: [{ file: CORE, find: "    if (followUp.length && academic) {", replace: "    if (followUp.length) {" }] },
  { id: "P7A1-M12", what: "the AI analysis runs without assignments.assignment.view", edits: [{ file: AI, find: "      if (!grants.has(ASSIGNMENTS_CAPABILITY)) return {", replace: "      if (false) return {" }] },
  { id: "P7A1-M13", what: "the assessments report is served without assignments.assignment.view", edits: [{ file: RP, find: "        if (!academic) return notGranted(ASSIGNMENTS_CAPABILITY);\n", replace: "" }] },
  { id: "P7A1-M14", what: "the project reports are served without projects.tracker.view", edits: [{ file: RP, find: "        if (!projectsAllowed) return notGranted(PROJECTS_CAPABILITY);\n", replace: "" }] },
  { id: "P7A1-M15", what: "the class report carries its assignment figures anyway", edits: [{ file: RP, find: "kpis: academic ? {", replace: "kpis: true ? {" }] },
  { id: "P7A1-M16", what: "the student report carries its academic part anyway", edits: [{ file: RP, find: "          academic: academic ? {", replace: "          academic: true ? {" }] },
  { id: "P7A1-M17", what: "the report filters list the projects without projects.tracker.view", edits: [{ file: RP, find: "projectsAllowed ? getSupportedProjects().map(getProjectMeta) : []", replace: "getSupportedProjects().map(getProjectMeta)" }] },
  { id: "P7A1-M18", what: "the Today hub shows every card whatever `widgets` says", edits: [{ file: HUB, find: "  const shows = (id: string) => !data?.widgets || data.widgets.includes(id);", replace: "  const shows = (id: string) => !!id;" }] },
  { id: "P7A1-M19", what: "the dashboard shows every analysis section whatever `widgets` says", edits: [{ file: DASH, find: " const shows=(id:string)=>!Array.isArray(data.widgets)||data.widgets.includes(id);", replace: " const shows=(id:string)=>!!id;" }] },
  { id: "P7A1-M20", what: "the class report renders its assignment figures from a withheld `kpis: null`", edits: [{ file: RV, find: "        {kpis && <>", replace: "        {<>" }] }
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
console.log("\nP5-B3b: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
