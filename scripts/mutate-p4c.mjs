#!/usr/bin/env node
// Tadris+ P4-C — mutation proof for the school identity: the logo pipeline variant, the logo route's safety headers, whose school
// a teacher / student sees, the session and sign-in answers, the owner's school management (step-up, audit, link checks) and the
// badges in the teacher shell, the student portal and the owner preview. Same engine and rules as scripts/mutate-p1a.mjs.
// Not run as a mutant: clearing the school on sign-out (App.tsx handleLogout) — equivalent through the UI, because the next
// sign-in answer sets the school again (null when absent); kept as defence in depth.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/school-identity-p4c.test.js", "src/shell/SchoolIdentity.p4c.test.tsx", "src/owner/OwnerSchools.p4c.test.tsx"];
const IMAGE = "api/src/lib/profile-image.js";
const LOGO = "api/src/functions/school-logo.js";
const SCHOOLS = "api/src/lib/schools.js";
const SESSION = "api/src/functions/platform-session.js";
const LOGIN = "api/src/functions/platform-login.js";
const OWNER = "api/src/functions/owner-schools.js";
const SHELL = "src/shell/TeacherAppShell.tsx";
const STUDENT = "src/shell/StudentShell.tsx";
const APP = "src/App.tsx";
const PARSE = "src/shell/schoolIdentity.ts";
const BADGE = "src/ui/SchoolBadge.tsx";
const OWNERUI = "src/owner/OwnerSchools.tsx";

export const MUTANTS = [
  { id: "P4C-M1", what: "a logo is cover-cropped like a photo", edits: [{ file: IMAGE, find: "return normalizeRaster(input, { fit: \"inside\" });", replace: "return normalizeRaster(input, { fit: \"cover\" });" }] },
  { id: "P4C-M2", what: "the logo answer loses the headers that keep it from becoming a document", edits: [{ file: LOGO, find: "return { ...r, headers: { ...r.headers, ...SAFE_HEADERS } };", replace: "return r;" }] },
  { id: "P4C-M3", what: "a student's own teacher is ignored (another teacher's school shown)", edits: [{ file: SCHOOLS, find: "let owner = typeof student.ownerId === \"string\" && student.ownerId ? student.ownerId : null;", replace: "let owner = null;" }] },
  { id: "P4C-M4", what: "unowned data no longer belongs to the imported workspace", edits: [{ file: SCHOOLS, find: "if (!owner) owner = legacyDataOwner(env) || LEGACY_TEACHER_ACCOUNT_ID;", replace: "if (!owner) owner = legacyDataOwner(env);" }] },
  { id: "P4C-M5", what: "a school document of another id is trusted", edits: [{ file: SCHOOLS, find: "doc.schemaVersion === 1 && doc.schoolId === id && typeof doc.name", replace: "doc.schemaVersion === 1 && typeof doc.name" }] },
  { id: "P4C-M6", what: "the school name is not normalized", edits: [{ file: SCHOOLS, find: "String(v ?? \"\").trim().replace(/\\s+/g, \" \").slice(0, MAX_NAME);", replace: "String(v ?? \"\");" }] },
  { id: "P4C-M7", what: "the teacher probe always carries a school field", edits: [{ file: SESSION, find: "expiresAt: isoFromExp(payload.exp), access, trial, ...school } };", replace: "expiresAt: isoFromExp(payload.exp), access, trial, school: school.school || null } };" }] },
  { id: "P4C-M8", what: "the student probe drops the school", edits: [{ file: SESSION, find: "expiresAt: isoFromExp(sess.user.exp), ...school }", replace: "expiresAt: isoFromExp(sess.user.exp) }" }] },
  { id: "P4C-M9", what: "the teacher sign-in answer drops the school", edits: [{ file: LOGIN, find: "expiresInSeconds: TOKEN_TTL_SECONDS, access, trial: teacherTrialView(managed, nowMs), ...school } };", replace: "expiresInSeconds: TOKEN_TTL_SECONDS, access, trial: teacherTrialView(managed, nowMs) } };" }] },
  { id: "P4C-M10", what: "a teacher can be linked to a school that does not exist", edits: [{ file: OWNER, find: "      if (wanted !== null && !(await readSchool(container, wanted))) return NOT_FOUND();\n", replace: "" }] },
  { id: "P4C-M11", what: "school changes skip the step-up", edits: [{ file: OWNER, find: "    const denial = stepUpDenial(session, nowMs);\n    if (denial) return denial;\n", replace: "" }] },
  { id: "P4C-M12", what: "linking a teacher is not audited", edits: [{ file: OWNER, find: "      await audit(container, { actor, action: \"owner.school.linked\"", replace: "      if (false) await audit(container, { actor, action: \"owner.school.linked\"" }] },
  { id: "P4C-M13", what: "the teacher shell never shows the school", edits: [{ file: SHELL, find: "{school && <SchoolBadge name={school.name} logoUrl={school.logoUrl} />}", replace: "{false && <SchoolBadge name={school.name} logoUrl={school.logoUrl} />}" }] },
  { id: "P4C-M14", what: "the student portal never shows the school", edits: [{ file: STUDENT, find: "{school && <SchoolBadge name={school.name} logoUrl={school.logoUrl} size=\"lg\" />}", replace: "{false && <SchoolBadge name={school.name} logoUrl={school.logoUrl} size=\"lg\" />}" }] },
  { id: "P4C-M15", what: "the logo is requested with the wrong role's headers", edits: [{ file: APP, find: "sessionRole === \"student\" ? { \"x-student-token\": token, Authorization: \"Bearer \" + token } : { \"x-builder-token\": token, Authorization: \"Bearer \" + token }", replace: "sessionRole !== \"student\" ? { \"x-student-token\": token, Authorization: \"Bearer \" + token } : { \"x-builder-token\": token, Authorization: \"Bearer \" + token }" }] },
  { id: "P4C-M16", what: "any school id is accepted from an answer", edits: [{ file: PARSE, find: "if (typeof v.schoolId !== \"string\" || !/^sch_[a-f0-9]{16}$/.test(v.schoolId)) return null;", replace: "if (typeof v.schoolId !== \"string\") return null;" }] },
  { id: "P4C-M17", what: "the logo is not decorative (its alt repeats the name)", edits: [{ file: BADGE, find: "src={logoUrl} alt=\"\"", replace: "src={logoUrl} alt={name}" }] },
  { id: "P4C-M18", what: "a file of another type is sent", edits: [{ file: OWNERUI, find: "if (!ACCEPTED.includes(file.type)) {", replace: "if (false) {" }] },
  { id: "P4C-M19", what: "an oversized file is sent", edits: [{ file: OWNERUI, find: "if (file.size > MAX_BYTES) {", replace: "if (false) {" }] },
  { id: "P4C-M20", what: "the logo is removed without asking", edits: [{ file: OWNERUI, find: "onClick={() => setConfirmRemove(true)}", replace: "onClick={() => onRemoveLogo()}" }] },
  { id: "P4C-M21", what: "«بلا مدرسة» sends an empty id instead of unlinking", edits: [{ file: OWNERUI, find: "const next = e.target.value || null;", replace: "const next = e.target.value;" }] }
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
console.log("\nP4-C: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
