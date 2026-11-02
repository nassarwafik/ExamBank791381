#!/usr/bin/env node
// Tadris+ P3-C — mutation proof for the capability-shaped teacher UI and the `access` of the sign-in / session answers.
// Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/shell/TeacherAppShell.p3c.test.tsx", "src/AppShell.p3c.test.tsx", "api/tests/session-access-p3c.test.js"];
const ACCESS = "src/shell/teacherAccess.ts";
const SHELL = "src/shell/TeacherAppShell.tsx";
const APP = "src/App.tsx";
const SERVER = "api/src/lib/access/session-access.js";

export const MUTANTS = [
  { id: "P3C-M1", what: "every destination offered even while enforcing", edits: [{ file: ACCESS, find: "  return NAV_CAPABILITIES[id].some(c => access.capabilities.includes(c));", replace: "  return true;" }] },
  { id: "P3C-M2", what: "an unavailable access offers everything (fail open)", edits: [{ file: ACCESS, find: "  if (access.status === \"unavailable\") return false;", replace: "  if (access.status === \"unavailable\") return true;" }] },
  { id: "P3C-M3", what: "destinations hidden before enforcement (zero-change broken)", edits: [{ file: ACCESS, find: "  if (!access.enforced) return true;\n", replace: "" }] },
  { id: "P3C-M4", what: "an «unavailable» answer is read as unknown", edits: [{ file: ACCESS, find: "  if (v.status === \"unavailable\") return { status: \"unavailable\", enforced: true, capabilities: [] };", replace: "  if (v.status === \"unavailable\") return null;" }] },
  { id: "P3C-M5", what: "a disabled destination reached directly renders its page", edits: [{ file: SHELL, find: "  } else if (!navAllowed(active, access)) {", replace: "  } else if (false) {" }] },
  { id: "P3C-M6", what: "the server never reports enforcement", edits: [{ file: SERVER, find: ").mode === \"enforce\" : false;", replace: ").mode === \"never\" : false;" }] },
  { id: "P3C-M7", what: "identities that predate the console are reported as limited", edits: [{ file: SERVER, find: "const enforced = user && user.am === \"managed\" ?", replace: "const enforced = true ?" }] },
  { id: "P3C-M8", what: "an unreadable mode is reported as not enforced instead of unavailable", edits: [{ file: SERVER, find: "(await readAccessMode(containerOf(), deps)).mode", replace: "(await readAccessMode(containerOf(), deps).catch(() => ({ mode: \"legacy\" }))).mode" }] },
  { id: "P3C-M9", what: "the builder destination keyed to the wrong capability", edits: [{ file: ACCESS, find: "  builder: [\"examBuilder.exam.edit\", \"examBuilder.exam.create\"],", replace: "  builder: [\"classes.class.view\"]," }] },
  { id: "P3C-M10", what: "sign-in ignores the access for the landing page", edits: [{ file: APP, find: "      const landing = !isLearningLocation() && !navAllowed(\"builder\", signedInAccess) ? firstAllowed(PRIMARY_NAV, signedInAccess) : null;", replace: "      const landing = null as null | \"dashboard\";" }] }
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
console.log("\nP3-C: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
