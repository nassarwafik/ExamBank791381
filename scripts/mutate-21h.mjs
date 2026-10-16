#!/usr/bin/env node
// Phase 21H — mutation campaigns for the teacher dashboard («لوحة المتابعة») invariants (AGENTS.md §9). Same engine and rules as
// scripts/mutate-21g.mjs: each mutant plants ONE deliberate defect (an exact, unique text replacement), runs the focused Vitest files
// that guard it, and is KILLED only if a test fails because of it. A timeout is reported as TIMEOUT (never as killed). Every mutated
// file is restored byte-for-byte and hash-verified after each mutant — also when the run throws or the process is interrupted.
//
//   node scripts/mutate-21h.mjs <campaign> [ids]   campaigns: h0, h1, … (see CAMPAIGNS below); ids = comma-separated mutant ids to
//                                                  re-run in isolation (e.g. a TIMEOUT, or a survivor after its test was fixed)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");

const TODAY = "api/src/functions/teacher-today.js", HUB = "src/teacher/TeacherTodayHub.tsx", FMT = "src/teacher/todayFormat.ts";
const H0_API = ["api/tests/today-live-21h0.test.js", "api/tests/today-hub-9a.test.js"];
const H0_UI = ["src/teacher/todayFormat.21h0.test.ts", "src/teacher/TeacherTodayHub.21h0.test.tsx"];
const EVAL = "api/src/lib/project-tracker/evaluation-attention.js", EVAL_UI = "src/teacher/teacherTodayEvaluation.ts";
const H1_API = ["api/tests/project-review-21h1.test.js", "api/tests/teacher-project-evaluation-9c.test.js"], H1_UI = ["src/teacher/TeacherTodayHub.21h1.test.tsx", "src/teacher/TeacherTodayHub.9f.test.tsx", "src/teacher/TeacherTodayHub.9c.test.tsx"];
export const CAMPAIGNS = {
  h1: [
    { id: "H1-M1", what: "review counts every ungraded stage again", file: EVAL,
      find: "const readyStages = e.stages.filter(st => st.status === READY).length;", replace: "const readyStages = e.ungradedStages;", tests: H1_API },
    { id: "H1-M2", what: "review counts approved stages", file: EVAL,
      find: "const READY = \"ready_for_review\";", replace: "const READY = \"approved\";", tests: H1_API },
    { id: "H1-M3", what: "the review total counts students instead of stages", file: EVAL,
      find: "totalReadyStages: reviewRows.reduce((n, r) => n + r.readyStages, 0),", replace: "totalReadyStages: reviewRows.length,", tests: H1_API },
    { id: "H1-M4", what: "review rows are not ordered by submitted stages", file: EVAL,
      find: "  return b.readyStages - a.readyStages\n    || collator", replace: "  return 0\n    || collator", tests: H1_API },
    { id: "H1-M5", what: "the card keeps the 9C reading although review is present", file: HUB,
      find: "  if (data && data.review) return <ProjectReviewCard", replace: "  if (false && data && data.review) return <ProjectReviewCard", tests: H1_UI },
    { id: "H1-M6", what: "the evaluation queue is built from the 9C rows", file: HUB,
      find: "const rows = projectEval ? (projectEval.review ? projectEval.review.attention : projectEval.attention) : [];", replace: "const rows = projectEval ? projectEval.attention : [];", tests: H1_UI },
    { id: "H1-M7", what: "a row with no submitted stage is listed", file: EVAL_UI,
      find: "if (base && isCount(ready) && ready > 0) attention.push", replace: "if (base && isCount(ready)) attention.push", tests: H1_UI },
    { id: "H1-M8", what: "a malformed review block is trusted", file: EVAL_UI,
      find: "if (!isCount(r.studentsAwaitingReview) || !isCount(r.totalReadyStages) || !Array.isArray(r.attention)) return undefined;", replace: "if (!Array.isArray(r.attention)) return undefined;", tests: H1_UI }
  ],
  h0: [
    { id: "H0-M1", what: "every open attempt counts as active now (no activity window)", file: TODAY,
      find: "if(status!==\"paused\"&&lastActivityAt&&nowMs-lastActivityAt<=LIVE_WINDOW_MS)", replace: "if(status!==\"paused\")", tests: H0_API },
    { id: "H0-M2", what: "a paused attempt counts as active now", file: TODAY,
      find: "if(status!==\"paused\"&&lastActivityAt&&", replace: "if(lastActivityAt&&", tests: H0_API },
    { id: "H0-M3", what: "the last autosave is ignored (only the start time decides)", file: TODAY,
      find: "lastActivityAt=Math.max(ms(live.lastSavedAt),ms(live.startedAt));", replace: "lastActivityAt=ms(live.startedAt);", tests: H0_API },
    { id: "H0-M4", what: "the window boundary is exclusive", file: TODAY,
      find: "nowMs-lastActivityAt<=LIVE_WINDOW_MS", replace: "nowMs-lastActivityAt<LIVE_WINDOW_MS", tests: H0_API },
    { id: "H0-M5", what: "an unreadable start counts as active now", file: TODAY,
      find: "lastActivityAt&&nowMs-lastActivityAt<=LIVE_WINDOW_MS", replace: "(!lastActivityAt||nowMs-lastActivityAt<=LIVE_WINDOW_MS)", tests: H0_API },
    { id: "H0-M6", what: "Arabic agreement collapses to one form (\"8 تسليم\")", file: FMT,
      find: 'few: "{n} تسليمات", many: "{n} تسليمًا"', replace: 'few: "{n} تسليم", many: "{n} تسليم"', tests: H0_UI },
    { id: "H0-M7", what: "a zero keeps its alarm colour", file: HUB,
      find: '<article className={"eb-attention-card tone-" + (count > 0 ? tone : "neutral")}', replace: '<article className={"eb-attention-card tone-" + tone}', tests: H0_UI },
    { id: "H0-M8", what: "a time ahead of now reads as an age", file: FMT,
      find: "if (min < 1) return \"الآن\";", replace: "if (min === 0) return \"الآن\";", tests: H0_UI },
    { id: "H0-M9", what: "the stale card is dropped (idle attempts vanish)", file: HUB,
      find: "{stale && <Card id=\"eb-today-stale\"", replace: "{false && stale && <Card id=\"eb-today-stale\"", tests: H0_UI },
    { id: "H0-M10", what: "a malformed staleAttempts block is trusted", file: HUB,
      find: "staleAttempts: o.attention.staleAttempts && Array.isArray(o.attention.staleAttempts.items) ? o.attention.staleAttempts : undefined", replace: "staleAttempts: o.attention.staleAttempts", tests: H0_UI }
  ]
};

const name = process.argv[2];
const campaign = CAMPAIGNS[name];
if (!campaign) { console.error("usage: node scripts/mutate-21h.mjs <" + Object.keys(CAMPAIGNS).join("|") + ">"); process.exit(2); }

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
