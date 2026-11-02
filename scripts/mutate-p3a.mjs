#!/usr/bin/env node
// Tadris+ P3-A — mutation proof for the capability registry, presets, revisions, resolver, rollout mode and authorize().
// Same engine and rules as scripts/mutate-p1a.mjs (sha256-verified restore after every mutant, also on interruption).
// Not run as a separate mutant: removing ONLY the resolver's platform.* strip in evaluateRevision is equivalent by construction
// (a platform.* grant is refused just before it, and no preset contains one); P3A-M3 removes both guards and must be killed.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/access-registry-p3a.test.js", "api/tests/owner-access-p3a.test.js"];
const CAPS = "api/src/lib/access/capabilities.js";
const PRESETS = "api/src/lib/access/presets.js";
const REV = "api/src/lib/access/revisions.js";
const RES = "api/src/lib/access/resolver.js";
const MODE = "api/src/lib/access/access-mode.js";
const AUTH = "api/src/lib/access/authorize.js";
const API = "api/src/functions/owner-access.js";
const SESSION = "api/src/lib/teacher-session.js";
const PSESSION = "api/src/functions/platform-session.js";

export const MUTANTS = [
  { id: "P3A-M1", what: "default deny broken: a console account without access gets today's full access", edits: [{ file: RES, find: "    return { source: \"unassigned\", revisionId: null, preset: null, capabilities: [] };", replace: "    return legacyFull(\"unassigned\");" }] },
  { id: "P3A-M2", what: "a platform.* grant is accepted (the strip still removes it from the effective set)", edits: [{ file: REV, find: "  if (forbidden.length) return", replace: "  if (false) return" }] },
  { id: "P3A-M3", what: "both platform.* guards removed: a teacher can hold an owner capability", edits: [{ file: REV, find: "  if (forbidden.length) return", replace: "  if (false) return" }, { file: REV, find: "  for (const c of [...set]) if (isOwnerOnly(c)) set.delete(c);", replace: "" }] },
  { id: "P3A-M4", what: "a broken dependency is accepted", edits: [{ file: REV, find: "  if (unmet.length) return", replace: "  if (false) return" }] },
  { id: "P3A-M5", what: "an unknown capability is accepted", edits: [{ file: REV, find: "    if (unknown.length) return", replace: "    if (false) return" }] },
  { id: "P3A-M6", what: "a capability both granted and denied is accepted", edits: [{ file: REV, find: "  if (both.length) return", replace: "  if (false) return" }] },
  { id: "P3A-M7", what: "another account's revision is accepted on read", edits: [{ file: REV, find: "  if (doc.accountId !== accountId) throw new AccessError(\"REVISION_INVALID\", { reason: \"account\" });\n", replace: "" }] },
  { id: "P3A-M8", what: "a stored revision is trusted without re-validation (tampering accepted)", edits: [{ file: REV, find: "  if (!verdict.ok) throw new AccessError(\"REVISION_INVALID\", { reason: verdict.code });", replace: "" }] },
  { id: "P3A-M9", what: "authorize(): platform.* allowed for a teacher (legacy mode)", edits: [{ file: AUTH, find: "  if (isOwnerOnly(capabilityId)) return", replace: "  if (false) return" }] },
  { id: "P3A-M10", what: "observe mode blocks instead of only logging", edits: [{ file: AUTH, find: "    return { allowed: true, mode, decision: \"would-deny\", access };", replace: "" }] },
  { id: "P3A-M11", what: "enforce: a failed resolution is allowed (fail open)", edits: [{ file: AUTH, find: "    return { allowed: false, mode, decision: \"unavailable\", response: unavailable() };", replace: "    return { allowed: true, mode, decision: \"unavailable\" };" }] },
  { id: "P3A-M12", what: "an unreadable mode is treated as legacy (fail open)", edits: [{ file: AUTH, find: "    return { allowed: false, mode: \"unknown\", decision: \"unavailable\", response: unavailable() };", replace: "    return { allowed: true, mode: \"legacy\", decision: \"not-evaluated\" };" }] },
  { id: "P3A-M13", what: "a malformed mode document reads as legacy", edits: [{ file: MODE, find: "throw new AccessError(\"ACCESS_MODE_INVALID\");", replace: "return { mode: \"legacy\", updatedAt: \"\", updatedBy: \"\" };" }] },
  { id: "P3A-M14", what: "the owner can switch to enforce before P3-B", edits: [{ file: MODE, find: "const SETTABLE_MODES = Object.freeze([\"legacy\", \"observe\"]);", replace: "const SETTABLE_MODES = Object.freeze([\"legacy\", \"observe\", \"enforce\"]);" }] },
  { id: "P3A-M15", what: "the account pointer is overwritten without compare-and-set (lost update)", edits: [{ file: API, find: "        if ((a.accessRevisionId || null) !== currentRevision) { conflict = true; return a; }\n", replace: "" }] },
  { id: "P3A-M16", what: "assigning access needs no recent step-up", edits: [{ file: API, find: "    if (denial) return denial;", replace: "    if (false) return denial;" }] },
  { id: "P3A-M17", what: "the session does not carry the account's current revision (an access change is not seen)", edits: [{ file: SESSION, find: "accessRevisionId: typeof account.accessRevisionId === \"string\" && account.accessRevisionId ? account.accessRevisionId : null", replace: "accessRevisionId: null" }] },
  { id: "P3A-M18", what: "the imported workspace (t_legacy) loses today's access (D7 broken)", edits: [{ file: RES, find: "    if (user.sub === LEGACY_TEACHER_ACCOUNT_ID) return legacyFull(\"migrated-default\");\n", replace: "" }] },
  { id: "P3A-M19", what: "D18 broken: the teaching presets may create classes", edits: [{ file: PRESETS, find: "const NOT_IN_TEACHING = new Set([\"classes.class.create\", ", replace: "const NOT_IN_TEACHING = new Set([" }] },
  { id: "P3A-M20", what: "an access problem invalidates the teacher's session probe", edits: [{ file: PSESSION, find: "      access = { status: \"unavailable\", capabilities: [] };", replace: "      throw e;" }] },
  { id: "P3A-M21", what: "a dependency is dropped from the registry", edits: [{ file: CAPS, find: "  [\"examLibrary.item.copy\", \"نسخ عنصر إلى امتحاناته\", [\"examBuilder.exam.create\"]],", replace: "  [\"examLibrary.item.copy\", \"نسخ عنصر إلى امتحاناته\"]," }] }
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
console.log("\nP3-A: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
