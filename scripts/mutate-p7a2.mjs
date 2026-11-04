#!/usr/bin/env node
// Tadris+ P7-A2 — mutation proof for the owner's per-teacher widget choice (`resources.widgets`) and the teacher's arrangement of the
// «اليوم» cards: validation and storage of the choice (revision, resolver, owner routes, history), the data boundary it draws in
// «اليوم», the analytics, the AI analysis and the reports, the arrangement's validation and capability, and the two consoles. Same
// engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/dashboard-widgets-p7a2.test.js", "api/tests/dashboard-sections-p7a1.test.js", "src/teacher/TeacherTodayHub.p7a2.test.tsx", "src/owner/OwnerWidgets.p7a2.test.tsx"];

export const MUTANTS = [
  { id: "P7A2-M1", what: "a stored or saved widget id is not checked", edits: [{ file: "api/src/lib/access/revisions.js", find: "      if (unknown.length) return { ok: false, code: \"WIDGET_UNKNOWN\"", replace: "      if (false) return { ok: false, code: \"WIDGET_UNKNOWN\"" }] },
  { id: "P7A2-M2", what: "a duplicated widget id is accepted", edits: [{ file: "api/src/lib/access/revisions.js", find: "      if (new Set(r.widgets).size !== r.widgets.length) return { ok: false, code: \"WIDGET_DUPLICATE\" };\n", replace: "" }] },
  { id: "P7A2-M3", what: "buildRevision drops the widgets", edits: [{ file: "api/src/lib/access/revisions.js", find: "  for (const k of RESOURCE_KEYS) if (resources[k] !== undefined) out[k] = resources[k];", replace: "  for (const k of RESOURCE_KEYS) if (resources[k] !== undefined && k !== \"widgets\") out[k] = resources[k];" }] },
  { id: "P7A2-M4", what: "the resolver drops the widget entitlement", edits: [{ file: "api/src/lib/access/resolver.js", find: "widgets: entry.widgets ? [...entry.widgets] : null, games", replace: "widgets: null, games" }] },
  { id: "P7A2-M5", what: "sessionGrants ignores the widget entitlement", edits: [{ file: "api/src/lib/access/session-grants.js", find: "widgets: Array.isArray(access.widgets) ? new Set(access.widgets) : null", replace: "widgets: null" }] },
  { id: "P7A2-M6", what: "visibleWidgets ignores the entitlement", edits: [{ file: "api/src/lib/dashboard-widgets.js", find: " && (!entitled || entitled.has(x.id))", replace: "" }] },
  { id: "P7A2-M7", what: "«اليوم» sends the blocks of a widget left out", edits: [{ file: "api/src/functions/teacher-today.js", find: "  for(const [id,keys] of Object.entries(ASSIGNMENT_WIDGET_BLOCKS))if(!shows(id))for(const k of keys)derived.attention[k]=emptyBlock(k);   // P7-A2\n", replace: "" }] },
  { id: "P7A2-M8", what: "«اليوم» sends the recent activity when it is left out", edits: [{ file: "api/src/functions/teacher-today.js", find: "  if(!shows(\"activity.recent\"))derived.recent=[];\n", replace: "" }] },
  { id: "P7A2-M9", what: "the analytics send the overview when it is left out", edits: [{ file: "api/src/lib/teacher-analytics-core.js", find: "  if (!shows(\"scores.overview\")) {\n    Object.assign", replace: "  if (false) {\n    Object.assign" }] },
  { id: "P7A2-M10", what: "the analytics send the trend when it is left out", edits: [{ file: "api/src/lib/teacher-analytics-core.js", find: "  if (!shows(\"scores.trend\")) { out.assignmentTrend = [];", replace: "  if (false) { out.assignmentTrend = [];" }] },
  { id: "P7A2-M11", what: "the insights quote hidden topics", edits: [{ file: "api/src/lib/teacher-analytics-core.js", find: "topicAnalytics: topicsShown ? topicAnalytics : [],", replace: "topicAnalytics," }] },
  { id: "P7A2-M12", what: "the insights are sent when they are left out", edits: [{ file: "api/src/lib/teacher-analytics-core.js", find: "  const insights = !shows(\"insights\") ? [] : buildInsights({", replace: "  const insights = buildInsights({" }] },
  { id: "P7A2-M13", what: "the analytics read the assignments with no assignment widget chosen", edits: [{ file: "api/src/functions/teacher-analytics.js", find: "        assignments: ASSIGNMENT_WIDGETS.some(shows),", replace: "        assignments: true," }] },
  { id: "P7A2-M14", what: "the AI analysis runs without «ملخص العلامات»", edits: [{ file: "api/src/functions/teacher-analytics-ai.js", find: "      if (!shows(\"scores.overview\")) return widgetDenied(\"scores.overview\");\n", replace: "" }] },
  { id: "P7A2-M15", what: "the AI prompt holds the hidden sections", edits: [{ file: "api/src/functions/teacher-analytics-ai.js", find: "tenant: tenantOf(auth.user), shows });", replace: "tenant: tenantOf(auth.user) });" }] },
  { id: "P7A2-M16", what: "the reports' academic part ignores the widget choice", edits: [{ file: "api/src/functions/reports.js", find: "const academic = grants.has(ASSIGNMENTS_CAPABILITY) && academicWidget,", replace: "const academic = grants.has(ASSIGNMENTS_CAPABILITY)," }] },
  { id: "P7A2-M17", what: "the project reports ignore the widget choice", edits: [{ file: "api/src/functions/reports.js", find: "projectsAllowed = grants.has(PROJECTS_CAPABILITY) && projectsWidget;", replace: "projectsAllowed = grants.has(PROJECTS_CAPABILITY);" }] },
  { id: "P7A2-M18", what: "assign drops the widgets", edits: [{ file: "api/src/functions/owner-access.js", find: "resources: resourcesOf(body.courses, body.widgets, body.games, body.appearance), reason: body.reason", replace: "resources: resourcesOf(body.courses, undefined, body.games, body.appearance), reason: body.reason" }] },
  { id: "P7A2-M19", what: "rollback drops the widgets", edits: [{ file: "api/src/functions/owner-access.js", find: "resources: resourcesOf(coursesOf(target), entitledWidgetsOf(target), entitledGamesOf(target), appearanceOfRev(target)),", replace: "resources: resourcesOf(coursesOf(target), null, entitledGamesOf(target), appearanceOfRev(target))," }] },
  { id: "P7A2-M20", what: "the history drops the widgets", edits: [{ file: "api/src/lib/access/history.js", find: "      widgets: doc.resources && Array.isArray(doc.resources.widgets) ? doc.resources.widgets.map(String) : null,   // P7-A2", replace: "      widgets: null," }] },
  { id: "P7A2-M21", what: "the arrangement is saved without appearance.layout.choose", edits: [{ file: "api/src/functions/teacher-profile.js", find: "if (!grants.has(LAYOUT_CAPABILITY)) return { status: 403", replace: "if (false) return { status: 403" }] },
  { id: "P7A2-M22", what: "an unknown / analytics widget id is accepted in the arrangement", edits: [{ file: "api/src/lib/teacher-profile.js", find: "if (v.some(id => typeof id !== \"string\" || !LAYOUT_IDS.has(id)))", replace: "if (v.some(id => typeof id !== \"string\"))" }] },
  { id: "P7A2-M23", what: "a duplicated id is accepted in the arrangement", edits: [{ file: "api/src/lib/teacher-profile.js", find: "    if (new Set(v).size !== v.length) return { ok: false, error: \"بطاقة مكررة في الترتيب.\" };\n", replace: "" }] },
  { id: "P7A2-M24", what: "the hub ignores the teacher's arrangement", edits: [{ file: "src/teacher/TeacherTodayHub.tsx", find: "arrangeSlots(slots.filter(([, node]) => !!node), layout)", replace: "arrangeSlots(slots.filter(([, node]) => !!node), null)" }] },
  { id: "P7A2-M25", what: "arrangeSlots ignores the hidden cards", edits: [{ file: "src/teacher/todayLayout.ts", find: ".filter(({ s }) => !layout.hidden.includes(s[0]))", replace: ".filter(() => true)" }] },
  { id: "P7A2-M26", what: "«ترتيب البطاقات» is offered whatever the server says", edits: [{ file: "src/teacher/TeacherTodayHub.tsx", find: "{a && layoutChoosable && !arranging &&", replace: "{a && !arranging &&" }] },
  { id: "P7A2-M27", what: "the panel offers widgets the server does not serve", edits: [{ file: "src/teacher/TeacherTodayHub.tsx", find: "available={ARRANGEABLE.filter(w => shows(w.id))}", replace: "available={ARRANGEABLE}" }] },
  { id: "P7A2-M28", what: "the owner console never sends the chosen widgets", edits: [{ file: "src/owner/OwnerTeacherDetails.tsx", find: "...(widgetMode === \"some\" ? { widgets: [...chosenWidgets].sort() } : {})", replace: "...({})" }] },
  { id: "P7A2-M29", what: "the owner console does not start from the current widgets (a save resets them)", edits: [{ file: "src/owner/OwnerTeacherDetails.tsx", find: "  const initialWidgets = head && head.valid && Array.isArray(head.widgets) ? head.widgets : null;", replace: "  const initialWidgets = null;" }] }
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
console.log("\nP7-A2: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
