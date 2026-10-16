#!/usr/bin/env node
// Phase 21G — mutation campaigns for the assignments / teacher-tenancy invariants (AGENTS.md §9). Same engine and rules as
// scripts/mutate-21f.mjs: each mutant plants ONE deliberate defect (an exact, unique text replacement), runs the focused Vitest files
// that guard it, and is KILLED only if a test fails because of it. A timeout is reported as TIMEOUT (never as killed). Every mutated
// file is restored byte-for-byte and hash-verified after each mutant — also when the run throws or the process is interrupted.
//
//   node scripts/mutate-21g.mjs <campaign> [ids]   campaigns: g0, … (see CAMPAIGNS below); ids = comma-separated mutant ids to
//                                                  re-run in isolation (e.g. a TIMEOUT, or a survivor after its test was fixed)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");

const TEN = ["api/tests/teacher-tenancy-21g0.test.js"];
const BANK = ["api/tests/bank-tenancy-21g0.test.js"];
const CONTENT = ["api/tests/content-tenancy-21g0.test.js"];
const ALL = [...TEN, ...BANK, ...CONTENT];
const DETAILS = ["api/tests/assignment-details-21g0.test.js"];
const LIB = "api/src/lib/teacher-tenancy.js";
const BQ = "api/src/functions/bank-questions.js";
export const CAMPAIGNS = {
  g0: [
    { id: "G0-M1", what: "multi-user sessions get no tenant (isolation switched off)", file: LIB,
      find: 'return user && user.am === "multi-user" && typeof user.sub === "string" && user.sub ? user.sub : null;', replace: "return null;", tests: ALL },
    { id: "G0-M2", what: "the owner comparison is removed (every document accessible)", file: LIB,
      find: "return owner === null || owner === tenant;", replace: "return true;", tests: ALL },
    { id: "G0-M3", what: "LEGACY_DATA_OWNER is ignored (pre-tenancy data stays shared for ever)", file: LIB,
      find: "  return v || null;", replace: "  return null;", tests: ALL },
    { id: "G0-M4", what: "a new document is never stamped with its owner", file: LIB,
      find: "return tenant ? { ownerId: tenant } : {};", replace: "return {};", tests: ALL },
    { id: "G0-M5", what: "a student's own owner stamp is ignored in favour of nothing (any stamped student accessible)", file: LIB,
      find: 'if (typeof student.ownerId === "string" && student.ownerId) return canAccessDocument(student, tenant, env);', replace: 'if (typeof student.ownerId === "string" && student.ownerId) return true;', tests: TEN },
    { id: "G0-M6", what: "the class list shows other teachers' classes", file: "api/src/functions/manage-classrooms.js",
      find: "if (!document || !canAccessDocument(document, tenant)) continue;", replace: "if (!document) continue;", tests: TEN },
    { id: "G0-M7", what: "class actions skip the ownership pre-check", file: "api/src/functions/manage-classrooms.js",
      find: "if (targetId && (!target || !canAccessDocument(target, tenant)))", replace: "if (targetId && !target)", tests: TEN },
    { id: "G0-M8", what: "student actions accept another teacher's student", file: "api/src/functions/manage-students.js",
      find: 'if (student && typeof student.ownerId === "string" && student.ownerId) return canAccessDocument(student, tenant);\n        return classOk(student?.classId);', replace: "return true;", tests: TEN },
    { id: "G0-M9", what: "assignment actions skip the class pre-check", file: "api/src/functions/manage-assignments.js",
      find: 'if(target&&!(await classAccessible(n=>dl(c,n),target.classId,tenant)))return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};', replace: "", tests: TEN },
    { id: "G0-M10", what: "an assignment can be created in another teacher's class", file: "api/src/functions/manage-assignments.js",
      find: "if(!classroom||!canAccessDocument(classroom,tenant)||", replace: "if(!classroom||", tests: TEN },
    { id: "G0-M11", what: "a student's paper of another teacher's class can be reviewed", file: "api/src/functions/assignment-review.js",
      find: "if(!assignment||!student||!(await classAccessible(n=>dl(c,n),assignment.classId,tenantOf(auth.user))))", replace: "if(!assignment||!student)", tests: TEN },
    { id: "G0-M12", what: "messages to another teacher's student are allowed", file: "api/src/functions/messages.js",
      find: 'if (body.studentId !== undefined && !(await ownStudent(String(body.studentId || "").trim()))) return notFound(MSG.studentNotFound);', replace: "", tests: TEN },
    { id: "G0-M13", what: "another teacher's class report is served", file: "api/src/functions/reports.js",
      find: 'if (classId && !(await classAccessible(load, classId, tenant))) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };', replace: "", tests: TEN },
    { id: "G0-M14", what: "the legacy 794589 route serves another teacher's class", file: "api/src/functions/project-794589.js",
      find: "const ownClassroom = classroom => !!classroom && canAccessDocument(classroom, tenant);", replace: "const ownClassroom = classroom => !!classroom;", tests: TEN },
    { id: "G0-M15", what: "the bank list shows other teachers' questions", file: BQ,
      find: "          if (!bankEntryVisible(ownershipOf(question, byId.get(String(question.id)), sourceId), tenant)) continue;\n", replace: "", tests: BANK },
    { id: "G0-M16", what: "another teacher's bank question can be changed or deleted", file: BQ,
      find: '      if (!bankEntryVisible(ownershipOf(stored, entry, sourceId), tenant)) return { error: bad(404, "السؤال غير موجود في بنك الأسئلة.") };\n', replace: "", tests: BANK },
    { id: "G0-M17", what: "another teacher's dangling index entry is healed (removed)", file: BQ,
      find: '        if (entry && !bankEntryVisible(ownershipOf(null, entry, String(entry.sourceId || "")), tenant)) return { error: bad(404, "السؤال غير موجود في بنك الأسئلة.") };\n', replace: "", tests: BANK },
    { id: "G0-M18", what: "a re-used create key hands another teacher's question over", file: BQ,
      find: ' || String(existing.ownerId || "") !== String(fresh.ownerId || "")', replace: "", tests: BANK },
    { id: "G0-M19", what: "the index entry does not carry the owner", file: BQ,
      find: '    ...(typeof question.ownerId === "string" && question.ownerId ? { ownerId: question.ownerId } : {})\n', replace: "", tests: BANK },
    { id: "G0-M20", what: "the official bank stops being shared once a legacy owner is named", file: "api/src/lib/bank-tenancy.js",
      find: "if (!tenant || isOfficialBankEntry(entry)) return true;", replace: "if (!tenant) return true;", tests: BANK },
    { id: "G0-M21", what: "insert-from-bank serves another teacher's question", file: "api/src/functions/bank-question-select.js",
      find: "if (!stored || !bankEntryVisible(", replace: "if (!stored || bankEntryVisible(", tests: BANK },
    { id: "G0-M22", what: "replace-from-bank draws on every teacher's questions", file: "api/src/functions/question-bank-action.js",
      find: "const allQuestions = visibleBankEntries(Array.isArray(index?.questions) ? index.questions : [], tenantOf(auth.user));", replace: "const allQuestions = Array.isArray(index?.questions) ? index.questions : [];", tests: BANK },
    { id: "G0-M23", what: "the import duplicate check offers another teacher's text", file: "api/src/functions/bank-import-action.js",
      find: "if (question?.id && question?.text && bankEntryVisible(question, tenant)) {", replace: "if (question?.id && question?.text) {", tests: BANK },
    { id: "G0-M24", what: "the template list shows other teachers' templates", file: "api/src/functions/manage-templates.js",
      find: 'if (document?.kind !== "exam-template" || !canAccessDocument(document, tenant)) continue;', replace: 'if (document?.kind !== "exam-template") continue;', tests: CONTENT },
    { id: "G0-M25", what: "another teacher's template can be loaded", file: "api/src/functions/manage-templates.js",
      find: "if (!template || !canAccessDocument(template, tenant)) return", replace: "if (!template) return", tests: CONTENT },
    { id: "G0-M26", what: "another teacher's template can be deleted", file: "api/src/functions/manage-templates.js",
      find: "if (!stored || !canAccessDocument(stored, tenant)) return { status: 200, jsonBody: { ok: true, deleted: false } };", replace: "", tests: CONTENT },
    { id: "G0-M27", what: "the saved-exam page counts other teachers' exams again", file: "api/src/functions/manage-saved-exams.js",
      find: "      exams.length >= MAX_LISTED ||\n      examined >= MAX_EXAMINED", replace: "      examined >= MAX_LISTED", tests: CONTENT },
    { id: "G0-M28", what: "saved exams ignore LEGACY_DATA_OWNER (D2 claim always open)", file: "api/src/lib/saved-exam-access.js",
      find: "  return canAccessDocument(document, owner, env);", replace: "  const stored = storedOwnerOf(document);\n  return !owner || !stored || stored === owner;", tests: CONTENT },
    { id: "G0-M29", what: "two templates saved in one millisecond share a blob name", file: "api/src/functions/save-exam-artifact.js",
      find: '              crypto.randomBytes(4).toString("hex") +\n              "-" +\n', replace: "", tests: CONTENT },
    { id: "G0-M30", what: "an archived assignment's title can still be edited", file: "api/src/functions/manage-assignments.js",
      find: 'if(normalizeAssignmentStatus(current)==="archived"){const err=new Error("الواجب مؤرشف. استعده أولًا قبل تعديل بياناته.");err.httpStatus=409;throw err}', replace: "", tests: DETAILS },
    { id: "G0-M31", what: "an empty title is accepted on edit", file: "api/src/functions/manage-assignments.js",
      find: 'if(!title)return {status:400,jsonBody:{ok:false,error:"عنوان الواجب مطلوب."}};', replace: "", tests: DETAILS },
    { id: "G0-M32", what: "editing the title also rewrites the instructions when none were sent", file: "api/src/functions/manage-assignments.js",
      find: "current.title=title;if(instructions!==null)current.instructions=instructions;", replace: 'current.title=title;current.instructions=instructions||"";', tests: DETAILS }
  ]
};

const name = process.argv[2];
const campaign = CAMPAIGNS[name];
if (!campaign) { console.error("usage: node scripts/mutate-21g.mjs <" + Object.keys(CAMPAIGNS).join("|") + ">"); process.exit(2); }

const originals = new Map();
const restoreAll = () => {
  for (const [file, { buf, hash }] of originals) {
    writeFileSync(path.join(root, file), buf);
    if (sha(readFileSync(path.join(root, file))) !== hash) { console.error("RESTORE FAILED for " + file); process.exitCode = 3; }
  }
};
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { restoreAll(); process.exit(130); });
process.on("exit", restoreAll);

const only = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
const results = [];
for (const m of campaign.filter(x => !only || only.has(x.id))) {
  const abs = path.join(root, m.file);
  if (!originals.has(m.file)) { const buf = readFileSync(abs); originals.set(m.file, { buf, hash: sha(buf) }); }
  const source = originals.get(m.file).buf.toString("utf8");
  const count = source.split(m.find).length - 1;
  if (count !== 1) { results.push({ ...m, verdict: "INVALID (find matched " + count + "×)" }); continue; }
  writeFileSync(abs, source.replace(m.find, m.replace));
  let verdict, killer = "";
  try {
    const run = spawnSync("npx", ["vitest", "run", ...m.tests], { cwd: root, encoding: "utf8", timeout: 600000 });
    if (run.error && run.error.code === "ETIMEDOUT") verdict = "TIMEOUT";
    else if (run.status === 0) verdict = "SURVIVED";
    else {
      const out = (run.stdout || "") + (run.stderr || "");
      const failed = out.match(/FAIL\s+(\S+)\s+>\s+([^\n]+)/);
      verdict = /Tests\s+\d+ failed/.test(out) ? "KILLED" : "ERROR (suite did not run)";
      killer = failed ? failed[1] + " > " + failed[2].trim() : "";
    }
  } finally {
    const { buf, hash } = originals.get(m.file);
    writeFileSync(abs, buf);
    if (sha(readFileSync(abs)) !== hash) { console.error("RESTORE FAILED for " + m.file); process.exit(3); }
  }
  results.push({ ...m, verdict, killer });
  console.log(m.id + " " + verdict + " — " + m.what + (killer ? "\n    killed by: " + killer : ""));
}
// Every mutated file is back to the exact bytes it had before the campaign (hash-verified above); `git status` then shows only what
// was already there before the run (a campaign is run on a committed tree, so it is clean).
const git = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
const status = git.stdout.trim();
console.log("\n" + name + ": " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
