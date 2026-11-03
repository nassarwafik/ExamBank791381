#!/usr/bin/env node
// Tadris+ P4-D — mutation proof for the owner -> own-teacher-workspace handoff (owner decision D19): the one-time ticket
// (consumed, expiry, hashed storage), its re-checks at redeem (issuing owner session, revoke-all, link, teacher account, trial),
// step-up and usability at issue, the teacher-side audit, the handoff page (ticket removed from the address bar, no owner token
// kept, teacher answers only) and the console card (new tab with noopener, one-time link, unlink confirmation). Same engine and
// rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/owner-handoff-p4d.test.js", "src/handoff/HandoffApp.p4d.test.tsx", "src/owner/OwnerTeacherWorkspace.p4d.test.tsx"];
const H = "api/src/functions/owner-handoff.js";
const PAGE = "src/handoff/HandoffApp.tsx";
const UI = "src/owner/OwnerTeacherWorkspace.tsx";
const ROUTE = "src/handoff/handoffRoute.ts";

export const MUTANTS = [
  { id: "P4D-M1", what: "the ticket is not consumed (reusable)", edits: [{ file: H, find: "return { ...current, usedAtMs: nowMs };", replace: "return current;" }] },
  { id: "P4D-M2", what: "a used ticket is accepted again", edits: [{ file: H, find: "      if (current.usedAtMs) { state = \"HANDOFF_USED\"; return current; }\n", replace: "" }] },
  { id: "P4D-M3", what: "the 60-second expiry is not enforced", edits: [{ file: H, find: "state = Number(current.expiresAtMs) > nowMs ? \"ok\" : \"HANDOFF_EXPIRED\";", replace: "state = \"ok\";" }] },
  { id: "P4D-M4", what: "the issuing owner session is not re-checked", edits: [{ file: H, find: "  if (!session || session.sid !== ticket.ownerSid || session.accountId !== ticket.ownerId || !(Number(session.expiresAtMs) > nowMs)) return REDEEM_REFUSED(\"OWNER_SESSION_ENDED\");", replace: "  if (false) return REDEEM_REFUSED(\"OWNER_SESSION_ENDED\");" }] },
  { id: "P4D-M5", what: "a revoke-all does not void issued tickets", edits: [{ file: H, find: "if (!owner || owner.status !== \"active\" || owner.authVersion !== session.authVersion || owner.authVersion !== ticket.ownerAuthVersion)", replace: "if (!owner || owner.status !== \"active\")" }] },
  { id: "P4D-M6", what: "unlinking does not void issued tickets", edits: [{ file: H, find: "  if (owner.linkedTeacherAccountId !== ticket.accountId) return REDEEM_REFUSED(\"HANDOFF_LINK_REMOVED\");", replace: "  if (false) return REDEEM_REFUSED(\"HANDOFF_LINK_REMOVED\");" }] },
  { id: "P4D-M7", what: "the teacher account is not re-checked at redeem", edits: [{ file: H, find: "  if (!u.usable) return REDEEM_REFUSED(u.reason);\n", replace: "" }] },
  { id: "P4D-M8", what: "an ended trial still gets a session", edits: [{ file: H, find: "  if (trialEnded(account, nowMs)) return { usable: false, reason: \"TEACHER_TRIAL_ENDED\" };\n", replace: "" }] },
  { id: "P4D-M9", what: "link / issue skip the step-up", edits: [{ file: H, find: "    const denial = stepUpDenial(session, nowMs);\n    if (denial) return denial;\n", replace: "" }] },
  { id: "P4D-M10", what: "a ticket is issued for an account that cannot be used", edits: [{ file: H, find: "if (!linked.usable) return reply(409,", replace: "if (false) return reply(409," }] },
  { id: "P4D-M11", what: "the ticket lives ten minutes", edits: [{ file: H, find: "const HANDOFF_TTL_MS = 60 * 1000;", replace: "const HANDOFF_TTL_MS = 600 * 1000;" }] },
  { id: "P4D-M12", what: "the raw ticket names its stored record", edits: [{ file: H, find: "const handoffName = token => HANDOFF_PREFIX + sha256Hex(token) + \".json\";", replace: "const handoffName = token => HANDOFF_PREFIX + token + \".json\";" }] },
  { id: "P4D-M13", what: "the teacher-side event is not written", edits: [{ file: H, find: "  await (deps.recordAuditEvent || recordAuditEvent)(container, { actor: account.accountId, action: \"teacher.session.from-owner\"", replace: "  if (false) await (deps.recordAuditEvent || recordAuditEvent)(container, { actor: account.accountId, action: \"teacher.session.from-owner\"" }] },
  { id: "P4D-M14", what: "the handoff page leaves the ticket in the address bar", edits: [{ file: PAGE, find: "    try { window.history.replaceState(null, \"\", window.location.pathname + window.location.search + HANDOFF_BARE_HASH); } catch { /* best effort */ }\n", replace: "" }] },
  { id: "P4D-M15", what: "the handoff page keeps an owner token", edits: [{ file: PAGE, find: "    try { sessionStorage.removeItem(OWNER_TOKEN_KEY); } catch { /* nothing stored */ }\n", replace: "" }] },
  { id: "P4D-M16", what: "the handoff page stores a non-teacher answer", edits: [{ file: PAGE, find: "json.ok === true && json.role === \"teacher\" && typeof json.token", replace: "json.ok === true && typeof json.token" }] },
  { id: "P4D-M17", what: "the new tab shares the owner tab (no noopener)", edits: [{ file: UI, find: "rel=\"noopener noreferrer\"", replace: "rel=\"noreferrer\"" }] },
  { id: "P4D-M18", what: "the one-time link stays offered after use", edits: [{ file: UI, find: "target=\"_blank\" rel=\"noopener noreferrer\" onClick={() => setTicket(null)}", replace: "target=\"_blank\" rel=\"noopener noreferrer\"" }] },
  { id: "P4D-M19", what: "unlinking does not ask first", edits: [{ file: UI, find: "onClick={() => setConfirmUnlink(true)}", replace: "onClick={() => void link(null)}" }] },
  { id: "P4D-M20", what: "the handoff route accepts a short ticket", edits: [{ file: ROUTE, find: "const HANDOFF_HASH = /^#\\/handoff(?:\\/([A-Za-z0-9_-]{43}))?\\/?$/;", replace: "const HANDOFF_HASH = /^#\\/handoff(?:\\/([A-Za-z0-9_-]{5,}))?\\/?$/;" }] }
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
console.log("\nP4-D: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
