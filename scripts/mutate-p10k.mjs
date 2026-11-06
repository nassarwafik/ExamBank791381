#!/usr/bin/env node
// Tadris+ P10-K — mutation proof for «the six capabilities no route enforces are reserved» (approved design
// docs/enterprise-reserved-capabilities-p10k.md, owner decision §19.48): a NEW reserved grant or deny is refused on save, an
// inherited one stays, a dependency-forced deny is accepted, reading a revision never looks at it, and the console disables it.
// Same engine and rules as scripts/mutate-p10a.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/reserved-capabilities-p10k.test.js", "src/owner/reservedCapabilities.p10k.test.tsx", "api/tests/owner-access-p3a.test.js"];
const C = "api/src/lib/access/capabilities.js";
const A = "api/src/functions/owner-access.js";
const T = "api/src/functions/owner-teachers.js";
const R = "api/src/lib/access/revisions.js";
const D = "src/owner/OwnerTeacherDetails.tsx";

export const MUTANTS = [
  { id: "P10K-M1", what: "the owner's save no longer refuses a new reserved entry (the O11 defect)", edits: [{ file: A, find: "      if (added.length) return reply(400, { ok: false, code: \"CAPABILITY_RESERVED\"", replace: "      if (false) return reply(400, { ok: false, code: \"CAPABILITY_RESERVED\"" }] },
  { id: "P10K-M2", what: "creating a teacher no longer refuses a reserved entry", edits: [{ file: T, find: "            if (added.length) return reply(400,", replace: "            if (false) return reply(400," }] },
  { id: "P10K-M3", what: "an entry inherited from the current revision is refused too", edits: [{ file: C, find: "    ...denies.filter(id => isReserved(id) && !prev.denies.has(id) && !forced(id))", replace: "    ...denies.filter(id => isReserved(id) && !forced(id))" }] },
  { id: "P10K-M4", what: "a deny forced by a dependency is refused", edits: [{ file: C, find: "!prev.denies.has(id) && !forced(id))", replace: "!prev.denies.has(id))" }] },
  { id: "P10K-M5", what: "reading a stored revision refuses a reserved entry (teachers blocked)", edits: [{ file: R, find: "  const forbidden = lists.grants.filter(isOwnerOnly);", replace: "  if ([...lists.grants, ...lists.denies].some(c => require(\"./capabilities\").isReserved(c))) return { ok: false, code: \"CAPABILITY_RESERVED\" };\n  const forbidden = lists.grants.filter(isOwnerOnly);" }] },
  { id: "P10K-M6", what: "one capability loses its reserved mark (reports.export.use)", edits: [{ file: C, find: "  \"reports.export.use\": ", replace: "  \"reports.export.use.x\": " }] },
  { id: "P10K-M7", what: "the console keeps the reserved box enabled", edits: [{ file: D, find: "disabled={c.reserved}", replace: "disabled={false}" }] },
  { id: "P10K-M8", what: "a reserved grant is accepted when it is new", edits: [{ file: C, find: "    ...grants.filter(id => isReserved(id) && !prev.grants.has(id)),", replace: "" }] }
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
console.log("\nP10-K: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
