#!/usr/bin/env node
// Tadris+ QR-3 — mutation proof for recorded student sessions and «الأجهزة المرتبطة» (design docs/enterprise-qr-login-qr3.md): a
// student token with a session id is accepted only while recorded; the sign-in records it before the token exists; a pre-QR-3
// token (no session id) runs to its expiry; the devices route ends only the caller's own sessions; the QR student issuer re-checks
// the approving session; at most 10 sessions. Same engine and rules as scripts/mutate-p10f.mjs (sha256-verified byte-for-byte
// restore; KILLED only when a test fails, a timeout is TIMEOUT).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/session-devices-qr3.test.js"];
const AUTH = "api/src/lib/student-auth.js";
const SESS = "api/src/lib/identity/student-sessions.js";
const LOGIN = "api/src/functions/platform-login.js";
const DEV = "api/src/functions/session-devices.js";
const QR = "api/src/functions/qr-login.js";
const one = (file, find, replace) => ({ file, find, replace });

export const MUTANTS = [
  { id: "QR3-M1", what: "a student session id is not checked against the recorded sessions", edits: [one(AUTH, "if (!Number.isFinite(nowMs) || !studentSessionActive(student, auth.user.sid, nowMs)) return UNAUTHORIZED;", "if (!Number.isFinite(nowMs)) return UNAUTHORIZED;")] },
  { id: "QR3-M2", what: "the password sign-in does not record the student session", edits: [one(LOGIN, 'return withStudentSession(base, { sid: studentSid, expiresAtMs: sessionNowMs + STUDENT_TOKEN_TTL_SECONDS * 1000, nowMs: sessionNowMs, via: "login", device: deviceFromUserAgent(headerUa) });', "return base;")] },
  { id: "QR3-M3", what: "a pre-QR-3 student token (no session id) is refused at once (against the owner decision)", edits: [one(AUTH, "  if (auth.user.sid !== undefined) {\n    const rawNow", "  if (auth.user.sid === undefined) return UNAUTHORIZED;\n  {\n    const rawNow")] },
  { id: "QR3-M4", what: "the student account to end a device in is taken from the request body", edits: [one(DEV, 'const studentName = "platform/users/" + caller.subject + ".json";', 'const studentName = "platform/users/" + (body.userId || caller.subject) + ".json";'), one(DEV, "if (!current || !liveStudentSessions(current, nowMs).some(s => s.sidHash === target)) throw new Gone();", "if (!current) throw new Gone();")] },
  { id: "QR3-M5", what: "ending a session that is not one of the caller's live sessions «succeeds»", edits: [one(DEV, "          if (!live.some(s => s.sidHash === target)) throw new Gone();\n", "")] },
  { id: "QR3-M6", what: "the QR student issuer does not re-check the approving session", edits: [one(QR, '      if (a.sid !== undefined && !studentSessionActive(current, a.sid, nowMs)) throw new Refusal("APPROVER_SESSION_ENDED");\n', "")] },
  { id: "QR3-M7", what: "no limit on recorded student sessions", edits: [one(SESS, "return { ...student, sessions: list.slice(-MAX_STUDENT_SESSIONS) };", "return { ...student, sessions: list };")] },
  { id: "QR3-M8", what: "an ended student session stays recorded", edits: [one(SESS, "return { ...student, sessions: liveStudentSessions(student, nowMs).filter(s => s.sidHash !== sidHash) };", "return { ...student, sessions: liveStudentSessions(student, nowMs) };")] },
  { id: "QR3-M9", what: "the QR sign-in does not record the new device's student session", edits: [one(QR, 'return withStudentSession({ ...current, lastLoginAt: at, updatedAt: at }, { sid: studentSid, expiresAtMs: nowMs + STUDENT_TOKEN_TTL_SECONDS * 1000, nowMs, via: "qr", device: record.device });', "return { ...current, lastLoginAt: at, updatedAt: at };")] },
  { id: "QR3-M10", what: "the raw session id (not its hash) is stored", edits: [one(SESS, "const entry = { sidHash: h,", "const entry = { sid, sidHash: h,")] }
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
console.log("\nQR-3: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
