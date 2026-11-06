#!/usr/bin/env node
// Tadris+ O18 — mutation proof for «a missing or malformed choice key never makes option 0 (or 1) correct» in the grader (security
// review docs/enterprise-security-review-p9b3.md, O18; owner decision «أوافق على إصلاح O18»). GRADING invariant: every mutant must be
// killed. Same engine and rules as scripts/mutate-p10l.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/grading-key-o18.test.js", "api/src/lib/assignment-grading.test.js"];
const G = "api/src/lib/assignment-grading.js";

export const MUTANTS = [
  { id: "O18-M1", what: "the old choice reading again: Number(null) === 0 is a key", edits: [{ file: G, find: "  const key=choiceKey(answer?.correctOptionIndex);\n  if(key!==null&&idx===key)return true;", replace: "  if(Number.isInteger(Number(answer?.correctOptionIndex))&&idx===Number(answer.correctOptionIndex))return true;" }] },
  { id: "O18-M2", what: "true/false: a malformed key still blocks the fallback to answer.correct", edits: [{ file: G, find: "if(choiceKey(answer?.correctOptionIndex)===null&&typeof answer?.correct===\"boolean\")", replace: "if(!Number.isInteger(Number(answer?.correctOptionIndex))&&typeof answer?.correct===\"boolean\")" }] },
  { id: "O18-M3", what: "a boolean key is read as 0 / 1", edits: [{ file: G, find: "  if(typeof value===\"number\")return Number.isInteger(value)&&value>=0?value:null;", replace: "  if(typeof value===\"number\"||typeof value===\"boolean\")return Number.isInteger(Number(value))&&Number(value)>=0?Number(value):null;" }] },
  { id: "O18-M4", what: "a digit string is no longer a key (a regression for existing data)", edits: [{ file: G, find: "  if(typeof value===\"string\"&&/^\\d+$/.test(value.trim()))return Number(value.trim());", replace: "" }] }
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
console.log("\nO18: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
