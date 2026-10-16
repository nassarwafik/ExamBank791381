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
const DASH = "src/TeacherDashboard.tsx";
const H2_API = ["api/tests/today-scope-21h2.test.js"], H2_UI = ["src/TeacherDashboard.scope.21h2.test.tsx", "src/teacher/TeacherTodayHub.9a.test.tsx"];
const H3_API = ["api/tests/today-categories-21h3.test.js"], H3_UI = ["src/teacher/TeacherTodayHub.21h3.test.tsx", "src/teacher/TeacherTodayHub.12b.test.tsx", "src/teacher/todayFormat.21h0.test.ts"];
const DOCCACHE = "api/src/lib/etag-doc-cache.js";
const H4 = ["api/tests/etag-doc-cache-21h4.test.js", "api/tests/read-cost-teacher-today-12e.test.js"];
const H5 = ["src/teacher/dashboardGate.21h5.test.ts"], DCSS = "src/dashboard-pro.css", TCSS = "src/teacher/teacherToday.css";
export const CAMPAIGNS = {
  h5: [
    { id: "H5-M1", what: "a chart canvas is exposed as an unnamed image again", file: DASH,
      find: "<Bar data={data} options={options} aria-hidden=\"true\"/></div>;\n}\nfunction ClassComparisonChart", replace: "<Bar data={data} options={options}/></div>;\n}\nfunction ClassComparisonChart", tests: H5 },
    { id: "H5-M2", what: "the dashboard toolbar loses its 44 px touch size", file: DCSS,
      find: "  .eb-dash-toolbar :is(button, select), .eb-dash-field select,", replace: "  .eb-dash-field select,", tests: H5 },
    { id: "H5-M3", what: "table links stay 19 px tall on touch", file: DCSS,
      find: "  .analytics-link{ display:inline-flex; align-items:center; min-height:44px; min-width:44px; }", replace: "  .analytics-link{ display:inline-flex; align-items:center; }", tests: H5 },
    { id: "H5-M4", what: "the hub's row actions lose their touch size", file: TCSS,
      find: "  .eb-today-row-action, .eb-today-recent-action, .eb-today-row-secondary, .eb-today-card-action,", replace: "  .eb-today-recent-action, .eb-today-card-action,", tests: H5 },
    { id: "H5-M5", what: "the hub grid goes back to narrow ragged cards", file: TCSS,
      find: ".eb-today-grid{ grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); align-items:stretch; }", replace: ".eb-today-grid{ grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); align-items:start; }", tests: H5 }
  ],
  h4: [
    { id: "H4-M1", what: "a cached document is used although its ETag changed", file: DOCCACHE,
      find: "if (hit && hit.etag === etag) {", replace: "if (hit) {", tests: H4 },
    { id: "H4-M2", what: "a blob listed without an ETag is served from the cache", file: DOCCACHE,
      find: "const hit = s && etag ? s.map.get(name) : null;", replace: "const hit = s ? s.map.get(name) : null;\n    if (hit && !etag) { cached++; return JSON.parse(hit.text); }", tests: H4 },
    { id: "H4-M3", what: "a hit returns the shared cached object (mutations leak across requests)", file: DOCCACHE,
      find: "      cached++;\n      return JSON.parse(hit.text);", replace: "      cached++;\n      return hit.obj || (hit.obj = JSON.parse(hit.text));", tests: H4 },
    { id: "H4-M4", what: "the cache is not bounded by entries", file: DOCCACHE,
      find: "while (s.map.size > cache.maxEntries || s.bytes > cache.maxBytes) {", replace: "while (s.bytes > cache.maxBytes) {", tests: H4 },
    { id: "H4-M5", what: "two containers share one cache", file: DOCCACHE,
      find: "  let s = cache.byContainer.get(container);\n  if (!s) { s = { map: new Map(), bytes: 0 }; cache.byContainer.set(container, s); }", replace: "  let s = cache.byContainer.get(cache);\n  if (!s) { s = { map: new Map(), bytes: 0 }; cache.byContainer.set(cache, s); }", tests: H4 },
    { id: "H4-M6", what: "teacher-today ignores the cache (every refresh downloads everything)", file: TODAY,
      find: "const cacheOf=deps=>(deps.docCache===undefined?DOC_CACHE:deps.docCache);", replace: "const cacheOf=()=>null;", tests: H4 }
  ],
  h3: [
    { id: "H3-M1", what: "a deadline beyond 48 h is listed as closing soon", file: TODAY,
      find: "due-nowMs<=DUE_SOON_MS", replace: "due-nowMs<=2*DUE_SOON_MS", tests: H3_API },
    { id: "H3-M2", what: "a past deadline is listed as closing soon", file: TODAY,
      find: "if(due&&due>nowMs&&due-nowMs", replace: "if(due&&due-nowMs", tests: H3_API },
    { id: "H3-M3", what: "released results are still listed as waiting", file: TODAY,
      find: "releaseMode(a)===\"manual\"&&!resultsReleased(a,nowMs)&&submitted>0", replace: "releaseMode(a)===\"manual\"&&submitted>0", tests: H3_API },
    { id: "H3-M4", what: "a manual assignment with no submission is listed", file: TODAY,
      find: "&&!resultsReleased(a,nowMs)&&submitted>0", replace: "&&!resultsReleased(a,nowMs)", tests: H3_API },
    { id: "H3-M5", what: "every non-immediate mode counts as the teacher's step", file: TODAY,
      find: "if(releaseMode(a)===\"manual\"&&", replace: "if(releaseMode(a)!==\"immediate\"&&", tests: H3_API },
    { id: "H3-M6", what: "an already open assignment is listed as opening soon", file: TODAY,
      find: "if(open&&open>nowMs&&open-nowMs<=OPENING_MS)", replace: "if(open&&open-nowMs<=OPENING_MS)", tests: H3_API },
    { id: "H3-M7", what: "the not-submitted count includes students who submitted", file: TODAY,
      find: "if(attempts.length===0&&st.availability===\"open\")notSubmitted++;", replace: "notSubmitted++;", tests: H3_API },
    { id: "H3-M8", what: "«تذكير» sends without asking", file: HUB,
      find: "    if (!(await confirm({ title: \"تذكير الطلاب\",", replace: "    if (false && !(await confirm({ title: \"تذكير الطلاب\",", tests: H3_UI },
    { id: "H3-M9", what: "«تذكير» is offered on plain-text rows (outside the app)", file: HUB,
      find: "...(openAssignment ? { action: remindAction(i.assignmentId, i.title) } : {}) }))} />", replace: "action: remindAction(i.assignmentId, i.title) }))} />", tests: H3_UI },
    { id: "H3-M10", what: "the closing-soon card is dropped", file: HUB,
      find: "{due && <Card id=\"eb-today-due\"", replace: "{false && due && <Card id=\"eb-today-due\"", tests: H3_UI },
    { id: "H3-M11", what: "a malformed dueSoon block is trusted", file: HUB,
      find: "(b && typeof b.count === \"number\" && Array.isArray(b.items) ? b : undefined)", replace: "(b ? b : undefined)", tests: H3_UI },
    { id: "H3-M12", what: "«خلال» counts the wrong way round", file: FMT,
      find: "const min = Math.floor((t - now) / 60e3);", replace: "const min = Math.floor((now - t) / 60e3);", tests: H3_UI }
  ],
  h2: [
    { id: "H2-M1", what: "?classId= is ignored (the hub stays on every class)", file: TODAY,
      find: "const scopeClassId=scopeOf(request);", replace: "const scopeClassId=\"\";", tests: H2_API },
    { id: "H2-M2", what: "another teacher's class is served (the scope widens past tenancy)", file: TODAY,
      find: "let classes=filterAccessible(allClasses,tenantOf(auth.user));", replace: "let classes=scopeOf(request)?allClasses:filterAccessible(allClasses,tenantOf(auth.user));", tests: H2_API },
    { id: "H2-M3", what: "an unknown class answers with every class instead of 404", file: TODAY,
      find: "if(!classes.some(c=>c&&String(c.classId)===scopeClassId))return {status:404,jsonBody:{ok:false,error:\"الصف غير موجود.\"}};\n   classes=", replace: "if(classes.some(c=>c&&String(c.classId)===scopeClassId))classes=", tests: H2_API },
    { id: "H2-M4", what: "the hub does not send the page's class", file: HUB,
      find: "fetch(\"/api/teacher-today\" + (key ? \"?classId=\" + encodeURIComponent(key) : \"\")", replace: "fetch(\"/api/teacher-today\"", tests: H2_UI },
    { id: "H2-M5", what: "a late answer for an earlier class overwrites the newer one", file: HUB,
      find: "if (!alive.current || mine !== gen.current) return;\n      const parsed", replace: "if (!alive.current) return;\n      const parsed", tests: H2_UI },
    { id: "H2-M6", what: "the previous class's figures stay visible while another class loads", file: HUB,
      find: "const data = loadedFor && loadedFor.key === classId ? loadedFor.data : null;", replace: "const data = loadedFor ? loadedFor.data : null;", tests: H2_UI },
    { id: "H2-M7", what: "the page's «تحديث» does not re-read the hub", file: DASH,
      find: "onClick={()=>{setRefreshSignal(n=>n+1);void loadDashboard()}}", replace: "onClick={()=>{void loadDashboard()}}", tests: H2_UI },
    { id: "H2-M8", what: "the embedded hub keeps its own refresh button", file: HUB,
      find: "actions={embedded ? undefined : <button", replace: "actions={false ? undefined : <button", tests: H2_UI },
    { id: "H2-M9", what: "the hub remounts (and re-reads) when the analytics land", file: DASH,
      find: "const today=renderToday?<Fragment key=\"today\">", replace: "const today=renderToday?<Fragment>", tests: H2_UI }
  ],
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
      find: "const min = Math.floor((now - t) / 60e3);\n  if (min < 1) return \"الآن\";", replace: "const min = Math.floor((now - t) / 60e3);\n  if (min === 0) return \"الآن\";", tests: H0_UI },
    { id: "H0-M9", what: "the stale card is dropped (idle attempts vanish)", file: HUB,
      find: "{stale && <Card id=\"eb-today-stale\"", replace: "{false && stale && <Card id=\"eb-today-stale\"", tests: H0_UI },
    { id: "H0-M10", what: "a malformed staleAttempts block is trusted", file: HUB,
      find: "staleAttempts: block(o.attention.staleAttempts)", replace: "staleAttempts: o.attention.staleAttempts", tests: H0_UI }
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
