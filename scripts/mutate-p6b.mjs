#!/usr/bin/env node
// Tadris+ P6-B (risk S6) — mutation proof for the ownership check on a governed exam's PUBLISHED revision: an assignment binds it
// (content and answer keys) only for a teacher who may access that exam — the tenancy rule of its saved exam, else of its
// manifest's creator — and anyone else is answered like a missing exam; and on the governance route itself, a console account
// reads or changes an exam's governance only when it may access that exam.
// Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/governed-revision-ownership-p6b.test.js", "api/tests/qa2-phase3-authority.test.js"];
const ASSIGN = "api/src/functions/manage-assignments.js";
const GOVR = "api/src/functions/exam-governance.js";

export const MUTANTS = [
  { id: "P6B-M1", what: "the ownership check is removed (any teacher binds another's published revision)", edits: [{ file: ASSIGN, find: "if(tenant){const saved=await dl(", replace: "if(false){const saved=await dl(" }] },
  { id: "P6B-M2", what: "without a saved exam, anyone counts as the creator", edits: [{ file: ASSIGN, find: "saved||{ownerId:gov.manifest&&gov.manifest.createdBy}", replace: "saved||{ownerId:tenant}" }] },
  { id: "P6B-M3", what: "the saved exam is not read (only the manifest's creator decides)", edits: [{ file: ASSIGN, find: "const saved=await dl(c,\"exams/\"+String(exam.examId)+\".json\");", replace: "const saved=null;" }] },
  { id: "P6B-M4", what: "the manifest's creator is ignored (no saved exam → treated as unowned)", edits: [{ file: ASSIGN, find: "saved||{ownerId:gov.manifest&&gov.manifest.createdBy}", replace: "saved||{}" }] },
  { id: "P6B-M5", what: "the refusal reveals the exam (a distinct code instead of a missing exam)", edits: [{ file: ASSIGN, find: "return {status:404,jsonBody:{ok:false,code:\"EXAM_NOT_FOUND\",error:\"الامتحان غير موجود.\"}}}", replace: "return {status:403,jsonBody:{ok:false,code:\"EXAM_FORBIDDEN\",error:\"الامتحان غير موجود.\"}}}" }] }  ,
  { id: "P6B-M6", what: "the governance route lets a console account reach another teacher's exam", edits: [{ file: GOVR, find: "if (tenant && CONSOLE_ACCOUNT_RE.test(tenant) && !(await governedExamAccessible(", replace: "if (false && !(await governedExamAccessible(" }] },
  { id: "P6B-M7", what: "the governance route ignores the saved exam (manifest creator only)", edits: [{ file: GOVR, find: "  if (saved) return canAccessDocument(saved, tenant);\n", replace: "" }] },
  { id: "P6B-M8", what: "the governance route ignores the manifest's creator (no saved exam → free)", edits: [{ file: GOVR, find: "return !s.manifest || canAccessDocument({ ownerId: s.manifest.createdBy }, tenant);", replace: "return true;" }] },
  { id: "P6B-M9", what: "the governance route also isolates BUILDER_USERS colleagues (21G shared review broken)", edits: [{ file: GOVR, find: "if (tenant && CONSOLE_ACCOUNT_RE.test(tenant) && !(await", replace: "if (tenant && !(await" }] },
  { id: "P6B-M10", what: "a refused status reveals the exam is governed", edits: [{ file: GOVR, find: "if (action === \"status\") return { status: 200, jsonBody: { ok: true, governed: false, manifest: null, ...common } };", replace: "" }] }
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
console.log("\nP6-B: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
