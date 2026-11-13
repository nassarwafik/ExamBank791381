#!/usr/bin/env node
// Tadris+ P6-E — mutation proof for the owner's «استيراد امتحان» into the library: the SERVER's readiness gate (shared
// finalization), the embedded-raster-only image rule, never the same exam twice, create-only item documents, the imported index as
// the only authority (an unlisted document does not exist; a listed one that is not the exam listed fails closed), the new exam in
// nobody's bank, the console that cannot publish an exam with a remaining blocker, and a teacher's copy of a structured library exam.
// Same engine and rules as scripts/mutate-p6d.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/owner-library-import-p6e.test.js", "src/owner/OwnerLibrary.p6e.test.tsx", "src/AppLibraryCopy.p6e.test.tsx"];
const OL = "api/src/functions/owner-library.js";
const LP = "api/src/lib/library-publish.js";   // P6-F moved the preparation and the publication here (the guarded lines unchanged)
const IMP = "api/src/lib/exam-library-imported.js";
const LIB = "api/src/functions/exam-library.js";
const AS = "api/src/functions/manage-assignments.js";
const UI = "src/owner/OwnerLibraryImport.tsx";
const APP = "src/App.tsx";

export const MUTANTS = [
  { id: "P6E-M1", what: "an exam the finalization authority refuses is published", edits: [{ file: LP, find: "if (!decision || decision.canFinalize !== true) {", replace: "if (!decision) {" }] },
  { id: "P6E-M2", what: "a linked / SVG image is accepted", edits: [{ file: LP, find: "  if (unsafeImages(snapshot)) return { ok: false", replace: "  if (false) return { ok: false" }] },
  { id: "P6E-M3", what: "the image rule accepts any data: URL", edits: [{ file: LP, find: "const SAFE_IMAGE = /^data:image\\/(png|jpe?g|webp|gif);base64,/i;", replace: "const SAFE_IMAGE = /^data:/i;" }] },
  { id: "P6E-M4", what: "the same exam can be published twice", edits: [{ file: LP, find: "  if (same) return reply(409,", replace: "  if (false) return reply(409," }, { file: IMP, find: " || m.contentHash === item.contentHash)) { outcome = \"duplicate\"", replace: ")) { outcome = \"duplicate\"" }] },
  { id: "P6E-M5", what: "an item document overwrites whatever holds its id (not create-only)", edits: [{ file: IMP, find: "  try { await upload(container, itemName(item.libraryItemId), item, null); }", replace: "  try { await storage.uploadJson(container, itemName(item.libraryItemId), item); }" }] },
  { id: "P6E-M6", what: "an unlisted item document is served (the index is not the authority)", edits: [{ file: IMP, find: "  if (!listed) return null;", replace: "  if (!listed) { const v = await storage.downloadJsonOrNull(container, itemName(clean)); return v ? { value: v, etag: \"\\\"x\\\"\" } : null; }" }] },
  { id: "P6E-M7", what: "a listed item that is not the exam listed is served (fail open)", edits: [{ file: IMP, find: "value.contentHash !== listed.contentHash || ", replace: "" }] },
  { id: "P6E-M8", what: "an index that cannot be understood is read as empty (fail open)", edits: [{ file: IMP, find: "    if (!validMeta(m) || seen.has(m.libraryItemId)) throw new ImportedLibraryError(\"imported index entry invalid\");", replace: "    if (!validMeta(m) || seen.has(m.libraryItemId)) return { schemaVersion: 1, items: [] };" }] },
  { id: "P6E-M9", what: "a published exam is not listed in the index", edits: [{ file: IMP, find: "    doc.items.push(catalogMeta(item));", replace: "" }] },
  { id: "P6E-M10", what: "an imported item is not resolved by the teacher route", edits: [{ file: LIB, find: "(IMPORTED_ID.test(id) ? await resolveLibraryItemEntry(containerOf(), id, deps) : null)", replace: "null" }] },
  { id: "P6E-M11", what: "an imported item cannot be assigned by reference", edits: [{ file: AS, find: "(IMPORTED_ID.test(itemId)?await resolveLibraryItemEntry(c,itemId,deps):null)", replace: "null" }] },
  { id: "P6E-M12", what: "the import is not recorded in the owner audit before it happens", edits: [{ file: LP, find: "    const response = await recordOwnerChange(container, {", replace: "    const response = await (async (_c, _e, apply) => apply())(container, {" }] },
  { id: "P6E-M13", what: "an id held by an unlisted document is not skipped", edits: [{ file: LP, find: "    id = \"IMP-\" + String(Number(id.slice(4)) + 1).padStart(3, \"0\");", replace: "" }] },
  { id: "P6E-M14", what: "the console lets an exam with a remaining blocker go on to publishing", edits: [{ file: UI, find: "            {decision.canFinalize\n              ? <button", replace: "            {true\n              ? <button" }] },
  { id: "P6E-M15", what: "the console publishes without a category", edits: [{ file: UI, find: "disabled={busy || !title.trim() || !category}", replace: "disabled={busy || !title.trim()}" }] },
  { id: "P6E-M17", what: "before enforcement an imported exam is listed / served to every teacher", edits: [{ file: LIB, find: "    if (!bank && (id ? IMPORTED_ID.test(id)", replace: "    if (false && (id ? IMPORTED_ID.test(id)" }] },
  { id: "P6E-M18", what: "before enforcement an imported exam can be assigned by any teacher", edits: [{ file: AS, find: "if(!seen(itemId))return", replace: "if(false)return" }] },
  { id: "P6E-M19", what: "an identity without an account sees «selected» imported exams", edits: [{ file: "api/src/lib/access/library-access.js", find: "    return a.audience === \"all\" || (!!accountId && a.teachers.includes(accountId));", replace: "    return a.audience === \"all\" || !accountId || a.teachers.includes(accountId);" }] },
  { id: "P6E-M16", what: "a structured library exam is not copied into the builder", edits: [{ file: APP, find: "    if (isStructuredExam(examSnapshot)) {", replace: "    if (false) {" }] }
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
console.log("\nP6-E: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
