#!/usr/bin/env node
// Tadris+ P10-E — mutation proof for the bounded owner sign-in work (approved design docs/enterprise-owner-login-cost-p10e.md,
// owner decisions §19.41): at most 2 heavy password checks per instance, the rest take the code-first path with no scrypt; a
// failed limit reservation takes the code-first path too (P10-D gap); slots are always released.
// Same engine and rules as scripts/mutate-p10a.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/owner-login-cost-p10e.test.js", "api/tests/owner-login-starvation-p10d.test.js", "api/tests/owner-identity-p1a.test.js", "api/tests/admin-protection-p1b.test.js"];
const F = "api/src/functions/owner-login.js";
const G = "api/src/lib/identity/heavy-check-gate.js";

export const MUTANTS = [
  { id: "P10E-M1", what: "no cap: the normal path never asks for a slot", edits: [{ file: F, find: "if (gate.allowed) release = heavy.tryAcquire();", replace: "if (gate.allowed) release = () => {};" }] },
  { id: "P10E-M2", what: "the production cap is effectively unlimited", edits: [{ file: G, find: "const MAX_CONCURRENT_OWNER_PASSWORD_CHECKS = 2;", replace: "const MAX_CONCURRENT_OWNER_PASSWORD_CHECKS = 1000;" }] },
  { id: "P10E-M3", what: "a slot is not released when the request fails (no finally release)", edits: [{ file: F, find: "    if (release) release();          // P10-E", replace: "    // P10-E" }] },
  { id: "P10E-M4", what: "a failed limit reservation answers 429 before the code-first path (P10-D gap reopened)", edits: [{ file: F, find: "    catch { gate = { allowed: false, retryAfterSeconds: 5 }; }", replace: "    catch { return reply(429, { ok: false, code: \"RATE_LIMITED\", error: \"محاولات كثيرة. حاول مرة أخرى بعد قليل.\" }, { \"Retry-After\": \"5\" }); }" }] },
  { id: "P10E-M5", what: "scrypt runs before the code when the cap is full", edits: [{ file: F, find: "      if (!code || recoveryCode) return throttled();", replace: "      await verifySecret(password, await decoyRecord(deps.hashParams));\n      if (!code || recoveryCode) return throttled();" }] },
  { id: "P10E-M6", what: "the password check after a correct code runs outside the cap", edits: [{ file: F, find: "release = await heavy.acquire(Number.isFinite(deps.heavyCheckWaitMs) ? deps.heavyCheckWaitMs : 2000);", replace: "release = () => {};" }] },
  { id: "P10E-M7", what: "a release is not idempotent (a double release frees two slots)", edits: [{ file: G, find: "      if (released) return;\n", replace: "" }] },
  { id: "P10E-M8", what: "a wrong code on the code-first path is not refused", edits: [{ file: F, find: "      if (!factor.ok) return throttled();", replace: "      if (!factor.ok) factor = { ok: true, method: \"totp\", account };" }] }
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
console.log("\nP10-E: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
