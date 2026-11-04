#!/usr/bin/env node
// Tadris+ P9-B2 — mutation proof for the SmartSim browser fixture's start (CI run 41858886186): a failed start stops the whole
// browser process group and removes its profile, readiness has its second signal, the failure reports what was observed, and the
// 30 s budget is never widened. Same engine and rules as scripts/mutate-p1a.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/smartsim-browser-startup-p9b2.test.js"];

export const MUTANTS = [
  { id: "P9B2-M1", what: "a failed start is not cleaned up at all (the baseline leak)", edits: [{ file: "api/tests/fixtures/smartsim-browser.js", find: "  try { wsUrl = await waitForDevTools(proc, dir, startTimeoutMs); } catch (e) { await stopAndClean(); throw e; }", replace: "  try { wsUrl = await waitForDevTools(proc, dir, startTimeoutMs); } catch (e) { throw e; }" }] },
  { id: "P9B2-M2", what: "only the browser process is killed, not its process group (helpers survive)", edits: [{ file: "api/tests/fixtures/smartsim-browser.js", find: "const groupKill = proc => { try { process.kill(-proc.pid, \"SIGKILL\"); } catch {", replace: "const groupKill = proc => { try { proc.kill(\"SIGKILL\"); } catch {" }] },
  { id: "P9B2-M3", what: "the profile of a failed start is kept", edits: [{ file: "api/tests/fixtures/smartsim-browser.js", find: "    removeProfile(dir);\n  };", replace: "  };" }] },
  { id: "P9B2-M4", what: "readiness from the DevToolsActivePort file is ignored", edits: [{ file: "api/tests/fixtures/smartsim-browser.js", find: "    const poll = setInterval(() => { const u = readDevToolsActivePort(dir); if (u) finish(res, u); }, 100);", replace: "    const poll = setInterval(() => {}, 100);" }] },
  { id: "P9B2-M5", what: "the failure no longer says what was observed", edits: [{ file: "api/tests/fixtures/smartsim-browser.js", find: "new Error(\"Chromium did not start: not ready within \" + startTimeoutMs + \" ms (\" + observed() + \")\")", replace: "new Error(\"Chromium did not start: \" + buf.slice(-800))" }] },
  { id: "P9B2-M6", what: "the start budget is widened to 60 s", edits: [{ file: "api/tests/fixtures/smartsim-browser.js", find: "export async function launchBrowser({ startTimeoutMs = 30000 } = {}) {", replace: "export async function launchBrowser({ startTimeoutMs = 60000 } = {}) {" }] }
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
console.log("\nP9-B2: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
