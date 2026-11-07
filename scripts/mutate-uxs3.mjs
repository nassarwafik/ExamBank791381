#!/usr/bin/env node
// UX-S3 — mutation proof for «الواجبات» and the result page (design docs/enterprise-ux-student-s3.md §5.6): the groups keep their
// order and hide when empty; «اليوم» is never «غدًا»; a past deadline never reads as upcoming; the result page's bar names the
// assignment and its back works. Same engine and rules as scripts/mutate-uxs2.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/student/tasks.ux-s3.test.tsx", "src/StudentPortal.ux7a.test.tsx", "src/StudentExamPage.breakdown.d4.test.tsx"];
const P = "src/student/portalPresentation.ts", E = "src/StudentExamPage.tsx";

export const MUTANTS = [
  { id: "UXS3-M1", what: "«مكتملة» comes before «تحتاج إجراء»", edits: [
    { file: P, find: "  { key: \"completed\", label: \"مكتملة\", states: [\"completed\"] },\n", replace: "" },
    { file: P, find: "  { key: \"action\", label: \"تحتاج إجراء\"", replace: "  { key: \"completed\", label: \"مكتملة\", states: [\"completed\"] },\n  { key: \"action\", label: \"تحتاج إجراء\"" }] },
  { id: "UXS3-M2", what: "an empty group is shown", edits: [{ file: P, find: "  }).filter(g => g.items.length > 0);", replace: "  });" }] },
  { id: "UXS3-M3", what: "a deadline today reads «غدًا»", edits: [{ file: P, find: "return { text: verb + \" اليوم \" + hhmm(at), soon, past: false };", replace: "return { text: verb + \" غدًا \" + hhmm(at), soon, past: false };" }] },
  { id: "UXS3-M4", what: "a past deadline reads as an upcoming one", edits: [{ file: P, find: "  if (!scheduled && t < now) return { text: \"انتهى التسليم \" + formatWhen(value), soon: false, past: true };\n", replace: "" }] },
  { id: "UXS3-M5", what: "the result page's bar does not name the assignment", edits: [{ file: E, find: "<ExamTopBar title={assignment.title} titleAs=\"p\"", replace: "<ExamTopBar title=\"\" titleAs=\"p\"" }] },
  { id: "UXS3-M6", what: "the result page's «رجوع» does nothing", edits: [{ file: E, find: "backLabel=\"رجوع\" context={(className||\"الصف\")+\" · المحاولة \"+result.attemptNumber+\" من \"+(state?.allowedAttempts||assignment.maxAttempts)} onBack={onBack}", replace: "backLabel=\"رجوع\" context={(className||\"الصف\")+\" · المحاولة \"+result.attemptNumber+\" من \"+(state?.allowedAttempts||assignment.maxAttempts)} onBack={()=>{}}" }] }
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
console.log("\nUX-S3: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
