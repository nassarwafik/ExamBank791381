#!/usr/bin/env node
// Tadris+ QR-1 — mutation proof for the QR sign-in (design docs/enterprise-qr-login-qr1.md): the pairing is consumed before a
// session is issued, the poll needs the poll secret, the shown number must match, the bound identity is the caller's verified
// session only, the approver is re-checked at poll for each role, the owner needs a recent step-up and the new owner session has
// none, the pairing expires, owner steps are recorded strictly, and a namespace never issues another role's session. Same engine and rules as scripts/mutate-p10f.mjs (sha256-verified
// byte-for-byte restore; KILLED only when a test fails, a timeout is TIMEOUT).
//   node scripts/mutate-qr1.mjs            all mutants
//   node scripts/mutate-qr1.mjs QR1-M3     one (comma-separated list)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/qr-login-qr1.test.js"];
const FLOW = "api/src/lib/identity/qr-pairing.js";
const LIB = "api/src/lib/identity/qr-login.js";
const PLATFORM = "api/src/functions/qr-login.js";
const PLATFORM_APPROVE = "api/src/functions/qr-login-approve.js";
const OWNER = "api/src/functions/owner-qr-login.js";
const OWNER_APPROVE = "api/src/functions/owner-qr-login-approve.js";
const one = (file, find, replace) => ({ file, find, replace });

export const MUTANTS = [
  { id: "QR1-M1", what: "the pairing is not consumed (it stays approved)", edits: [one(FLOW, 'return { ...current, status: "consumed", consumedAtMs: nowMs };', "return current;")] },
  { id: "QR1-M2", what: "the poll secret is not checked", edits: [one(FLOW, "wellFormed(r) && timingSafeEqualHex(r.pollSecretHash, pollSecretHash(secret))", "wellFormed(r)")] },
  { id: "QR1-M3", what: "the shown number is not checked", edits: [one(FLOW, "return Number.isInteger(n) && n === record.matchCode;", "return true;")] },
  { id: "QR1-M4", what: "an owner approves without a recent step-up", edits: [one(OWNER_APPROVE, 'if (action === "approve") { const denial = stepUpDenial(session, nowMs); if (denial) return denial; }', "")] },
  { id: "QR1-M5", what: "the new owner session carries a step-up", edits: [one(OWNER, 'stepUpAtMs: null, factor: "qr"', 'stepUpAtMs: nowMs, factor: "qr"')] },
  { id: "QR1-M6", what: "the approving teacher session is not re-checked at poll", edits: [one(PLATFORM, "account.authVersion === a.authVersion && sessionActive(account, a.sid, nowMs)", "account.authVersion === a.authVersion")] },
  { id: "QR1-M7", what: "the student credential version is not re-checked at poll", edits: [one(PLATFORM, " || normalizeAuthVersion(current.authVersion) !== a.authVersion) throw", ") throw")] },
  { id: "QR1-M8", what: "the bound identity is taken from the request body", edits: [one(PLATFORM_APPROVE, "approval: matched ? caller.approval : null", "approval: matched ? { ...caller.approval, ...body } : null")] },
  { id: "QR1-M9", what: "the 90 s expiry is ignored", edits: [one(LIB, 'if (!(r.expiresAtMs > nowMs)) return "expired";', "")] },
  { id: "QR1-M10", what: "the approving owner session is not re-checked at poll", edits: [one(OWNER, "if (!session || session.sid !== a.sid || session.accountId !== a.subject || !(Number(session.expiresAtMs) > nowMs)) throw", "if (false) throw")] },
  { id: "QR1-M11", what: "inspect / approve do not check the pairing is pending", edits: [one(FLOW, 'if (state !== "pending") return { response: approverGone(state) };', "")] },
  { id: "QR1-M12", what: "the decision's compare-and-set does not re-check pending (a racing approval overwrites)", edits: [one(FLOW, '      if (s !== "pending") throw new Closed(s);\n      if (current.matchCode', "      if (current.matchCode")] },
  // QR1-M13 with only the «managed» guard removed is EQUIVALENT: validApproval then refuses the same session (no session id) with
  // the same 403 and nothing written. Removing both guards shows the test sees the behaviour.
  { id: "QR1-M13", what: "a legacy / BUILDER_USERS teacher session may approve (both guards removed)", edits: [one(PLATFORM_APPROVE, 'if (auth.user.am !== "managed") return', "if (false) return"), one(PLATFORM_APPROVE, "if (!validApproval(caller.approval)) return unsupported();", "")] },
  { id: "QR1-M14", what: "the owner sign-in is not recorded before the session exists", edits: [one(OWNER, "await (deps.recordOwnerAuditEvent || recordOwnerAuditEventStrict)(container, { actor", "void (async () => {})(container, { actor")] },
  { id: "QR1-M15", what: "the owner approval is not recorded", edits: [one(OWNER_APPROVE, "const recorded = await recordOwnerChange(container, event, async () => {", "const recorded = await (async (_c, _e, apply) => apply())(container, event, async () => {")] },
  { id: "QR1-M16", what: "a wrong number on an owner pairing is recorded as «not applied»", edits: [one(OWNER_APPROVE, "return r.status === 409 ? { ...r, status: 200, closedOnMismatch: true } : r;", "return r;")] },
  { id: "QR1-M17", what: "a poll issues a role its namespace does not issue", edits: [one(FLOW, "Object.prototype.hasOwnProperty.call(issuers, a.role) ? issuers[a.role] : null", "Object.values(issuers)[0]"), one(PLATFORM, 'if (!isTeacherAccountId(a.subject)) throw new Refusal("QR_APPROVAL_INVALID");', "")] }
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
console.log("\nQR-1: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
