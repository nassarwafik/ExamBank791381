#!/usr/bin/env node
// Tadris+ P10-I — mutation proof for «every JSON API response defaults to private, no-store» (approved design
// docs/enterprise-no-store-p10i.md, owner decision §19.46): withObservability applies the rule, the routes outside it are
// registered through withCachePolicy, an explicit Cache-Control is never touched and a non-JSON answer is outside the rule.
// Same engine and rules as scripts/mutate-p10a.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/no-store-p10i.test.js", "api/tests/observability-r9.test.js"];
const C = "api/src/lib/http-cache.js";
const O = "api/src/lib/observability.js";

export const MUTANTS = [
  { id: "P10I-M1", what: "withObservability no longer applies the rule (the 79 wrapped routes lose it)", edits: [{ file: O, find: "withRequestIdHeader(applyDefaultCachePolicy(response), ctx)", replace: "withRequestIdHeader(response, ctx)" }] },
  { id: "P10I-M2", what: "the rule writes over a Cache-Control the route stated itself", edits: [{ file: C, find: "  if (hasCacheControl(response.headers)) return response;\n", replace: "" }] },
  { id: "P10I-M3", what: "the rule touches a non-JSON answer (an image, a file)", edits: [{ file: C, find: "  if (response.jsonBody === undefined) return response;\n", replace: "" }] },
  { id: "P10I-M4", what: "a route outside withObservability is registered without withCachePolicy (manage-saved-exams)", edits: [{ file: "api/src/functions/manage-saved-exams.js", find: "handler: withCachePolicy(request => handler(request))", replace: "handler: request => handler(request)" }] },
  { id: "P10I-M5", what: "a weaker default (private only: the browser may still keep the answer)", edits: [{ file: C, find: "const DEFAULT_JSON_CACHE_CONTROL = \"private, no-store\";", replace: "const DEFAULT_JSON_CACHE_CONTROL = \"private\";" }] },
  { id: "P10I-M6", what: "the explicit-header check is case-sensitive (a lower-case cache-control gets a second, conflicting one)", edits: [{ file: C, find: "String(name).toLowerCase() === \"cache-control\"", replace: "name === \"Cache-Control\"" }] },
  { id: "P10I-M7", what: "withCachePolicy drops the arguments after the request (a route's context / test seam)", edits: [{ file: C, find: "return applyDefaultCachePolicy(await handler(...args));", replace: "return applyDefaultCachePolicy(await handler(args[0]));" }] }
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
console.log("\nP10-I: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
