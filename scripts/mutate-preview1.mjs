// PREVIEW-1 mutation proof — each mutant plants one defect, runs the focused tests, and restores the file byte-for-byte (hash-checked).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const TESTS = ["src/examPreview.styles.preview1.test.ts", "api/tests/ux2-shell-foundation.test.js"];
const MUTANTS = [
  { id: "M1", file: "src/ExamPreview.tsx", from: 'import "./exam-preview.css";\n', to: "", what: "ExamPreview no longer imports its overlay stylesheet (the defect)" },
  { id: "M2", file: "src/exam-preview.css", from: ".sb-preview-overlay{position:fixed;", to: ".sb-preview-overlay{position:static;", what: "the overlay falls back into the page flow" },
  { id: "M3", file: "src/structured-builder.css", from: '@import "./exam-preview.css";', to: "", what: "the builder and the import dialogs lose the shared overlay" },
  { id: "M4", file: "src/exam-preview.css", from: ".sb-preview-head{position:sticky;", to: ".sb-preview-head{position:static;", what: "the preview header scrolls away with the exam" }
];
const sha = s => createHash("sha256").update(s).digest("hex");
let survived = 0;
for (const m of MUTANTS) {
  const original = readFileSync(m.file);
  const text = original.toString("utf8");
  if (!text.includes(m.from)) throw new Error(m.id + ": anchor not found in " + m.file);
  try {
    writeFileSync(m.file, text.replace(m.from, m.to));
    const r = spawnSync("npx", ["vitest", "run", ...TESTS], { encoding: "utf8", timeout: 300000 });
    const verdict = r.status === null ? "TIMEOUT" : r.status !== 0 ? "KILLED" : "SURVIVED";
    if (verdict !== "KILLED") survived++;
    const out = (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, "");
    const killer = [...new Set([...out.matchAll(/FAIL\s+(\S+\.(?:ts|js|tsx|mjs))/g)].map(x => x[1]))].join(", ") || "-";
    console.log(m.id + "  " + verdict.padEnd(8) + "  " + m.what + "  (killed by " + killer + ")");
  } finally {
    writeFileSync(m.file, original);
    if (sha(readFileSync(m.file)) !== sha(original)) throw new Error(m.id + ": restore mismatch");
  }
}
process.exit(survived ? 1 : 0);
