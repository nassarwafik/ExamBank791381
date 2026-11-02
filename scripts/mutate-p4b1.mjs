#!/usr/bin/env node
// Tadris+ P4-B1 — mutation proof for one teacher's page: the access history (chain, re-validation, cycle guard), the effective
// access preview, the restore (rollback) rules, the suspension reason, the teacher address, the capability editing rules and the
// page's change flow. Same engine and rules as scripts/mutate-p1a.mjs (byte-for-byte, hash-verified restore after every mutant).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/owner-teacher-details-p4b1.test.js", "api/tests/owner-access-p3a.test.js", "src/owner/OwnerTeacherDetails.p4b1.test.tsx", "src/owner/OwnerConsole.p4a.test.tsx"];
const HIST = "api/src/lib/access/history.js";
const ACCESS = "api/src/functions/owner-access.js";
const TEACHERS = "api/src/functions/owner-teachers.js";
const ROUTE = "src/owner/ownerRoute.ts";
const SHARED = "src/owner/teacherShared.ts";
const DETAILS = "src/owner/OwnerTeacherDetails.tsx";

export const MUTANTS = [
  { id: "P4B1-M1", what: "history trusts a revision of another account", edits: [{ file: HIST, find: "if (doc.schemaVersion !== 1 || doc.revisionId !== id || doc.accountId !== accountId)", replace: "if (doc.schemaVersion !== 1 || doc.revisionId !== id)" }] },
  { id: "P4B1-M2", what: "history walks on past an invalid revision", edits: [{ file: HIST, find: "    if (!verdict.ok) return { entries, truncated: false };\n", replace: "" }] },
  { id: "P4B1-M3", what: "history has no cycle guard", edits: [{ file: HIST, find: " || seen.has(id)) {", replace: ") {" }] },
  { id: "P4B1-M4", what: "rollback accepts a revision that is not on the account's chain (an orphan)", edits: [{ file: ACCESS, find: "      if (!onChain) return reply(", replace: "      if (false) return reply(" }] },
  { id: "P4B1-M5", what: "the restored revision's parent is the target, not the current one", edits: [{ file: ACCESS, find: "built = buildRevision({ accountId, parentRevisionId: currentRevision, presetId: target.preset.id", replace: "built = buildRevision({ accountId, parentRevisionId: targetId, presetId: target.preset.id" }] },
  { id: "P4B1-M6", what: "rollback ignores a stale screen", edits: [{ file: ACCESS, find: "      if (hasBase && (body.baseRevisionId || null) !== currentRevision) return CONFLICT(STALE_SCREEN);\n      if (targetId === currentRevision)", replace: "      if (targetId === currentRevision)" }] },
  { id: "P4B1-M7", what: "rollback to the current revision is not refused", edits: [{ file: ACCESS, find: "      if (targetId === currentRevision) return reply(", replace: "      if (false) return reply(" }] },
  { id: "P4B1-M8", what: "the restore does not copy the target's grants", edits: [{ file: ACCESS, find: "grants: [...(target.grants || [])]", replace: "grants: []" }] },
  { id: "P4B1-M9", what: "an unreadable mode is reported as not enforced", edits: [{ file: ACCESS, find: "enforced: mode === \"enforce\" || mode === \"invalid\"", replace: "enforced: mode === \"enforce\"" }] },
  { id: "P4B1-M10", what: "effective resolves the account as a pre-console identity (full access)", edits: [{ file: ACCESS, find: "resolveTeacherAccess({ am: \"managed\", sub: accountId", replace: "resolveTeacherAccess({ am: \"multi-user\", sub: accountId" }] },
  { id: "P4B1-M11", what: "reactivation keeps the suspension reason", edits: [{ file: TEACHERS, find: "suspendedAt: null, suspendedReason: null, updatedAt: iso", replace: "suspendedAt: null, updatedAt: iso" }] },
  { id: "P4B1-M12", what: "the suspension reason is not bounded", edits: [{ file: TEACHERS, find: "const MAX_SUSPEND_REASON = 200;", replace: "const MAX_SUSPEND_REASON = 2000;" }] },
  { id: "P4B1-M13", what: "a teacher page address takes any id", edits: [{ file: ROUTE, find: "(t_[a-f0-9]{16}|t_legacy)", replace: "([^/]+)" }] },
  { id: "P4B1-M14", what: "turning a capability on does not turn on what it needs", edits: [{ file: SHARED, find: "    for (const r of need.get(c) || []) if (!out.has(r)) queue.push(r);\n", replace: "" }] },
  { id: "P4B1-M15", what: "turning a capability off leaves what needs it on", edits: [{ file: SHARED, find: "    for (const [other, reqs] of need) if (out.has(other) && reqs.includes(c)) queue.push(other);\n", replace: "" }] },
  { id: "P4B1-M16", what: "grants and denies are swapped", edits: [{ file: SHARED, find: "return { grants: [...chosen].filter(c => !base.has(c)).sort(), denies: [...base].filter(c => !chosen.has(c)).sort() };", replace: "return { denies: [...chosen].filter(c => !base.has(c)).sort(), grants: [...base].filter(c => !chosen.has(c)).sort() };" }] },
  { id: "P4B1-M17", what: "owner-only capabilities are offered to a teacher", edits: [{ file: DETAILS, find: "catalog.capabilities.filter(x => !x.ownerOnly)", replace: "catalog.capabilities.filter(() => true)" }] },
  { id: "P4B1-M18", what: "the save is not tied to the revision the page was opened on", edits: [{ file: DETAILS, find: "ownerAccessApi.assign(token, { accountId, ...draft, baseRevisionId: history.currentRevisionId })", replace: "ownerAccessApi.assign(token, { accountId, ...draft, baseRevisionId: null })" }] },
  { id: "P4B1-M19", what: "the difference is computed against nothing (what the teacher holds now ignored)", edits: [{ file: DETAILS, find: "const nowCapabilities = (effective: EffectiveAccess) => (effective.access.status === \"ok\" ? effective.access.capabilities : []);", replace: "const nowCapabilities = (effective: EffectiveAccess): string[] => (effective ? [] : []);" }] },
  { id: "P4B1-M20", what: "a step-up does not retry the change", edits: [{ file: DETAILS, find: "setStepUp({ retry: () => send(call, onOk, refreshOnConflict) });", replace: "setStepUp({ retry: async () => {} });" }] },
  { id: "P4B1-M21", what: "the suspension reason is not sent", edits: [{ file: DETAILS, find: "onAct(confirming, confirming === \"suspend\" ? reason.trim() : undefined)", replace: "onAct(confirming, undefined)" }] },
  { id: "P4B1-M22", what: "«استعادة» restores without a confirmation", edits: [{ file: DETAILS, find: "onClick={() => { setRestoring(e); setReason(\"\"); }}", replace: "onClick={() => onRestore(e, \"\")}" }] },
  { id: "P4B1-M23", what: "«حفظ الصلاحيات» is offered with nothing changed", edits: [{ file: DETAILS, find: "disabled={busy || !picked || unchanged}", replace: "disabled={busy || !picked}" }] },
  { id: "P4B1-M24", what: "a stale page (409) is not reloaded", edits: [{ file: DETAILS, find: "    if (refreshOnConflict && r.status === 409) reload();\n", replace: "" }] }
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
console.log("\nP4-B1: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
