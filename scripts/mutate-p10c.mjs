#!/usr/bin/env node
// Tadris+ P10-C — mutation proof for the owner's password change and authenticator re-enrolment (approved design
// docs/enterprise-owner-credentials-p10c.md): step-up + the current password; the attempt limit; authVersion + 1 ends every other
// session; re-enrolment swaps only after a code from the NEW app, voids the old recovery codes and drops the pending secret.
// Same engine and rules as scripts/mutate-p10a.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/owner-credentials-p10c.test.js", "api/tests/owner-identity-p1a.test.js"];
const F = "api/src/functions/owner-session.js";

export const MUTANTS = [
  { id: "P10C-M1", what: "the current password is not checked", edits: [{ file: F, find: "if (action !== \"totp-confirm\" && !(await verifySecret(currentPassword, owner.credential))) {", replace: "if (false) {" }] },
  { id: "P10C-M2", what: "no fresh step-up is required", edits: [{ file: F, find: "  const denial = stepUpDenial(session, nowMs);\n  if (denial) return denial;\n  const body = await readBody(request);", replace: "  const body = await readBody(request);" }] },
  { id: "P10C-M3", what: "the password change does not bump authVersion (other sessions survive)", edits: [{ file: F, find: "return { ...current, credential, authVersion: Number(current.authVersion) + 1, passwordChangedAt: iso, updatedAt: iso };", replace: "return { ...current, credential, passwordChangedAt: iso, updatedAt: iso };" }] },
  { id: "P10C-M4", what: "re-enrolment keeps the old recovery codes", edits: [{ file: F, find: "totp: { sealed: pending.sealed, lastUsedStep: result.step, enrolledAt: iso }, recoveryCodes: fresh.records },", replace: "totp: { sealed: pending.sealed, lastUsedStep: result.step, enrolledAt: iso } },", }] },
  { id: "P10C-M5", what: "the new authenticator is swapped in without checking its code", edits: [{ file: F, find: "      if (!result.ok) throw fail(\"TOTP_INVALID\");", replace: "" }] },
  { id: "P10C-M6", what: "a code from the OLD authenticator confirms the re-enrolment", edits: [{ file: F, find: "const secret = openSecret(pending.sealed, { purpose: TOTP_PURPOSE, aad: current.accountId, env });", replace: "const secret = openSecret(mfa.totp.sealed, { purpose: TOTP_PURPOSE, aad: current.accountId, env });" }] },
  { id: "P10C-M7", what: "no attempt limit on the current password", edits: [{ file: F, find: "  if (!gate.allowed) return reply(429, { ok: false, code: \"RATE_LIMITED\", error: \"محاولات كثيرة. حاول مرة أخرى بعد قليل.\" }, { \"Retry-After\": String(gate.retryAfterSeconds || 5) });\n  const cleared", replace: "  const cleared" }] },
  { id: "P10C-M8", what: "the pending secret is not dropped after the swap (a second confirm re-issues codes)", edits: [{ file: F, find: "mfa: { ...rest, totp:", replace: "mfa: { ...mfa, totp:" }] },
  { id: "P10C-M9", what: "the re-enrolment does not bump authVersion (other sessions survive)", edits: [{ file: F, find: "        authVersion: Number(current.authVersion) + 1,\n        updatedAt: iso\n      };", replace: "        updatedAt: iso\n      };" }] },
  { id: "P10C-M10", what: "this device's old session document is kept", edits: [{ file: F, find: "    await deleteBlob(container, ownerSessionName(session.sid)).catch(() => {});\n", replace: "" }] },
  { id: "P10C-M11", what: "the new password policy is not applied", edits: [{ file: F, find: "    if (!policy.ok) return reply(400,", replace: "    if (false) return reply(400," }] },
  { id: "P10C-M12", what: "the begin step replaces the current authenticator at once (no proof from the new app)", edits: [{ file: F, find: "return { ...current, mfa: { ...mfa, pendingTotp: { sealed, createdAtMs: nowMs, expiresAtMs: nowMs + PENDING_TOTP_MS } },", replace: "return { ...current, mfa: { ...mfa, totp: { sealed, lastUsedStep: null, enrolledAt: \"x\" }, pendingTotp: { sealed, createdAtMs: nowMs, expiresAtMs: nowMs + PENDING_TOTP_MS } }," }] }
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
console.log("\nP10-C: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
