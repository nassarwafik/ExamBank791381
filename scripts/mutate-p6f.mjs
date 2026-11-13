#!/usr/bin/env node
// Tadris+ P6-F — mutation proof for the exams teachers send to the platform bank (docs/enterprise-library-submissions-p6f.md):
// only the teacher's OWN exam (never an unowned one, never by an identity without an account), a governed exam's published revision,
// ready or refused, frozen and verified, at most 20 pending, a resend supersedes, withdraw / list only one's own, fail closed; the
// owner's decisions (pending only, a reason to decline, recorded first); the updated version (decision (أ)): the audience moves, the old
// one is hidden, an owner's choice is never overwritten, the series is recognised; builder pictures signed in the library; the screens.
// Same engine and rules as scripts/mutate-p6d.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/library-submissions-p6f.test.js", "api/tests/library-bank-images-p6f.test.js", "src/bank/ExamBankPage.p6f.test.tsx", "src/owner/OwnerLibrary.p6f.test.tsx"];
const LS = "api/src/lib/library-submissions.js";
const LP = "api/src/lib/library-publish.js";
const RT = "api/src/functions/library-submissions.js";
const OL = "api/src/functions/owner-library.js";
const LIB = "api/src/functions/exam-library.js";
const BANK = "src/bank/ExamBankPage.tsx";
const SUBUI = "src/owner/OwnerLibrarySubmissions.tsx";

export const MUTANTS = [
  { id: "P6F-M1", what: "a teacher may send another teacher's exam", edits: [{ file: LS, find: "if (!document || !document.exam || storedOwnerOf(document) !== teacherId)", replace: "if (!document || !document.exam)" }] },
  { id: "P6F-M2", what: "an exam without an owner may be sent", edits: [{ file: LS, find: "storedOwnerOf(document) !== teacherId) throw new SubmissionRefusal(404", replace: "(storedOwnerOf(document) && storedOwnerOf(document) !== teacherId)) throw new SubmissionRefusal(404" }] },
  { id: "P6F-M3", what: "a governed exam sends its draft", edits: [{ file: LS, find: "    if (gov.governed) { exam = gov.revision.exam; governed = true; }", replace: "" }] },
  { id: "P6F-M4", what: "an exam that is not ready may be sent", edits: [{ file: RT, find: "      if (!prepared.ok) return prepared.response;\n      const account", replace: "      const account" }] },
  { id: "P6F-M5", what: "an identity without an account may send", edits: [{ file: RT, find: "auth.user && auth.user.am === \"managed\" && isTeacherAccountId(auth.user.sub) ? auth.user.sub : \"\"", replace: "auth.user && auth.user.sub ? String(auth.user.sub) : \"\"" }] },
  { id: "P6F-M6", what: "a teacher lists every teacher's submissions", edits: [{ file: RT, find: "index.items.filter(r => r.teacherId === teacherId)", replace: "index.items.filter(r => true)" }] },
  { id: "P6F-M7", what: "a teacher may withdraw another teacher's submission", edits: [{ file: RT, find: "if (r.teacherId !== teacherId) throw", replace: "if (false) throw" }] },
  { id: "P6F-M8", what: "sending is not in the teacher's activity log", edits: [{ file: RT, find: "action: \"library.submission.sent\"", replace: "action: \"x.sent\"" }] },
  { id: "P6F-M9", what: "a resend does not supersede the pending one", edits: [{ file: LS, find: "    for (const r of idx.items) if (r.lineage === lineage && r.status === \"pending\") { r.status = \"superseded\"; r.decidedAt = iso; }\n", replace: "" }] },
  { id: "P6F-M10", what: "no limit on pending submissions", edits: [{ file: LS, find: "  if (pending >= MAX_PENDING_PER_TEACHER) throw", replace: "  if (false) throw" }, { file: LS, find: "    if (open >= MAX_PENDING_PER_TEACHER) throw", replace: "    if (false) throw" }] },
  { id: "P6F-M11", what: "a submissions index that cannot be understood is read as empty (fail open)", edits: [{ file: LS, find: "    if (!validRow(r) || seen.has(r.submissionId)) throw new SubmissionsUnavailableError(\"submissions index entry invalid\");", replace: "    if (!validRow(r) || seen.has(r.submissionId)) return { schemaVersion: 1, items: [] };" }] },
  { id: "P6F-M12", what: "a frozen exam that is not the one listed is served", edits: [{ file: LS, find: "doc.contentHash !== row.contentHash || ", replace: "" }] },
  { id: "P6F-M13", what: "a decided submission may be published", edits: [{ file: OL, find: "  if (row.status !== \"pending\") return reply(409, { ok: false, code: \"SUBMISSION_NOT_PENDING\", error: \"لم يعد هذا الإرسال قيد المراجعة.\" });\n  // The server decides again", replace: "  // The server decides again" }, { file: LS, find: "    if (!allowed.includes(row.status)) throw", replace: "    if (false) throw" }] },
  { id: "P6F-M14", what: "a decline without a reason", edits: [{ file: OL, find: "  if (!reason) return reply(400, { ok: false, code: \"REASON_REQUIRED\"", replace: "  if (false) return reply(400, { ok: false, code: \"REASON_REQUIRED\"" }] },
  { id: "P6F-M15", what: "a decline is not recorded in the owner audit before it happens", edits: [{ file: OL, find: "  return await recordOwnerChange(container, { actor, action: \"owner.library.submission-declined\"", replace: "  return await (async (_c, _e, apply) => apply())(container, { actor, action: \"owner.library.submission-declined\"" }] },
  { id: "P6F-M16", what: "the updated version does not take the old one's audience", edits: [{ file: LP, find: "doc.items[newId] = { audience: old.audience, teachers: old.teachers,", replace: "doc.items[newId] = { audience: \"selected\", teachers: []," }] },
  { id: "P6F-M17", what: "the old version stays visible", edits: [{ file: LP, find: "    doc.items[oldId] = { audience: \"selected\", teachers: [], updatedAt: iso, updatedBy: actor };\n", replace: "" }] },
  { id: "P6F-M18", what: "completing a replacement overwrites the owner's chosen audience", edits: [{ file: LP, find: "    if (!doc.items[newId]) {", replace: "    if (true) {" }] },
  { id: "P6F-M19", what: "an updated version is never recognised (published as a new exam)", edits: [{ file: OL, find: "  if (!subs.length) return null;", replace: "  return null;" }] },
  { id: "P6F-M20", what: "a builder picture in a library exam is not signed", edits: [{ file: LIB, find: "    if (id) entry = withBankPictures(entry, (deps.nowMs || Date.now)());", replace: "" }] },
  { id: "P6F-M21", what: "the teacher is offered «إرسال» for a legacy exam", edits: [{ file: BANK, find: "{submissions && item.kind === \"structured\" && (", replace: "{submissions && (" }] },
  { id: "P6F-M22", what: "the owner may publish an exam that is not ready", edits: [{ file: SUBUI, find: "      {ready && (\n        <form", replace: "      {true && (\n        <form" }] },
  { id: "P6F-M23", what: "the owner may decline without a reason", edits: [{ file: SUBUI, find: "disabled={busy || !reason.trim()}", replace: "disabled={busy}" }] }
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
console.log("\nP6-F: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
