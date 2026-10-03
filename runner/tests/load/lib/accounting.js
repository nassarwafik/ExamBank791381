"use strict";
// Phase 17F-B10-A — OFFICIAL GRADING ACCOUNTING and JOURNAL CONSISTENCY for the load harness. The ledger follows every official
// job the harness submitted through the five observable steps (submitted → dispatched → callback received → acknowledged by the
// grading authority → terminal) and reconciles them with the identity that makes missing work obvious:
//     accepted = complete + explicitly retryable + explicitly failed-terminal        (remainder MUST be 0)
// It also counts duplicate grade APPLICATIONS (two "applied" answers for one job — a correctness failure), duplicate callback
// ACKNOWLEDGEMENTS answered alreadyApplied (idempotency working as designed), score drift on re-delivery (an idempotency violation),
// infrastructure failures that were turned into a final zero, and hidden-test leakage observed in callback bodies.
// The ledger stores identifiers, states, counts and durations ONLY — never source, stdin, stdout, expected outputs or keys.
const { percentiles, LANGUAGES } = require("./metrics.js");

const DISPATCH = new Set(["accepted", "duplicate", "busy", "conflict", "stale", "rejected", "network", "unauthorized", "unavailable"]);
const ANSWERS = new Set(["applied", "alreadyApplied", "stale", "unknown", "rejected", "error"]);
const JOB_ID = /^cg_[A-Za-z0-9_-]{16,64}$/;

function createOfficialLedger() {
  const jobs = new Map();
  const get = id => { const j = jobs.get(id); if (!j) throw new Error("ledger: unknown job"); return j; };
  return {
    submitted(jobId, { language, workloadId, cases, actor, assignment } = {}) {
      if (typeof jobId !== "string" || !JOB_ID.test(jobId)) throw new TypeError("ledger: invalid job id");
      if (!LANGUAGES.includes(language)) throw new TypeError("ledger: unsupported language");
      if (jobs.has(jobId)) throw new Error("ledger: job already submitted");
      jobs.set(jobId, { jobId, language, workloadId: String(workloadId || "unknown"), cases: Number.isInteger(cases) ? cases : 0, actor: actor ? String(actor) : null, assignment: assignment ? String(assignment) : null, submittedAt: Date.now(), dispatch: null, dispatchMs: null, callbacks: [], acks: [], terminal: null, leak: 0, mismatches: 0 });
    },
    dispatched(jobId, { status, httpStatus, ms }) {
      if (!DISPATCH.has(status)) throw new TypeError("ledger: unknown dispatch status " + status);
      const j = get(jobId); j.dispatch = status; j.dispatchHttp = httpStatus === undefined ? null : httpStatus; j.dispatchMs = Number.isFinite(ms) ? ms : null;
      // a non-accepted dispatch is its own bucket in reconcile(): busy (RUNNER_BUSY → the API marks the target retryable, explicit,
      // never lost), rejected (400 / 413 / 422: a harness bug, visible), network, or another explicit retryable refusal
    },
    /** { outcome: "completed" | "failed", technicalCode?, ms (dispatch → callback), caseStatuses?, leak? } */
    callbackReceived(jobId, { outcome, technicalCode, ms, caseStatuses, leak, mismatch } = {}) {
      const j = get(jobId);
      if (mismatch) j.mismatches++;
      j.callbacks.push({ outcome: outcome === "failed" ? "failed" : "completed", technicalCode: technicalCode || null, ms: Number.isFinite(ms) ? ms : null, at: Date.now(), internalError: Array.isArray(caseStatuses) && caseStatuses.includes("internal-error") });
      if (leak) j.leak += Number(leak) || 1;
    },
    /** { answer: "applied" | "alreadyApplied" | "stale" | "unknown" | "rejected" | "error", state?: "complete" | "retryable", score? } */
    acknowledged(jobId, { answer, state, score } = {}) {
      if (!ANSWERS.has(answer)) throw new TypeError("ledger: unknown answer " + answer);
      const j = get(jobId);
      j.acks.push({ answer, state: state || null, score: score === undefined ? null : score, at: Date.now() });
      if (answer === "applied") j.terminal = state === "retryable" ? "retryable" : "complete";
    },
    /** The applied evidence did not match the workload's expectation (wrong status / wrong output for a passing program). */
    mismatch(jobId) { get(jobId).mismatches++; },
    terminal(jobId, state) { if (!["complete", "retryable", "failed"].includes(state)) throw new TypeError("ledger: bad terminal state"); get(jobId).terminal = state; },
    jobIds: () => [...jobs.keys()],
    size: () => jobs.size,
    /** The reconciliation (counts, lists of ids and durations only). */
    reconcile() {
      const r = { offered: jobs.size, accepted: 0, duplicateAccepted: 0, busy: 0, rejected: 0, networkErrors: 0, otherRetryableDispatch: 0, complete: 0, retryable: 0, failedTerminal: 0, remainder: 0, lost: [], explicitRetryable: [], explicitFailed: [], duplicateApplications: 0, duplicateApplied: [], duplicateCallbackAcks: 0, idempotencyViolations: [], infrastructureZeroes: [], hiddenLeaks: 0, mismatches: 0, callbacksReceived: 0, identityHolds: true, byLanguage: {}, byActor: {}, timing: {} };
      const dispatchMs = [], callbackMs = [], e2e = [];
      const lang = l => (r.byLanguage[l] = r.byLanguage[l] || { offered: 0, accepted: 0, busy: 0, complete: 0, retryable: 0, failedTerminal: 0, lost: 0, callbackMs: [] });
      const actor = a => (r.byActor[a] = r.byActor[a] || { offered: 0, accepted: 0, busy: 0, complete: 0, retryable: 0, lost: 0, e2e: [] });
      for (const j of jobs.values()) {
        const L = lang(j.language), A = j.actor ? actor(j.actor) : null;
        L.offered++; if (A) A.offered++;
        if (j.dispatchMs !== null) dispatchMs.push(j.dispatchMs);
        r.hiddenLeaks += j.leak;
        r.mismatches += j.mismatches;
        r.callbacksReceived += j.callbacks.length;
        const applied = j.acks.filter(a => a.answer === "applied");
        if (applied.length > 1) { r.duplicateApplications += applied.length - 1; r.duplicateApplied.push(j.jobId); }
        const already = j.acks.filter(a => a.answer === "alreadyApplied");
        r.duplicateCallbackAcks += already.length;
        if (applied.length && already.some(a => a.score !== null && applied[0].score !== null && a.score !== applied[0].score)) r.idempotencyViolations.push(j.jobId);
        const technical = j.callbacks.some(c => c.outcome === "failed" || c.internalError);
        if (technical && applied.some(a => a.state === "complete" && a.score === 0)) r.infrastructureZeroes.push(j.jobId);
        if (j.dispatch === "accepted" || j.dispatch === "duplicate") {
          r.accepted++; L.accepted++; if (A) A.accepted++;
          if (j.dispatch === "duplicate") r.duplicateAccepted++;
          for (const c of j.callbacks) { if (c.ms !== null) { callbackMs.push(c.ms); L.callbackMs.push(c.ms); } }
          if (j.callbacks.length && j.dispatchMs !== null && j.callbacks[0].ms !== null) { const t = j.dispatchMs + j.callbacks[0].ms; e2e.push(t); if (A) A.e2e.push(t); }
          if (j.terminal === "complete") { r.complete++; L.complete++; if (A) A.complete++; }
          else if (j.terminal === "retryable") { r.retryable++; L.retryable++; r.explicitRetryable.push(j.jobId); if (A) A.retryable++; }
          else if (j.terminal === "failed") { r.failedTerminal++; L.failedTerminal++; r.explicitFailed.push(j.jobId); }
          else { r.lost.push(j.jobId); L.lost++; if (A) A.lost++; }
        } else if (j.dispatch === "busy") { r.busy++; L.busy++; if (A) A.busy++; }
        else if (j.dispatch === "rejected") r.rejected++;
        else if (j.dispatch === "network") r.networkErrors++;
        else if (j.dispatch !== null) r.otherRetryableDispatch++;
        else r.lost.push(j.jobId);                                                            // submitted, never dispatched at all
      }
      r.remainder = r.accepted - (r.complete + r.retryable + r.failedTerminal);
      r.identityHolds = r.remainder === 0 && r.lost.length === 0;
      r.timing = { dispatch: percentiles(dispatchMs), callback: percentiles(callbackMs), endToEnd: percentiles(e2e) };
      for (const v of Object.values(r.byLanguage)) { v.callback = percentiles(v.callbackMs); delete v.callbackMs; }
      for (const v of Object.values(r.byActor)) { v.endToEnd = percentiles(v.e2e); delete v.e2e; }
      return r;
    }
  };
}

const JOURNAL_STATES = ["received", "running", "executed", "confirmed", "callback_failed", "superseded"];
/**
 * Final-settlement consistency of a journal status (the shape of deploy/azure-vm/journal-status.js: { counts, quarantined, corrupt,
 * truncated }). A clean completed run has NO running / received / executed (owed callback) / callback_failed / corrupt records.
 * A scenario that INTENTIONALLY leaves retryable work declares it in `expected` and the declaration is reported, never hidden.
 */
function journalConsistency(status, { expected = {} } = {}) {
  if (!status || !status.counts) return { ok: false, issues: ["journal-status-missing"], declared: [] };
  const c = status.counts, issues = [], declared = [];
  const check = (state, issue) => {
    const n = Number(c[state] || 0), e = Number(expected[state] || 0);
    if (n > e) issues.push(issue); else if (n > 0) declared.push(state + ":" + n);
  };
  check("running", "unexplained-running");
  check("received", "unexplained-received");
  check("executed", "owed-callbacks");
  check("callback_failed", "callback-failed");
  if (Number(status.corrupt || 0) > 0 || Number(status.quarantined || 0) > 0) issues.push("corrupt-records");
  if (status.truncated) issues.push("truncated-scan");
  return { ok: issues.length === 0, issues, declared, counts: Object.fromEntries(JOURNAL_STATES.map(s => [s, Number(c[s] || 0)])), quarantined: Number(status.quarantined || 0), corrupt: Number(status.corrupt || 0) };
}

module.exports = { createOfficialLedger, journalConsistency, JOURNAL_STATES };
