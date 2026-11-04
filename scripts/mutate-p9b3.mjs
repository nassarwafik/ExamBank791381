#!/usr/bin/env node
// Tadris+ P9-B3 — mutation proof for the security review's two fixes (bank images are never rendered as the app; undo refuses a
// class whose assigned teacher added students since) and for the new pins (D17: nothing deletes an audit record; the runbook's
// console labels; the AGENTS.md identity rules). Same engine and rules as scripts/mutate-p1a.mjs (sha256-verified restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/question-image-headers-p9b3.test.js", "api/tests/legacy-ownership-p9a1.test.js", "api/tests/audit-retention-p9b3.test.js", "api/tests/operations-runbook-p9b3.test.js", "scripts/repo-governance-contract.test.mjs"];

export const MUTANTS = [
  { id: "P9B3-M1", what: "question-image serves the stored type as-is again (the finding)", edits: [{ file: "api/src/functions/question-image.js", find: "        \"content-type\": imageType || \"application/octet-stream\",", replace: "        \"content-type\": asset.contentType || \"application/octet-stream\"," }] },
  { id: "P9B3-M2", what: "the image safety headers (nosniff, sandbox CSP) are dropped", edits: [{ file: "api/src/functions/question-image.js", find: "        \"cache-control\": \"private, max-age=600\",\n        ...IMAGE_SAFETY_HEADERS", replace: "        \"cache-control\": \"private, max-age=600\"" }] },
  { id: "P9B3-M3", what: "a non-image is no longer a download (no attachment)", edits: [{ file: "api/src/functions/question-image.js", find: "        ...(imageType ? {} : { \"content-disposition\": \"attachment\" }),", replace: "" }] },
  { id: "P9B3-M4", what: "the allow-list accepts any media type", edits: [{ file: "api/src/lib/image-content-type.js", find: "Object.prototype.hasOwnProperty.call(IMAGE_TYPES, media) ? media : null;", replace: "true ? media : null;" }] },
  { id: "P9B3-M5", what: "the import stores the browser-declared type again", edits: [{ file: "api/src/functions/bank-import-action.js", find: "(allowedImageType(imageAsset.contentType) || \"application/octet-stream\")", replace: "imageAsset.contentType" }] },
  { id: "P9B3-M6", what: "undo ignores students added since the decision (the finding)", edits: [{ file: "api/src/lib/migrations/legacy-ownership.js", find: "  if (ledger.decision === \"assign\") {\n    const ls = deps.listJson || loadDocs;", replace: "  if (false) {\n    const ls = deps.listJson || loadDocs;" }] },
  { id: "P9B3-M7", what: "D17: a platform module deletes an audit record", edits: [{ file: "api/src/functions/audit-history.js", find: "const { AUDIT_PREFIX } = require(\"../lib/audit-log\");", replace: "const { AUDIT_PREFIX } = require(\"../lib/audit-log\");\nconst pruneOldest = (c, n) => require(\"../lib/platform-storage\").deleteBlob(c, AUDIT_PREFIX + n);" }] },
  { id: "P9B3-M8", what: "a console label the runbook quotes is renamed", edits: [{ file: "src/owner/OwnerAccessMode.tsx", find: ">تشغيل المراقبة<", replace: ">تشغيل الرصد<" }] },
  { id: "P9B3-M9", what: "AGENTS.md loses an identity rule", edits: [{ file: "AGENTS.md", find: "- **never use the national identity number as an internal identifier or a default password**;\n", replace: "" }] }
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
console.log("\nP9-B3: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
