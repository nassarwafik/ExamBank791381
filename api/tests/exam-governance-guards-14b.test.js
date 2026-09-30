import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Phase 14B §57 — source / security guards. They pin the SHAPE of the identity + workflow authority so a future edit cannot
// quietly reintroduce a client-controlled path: no body role / capabilities / actorId / reviewedBy authority, no inbox actor
// from the query, no shared-password fallback while BUILDER_USERS is configured, the review task renders the stored revision
// (never a client exam body), decision notes never enter the audit event, and every 14B mutation path runs the audit
// continuity preflight. Guards supplement the behavioural suites; they do not replace them.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Comments are stripped before matching: the guards judge CODE, not the prose that explains it.
const read = f => fs.readFileSync(path.join(repo, f), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s\/\/(?![^\n]*["'`]).*$/gm, "");
const AUTH = read("api/src/lib/builder-auth.js");
const USERS = read("api/src/lib/builder-users.js");
const LOGIN = read("api/src/functions/builder-login.js");
const CAPS = read("api/src/lib/exam-governance-capabilities.js");
const GOV = read("api/src/lib/exam-governance.js");
const MODEL = read("api/src/lib/exam-governance-model.js");
const FN = read("api/src/functions/exam-governance.js");
const INBOX_FN = read("api/src/functions/governance-inbox.js");
const INBOX = read("api/src/lib/governance-inbox.js");
const DIR = read("api/src/lib/governance-directory.js");
const PAGE = read("src/governance/ReviewInboxPage.tsx");
const VIEWER = read("src/governance/RevisionViewer.tsx");
const CLIENT = read("src/examGovernanceClient.ts");
const CSS = fs.readFileSync(path.join(repo, "src/governance/reviewInbox.css"), "utf8");

describe("14B §57 — identity guards", () => {
  it("multi-user mode never falls back to the shared builder password / setup key / BUILDER_USER_CODE: the configured branch returns before the legacy code and compares only the account's own secret", () => {
    const validator = AUTH.slice(AUTH.indexOf("function validateBuilderCredentials("), AUTH.indexOf("module.exports"));
    const configured = validator.slice(validator.indexOf('if (accounts.kind !== "legacy")'), validator.indexOf("const configuredPassword = getBuilderPassword()"));
    expect(configured).toMatch(/if \(accounts\.kind !== "configured"\) return false;/);
    expect(configured).toMatch(/configuredPasswordFor\(process\.env, normalizedUserCode\)/);
    expect(configured).toMatch(/return timingSafeEqualText\(passwordText, secret\);/);
    expect(configured).not.toMatch(/getBuilderPassword|BUILDER_PASSWORD|BANK_SETUP_KEY|BUILDER_USER_CODE/);
    expect(AUTH).not.toMatch(/===\s*password|password\s*===/);                                   // never a plain string compare
  });
  it("BUILDER_USERS holds metadata only: plaintext credentials are refused, passwordEnv is allow-listed and reserved names are excluded", () => {
    expect(USERS).toMatch(/const ENV_NAME = \/\^\[A-Z\]\[A-Z0-9_\]\{0,127\}\$\/;/);
    for (const name of ["BUILDER_PASSWORD", "BANK_SETUP_KEY", "BUILDER_SESSION_SECRET", "AZURE_STORAGE_CONNECTION_STRING", "BUILDER_USERS", "BUILDER_USER_CODE"]) expect(USERS).toContain('"' + name + '"');
    expect(USERS).toMatch(/"password" in acct \|\| "passwordHash" in acct \|\| "secret" in acct/);
    expect(USERS).toMatch(/two accounts share one secret/);
    expect(USERS).not.toMatch(/\b(body|request|req|payload)\b/);                                 // configuration only, never a request
    expect(USERS).not.toMatch(/console\.log|logInfo|logWarn/);                                    // never logs a value
  });
  it("the login endpoint fails closed on a broken configuration BEFORE verification and never echoes secrets, and the client cannot pick passwordEnv", () => {
    expect(LOGIN).toMatch(/builderAuthConfigurationStatus/);
    expect(LOGIN.indexOf("authConfig.broken")).toBeLessThan(LOGIN.indexOf("validateBuilder(userCode, password)"));
    expect(LOGIN).toMatch(/code: "AUTH_CONFIG_INVALID"/);
    expect(LOGIN).not.toMatch(/body\?\.passwordEnv|body\.passwordEnv|body\?\.role|body\.role|body\?\.capabilities|body\.capabilities|body\?\.sub\b/);
    expect(AUTH).not.toMatch(/passwordEnv\s*=\s*(body|request|req|args)/);
  });
  it("Assigned mode requires server-owned identities: the directory snapshot is built from BUILDER_USERS + capabilities only and the function refuses mutations when the identity status is invalid", () => {
    expect(CAPS).toMatch(/GOVERNANCE_IDENTITY_CONFIG_INVALID/);
    expect(CAPS).toMatch(/parseBuilderUsers\(env\)/);
    expect(CAPS).not.toMatch(/\bmode = "single"\s*;\s*\}\s*\/\/ downgrade/);
    expect(FN).toMatch(/if \(!identity\.ok\) return \{ status: 503/);
    expect(FN).toMatch(/directory: governanceDirectorySnapshot\(env\)/);
    expect(DIR).not.toMatch(/passwordEnv|process\.env\[/);                                        // the directory never touches secrets
  });
});

describe("14B §57 — workflow authority guards", () => {
  it("the function trusts nothing in the body for authority: no body.role / capabilities / actorId / reviewedBy / approvedBy / publishedBy / cycleId / displayName", () => {
    expect(FN).not.toMatch(/body\.(role|capabilities|actorId|reviewedBy|approvedBy|publishedBy|cycleId|displayName|reviewerName|submittedBy|occurredAt|reviewedAt|approvedAt|publishedAt)\b/);
    expect(FN).toMatch(/const actor = \{ id: String\(auth\.user\.sub\), capabilities \};/);
    // only the three assignment ids are read from the client selection
    const assign = FN.slice(FN.indexOf("function assignmentsOf("), FN.indexOf("async function handler("));
    expect(assign).toMatch(/reviewerId: id\(a\.reviewerId\), approverId: id\(a\.approverId\), publisherId: id\(a\.publisherId\)/);
    expect(assign).not.toMatch(/displayName|capabilities|role/);
  });
  it("the assigned actor AND the server capability are both required; the directory is the authority for both, never the request", () => {
    const ra = GOV.slice(GOV.indexOf("function requireAssigned("), GOV.indexOf("function assignmentInvalid("));
    expect(ra).toMatch(/workflow\[role\] !== actor\.id/);
    expect(ra).toMatch(/directoryHolds\(dir, actor\.id, capability\)/);
    expect(ra).not.toMatch(/actor\.capabilities/);
    for (const [role, cap] of [["approverId", "approve"], ["publisherId", "publish"], ["reviewerId", "review"], ["authorId", "author"]]) expect(GOV).toContain('"' + role + '", "' + cap + '"');
    const va = GOV.slice(GOV.indexOf("function validateAssignments("), GOV.indexOf("function requireNote("));
    expect(va).toMatch(/new Set\(ids\)\.size !== ids\.length/);                                   // strict separation of duties
    expect(va).toMatch(/const ids = \[actor\.id, reviewerId, approverId, publisherId\];/);
  });
  it("approval requires a completed review; the generic return-to-draft cannot bypass an active cycle; publication in a cycle is only the assigned publisher's", () => {
    expect(GOV).toMatch(/if \(workflow\.reviewStatus !== "completed"\) \{ const e = new GovernanceError\(409, "REVIEW_NOT_COMPLETED"/);
    expect(GOV).toMatch(/if \(workflow && from !== "published"\) \{ const e = new GovernanceError\(409, "WORKFLOW_ACTION_REQUIRED"/);
    expect(GOV).toMatch(/requireAssigned\(dir, actor, workflow, "publisherId", "publish"\);\s*\n\s*cycleId = workflow\.cycleId;/);
    expect(MODEL).toMatch(/requires a completed review/);
  });
  it("every 14B mutation path runs the audit continuity preflight before its replay check and commits through the ONE commit core (CAS → ensureAuditEvent)", () => {
    const wd = GOV.slice(GOV.indexOf("async function workflowDecision("), GOV.indexOf("const DECISION_OF") > GOV.indexOf("async function workflowDecision(") ? GOV.length : GOV.indexOf("async function listDecisions("));
    expect(wd.indexOf("await ensureCommittedAudit(container, examId, manifest, deps);")).toBeGreaterThan(0);
    expect(wd.indexOf("await ensureCommittedAudit(container, examId, manifest, deps);")).toBeLessThan(wd.indexOf("replayOrConflict("));
    expect(wd).toMatch(/await commitMutation\(container, examId, \{ manifest, etag, next, command, preWrites, postCleanup \}, deps\)/);
    const core = GOV.slice(GOV.indexOf("async function commitMutation("), GOV.indexOf("function replayResult("));
    expect(core.indexOf("await casManifest(")).toBeLessThan(core.indexOf("await ensureAuditEvent(container, examId, command, deps)"));
    expect(core.indexOf("for (const w of preWrites)")).toBeLessThan(core.indexOf("await casManifest("));  // decision + pointer before the CAS
    expect(core).toMatch(/catch \(e\) \{ await undoAll\(\); throw e; \}/);                                // a lost CAS undoes the pre-CAS writes
    expect(GOV).not.toMatch(/storage\.uploadJson\(/);
  });
  it("the decision note is stored ONLY in the immutable decision record — never in the audit descriptor / event", () => {
    const factory = GOV.slice(GOV.indexOf("function auditDescriptorOf("), GOV.indexOf("async function ensureAuditEvent("));
    expect(factory).not.toMatch(/\bnote\b/);
    const rec = GOV.slice(GOV.indexOf("function decisionRecordOf("), GOV.indexOf("async function writeDecisionDocument("));
    expect(rec).toMatch(/note: note \|\| ""/);
    expect(GOV).toMatch(/await writeImmutable\(container, model\.decisionName\(r\.examId, r\.sequence, r\.decisionId\), r\);/);
    expect(GOV).not.toMatch(/deleteBlob\(container, model\.decisionName\(examId, manifest\./);                 // a referenced record is never deleted
    expect(MODEL).toMatch(/const MAX_NOTE_LENGTH = 2000;/);
  });
});

describe("14B §57 — inbox + UI guards", () => {
  it("the inbox endpoint derives the actor ONLY from the token subject and never reads an actor id from the query or body", () => {
    expect(INBOX_FN).toMatch(/const actorId = String\(auth\.user\.sub\);/);
    expect(INBOX_FN).not.toMatch(/actorId["']?\)|body\.actorId|body\.sub|searchParams\.get\("actorId"\)|searchParams\.get\("sub"\)/);
    expect(INBOX_FN).toMatch(/requireBuilderAuth/);
    expect(INBOX_FN).not.toMatch(/student-auth|requireStudentAuth/);
  });
  it("the inbox reader validates every pointer against the validated manifest before returning it, and the actor key is a hash", () => {
    const list = INBOX.slice(INBOX.indexOf("async function listActorTasks("), INBOX.indexOf("module.exports"));
    expect(list).toMatch(/model\.validateManifest\(raw\)\.length === 0/);
    expect(list).toMatch(/if \(!isTaskLive\(pointer, m, actorId\)\)/);
    expect(list).not.toMatch(/revisionName\(/);                                                     // never loads a revision body
    expect(INBOX).toMatch(/createHash\("sha256"\)/);
    expect(INBOX).toMatch(/uploadJsonConditional\(container, taskName\([^)]*\), pointer, null\)/);          // create-only; undo only what we created
  });
  it("the review task view renders the STORED revision loaded by id — never a client / live exam body — with no editing controls", () => {
    expect(PAGE).toMatch(/client\.governance\.loadRevision\(task\.examId, task\.revisionId\)/);
    expect(PAGE).toMatch(/doc\.revisionId !== task\.revisionId/);
    expect(PAGE).not.toMatch(/getLatestExam|onChange=\{|<textarea|<input|examSnapshot|save-exam-artifact/);
    expect(VIEWER).not.toMatch(/onChange|contentEditable|<input|<textarea/);
    expect(VIEWER).toMatch(/readOnly/);
    expect(PAGE).not.toMatch(/dangerouslySetInnerHTML/);
    // the client sends ids and notes only: the outgoing assignment object is exactly the three ids, and no display name / role is ever sent
    expect(CLIENT).toMatch(/assignments: \{ reviewerId: args\.assignments\.reviewerId, approverId: args\.assignments\.approverId, publisherId: args\.assignments\.publisherId \}/);
    expect(CLIENT).not.toMatch(/displayName|role:|reviewedBy|approvedBy|publishedBy/);
    expect(CLIENT).not.toMatch(/call<[^>]*>\(post, \{[^}]*\bactorId\b/);                              // actorId is only READ from the status, never sent
  });
  it("mobile / RTL: the inbox stylesheet has a narrow-screen rule, 44px touch targets and no fixed widths", () => {
    expect(CSS).toMatch(/@media \(max-width:640px\)/);
    expect(CSS).toMatch(/min-height:44px/);
    expect(CSS).not.toMatch(/(^|[^-])width:\s*\d{3,}px/);                                                // no fixed widths (min-/max- constraints are fine)
    expect(PAGE).toMatch(/dir="rtl"/);
    expect(PAGE).toMatch(/aria-live="polite"/);
  });
});
