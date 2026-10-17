#!/usr/bin/env node
// Phase L (المواد التعليمية) — mutation campaigns for the learning-materials invariants (AGENTS.md §9). Same engine and rules as
// scripts/mutate-21h.mjs: each mutant plants ONE deliberate defect (an exact, unique text replacement), runs the focused Vitest files
// that guard it, and is KILLED only if a test fails because of it. A timeout is reported as TIMEOUT (never as killed). Every mutated
// file is restored byte-for-byte and hash-verified after each mutant — also when the run throws or the process is interrupted.
//
//   node scripts/mutate-l.mjs <campaign> [ids]     campaigns: l0, … (see CAMPAIGNS below); ids = comma-separated mutant ids to
//                                                  re-run in isolation (e.g. a TIMEOUT, or a survivor after its test was fixed)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");

const PAGE = "src/learning/LearningMaterialsPage.tsx", READER = "src/learning/reader/LearningReader.tsx";
const COUNT = "src/learning/arabicCount.ts", PANEL = "src/students/ClassLearningMaterialsPanel.tsx";
const L0_PAGE = ["src/learning/LearningMaterialsPage.l0.test.tsx", "src/learning/LearningMaterialsPage.test.tsx", "src/learning/courseHomePremium.21el1b.review.test.tsx"];
const L0_READER = ["src/learning/reader/LearningReader.l2a.21e.test.tsx", "src/learning/reader/LearningReader.presentation.test.tsx"];
const L0_COUNT = ["src/students/ClassLearningMaterialsPanel.counts.l0.test.tsx"];
export const CAMPAIGNS = {
  l0: [
    { id: "L0-M1", what: "the page-less intro is a control again (opens another section's page)", file: PAGE,
      find: "manifestState === \"ready\" && manifest !== null && sectionStats.get(batchId) === null", replace: "false", tests: L0_PAGE },
    { id: "L0-M2", what: "rows are disabled while the details load or after a failure", file: PAGE,
      find: "manifestState === \"ready\" && manifest !== null && sectionStats.get(batchId) === null", replace: "!sectionStats.get(batchId)", tests: L0_PAGE },
    { id: "L0-M3", what: "a failed manifest load is silent again", file: PAGE,
      find: "{manifestState === \"error\" && (", replace: "{false && (", tests: L0_PAGE },
    { id: "L0-M4", what: "the retry does not reload the manifest", file: PAGE,
      find: "setManifestState(\"loading\"); setAttempt(n => n + 1);", replace: "setManifestState(\"loading\");", tests: L0_PAGE },
    { id: "L0-M5", what: "the load has no visible status", file: PAGE,
      find: "{manifestState === \"loading\" && <p", replace: "{false && <p", tests: L0_PAGE },
    { id: "L0-M6", what: "the reader names the book by its number again", file: READER,
      find: "<span className=\"learning-reader-booktitle\">{bookTitle}", replace: "<span className=\"learning-reader-booktitle\">كتاب {courseId}", tests: L0_READER },
    { id: "L0-M7", what: "presentation mode is labelled by the book number", file: READER,
      find: "\"وضع العرض — \" + bookTitle", replace: "\"وضع العرض — كتاب \" + courseId", tests: L0_READER },
    { id: "L0-M8", what: "every count is printed in the plural again", file: COUNT,
      find: "  const phrase = forms[rules.select(n)];", replace: "  const phrase = forms.few;", tests: L0_COUNT },
    { id: "L0-M9", what: "the summary digits lose their emphasis", file: PANEL,
      find: "{number !== null && <strong>{number}</strong>}", replace: "{number}", tests: L0_COUNT }
  ]
};

const name = process.argv[2];
const campaign = CAMPAIGNS[name];
if (!campaign) { console.error("usage: node scripts/mutate-l.mjs <" + Object.keys(CAMPAIGNS).join("|") + ">"); process.exit(2); }

const originals = new Map();
const restoreAll = () => {
  for (const [file, { buf, hash }] of originals) {
    writeFileSync(path.join(root, file), buf);
    if (sha(readFileSync(path.join(root, file))) !== hash) { console.error("RESTORE FAILED for " + file); process.exitCode = 3; }
  }
};
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { restoreAll(); process.exit(130); });
process.on("exit", restoreAll);

const only = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
const results = [];
for (const m of campaign.filter(x => !only || only.has(x.id))) {
  const abs = path.join(root, m.file);
  if (!originals.has(m.file)) { const buf = readFileSync(abs); originals.set(m.file, { buf, hash: sha(buf) }); }
  const source = originals.get(m.file).buf.toString("utf8");
  const count = source.split(m.find).length - 1;
  if (count !== 1) { results.push({ ...m, verdict: "INVALID (find matched " + count + "×)" }); continue; }
  writeFileSync(abs, source.replace(m.find, m.replace));
  let verdict, killer = "";
  try {
    const run = spawnSync("npx", ["vitest", "run", ...m.tests], { cwd: root, encoding: "utf8", timeout: 600000 });
    if (run.error && run.error.code === "ETIMEDOUT") verdict = "TIMEOUT";
    else if (run.status === 0) verdict = "SURVIVED";
    else {
      const out = (run.stdout || "") + (run.stderr || "");
      const failed = out.match(/FAIL\s+(\S+)\s+>\s+([^\n]+)/);
      verdict = /Tests\s+\d+ failed/.test(out) ? "KILLED" : "ERROR (suite did not run)";
      killer = failed ? failed[1] + " > " + failed[2].trim() : "";
    }
  } finally {
    const { buf, hash } = originals.get(m.file);
    writeFileSync(abs, buf);
    if (sha(readFileSync(abs)) !== hash) { console.error("RESTORE FAILED for " + m.file); process.exit(3); }
  }
  results.push({ ...m, verdict, killer });
  console.log(m.id + " " + verdict + " — " + m.what + (killer ? "\n    killed by: " + killer : ""));
}
// Every mutated file is back to the exact bytes it had before the campaign (hash-verified above); `git status` then shows only what
// was already there before the run (a campaign is run on a committed tree, so it is clean).
const git = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
const status = git.stdout.trim();
console.log("\n" + name + ": " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
