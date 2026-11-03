#!/usr/bin/env node
// Tadris+ P5-A2 — mutation proof for the course screens: «المقررات» (archive confirmation, publish, step-up retry, its address),
// the teacher's «المقررات المخوَّلة» (sent only for «some», starts from the current revision, a courses-only change is a change,
// copied from another teacher, not offered without the catalog), the wizard's copy, and the teacher library filter (only on the
// library view). Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/owner/OwnerCourses.p5a2.test.tsx", "src/learning/LearningMaterialsPage.training.test.tsx", "src/learning/LearningMaterialsPage.l4.test.tsx"];
const COURSES = "src/owner/OwnerCourses.tsx";
const DETAILS = "src/owner/OwnerTeacherDetails.tsx";
const LIBRARY = "src/learning/LearningMaterialsPage.tsx";
const WIZARD = "src/owner/TeacherWizard.tsx";
const ROUTE = "src/owner/ownerRoute.ts";

export const MUTANTS = [
  { id: "P5A2-M1", what: "a course is archived without asking", edits: [{ file: COURSES, find: "onClick={() => setConfirming(c)}>أرشفة المقرر", replace: "onClick={() => void setStatus(c, \"archived\")}>أرشفة المقرر" }] },
  { id: "P5A2-M2", what: "«نشر المقرر» archives", edits: [{ file: COURSES, find: "onClick={() => void setStatus(c, \"published\")}>نشر المقرر", replace: "onClick={() => void setStatus(c, \"archived\")}>نشر المقرر" }] },
  { id: "P5A2-M3", what: "a course change is not retried after the second-factor check", edits: [{ file: COURSES, find: "setStepUp({ retry: () => send(call, onOk) });", replace: "setStepUp({ retry: async () => {} });" }] },
  { id: "P5A2-M4", what: "the chosen courses are not sent", edits: [{ file: DETAILS, find: "...(courseMode === \"some\" ? { courses: [...chosenCourses].sort() } : {})", replace: "...({})" }] },
  { id: "P5A2-M5", what: "«every published course» still sends a list", edits: [{ file: DETAILS, find: "...(courseMode === \"some\" ? { courses: [...chosenCourses].sort() } : {})", replace: "...({ courses: [...chosenCourses].sort() })" }] },
  { id: "P5A2-M6", what: "the choice ignores the current revision's courses", edits: [{ file: DETAILS, find: "useState<\"all\" | \"some\">(initialCourses ? \"some\" : \"all\")", replace: "useState<\"all\" | \"some\">(\"all\")" }] },
  { id: "P5A2-M7", what: "a change of courses alone is not a change", edits: [{ file: DETAILS, find: "[...chosen].every(c => initialSet.has(c)) && coursesUnchanged);", replace: "[...chosen].every(c => initialSet.has(c)));" }] },
  { id: "P5A2-M8", what: "copying a teacher drops their courses", edits: [{ file: DETAILS, find: "    setCourseMode(Array.isArray(r.data.courses) ? \"some\" : \"all\");\n", replace: "" }] },
  { id: "P5A2-M9", what: "the choice is offered without the catalog", edits: [{ file: DETAILS, find: "courses: courseCatalog.ok ? courseCatalog.data.courses : null", replace: "courses: courseCatalog.ok ? courseCatalog.data.courses : []" }] },
  { id: "P5A2-M10", what: "the library is not filtered", edits: [{ file: LIBRARY, find: ".filter(c => !allowedCourses || allowedCourses.has(c.id))", replace: ".filter(() => true)" }] },
  { id: "P5A2-M11", what: "the library asks outside the library view", edits: [{ file: LIBRARY, find: "if (!token || !onLibrary || allowedCourses) return;", replace: "if (!token || allowedCourses) return;" }] },
  { id: "P5A2-M12", what: "the wizard's copy drops the courses", edits: [{ file: WIZARD, find: "...(Array.isArray(copied.courses) ? { courses: [...copied.courses] } : {})", replace: "...({})" }] },
  { id: "P5A2-M13", what: "the courses section is not reachable at its address", edits: [{ file: ROUTE, find: "(?:\\/(setup|access|schools|courses)|", replace: "(?:\\/(setup|access|schools)|" }] }
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
console.log("\nP5-A2: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
