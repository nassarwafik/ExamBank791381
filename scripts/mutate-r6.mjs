#!/usr/bin/env node
// Reports R-6 — mutation proof that an assessment is dated by its publication in the reports: the server stamps `publishedAt` at the
// FIRST publication only (never from the browser, never on a re-publish, a retry or a restore), the report date is the later of the
// publication and the opening, a document without `publishedAt` falls back to its creation and is counted, and the page says so.
// Same engine and rules as scripts/mutate-p6d.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/reports-period-basis-r6.test.js", "src/reports/reportsPeriodBasis.r6.test.tsx"];
const AS = "api/src/functions/manage-assignments.js";
const DR = "api/src/lib/reports/date-range.js";
const RP = "api/src/functions/reports.js";
const UI = "src/reports/ui.tsx";
const CENTER = "src/reports/ReportsCenter.tsx";

export const MUTANTS = [
  { id: "R6-M1", what: "a re-publication replaces the first publishedAt", edits: [{ file: AS, find: "&&!(typeof current.publishedAt===\"string\"&&Number.isFinite(Date.parse(current.publishedAt)))", replace: "" }] },
  { id: "R6-M2", what: "the browser's publishedAt is accepted at creation", edits: [{ file: AS, find: "{publishedAt:now}", replace: "{publishedAt:b.publishedAt||now}" }] },
  { id: "R6-M3", what: "re-sending «published» to an already published (pre-R-6) document stamps it", edits: [{ file: AS, find: "&&normalizeAssignmentStatus(current)!==\"published\"&&!(typeof", replace: "&&!(typeof" }] },
  { id: "R6-M4", what: "a draft is stamped at creation", edits: [{ file: AS, find: "...(b.publish===true?{publishedAt:now}:{})", replace: "...{publishedAt:now}" }] },
  { id: "R6-M5", what: "option (أ): the opening of a scheduled assessment is ignored", edits: [{ file: DR, find: "  return { iso: open && Date.parse(open) > Date.parse(published) ? open : published, fallback: false };", replace: "  return { iso: published, fallback: false };" }] },
  { id: "R6-M6", what: "the earlier of publication and opening is taken", edits: [{ file: DR, find: "Date.parse(open) > Date.parse(published)", replace: "Date.parse(open) < Date.parse(published)" }] },
  { id: "R6-M7", what: "the period still selects by creation", edits: [{ file: DR, find: ".filter(x => inRange(x.d.iso, range));", replace: ".filter(x => inRange(x.a.createdAt, range));" }] },
  { id: "R6-M8", what: "the order is still by creation", edits: [{ file: DR, find: "kept.sort((x, y) => (Date.parse(x.d.iso) || 0) - (Date.parse(y.d.iso) || 0)", replace: "kept.sort((x, y) => (Date.parse(x.a.createdAt) || 0) - (Date.parse(y.a.createdAt) || 0)" }] },
  { id: "R6-M9", what: "the fallback documents are not counted", edits: [{ file: DR, find: "fallback: kept.filter(x => x.d.fallback).length", replace: "fallback: 0" }] },
  { id: "R6-M10", what: "an invalid publishedAt is trusted", edits: [{ file: DR, find: "const published = a && validIso(a.publishedAt) ? a.publishedAt : null;", replace: "const published = a && a.publishedAt ? a.publishedAt : null;" }] },
  { id: "R6-M11", what: "the assessments row is dated by its creation", edits: [{ file: RP, find: "date: ins.isoDay(reportDateOf(a).iso)", replace: "date: ins.isoDay(a.createdAt)" }] },
  { id: "R6-M12", what: "the class report does not say what its period is based on", edits: [{ file: RP, find: "...(academic ? { periodBasis: periodBasis(dated.fallback) } : {}), projects, withheld } };\n      }\n\n      if (type === \"student\")", replace: "projects, withheld } };\n      }\n\n      if (type === \"student\")" }] },
  { id: "R6-M13", what: "the page never shows the fallback note", edits: [{ file: UI, find: "  return text ? <ReportNote>{text}</ReportNote> : null;", replace: "  return text ? null : null;" }] },
  { id: "R6-M14", what: "the period select is not described by its basis", edits: [{ file: CENTER, find: " aria-describedby=\"eb-report-period-hint\"", replace: "" }] }
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
console.log("\nR-6: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
