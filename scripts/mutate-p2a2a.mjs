#!/usr/bin/env node
// Tadris+ P2-A2a — mutation campaign for managed teacher accounts (AGENTS.md §9): the per-request account check (immediate
// suspension / reset / logout), the v3 token, invitation links, owner API guards, tenancy of managed teachers, and the places
// that must recognise a managed session (sign-in, introspection, operator gate, AI limiter). Same engine and rules as
// scripts/mutate-p1a.mjs.
//
//   node scripts/mutate-p2a2a.mjs [ids]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/teacher-accounts-p2a2.test.js"];
const SEAM = "api/src/lib/teacher-session.js", TOKEN = "api/src/lib/identity/teacher-token.js", ACC = "api/src/lib/identity/teacher-accounts.js";
const INV = "api/src/functions/teacher-invitation.js", OT = "api/src/functions/owner-teachers.js", LOGIN = "api/src/functions/platform-login.js";

export const MUTANTS = [
  { id: "P2A2a-M1", what: "a suspended account's session keeps working", edits: [{ file: SEAM, find: 'if (!account || account.status !== "active" || !account.credential) return revoked();', replace: 'if (!account || !account.credential) return revoked();' }] },
  { id: "P2A2a-M2", what: "authVersion is not compared (reset / end-sessions ineffective)", edits: [{ file: SEAM, find: "if (account.authVersion !== claim.av || sessionRevoked(account, claim.sid, nowMs)) return revoked();", replace: "if (sessionRevoked(account, claim.sid, nowMs)) return revoked();" }] },
  { id: "P2A2a-M3", what: "logout does not end the session (revoked list ignored)", edits: [{ file: SEAM, find: "if (account.authVersion !== claim.av || sessionRevoked(account, claim.sid, nowMs)) return revoked();", replace: "if (account.authVersion !== claim.av) return revoked();" }] },
  { id: "P2A2a-M4", what: "storage down during the account check lets the request through", edits: [{ file: SEAM, find: "  } catch {\n    return { ok: false, response: { status: 503,", replace: "  } catch {\n    return { ok: true, user: claim };\n    return { ok: false, response: { status: 503," }] },
  { id: "P2A2a-M5", what: "a managed session is not a tenant (no isolation)", edits: [{ file: "api/src/lib/teacher-tenancy.js", find: 'const TENANT_MODES = new Set(["multi-user", "managed"]);', replace: 'const TENANT_MODES = new Set(["multi-user"]);' }] },
  { id: "P2A2a-M6", what: "BUILDER_SESSION_VERSION no longer revokes managed sessions", edits: [{ file: TOKEN, find: '    if (String(p.sv || "") !== getBuilderSessionVersion()) return null;\n', replace: "" }] },
  { id: "P2A2a-M7", what: "the v3 token signature is not checked", edits: [{ file: TOKEN, find: "    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;\n", replace: "" }] },
  { id: "P2A2a-M8", what: "an older invitation link still works after a newer one (hash not compared)", edits: [{ file: ACC, find: "  if (a.length !== 32 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;\n", replace: "" }] },
  { id: "P2A2a-M9", what: "an expired invitation link can still be inspected", edits: [{ file: ACC, find: '  if (!inv || !(Number(inv.expiresAtMs) > nowMs) || account.status === "suspended") return null;', replace: '  if (!inv || account.status === "suspended") return null;' }] },
  { id: "P2A2a-M10", what: "accept does not re-check the link under compare-and-set (double use)", edits: [{ file: INV, find: "        if (!a.invitation || a.invitation.tokenHash !== tokenHash || !(Number(a.invitation.expiresAtMs) > nowMs) || a.status === \"suspended\") {", replace: "        if (false) {" }] },
  { id: "P2A2a-M11", what: "owner changes run without a recent step-up", edits: [{ file: OT, find: "    const denial = stepUpDenial(session, nowMs);\n    if (denial) return denial;\n", replace: "" }] },
  { id: "P2A2a-M12", what: "a username equal to a BUILDER_USERS id is accepted", edits: [{ file: ACC, find: '  if (cfg.kind === "configured" && Object.keys(cfg.users || {}).some(id => String(id).toLowerCase() === u)) return { ok: false, code: "USERNAME_TAKEN" };', replace: "" }] },
  { id: "P2A2a-M13", what: "a suspended managed teacher can sign in", edits: [{ file: LOGIN, find: 'if (managed && managed.status === "active" && managed.credential', replace: "if (managed && managed.credential" }] },
  { id: "P2A2a-M14", what: "the operator gate treats a managed teacher as anonymous (401 instead of 403)", edits: [{ file: "api/src/lib/identity/operator-gate.js", find: "  const managedTeacher = !teacher.ok && Boolean(managedTeacherClaim(request, { nowMs }));", replace: "  const managedTeacher = false;" }] },
  { id: "P2A2a-M15", what: "the AI limiter keys with the synchronous check only (managed teachers bypass it)", edits: [{ file: "api/src/lib/ai-rate-limit.js", find: "    const session = await requireTeacherSession(request, { requireBuilderAuth: auth, getContainer: deps.getContainer });", replace: "    const session = auth(request);" }] },
  { id: "P2A2a-M16", what: "platform-session does not recognise a managed teacher", edits: [{ file: "api/src/functions/platform-session.js", find: "      const teacher = verifyBuilder(authBearer);\n      if (teacher) return await teacherResult(teacher);\n      const m = await managedTeacher();", replace: "      const teacher = verifyBuilder(authBearer);\n      if (teacher) return await teacherResult(teacher);\n      const m = { ok: false };" }] },
  { id: "P2A2a-M17", what: "the owner view leaks the credential", edits: [{ file: ACC, find: "    status: a.status, hasPassword: Boolean(a.credential), invitation: inv,", replace: "    status: a.status, hasPassword: Boolean(a.credential), invitation: inv, credential: a.credential, tokenHash: a.invitation && a.invitation.tokenHash," }] },
  { id: "P2A2a-M18", what: "reset keeps the old password", edits: [{ file: OT, find: "        ...(action === \"reset\" ? { credential: null, authVersion: Number(a.authVersion) + 1 } : {})", replace: "        ...(action === \"reset\" ? { authVersion: Number(a.authVersion) + 1 } : {})" }] }
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
console.log("\nP2-A2a: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
