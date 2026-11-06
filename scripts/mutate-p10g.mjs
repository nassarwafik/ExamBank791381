#!/usr/bin/env node
// Tadris+ P10-G — mutation proof for «a flood of random links never blocks a teacher's real link» (approved design
// docs/enterprise-invitation-throttle-p10g.md, owner decision §19.44): no platform-wide invitation bucket; malformed links do no
// storage work; misses count on the sender only; a valid link has its own limit, cleared on success.
// Same engine and rules as scripts/mutate-p10a.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/invitation-throttle-p10g.test.js", "api/tests/teacher-accounts-p2a2.test.js"];
const F = "api/src/functions/teacher-invitation.js";

export const MUTANTS = [
  { id: "P10G-M1", what: "the valid link's limit is one platform-wide bucket again (the O7 defect)", edits: [{ file: F, find: "const LINK_ID = token => \"teacher-invitation:\" + sha256Hex(token);", replace: "const LINK_ID = () => \"teacher-invitation\";" }] },
  { id: "P10G-M2", what: "a valid link counts on the misses' bucket", edits: [{ file: F, find: "    const gate = await reserve(throttleId, LINK_POLICY);", replace: "    const gate = await reserve(MISS_ID);" }] },
  { id: "P10G-M3", what: "unknown links are not counted at all", edits: [{ file: F, find: "      const miss = await reserve(MISS_ID);", replace: "      const miss = { allowed: true };" }] },
  { id: "P10G-M4", what: "malformed links reach storage (the format check is gone)", edits: [{ file: F, find: "  if (!LINK_FORMAT.test(token)) return unusable();", replace: "  if (false) return unusable();" }] },
  { id: "P10G-M5", what: "a successful accept does not clear its link's limit", edits: [{ file: F, find: "    await (deps.clearLoginThrottle || clearLoginThrottle)(container, throttleId, clientId, deps);", replace: "" }] },
  { id: "P10G-M6", what: "a failed reservation is a free pass", edits: [{ file: F, find: "      catch { return { allowed: false, retryAfterSeconds: 5 }; }", replace: "      catch { return { allowed: true }; }" }] }
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
console.log("\nP10-G: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
