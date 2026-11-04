#!/usr/bin/env node
// Tadris+ P8-B2a — mutation proof for the teacher's own order of the sidebar (owner decision §19.31): validation, capability,
// storage and read-back on the server, audit; the client's parsing and arranging rules, the shell's sidebar and phone bottom bar,
// the profile answer reaching the shell, and «ترتيب القائمة». Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/nav-layout-p8b2a.test.js", "src/shell/navLayout.p8b2a.test.tsx"];

export const MUTANTS = [
  { id: "P8B2a-M1", what: "an unknown destination is accepted", edits: [{ file: "api/src/lib/teacher-profile.js", find: "if (v.some(id => typeof id !== \"string\" || !NAV_LAYOUT_IDS.includes(id))) return { ok: false, error: \"وجهة غير معروفة في القائمة.\" };", replace: "if (v.some(id => typeof id !== \"string\")) return { ok: false, error: \"وجهة غير معروفة في القائمة.\" };" }] },
  { id: "P8B2a-M2", what: "a repeated destination is accepted", edits: [{ file: "api/src/lib/teacher-profile.js", find: "    if (new Set(v).size !== v.length) return { ok: false, error: \"وجهة مكررة في القائمة.\" };\n", replace: "" }] },
  { id: "P8B2a-M3", what: "setNavLayout skips the capability", edits: [{ file: "api/src/functions/teacher-profile.js", find: "        if (!grants.has(LAYOUT_CAPABILITY)) return { status: 403, headers: { \"Cache-Control\": \"no-store\" }, jsonBody: { ok: false, code: \"CAPABILITY_DENIED\", error: \"ترتيب القائمة غير مفعّل لحسابك.\"", replace: "        if (false) return { status: 403, headers: { \"Cache-Control\": \"no-store\" }, jsonBody: { ok: false, code: \"CAPABILITY_DENIED\", error: \"ترتيب القائمة غير مفعّل لحسابك.\"" }] },
  { id: "P8B2a-M4", what: "the default order is stored instead of removed", edits: [{ file: "api/src/functions/teacher-profile.js", find: "          if (empty) delete next.navLayout; else next.navLayout = v.layout;", replace: "          next.navLayout = v.layout;" }] },
  { id: "P8B2a-M5", what: "a stored order is not re-validated on read", edits: [{ file: "api/src/lib/teacher-profile.js", find: "  const r = validateNavLayout(v);\n  return r.ok ? r.layout : null;", replace: "  return v;" }] },
  { id: "P8B2a-M6", what: "GET does not answer the order", edits: [{ file: "api/src/functions/teacher-profile.js", find: "navLayout: navLayoutOf(doc), layoutChoosable:", replace: "navLayout: null, layoutChoosable:" }] },
  { id: "P8B2a-M7", what: "setNavLayout is not audited", edits: [{ file: "api/src/functions/teacher-profile.js", find: "        await rec(container, { actor: sub, action: \"teacher.profile.setNavLayout\",", replace: "        if (false) await rec(container, { actor: sub, action: \"teacher.profile.setNavLayout\"," }] },
  { id: "P8B2a-M8", what: "the client keeps an unknown destination", edits: [{ file: "src/shell/navLayout.ts", find: "const isArrangeable = (v: unknown): v is TeacherNavId => typeof v === \"string\" && (ARRANGEABLE_NAV as string[]).includes(v);", replace: "const isArrangeable = (v: unknown): v is TeacherNavId => typeof v === \"string\";" }] },
  { id: "P8B2a-M9", what: "the order is ignored", edits: [{ file: "src/shell/navLayout.ts", find: "  if (!layout || !layout.order.length) return [...ids];", replace: "  return [...ids];" }] },
  { id: "P8B2a-M10", what: "«لوحة المتابعة» is not pinned first", edits: [{ file: "src/shell/navLayout.ts", find: "if (id === \"dashboard\") return -1; ", replace: "" }] },
  { id: "P8B2a-M11", what: "a hidden destination stays in the sidebar", edits: [{ file: "src/shell/navLayout.ts", find: "items: orderedNav(s.items, layout).filter(id => id === \"dashboard\" || !hidden.has(id))", replace: "items: orderedNav(s.items, layout)" }] },
  { id: "P8B2a-M12", what: "the bottom bar ignores the access", edits: [{ file: "src/shell/navLayout.ts", find: "  return main.filter(id => navAllowed(id, access)).slice(0, BOTTOM_BAR_SIZE);", replace: "  return main.slice(0, BOTTOM_BAR_SIZE);" }] },
  { id: "P8B2a-M13", what: "the bottom bar is not limited", edits: [{ file: "src/shell/navLayout.ts", find: "  return main.filter(id => navAllowed(id, access)).slice(0, BOTTOM_BAR_SIZE);", replace: "  return main.filter(id => navAllowed(id, access));" }] },
  { id: "P8B2a-M14", what: "the shell ignores the teacher's order", edits: [{ file: "src/shell/TeacherAppShell.tsx", find: "          {arrangeSections(navLayout, PRIMARY_SECTIONS).map(", replace: "          {PRIMARY_SECTIONS.map(" }] },
  { id: "P8B2a-M15", what: "the profile answer's order never reaches the shell", edits: [{ file: "src/teacher/teacherProfile.ts", find: "  noteTeacherNavLayout(j);    // Tadris+ P8-B2a", replace: "  void noteTeacherNavLayout;    // Tadris+ P8-B2a" }] },
  { id: "P8B2a-M16", what: "«ترتيب القائمة» is offered without layoutChoosable", edits: [{ file: "src/teacher/NavOrderSettings.tsx", find: "  if (!choosable) return null;\n", replace: "" }] },
  { id: "P8B2a-M17", what: "«ترتيب القائمة» lists destinations the teacher may not open", edits: [{ file: "src/teacher/NavOrderSettings.tsx", find: "  const shown = current.order.filter(id => navAllowed(id, access));", replace: "  const shown = current.order;" }] },
  { id: "P8B2a-M18", what: "closing the menu opened from «المزيد» loses the focus", edits: [{ file: "src/shell/TeacherAppShell.tsx", find: "    (openedFrom.current === \"more\" ? moreButtonRef.current : menuButtonRef.current)?.focus();", replace: "    menuButtonRef.current?.focus();" }] }
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
console.log("\nP8-B2a: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
