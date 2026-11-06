#!/usr/bin/env node
// UX-O3 — mutation proof for the presentation rules of the owner console whose failure would mislead the owner (design
// docs/enterprise-ux-owner-console-o3.md §5): the «لم يُحدَّد» filter counts what nobody sees; the header's «تسجيل الخروج» ends the
// session on the server; the breadcrumb does not skip the unsaved-changes question.
// Same engine and rules as scripts/mutate-p10l.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/owner/OwnerConsole.uxo3.test.tsx", "src/owner/OwnerLibrary.p6d.test.tsx"];

export const MUTANTS = [
  { id: "UXO3-M1", what: "the «لم يُحدَّد» chip counts and shows exams already decided", edits: [{ file: "src/owner/OwnerLibrary.tsx", find: "{ id: \"undecided\", label: \"لم يُحدَّد\", test: i => i.audience !== \"all\" && !i.decided }", replace: "{ id: \"undecided\", label: \"لم يُحدَّد\", test: i => i.audience !== \"all\" }" }] },
  { id: "UXO3-M2", what: "the header's «تسجيل الخروج» signs out locally without ending the session on the server", edits: [{ file: "src/owner/OwnerAccountMenu.tsx", find: "    await ownerApi.logout(token);          // the session ends on the server; locally it ends either way\n", replace: "" }] },
  { id: "UXO3-M3", what: "the breadcrumb's «المعلمون» skips the unsaved-changes question", edits: [{ file: "src/owner/OwnerTeacherDetails.tsx", find: "{ label: \"المعلمون\", onSelect: () => guarded({ back: true }) }", replace: "{ label: \"المعلمون\", onSelect: onBack }" }] }
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
console.log("\nUX-O3: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
