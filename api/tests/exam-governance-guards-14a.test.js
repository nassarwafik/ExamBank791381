import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Phase 14A §52 — source / security guards. These pin the SHAPE of the authority so a future edit cannot quietly reintroduce
// a client-controlled path: no legacy exam.status as governance state, no client publishedRevisionId / role / capability
// reaching authority, no unconditional revision or manifest writes, no fallback from the published pointer to a draft,
// students never reach governance, audit events never carry exam bodies.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Comments are stripped before matching: the guards judge CODE, not the prose that explains it.
const read = f => fs.readFileSync(path.join(repo, f), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s\/\/(?![^\n]*["'`]).*$/gm, "");
const GOV = read("api/src/lib/exam-governance.js");
const FN = read("api/src/functions/exam-governance.js");
const CAPS = read("api/src/lib/exam-governance-capabilities.js");
const ASG = read("api/src/functions/manage-assignments.js");
const PANEL = read("src/GovernancePanel.tsx");
const CLIENT = read("src/examGovernanceClient.ts");
const STUDENT = read("api/src/functions/student-assignment.js");

describe("14A §52 — governance source guards", () => {
  it("the lifecycle authority never reads exam.status; the panel derives state from the server manifest only", () => {
    expect(GOV).not.toMatch(/\.status\s*===\s*["']final["']/);
    expect(GOV).not.toMatch(/exam\.status/);
    expect(PANEL).not.toMatch(/exam\.status/);
    expect(PANEL).toMatch(/manifest\.lifecycleState/);
  });
  it("publication and approval bind only the manifest's own pointers — no client revision id in the approve / publish paths", () => {
    expect(GOV).toMatch(/boundRevisionId = manifest\.approvedRevisionId;\s*\n\s*next\.publishedRevisionId = boundRevisionId;/);
    expect(GOV).toMatch(/boundRevisionId = manifest\.reviewRevisionId;\s*\n\s*next\.approvedRevisionId = boundRevisionId;/);
    expect(GOV).not.toMatch(/publishedRevisionId\s*=\s*(args|body|req|request|publishedRevisionId\b(?!\s*=))/);
    expect(FN).not.toMatch(/body\.publishedRevisionId|body\.approvedRevisionId|body\.actorId|body\.publishedBy|body\.occurredAt|body\.capabilities|body\.role/);
  });
  it("capabilities are resolved from the authenticated identity + server environment only; the resolver never reads request payload fields", () => {
    expect(FN).toMatch(/resolveGovernanceCapabilities\(auth\.user, process\.env\)/);
    expect(CAPS).not.toMatch(/\b(body|request|req|payload)\b/);
    expect(CAPS).toMatch(/user\.role === "teacher"/);
  });
  it("actor identity and timestamps are server values: the function builds the actor from auth.user.sub and the lib stamps nowOf(deps)", () => {
    expect(FN).toMatch(/const actor = \{ id: String\(auth\.user\.sub\), capabilities \};/);
    expect(GOV).toMatch(/publishedBy = actor\.id/);
    expect(GOV).toMatch(/publishedAt = at/);
    expect(GOV).not.toMatch(/args\.(publishedAt|occurredAt|actorId|createdBy|approvedBy|publishedBy)/);
  });
  it("revision / event blobs are written create-only and the manifest only through a conditional (ETag) write; no unconditional uploadJson in the authority", () => {
    expect(GOV).toMatch(/uploadJsonConditional\(container, name, doc, null\)/);
    expect(GOV).toMatch(/uploadJsonConditional\(container, model\.manifestName\(examId\), manifest, etag\)/);
    expect(GOV).not.toMatch(/storage\.uploadJson\(/);
    expect(GOV).not.toMatch(/\bmutateJsonWithRetry\b/);            // a stale transition is a 409, never auto-retried into a newer state
  });
  it("the published loader never falls back to the latest / draft revision", () => {
    const loader = GOV.slice(GOV.indexOf("async function loadPublishedRevision"), GOV.indexOf("async function resolveGovernedExamSource"));
    expect(loader).not.toMatch(/latestRevisionId/);
    expect(loader).toMatch(/PUBLISHED_REVISION_UNAVAILABLE/);
    expect(loader).toMatch(/NO_PUBLISHED_REVISION/);
    expect(loader).toMatch(/hash !== revision\.contentHash/);
  });
  it("there is no delete / overwrite action on revisions or events anywhere in the API surface", () => {
    expect(FN).not.toMatch(/delete|purge|overwrite/i);
    expect(GOV).not.toMatch(/deleteBlob\(container, model\.revisionName\(examId, manifest\./);   // no referenced revision is ever deleted
    expect(GOV).toMatch(/discardUnreferenced/);                                                    // only never-referenced race leftovers
  });
  it("students never reach governance: the student endpoint has no governance import and the governance API requires the builder session", () => {
    expect(STUDENT).not.toMatch(/exam-governance/);
    expect(FN).toMatch(/requireBuilderAuth/);
    expect(FN).not.toMatch(/student-auth|requireStudentAuth|requireActiveStudentSession/);
  });
  it("audit events reference revision ids only — the audit descriptor / event factory has no exam field", () => {
    const factory = GOV.slice(GOV.indexOf("function auditDescriptorOf("), GOV.indexOf("async function ensureAuditEvent("));
    expect(factory.length).toBeGreaterThan(100);
    expect(factory).not.toMatch(/exam\b\s*[:,]/);
    expect(factory).toMatch(/revisionId/);
  });
  it("Review Fix 1 — commit + audit-repair protocol: the event is ensured only AFTER a manifest CAS, on every replay path, never before the CAS", () => {
    const body = GOV.slice(GOV.indexOf("async function enableGovernance("), GOV.indexOf("// ── history readers"));
    // every CAS is followed by an ensureAuditEvent before the return; no ensure precedes its CAS
    const casIdx = [...body.matchAll(/await casManifest\(/g)].map(m => m.index);
    const ensureIdx = [...body.matchAll(/await ensureAuditEvent\(container, examId, command, deps\)/g)].map(m => m.index);
    expect(casIdx).toHaveLength(3); expect(ensureIdx).toHaveLength(3);
    casIdx.forEach((c, i) => expect(ensureIdx[i]).toBeGreaterThan(c));
    // every replay returns only after re-ensuring the recorded event
    expect([...body.matchAll(/await ensureAuditEvent\(container, examId, recorded, deps\)/g)]).toHaveLength(3);
    expect(GOV).not.toMatch(/await writeEventDocument\(container, event\)/);
    // the command record carries the audit descriptor (ids / states / actor / time), never content
    expect(GOV).toMatch(/result: \{ revisionId: revision\.revisionId \}, audit \}/);
  });
  it("Review Fix 1 — the published loader reads the manifest through the ONE validated authority; a corrupt manifest is never legacy", () => {
    const loader = GOV.slice(GOV.indexOf("async function loadPublishedRevision"), GOV.indexOf("async function resolveGovernedExamSource"));
    expect(loader).toMatch(/await readManifest\(container, examId, deps\)/);
    expect(loader).not.toMatch(/dlOf\(deps\)\(container, model\.manifestName/);
    const resolver = GOV.slice(GOV.indexOf("async function resolveGovernedExamSource"), GOV.indexOf("module.exports"));
    expect(resolver).not.toMatch(/catch/);
    expect(resolver).toMatch(/loadPublishedRevision\(container, examId, deps\)/);
  });
  it("Review Fix 1 — a malformed capability configuration is a configuration-error that grants nothing; the API refuses mutations under it", () => {
    expect(CAPS).toMatch(/kind: "configuration-error"/);
    expect(CAPS).toMatch(/if \(cfg\.kind !== "configured"\) return \[\];/);
    expect(CAPS).not.toMatch(/malformed configuration ignored/);
    expect(FN).toMatch(/isCapabilityConfigurationBroken\(process\.env\)/);
    expect(FN).toMatch(/GOVERNANCE_CONFIG_INVALID/);
  });
  it("governed assignments materialize the server's revision and never the browser body; legacy path untouched", () => {
    expect(ASG).toMatch(/exam=cleanExam\(gov\.revision\.exam\)/);
    expect(ASG).toMatch(/resolveGovernedExamSource/);
    expect(ASG).toMatch(/kind:"governed-revision"/);
  });
  it("the client never retries a 409 on its own and never sends a canFinalize flag", () => {
    expect(PANEL).toMatch(/GOVERNANCE_CONFLICT_MESSAGE/);
    expect(PANEL).not.toMatch(/canFinalize:\s*(true|localDecision)/);
    expect(CLIENT).not.toMatch(/canFinalize/);
    expect(CLIENT).not.toMatch(/\bretry\b|setInterval/);
    expect(PANEL).not.toMatch(/setInterval|setTimeout\([^)]*refresh/);
  });
});
