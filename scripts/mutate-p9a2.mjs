#!/usr/bin/env node
// Tadris+ P9-A2 — mutation proof for «البيانات القديمة» in the Owner Console: the address and the menu, the target list (no
// suspended teacher), preview before apply, the reason, the preview's digest and ONE request key (retried / completed unchanged),
// a stale preview dropped, «تراجع» only for an applied decision and with a reason, the step-up retry. Same engine and rules as
// scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/owner/OwnerLegacyClasses.p9a2.test.tsx", "src/owner/OwnerConsole.p4a.test.tsx"];

export const MUTANTS = [
  { id: "P9A2-M1", what: "#/owner/legacy is not an owner address", edits: [{ file: "src/owner/ownerRoute.ts", find: "(setup|access|schools|courses|exams|legacy)", replace: "(setup|access|schools|courses|exams)" }] },
  { id: "P9A2-M2", what: "the address does not open the section", edits: [{ file: "src/owner/OwnerApp.tsx", find: " || route.view === \"legacy\" ? route.view : \"home\";", replace: " ? route.view : \"home\";" }] },
  { id: "P9A2-M3", what: "the menu does not offer the section", edits: [{ file: "src/owner/OwnerApp.tsx", find: "  { id: \"exams\", label: \"بنك الامتحانات\" },\n  { id: \"legacy\", label: \"البيانات القديمة\" }   // Tadris+ P9-A2\n", replace: "  { id: \"exams\", label: \"بنك الامتحانات\" }\n" }] },
  { id: "P9A2-M4", what: "a suspended teacher is offered as the target", edits: [{ file: "src/owner/OwnerLegacyClasses.tsx", find: "const eligible = teachers.filter(t => t.status !== \"suspended\");", replace: "const eligible = teachers;" }] },
  { id: "P9A2-M5", what: "«معاينة» without a teacher", edits: [{ file: "src/owner/OwnerLegacyClasses.tsx", find: "disabled={busy || (decision === \"assign\" && !to)} onClick={preview}", replace: "disabled={busy} onClick={preview}" }] },
  { id: "P9A2-M6", what: "«تنفيذ القرار» without a reason", edits: [{ file: "src/owner/OwnerLegacyClasses.tsx", find: "disabled={busy || reason.trim().length < MIN_REASON} onClick={apply}", replace: "disabled={busy} onClick={apply}" }] },
  { id: "P9A2-M7", what: "the apply does not send the preview's digest", edits: [{ file: "src/owner/OwnerLegacyClasses.tsx", find: "previewDigest: plan.digest, requestKey", replace: "previewDigest: \"\", requestKey" }] },
  { id: "P9A2-M8", what: "every click sends a new request key", edits: [{ file: "src/owner/OwnerLegacyClasses.tsx", find: "previewDigest: plan.digest, requestKey }", replace: "previewDigest: plan.digest, requestKey: newRequestKey() }" }] },
  { id: "P9A2-M9", what: "a stale preview is kept", edits: [{ file: "src/owner/OwnerLegacyClasses.tsx", find: "}, r => { if (r.code === \"PREVIEW_STALE\") setPlan(null); });", replace: "});" }] },
  { id: "P9A2-M10", what: "a half-done run is reported as done", edits: [{ file: "src/owner/OwnerLegacyClasses.tsx", find: "      if (d.ledger.status === \"pending\") { setIncomplete(true); return; }", replace: "      if (false) { setIncomplete(true); return; }" }] },
  { id: "P9A2-M11", what: "«يبقى مشتركًا» / «أرشفة» send a teacher", edits: [{ file: "src/owner/ownerApi.ts", find: "body: { classId, decision, ...(decision === \"assign\" ? { toAccountId } : {}) }", replace: "body: { classId, decision, toAccountId }" }] },
  { id: "P9A2-M12", what: "«أرشفة» is offered for an archived class", edits: [{ file: "src/owner/OwnerLegacyClasses.tsx", find: " disabled={d === \"archive\" && c.status === \"archived\"}", replace: "" }] },
  { id: "P9A2-M13", what: "«تراجع» is offered for a decision not applied", edits: [{ file: "src/owner/OwnerLegacyClasses.tsx", find: "{l.status === \"applied\" && undoing !== l.migrationId &&", replace: "{undoing !== l.migrationId &&" }] },
  { id: "P9A2-M14", what: "«تأكيد التراجع» without a reason", edits: [{ file: "src/owner/OwnerLegacyClasses.tsx", find: "disabled={busy || reason.trim().length < MIN_REASON} onClick={undo}", replace: "disabled={busy} onClick={undo}" }] },
  { id: "P9A2-M15", what: "the step-up retry is not offered", edits: [{ file: "src/owner/OwnerLegacyClasses.tsx", find: "    if (r.code === \"STEP_UP_REQUIRED\") { setStepUp({ retry: () => send(call, onOk, onRefused) }); return; }\n", replace: "" }] }
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
console.log("\nP9-A2: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
