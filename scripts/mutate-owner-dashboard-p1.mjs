#!/usr/bin/env node
// Owner Console «لوحة البيانات» (phase 1) — mutation proof for GET /api/owner-teacher-dashboard: owner-only, scoped to ONE teacher,
// recorded strictly. Same engine and rules as scripts/mutate-p3c.mjs (byte-for-byte restore, sha256 verified; a timeout is not a kill).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/owner-teacher-dashboard.test.js"];
const ROUTE = "api/src/functions/owner-teacher-dashboard.js";

export const MUTANTS = [
  { id: "OTD-M1", what: "the figures are computed unscoped (the whole platform)", edits: [{ file: ROUTE, find: "const result = await compute(container, { classId, studentId, fromMs, toMs, tenant, assignments: true, shows: () => true });", replace: "const result = await compute(container, { classId, studentId, fromMs, toMs, tenant: null, assignments: true, shows: () => true });" }] },
  { id: "OTD-M2", what: "the scope is another identity than the teacher's own session", edits: [{ file: ROUTE, find: "  return tenantOf({ am: \"managed\", sub: accountId });", replace: "  return tenantOf({ am: \"managed\", sub: \"t_00112233445566bb\" });" }] },
  { id: "OTD-M3", what: "no owner session required", edits: [{ file: ROUTE, find: "  if (!auth.ok) return auth.response;\n", replace: "  if (!auth.ok) { auth.owner = { accountId: \"x\" }; auth.container = (deps.getContainer)(); }\n" }] },
  { id: "OTD-M4", what: "the view is not recorded", edits: [{ file: ROUTE, find: "    await audit(container, {", replace: "    void (() => audit)(container, {" }] },
  { id: "OTD-M5", what: "a view that cannot be recorded is served anyway (fail open)", edits: [{ file: ROUTE, find: "    await audit(container, {", replace: "    await Promise.resolve().then(() => audit(container, {" }, { file: ROUTE, find: "    });\n    return reply(200, {", replace: "    })).catch(() => {});\n    return reply(200, {" }] },
  { id: "OTD-M6", what: "an unknown account is answered with figures", edits: [{ file: ROUTE, find: "    if (!account) return reply(404,", replace: "    if (false) return reply(404," }] },
  { id: "OTD-M7", what: "the record carries the student id", edits: [{ file: ROUTE, find: "details: { scope: studentId ? \"student\" : classId ? \"class\" : \"global\",", replace: "details: { studentId, scope: studentId ? \"student\" : classId ? \"class\" : \"global\"," }] },
  { id: "OTD-M8", what: "a storage failure serves an empty answer instead of 503", edits: [{ file: ROUTE, find: "    obs?.logError?.(\"owner.teacher.dashboard.error\", e);\n    return unavailable();", replace: "    obs?.logError?.(\"owner.teacher.dashboard.error\", e);\n    return reply(200, { ok: true });" }] }
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
console.log("\nOwner dashboard (phase 1): " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
