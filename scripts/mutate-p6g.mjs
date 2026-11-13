#!/usr/bin/env node
// Tadris+ P6-G — mutation proof for the agreement to the platform's use of a sent exam and the owner's edits before publishing
// (docs/enterprise-library-consent-owner-edit-p6g.md): the current agreement is required, stored and never forged by a malformed row; an
// exam without it is never published or copied; the owner's copy is create-only, owned by the owner's workspace, never written over (nor
// over another's file), read back by the server itself, needs a linked workspace, a pending submission, and is recorded first; the
// edited publication is marked; the copy is never taken as a new exam; the screens (the tick, the version sent, the owner's choices).
// Same engine and rules as scripts/mutate-p6f.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/library-consent-owner-edit-p6g.test.js", "api/tests/library-submissions-p6f.test.js", "src/bank/ExamBankPage.p6g.test.tsx", "src/bank/ExamBankPage.p6f.test.tsx",
  "src/owner/OwnerLibrary.p6g.test.tsx", "src/owner/OwnerLibrary.p6f.test.tsx"];
const LS = "api/src/lib/library-submissions.js";
const RT = "api/src/functions/library-submissions.js";
const OL = "api/src/functions/owner-library.js";
const BANK = "src/bank/ExamBankPage.tsx";
const SUBUI = "src/owner/OwnerLibrarySubmissions.tsx";
const DIALOG = "src/ui/ConfirmDialog.tsx";

const m = (id, what, ...edits) => ({ id, what, edits: edits.map(([file, find, replace]) => ({ file, find, replace })) });
export const MUTANTS = [
  m("P6G-M1", "any agreement version (or none) is accepted", [RT, "if (body.consentVersion !== LS.CONSENT.version) {", "if (false) {"]),
  m("P6G-M2", "the agreement is not stored with the submission", [RT, "iso, consent: { version: LS.CONSENT.version, at: iso } }, deps);", "iso }, deps);"]),
  m("P6G-M3", "an exam sent without the agreement may be published", [OL, "  if (!LS.hasConsent(row)) return CONSENT_MISSING();   // Tadris+ P6-G\n", ""]),
  m("P6G-M4", "an exam sent without the agreement may be copied", [OL, "  if (!LS.hasConsent(row)) return CONSENT_MISSING();\n  const bankContainer", "  const bankContainer"]),
  m("P6G-M5", "every submission counts as agreed", [LS, "const hasConsent = r => r.sentBy === \"owner\" || validConsent(r.consent);", "const hasConsent = r => true;"]),
  m("P6G-M6", "a malformed agreement in the index is accepted (fail open)", [LS, "    && (r.consent === undefined || validConsent(r.consent))\n", "    && true\n"]),
  m("P6G-M7", "a malformed owner copy in the index is accepted (fail open)", [LS, "    && (r.ownerCopy === undefined || (!!r.ownerCopy && typeof r.ownerCopy === \"object\" && isSafeSavedExamBlob(r.ownerCopy.blobName) && validIso(r.ownerCopy.copiedAt)));", "    && true;"]),
  m("P6G-M8", "copying again overwrites the owner's edits", [LS, "(deps.uploadBankJsonConditional || storage.uploadJsonConditional)(bankContainer, blobName, { kind: \"saved-exam\", savedAt: iso, exam, ownerId: linkedTeacherId }, null)", "storage.uploadJson(bankContainer, blobName, { kind: \"saved-exam\", savedAt: iso, exam, ownerId: linkedTeacherId })"]),
  m("P6G-M9", "a file at the copy's place that is not the workspace's is taken as the copy", [LS, "if (current && storedOwnerOf(current) === linkedTeacherId) return { blobName, created: false };", "if (current) return { blobName, created: false };"]),
  m("P6G-M10", "the copy is not owned by the owner's workspace", [LS, "savedAt: iso, exam, ownerId: linkedTeacherId }, null);", "savedAt: iso, exam }, null);"]),
  m("P6G-M11", "publishing «my edited copy» publishes the teacher's exam (the edits are lost)", [OL, "    source = (await LS.sendableExam(", "    void (await LS.sendableExam("]),
  m("P6G-M12", "the copy is read whoever owns the file", [OL, "teacherId: linked, savedExamBlob: row.ownerCopy.blobName", "teacherId: ((await (deps.downloadBankJsonOrNull || storage.downloadJsonOrNull)(bankContainer, row.ownerCopy.blobName)) || {}).ownerId, savedExamBlob: row.ownerCopy.blobName"]),
  m("P6G-M13", "a copy is made without a linked workspace", [OL, "  if (!linked) return NO_LINKED_WORKSPACE();\n  const lsIndex", "  const lsIndex"]),
  m("P6G-M14", "a submission no longer pending may be copied", [OL, "  if (row.status !== \"pending\") return reply(409, { ok: false, code: \"SUBMISSION_NOT_PENDING\", error: \"لم يعد هذا الإرسال قيد المراجعة.\" });\n  if (row.sentBy === \"owner\")", "  if (row.sentBy === \"owner\")"]),
  m("P6G-M15", "a copy is not recorded in the owner audit before it happens", [OL, "  return await recordOwnerChange(container, { actor, action: \"owner.library.submission-copied\"", "  return await (async (_c, _e, apply) => apply())(container, { actor, action: \"owner.library.submission-copied\""]),
  m("P6G-M16", "an edited publication is not marked for the teacher", [OL, "libraryItemId: item.libraryItemId, ...(fromOwnerCopy ? { editedByOwner: true } : {}) }, deps); }", "libraryItemId: item.libraryItemId }, deps); }"]),
  m("P6G-M17", "the owner's copy may be taken as a new exam of the owner", [OL, "if (LS.ownerCopySubmissionOf(savedExamBlob)) return reply(409", "if (false) return reply(409"]),
  m("P6G-M18", "«إرسال» is enabled without the tick", [DIALOG, "const agreed = !options.acknowledge || ticked === options;", "const agreed = true;"]),
  m("P6G-M19", "a tick is reused by a later confirmation", [DIALOG, "const agreed = !options.acknowledge || ticked === options;", "const agreed = !options.acknowledge || ticked !== null;"], [DIALOG, "checked={ticked === options}", "checked={ticked !== null}"]),
  m("P6G-M20", "the agreed version is not sent", [BANK, "consentVersion: agreement.version", "consentVersion: undefined"]),
  m("P6G-M21", "the owner is offered publishing and copying of an exam sent without the agreement", [SUBUI, "const consented = s.consented !== false;", "const consented = true;"]),
  m("P6G-M22", "«نسختي المعدّلة» publishes the teacher's exam", [SUBUI, "...(fromCopy ? { fromOwnerCopy: true } : {})", "...({})"]),
  m("P6G-M23", "an edited copy that is not ready may be published", [SUBUI, "disabled={busy || !ready || !title.trim() || !category}", "disabled={busy || !title.trim() || !category}"], [SUBUI, "e.preventDefault(); if (!ready) return; void send(", "e.preventDefault(); void send("]),
  m("P6G-M24", "the owner's copy in «من امتحاناتي» is offered as a new exam", [SUBUI, "{e.ownerCopyOf ? (", "{false ? ("])
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
console.log("\nP6-G: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
