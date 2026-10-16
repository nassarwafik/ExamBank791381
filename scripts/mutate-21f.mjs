#!/usr/bin/env node
// Phase 21F — mutation campaigns for the Exam Studio invariants (AGENTS.md §9). Each mutant plants ONE deliberate defect (an exact,
// unique text replacement), runs the focused Vitest files that guard it, and is KILLED only if a test fails because of it. A run
// that times out is reported as TIMEOUT (never as killed). Every mutated file is restored byte-for-byte and hash-verified after
// each mutant — also when the run throws or the process is interrupted — and `git status` must be clean afterwards.
//
//   node scripts/mutate-21f.mjs <campaign>      campaigns: f0, f1, … (see CAMPAIGNS below)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");

const F0_API = ["api/tests/saved-exam-safety-21f0.test.js"];
const F0_CLIENT = ["src/structuredSaveConditions.21f0.test.ts", "src/App.saveConflict.21f0.test.tsx"];
const F1_ISO = ["src/StructuredExamBuilder.renderIsolation.21f1.test.tsx"];
const F1_TYPING = ["src/examHistory.typing.21f1.test.tsx"];
const F7_LIST = ["api/tests/saved-exams-list-21f7.test.js"];
const F7_PUBLISH = ["src/studio/studioHome.21f7.test.ts", "src/studio/studioSetupPublish.21f7.test.tsx"];
const F8_SAVE = ["src/studio/autosave.21f8.test.tsx"];
const F8_IDLE = ["src/studio/idleSave.21f8.test.tsx"];
const CTRL = "src/studio/useExamStudioController.ts";
export const CAMPAIGNS = {
  f0: [
    { id: "F0-M1", what: "conditional save ignores the stated base version (If-Match dropped)", file: "api/src/lib/saved-exam-access.js",
      find: "const matches = expected ? currentEtag === expected : current === null;", replace: "const matches = true;", tests: F0_API },
    { id: "F0-M2", what: "a create-only save (base null) overwrites an existing exam", file: "api/src/lib/saved-exam-access.js",
      find: "const matches = expected ? currentEtag === expected : current === null;", replace: "const matches = expected ? currentEtag === expected : true;", tests: F0_API },
    { id: "F0-M3", what: "the write is not conditional on the version the decision was made on", file: "api/src/lib/saved-exam-access.js",
      find: "await io.uploadJsonConditional(container, blobName, document, currentEtag);", replace: "(await io.uploadJson(container, blobName, document), null);", tests: F0_API },
    { id: "F0-M4", what: "owner comparison removed (any teacher may access any exam)", file: "api/src/lib/saved-exam-access.js",
      find: "return !owner || !stored || stored === owner;", replace: "return true;", tests: F0_API },
    { id: "F0-M5", what: "the owner is never stamped on a saved document", file: "api/src/lib/saved-exam-access.js",
      find: "if (ownerId) document.ownerId = ownerId;", replace: "", tests: F0_API },
    { id: "F0-M6", what: "the saved-exams list shows other teachers' exams", file: "api/src/functions/manage-saved-exams.js",
      find: "!canAccessSavedExam(\n          document,\n          owner\n        )", replace: "false", tests: F0_API },
    { id: "F0-M7", what: "load returns another teacher's exam", file: "api/src/functions/manage-saved-exams.js",
      find: "      // Another teacher's exam is reported exactly like a missing one (its existence is not disclosed).\n      if (!canAccessSavedExam(document, owner)) return notFound;", replace: "", tests: F0_API },
    { id: "F0-M8", what: "delete removes another teacher's exam", file: "api/src/functions/manage-saved-exams.js",
      find: "if (document && !canAccessSavedExam(document, owner)) return notFound;", replace: "", tests: F0_API },
    { id: "F0-M9", what: "the client never states a base version (every save unconditional)", file: "src/structuredSavePolicy.ts",
      find: "  return { conditional: true, baseEtag: serverEtag };", replace: "  return {};", tests: F0_CLIENT },
    { id: "F0-M10", what: "the client keeps the stale base after a successful save", file: "src/examHistory.ts",
      find: "  if (typeof serverEtag === \"string\" && serverEtag) next.serverEtag = serverEtag;", replace: "", tests: F0_CLIENT },
    { id: "F0-M11", what: "a 409 conflict is reported as a plain error (no conflict dialog)", file: "src/structuredSavePolicy.ts",
      find: "  if (p.code !== \"EXAM_CONFLICT\") return null;", replace: "  return null;", tests: F0_CLIENT },
    { id: "F0-M12", what: "new exam ids come from the clock again", file: "src/examBuilderState.ts",
      find: "export function newExamId(): string { return genId(\"EXAM\"); }", replace: "export function newExamId(): string { return \"EXAM-\" + Date.now(); }", tests: F0_CLIENT }
  ],
  f1: [
    { id: "F1-M1", what: "question cards are no longer memoized", file: "src/StructuredQuestionEditor.tsx",
      find: "export default memo(StructuredQuestionEditor);", replace: "export default StructuredQuestionEditor;", tests: F1_ISO },
    { id: "F1-M2", what: "section editors are no longer memoized", file: "src/ExamSectionEditor.tsx",
      find: "export default memo(ExamSectionEditor);", replace: "export default ExamSectionEditor;", tests: F1_ISO },
    { id: "F1-M3", what: "issue arrays are not stabilized (every card with an issue re-renders on every edit)", file: "src/builder/stableIssues.ts",
      find: "out.set(key, old && sameList(old, list) ? old : list);", replace: "out.set(key, list);", tests: F1_ISO },
    { id: "F1-M4", what: "a section's question-issue map is rebuilt on every edit (every section re-renders)", file: "src/builder/stableIssues.ts",
      find: "questionsOfSection.set(s.id, old && sameEntries(old, own) ? old : own);", replace: "questionsOfSection.set(s.id, own);", tests: F1_ISO },
    { id: "F1-M5", what: "the actions' implementation is captured once (stale exam in later actions)", file: "src/StructuredExamBuilder.tsx",
      find: "      requestImage: q => (requestQuestionImage ? requestQuestionImage(q) : Promise.reject(new Error(\"no image service\")))\n    };\n  });", replace: "      requestImage: q => (requestQuestionImage ? requestQuestionImage(q) : Promise.reject(new Error(\"no image service\")))\n    };\n  }, []);", tests: F1_ISO },
    { id: "F1-M6", what: "actions are not scoped to the exam (a late result of exam A lands in exam B)", file: "src/StructuredExamBuilder.tsx",
      find: "  const scoped = (scope: string) => scope === exam.examId && alive.current;", replace: "  const scoped = (_scope: string) => alive.current;", tests: ["src/StructuredExamBuilder.reliability.test.tsx", "src/StructuredExamBuilder.mediaState.test.tsx"] },
    { id: "F1-M7", what: "typed keystrokes are never coalesced", file: "src/examHistory.ts",
      find: "  if (continues) return { ...h, present: next, future: [], typing };", replace: "", tests: F1_TYPING },
    { id: "F1-M8", what: "a save does not end the typing group (the saved state is folded into the next keystrokes)", file: "src/examHistory.ts",
      find: "  if (typeof serverEtag === \"string\" && serverEtag) next.serverEtag = serverEtag;\n  return closeTypingGroup(next);", replace: "  if (typeof serverEtag === \"string\" && serverEtag) next.serverEtag = serverEtag;\n  return next;", tests: F1_TYPING },
    { id: "F1-M9", what: "the typing window is ignored (a pause does not start a new step)", file: "src/examHistory.ts",
      find: "now - h.typing.at <= TYPING_COALESCE_MS", replace: "true", tests: F1_TYPING },
    { id: "F1-M10", what: "any edit (not only keyboard typing) is coalesced", file: "src/examHistory.ts",
      find: "  const path = meta.typing ? typingPathOf(h.present, next) : null;", replace: "  const path = typingPathOf(h.present, next);", tests: F1_TYPING },
    { id: "F1-M11", what: "a paste right after typing joins the typing group", file: "src/StructuredExamBuilder.tsx",
      find: "      typingNow.current = TYPED.test(kind) && isTextEditingTarget(e.target);", replace: "      typingNow.current = typingNow.current || (TYPED.test(kind) && isTextEditingTarget(e.target));", tests: F1_TYPING },
    { id: "F1-M12", what: "leaving a field does not end the typing group", file: "src/StructuredExamBuilder.tsx",
      find: "    const onFocusOut = (e: FocusEvent) => { if (isTextEditingTarget(e.target)) typingEndRef.current?.(); };", replace: "    const onFocusOut = (_e: FocusEvent) => {};", tests: F1_TYPING },
    { id: "F1-M13", what: "undo does not end the typing group", file: "src/examHistory.ts",
      find: "  return closeTypingGroup({ ...h, present: previous, past: h.past.slice(0, -1), future: [h.present as StructuredExam, ...h.future] });", replace: "  return { ...h, present: previous, past: h.past.slice(0, -1), future: [h.present as StructuredExam, ...h.future] };", tests: F1_TYPING },
    { id: "F1-M14", what: "a non-text change (a number, an added item) counts as typing", file: "src/examHistory.ts",
      find: "    if ((tx === \"string\" || x === undefined) && (ty === \"string\" || y === undefined)) return path;", replace: "    if (tx !== \"object\" || ty !== \"object\" || x === null || y === null) return path;", tests: F1_TYPING }
  ],
  f7: [
    { id: "F7-M1", what: "legacy exams are listed as structured", file: "api/src/functions/manage-saved-exams.js",
      find: 'Array.isArray(exam.sections) ? "structured" : "legacy"', replace: '"structured"', tests: F7_LIST },
    { id: "F7-M2", what: "every listed exam reads as ready to finalize", file: "api/src/functions/manage-saved-exams.js",
      find: "canFinalize: decision.canFinalize === true,", replace: "canFinalize: true,", tests: F7_LIST },
    { id: "F7-M3", what: "a final exam with unsaved edits still reads as final on the server", file: "src/studio/studioPublishState.ts",
      find: "final: final && saved,", replace: "final,", tests: F7_PUBLISH },
    { id: "F7-M4", what: "a blocked exam reads as ready", file: "src/studio/studioPublishState.ts",
      find: "ready: canFinalize,", replace: "ready: true,", tests: F7_PUBLISH }
  ],
  f8: [
    { id: "F8-M1", what: "autosave creates exams the server does not hold", file: CTRL,
      find: 'if (typeof baseEtag.current !== "string" || present.status === "final") return;', replace: 'if (present.status === "final") return;', tests: F8_SAVE },
    { id: "F8-M2", what: "autosave saves a final exam as a draft (demotes it)", file: CTRL,
      find: 'if (typeof baseEtag.current !== "string" || present.status === "final") return;', replace: 'if (typeof baseEtag.current !== "string") return;', tests: F8_SAVE },
    { id: "F8-M3", what: "autosave retries the snapshot that just failed (offline loop)", file: CTRL,
      find: "if (!isExamDirty(history.history) || failedAutosave.current === present) return;", replace: "if (!isExamDirty(history.history)) return;", tests: F8_SAVE },
    { id: "F8-M4", what: "autosave runs with nothing unsaved", file: CTRL,
      find: "if (!isExamDirty(history.history) || failedAutosave.current === present) return;", replace: "if (failedAutosave.current === present) return;", tests: F8_SAVE },
    { id: "F8-M5", what: "autosave runs while a conflict is open", file: CTRL,
      find: "if (!present || saving || autosaving || conflict) return;", replace: "if (!present || saving || autosaving) return;", tests: F8_SAVE },
    { id: "F8-M6", what: "an autosave locks the editor (sets `saving`)", file: CTRL,
      find: "if (quiet) setAutosaving(true); else {", replace: "if (quiet) { setAutosaving(true); setSaving(true); } else {", tests: F8_SAVE },
    { id: "F8-M7", what: "saves are not serialized (a manual save races the autosave)", file: CTRL,
      find: "    while (inflight.current) await inflight.current;\n", replace: "", tests: F8_SAVE },
    { id: "F8-M8", what: "a failed autosave raises the blocking error instead of the quiet notice", file: CTRL,
      find: "        if (quiet) {\n          // Offline", replace: "        if (false) {\n          // Offline", tests: F8_SAVE },
    { id: "F8-M9", what: "the idle signal fires with nothing unsaved", file: "src/StructuredExamBuilder.tsx",
      find: 'if (!wantsIdleSave || saveState !== "dirty" || saving || mediaPending) return;', replace: "if (!wantsIdleSave || saving || mediaPending) return;", tests: F8_IDLE },
    { id: "F8-M10", what: "an edit does not restart the idle wait", file: "src/StructuredExamBuilder.tsx",
      find: "}, [wantsIdleSave, exam, saveState, saving, mediaPending, idleSaveDelayMs]);", replace: "}, [wantsIdleSave, saveState, saving, mediaPending, idleSaveDelayMs]);", tests: F8_IDLE }
  ]
};

const name = process.argv[2];
const campaign = CAMPAIGNS[name];
if (!campaign) { console.error("usage: node scripts/mutate-21f.mjs <" + Object.keys(CAMPAIGNS).join("|") + ">"); process.exit(2); }

const originals = new Map();
const restoreAll = () => {
  for (const [file, { buf, hash }] of originals) {
    writeFileSync(path.join(root, file), buf);
    if (sha(readFileSync(path.join(root, file))) !== hash) { console.error("RESTORE FAILED for " + file); process.exitCode = 3; }
  }
};
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { restoreAll(); process.exit(130); });
process.on("exit", restoreAll);

const results = [];
for (const m of campaign) {
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
