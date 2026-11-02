#!/usr/bin/env node
// Tadris+ P4-B2 — mutation proof for the add-teacher wizard (steps, the identity / access checks, the copy from a teacher) and
// for «ابدأ من صلاحيات معلم آخر», plus create's individual changes on the server. Same engine and rules as
// scripts/mutate-p1a.mjs (byte-for-byte, hash-verified restore after every mutant).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/owner-teacher-wizard-p4b2.test.js", "src/owner/TeacherWizard.p4b2.test.tsx", "src/owner/OwnerTeachers.p2a2b.test.tsx", "src/owner/OwnerTeachers.p3a.test.tsx"];
const TEACHERS = "api/src/functions/owner-teachers.js";
const API = "src/owner/ownerApi.ts";
const WIZARD = "src/owner/TeacherWizard.tsx";
const DETAILS = "src/owner/OwnerTeacherDetails.tsx";

export const MUTANTS = [
  { id: "P4B2-M1", what: "create ignores the grants / denies", edits: [{ file: TEACHERS, find: "grants: body.grants === undefined ? [] : body.grants, denies: body.denies === undefined ? [] : body.denies,\n              reason: \"initial access at creation\"", replace: "grants: [], denies: [],\n              reason: \"initial access at creation\"" }] },
  { id: "P4B2-M2", what: "grants / denies without a preset are accepted", edits: [{ file: TEACHERS, find: "        if (!wantsPreset && hasLists) return bad(\"ACCESS_PRESET_MISSING\", ACCESS_REFUSAL.ACCESS_PRESET_MISSING);\n", replace: "" }] },
  { id: "P4B2-M3", what: "the new account counts no individual changes", edits: [{ file: TEACHERS, find: "accessGrants: initialAccess.grants.length, accessDenies: initialAccess.denies.length", replace: "accessGrants: 0, accessDenies: 0" }] },
  { id: "P4B2-M4", what: "the first revision drops the note", edits: [{ file: TEACHERS, find: "reason: \"initial access at creation\" + (note ? \" — \" + note : \"\")", replace: "reason: \"initial access at creation\"" }] },
  { id: "P4B2-M5", what: "the creation audit omits the individual changes", edits: [{ file: TEACHERS, find: ", ...(initialAccess.grants.length || initialAccess.denies.length ? { grants: initialAccess.grants, denies: initialAccess.denies } : {})", replace: "" }] },
  { id: "P4B2-M6", what: "an untrusted current access can be copied", edits: [{ file: API, find: "  if (!head.valid || !head.preset) return", replace: "  if (false) return" }] },
  { id: "P4B2-M7", what: "the wizard skips the required identity check", edits: [{ file: WIZARD, find: "if (step === \"identity\" && (!username.trim() || !displayName.trim()))", replace: "if (false)" }] },
  { id: "P4B2-M8", what: "the wizard does not send the copied access", edits: [{ file: WIZARD, find: "if (copied && copied.preset && sourceTeacher) {", replace: "if (false) {" }] },
  { id: "P4B2-M9", what: "a preset choice keeps a previous copy", edits: [{ file: WIZARD, find: "if (e.target.value) { setSourceId(\"\"); setSource(null); setError(\"\"); }", replace: "if (e.target.value) { setError(\"\"); }" }] },
  { id: "P4B2-M10", what: "teachers without access are offered as a copy source", edits: [{ file: WIZARD, find: "const copyable = teachers.filter(t => t.access);", replace: "const copyable = teachers.filter(() => true);" }] },
  { id: "P4B2-M11", what: "the access step lets a required choice be skipped", edits: [{ file: WIZARD, find: "      if (presetRequired && !accessCaps) { setError(PRESET_REQUIRED); return false; }\n", replace: "" }] },
  { id: "P4B2-M12", what: "the wizard goes on with a copy that failed", edits: [{ file: WIZARD, find: "      if (sourceId && !copied) {", replace: "      if (false) {" }] },
  { id: "P4B2-M13", what: "the step heading does not take the focus", edits: [{ file: WIZARD, find: "heading.current?.focus(); }, [step]);", replace: "}, [step]);" }] },
  { id: "P4B2-M14", what: "the teacher page offers the teacher herself as a source", edits: [{ file: DETAILS, find: "others: list.data.teachers.filter(t => t.accountId !== accountId),", replace: "others: list.data.teachers," }] },
  { id: "P4B2-M15", what: "the teacher page loads a copy without its capabilities", edits: [{ file: DETAILS, find: "    setChosen(new Set(r.data.capabilities));\n", replace: "" }] }
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
console.log("\nP4-B2: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
