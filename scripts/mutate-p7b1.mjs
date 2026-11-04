#!/usr/bin/env node
// Tadris+ P7-B1 — mutation proof for the student's messaging following the access of the student's teacher (enforce only, D15, fail
// closed) and for owner decision D14 (one conversation, read only, a reason and a recent second-factor check per opening, recorded —
// strictly — in the owner's audit log and in the teacher's activity log), plus the portal and the two consoles. Same engine and
// rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/student-messages-p7b1.test.js", "api/tests/owner-conversations-p7b1.test.js", "src/StudentPortal.services.p7b1.test.tsx", "src/owner/OwnerConversation.p7b1.test.tsx", "src/AuditHistoryPanel.p7b1.test.tsx"];

export const MUTANTS = [
  { id: "P7B1-M1", what: "the student keeps messaging whatever the teacher holds", edits: [{ file: "api/src/lib/access/student-services.js", find: "  return { messages: held.has(MESSAGES_CAPABILITY), games:", replace: "  return { messages: true, games:" }] },
  { id: "P7B1-M2", what: "the rule applies before enforcement", edits: [{ file: "api/src/lib/access/student-services.js", find: "  if (!(await entitlementsEnforced(container, deps))) return EVERYTHING;\n", replace: "" }] },
  { id: "P7B1-M3", what: "an undecidable check opens the service (fail open)", edits: [{ file: "api/src/lib/access/student-services.js", find: "    return serviceUnavailable();", replace: "    return null;" }] },
  { id: "P7B1-M4", what: "the student messages route ignores the service", edits: [{ file: "api/src/functions/student-messages.js", find: "    if (serviceDenial) return serviceDenial;\n", replace: "" }] },
  { id: "P7B1-M5", what: "an undecidable check keeps the bell's messages", edits: [{ file: "api/src/functions/student-notifications.js", find: "    let messages = false, games = [];", replace: "    let messages = true, games = [];" }] },
  { id: "P7B1-M6", what: "the bell counts the messages anyway", edits: [{ file: "api/src/lib/notification-center.js", find: "const messages = ctx.messagesOn === false ? NO_MESSAGES : await unreadSummary(", replace: "const messages = await unreadSummary(" }] },
  { id: "P7B1-M7", what: "the bell lists the message previews anyway", edits: [{ file: "api/src/lib/notification-center.js", find: "const messages = ctx.messagesOn === false ? [] : (await recentNotifications(", replace: "const messages = (await recentNotifications(" }] },
  { id: "P7B1-M8", what: "a moved student follows the class's teacher, not their own", edits: [{ file: "api/src/lib/access/student-services.js", find: "  let owner = student && typeof student.ownerId === \"string\" && student.ownerId ? student.ownerId : null;", replace: "  let owner = null;" }] },
  { id: "P7B1-M9", what: "the conversation opens without a recent second-factor check", edits: [{ file: "api/src/functions/owner-conversations.js", find: "    if (denied) return denied;\n", replace: "" }] },
  { id: "P7B1-M10", what: "the conversation opens without a reason", edits: [{ file: "api/src/functions/owner-conversations.js", find: "if (reason.length < MIN_REASON || reason.length > MAX_REASON) return reply(400", replace: "if (false) return reply(400" }] },
  { id: "P7B1-M11", what: "the opening is not recorded in the owner's audit log", edits: [{ file: "api/src/functions/owner-conversations.js", find: "    await audit(container, { actor, action: \"owner.conversation.opened\"", replace: "    void (container, { actor, action: \"owner.conversation.opened\"" }] },
  { id: "P7B1-M12", what: "the teacher is not told", edits: [{ file: "api/src/functions/owner-conversations.js", find: "    if (teacher) await teacherAudit(container, {", replace: "    if (false) await teacherAudit(container, {" }] },
  { id: "P7B1-M13", what: "a strict audit write swallows its failure", edits: [{ file: "api/src/lib/audit-log.js", find: "    if (strict) throw e;\n", replace: "" }] },
  { id: "P7B1-M14", what: "the teacher's log hides the events about them", edits: [{ file: "api/src/functions/audit-history.js", find: " && String(stored.forTeacher || \"\") !== tenant", replace: "" }] },
  { id: "P7B1-M15", what: "the audit writer drops `forTeacher`", edits: [{ file: "api/src/lib/audit-log.js", find: "      ...(typeof event?.forTeacher === \"string\" && event.forTeacher ? { forTeacher: event.forTeacher } : {})\n", replace: "" }] },
  { id: "P7B1-M16", what: "the conversation is served with edit / delete permissions", edits: [{ file: "api/src/functions/owner-conversations.js", find: "const messages = page.messages.map(doc => messageView(doc));", replace: "const messages = page.messages.map(doc => messageView(doc, { actions: () => ({ canDelete: true }) }));" }] },
  { id: "P7B1-M17", what: "the portal ignores `services`", edits: [{ file: "src/StudentPortal.tsx", find: "setMessagesService(unified.services.messages); ", replace: "" }] },
  { id: "P7B1-M18", what: "the client drops `services`", edits: [{ file: "src/notifications/notificationsClient.ts", find: "messages: s.messages !== false, ...(Array.isArray(s.games)", replace: "messages: true, ...(Array.isArray(s.games)" }] },
  { id: "P7B1-M19", what: "the owner panel opens without a reason", edits: [{ file: "src/owner/OwnerConversation.tsx", find: "  const enough = reason.trim().length >= MIN_REASON;", replace: "  const enough = true;" }] }
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
console.log("\nP7-B1: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
