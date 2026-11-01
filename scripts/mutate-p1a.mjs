#!/usr/bin/env node
// Tadris+ P1-A — mutation campaign for the platform-owner identity invariants (AGENTS.md §9). Same rules as
// scripts/mutate-21g.mjs: each mutant plants ONE deliberate defect, runs the focused Vitest file, and is KILLED only if a
// test fails because of it. A timeout is TIMEOUT (never killed). A mutant may change several places at once (`edits`) when
// two independent guards protect the same invariant — removing only one of them is an equivalent mutant by design.
// Every mutated file is restored byte-for-byte and hash-verified after each mutant, also on error or interrupt.
//
//   node scripts/mutate-p1a.mjs [ids]      ids = comma-separated mutant ids to re-run in isolation
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/owner-identity-p1a.test.js"];
const BOOT = "api/src/functions/owner-bootstrap.js", LOGIN = "api/src/functions/owner-login.js", SESSFN = "api/src/functions/owner-session.js";
const BOOTLIB = "api/src/lib/identity/owner-bootstrap.js", SESS = "api/src/lib/identity/owner-session.js", MFA = "api/src/lib/identity/owner-mfa.js";
const TOTP = "api/src/lib/identity/totp.js", HASH = "api/src/lib/identity/password-hash.js", BOX = "api/src/lib/identity/secret-box.js";
const STORE = "api/src/lib/identity/owner-store.js", AUDIT = "api/src/lib/audit-log.js";

export const MUTANTS = [
  { id: "P1A-M1", what: "the bootstrap marker no longer closes begin", edits: [{ file: BOOT,
    find: "if (await downloadJsonOrNull(container, BOOTSTRAP_MARKER) && action === \"begin\") return gone();", replace: "if (false) return gone();" }] },
  { id: "P1A-M2", what: "confirm resumes for ANY marker (a second owner through resume)", edits: [{ file: BOOT,
    find: "if (marker && !(pending && marker.accountId === pending.accountId && !(await readOwnerAccount(container, marker.accountId)))) return gone();", replace: "if (false) return gone();" }] },
  { id: "P1A-M3", what: "the owner account is overwritten instead of created once", edits: [
    { file: BOOT, find: "const created = await createOnly(container, ownerAccountName(pending.accountId), account);", replace: "const created = (await uploadJson(container, ownerAccountName(pending.accountId), account), true);" }] },
  { id: "P1A-M4", what: "begin skips the bootstrap-token check", edits: [{ file: BOOT,
    find: "if (!bootstrapTokenMatches(body.token, cfg.hash)) return badToken();\n\n  const username", replace: "const username" }] },
  { id: "P1A-M5", what: "confirm skips the bootstrap-token check", edits: [{ file: BOOT,
    find: "if (!bootstrapTokenMatches(body.token, cfg.hash)) return badToken();\n\n  const [marker, pending]", replace: "const [marker, pending]" }] },
  { id: "P1A-M6", what: "confirm skips the authenticator code", edits: [{ file: BOOT,
    find: "if (!totp.ok) return reply(401,", replace: "if (false) return reply(401," }] },
  { id: "P1A-M7", what: "a bootstrap window longer than 24 h is accepted", edits: [{ file: BOOTLIB,
    find: "if (expiresAtMs - nowMs > MAX_WINDOW_MS + WINDOW_SKEW_MS) return { state: \"misconfigured\" };", replace: "" }] },
  { id: "P1A-M8", what: "any token matches the configured hash", edits: [{ file: BOOTLIB,
    find: "return left.length === right.length && crypto.timingSafeEqual(left, right);", replace: "return true;" }] },
  { id: "P1A-M9", what: "POSTs are served without a valid bootstrap configuration", edits: [{ file: BOOT,
    find: "if (method === \"POST\" && bootstrapConfig(env, nowMs).state !== \"open\") return unavailable();", replace: "" }] },
  { id: "P1A-M10", what: "bootstrap attempts are not throttled", edits: [{ file: BOOT,
    find: "return g.allowed ? { ok: true, clientId } : { ok: false, response: throttled(g.retryAfterSeconds) };", replace: "return { ok: true, clientId };" }] },
  { id: "P1A-M11", what: "the owner password policy is not enforced", edits: [{ file: BOOT,
    find: "if (!policy.ok) return reply(400,", replace: "if (false) return reply(400," }] },
  { id: "P1A-M12", what: "a digits-only (identity-number-like) username is accepted", edits: [{ file: STORE,
    find: "if (!USERNAME_RE.test(u) || /^\\d+$/.test(u) || u.includes(\"..\")) return null;", replace: "if (!USERNAME_RE.test(u) || u.includes(\"..\")) return null;" }] },
  { id: "P1A-M13", what: "login ignores the password result", edits: [{ file: LOGIN,
    find: "if (!account || !passwordOk || account.status !== \"active\") {", replace: "if (!account || account.status !== \"active\") {" }] },
  { id: "P1A-M14", what: "a suspended owner can sign in (both independent status guards removed)", edits: [
    { file: LOGIN, find: "if (!account || !passwordOk || account.status !== \"active\") {", replace: "if (!account || !passwordOk) {" },
    { file: MFA, find: "if (current.status !== \"active\") throw new SecondFactorRejected();", replace: "" }] },
  { id: "P1A-M15", what: "login is not throttled", edits: [{ file: LOGIN, find: "if (!gate.allowed) {", replace: "if (false) {" }] },
  { id: "P1A-M16", what: "a TOTP step not newer than lastUsedStep is accepted (replay)", edits: [{ file: TOTP,
    find: "if (equal && step > floor && matched === null) matched = step;", replace: "if (equal && matched === null) matched = step;" }] },
  { id: "P1A-M17", what: "the used TOTP step is not persisted", edits: [{ file: MFA,
    find: "totp: { ...mfa.totp, lastUsedStep: result.step }", replace: "totp: { ...mfa.totp, lastUsedStep: last }" }] },
  { id: "P1A-M18", what: "a recovery code is not marked used", edits: [{ file: MFA,
    find: "const nextRecords = records.map((r, i) => i === index ? { ...r, usedAt: new Date(nowMs).toISOString() } : r);", replace: "const nextRecords = records;" }] },
  { id: "P1A-M19", what: "logout does not delete the server session", edits: [{ file: SESSFN,
    find: "await deleteBlob(container, ownerSessionName(session.sid));", replace: "" }] },
  { id: "P1A-M20", what: "the session document's expiry is ignored", edits: [{ file: SESS,
    find: "if (!(Number(session.expiresAtMs) > nowMs)) return revoked();", replace: "" }] },
  { id: "P1A-M21", what: "the account authVersion is not compared (revoke-all ineffective)", edits: [{ file: SESS,
    find: "if (!owner || owner.status !== \"active\" || owner.authVersion !== payload.av) return revoked();", replace: "if (!owner || owner.status !== \"active\") return revoked();" }] },
  { id: "P1A-M22", what: "a suspended owner's existing session keeps working", edits: [{ file: SESS,
    find: "if (!owner || owner.status !== \"active\" || owner.authVersion !== payload.av) return revoked();", replace: "if (!owner || owner.authVersion !== payload.av) return revoked();" }] },
  { id: "P1A-M23", what: "sensitive actions run without a recent step-up", edits: [{ file: SESSFN,
    find: "const denial = stepUpDenial(session, nowMs);\n      if (denial) return denial;", replace: "" }] },
  { id: "P1A-M24", what: "the owner token signature is not checked", edits: [{ file: SESS,
    find: "if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;", replace: "" }] },
  { id: "P1A-M25", what: "the owner token role claim is not checked", edits: [{ file: SESS,
    find: "if (!payload || payload.ver !== 1 || payload.role !== \"owner\") return null;", replace: "if (!payload || payload.ver !== 1) return null;" }] },
  { id: "P1A-M26", what: "a token lifetime over 2 hours is accepted", edits: [{ file: SESS,
    find: "if (payload.exp - payload.iat > OWNER_TOKEN_TTL_SECONDS) return null;", replace: "" }] },
  { id: "P1A-M27", what: "a sealed secret is not bound to its account (AAD dropped on both sides)", edits: [
    { file: BOX, find: "  cipher.setAAD(Buffer.from(String(aad), \"utf8\"));\n", replace: "" },
    { file: BOX, find: "    decipher.setAAD(Buffer.from(String(aad), \"utf8\"));\n", replace: "" }] },
  { id: "P1A-M28", what: "stored hash parameters below the floor are accepted", edits: [{ file: HASH,
    find: "if (log2 < MIN_LOG2_N || log2 > MAX_LOG2_N) return null;", replace: "if (log2 > MAX_LOG2_N) return null;" }] },
  { id: "P1A-M29", what: "owner security events land in the teacher-readable audit prefix", edits: [{ file: AUDIT,
    find: "return writeAuditEvent(container, { actor: \"system\", ...event }, OWNER_AUDIT_PREFIX);", replace: "return writeAuditEvent(container, { actor: \"system\", ...event }, AUDIT_PREFIX);" }] },
  { id: "P1A-M30", what: "the session must belong to the token's account (check dropped)", edits: [{ file: SESS,
    find: "if (!session || session.sid !== payload.sid || session.accountId !== payload.sub) return revoked();", replace: "if (!session) return revoked();" }] }
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
console.log("\nP1-A: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
