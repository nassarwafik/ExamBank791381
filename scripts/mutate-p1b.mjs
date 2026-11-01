#!/usr/bin/env node
// Tadris+ P1-B — mutation campaign for the administrative-access invariants (AGENTS.md §9): the operator gate (owner-only once an
// owner exists, step-up, fail closed, tokens before storage), the platform-login configuration answer and the owner-only throttle
// policy. Same engine and rules as scripts/mutate-p1a.mjs (one planted defect per mutant, KILLED only when a test fails, TIMEOUT is
// never killed, byte-for-byte restore with sha256 verification, also on error or interrupt).
//
//   node scripts/mutate-p1b.mjs [ids]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/admin-protection-p1b.test.js", "api/tests/tenancy-registry-21g0.test.js", "api/tests/route-auth-inventory-11a.test.js"];
const GATE = "api/src/lib/identity/operator-gate.js", LOGIN = "api/src/functions/platform-login.js", THROTTLE = "api/src/lib/login-throttle.js", OWNER_LOGIN = "api/src/functions/owner-login.js";

export const MUTANTS = [
  { id: "P1B-M1", what: "teachers keep the operator tools even after an owner exists", edits: [{ file: GATE, find: "  if (!exists) {\n    if (!teacher.ok)", replace: "  if (!exists || teacher.ok) {\n    if (!teacher.ok)" }] },
  { id: "P1B-M2", what: "a teacher token is let through instead of 403 OWNER_REQUIRED", edits: [{ file: GATE, find: 'if (!ownerClaim) return deny(403, "OWNER_REQUIRED", "هذه الأداة لمالك المنصة فقط.");', replace: 'if (!ownerClaim) return { ok: true, actor: "teacher", user: teacher.user };' }] },
  { id: "P1B-M3", what: "the step-up requirement is skipped", edits: [{ file: GATE, find: "  if (stepUp) return { ok: false, response: stepUp };\n", replace: "" }] },
  { id: "P1B-M4", what: "an unreadable owner marker counts as «no owner» (fail open)", edits: [{ file: GATE, find: '  } catch {\n    return deny(503, "OPERATOR_GATE_UNAVAILABLE"', replace: '  } catch {\n    exists = false;\n  }\n  if (false) {\n    return deny(503, "OPERATOR_GATE_UNAVAILABLE"' }] },
  // P2-B: the marker cache moved to identity/owner-presence.js (shared with the D6 closure); M6 follows the P2-A2a gate.
  { id: "P1B-M5", what: "the owner marker is not cached once seen", edits: [{ file: "api/src/lib/identity/owner-presence.js", find: "  if (ownerSeen) return true;\n", replace: "" }] },
  { id: "P1B-M6", what: "an anonymous call reaches storage before any token check", edits: [{ file: GATE, find: "  if (!teacher.ok && !ownerClaim && !managedTeacher) return { ok: false, response: teacher.response };\n", replace: "" }] },
  { id: "P1B-M7", what: "a revoked owner session still passes the gate", edits: [{ file: GATE, find: "  if (!owner.ok) return owner;\n", replace: "" }] },
  { id: "P1B-M8", what: "storage-status goes back to a plain teacher session", edits: [{ file: "api/src/functions/storage-status.js", find: "const auth = await requireOperator(request);", replace: "const auth = require(\"../lib/builder-auth\").requireBuilderAuth(request);" }] },
  { id: "P1B-M9", what: "platform-login answers «wrong password» for a malformed teacher directory again", edits: [{ file: LOGIN, find: "      if (configBroken) {", replace: "      if (false) {" }] },
  { id: "P1B-M10", what: "the owner sign-in no longer passes its throttle policy (15-minute lockout again)", edits: [{ file: OWNER_LOGIN, find: "(container, throttleId, clientId, deps, OWNER_THROTTLE_POLICY)", replace: "(container, throttleId, clientId, deps)" }] },
  { id: "P1B-M11", what: "the soft global cap applies to every account (teachers lose their escalation)", edits: [{ file: THROTTLE, find: "Math.min(policy.globalMaxCooldownSeconds, MAX_COOLDOWN_SECONDS) : MAX_COOLDOWN_SECONDS;", replace: "Math.min(policy.globalMaxCooldownSeconds, MAX_COOLDOWN_SECONDS) : 120;" }] },
  { id: "P1B-M12", what: "the per-address bucket also becomes soft for the owner", edits: [{ file: THROTTLE, find: "    const p = evaluateBucket(await dl(container, perIpName), nowMs, PER_IP_FREE_ATTEMPTS);", replace: "    const p = evaluateBucket(await dl(container, perIpName), nowMs, PER_IP_FREE_ATTEMPTS, policy.globalMaxCooldownSeconds || MAX_COOLDOWN_SECONDS);" }] }
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
console.log("\nP1-B: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
