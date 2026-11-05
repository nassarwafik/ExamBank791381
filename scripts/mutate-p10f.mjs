#!/usr/bin/env node
// Tadris+ P10-F — mutation proof for «every failed platform sign-in costs the same» (approved design
// docs/enterprise-login-timing-p10f.md, owner decision §19.42): one teacher-cost and one student-cost scrypt on every failure,
// decoys only on the failure path, the decoy with the real parameters, capped and always released.
// Same engine and rules as scripts/mutate-p10a.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/login-timing-p10f.test.js", "api/tests/platform-login-teacher.test.js", "api/tests/auth-hardening-r8.test.js"];
const F = "api/src/functions/platform-login.js";

export const MUTANTS = [
  { id: "P10F-M1", what: "no teacher decoy on a failure", edits: [{ file: F, find: "    if (!ran.teacher) await verifySecret(password, await teacherDecoyRecord(deps.hashParams));\n", replace: "" }] },
  { id: "P10F-M2", what: "no student decoy on a failure", edits: [{ file: F, find: "    if (!ran.student) verifyPw(password, STUDENT_DECOY_SALT, STUDENT_DECOY_HASH);\n", replace: "" }] },
  { id: "P10F-M3", what: "a successful teacher sign-in also pays the decoys", edits: [{ file: F, find: "    if (managedCheckable && await verifySecret(password, managed.credential)) {\n", replace: "    if (managedCheckable && await verifySecret(password, managed.credential)) {\n      await equaliseFailedSignIn(password, ran, deps, verifyPw);\n" }] },
  { id: "P10F-M4", what: "the teacher decoy uses different scrypt parameters from the real check", edits: [{ file: F, find: "hashSecret(\"decoy-\" + crypto.randomBytes(8).toString(\"hex\"), params ? { params } : {})", replace: "hashSecret(\"decoy-\" + crypto.randomBytes(8).toString(\"hex\"), { params: { N: 32768, r: 8, p: 1, keyLen: 64 } })" }] },
  { id: "P10F-M5", what: "no cap on the decoys", edits: [{ file: F, find: "  const release = await gate.acquire(Number.isFinite(deps.decoyWaitMs) ? deps.decoyWaitMs : 2000);", replace: "  const release = () => {};" }] },
  { id: "P10F-M6", what: "a decoy slot is never released", edits: [{ file: F, find: "  } finally { release(); }\n}", replace: "  } finally { }\n}" }] },
  { id: "P10F-M7", what: "the teacher check is counted as run even when no account was checked", edits: [{ file: F, find: "    if (managedCheckable) ran.teacher = true;", replace: "    ran.teacher = true;" }] },
  { id: "P10F-M8", what: "the student check is counted as run even when no student was checked", edits: [{ file: F, find: "    if (authDocument && authDocument.active !== false) ran.student = true;", replace: "    ran.student = true;" }] }
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
console.log("\nP10-F: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
