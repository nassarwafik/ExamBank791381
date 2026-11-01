#!/usr/bin/env node
// Tadris+ P2-A2b — mutation campaign for the teacher-account screens (AGENTS.md §9): the invitation token never stays in the URL,
// local checks before the server, inline confirmation for disruptive owner actions, step-up retry, 401 → sign-out, the server-side
// teacher sign-out only from the user's own action, and the invitation page staying lazy. Same engine and rules as
// scripts/mutate-p1a.mjs.
//
//   node scripts/mutate-p2a2b.mjs [ids]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/owner/OwnerTeachers.p2a2b.test.tsx", "src/invite/InviteApp.p2a2b.test.tsx", "src/teacher/teacherServerLogout.p2a2b.test.ts"];
const INV = "src/invite/InviteApp.tsx", OT = "src/owner/OwnerTeachers.tsx", APP = "src/App.tsx", LOGOUT = "src/teacher/teacherServerLogout.ts";

export const MUTANTS = [
  { id: "P2A2b-M1", what: "the invitation token stays in the address bar", edits: [{ file: INV, find: "    try { window.history.replaceState(null, \"\", window.location.pathname + window.location.search + INVITE_BARE_HASH); } catch { /* best effort */ }\n", replace: "" }] },
  { id: "P2A2b-M2", what: "the password confirmation is not compared", edits: [{ file: INV, find: '    if (password !== confirm) { setError("تأكيد كلمة المرور لا يطابقها."); return; }\n', replace: "" }] },
  { id: "P2A2b-M3", what: "the local length check is skipped (the server is called with a short password)", edits: [{ file: INV, find: "    if ([...password].length < MIN_PASSWORD) {", replace: "    if (false) {" }] },
  { id: "P2A2b-M4", what: "suspend / reset / end-sessions run without the inline confirmation", edits: [{ file: OT, find: "onClick={() => CONFIRM_TEXT[action] ? setConfirming({ action, teacher: t }) : run({ kind: \"act\", action, teacher: t })}", replace: "onClick={() => run({ kind: \"act\", action, teacher: t })}" }] },
  { id: "P2A2b-M5", what: "after a step-up the owner change is not retried", edits: [{ file: OT, find: "    await run(stepUp);\n", replace: "" }] },
  { id: "P2A2b-M6", what: "a 401 on an owner change does not sign the owner out", edits: [{ file: OT, find: "    if (r.status === 401) { onSignedOut(); return; }\n    if (r.code === \"STEP_UP_REQUIRED\")", replace: "    if (r.code === \"STEP_UP_REQUIRED\")" }] },
  { id: "P2A2b-M7", what: "the teacher's sign-out no longer ends the server session", edits: [{ file: APP, find: "onLogout={() => leavePlatformThen(() => { endTeacherServerSession(token); handleLogout(); })}", replace: "onLogout={() => leavePlatformThen(() => { handleLogout(); })}" }] },
  { id: "P2A2b-M8", what: "every local sign-out (also 401 / expiry) calls the server", edits: [{ file: APP, find: "  function handleLogout() {\n", replace: "  function handleLogout() {\n    endTeacherServerSession(token);\n" }] },
  { id: "P2A2b-M9", what: "the server sign-out is not keepalive (lost when the page navigates)", edits: [{ file: LOGOUT, find: "      keepalive: true,\n", replace: "" }] },
  { id: "P2A2b-M10", what: "the invitation page is imported statically (ships to everyone)", edits: [{ file: "src/invite/InviteEntry.tsx", find: 'const InviteApp = lazy(lazyWithRetry(() => import("./InviteApp"), "invite-app"));', replace: 'import InviteAppStatic from "./InviteApp";\nconst InviteApp = InviteAppStatic;' }] }
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
console.log("\nP2-A2b: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
