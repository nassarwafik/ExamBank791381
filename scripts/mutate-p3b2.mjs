#!/usr/bin/env node
// Tadris+ P3-B2 — mutation proof for the enforcement switch: the readiness gate, leaving enforcement, and the preset required when
// a teacher is created while enforcing. Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/enforce-switch-p3b2.test.js", "api/tests/owner-access-p3a.test.js", "api/tests/access-registry-p3a.test.js", "api/tests/enforcement-routes-p3b.test.js"];
const API = "api/src/functions/owner-access.js";
const TEACHERS = "api/src/functions/owner-teachers.js";
const MODE = "api/src/lib/access/access-mode.js";
const READY = "api/src/lib/access/readiness.js";

export const MUTANTS = [
  { id: "P3B2-M1", what: "enforcement can be turned on while a teacher has no access", edits: [{ file: API, find: "        if (!r.ready) return reply(409,", replace: "        if (false) return reply(409," }] },
  { id: "P3B2-M2", what: "the mode library accepts enforce without the readiness check", edits: [{ file: MODE, find: "(mode === \"enforce\" && opts.enforceReady === true)", replace: "(mode === \"enforce\")" }] },
  { id: "P3B2-M3", what: "a suspended teacher blocks readiness", edits: [{ file: READY, find: "teachers.filter(t => t.status !== \"suspended\" && !t.access", replace: "teachers.filter(t => !t.access" }] },
  { id: "P3B2-M4", what: "the imported workspace (D7 default) blocks readiness", edits: [{ file: READY, find: " && t.defaultAccess !== \"legacy-full\");", replace: ");" }] },
  { id: "P3B2-M5", what: "readiness always answers ready", edits: [{ file: READY, find: "  return { ready: missing.length === 0,", replace: "  return { ready: true," }] },
  { id: "P3B2-M6", what: "a teacher can be created without access while enforcing", edits: [{ file: TEACHERS, find: "          if (mode === \"enforce\") return bad(\"PRESET_REQUIRED\"", replace: "          if (false) return bad(\"PRESET_REQUIRED\"" }] },
  { id: "P3B2-M7", what: "an unreadable mode lets a teacher be created without access", edits: [{ file: TEACHERS, find: "          try { mode = (await readAccessMode(container)).mode; } catch { mode = \"enforce\"; }", replace: "          try { mode = (await readAccessMode(container)).mode; } catch { mode = \"legacy\"; }" }] },
  { id: "P3B2-M8", what: "the new account does not point at its initial revision", edits: [{ file: TEACHERS, find: "        ...(initialAccess ? { accessRevisionId: initialAccess.revisionId, accessPreset: { ...initialAccess.preset }, accessGrants: 0, accessDenies: 0 } : {}),\n", replace: "" }] },
  { id: "P3B2-M9", what: "leaving enforcement is refused when not ready", edits: [{ file: API, find: "      if (wanted === \"enforce\") {", replace: "      if (true) {" }] }
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
console.log("\nP3-B2: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
