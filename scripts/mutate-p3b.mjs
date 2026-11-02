#!/usr/bin/env node
// Tadris+ P3-B1 — mutation proof for the route-capability wiring, requireCapability, observe recording and owner readiness.
// Same engine and rules as scripts/mutate-p1a.mjs (sha256-verified restore after every mutant, also on interruption).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/route-capabilities-p3b.test.js", "api/tests/enforcement-routes-p3b.test.js"];
const REQ = "api/src/lib/access/require-capability.js";
const MAP = "api/src/lib/access/route-capabilities.js";
const OBS = "api/src/lib/access/observations.js";
const AUTH = "api/src/lib/access/authorize.js";
const STUDENTS = "api/src/functions/manage-students.js";
const CLASSES = "api/src/functions/manage-classrooms.js";
const SAVED = "api/src/functions/manage-saved-exams.js";

export const MUTANTS = [
  { id: "P3B-M1", what: "requireCapability evaluates nobody", edits: [{ file: REQ, find: "  if (!user || user.am !== \"managed\") return null;", replace: "  return null;" }] },
  { id: "P3B-M2", what: "requireCapability ignores a denial", edits: [{ file: REQ, find: "  return r.allowed ? null : r.response;", replace: "  return null;" }] },
  { id: "P3B-M3", what: "non-managed sessions are evaluated too (the documented skip lost)", edits: [{ file: REQ, find: "  if (!user || user.am !== \"managed\") return null;", replace: "  if (!user) return null;" }] },
  { id: "P3B-M4", what: "the students route no longer asks for its action's capability", edits: [{ file: STUDENTS, find: "const capabilityDenial = await requireCapability(auth, \"manage-students.js\", action === \"bulkaction\"", replace: "const capabilityDenial = null && await requireCapability(auth, \"manage-students.js\", action === \"bulkaction\"" }] },
  { id: "P3B-M5", what: "D18 broken in the map: deleting a student needs only archive", edits: [{ file: MAP, find: "archive: \"students.student.archive\", unarchive: \"students.student.restore\", delete: \"students.student.delete\",", replace: "archive: \"students.student.archive\", unarchive: \"students.student.restore\", delete: \"students.student.archive\"," }] },
  { id: "P3B-M6", what: "bulk operations are checked as a plain edit", edits: [{ file: STUDENTS, find: "action === \"bulkaction\" ? \"bulk:\" + String(body?.operation || \"\").trim().toLowerCase() : action", replace: "action" }] },
  { id: "P3B-M7", what: "the classes route ignores its action (class creation not checked)", edits: [{ file: CLASSES, find: "const capabilityDenial = await requireCapability(auth, \"manage-classrooms.js\", action, deps, obs);", replace: "const capabilityDenial = await requireCapability(auth, \"manage-classrooms.js\", \"GET\", deps, obs);" }] },
  { id: "P3B-M8", what: "the saved-exams list is not checked", edits: [{ file: SAVED, find: "const capabilityDenial = await requireCapability(auth, \"manage-saved-exams.js\", \"GET\", deps, null);", replace: "const capabilityDenial = null;" }] },
  { id: "P3B-M9", what: "observe no longer records what it would deny", edits: [{ file: REQ, find: "  if (r.decision === \"would-deny\") {", replace: "  if (false) {" }] },
  { id: "P3B-M10", what: "a recording failure breaks the request", edits: [{ file: REQ, find: "    try { await recordObservation(", replace: "    { await recordObservation(" }, { file: REQ, find: "Date.now(), deps); } catch { /* recording is secondary */ }", replace: "Date.now(), deps); }" }] },
  { id: "P3B-M11", what: "the observation throttle is lost (a write per request)", edits: [{ file: OBS, find: "  if (last !== undefined && nowMs - last < THROTTLE_MS) return false;\n", replace: "" }] },
  // P3-B2: readiness moved to lib/access/readiness.js (shared with the enforce gate).
  { id: "P3B-M12", what: "readiness reports ready although a teacher has no access", edits: [{ file: "api/src/lib/access/readiness.js", find: "  return { ready: missing.length === 0,", replace: "  return { ready: true," }] },
  { id: "P3B-M13", what: "readiness counts the imported workspace (D7) as not ready", edits: [{ file: "api/src/lib/access/readiness.js", find: " && t.defaultAccess !== \"legacy-full\");", replace: ");" }] },
  { id: "P3B-M14", what: "an any-of declaration requires ALL of its capabilities", edits: [{ file: AUTH, find: "  const granted = list.some(c => access.capabilities.includes(c));", replace: "  const granted = list.every(c => access.capabilities.includes(c));" }] },
  { id: "P3B-M15", what: "the route map falls back silently for an undeclared route", edits: [{ file: MAP, find: "  if (!route) throw new Error(\"No capability declared for route \" + file);", replace: "  if (!route) return \"classes.class.view\";" }] }
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
console.log("\nP3-B1: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
