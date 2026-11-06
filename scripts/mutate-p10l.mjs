#!/usr/bin/env node
// Tadris+ P10-L — mutation proof for «every owner change is recorded before it happens» (approved design
// docs/enterprise-strict-owner-audit-p10l.md, owner decision §19.49): record (strict) → change → «not applied» if it did not apply;
// a change made by a shared library is recorded at its first write; signing in and out stay best effort.
// Same engine and rules as scripts/mutate-p10a.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/strict-owner-audit-p10l.test.js", "api/tests/owner-access-p3a.test.js", "api/tests/owner-classes-p5b2.test.js", "api/tests/owner-students-p5b4.test.js"];
const L = "api/src/lib/audit-log.js";

export const MUTANTS = [
  { id: "P10L-M1", what: "a failed record is swallowed and the change goes ahead (the O14 defect)", edits: [{ file: L, find: "  try { await write(container, recorded); } catch { return auditUnavailable(); }", replace: "  try { await write(container, recorded); } catch { /* swallowed */ }" }] },
  { id: "P10L-M2", what: "the record is written AFTER the change", edits: [{ file: L, find: "  try { await write(container, recorded); } catch { return auditUnavailable(); }\n", replace: "" }, { file: L, find: "  try { response = await apply(opId); } catch (e) { await notApplied(\"error\"); throw e; }\n  if (response && typeof response.notApplied === \"string\") {   // a successful answer that changed nothing (an idempotent repeat)", replace: "  try { response = await apply(opId); } catch (e) { await notApplied(\"error\"); throw e; }\n  try { await write(container, recorded); } catch { return auditUnavailable(); }\n  if (response && typeof response.notApplied === \"string\") {   // a successful answer that changed nothing (an idempotent repeat)" }] },
  { id: "P10L-M3", what: "no «not applied» mark when the recorded change did not apply", edits: [{ file: L, find: "  if (!response || Number(response.status) >= 400) await notApplied(String(response && response.jsonBody && response.jsonBody.code || (response && response.status) || \"refused\"));\n  return response;\n}\n\n// Blob-client", replace: "  return response;\n}\n\n// Blob-client" }] },
  { id: "P10L-M4", what: "the write guard lets the first write through when its record failed", edits: [{ file: L, find: "      })().catch(() => { failed = true; throw new AuditUnavailableError(); });", replace: "      })().catch(() => { failed = true; });" }] },
  { id: "P10L-M5", what: "the owner-access mode switch records best effort again", edits: [{ file: "api/src/functions/owner-access.js", find: "  const write = deps.recordOwnerAuditEvent || recordOwnerAuditEventStrict;", replace: "  const write = deps.recordOwnerAuditEvent || (async (c, e) => { try { await recordOwnerAuditEventStrict(c, e); } catch { /* best effort */ } });" }] },
  { id: "P10L-M6", what: "signing out becomes strict (the owner could be locked out by a fault in the log)", edits: [{ file: "api/src/functions/owner-session.js", find: "      await auditBestEffort(container, { actor, action: \"owner.logout\",", replace: "      await write(container, { actor, action: \"owner.logout\"," }] },
  { id: "P10L-M7", what: "a class edit records at the route start (a no-op edit is recorded)", edits: [{ file: "api/src/functions/owner-classes.js", find: "      return await atWrite(event, async guarded => {", replace: "      return await recordOwnerChangeAtWrite(container, event({ json: { ...current, ...body } }), async () => {} , { write }) && await atWrite(event, async guarded => {" }] },
  { id: "P10L-M8", what: "the opId is no longer stored with the record", edits: [{ file: L, find: "      ...(typeof event?.opId === \"string\" && OP_ID_RE.test(event.opId) ? { opId: event.opId } : {})", replace: "      ...{}" }] }
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
console.log("\nP10-L: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
