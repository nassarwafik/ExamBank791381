#!/usr/bin/env node
// Trial teacher accounts — mutation proof for the end of a trial (an authority invariant): the per-request session check, the
// sign-in, the invitation link (and its compare-and-set re-check), the fail-closed reading of a trial record, the extension rule,
// the owner API and the console flow. Same engine and rules as scripts/mutate-p4b1.mjs (byte-for-byte, hash-verified restore
// after every mutant).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/owner-teacher-trial.test.js", "src/owner/OwnerTeachers.trial.test.tsx", "src/owner/OwnerTeacherDetails.trial.test.tsx"];
const ACCOUNTS = "api/src/lib/identity/teacher-accounts.js";
const SESSION = "api/src/lib/teacher-session.js";
const LOGIN = "api/src/functions/platform-login.js";
const INVITE = "api/src/functions/teacher-invitation.js";
const TEACHERS = "api/src/functions/owner-teachers.js";
const LIST = "src/owner/OwnerTeachers.tsx";
const CONTROLS = "src/owner/TrialControls.tsx";

export const MUTANTS = [
  { id: "TRIAL-M1", what: "an open session survives the end of the trial", edits: [{ file: SESSION, find: "  if (trialEnded(account, nowMs)) return trialOver();\n", replace: "" }] },
  { id: "TRIAL-M2", what: "sign-in ignores the end of the trial", edits: [{ file: LOGIN, find: "      if (trialEnded(managed, nowMs)) {", replace: "      if (false) {" }] },
  { id: "TRIAL-M3", what: "the invitation link of an ended trial still resolves", edits: [{ file: ACCOUNTS, find: " || account.status === \"suspended\" || trialEnded(account, nowMs)) return null;", replace: " || account.status === \"suspended\") return null;" }] },
  { id: "TRIAL-M4", what: "accept's compare-and-set does not re-check the trial", edits: [{ file: INVITE, find: " || a.status === \"suspended\" || trialEnded(a, nowMs)) {", replace: " || a.status === \"suspended\") {" }] },
  { id: "TRIAL-M5", what: "an unreadable trial record counts as running (fail open)", edits: [{ file: ACCOUNTS, find: "  if (typeof t !== \"object\" || !Number.isFinite(Number(t.endsAtMs))) return true;", replace: "  if (typeof t !== \"object\" || !Number.isFinite(Number(t.endsAtMs))) return false;" }] },
  { id: "TRIAL-M6", what: "the trial still runs at its exact end", edits: [{ file: ACCOUNTS, find: "  return !(Number(t.endsAtMs) > nowMs);", replace: "  return !(Number(t.endsAtMs) >= nowMs);" }] },
  { id: "TRIAL-M7", what: "an ended trial is extended from its old end (already over again)", edits: [{ file: ACCOUNTS, find: "  const from = Math.max(end, nowMs);", replace: "  const from = end;" }] },
  { id: "TRIAL-M8", what: "the trial length is not bounded (any number of days)", edits: [{ file: ACCOUNTS, find: "n >= MIN_TRIAL_DAYS && n <= MAX_TRIAL_DAYS ? n : null", replace: "n >= 0 ? n : null" }] },
  { id: "TRIAL-M9", what: "create ignores trialDays (a trial becomes permanent)", edits: [{ file: TEACHERS, find: "        ...(trialDays ? { trial: newTrial(trialDays, nowMs) } : {}),\n", replace: "" }] },
  { id: "TRIAL-M10", what: "end-trial leaves the trial in place", edits: [{ file: TEACHERS, find: "? { ...a, trial: null, trialConvertedAt: iso, updatedAt: iso }", replace: "? { ...a, trialConvertedAt: iso, updatedAt: iso }" }] },
  { id: "TRIAL-M11", what: "trial actions accept a permanent account", edits: [{ file: TEACHERS, find: "      if (!isTrial(current)) return reply(409,", replace: "      if (false) return reply(409," }, { file: TEACHERS, find: "        if (!isTrial(a)) { const e = new Error(\"not a trial\");", replace: "        if (false) { const e = new Error(\"not a trial\");" }] },
  { id: "TRIAL-M12", what: "the owner view never says the trial ended", edits: [{ file: ACCOUNTS, find: "ended: trialEnded(a, nowMs) }", replace: "ended: false }" }] },
  { id: "TRIAL-M13", what: "the console form does not send trialDays", edits: [{ file: LIST, find: "      ...(trial ? { trialDays } : {})\n", replace: "" }] },
  { id: "TRIAL-M14", what: "«تحويل إلى حساب دائم» converts without a confirmation", edits: [{ file: CONTROLS, find: "onClick={() => setMode(\"permanent\")}", replace: "onClick={() => onMakePermanent()}" }] },
  { id: "TRIAL-M15", what: "a step-up does not retry a trial change", edits: [{ file: LIST, find: "      if (t.code === \"STEP_UP_REQUIRED\") { setStepUp(p); return; }", replace: "      if (t.code === \"STEP_UP_REQUIRED\") { return; }" }] }
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
console.log("\nTrial accounts: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
