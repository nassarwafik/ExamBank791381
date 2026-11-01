#!/usr/bin/env node
// Tadris+ P2-B — mutation proof for the D6 closure of the shared-password sign-in and the one-time import of its workspace.
// Same engine and rules as scripts/mutate-p1a.mjs (sha256-verified restore after every mutant, also on interruption).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/legacy-closure-p2b.test.js", "api/tests/legacy-import-p2b.test.js", "api/tests/ai-rate-limit-d3.test.js"];
const SESSION = "api/src/lib/teacher-session.js";
const PRESENCE = "api/src/lib/identity/owner-presence.js";
const PLOGIN = "api/src/functions/platform-login.js";
const BLOGIN = "api/src/functions/builder-login.js";
const PSESSION = "api/src/functions/platform-session.js";
const OWNER = "api/src/functions/owner-teachers.js";
const TOKEN = "api/src/lib/identity/teacher-token.js";
const AI = "api/src/lib/ai-rate-limit.js";

export const MUTANTS = [
  { id: "P2B-M1", what: "a shared-password session keeps working after the owner exists (D6 closure dropped)", edits: [{ file: SESSION, find: "    return closed ? legacyClosed() : legacy;", replace: "    return legacy;" }] },
  { id: "P2B-M2", what: "the owner's existence unreadable → the shared-password session is allowed (fail open)", edits: [{ file: SESSION, find: "    try { closed = await ownerExists(() => containerOf(deps)); } catch { return unavailable(); }", replace: "    try { closed = await ownerExists(() => containerOf(deps)); } catch { return legacy; }" }] },
  { id: "P2B-M3", what: "a v2 session bound to the shared-password mode (am legacy) is not recognised", edits: [{ file: SESSION, find: "  return user.am === \"legacy\" || user.legacy === true", replace: "  return user.legacy === true" }] },
  { id: "P2B-M4", what: "a pre-R8 (v1) shared-password token is not recognised", edits: [{ file: SESSION, find: " || user.legacy === true || ", replace: " || " }] },
  { id: "P2B-M5", what: "platform-login still checks — and accepts — the shared password once the owner exists", edits: [{ file: PLOGIN, find: "    if (sharedPassword === \"open\") {", replace: "    if (sharedPassword !== \"unknown\") {" }] },
  { id: "P2B-M6", what: "platform-login treats an unreadable owner marker as «no owner» (fail open)", edits: [{ file: PLOGIN, find: "catch { sharedPassword = \"unknown\"; }", replace: "catch { sharedPassword = \"open\"; }" }] },
  { id: "P2B-M7", what: "builder-login ignores the closure", edits: [{ file: BLOGIN, find: "      if (closed) {", replace: "      if (false) {" }] },
  { id: "P2B-M8", what: "the session probe still confirms a closed shared-password session", edits: [{ file: PSESSION, find: "    if (gate === \"closed\") {", replace: "    if (gate === \"never\") {" }] },
  { id: "P2B-M9", what: "an ABSENT owner marker is cached as present (closes the shared password before any owner exists)", edits: [{ file: PRESENCE, find: "  if (marker) ownerSeen = true;", replace: "  ownerSeen = true;" }] },
  { id: "P2B-M10", what: "a seen owner is not remembered (a later storage outage turns the closure into 503s)", edits: [{ file: PRESENCE, find: "  if (ownerSeen) return true;\n", replace: "" }] },
  { id: "P2B-M11", what: "the import does not record that it already happened (offered again)", edits: [{ file: OWNER, find: "  if (await readTeacherAccount(container, LEGACY_TEACHER_ACCOUNT_ID)) return", replace: "  if (false) return" }] },
  { id: "P2B-M12", what: "the import is allowed in BUILDER_USERS mode", edits: [{ file: OWNER, find: "  if (mode !== \"legacy\") return { available: false, reason: \"NOT_SHARED_PASSWORD_MODE\" };\n", replace: "" }] },
  { id: "P2B-M13", what: "the import is allowed while LEGACY_DATA_OWNER names another owner", edits: [{ file: OWNER, find: "  if (legacyDataOwner(env)) return { available: false, reason: \"LEGACY_DATA_OWNER_SET\" };\n", replace: "" }] },
  { id: "P2B-M14", what: "an owner change (the import included) no longer needs a recent step-up", edits: [{ file: OWNER, find: "    if (denial) return denial;", replace: "    if (false) return denial;" }] },
  { id: "P2B-M15", what: "any t_… text is accepted as a managed account id", edits: [{ file: TOKEN, find: "  return ACCOUNT_ID_RE.test(s) || s === LEGACY_TEACHER_ACCOUNT_ID;", replace: "  return ACCOUNT_ID_RE.test(s) || s.startsWith(\"t_\");" }] },
  { id: "P2B-M16", what: "the imported account gets a console-shaped id (it would lose the old workspace's data)", edits: [{ file: TOKEN, find: "const LEGACY_TEACHER_ACCOUNT_ID = \"t_legacy\";", replace: "const LEGACY_TEACHER_ACCOUNT_ID = \"t_00000000000000ff\";" }] },
  { id: "P2B-M17", what: "the AI limiter hands an undecidable session (503) on to the handler", edits: [{ file: AI, find: "    if (session && !session.ok && session.response && session.response.status === 503) {", replace: "    if (false) {" }] },
  { id: "P2B-M18", what: "the profile copy guesses the old subject when BUILDER_USER_CODE is absent", edits: [{ file: OWNER, find: "  const code = String(env.BUILDER_USER_CODE || \"\").trim();", replace: "  const code = String(env.BUILDER_USER_CODE || \"builder\").trim();" }] }
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
console.log("\nP2-B: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
