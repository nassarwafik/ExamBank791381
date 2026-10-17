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
const RENDERER = "src/learning/reader/LearningPageRenderer.tsx", SWIPE = "src/learning/reader/useReaderSwipe.ts", SETTINGS = "src/learning/reader/readingSettings.ts";
const UNIT = "src/learning/reader/UnitContents.tsx", L1CSS = "src/learning/reader/reader-enterprise-l1.css";
const L1 = ["src/learning/reader/LearningReader.l1.test.tsx", "src/learning/reader/reader.l1.guards.test.ts"];
const ROUTE = "src/learning/learningRoute.ts", APP = "src/App.tsx", STUDENT_LIST = "src/student/StudentLearningMaterials.tsx", PORTAL = "src/StudentPortal.tsx";
const L2 = ["src/learning/LearningMaterialsPage.l2.test.tsx", "src/student/StudentLearningMaterials.l2.test.tsx"];
const L2_APP = ["src/App.learningRoute.l2.test.tsx"], L2_PORTAL = ["src/StudentPortal.learningMaterials.test.tsx"];
export const CAMPAIGNS = {
  l2: [
    { id: "L2-M1", what: "a view change is not a history entry (Back leaves the page)", file: PAGE,
      find: "writeLearningRoute(routeFromView(next), \"push\");", replace: "writeLearningRoute(routeFromView(next), \"replace\");", tests: L2 },
    { id: "L2-M2", what: "every page turn floods the history", file: PAGE,
      find: "writeLearningRoute({ kind: \"reader\", courseId, pageId }, \"replace\")", replace: "writeLearningRoute({ kind: \"reader\", courseId, pageId }, \"push\")", tests: L2 },
    { id: "L2-M3", what: "Back / Forward are ignored", file: PAGE,
      find: "    window.addEventListener(\"popstate\", onPop);\n", replace: "", tests: L2 },
    { id: "L2-M4", what: "the fragment outlives the page", file: PAGE,
      find: "return () => { window.removeEventListener(\"popstate\", onPop); clearLearningRoute(); };", replace: "return () => { window.removeEventListener(\"popstate\", onPop); };", tests: L2 },
    { id: "L2-M5", what: "an unknown book in a link opens a broken overview", file: PAGE,
      find: "  if (!course || course.status !== \"available\") return { kind: \"library\" };\n", replace: "  if (!course) return { kind: \"course\", courseId: route.courseId };\n", tests: L2 },
    { id: "L2-M6", what: "the parser accepts trailing segments", file: ROUTE,
      find: "if (!ID.test(courseId) || rest.length > 0) return null;", replace: "if (!ID.test(courseId)) return null;", tests: L2 },
    { id: "L2-M7", what: "the parser accepts any verb as «read»", file: ROUTE,
      find: "  if (verb !== \"read\") return null;\n", replace: "", tests: L2 },
    { id: "L2-M8", what: "the parser accepts a malformed page id", file: ROUTE,
      find: "return ID.test(pageId) ? { kind: \"reader\", courseId, pageId } : null;", replace: "return { kind: \"reader\", courseId, pageId };", tests: L2 },
    { id: "L2-M9", what: "sign-in ignores the Learning Materials link", file: APP,
      find: "        isLearningLocation() ? \"learning\" : \"builder\"\n", replace: "        \"builder\"\n", tests: L2_APP },
    { id: "L2-M10", what: "the Reader ignores the chosen unit", file: READER,
      find: "const moduleStart = initialModuleRef.current ? pages.find(p => p.module.id === initialModuleRef.current)?.page.id : undefined;", replace: "const moduleStart = undefined;", tests: L2 },
    { id: "L2-M11", what: "the unit wins over a valid page (a training return jumps away)", file: READER,
      find: "wanted && findPage(manifest, wanted) ? wanted : moduleStart ?? (pages.length > 0 ? pages[0].page.id : \"\")", replace: "moduleStart ?? (wanted && findPage(manifest, wanted) ? wanted : pages.length > 0 ? pages[0].page.id : \"\")", tests: L2 },
    { id: "L2-M12", what: "a unit hidden since load still opens", file: STUDENT_LIST,
      find: "    if (moduleId && !current.modules.some(m => m.moduleId === moduleId)) { setError(\"لم تعد هذه الوحدة متاحة لصفك حاليًا.\"); return; }\n", replace: "", tests: L2 },
    { id: "L2-M13", what: "the portal drops the chosen unit", file: PORTAL,
      find: "setReaderInitialModuleId(moduleId); setReaderCourse(course);", replace: "setReaderInitialModuleId(undefined); setReaderCourse(course);", tests: L2_PORTAL }
  ],
  l1: [
    { id: "L1-M1", what: "the index docks below 1280px again", file: READER,
      find: "const dockable = wide && !focusMode && !presentation;", replace: "const dockable = !focusMode && !presentation;", tests: L1 },
    { id: "L1-M2", what: "focus mode keeps the docked index", file: READER,
      find: "const dockable = wide && !focusMode && !presentation;", replace: "const dockable = wide && !presentation;", tests: L1 },
    { id: "L1-M3", what: "the docked / folded choice is not remembered", file: READER,
      find: "setTocDocked(docked => { saveTocDocked(!docked); return !docked; });", replace: "setTocDocked(docked => !docked);", tests: L1 },
    { id: "L1-M4", what: "the focus flag outlives focus mode and the Reader", file: READER,
      find: "    return () => html.removeAttribute(\"data-eb-reading-focus\");", replace: "    return () => {};", tests: L1 },
    { id: "L1-M5", what: "Escape no longer leaves focus mode", file: READER,
      find: "      if (e.key === \"Escape\" && focusMode && !presentation) { e.preventDefault(); setFocusMode(false); return; }\n", replace: "", tests: L1 },
    { id: "L1-M6", what: "«التالي» loses the next page's title as its description", file: READER,
      find: "aria-describedby={next && !presentation ? \"learning-reader-next-title\" : undefined}", replace: "aria-describedby={undefined}", tests: L1 },
    { id: "L1-M7", what: "the «المزيد» menu stays open after an action", file: READER,
      find: "onClick={e => { if ((e.target as Element).closest(\"button\")) setMoreOpen(false); }}", replace: "", tests: L1 },
    { id: "L1-M8", what: "the page kicker names the book number again", file: RENDERER,
      find: "<p className=\"learning-reader-kicker\">{header.moduleTitle}</p>", replace: "<p className=\"learning-reader-kicker\">كتاب {header.courseId}</p>", tests: L1 },
    { id: "L1-M9", what: "the source line is a bare line of numbers again", file: RENDERER,
      find: "        {header.source && <SourceInfo source={header.source} />}\n      </header>", replace: "        {header.source && <SourceLine source={header.source} />}\n      </header>", tests: L1 },
    { id: "L1-M10", what: "the swipe direction is inverted (LTR habit)", file: SWIPE,
      find: "if (dx > 0) onNext(); else onPrevious();", replace: "if (dx < 0) onNext(); else onPrevious();", tests: L1 },
    { id: "L1-M11", what: "a swipe that starts on a control turns the page", file: SWIPE,
      find: "  if (owner && root.contains(owner)) return true;", replace: "", tests: L1 },
    { id: "L1-M12", what: "a vertical scroll counts as a swipe", file: SWIPE,
      find: " || Math.abs(dx) < DOMINANCE * Math.abs(dy)", replace: "", tests: L1 },
    { id: "L1-M13", what: "the «داكن» choice is forgotten on reload", file: SETTINGS,
      find: "v.theme === \"sepia\" || v.theme === \"light\" || v.theme === \"dark\"", replace: "v.theme === \"sepia\" || v.theme === \"light\"", tests: L1 },
    { id: "L1-M14", what: "the unit contents list the opener lesson itself", file: UNIT,
      find: ".filter(l => l.id !== currentLessonId && l.pages.length > 0)", replace: ".filter(l => l.pages.length > 0)", tests: L1 },
    { id: "L1-M15", what: "focus mode hides the whole page column, not only its header", file: L1CSS,
      find: "html[data-eb-reading-focus] .eb-shell-main > .eb-page-header { display: none; }", replace: "html[data-eb-reading-focus] .eb-shell-main { display: none; }", tests: L1 },
    { id: "L1-M16", what: "the folded index still shows its desktop column", file: L1CSS,
      find: "  .learning-reader:not(.is-presentation)[data-toc=\"drawer\"] .learning-reader-sidebar { display: none; }", replace: "", tests: L1 }
  ],
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
