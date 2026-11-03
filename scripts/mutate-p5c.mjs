#!/usr/bin/env node
// Tadris+ P5-C (risk S7, owner decision D10) — mutation proof for the protected course / library images: delivered only as signed
// URLs (library items, course modules, exam / assignment snapshots, governance revisions), stored only as their durable path, the
// signature checked before anything is read (path-bound, expiry-bound, its own key), windowed ETags, a bounded private cache, and
// the build gate that keeps them out of the static site. Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/protected-assets-p5c.test.js", "api/tests/content-asset-route-p5c.test.js", "scripts/check-protected-assets.p5c.test.mjs", "api/tests/route-auth-inventory-11a.test.js", "api/tests/bank-asset-hydrate-13b.test.js"];
const LIBR = "api/src/functions/exam-library.js";
const LEARN = "api/src/functions/learning-content.js";
const HYD = "api/src/lib/bank-asset-hydrate.js";
const CA = "api/src/lib/content-assets.js";
const ROUTE = "api/src/functions/content-asset.js";
const GOVR = "api/src/functions/exam-governance.js";
const GATE = "scripts/check-protected-assets.mjs";

export const MUTANTS = [
  { id: "P5C-M1", what: "a library item is delivered with its stored (unsigned) image paths", edits: [{ file: LIBR, find: "    if (id) entry = deliveryCopy(", replace: "    if (false) entry = deliveryCopy(" }] },
  { id: "P5C-M2", what: "a course module is delivered with its stored (unsigned) drawing paths", edits: [{ file: LEARN, find: "const signed = deliveryCopy(stored.module, stored.etag, (deps.nowMs || Date.now)());", replace: "const signed = { value: stored.module, etag: stored.etag };" }] },
  { id: "P5C-M3", what: "an exam / assignment snapshot is delivered unsigned", edits: [{ file: HYD, find: "  return signContentAssets(mapExamAssets(exam, a => signedBankAsset(a, ttl)), options.nowMs);", replace: "  return mapExamAssets(exam, a => signedBankAsset(a, ttl));" }] },
  { id: "P5C-M4", what: "a signed URL sent back by a browser is persisted (credential stored)", edits: [{ file: HYD, find: "  return normalizeContentAssets(mapExamAssets(exam, a => (isDurableForm(a) ? a : durableBankAsset(a))));", replace: "  return mapExamAssets(exam, a => (isDurableForm(a) ? a : durableBankAsset(a)));" }] },
  { id: "P5C-M5", what: "the route serves without checking the signature", edits: [{ file: ROUTE, find: "if (!verifyContentAssetSignature(rel, exp, sig, now)) return", replace: "if (false) return" }] },
  { id: "P5C-M6", what: "an expired URL is accepted", edits: [{ file: CA, find: "expiry <= now || ", replace: "" }] },
  { id: "P5C-M7", what: "a URL with a far-future expiry is accepted", edits: [{ file: CA, find: " || expiry > now + 3 * WINDOW_SECONDS", replace: "" }] },
  { id: "P5C-M8", what: "the signature is not bound to the path", edits: [{ file: CA, find: "update(\"content-asset\\n\" + exp + \"\\n\" + rel)", replace: "update(\"content-asset\\n\" + exp + \"\\n\")" }] },
  { id: "P5C-M9", what: "no key separation: a bank-image signature verifies here", edits: [{ file: CA, find: "update(\"content-asset\\n\" + exp + \"\\n\" + rel)", replace: "update(\"asset\\n\" + exp + \"\\n\" + rel)" }, { file: CA, find: "return secret ? crypto.createHmac(\"sha256\", secret).update(\"tadris-content-asset-v1\").digest() : null;", replace: "return secret || null;" }] },
  { id: "P5C-M10", what: "the ETag is not windowed (a 304 keeps expired URLs)", edits: [{ file: CA, find: "{ value: signed, etag: \"\\\"\" + crypto.createHash(\"sha256\").update(key).digest(\"base64url\").slice(0, 22) + \"\\\"\" }", replace: "{ value: signed, etag }" }] },
  { id: "P5C-M11", what: "an svg (scriptable) path can be signed and served", edits: [{ file: CA, find: "[a-f0-9]{16}\\.(png|jpg|gif|webp)$/;", replace: "[a-f0-9]{16}\\.(png|jpg|gif|webp|svg)$/;" }] },
  { id: "P5C-M12", what: "a governance published revision is delivered unsigned", edits: [{ file: GOVR, find: "const revision = signContentAssets(await GOV.loadPublishedRevision(container, examId, libDeps));", replace: "const revision = await GOV.loadPublishedRevision(container, examId, libDeps);" }] },
  { id: "P5C-M13", what: "a signed URL is not recognised as a reference (so it would be stored as is)", edits: [{ file: CA, find: "  if (value.startsWith(ROUTE + \"?\")) {", replace: "  if (false) {" }] },
  { id: "P5C-M14", what: "the image is cacheable beyond its URL's expiry", edits: [{ file: ROUTE, find: "\"cache-control\": \"private, max-age=\" + maxAge,", replace: "\"cache-control\": \"public, max-age=31536000\"," }] },
  { id: "P5C-M15", what: "the build gate ignores a protected image re-added under another name", edits: [{ file: GATE, find: "      if (hit) issues.push(", replace: "      if (false) issues.push(" }] },
  { id: "P5C-M16", what: "the build gate ignores the former public homes", edits: [{ file: GATE, find: "    for (const home of FORMER_HOMES) for (const f of walk(path.join(dir, home))) issues.push(", replace: "    for (const home of []) for (const f of walk(path.join(dir, home))) issues.push(" }] }
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
console.log("\nP5-C: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
