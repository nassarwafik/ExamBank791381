#!/usr/bin/env node
// Tadris+ P9-A1 — mutation proof for the owner's decision for every class without an owner (M7; owner decisions §19.33): the
// inventory, the dry run (owned class / owned students / digest), apply (digest, ledger first, reason, idempotency, CAS on the class,
// never another owner's student, resumable, the archive rule), undo (applied only, checked before any write, a moved student, a later
// transfer) and the route (step-up, a suspended target, the receiving teacher's log). Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/legacy-ownership-p9a1.test.js"];

export const MUTANTS = [
  { id: "P9A1-M1", what: "the inventory lists owned classes too", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "classes.filter(c => c && !hasOwner(c) && isSafeId(c.classId))", replace: "classes.filter(c => c && isSafeId(c.classId))" }] },
  { id: "P9A1-M2", what: "an undone decision still shows in the inventory", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "if (!l || l.kind !== KIND || l.status !== \"applied\") continue;", replace: "if (!l || l.kind !== KIND) continue;" }] },
  { id: "P9A1-M3", what: "the preview accepts an owned class", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "  if (hasOwner(cls.value)) throw new LegacyRefusal(409, \"CLASS_ALREADY_OWNED\", \"للصف مالك بالفعل. انقله من صفحة المعلم إن لزم.\");\n", replace: "" }] },
  { id: "P9A1-M4", what: "the preview would change an owned student", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "      if (hasOwner(s.doc)) untouched.push(", replace: "      if (false) untouched.push(" }] },
  { id: "P9A1-M5", what: "the digest ignores the students", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "classEtag: cls.etag, students: students.map(s => [s.userId, s.etag])", replace: "classEtag: cls.etag, students: []" }] },
  { id: "P9A1-M6", what: "apply ignores the digest", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "    if (!previewDigest || p.digest !== previewDigest) throw new LegacyRefusal(409, \"PREVIEW_STALE\",", replace: "    if (false) throw new LegacyRefusal(409, \"PREVIEW_STALE\"," }] },
  { id: "P9A1-M7", what: "the ledger is not written first", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "    ledger = (await createLedgerOrResume(container, fresh, deps)) || await dl(container, ledgerName(migrationId));", replace: "    ledger = fresh;" }] },
  { id: "P9A1-M8", what: "apply skips the reason", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "  if (note.length < MIN_REASON || note.length > MAX_REASON) throw new LegacyRefusal(400, \"REASON_REQUIRED\", \"اكتب سبب القرار (\"", replace: "  if (false) throw new LegacyRefusal(400, \"REASON_REQUIRED\", \"اكتب سبب القرار (\"" }] },
  { id: "P9A1-M9", what: "a repeated request is applied again", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "  if (ledger && ledger.status !== \"pending\") return { ledger, duplicate: true };\n", replace: "" }] },
  { id: "P9A1-M10", what: "the class CAS overwrites an owner set since", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "            if (hasOwner(cur)) throw new LegacyRefusal(409, \"CLASS_ALREADY_OWNED\", \"صار للصف مالك منذ المعاينة.\");\n", replace: "" }] },
  { id: "P9A1-M11", what: "another owner's student is overwritten", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "          if (hasOwner(cur)) { outcome = \"skipped\"; return cur; }   // never another owner's student\n", replace: "" }] },
  { id: "P9A1-M12", what: "a half-done run is marked applied", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "    status: failed ? \"pending\" : \"applied\",", replace: "    status: \"applied\"," }] },
  { id: "P9A1-M13", what: "a refused archive is reported as applied", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "    if (!r || r.status >= 300) {\n      const body = (r && r.jsonBody) || {};", replace: "    if (false) {\n      const body = (r && r.jsonBody) || {};" }] },
  { id: "P9A1-M14", what: "undo is allowed for a decision not applied", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "  if (ledger.status !== \"applied\") throw new LegacyRefusal(409, \"UNDO_NOT_APPLICABLE\",", replace: "  if (false) throw new LegacyRefusal(409, \"UNDO_NOT_APPLICABLE\"," }] },
  { id: "P9A1-M15", what: "undo writes without checking first", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "  if (conflicts.length) throw new LegacyRefusal(409, \"UNDO_CONFLICT\",", replace: "  if (false) throw new LegacyRefusal(409, \"UNDO_CONFLICT\"," }] },
  { id: "P9A1-M16", what: "undo ignores a student moved to another teacher", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "      ok = Boolean(cur) && cur.ownerId === ledger.to && cur.legacyOwnershipMigrationId === migrationId", replace: "      ok = Boolean(cur) && cur.legacyOwnershipMigrationId === migrationId" }] },
  { id: "P9A1-M17", what: "undo ignores a later class transfer", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "      ok = Boolean(cur) && cur.ownerId === ledger.to && history.length > 0 && history[history.length - 1].migrationId === migrationId;", replace: "      ok = Boolean(cur);" }] },
  { id: "P9A1-M18", what: "POST without a step-up", edits: [{ file: "api/src/functions/owner-legacy-classes.js", find: "    const denial = stepUpDenial(session, nowMs);\n    if (denial) return denial;\n", replace: "" }] },
  { id: "P9A1-M19", what: "a suspended teacher can receive a class", edits: [{ file: "api/src/functions/owner-legacy-classes.js", find: "      if (teacher.status === \"suspended\") return reply(400,", replace: "      if (false) return reply(400," }] },
  { id: "P9A1-M20", what: "the receiving teacher is not told", edits: [{ file: "api/src/functions/owner-legacy-classes.js", find: "      if (l.decision === \"assign\" && l.status === \"applied\") await teacherAudit(", replace: "      if (false) await teacherAudit(" }] }
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
console.log("\nP9-A1: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
