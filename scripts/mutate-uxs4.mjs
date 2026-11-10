#!/usr/bin/env node
// UX-S4 — mutation proof for «التقدم» and «المشاريع» (design docs/enterprise-ux-student-s4.md §5): no task-count cards, the sources
// folded at zero, one line for zero recognition, the next step, the evaluation as one line for the student only, the next step
// by name and right after the hero, a stage's worth (never «0 / N») before its mark, and the student / teacher hero split.
// Same engine and rules as scripts/mutate-uxs3.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/student/progress.ux-s4.test.tsx", "src/projects/studentProject.ux-s4.test.tsx", "src/StudentPortal.ux7a.test.tsx", "src/projects/projectEvaluation.9b.test.tsx", "src/projects/projectPerformance.test.tsx"];
const S = "src/student/StudentProgressSection.tsx", J = "src/projects/StudentProjectPanel.tsx", E = "src/projects/ProjectEvaluationCard.tsx", H = "src/projects/ProjectRankHero.tsx";

export const MUTANTS = [
  { id: "UXS4-M1", what: "the task-count cards come back in «التقدم»", edits: [{ file: S, find: "      <div className=\"eb-sp-progress-row\">", replace: "      <div className=\"eb-sp-stats\"><span>المهام</span></div>\n      <div className=\"eb-sp-progress-row\">" }] },
  { id: "UXS4-M2", what: "the point sources are always folded", edits: [{ file: S, find: "open={strength.rawTotalPoints > 0 || undefined}", replace: "open={undefined}" }] },
  { id: "UXS4-M3", what: "three zero recognition tiles instead of one line", edits: [{ file: S, find: "  if (medals === 0 && reactions === 0 && achievements === 0) return", replace: "  if (false) return" }] },
  { id: "UXS4-M4", what: "the next step opens «الواجبات» with nothing to do", edits: [{ file: S, find: "{nextStep.actionable > 0", replace: "{nextStep.actionable >= 0" }] },
  { id: "UXS4-M5", what: "the student's evaluation lists the four facts again", edits: [{ file: E, find: "      {variant === \"teacher\" && (\n        <dl className=\"eb-eval-facts\">", replace: "      {(\n        <dl className=\"eb-eval-facts\">" }] },
  { id: "UXS4-M6", what: "the next step shows the stage code again", edits: [{ file: J, find: "<p>الخطوة التالية في {trackMeta.title}: <strong>{next.title}</strong></p>", replace: "<p>الخطوة التالية في {trackMeta.title}: <strong>{next.stageId} — {next.title}</strong></p>" }] },
  { id: "UXS4-M7", what: "an unmarked stage reads «0 / N» again", edits: [{ file: J, find: ": <span>قيمتها في المشروع: <strong dir=\"ltr\">{fmtContribution(value.maxContribution)}</strong></span>)}", replace: ": <span>قيمتها في المشروع: <strong dir=\"ltr\">{fmtContribution(value.contribution)} / {fmtContribution(value.maxContribution)}</strong></span>)}" }] },
  { id: "UXS4-M8", what: "the student's hero shows the facts list again", edits: [{ file: H, find: "        {audience === \"teacher\" && (\n          <dl className=\"eb-prh-facts\">", replace: "        {(\n          <dl className=\"eb-prh-facts\">" }] },
  { id: "UXS4-M9", what: "the next step moves back under the evaluation", edits: [
    { file: J, find: "      {/* Phase 9B — the EVALUATION axis (graded / ungraded stages, average of graded scores), read-only, server-derived. */}\n      {evaluation && <ProjectEvaluationCard id={\"eb-sp-eval-\" + project.projectCode} variant=\"student\" evaluation={evaluation} />}\n", replace: "" },
    { file: J, find: "      {/* UX-S4 — the next step comes right after the hero", replace: "      {evaluation && <ProjectEvaluationCard id={\"eb-sp-eval-\" + project.projectCode} variant=\"student\" evaluation={evaluation} />}\n      {/* UX-S4 — the next step comes right after the hero" }] }
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
console.log("\nUX-S4: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
