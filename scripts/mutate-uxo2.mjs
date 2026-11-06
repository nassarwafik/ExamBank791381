#!/usr/bin/env node
// UX-O2 — mutation proof for the presentation rules of the owner's access editor and «وضع الصلاحيات» whose failure would mislead the
// owner (design docs/enterprise-ux-owner-console-o2.md §5): a folded section is still saved; «تراجع» restores everything; unsaved
// changes are not lost silently; the button labels the runbook quotes stay verbatim.
// Same engine and rules as scripts/mutate-p10l.mjs (sha256-verified byte-for-byte restore).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/owner/OwnerAccessEditor.uxo2.test.tsx", "src/owner/OwnerAccessMode.uxo2.test.tsx", "src/owner/OwnerAccessMode.p3b.test.tsx", "src/owner/OwnerAccessMode.p3b2.test.tsx", "src/owner/OwnerTeacherDetails.p4b1.test.tsx"];
const D = "src/owner/OwnerTeacherDetails.tsx";
const M = "src/owner/OwnerAccessMode.tsx";

export const MUTANTS = [
  { id: "UXO2-M1", what: "a capability changed and then folded away is not sent (grants follow the open section)", edits: [{ file: D, find: "const save = () => picked && onSave({ presetId: picked.id, presetVersion: picked.version, grants, denies,", replace: "const save = () => picked && onSave({ presetId: picked.id, presetVersion: picked.version, grants: isOpen(\"details\") ? grants : [], denies," }] },
  { id: "UXO2-M2", what: "«تراجع عن التغييرات» restores the boxes only, not the preset", edits: [{ file: D, find: "onClick={onRevert}>تراجع عن التغييرات", replace: "onClick={() => setChosen(new Set(initialSet))}>تراجع عن التغييرات" }] },
  { id: "UXO2-M3", what: "leaving the tab with unsaved changes asks nothing (the draft is lost silently)", edits: [{ file: D, find: "if (tab === \"access\" && accessDirty.current &&", replace: "if (false && tab === \"access\" && accessDirty.current &&" }] },
  { id: "UXO2-M4", what: "a button label the runbook quotes is shortened when it moved under the checklist", edits: [{ file: M, find: ">إيقاف التطبيق (العودة إلى المراقبة)<", replace: ">إيقاف التطبيق<" }] },
  { id: "UXO2-M5", what: "the save bar says there is nothing to save while the draft differs", edits: [{ file: D, find: "{dirty ? <><strong>تغييرات غير محفوظة</strong>", replace: "{false ? <><strong>تغييرات غير محفوظة</strong>" }] }
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
console.log("\nUX-O2: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
