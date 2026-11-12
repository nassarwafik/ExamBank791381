#!/usr/bin/env node
// Tadris+ P11-B — mutation proof for a separate conversation per teacher (docs/enterprise-shared-messaging-p11b.md): which
// conversation a teacher reaches (never another teacher's), which one a student may select, that a message never crosses from one
// conversation into the other, the unread counts' tenancy and membership, the read marker of the right conversation, the purge on
// delete, the owner's read (membership, the teacher it is recorded for), and the notifications of a shared class (bell, push,
// reminders). Same engine and rules as scripts/mutate-p11a.mjs: every mutated file is restored byte-for-byte (sha256 verified), a
// timeout is not a kill.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/shared-messaging-p11b.test.js", "src/messages/sharedConversations.p11b.test.tsx"];
const MSG = "api/src/functions/messages.js";
const SMSG = "api/src/functions/student-messages.js";
const STORE = "api/src/lib/message-store.js";
const SHARED = "api/src/lib/shared-conversations.js";
const PURGE = "api/src/lib/student-messaging-purge.js";
const OWNER = "api/src/functions/owner-conversations.js";
const CENTER = "api/src/lib/notification-center.js";
const PUSH = "api/src/lib/event-push.js";
const SWEEP = "api/src/lib/assignment-reminder-sweep.js";
const AR = "api/src/functions/assignment-results.js";
const CLIENT = "src/messages/messagesClient.ts";
const ROSTER = "src/owner/OwnerClassRoster.tsx";

export const MUTANTS = [
  // ── which conversation a teacher reaches ──
  { id: "P11B-M1", what: "a teacher reaches the conversation of a class that is not theirs (the class check dropped)", edits: [{ file: MSG, find: "return isStudentSharedIn(student, wanted) && (await ownClass(wanted)) ? shared(wanted) : null;", replace: "return isStudentSharedIn(student, wanted) ? shared(wanted) : null;" }] },
  { id: "P11B-M2", what: "a teacher opens a conversation in a class of theirs the student does not share", edits: [{ file: MSG, find: "return isStudentSharedIn(student, wanted) && (await ownClass(wanted)) ? shared(wanted) : null;", replace: "return (await ownClass(wanted)) ? shared(wanted) : null;" }] },
  { id: "P11B-M3", what: "any teacher gets the conversation of whatever class the student shares", edits: [{ file: MSG, find: "      for (const id of sharedClassIds(student)) if (await ownClass(id)) return shared(id);", replace: "      for (const id of sharedClassIds(student)) if (id) return shared(id);" }] },
  { id: "P11B-M4", what: "a teacher who is not the home teacher gets the HOME conversation", edits: [{ file: MSG, find: "      if (own) return home();", replace: "      if (true) return home();" }] },
  { id: "P11B-M5", what: "the teacher's acknowledgement moves the HOME conversation's marker", edits: [{ file: MSG, find: "          stateName: conv.stateName, ...stream,", replace: "          stateName: teacherDirectStateName(teacherId, studentId), ...stream," }] },
  // ── a message never crosses conversations ──
  { id: "P11B-M6", what: "a message of one conversation is valid in the other", edits: [{ file: STORE, find: "  if (expected.kind === \"direct\" && String(doc.sharedClassId || \"\") !== String(expected.sharedClassId || \"\")) return null;", replace: "" }] },
  { id: "P11B-M7", what: "the student's reply in a shared conversation lands in the home conversation", edits: [{ file: SMSG, find: "    const streams = selected.streams;", replace: "    const streams = conversations[0].streams;" }] },
  { id: "P11B-M8", what: "the student's reply does not name its conversation", edits: [{ file: SMSG, find: "        ...(selected.home ? {} : { sharedClassId: selected.id }),\n        senderRole: \"student\"", replace: "        senderRole: \"student\"" }] },
  { id: "P11B-M9", what: "an unknown conversation falls back to the home one instead of a refusal", edits: [{ file: SMSG, find: "      ? conversations.find(c => !c.home && c.id === wanted) || null", replace: "      ? conversations.find(c => !c.home && c.id === wanted) || conversations[0]" }] },
  // ── unread counts ──
  { id: "P11B-M10", what: "a teacher's badge counts the shared conversations of other teachers' classes", edits: [{ file: SHARED, find: "    if (classOk && !(await classOk(g.classId))) continue;", replace: "" }] },
  { id: "P11B-M11", what: "a conversation still counts after the student left the class", edits: [{ file: SHARED, find: " || !isStudentSharedIn(user, g.classId)) continue;", replace: ") continue;" }] },
  { id: "P11B-M12", what: "the student's total ignores the other conversations", edits: [{ file: SMSG, find: "      const total = combineCounts(...parts.map(x => ({ unread: x.totalUnread, capped: x.totalCapped })));", replace: "      const total = { unread: own.totalUnread, capped: own.totalCapped };" }] },
  // ── delete, owner ──
  { id: "P11B-M13", what: "deleting the account leaves the shared conversations stored", edits: [{ file: PURGE, find: "    async () => (await list(container, SHARED_PREFIX)).filter(n => n.slice(SHARED_PREFIX.length).split(\"/\")[1] === studentId),", replace: "    async () => []," }] },
  { id: "P11B-M14", what: "deleting the account leaves the teachers' markers of shared conversations", edits: [{ file: PURGE, find: " || (n.includes(\"/shared/\") && n.endsWith(\"/\" + studentId + \".json\"))),", replace: ")," }] },
  { id: "P11B-M15", what: "the owner opens a 'conversation' in a class the student does not share", edits: [{ file: OWNER, find: "isSafeId(sharedClassId) && isStudentSharedIn(student, sharedClassId) ?", replace: "isSafeId(sharedClassId) ?" }] },
  { id: "P11B-M16", what: "the owner's reading of a shared conversation is recorded for the HOME teacher", edits: [{ file: OWNER, find: "    const teacher = sharedClass ? (isTeacherAccountId(sharedOwner) ? sharedOwner : null) : await ownerAccountIdOfStudent(container, student, deps);", replace: "    const teacher = await ownerAccountIdOfStudent(container, student, deps);" }] },
  // ── notifications of a shared class ──
  { id: "P11B-M17", what: "the bell shows an assignment of a class that is not the student's", edits: [{ file: CENTER, find: " || !a.classId || !ctx.classIds.has(String(a.classId))) return null;", replace: " || !a.classId) return null;" }] },
  { id: "P11B-M18", what: "the bell has no events of the shared class", edits: [{ file: CENTER, find: "    if (!x.archived) {", replace: "    if (false) {" }] },
  { id: "P11B-M19", what: "the bell's message count ignores the shared conversation", edits: [{ file: CENTER, find: "    if (x.messages === true) messageStreamSets.push(studentSharedStreams(studentId, x.classId));", replace: "" }] },
  { id: "P11B-M20", what: "an assignment push skips the shared students", edits: [{ file: PUSH, find: "const recipientOk = (u, classId) => isStudentInClass(u, classId) && u.active !== false;", replace: "const recipientOk = (u, classId) => isStudentInClass(u, classId) && String(u.classId || \"\") === String(classId) && u.active !== false;" }] },
  { id: "P11B-M21", what: "the automatic reminder skips the shared students", edits: [{ file: SWEEP, find: "const members = users.filter(u => isStudentInClass(u, a.classId));", replace: "const members = users.filter(u => isStudentInClass(u, a.classId) && String(u.classId || \"\") === String(a.classId));" }] },
  { id: "P11B-M22", what: "«تذكير» skips the shared students", edits: [{ file: AR, find: "filter(x=>isStudentInClass(x,a.classId)&&(!wanted||wanted.has(String(x.userId))));", replace: "filter(x=>isStudentInClass(x,a.classId)&&String(x.classId||\"\")===String(a.classId)&&(!wanted||wanted.has(String(x.userId))));" }] },
  // ── the screens ──
  { id: "P11B-M23", what: "the teacher's client does not name the shared student's conversation", edits: [{ file: CLIENT, find: "  const conv = (studentId: string) => (sharedClassOf.has(studentId) ? { conversation: sharedClassOf.get(studentId) as string } : {});", replace: "  const conv = (_studentId: string) => ({});" }] },
  { id: "P11B-M24", what: "a student listed again as the teacher's own keeps the shared conversation", edits: [{ file: CLIENT, find: "if (s.shared) sharedClassOf.set(s.userId, classId); else sharedClassOf.delete(s.userId);", replace: "if (s.shared) sharedClassOf.set(s.userId, classId);" }] },
  { id: "P11B-M25", what: "the student's client does not name its conversation when it writes", edits: [{ file: CLIENT, find: "  const inBody = conversation ? { conversation } : {};", replace: "  const inBody = {};" }] },
  { id: "P11B-M26", what: "the owner's roster opens the HOME conversation for a shared student", edits: [{ file: ROSTER, find: "conversation={st.shared ? classId : undefined}", replace: "conversation={undefined}" }] }
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
console.log("\nP11-B: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
