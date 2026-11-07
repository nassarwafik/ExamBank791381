#!/usr/bin/env node
// Tadris+ QR-4 — mutation proof for the owner's «الأجهزة المرتبطة» (design docs/enterprise-qr-login-qr4.md): only this owner's live
// sessions are listed and endable, ids are hashes, ending one needs a recent step-up and is recorded strictly first. Same engine
// and rules as scripts/mutate-p10f.mjs (sha256-verified byte-for-byte restore; KILLED only when a test fails, a timeout is TIMEOUT).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/owner-devices-qr4.test.js"];
const OS = "api/src/functions/owner-session.js";
const one = (file, find, replace) => ({ file, find, replace });

export const MUTANTS = [
  { id: "QR4-M1", what: "ending an owner device does not need a recent step-up", edits: [one(OS, '    if (action === "end-device") {\n      const denial = stepUpDenial(session, nowMs);\n      if (denial) return denial;\n', '    if (action === "end-device") {\n')] },
  { id: "QR4-M2", what: "another owner account's sessions are listed / endable", edits: [one(OS, ".filter(d => d && d.accountId === owner.accountId && ", ".filter(d => d && ")] },
  { id: "QR4-M3", what: "sessions of an older / other authVersion are listed", edits: [one(OS, " && d.authVersion === owner.authVersion && ", " && ")] },
  { id: "QR4-M4", what: "expired sessions are listed / endable", edits: [one(OS, " && Number(d.expiresAtMs) > nowMs)", ")")] },
  { id: "QR4-M5", what: "the ending is not recorded first", edits: [one(OS, 'return await recordOwnerChange(container, { actor, action: "owner.session.device-ended"', 'return await (async (_c, _e, apply) => apply())(container, { actor, action: "owner.session.device-ended"')] },
  { id: "QR4-M6", what: "the raw session id is exposed as the device id", edits: [one(OS, "id: ownerSessionHash(d.sid), via:", "id: d.sid, via:")] },
  { id: "QR4-M7", what: "the current session is not marked", edits: [one(OS, "current: d.sid === currentSid", "current: false")] }
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
console.log("\nQR-4: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
