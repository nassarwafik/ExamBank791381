#!/usr/bin/env node
// Phase 21E.2 mutation certification (AGENTS.md §9): one source mutation at a time in an independent Vitest process, SHA-256
// verified byte-for-byte restoration (also on SIGINT / SIGTERM / SIGHUP and from a stale backup after a hard kill), no parallel
// mutations, a TIMEOUT is never counted as KILLED, a machine-readable ledger. Reference: runner/tests/mutation/load-mutations.js
// and scripts/mutate-function-graphs-21a2.mjs. `--restore` only restores a stale backup. `--only=ID,ID` runs a subset.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";

const T = {
  exportsUnit: "src/teacher/teacherExports.21e2.test.ts",
  exportsPanel: "src/AssignmentsPanel.export.21e2.test.tsx",
  dashboard: "src/TeacherDashboard.chartTables.21e2.test.tsx",
  dashboardOld: "src/TeacherDashboard.test.tsx",
  field: "src/fieldFrame.21e2.test.tsx",
  freeze: "src/compoundFreeze.20d.test.tsx",
  icons: "src/builderIconButtons.8e7.test.tsx",
  labels: "src/teacher/saveLabels.guard.21e2.test.ts",
  surface: "src/ui/useModalSurface.21e2.test.tsx",
  toolbar: "src/builder/BuilderToolbar.21e2.test.tsx",
  reviewFixes: "src/builder/reviewFixes.21e2.test.tsx",
  liveChallenge: "src/games/liveChallenge/LiveChallengeGenerator.test.tsx"
};
const M = (id, file, before, after, tests, what) => ({ id, file, before, after, tests, what });
const mutants = [
  // G — exports
  M("G1-filtered-rows", "src/AssignmentsPanel.tsx", "gradebookCsvRows(resultsFor,results,rowGrading)", "gradebookCsvRows(resultsFor,visibleResults,rowGrading)", [T.exportsPanel], "gradebook export uses the searched / filtered subset"),
  M("G2-row-order", "src/teacher/teacherExports.ts", "for (const s of [...rows].sort(byStudent)) {", "for (const s of [...rows]) {", [T.exportsUnit], "rows follow the input order (unstable)"),
  M("G3-missing-is-zero", "src/teacher/teacherExports.ts", 'Number.isFinite(value) ? value : "");', 'Number.isFinite(value) ? value : 0);', [T.exportsUnit], "a missing value exported as 0"),
  M("G4-private-field", "src/teacher/teacherExports.ts", '      r ? csvDateTime(r.submittedAt) : ""\n    ]);\n  }\n  return out;\n}\n\n/** The subset', '      r ? csvDateTime(r.submittedAt) : "",\n      String((r as unknown as { teacherFeedback?: string })?.teacherFeedback ?? "")\n    ]);\n  }\n  return out;\n}\n\n/** The subset', [T.exportsUnit], "teacher feedback leaks into the gradebook export"),
  M("G5-filename-path", "src/teacher/teacherExports.ts", '/[\\u0000-\\u001f\\u007f\\\\/:*?"<>|]+/g', '/[\\u0000-\\u001f\\u007f:*?"<>|]+/g', [T.exportsUnit], "path separators survive in the download name"),
  M("G6-export-enabled-empty", "src/assignments/Gradebook.tsx", "disabled={p.busy || p.totalRows === 0}", "disabled={p.totalRows < 0}", [T.exportsPanel], "export not disabled while busy / empty"),
  // H — chart tables
  M("H1-null-points", "src/teacher/dashboardChartTables.ts", "return items.filter(x => x.average !== null);", "return items;", [T.dashboard, T.dashboardOld], "the trend table / chart include assignments without an average"),
  M("H2-topic-cap", "src/teacher/dashboardChartTables.ts", "export const TOPIC_CHART_LIMIT = 10;", "export const TOPIC_CHART_LIMIT = 12;", [T.dashboard, T.dashboardOld], "the topic table shows more than the plotted ten"),
  M("H3-after-inside-figure", "src/ui/ChartCard.tsx", '<div className="eb-chart-card-figure" role="img" aria-label={ariaLabel || title}>{content}</div>\n        {after}', '<div className="eb-chart-card-figure" role="img" aria-label={ariaLabel || title}>{content}{after}</div>', [T.dashboard], "the class picker is hidden inside role=img"),
  M("H4-empty-as-figure", "src/ui/ChartCard.tsx", "const isEmpty = empty !== undefined && empty !== null && empty !== false;", "const isEmpty = false;", [T.dashboard], "an empty chart still renders a figure + table toggle"),
  // C — Field frame and field rules
  M("C1-invalid-before-touch", "src/ui/Field.tsx", '  const visibleError = hasError && (showError === "always" || touched || reveal);\n  const describedBy = [help ? helpId : "", visibleError ? errorId : ""].filter(Boolean).join(" ") || undefined;\n  const a11y', '  const visibleError = hasError;\n  const describedBy = [help ? helpId : "", visibleError ? errorId : ""].filter(Boolean).join(" ") || undefined;\n  const a11y', [T.field], "a field turns red before the teacher left it"),
  M("C2-error-not-described", "src/ui/Field.tsx", 'const a11y: FieldA11y = { id, ...(describedBy ? { "aria-describedby": describedBy } : {}),', 'const a11y: FieldA11y = { id,', [T.field], "the error / help is not linked with aria-describedby"),
  M("C3-no-aria-invalid", "src/ui/Field.tsx", '...(visibleError ? { "aria-invalid": true as const } : {}) };', "};", [T.field], "aria-invalid never set"),
  M("C4-reveal-ignored", "src/ui/Field.tsx", '  const reveal = useContext(FieldRevealContext);\n  const [touched, setTouched] = useState(false);\n  const hasError = error !== undefined && error !== null && error !== false && error !== "";\n  const visibleError = hasError && (showError === "always" || touched || reveal);\n  const describedBy = [help ? helpId : "", visibleError ? errorId : ""].filter(Boolean).join(" ") || undefined;\n  const a11y', '  const reveal = false && useContext(FieldRevealContext);\n  const [touched, setTouched] = useState(false);\n  const hasError = error !== undefined && error !== null && error !== false && error !== "";\n  const visibleError = hasError && (showError === "always" || touched || reveal);\n  const describedBy = [help ? helpId : "", visibleError ? errorId : ""].filter(Boolean).join(" ") || undefined;\n  const a11y', [T.field], "a question's reveal does not show its field errors"),
  M("C5-group-invalid-dropped", "src/ui/Field.tsx", '{children(visibleError ? { "aria-invalid": true, "aria-describedby": errorId } : {})}', "{children({})}", [T.field], "radios of an invalid group are not marked / described"),
  M("C6-marks-zero-valid", "src/teacher/questionFieldIssues.ts", "if (!Number.isFinite(m) || m <= 0) out.marks", "if (!Number.isFinite(m) || m < 0) out.marks", [T.field], "marks of 0 shown as valid (MARKS_PROBLEM blocks finalization)"),
  M("C7-mcq-index-range", "src/teacher/questionFieldIssues.ts", "if (!Number.isInteger(ci) || ci < 0 || ci >= opts.length) out.answer", "if (!Number.isInteger(ci) || ci < 0) out.answer", [T.field], "an out-of-range correct option shown as valid"),
  M("C8-matching-right-side", "src/teacher/questionFieldIssues.ts", 'if (left === "" || right === "") pairs[i]', 'if (left === "") pairs[i]', [T.field], "a pair without its answer is not flagged"),
  M("C9-numeric-reversed-field", "src/teacher/questionFieldIssues.ts", 'else if (i.code === "NUM_RANGE_REVERSED") out.max = i.message;', 'else if (i.code === "NUM_RANGE_REVERSED") out.min = i.message;', [T.field], "a reversed range flags the wrong bound"),
  M("C10-frame-in-compound-parts", "src/QuestionBodyEditor.tsx", 'if (framed && (type === "multipleChoice" || type === "shortAnswer" || type === "matching")) return', 'if ((type === "multipleChoice" || type === "shortAnswer" || type === "matching")) return', [T.freeze, T.icons], "compound@1 part editors change (freeze F-12)"),
  // E — contextual names
  M("E1-generic-question-up", "src/StructuredQuestionEditor.tsx", 'aria-label={"نقل السؤال " + questionLabel + " للأعلى"}', 'aria-label="أعلى"', [T.icons], "the reorder button no longer says which question moves"),
  // F — save vocabulary
  M("F1-literal-save", "src/assignments/AssignmentList.tsx", 'disabled={busy || !inFuture}>{SAVE_LABELS.saveChanges}</button>', 'disabled={busy || !inFuture}>حفظ</button>', [T.labels], "a bare «حفظ» literal comes back"),
  M("F2-draft-equals-final", "src/teacher/saveLabels.ts", 'finalizeExam: "اعتماد نهائي",', 'finalizeExam: "حفظ مسودة",', [T.labels], "finalize labelled like an ordinary save"),
  // B — modal surface
  M("B1-escape-under-dialog", "src/ui/useModalSurface.ts", "if (!surface || event.defaultPrevented || hasModalAbove(surface)) return;", "if (!surface || event.defaultPrevented) return;", [T.surface], "Escape reaches the builder while a dialog is on top"),
  M("B2-no-focus-return", "src/ui/useModalSurface.ts", 'if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();', "void opener;", [T.surface], "closing the builder drops focus"),
  M("B3-no-tab-wrap", "src/ui/useModalSurface.ts", "if (event.shiftKey && (!inside || current === first || current === surface)) { event.preventDefault(); last.focus(); }", "if (false) { last.focus(); }", [T.surface], "Shift+Tab escapes the surface"),
  M("B4-ime-escape", "src/ui/useModalSurface.ts", "if (event.isComposing) return;", "", [T.surface], "an IME composition's Escape exits the builder"),
  // A — toolbar structure
  M("A1-menu-items-visible", "src/builder/BuilderToolbar.tsx", '<ActionMenu label="المزيد من أدوات الامتحان" text="المزيد" icon={<IconMore size={18} aria-hidden="true" />} className="sb-tb-menu">\n              <MenuItems items={moreItems} />\n            </ActionMenu>', '<MenuItems items={moreItems} />', [T.toolbar], "overflow items rendered as visible buttons (> 8)"),
  // Review Fix (independent adversarial review of the first implementation)
  M("R1-full-identity-in-gradebook", "src/teacher/teacherExports.ts", "      maskedStudentCode(s.studentCode),", "      s.studentCode || \"\",", [T.exportsUnit, T.exportsPanel], "the gradebook export carries the full identity / login number"),
  M("R2-code-back-in-drill", "src/teacher/teacherExports.ts", 'export const RESULTS_COLUMNS = ["الطالب", "الحالة",', 'export const RESULTS_COLUMNS = ["الطالب", "كود الطالب", "الحالة",', [T.exportsUnit, T.dashboard], "the drill export grows an extra column (identity) the screen never shows"),
  M("R3-touch-key-ignored", "src/ui/Field.tsx", "const touched = touchedFor === touchKey;", "const touched = touchedFor !== null;", [T.field], "a visited state moves onto another pair after a delete"),
  M("R4-type-change-reuses-frame", "src/QuestionBodyEditor.tsx", "<FramedLegacyEditor key={type} node={node}", "<FramedLegacyEditor node={node}", [T.field], "a type change inherits the previous type's visited state"),
  M("R5-composer-always-framed", "src/QuestionComposer.tsx", "disabled={disabled} framed={framed} />}", "disabled={disabled} framed />}", [T.field, T.liveChallenge], "Live Challenge shows exam-finalization errors"),
  M("R6-menu-under-overlay", "src/page-parts.css", "z-index:calc(var(--eb-z-modal) + 1);", "z-index:var(--eb-z-dropdown);", [T.reviewFixes], "toolbar menus paint under the builder overlay"),
  M("R7-tab-leaves-menu-open", "src/ui/ActionMenu.tsx", "        if (!panel || !trigger || !panel.contains(document.activeElement)) return;\n        e.preventDefault(); e.stopPropagation();", "        if (!panel || !trigger || !panel.contains(document.activeElement)) return;\n        return;", [T.reviewFixes], "Tab from a menu item leaves the page / surface with the menu open"),
  M("R8-tab-no-modal-wrap", "src/ui/ActionMenu.tsx", "order[at + 1] || (modal ? order[0] : trigger)", "order[at + 1] || trigger", [T.reviewFixes], "Tab from the last menu inside a modal surface does not wrap"),
  M("R9-mcq-options-message-hidden", "src/QuestionBodyEditor.tsx", "error={[issues.options, issues.answer].filter(Boolean).join(\" \")}", "error={issues.answer || issues.options}", [T.field], "the blocking MISSING_OPTIONS message is hidden behind «choose the answer»"),
  M("A2-toggle-state-lost", "src/builder/BuilderToolbar.tsx", "aria-pressed={item.pressed === undefined ? undefined : item.pressed}", "", [T.toolbar], "a menu toggle loses its pressed state")
];

const only = (process.argv.find(a => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const selected = only.length ? mutants.filter(m => only.includes(m.id)) : mutants;
const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const files = [...new Set(selected.map(m => m.file))];
const BACKUP = path.join(os.tmpdir(), "exambank-21e2-mutation-backup.json");
if (fs.existsSync(BACKUP)) {
  const stale = JSON.parse(fs.readFileSync(BACKUP, "utf8"));
  for (const [file, contents] of Object.entries(stale)) fs.writeFileSync(file, contents, "utf8");
  fs.rmSync(BACKUP, { force: true });
  console.log("21E2_MUTATION_RESTORED_STALE_BACKUP", JSON.stringify(Object.keys(stale)));
}
if (process.argv.includes("--restore")) process.exit(0);
const original = new Map(files.map(file => [file, fs.readFileSync(file, "utf8")]));
const restoreAll = () => { for (const [file, contents] of original) fs.writeFileSync(file, contents, "utf8"); fs.rmSync(BACKUP, { force: true }); };
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { restoreAll(); console.error("21E2_MUTATION_INTERRUPTED " + sig + " — sources restored"); process.exit(130); });
const hashes = Object.fromEntries([...original].map(([file, value]) => [file, sha(value)]));
const status = spawnSync("git", ["status", "--porcelain", "--", ...files], { encoding: "utf8" });
if (status.status !== 0 || status.stdout.trim()) { console.error("Mutated source files must start clean.", status.stdout); process.exit(3); }
const vitest = tests => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--reporter=dot", ...tests], { encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, CI: "true" } });
const allTests = [...new Set(selected.flatMap(x => x.tests))];
const baseline = vitest(allTests);
if (baseline.status !== 0) { console.error("BASELINE RED", baseline.stdout.slice(-3500), baseline.stderr.slice(-2000)); process.exit(4); }
console.log("21E2_MUTATION_BASELINE_GREEN", JSON.stringify({ tests: allTests, mutants: selected.length, files: hashes }));
const ledger = [];
fs.writeFileSync(BACKUP, JSON.stringify(Object.fromEntries(original)), "utf8");
try {
  for (const m of selected) {
    let outcome = "invalid", diagnostic = "";
    const source = original.get(m.file);
    const occurrences = source.split(m.before).length - 1;
    if (occurrences !== 1) diagnostic = "needle count " + occurrences;
    else if (m.before === m.after) diagnostic = "mutation identical";
    else {
      try {
        fs.writeFileSync(m.file, source.replace(m.before, m.after), "utf8");
        const result = vitest(m.tests);
        if (["SIGINT", "SIGTERM", "SIGHUP"].includes(result.signal) || result.status === 130) { restoreAll(); console.error("21E2_MUTATION_INTERRUPTED during " + m.id + " — sources restored"); process.exit(130); }
        const output = (result.stdout || "") + "\n" + (result.stderr || "");
        if (result.error?.code === "ETIMEDOUT" || result.signal) { outcome = "timeout"; diagnostic = String(result.error || result.signal); }
        else if (result.status === 0) { outcome = "survived"; diagnostic = "Selected tests passed"; }
        else if (/Transform failed|Failed to parse source|SyntaxError:|Unexpected token|Error during transform|TypeError: .* is not a function/.test(output) && !/AssertionError/.test(output)) { outcome = "invalid"; diagnostic = output.slice(-700); }
        else { outcome = "killed"; diagnostic = output.split("\n").filter(x => /FAIL |AssertionError/.test(x)).slice(0, 2).join(" ").replace(ANSI, "").slice(0, 400); }
      } catch (error) { diagnostic = String(error); }
      finally { fs.writeFileSync(m.file, source, "utf8"); }
    }
    const rec = { id: m.id, file: m.file, what: m.what, outcome, diagnostic };
    ledger.push(rec);
    console.log("21E2_MUTATION_RESULT", JSON.stringify(rec));
  }
} finally { restoreAll(); }
const verified = files.every(f => sha(fs.readFileSync(f, "utf8")) === hashes[f]);
const git = spawnSync("git", ["diff", "--exit-code", "--", ...files], { encoding: "utf8" });
const counts = Object.fromEntries(["killed", "survived", "invalid", "timeout"].map(s => [s, ledger.filter(r => r.outcome === s).length]));
const report = { baseline: "green", source_sha256: hashes, restored: verified && git.status === 0, counts, mutants: ledger };
fs.mkdirSync("artifacts/phase-21e2", { recursive: true });
fs.writeFileSync("artifacts/phase-21e2/mutation-ledger.json", JSON.stringify(report, null, 2) + "\n");
console.log("21E2_MUTATION_SUMMARY", JSON.stringify({ restored: report.restored, counts, report: "artifacts/phase-21e2/mutation-ledger.json" }));
if (!report.restored || counts.invalid || counts.timeout || counts.survived) process.exitCode = 1;
