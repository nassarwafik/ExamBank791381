#!/usr/bin/env node
// Tadris+ P10-A — mutation proof for managed teacher sessions recorded on the server (approved design
// docs/enterprise-teacher-sessions-p10a.md): only a recorded, unexpired session is accepted; sign-in and the owner switch record
// before the token is given; 10 devices; logout removes; end-sessions / suspension empty the record; only the id's hash is stored;
// an injected ISO clock is read. (The explicit «unreadable clock → refuse» guard is an EQUIVALENT mutant: with a NaN clock no
// recorded session is live, so the request is refused anyway — kept as defence in depth, recorded in the PR.) Same engine and rules as scripts/mutate-p1a.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/teacher-sessions-p10a.test.js", "api/tests/teacher-accounts-p2a2.test.js", "api/tests/owner-handoff-p4d.test.js"];

export const MUTANTS = [
  { id: "P10A-M1", what: "the request accepts a session the account never recorded (O1 reopened)", edits: [{ file: "api/src/lib/teacher-session.js", find: "!sessionActive(account, claim.sid, nowMs)", replace: "false" }] },
  { id: "P10A-M2", what: "an expired recorded session is still accepted", edits: [{ file: "api/src/lib/identity/teacher-accounts.js", find: "Number(s.expiresAtMs) > nowMs &&", replace: "true &&" }] },
  { id: "P10A-M3", what: "sign-in gives the token without recording the session", edits: [{ file: "api/src/functions/platform-login.js", find: "      try {\n        await (deps.mutateTeacherAccount || mutateTeacherAccount)(container, managed.accountId, a => ({ ...withTeacherSession(", replace: "      try { if (false)\n        await (deps.mutateTeacherAccount || mutateTeacherAccount)(container, managed.accountId, a => ({ ...withTeacherSession(" }] },
  { id: "P10A-M4", what: "no 10-device limit: the oldest session is never ended", edits: [{ file: "api/src/lib/identity/teacher-accounts.js", find: "sessions: list.slice(-MAX_TEACHER_SESSIONS) };", replace: "sessions: list };" }] },
  { id: "P10A-M5", what: "logout does not remove the session (O6 reopened)", edits: [{ file: "api/src/lib/identity/teacher-accounts.js", find: "sessions: liveSessions(account, nowMs).filter(s => s.sidHash !== h) };", replace: "sessions: liveSessions(account, nowMs) };" }] },
  { id: "P10A-M6", what: "owner «end-sessions» keeps the recorded sessions", edits: [{ file: "api/src/functions/owner-teachers.js", find: "if (action === \"end-sessions\") return { ...withNoTeacherSessions(a),", replace: "if (action === \"end-sessions\") return { ...a," }] },
  { id: "P10A-M7", what: "suspension keeps the recorded sessions", edits: [{ file: "api/src/functions/owner-teachers.js", find: "if (action === \"suspend\") return { ...withNoTeacherSessions(a),", replace: "if (action === \"suspend\") return { ...a," }] },
  { id: "P10A-M8", what: "the session id itself is stored (not its hash)", edits: [{ file: "api/src/lib/identity/teacher-accounts.js", find: "const sessionHash = sid => sha256Hex(\"tadris-teacher-session|\" + String(sid));", replace: "const sessionHash = sid => String(sid).padEnd(64, \"0\");" }] },
  { id: "P10A-M9", what: "the owner switch into a teacher does not record its session", edits: [{ file: "api/src/functions/owner-handoff.js", find: "a => ({ ...withTeacherSession(a, { sid, expiresAtMs: payload.exp * 1000, nowMs, via: \"owner-handoff\" }),", replace: "a => ({ ...a," }] },
  { id: "P10A-M10", what: "the injected ISO clock is not parsed (an assignments-style now)", edits: [{ file: "api/src/lib/teacher-session.js", find: "const nowMs = typeof rawNow === \"number\" ? rawNow : Date.parse(String(rawNow));", replace: "const nowMs = rawNow;" }] }
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
console.log("\nP10-A: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
