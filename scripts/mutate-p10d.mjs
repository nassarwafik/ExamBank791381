#!/usr/bin/env node
// Tadris+ P10-D — mutation proof for «a flooded login limit never keeps the owner out» (approved design
// docs/enterprise-owner-login-starvation-p10d.md, owner decisions §19.40): only an authenticator code passes a refusing limit
// (never a recovery code), the code is verified AND consumed before the one password check, the current step only, and a wrong
// code / unknown name gets the same 429. Same engine and rules as scripts/mutate-p10a.mjs (sha256-verified restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/owner-login-starvation-p10d.test.js", "api/tests/owner-identity-p1a.test.js", "api/tests/admin-protection-p1b.test.js"];
const F = "api/src/functions/owner-login.js";
const CALL = "factor = await verifyAndConsumeSecondFactor(container, account.accountId, { code }, { nowMs, env, windowSteps: 0 });";

export const MUTANTS = [
  { id: "P10D-M1", what: "a recovery code passes the refusing limit too", edits: [
    { file: F, find: "if (!code || recoveryCode) return throttled();", replace: "if (!code && !recoveryCode) return throttled();" },
    { file: F, find: CALL, replace: "factor = await verifyAndConsumeSecondFactor(container, account.accountId, { code, recoveryCode }, { nowMs, env, windowSteps: 0 });" }] },
  { id: "P10D-M2", what: "the password is checked BEFORE the code (a flood buys password guesses)", edits: [
    { file: F, find: CALL + "\n      if (!factor.ok) return throttled();\n      if (!(await verifySecret(password, account.credential))) {", replace: "if (!(await verifySecret(password, account.credential))) return denied();\n      " + CALL + "\n      if (!factor.ok) return throttled();\n      if (false) {" }] },
  { id: "P10D-M3", what: "the code is verified but not consumed (replayable)", edits: [
    { file: F, find: CALL, replace: "factor = await verifyAndConsumeSecondFactor(container, account.accountId, { code }, { nowMs, env, windowSteps: 0, mutate: async (_c, _id, fn) => fn(account) });" }] },
  { id: "P10D-M4", what: "a wrong code is not refused", edits: [
    { file: F, find: "      if (!factor.ok) return throttled();", replace: "      if (!factor.ok) factor = { ok: true, method: \"totp\", account };" }] },
  { id: "P10D-M5", what: "an unknown / inactive username answers differently (401) under the limit", edits: [
    { file: F, find: "if (!account || account.status !== \"active\") return throttled();", replace: "if (!account || account.status !== \"active\") return denied();" }] },
  { id: "P10D-M6", what: "the previous step passes the limit too", edits: [
    { file: F, find: "{ nowMs, env, windowSteps: 0 }", replace: "{ nowMs, env, windowSteps: 1 }" }] },
  { id: "P10D-M7", what: "the code-first path is taken even when the limit allows (the normal path is gone)", edits: [
    { file: F, find: "    if (!gate.allowed) {\n      // Tadris+ P10-D", replace: "    if (true) {\n      // Tadris+ P10-D" }] },
  { id: "P10D-M8", what: "the window cannot be narrowed (windowSteps ignored)", edits: [
    { file: "api/src/lib/identity/totp.js", find: "const span = Number.isInteger(windowSteps) && windowSteps >= 0 && windowSteps < WINDOW_STEPS ? windowSteps : WINDOW_STEPS;", replace: "const span = WINDOW_STEPS;" }] }
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
console.log("\nP10-D: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
