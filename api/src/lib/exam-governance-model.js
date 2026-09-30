// Phase 14A — the pure governance model: states, the legal-transition table, event vocabulary, the server-owned blob
// namespace and the manifest contract. No storage, no clock, no identity — those live in exam-governance.js.
//
//   draft → in-review → approved → published
//   in-review → draft, approved → draft, published → draft (= begin a NEW editable revision; the publication stays intact)
//
// Nothing else is legal: no draft → published, no in-review → published, no approved → in-review, no client-chosen target.
const GOVERNANCE_PREFIX = "exam-governance/";
const LIFECYCLE_STATES = Object.freeze(["draft", "in-review", "approved", "published"]);
const LEGAL_TRANSITIONS = Object.freeze({
  draft: Object.freeze(["in-review"]),
  "in-review": Object.freeze(["draft", "approved"]),
  approved: Object.freeze(["draft", "published"]),
  published: Object.freeze(["draft"])
});
const GOVERNANCE_EVENT_TYPES = Object.freeze(["governance-enabled", "revision-created", "submitted-for-review", "returned-to-draft", "approved", "published",
  // Phase 14B — workflow decisions (ids only in the event; the human note lives in the immutable decision record)
  "review-completed", "changes-requested", "approval-rejected", "publication-rejected", "review-withdrawn"]);
// Phase 14B Part C / H — the review workflow inside `in-review` / `approved` / `published` (never a new lifecycle state) and
// the immutable decision records under exam-governance/<examId>/decisions/<seq>-<decisionId>.json.
const REVIEW_STATUSES = Object.freeze(["pending", "completed"]);
const WORKFLOW_ROLES = Object.freeze(["authorId", "reviewerId", "approverId", "publisherId"]);
const DECISION_STAGES = Object.freeze(["review", "approval", "publication", "author"]);
const DECISION_TYPES = Object.freeze(["review-completed", "changes-requested", "approved", "approval-rejected", "publication-rejected", "withdrawn"]);
const MAX_NOTE_LENGTH = 2000;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function isSafeId(value) { return typeof value === "string" && SAFE_ID.test(value) && !value.includes(".."); }
const isSafeExamId = isSafeId;
const isSafeRevisionId = isSafeId;
function assertSafe(value, what) { if (!isSafeId(value)) throw new Error("Unsafe " + what + " for a governance blob path."); return value; }
const pad6 = n => String(n).padStart(6, "0");

function manifestName(examId) { return GOVERNANCE_PREFIX + assertSafe(examId, "examId") + "/manifest.json"; }
function revisionName(examId, revisionId) { return GOVERNANCE_PREFIX + assertSafe(examId, "examId") + "/revisions/" + assertSafe(revisionId, "revisionId") + ".json"; }
function revisionMetaName(examId, revisionNumber, revisionId) { return GOVERNANCE_PREFIX + assertSafe(examId, "examId") + "/revision-meta/" + pad6(revisionNumber) + "-" + assertSafe(revisionId, "revisionId") + ".json"; }
function eventsPrefix(examId) { return GOVERNANCE_PREFIX + assertSafe(examId, "examId") + "/events/"; }
function eventName(examId, sequence, eventId) { return eventsPrefix(examId) + pad6(sequence) + "-" + assertSafe(eventId, "eventId") + ".json"; }
function decisionsPrefix(examId) { return GOVERNANCE_PREFIX + assertSafe(examId, "examId") + "/decisions/"; }
function decisionName(examId, sequence, decisionId) { return decisionsPrefix(examId) + pad6(sequence) + "-" + assertSafe(decisionId, "decisionId") + ".json"; }

// Decision notes are plain text (never rendered as HTML by the UI), normalized (line breaks kept, other control characters
// dropped, trimmed) and bounded. Returns { ok: true, note } or { ok: false, code } — pure, so callers map the code to HTTP.
function normalizeDecisionNote(value, { required = false } = {}) {
  if (value === undefined || value === null) return required ? { ok: false, code: "NOTE_REQUIRED" } : { ok: true, note: "" };
  if (typeof value !== "string") return { ok: false, code: "NOTE_INVALID" };
  if (value.length > MAX_NOTE_LENGTH * 2) return { ok: false, code: "NOTE_TOO_LONG" };
  // eslint-disable-next-line no-control-regex
  const note = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").split("\n").map(l => l.replace(/[ \t]+$/g, "")).join("\n").trim();
  if (!note) return required ? { ok: false, code: "NOTE_REQUIRED" } : { ok: true, note: "" };
  if (note.length > MAX_NOTE_LENGTH) return { ok: false, code: "NOTE_TOO_LONG" };
  return { ok: true, note };
}

// The ONE authoritative workflow representation. Returns a list of problems (empty = valid).
function validateReviewWorkflow(w, m) {
  const issues = [];
  if (!w || typeof w !== "object" || Array.isArray(w)) return ["reviewWorkflow is not an object"];
  if (typeof w.cycleId !== "string" || !w.cycleId || !isSafeId(w.cycleId)) issues.push("reviewWorkflow.cycleId invalid");
  if (typeof w.revisionId !== "string" || !w.revisionId) issues.push("reviewWorkflow.revisionId missing");
  if (!Number.isInteger(w.revisionNumber) || w.revisionNumber < 1) issues.push("reviewWorkflow.revisionNumber invalid");
  for (const role of WORKFLOW_ROLES) if (typeof w[role] !== "string" || !w[role]) issues.push("reviewWorkflow." + role + " missing");
  const ids = WORKFLOW_ROLES.map(r => w[r]).filter(x => typeof x === "string" && x);
  if (new Set(ids).size !== ids.length) issues.push("reviewWorkflow participants must be distinct identities");
  if (typeof w.submittedAt !== "string" || typeof w.submittedBy !== "string") issues.push("reviewWorkflow submission stamp missing");
  if (!REVIEW_STATUSES.includes(w.reviewStatus)) issues.push("reviewWorkflow.reviewStatus invalid");
  if (w.reviewStatus === "completed" && (typeof w.reviewedAt !== "string" || typeof w.reviewedBy !== "string")) issues.push("completed review without reviewedAt / reviewedBy");
  if (m) {
    if (m.lifecycleState === "draft") issues.push("draft must not carry an active reviewWorkflow");
    if (m.lifecycleState === "in-review" && w.revisionId !== m.reviewRevisionId) issues.push("reviewWorkflow.revisionId differs from reviewRevisionId");
    if (m.lifecycleState === "approved" || m.lifecycleState === "published") {
      if (w.reviewStatus !== "completed") issues.push(m.lifecycleState + " requires a completed review");
      if (w.revisionId !== m.approvedRevisionId) issues.push("approved revision outside the workflow cycle");
      if (typeof w.approvedAt !== "string" || w.approvedBy !== m.approvedBy) issues.push("approval stamp does not match the workflow cycle");
    }
    if (m.lifecycleState === "published" && w.revisionId !== m.publishedRevisionId) issues.push("published revision outside the workflow cycle");
  }
  return issues;
}

function isLegalTransition(from, to) {
  if (typeof from !== "string" || typeof to !== "string") return false;
  const targets = Object.prototype.hasOwnProperty.call(LEGAL_TRANSITIONS, from) ? LEGAL_TRANSITIONS[from] : null;
  return !!targets && targets.includes(to);
}
function transitionEventType(from, to) {
  if (!isLegalTransition(from, to)) return null;
  if (to === "in-review") return "submitted-for-review";
  if (to === "approved") return "approved";
  if (to === "published") return "published";
  return "returned-to-draft";
}

function newManifest({ examId, revisionId, now, actorId }) {
  return {
    schemaVersion: 1,
    examId,
    lifecycleState: "draft",
    stateVersion: 1,
    latestRevisionId: revisionId,
    latestRevisionNumber: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: actorId,
    revisions: [{ revisionId, revisionNumber: 1 }],
    eventCount: 0,
    commands: []
  };
}

// Returns a list of problems (empty = valid). The manifest is the publishing authority, so a malformed one is never
// "repaired" on read — callers fail closed.
function validateManifest(m) {
  const issues = [];
  if (!m || typeof m !== "object" || Array.isArray(m)) return ["manifest is not an object"];
  if (m.schemaVersion !== 1) issues.push("unsupported schemaVersion");
  if (!isSafeExamId(m.examId)) issues.push("invalid examId");
  if (!LIFECYCLE_STATES.includes(m.lifecycleState)) issues.push("unknown lifecycleState");
  if (!Number.isInteger(m.stateVersion) || m.stateVersion < 1) issues.push("stateVersion must be a positive integer");
  if (typeof m.latestRevisionId !== "string" || !m.latestRevisionId) issues.push("latestRevisionId missing");
  if (!Number.isInteger(m.latestRevisionNumber) || m.latestRevisionNumber < 1) issues.push("latestRevisionNumber must be a positive integer");
  const lineage = Array.isArray(m.revisions) ? m.revisions : null;
  if (!lineage) issues.push("revisions lineage missing");
  const inLineage = id => !!lineage && lineage.some(r => r && r.revisionId === id);
  if (lineage && typeof m.latestRevisionId === "string" && !inLineage(m.latestRevisionId)) issues.push("latestRevisionId outside the lineage");
  for (const key of ["reviewRevisionId", "approvedRevisionId", "publishedRevisionId"]) {
    if (m[key] !== undefined && (typeof m[key] !== "string" || !inLineage(m[key]))) issues.push(key + " outside the lineage");
  }
  if (m.lifecycleState === "in-review" && !m.reviewRevisionId) issues.push("in-review without reviewRevisionId");
  if (m.lifecycleState === "approved" && !m.approvedRevisionId) issues.push("approved without approvedRevisionId");
  if (m.lifecycleState === "published" && !m.publishedRevisionId) issues.push("published without publishedRevisionId");
  if (typeof m.createdAt !== "string" || typeof m.updatedAt !== "string") issues.push("timestamps missing");
  if (m.reviewWorkflow !== undefined) issues.push(...validateReviewWorkflow(m.reviewWorkflow, m));   // 14B: workflow data, when present, is validated fail-closed
  if (m.lastDecision !== undefined && (!m.lastDecision || typeof m.lastDecision !== "object" || typeof m.lastDecision.decisionId !== "string" || !DECISION_TYPES.includes(m.lastDecision.decision))) issues.push("lastDecision malformed");
  return issues;
}

module.exports = {
  GOVERNANCE_PREFIX, LIFECYCLE_STATES, LEGAL_TRANSITIONS, GOVERNANCE_EVENT_TYPES, REVIEW_STATUSES, WORKFLOW_ROLES, DECISION_STAGES, DECISION_TYPES, MAX_NOTE_LENGTH,
  isSafeExamId, isSafeRevisionId, isSafeId, manifestName, revisionName, revisionMetaName, eventsPrefix, eventName, decisionsPrefix, decisionName,
  isLegalTransition, transitionEventType, newManifest, validateManifest, validateReviewWorkflow, normalizeDecisionNote
};
