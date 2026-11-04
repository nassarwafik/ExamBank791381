#!/usr/bin/env node
// Tadris+ P8-A2 — mutation proof for the owner's per-teacher appearance restriction (`resources.appearance`): validation and storage
// (revision, resolver, grants, owner routes, history), the default always allowed, the server's refusal and read-back, and the two
// consoles. Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/appearance-restriction-p8a2.test.js", "src/owner/OwnerAppearance.p8a2.test.tsx", "src/teacher/AppearanceSettings.p8a2.test.tsx"];

export const MUTANTS = [
  { id: "P8A2-M1", what: "an unknown appearance value is accepted in the revision", edits: [{ file: "api/src/lib/access/revisions.js", find: "if (!Array.isArray(list) || list.some(v => typeof v !== \"string\" || !APPEARANCE[k].values.includes(v)))", replace: "if (!Array.isArray(list))" }] },
  { id: "P8A2-M2", what: "a duplicated value is accepted", edits: [{ file: "api/src/lib/access/revisions.js", find: "        if (new Set(list).size !== list.length) return { ok: false, code: \"APPEARANCE_RESOURCE_INVALID\", details: { part: k } };\n", replace: "" }] },
  { id: "P8A2-M3", what: "the resolver drops the restriction", edits: [{ file: "api/src/lib/access/resolver.js", find: "appearance: entry.appearance ? { ...entry.appearance } : null };", replace: "appearance: null };" }] },
  { id: "P8A2-M4", what: "sessionGrants ignores the restriction", edits: [{ file: "api/src/lib/access/session-grants.js", find: "    appearance: access.appearance && typeof access.appearance === \"object\" ? access.appearance : null   // Tadris+ P8-A2", replace: "    appearance: null" }] },
  { id: "P8A2-M5", what: "the default is not always allowed", edits: [{ file: "api/src/lib/appearance-registry.js", find: "  return value === APPEARANCE[part].fallback || allowed[part].includes(value);", replace: "  return allowed[part].includes(value);" }] },
  { id: "P8A2-M6", what: "the save ignores the restriction", edits: [{ file: "api/src/functions/teacher-profile.js", find: "        if (outside) return { status: 403", replace: "        if (false) return { status: 403" }] },
  { id: "P8A2-M7", what: "a stored value no longer allowed is shown", edits: [{ file: "api/src/lib/teacher-profile.js", find: "spec.values.includes(a[k]) && appearanceAllowed(k, a[k], allowed) ? a[k] : spec.fallback", replace: "spec.values.includes(a[k]) ? a[k] : spec.fallback" }] },
  { id: "P8A2-M8", what: "GET reports every value allowed", edits: [{ file: "api/src/functions/teacher-profile.js", find: "appearanceAllowed: allowedValues(restriction) } };", replace: "appearanceAllowed: allowedValues(null) } };" }] },
  { id: "P8A2-M9", what: "assign drops the restriction", edits: [{ file: "api/src/functions/owner-access.js", find: "resources: resourcesOf(body.courses, body.widgets, body.games, body.appearance), reason: body.reason", replace: "resources: resourcesOf(body.courses, body.widgets, body.games), reason: body.reason" }] },
  { id: "P8A2-M10", what: "rollback drops the restriction", edits: [{ file: "api/src/functions/owner-access.js", find: "resources: resourcesOf(coursesOf(target), entitledWidgetsOf(target), entitledGamesOf(target), appearanceOfRev(target)),", replace: "resources: resourcesOf(coursesOf(target), entitledWidgetsOf(target), entitledGamesOf(target))," }] },
  { id: "P8A2-M11", what: "the history drops the restriction", edits: [{ file: "api/src/lib/access/history.js", find: "      appearance: doc.resources && doc.resources.appearance && typeof doc.resources.appearance === \"object\" ? { ...doc.resources.appearance } : null,   // P8-A2", replace: "      appearance: null," }] },
  { id: "P8A2-M12", what: "the teacher's settings ignore the restriction", edits: [{ file: "src/teacher/AppearanceSettings.tsx", find: "  const may = (part: keyof AppearanceAllowed, value: string) => !allowed || allowed[part].includes(value);", replace: "  const may = (part: keyof AppearanceAllowed, value: string) => !!part && !!value;" }] },
  { id: "P8A2-M13", what: "the owner can uncheck a part's default", edits: [{ file: "src/owner/AppearanceChoice.tsx", find: "disabled={v === p.fallback}", replace: "disabled={false}" }] },
  { id: "P8A2-M14", what: "the owner console never sends the restriction", edits: [{ file: "src/owner/OwnerTeacherDetails.tsx", find: "...(Object.keys(appearanceOut(appearanceDraft)).length ? { appearance: appearanceOut(appearanceDraft) } : {})", replace: "...({})" }] },
  { id: "P8A2-M15", what: "the owner console does not start from the current restriction", edits: [{ file: "src/owner/OwnerTeacherDetails.tsx", find: "  const initialAppearance: AppearanceDraft = head && head.valid && head.appearance ? { ...head.appearance } : {};", replace: "  const initialAppearance: AppearanceDraft = {};" }] }
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
console.log("\nP8-A2: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
