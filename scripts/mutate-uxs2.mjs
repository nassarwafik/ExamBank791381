#!/usr/bin/env node
// UX-S2 — mutation proof for the student portal's views (design docs/enterprise-ux-student-s2.md §5.9): a hidden view stays mounted
// (no extra read); the link is written; the back button returns; a scheduled-assignment notification opens «الواجبات»; «المشاريع»
// is never offered without a project; focus moves to the view's heading. Same engine and rules as scripts/mutate-uxs1.mjs
// (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/StudentPortal.mobileNav.12c.test.tsx", "src/StudentPortal.learningMaterials.test.tsx", "src/notifications/notificationCenter.6d.test.tsx", "src/StudentPortal.v2.21e.test.tsx", "src/StudentPortal.todayHub.9a.test.tsx", "src/StudentPortal.projectDrill.12d.test.tsx"];
const P = "src/StudentPortal.tsx";

export const MUTANTS = [
  { id: "UXS2-M1", what: "a hidden view is unmounted instead of hidden («المواد»): opening it reads the materials again", edits: [
    { file: P, find: "<div {...viewProps(\"learning\")}>\n              <StudentLearningMaterials", replace: "<div {...viewProps(\"learning\")}>\n              {shown === \"learning\" && <StudentLearningMaterials" },
    { file: P, find: "window.scrollTo({ top: 0, behavior: reducedMotion ? \"auto\" : \"smooth\" }); }} />\n            </div>\n            <div {...viewProps(\"tasks\")}>", replace: "window.scrollTo({ top: 0, behavior: reducedMotion ? \"auto\" : \"smooth\" }); }} />}\n            </div>\n            <div {...viewProps(\"tasks\")}>" }] },
  { id: "UXS2-M2", what: "opening a view writes no link (#/s/<view>)", edits: [{ file: P, find: "    if (typeof window !== \"undefined\" && window.location.hash !== viewHash(next)) window.history.pushState(window.history.state, \"\", viewHash(next));\n", replace: "" }] },
  { id: "UXS2-M3", what: "the back button no longer returns to the previous view", edits: [{ file: P, find: "    window.addEventListener(\"popstate\", onPop);\n", replace: "" }] },
  { id: "UXS2-M4", what: "a scheduled-assignment notification focuses its card without opening «الواجبات»", edits: [{ file: P, find: "      goView(\"tasks\", null);                                                          // UX-S2: the card lives in «الواجبات»\n", replace: "" }] },
  { id: "UXS2-M5", what: "«المشاريع» is offered (bottom bar) without a project", edits: [{ file: P, find: "const unavailableViews: StudentView[] = projectsAvailable ? [] : [\"projects\"];", replace: "const unavailableViews: StudentView[] = [];" }] },
  { id: "UXS2-M6", what: "opening a view does not move focus to its heading", edits: [{ file: P, find: "      if (h) { if (!h.hasAttribute(\"tabindex\")) h.setAttribute(\"tabindex\", \"-1\"); h.focus?.({ preventScroll: true }); }\n    }, 0);\n  }\n  function scrollToSection", replace: "    }, 0);\n  }\n  function scrollToSection" }] }
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
console.log("\nUX-S2: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
