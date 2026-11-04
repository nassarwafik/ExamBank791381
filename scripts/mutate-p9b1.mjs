#!/usr/bin/env node
// Tadris+ P9-B1 — mutation proof for the certification of the blueprint's 15 acceptance tests: the behavioural route sweep (a guard
// dropped from a route the static registry still sees asking), the signed delivery copy shared by a window (#5), the entitlement and
// the persisted class (#2 / #3 / #4), and the shell's restriction after a reload and under every appearance (#12 / #13). Same engine
// and rules as scripts/mutate-p1a.mjs (byte-for-byte restore, sha256-verified; a timeout is not a kill).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = [
  "api/tests/certification-route-sweep-p9b1.test.js", "api/tests/library-keys-p6a.test.js", "api/tests/content-asset-route-p5c.test.js",
  "api/tests/course-entitlements-p5a.test.js", "api/tests/learning-content-l6a.test.js", "src/AppShell.p3c.test.tsx", "src/shell/TeacherAppShell.p3c.test.tsx"
];

export const MUTANTS = [
  { id: "P9B1-M1", what: "generate-exam answers without its capability (the call stays: the static registry cannot see it)", edits: [{ file: "api/src/functions/generate-exam.js", find: "      const capabilityDenial = await requireCapability(auth, \"generate-exam.js\", \"*\", {}, null);   // Tadris+ P3-B\n      if (capabilityDenial) return capabilityDenial;", replace: "      const capabilityDenial = await requireCapability(auth, \"generate-exam.js\", \"*\", {}, null);   // Tadris+ P3-B\n      if (false) return capabilityDenial;" }] },
  { id: "P9B1-M2", what: "import-upload answers without its capability", edits: [{ file: "api/src/functions/import-upload.js", find: "      const capabilityDenial = await requireCapability(auth, \"import-upload.js\", \"*\", {}, obs);   // Tadris+ P3-B\n      if (capabilityDenial) return capabilityDenial;", replace: "      const capabilityDenial = await requireCapability(auth, \"import-upload.js\", \"*\", {}, obs);   // Tadris+ P3-B\n      if (false) return capabilityDenial;" }] },
  { id: "P9B1-M3", what: "bank-import-action answers without its capability", edits: [{ file: "api/src/functions/bank-import-action.js", find: "      const capabilityDenial = await requireCapability(auth, \"bank-import-action.js\", \"*\", {}, null);   // Tadris+ P3-B\n      if (capabilityDenial) return capabilityDenial;", replace: "      const capabilityDenial = await requireCapability(auth, \"bank-import-action.js\", \"*\", {}, null);   // Tadris+ P3-B\n      if (false) return capabilityDenial;" }] },
  { id: "P9B1-M4", what: "the teacher's message actions (send / announce / edit / delete) answer without their capability", edits: [{ file: "api/src/functions/messages.js", find: "    const capabilityDenial = await requireCapability(auth, \"messages.js\", action, deps, obs);   // Tadris+ P3-B\n    if (capabilityDenial) return capabilityDenial;", replace: "    const capabilityDenial = await requireCapability(auth, \"messages.js\", action, deps, obs);   // Tadris+ P3-B\n    if (false) return capabilityDenial;" }] },
  { id: "P9B1-M5", what: "saving / deleting a saved exam answers without its capability", edits: [{ file: "api/src/functions/manage-saved-exams.js", find: "    const capabilityDenial = await requireCapability(auth, \"manage-saved-exams.js\", action, deps, null);   // Tadris+ P3-B\n    if (capabilityDenial) return capabilityDenial;", replace: "    const capabilityDenial = await requireCapability(auth, \"manage-saved-exams.js\", action, deps, null);   // Tadris+ P3-B\n    if (false) return capabilityDenial;" }] },
  { id: "P9B1-M6", what: "the window's signed copy is shared unfrozen (the P9-B1 fix removed)", edits: [{ file: "api/src/lib/content-assets.js", find: "{ value: deepFreeze(signed), etag:", replace: "{ value: signed, etag:" }] },
  { id: "P9B1-M7", what: "the course decision is skipped for a learning module (entitlement and catalog ignored)", edits: [{ file: "api/src/functions/learning-content.js", find: "      if (!course.ok) return courseRefusal(course);", replace: "      if (false) return courseRefusal(course);" }] },
  { id: "P9B1-M8", what: "a student opens any module of an attached course (the class's publication ignored)", edits: [{ file: "api/src/functions/learning-content.js", find: "if (!classroom || !classCanSeeLearningModule(classroom, courseId, moduleId)) return UNAVAILABLE;", replace: "if (!classroom) return UNAVAILABLE;" }] },
  { id: "P9B1-M9", what: "after a reload the app ignores the probe's access (the stored session is trusted)", edits: [{ file: "src/App.tsx", find: "setTeacherAccess(data.role === \"teacher\" ? parseTeacherAccess(data.access) : null);   // Tadris+ P3-C", replace: "setTeacherAccess(null);   // Tadris+ P3-C" }] },
  { id: "P9B1-M10", what: "a destination that is not enabled is shown anyway (the shell's «غير مفعّلة» guard dropped)", edits: [{ file: "src/shell/TeacherAppShell.tsx", find: "  } else if (!navAllowed(active, access)) {", replace: "  } else if (false) {" }] }
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
console.log("\nP9-B1: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
