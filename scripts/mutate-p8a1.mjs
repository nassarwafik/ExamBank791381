#!/usr/bin/env node
// Tadris+ P8-A1 — mutation proof for the teacher appearance presets: the palettes' contrast (AA, both modes), exam pages kept on the
// default look, the density steps, the server's validation / capabilities / «default» as absence, the teacher-only application on
// <html> and its removal, the account's theme, and «المظهر». Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["src/designSystem/palettes.p8a1.test.ts", "api/tests/teacher-appearance-p8a1.test.js", "src/teacher/teacherAppearance.p8a1.test.tsx"];

export const MUTANTS = [
  { id: "P8A1-M1", what: "the «محيط» palette's primary fails AA", edits: [{ file: "src/design-tokens.css", find: "  --eb-primary: #0b4a5c; --eb-primary-strong: #13697f;", replace: "  --eb-primary: #7fb5c4; --eb-primary-strong: #13697f;" }] },
  { id: "P8A1-M2", what: "exam pages take the teacher's palette", edits: [{ file: "src/design-tokens.css", find: "  --eb-primary: #2a0a4e; --eb-primary-strong: #4a2380; --eb-primary-050: #f3effa; --eb-primary-100: #ebe5f4; --eb-primary-200: #d9cfea; --eb-primary-300: #8b74b8;\n  --eb-focus: 0 0 0 4px rgba(42,10,78,.14);\n}\n:root[data-density]", replace: "  --eb-focus: 0 0 0 4px rgba(42,10,78,.14);\n}\n:root[data-density]" }] },
  { id: "P8A1-M3", what: "compact density also shrinks the small steps", edits: [{ file: "src/design-tokens.css", find: ":root[data-density=\"compact\"] { --eb-space-3: 10px;", replace: ":root[data-density=\"compact\"] { --eb-space-2: 6px; --eb-space-3: 10px;" }] },
  { id: "P8A1-M4", what: "an unknown appearance value is stored", edits: [{ file: "api/src/lib/teacher-profile.js", find: "if (typeof input[k] !== \"string\" || !APPEARANCE[k].values.includes(input[k]))", replace: "if (typeof input[k] !== \"string\")" }] },
  { id: "P8A1-M5", what: "a part is saved without its capability", edits: [{ file: "api/src/functions/teacher-profile.js", find: "const refused = Object.keys(v.changes).find(k => !grants.has(APPEARANCE[k].capability));", replace: "const refused = undefined;" }] },
  { id: "P8A1-M6", what: "«default» is stored instead of removed", edits: [{ file: "api/src/functions/teacher-profile.js", find: "if (value === APPEARANCE[k].fallback) delete next[k]; else next[k] = value;", replace: "next[k] = value;" }] },
  { id: "P8A1-M7", what: "a stored unknown value is trusted on read", edits: [{ file: "api/src/lib/teacher-profile.js", find: "spec.values.includes(a[k]) ? a[k] : spec.fallback", replace: "a[k] ? a[k] : spec.fallback" }] },
  { id: "P8A1-M8", what: "GET reports every part choosable", edits: [{ file: "api/src/functions/teacher-profile.js", find: "[k, grants.ok && grants.has(spec.capability)]", replace: "[k, true]" }] },
  { id: "P8A1-M9", what: "the default palette is written on <html>", edits: [{ file: "src/teacher/teacherAppearance.ts", find: "if (a.palette === \"default\") root.removeAttribute(\"data-palette\"); else", replace: "if (false) root.removeAttribute(\"data-palette\"); else" }] },
  { id: "P8A1-M10", what: "the look stays after the teacher shell closes", edits: [{ file: "src/teacher/teacherAppearance.ts", find: "listeners.delete(receive); stop(); clearTeacherAppearance(); };", replace: "listeners.delete(receive); stop(); };" }] },
  { id: "P8A1-M11", what: "the account's theme is not applied", edits: [{ file: "src/teacher/teacherAppearance.ts", find: "    if (first && r.appearance.theme !== getThemeChoice()) setThemeChoice(r.appearance.theme);", replace: "    void first;" }] },
  { id: "P8A1-M12", what: "the top bar's switch is not saved to the account", edits: [{ file: "src/teacher/teacherAppearance.ts", find: "void saveTeacherAppearance(token, { theme })", replace: "void Promise.resolve()" }] },
  { id: "P8A1-M13", what: "a refusal keeps the refused look", edits: [{ file: "src/teacher/AppearanceSettings.tsx", find: "catch (e) { setCurrent(before); show(before); setMessage", replace: "catch (e) { setMessage" }] },
  { id: "P8A1-M14", what: "a part the teacher may not change stays enabled", edits: [{ file: "src/teacher/AppearanceSettings.tsx", find: "disabled={busy || !choosable.palette} checked", replace: "disabled={busy} checked" }] },
  { id: "P8A1-M15", what: "«استعادة الافتراضي» leaves the theme", edits: [{ file: "src/teacher/AppearanceSettings.tsx", find: "    if (choosable.theme) changes.theme = DEFAULT_APPEARANCE.theme;\n", replace: "" }] },
  { id: "P8A1-M16", what: "the app's profile read does not deliver the appearance", edits: [{ file: "src/teacher/teacherProfile.ts", find: "  noteTeacherAppearance(j);   // Tadris+ P8-A1", replace: "  void j;" }] }
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
console.log("\nP8-A1: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
