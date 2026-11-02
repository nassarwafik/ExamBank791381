#!/usr/bin/env node
// Tadris+ P4-A — mutation proof for the console primitives (Tabs, Switch, DataTable, Stepper, DiffView), the Owner Console
// sections and routes, and the change preview of «تغيير الصلاحيات». Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/ui/console.p4a.test.tsx", "src/owner/OwnerConsole.p4a.test.tsx", "src/owner/OwnerApp.p1a2.test.tsx"];
const TABS = "src/ui/Tabs.tsx";
const SWITCH = "src/ui/Switch.tsx";
const TABLE = "src/ui/DataTable.tsx";
const STEPPER = "src/ui/Stepper.tsx";
const DIFF = "src/ui/diffSets.ts";
const ROUTE = "src/owner/ownerRoute.ts";
const APP = "src/owner/OwnerApp.tsx";
const TEACHERS = "src/owner/OwnerTeachers.tsx";

export const MUTANTS = [
  { id: "P4A-M1", what: "every tab is a Tab stop", edits: [{ file: TABS, find: "tabIndex={isSelected ? 0 : -1}", replace: "tabIndex={0}" }] },
  { id: "P4A-M2", what: "tab arrows ignore the reading direction", edits: [{ file: TABS, find: "const forward = rtl ? \"ArrowLeft\" : \"ArrowRight\", back = rtl ? \"ArrowRight\" : \"ArrowLeft\";", replace: "const forward = \"ArrowRight\", back = \"ArrowLeft\";" }] },
  { id: "P4A-M3", what: "the switch does not expose its state", edits: [{ file: SWITCH, find: "aria-checked={checked}", replace: "aria-checked={false}" }] },
  { id: "P4A-M4", what: "a disabled switch still acts", edits: [{ file: SWITCH, find: " disabled={disabled}", replace: "" }] },
  { id: "P4A-M5", what: "table rows lose their row header", edits: [{ file: TABLE, find: "(i === 0 ? <th key={c.id} scope=\"row\">{c.cell(row)}</th> : <td key={c.id}>{c.cell(row)}</td>)", replace: "<td key={c.id}>{c.cell(row)}</td>" }] },
  { id: "P4A-M6", what: "the stepper does not mark the current step", edits: [{ file: STEPPER, find: "aria-current={state === \"current\" ? \"step\" : undefined}", replace: "" }] },
  { id: "P4A-M7", what: "the diff reports the wrong side as added", edits: [{ file: DIFF, find: "  return { added: after.filter(x => !b.has(x)), removed: before.filter(x => !a.has(x)) };", replace: "  return { added: before.filter(x => !a.has(x)), removed: after.filter(x => !b.has(x)) };" }] },
  { id: "P4A-M8", what: "any owner sub-path is accepted", edits: [{ file: ROUTE, find: "const OWNER_HASH = /^#\\/owner(?:\\/(setup|teachers|access))?\\/?$/;", replace: "const OWNER_HASH = /^#\\/owner(?:\\/([a-z]+))?\\/?$/;" }] },
  { id: "P4A-M9", what: "the console ignores the section address (always the overview)", edits: [{ file: APP, find: "    const section: OwnerSection = route === \"teachers\" || route === \"access\" ? route : \"home\";", replace: "    const section: OwnerSection = \"home\";" }] },
  { id: "P4A-M10", what: "the menu does not update the address", edits: [{ file: APP, find: "if (window.location.hash !== h) window.location.hash = h; ", replace: "" }] },
  { id: "P4A-M11", what: "the change preview compares with nothing (current access ignored)", edits: [{ file: TEACHERS, find: "  const before = presets.find(p => p.id === current)?.capabilities || [];", replace: "  const before: string[] = [];" }] }
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
console.log("\nP4-A: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
