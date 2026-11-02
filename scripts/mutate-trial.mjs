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
const TESTS = ["api/tests/owner-teacher-trial.test.js", "api/tests/trial-reminder-sweep.test.js", "src/owner/OwnerTeachers.trial.test.tsx", "src/owner/OwnerTeacherDetails.trial.test.tsx", "src/shell/TrialNotice.trial.test.tsx", "src/AppShell.trial.test.tsx"];
const ACCOUNTS = "api/src/lib/identity/teacher-accounts.js";
const SESSION = "api/src/lib/teacher-session.js";
const LOGIN = "api/src/functions/platform-login.js";
const INVITE = "api/src/functions/teacher-invitation.js";
const TEACHERS = "api/src/functions/owner-teachers.js";
const LIST = "src/owner/OwnerTeachers.tsx";
const CONTROLS = "src/owner/TrialControls.tsx";
const PSESSION = "api/src/functions/platform-session.js";
const NOTICE = "src/shell/TrialNotice.tsx";
const APP = "src/App.tsx";
const SHARED = "src/owner/teacherShared.ts";
const SWEEP = "api/src/lib/trial-reminder-sweep.js";
const PROTO = "api/src/lib/trial-reminder-protocol.js";
const ROUTE = "api/src/functions/trial-reminder-sweep.js";
const EMAILLIB = "api/src/lib/email/acs-email.js";

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
  { id: "TRIAL-M15", what: "a step-up does not retry a trial change", edits: [{ file: LIST, find: "      if (t.code === \"STEP_UP_REQUIRED\") { setStepUp(p); return; }", replace: "      if (t.code === \"STEP_UP_REQUIRED\") { return; }" }] },
  // The teacher's own trial view and the alerts before the end.
  { id: "TRIAL-M16", what: "the warning window is the last 7 days, not 3", edits: [{ file: ACCOUNTS, find: "const TRIAL_WARNING_DAYS = 3;", replace: "const TRIAL_WARNING_DAYS = 7;" }] },
  { id: "TRIAL-M17", what: "an ended trial still counts as ending soon", edits: [{ file: ACCOUNTS, find: "  if (!isTrial(account) || trialEnded(account, nowMs)) return false;\n  return Number(account.trial.endsAtMs) - nowMs", replace: "  if (!isTrial(account)) return false;\n  return Number(account.trial.endsAtMs) - nowMs" }] },
  { id: "TRIAL-M18", what: "the session does not carry the teacher's trial", edits: [{ file: SESSION, find: ", trial: teacherTrialView(account, nowMs) } };", replace: " } };" }] },
  { id: "TRIAL-M19", what: "platform-session drops the trial", edits: [{ file: PSESSION, find: "access, trial } };", replace: "access, trial: null } };" }] },
  { id: "TRIAL-M20", what: "sign-in does not carry the trial", edits: [{ file: LOGIN, find: ", trial: teacherTrialView(managed, nowMs) } };", replace: " } };" }] },
  { id: "TRIAL-M21", what: "the teacher app ignores the sign-in trial", edits: [{ file: APP, find: "      setTeacherTrial(resolvedRole === \"teacher\" ? parseTeacherTrial(data.trial) : null);   // Trial accounts", replace: "      setTeacherTrial(null);" }] },
  { id: "TRIAL-M22", what: "the teacher app ignores the boot probe's trial", edits: [{ file: APP, find: "        setTeacherTrial(data.role === \"teacher\" ? parseTeacherTrial(data.trial) : null);       // Trial accounts", replace: "        setTeacherTrial(null);" }] },
  { id: "TRIAL-M23", what: "the teacher's warning never shows (endingSoon ignored)", edits: [{ file: NOTICE, find: "  if (trial.endingSoon) {", replace: "  if (false) {" }] },
  { id: "TRIAL-M24", what: "days left round down", edits: [{ file: NOTICE, find: "Math.max(1, Math.ceil((new Date(endsAt).getTime() - nowMs) / DAY_MS))", replace: "Math.max(1, Math.floor((new Date(endsAt).getTime() - nowMs) / DAY_MS))" }] },
  { id: "TRIAL-M25", what: "the owner badge ignores ending soon", edits: [{ file: SHARED, find: "  if (t.trial.endingSoon) return \"ينتهي خلال \" + trialDaysText(t.trial.endsAt, nowMs);\n", replace: "" }] },
  { id: "TRIAL-M26", what: "the owner alert leaves out the trials ending soon", edits: [{ file: LIST, find: "const soon = teachers.filter(t => t.trial && !t.trial.ended && t.trial.endingSoon);", replace: "const soon = teachers.filter(() => false);" }] },
  // The reminder emails.
  { id: "TRIAL-M27", what: "the sweep key is not separated from the assignment reminder key", edits: [{ file: PROTO, find: ", \"ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY\"]);", replace: "]);" }] },
  { id: "TRIAL-M28", what: "the sweep signature is not checked", edits: [{ file: PROTO, find: "  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false, reason: \"signature\" };\n", replace: "" }] },
  { id: "TRIAL-M29", what: "the trigger window is not checked (stale timestamps accepted)", edits: [{ file: PROTO, find: "  if (Math.abs(nowMs / 1000 - Number(timestamp)) > TRIAL_MAX_SKEW_SECONDS) return { ok: false, reason: \"stale\" };\n", replace: "" }] },
  { id: "TRIAL-M30", what: "the route runs the sweep for any body", edits: [{ file: ROUTE, find: " || body.version !== 1) return reply(400,", replace: ") return reply(400," }] },
  { id: "TRIAL-M31", what: "an email is sent without reserving it (no exactly-once)", edits: [{ file: SWEEP, find: "      if (!reserved) { out.alreadySent += 1; continue; }\n", replace: "" }] },
  { id: "TRIAL-M32", what: "a refused send keeps its marker (never retried)", edits: [{ file: SWEEP, find: "        try { await release(container, marker); } catch", replace: "        try { void release; } catch" }] },
  { id: "TRIAL-M33", what: "markers ignore the end date (an extended trial is not reminded again)", edits: [{ file: SWEEP, find: "\"trial-reminder|\" + accountId + \"|\" + endsAtMs + \"|\" + stage", replace: "\"trial-reminder|\" + accountId + \"|\" + stage" }] },
  { id: "TRIAL-M34", what: "not configured still reserves markers (emails lost once configured)", edits: [{ file: SWEEP, find: "      if (!cfg.ok) continue;                                                 // not configured: reserve nothing, send nothing\n", replace: "      if (!cfg.ok) { await reserve(container, markerName(account.accountId, Number(account.trial.endsAtMs), stage, r.kind), {}); continue; }\n" }] },
  { id: "TRIAL-M35", what: "a suspended trial account is still written to", edits: [{ file: SWEEP, find: "  if (!isTrial(account) || account.status === \"suspended\") return \"\";", replace: "  if (!isTrial(account)) return \"\";" }] },
  { id: "TRIAL-M36", what: "an old ended trial is written to (no grace bound)", edits: [{ file: SWEEP, find: " && nowMs - end <= ENDED_GRACE_MS) return \"ended\";", replace: ") return \"ended\";" }] },
  { id: "TRIAL-M37", what: "the owner copy is never sent", edits: [{ file: SWEEP, find: "    if (cfg.ok && cfg.ownerEmail) recipients.push({ kind: \"owner\", to: cfg.ownerEmail });", replace: "    if (false) recipients.push({ kind: \"owner\", to: cfg.ownerEmail });" }] },
  { id: "TRIAL-M38", what: "the per-run bound is not applied", edits: [{ file: SWEEP, find: "      if (out.sent + out.failed >= maxEmails) { out.truncated = true; continue; }\n", replace: "" }] },
  { id: "TRIAL-M39", what: "names are not escaped in the HTML email", edits: [{ file: SWEEP, find: "lines.map(l => \"<p>\" + escapeHtml(l) + \"</p>\")", replace: "lines.map(l => \"<p>\" + l + \"</p>\")" }] },
  { id: "TRIAL-M40", what: "a malformed sender address is accepted", edits: [{ file: EMAILLIB, find: "  if (!isEmail(sender)) return { ok: false, reason: \"sender-invalid\" };\n", replace: "" }] }
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
