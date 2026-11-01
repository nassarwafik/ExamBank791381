#!/usr/bin/env node
// Tadris+ P1-A2 — mutation campaign for the owner screens' client-side invariants (AGENTS.md §9). Same engine and rules as
// scripts/mutate-p1a.mjs: one planted defect per mutant, the focused Vitest files run, KILLED only when a test fails; a timeout is
// TIMEOUT; every file is restored byte-for-byte (sha256 verified), also on error or interrupt. The server stays the authority —
// these mutants guard what the browser must never do: leak or mix tokens, offer setup when closed, skip the saved-codes gate,
// ship the owner screens in the initial bundle, or draw an unreadable QR code.
//
//   node scripts/mutate-p1a2.mjs [ids]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/owner/OwnerApp.p1a2.test.tsx", "src/owner/qrcode.p1a2.test.ts"];
const API = "src/owner/ownerApi.ts", APP = "src/owner/OwnerApp.tsx", SETUP = "src/owner/OwnerSetup.tsx", QR = "src/owner/qrcode.ts", MAIN = "src/main.tsx", ROUTE = "src/owner/ownerRoute.ts";

export const MUTANTS = [
  { id: "P1A2-M1", what: "the owner token shares the teacher's storage key", edits: [{ file: API, find: 'export const OWNER_TOKEN_KEY = "tadrisOwnerToken";', replace: 'export const OWNER_TOKEN_KEY = "examBankBuilderToken";' }] },
  { id: "P1A2-M2", what: "the owner token is also sent as a Bearer Authorization header", edits: [{ file: API, find: 'if (init.token) headers["x-owner-token"] = init.token;', replace: 'if (init.token) { headers["x-owner-token"] = init.token; headers["Authorization"] = "Bearer " + init.token; }' }] },
  { id: "P1A2-M3", what: "a 401 on the stored session keeps the token", edits: [{ file: APP, find: "if (s.status === 401) clearOwnerToken();", replace: "if (s.status === 401) { /* kept */ }" }] },
  { id: "P1A2-M4", what: "a server outage on load shows the sign-in instead of an error", edits: [{ file: APP, find: "else { setBoot({ kind: \"error\", message: s.error }); return; }", replace: "" }] },
  { id: "P1A2-M5", what: "the setup screen is offered while the bootstrap is closed", edits: [{ file: APP, find: 'route === "setup" && boot.bootstrap === "open"', replace: 'route === "setup"' }] },
  { id: "P1A2-M6", what: "continuing past the recovery codes no longer requires «حفظت الرموز»", edits: [{ file: SETUP, find: "disabled={!saved} onClick={onDone}", replace: "disabled={false} onClick={onDone}" }] },
  { id: "P1A2-M7", what: "the password confirmation is not compared", edits: [{ file: SETUP, find: 'if (password !== confirm) { setError("تأكيد كلمة المرور لا يطابقها."); return; }', replace: "" }] },
  { id: "P1A2-M8", what: "after a step-up the sensitive action is not retried", edits: [{ file: APP, find: "    onView(r.data);\n    await run(stepUpFor);", replace: "    onView(r.data);" }] },
  { id: "P1A2-M9", what: "sign-out does not call the server", edits: [{ file: APP, find: "    await ownerApi.logout(token);", replace: "" }] },
  { id: "P1A2-M10", what: "the owner entry imports the owner app statically (it would ship to every teacher and student)", edits: [{ file: "src/owner/OwnerEntry.tsx", find: 'const OwnerApp = lazy(lazyWithRetry(() => import("./OwnerApp"), "owner-app"));', replace: 'import OwnerAppStatic from "./OwnerApp";\nconst OwnerApp = OwnerAppStatic;' }] },
  { id: "P1A2-M14", what: "main.tsx mounts the teacher / student app on the owner route too", edits: [{ file: MAIN, find: "{ownerSurface ? <OwnerEntry /> : <App />}", replace: "{ownerSurface ? <><OwnerEntry /><App /></> : <App />}" }] },
  { id: "P1A2-M11", what: "the QR format information is not masked (0x5412 dropped)", edits: [{ file: QR, find: "const bits = ((data << 10) | rem) ^ 0x5412;", replace: "const bits = ((data << 10) | rem);" }] },
  { id: "P1A2-M12", what: "the Reed–Solomon error correction is wrong (generator root step)", edits: [{ file: QR, find: "root = gfMultiply(root, 0x02);", replace: "root = gfMultiply(root, 0x03);" }] },
  { id: "P1A2-M13", what: "any hash under #/owner… is the owner surface", edits: [{ file: ROUTE, find: "const OWNER_HASH = /^#\\/owner(?:\\/(setup))?\\/?$/;", replace: "const OWNER_HASH = /^#\\/owner(?:\\/(setup))?/;" }] }
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
console.log("\nP1-A2: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
