// Phase 17D-A — the scheduler-agnostic RECOVERY ENGINE for official coding grading.
//
// Phase 17C dispatches a committed attempt's coding targets right after the commit and applies the runner's signed callback.
// Anything that interrupts that chain — the function host dying between the commit and the dispatch, a runner outage, a lost
// callback — leaves a target "pending", "retryable" or "dispatched" forever. This module finds such targets and re-dispatches
// them through the ONE Phase 17C path (ensureCodingGradingJobs → targetAuthority → job upsert → signed runner request):
//
//   • the AUTHORITY is the committed attempt (platform/submissions/<assignment>/<student>.json → attempt.codingGrading.targets),
//     never the job store; recovery re-dispatches the SAME revision with the SAME deterministic job id and grading key (the
//     runner dedupes) — it never force-regrades, never computes a grade and never runs code;
//   • eligibility is a PURE function of the stored target and the clock (recoveryDecision): pending after a grace window, a stale
//     dispatched target, a retryable target after a deterministic backoff, at most MAX automatic attempts (then the target stays
//     retryable and is flagged exhausted — never a zero, never deleted); complete targets are never touched;
//   • every recovery dispatch is first CLAIMED with a CAS on the submission (re-checking revision, job id, state and due-ness, and
//     recording the automatic attempt durably), then dispatched with ensureCodingGradingJobs bound to that revision (`expect`),
//     which re-derives the authority (fail closed: AUTHORITY_CHANGED). A force regrade, a callback, a manual override or a teacher
//     retry that lands in between always wins (17C CAS rules: no backward move from complete, stale revisions refused);
//   • the sweep is BOUNDED (submissions scanned, dispatches, concurrency, an internal deadline), RESUMABLE (a durable cursor over a
//     paginated listing; only the lease owner advances it and only past pages it fully scanned) and SERIALIZED (a CAS lease);
//   • results and telemetry are AGGREGATE counts only — never a student, job id, grading key, source or hidden test.
// The trigger is HTTP only (Azure SWA managed Functions have no timer / queue triggers): a signed POST /api/coding/grading-sweep
// from a GitHub Actions schedule (functions/coding-grading-recovery.js). This module does not know who calls it.
const crypto = require("crypto");
const storage = require("../platform-storage");
const { recordAuditEvent } = require("../audit-log");
const { ensureCodingGradingJobs, mutateTarget, manualRecovery, STALE_DISPATCHED_MS } = require("./official-grading");

const MIN = 60 * 1000;
const AP = "platform/assignments/", SP = "platform/submissions/";
const RECOVERY_CURSOR_NAME = "platform/system/coding-grading-recovery-v1.json";
const SWEEP_LEASE_NAME = "platform/system/coding-grading-sweep-lock.json";
const RECOVERY_POLICY = Object.freeze({ pendingGraceMs: 2 * MIN, staleDispatchedMs: STALE_DISPATCHED_MS, maxAutomaticRecoveries: 8, backoffBaseMs: 5 * MIN, backoffCapMs: 60 * MIN });
const SWEEP_LIMITS = Object.freeze({ maxScanned: 200, pageSize: 100, maxDispatches: 12, concurrency: 4, deadlineMs: 25000, leaseTtlMs: 3 * MIN });
const BULK_RETRY_LIMIT = 12;
const BULK_RETRY_CONCURRENCY = 4;
const BULK_RETRY_COOLDOWN_MS = 2 * MIN;
const ACTIVE = new Set(["pending", "dispatched", "retryable"]);
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const SUBMISSION_NAME = /^platform\/submissions\/([A-Za-z0-9._:-]{1,128})\/([A-Za-z0-9._:-]{1,128})\.json$/;
const CURSOR_TOKEN_MAX = 4096;
const LEASE_MAX_FUTURE_MS = 10 * MIN;

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const iso = ms => new Date(ms).toISOString();
const timeOf = v => { const t = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : 0; };
const automaticAttempts = rec => (isObj(rec) && Number.isInteger(rec.automaticAttempts) && rec.automaticAttempts >= 0 ? rec.automaticAttempts : 0);
const safeCode = e => (e && typeof e.code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(e.code) ? e.code : "error");

// ── Pure policy ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Deterministic retry backoff after `n` automatic attempts: 5, 10, 20, 40 min, then capped at 60 min. */
function retryBackoffMs(n, policy = RECOVERY_POLICY) {
  const k = Number.isInteger(n) && n >= 0 ? Math.min(n, 16) : 0;
  return Math.min(policy.backoffCapMs, policy.backoffBaseMs * 2 ** k);
}

/**
 * Whether ONE stored target is due for an automatic recovery dispatch at `nowMs`.
 * → { eligible: true, state, reason } | { eligible: false, reason[, state] }  (reason "exhausted" = due but out of attempts)
 */
function recoveryDecision(target, nowMs, policy = RECOVERY_POLICY) {
  if (!isObj(target) || typeof target.state !== "string") return { eligible: false, reason: "invalid" };
  if (target.state === "complete") return { eligible: false, reason: "complete" };
  if (!ACTIVE.has(target.state)) return { eligible: false, reason: "not-active" };
  if (typeof target.jobId !== "string" || !target.jobId || !Number.isInteger(target.revision) || target.revision < 1) return { eligible: false, reason: "invalid" };
  const state = target.state, updated = timeOf(target.updatedAt), rec = isObj(target.recovery) ? target.recovery : {}, n = automaticAttempts(rec);
  let reason;
  if (state === "pending") { if (nowMs - updated < policy.pendingGraceMs) return { eligible: false, reason: "pending-grace", state }; reason = "pending-due"; }
  else if (state === "dispatched") { if (nowMs - updated <= policy.staleDispatchedMs) return { eligible: false, reason: "dispatched-fresh", state }; reason = "stale-dispatched"; }
  else { if (nowMs - Math.max(updated, timeOf(rec.lastAutomaticAttemptAt)) < retryBackoffMs(n, policy)) return { eligible: false, reason: "retryable-backoff", state }; reason = "retryable-due"; }
  if (n >= policy.maxAutomaticRecoveries) return { eligible: false, reason: "exhausted", state };
  return { eligible: true, state, reason };
}

// ── Lease (one sweep at a time) ──────────────────────────────────────────────────────────────────────────────────────────
/** CAS lease: created when absent, taken over only when expired. → { ok: true } | { ok: false, reason: "busy" } */
async function acquireSweepLease(container, { requestId, nowMs = Date.now(), ttlMs = SWEEP_LIMITS.leaseTtlMs } = {}) {
  const { value, etag } = await storage.downloadJsonWithEtagOrNull(container, SWEEP_LEASE_NAME);
  if (isObj(value)) {
    const exp = timeOf(value.expiresAt);
    if (exp > nowMs && exp - nowMs <= LEASE_MAX_FUTURE_MS) return { ok: false, reason: "busy" };
  }
  const doc = { schemaVersion: 1, owner: String(requestId), acquiredAt: iso(nowMs), expiresAt: iso(nowMs + ttlMs) };
  try { await storage.uploadJsonConditional(container, SWEEP_LEASE_NAME, doc, etag || null); }
  catch (e) { if (storage.isConcurrencyConflict(e)) return { ok: false, reason: "busy" }; throw e; }
  return { ok: true };
}
async function ownsSweepLease(container, requestId, nowMs) {
  const { value } = await storage.downloadJsonWithEtagOrNull(container, SWEEP_LEASE_NAME);
  return isObj(value) && value.owner === String(requestId) && timeOf(value.expiresAt) > nowMs;
}
/** Releases the lease only when this request still owns it (ETag-conditional delete); never fails the caller. */
async function releaseSweepLease(container, { requestId } = {}) {
  try {
    const { value, etag } = await storage.downloadJsonWithEtagOrNull(container, SWEEP_LEASE_NAME);
    if (!isObj(value) || value.owner !== String(requestId) || !etag) return false;
    await storage.deleteBlobConditional(container, SWEEP_LEASE_NAME, etag);
    return true;
  } catch { return false; }
}

// ── Durable cursor ───────────────────────────────────────────────────────────────────────────────────────────────────────
async function readCursor(container) {
  const doc = await storage.downloadJsonOrNull(container, RECOVERY_CURSOR_NAME);
  if (doc === null) return { token: null, cycle: 0, reset: false };
  const tokenOk = isObj(doc) && (doc.continuationToken === null || (typeof doc.continuationToken === "string" && doc.continuationToken.length <= CURSOR_TOKEN_MAX && /^[\x21-\x7e]*$/.test(doc.continuationToken)));
  const cycle = isObj(doc) && Number.isInteger(doc.cycle) && doc.cycle >= 0 ? doc.cycle : 0;
  if (!isObj(doc) || doc.schemaVersion !== 1 || !tokenOk || !Number.isInteger(doc.cycle)) return { token: null, cycle, reset: true };
  return { token: doc.continuationToken || null, cycle, reset: false };
}
async function writeCursor(container, { token, cycle, completedCycle }, nowMs) {
  await storage.mutateJsonWithRetry(container, RECOVERY_CURSOR_NAME, current => {
    const prev = isObj(current) ? current : {};
    return { schemaVersion: 1, continuationToken: token || null, cycle, updatedAt: iso(nowMs), ...(completedCycle ? { lastCycleCompletedAt: iso(nowMs) } : (typeof prev.lastCycleCompletedAt === "string" ? { lastCycleCompletedAt: prev.lastCycleCompletedAt } : {})) };
  });
}

// ── Scan → work items ────────────────────────────────────────────────────────────────────────────────────────────────────
/** The recovery work of ONE submission document (identifiers come from the blob name; a mismatching document is skipped). */
function workOf(name, doc, nowMs, policy) {
  const m = SUBMISSION_NAME.exec(name);
  if (!m || !isObj(doc) || !Array.isArray(doc.attempts)) return [];
  const [, assignmentId, studentId] = m;
  if ((doc.assignmentId !== undefined && String(doc.assignmentId) !== assignmentId) || (doc.studentId !== undefined && String(doc.studentId) !== studentId)) return [];
  const out = [];
  for (const attempt of doc.attempts) {
    const targets = isObj(attempt) && isObj(attempt.codingGrading) && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets : null;
    if (!targets || !Number.isInteger(attempt.attemptNumber) || attempt.attemptNumber < 1) continue;
    for (const key of Object.keys(targets).sort()) {
      const t = targets[key], d = recoveryDecision(t, nowMs, policy);
      const base = { ids: { assignmentId, studentId, attemptNumber: attempt.attemptNumber }, targetKey: key, revision: t && t.revision, jobId: t && t.jobId };
      if (d.eligible) out.push({ kind: "dispatch", ...base });
      else if (d.reason === "exhausted" && !(t.state === "retryable" && isObj(t.recovery) && t.recovery.exhausted === true)) out.push({ kind: "exhaust", ...base });
    }
  }
  return out;
}

/** CLAIM (CAS: still the same revision / job, still due) then dispatch the SAME revision. → "dispatched" | "retryable" | "skipped" */
async function recoverTarget(container, item, deps, policy, nowMs) {
  let claimedState = null;
  const claimed = await mutateTarget(container, item.ids, item.targetKey, { revision: item.revision, jobId: item.jobId }, t => {
    const d = recoveryDecision(t, nowMs, policy);
    if (!d.eligible) return false;
    const rec = isObj(t.recovery) ? t.recovery : {};
    t.recovery = { ...rec, automaticAttempts: automaticAttempts(rec) + 1, lastAutomaticAttemptAt: iso(nowMs), exhausted: false };
    claimedState = d.state;
    return true;
  }, deps);
  if (!claimed) return "skipped";
  const out = await ensureCodingGradingJobs(container, item.ids, deps, { targets: [item.targetKey], states: [claimedState], expect: { revision: item.revision, jobId: item.jobId } });
  if (!out[0]) return "skipped";                                     // completed / superseded between the claim and the dispatch
  return out[0].state === "dispatched" ? "dispatched" : "retryable";
}

/** Out of automatic attempts: flag it and keep (or make) it retryable — never a zero, never deleted. → true when written. */
function markRecoveryExhausted(container, item, deps, policy, nowMs) {
  return mutateTarget(container, item.ids, item.targetKey, { revision: item.revision, jobId: item.jobId }, t => {
    if (recoveryDecision(t, nowMs, policy).reason !== "exhausted") return false;
    const rec = isObj(t.recovery) ? t.recovery : {};
    if (t.state === "retryable" && rec.exhausted === true) return false;
    t.recovery = { ...rec, exhausted: true };
    if (t.state !== "retryable") { t.state = "retryable"; t.technicalCode = "RECOVERY_EXHAUSTED"; t.updatedAt = iso(nowMs); }
    return true;
  }, deps);
}

function resolveLimits(over) {
  const o = isObj(over) ? over : {}, L = { ...SWEEP_LIMITS };
  for (const k of Object.keys(SWEEP_LIMITS)) if (Number.isInteger(o[k]) && o[k] >= 1) L[k] = Math.min(o[k], k === "deadlineMs" ? 120000 : k === "leaseTtlMs" ? 5 * MIN : 5000);
  L.pageSize = Math.min(L.pageSize, L.maxScanned);
  return L;
}

/**
 * ONE bounded, resumable recovery sweep over platform/submissions/.
 *   options: { requestId (lease owner id), limits?, obs? }   deps: { env, fetch, now } (production: the Functions context)
 * → aggregate facts only: { ok, status: "completed" | "busy", stoppedBy, scanned, pages, eligible, dispatched, retryable,
 *   exhausted, skipped, errors, cycle, cycleCompleted, cursorReset, leaseLost, durationMs }
 */
async function runCodingGradingRecoverySweep(container, options = {}, deps = {}) {
  const now = typeof deps.now === "function" ? deps.now : Date.now;
  const obs = options.obs || null, policy = RECOVERY_POLICY, limits = resolveLimits(options.limits);
  const requestId = typeof options.requestId === "string" && REQUEST_ID.test(options.requestId) ? options.requestId : "sw_" + crypto.randomBytes(9).toString("hex");
  const started = now();
  let lease;
  try { lease = await acquireSweepLease(container, { requestId, nowMs: started, ttlMs: limits.leaseTtlMs }); }
  catch (e) { obs?.logWarn?.("coding.autoGrade.recovery.failed", { stage: "lease", errorCode: safeCode(e) }); throw e; }
  if (!lease.ok) { obs?.logInfo?.("coding.autoGrade.recovery.busy", {}); return { ok: false, status: "busy" }; }
  obs?.logInfo?.("coding.autoGrade.recovery.started", { maxScanned: limits.maxScanned, maxDispatches: limits.maxDispatches });
  const s = { scanned: 0, pages: 0, eligible: 0, dispatched: 0, retryable: 0, exhausted: 0, skipped: 0, errors: 0 };
  let stoppedBy = "end-of-cycle", cycleCompleted = false, leaseLost = false, dispatchBudget = limits.maxDispatches, cycle = 0, cursorReset = false;
  const overDeadline = () => now() - started >= limits.deadlineMs;
  try {
    const cursor = await readCursor(container);
    let token = cursor.token;
    cycle = cursor.cycle; cursorReset = cursor.reset;
    if (cursorReset) await writeCursor(container, { token: null, cycle }, now());
    for (;;) {
      if (overDeadline()) { stoppedBy = "deadline"; break; }
      const remaining = limits.maxScanned - s.scanned;
      if (remaining <= 0) { stoppedBy = "scan-budget"; break; }
      let page;
      try { page = await storage.listBlobNamesPage(container, SP, { continuationToken: token, maxPageSize: Math.min(limits.pageSize, remaining) }); }
      catch (e) {
        if (e && e.code === "INVALID_CONTINUATION_TOKEN" && token) { token = null; cursorReset = true; await writeCursor(container, { token: null, cycle }, now()); continue; }
        throw e;
      }
      s.pages++;
      // Read the page (bounded concurrency), derive the work, then work it with `concurrency` workers.
      const docs = await storage.mapConcurrent(page.names, storage.getReadConcurrency(), n => storage.downloadJsonOrNull(container, n).catch(() => { s.errors++; return null; }));
      s.scanned += page.names.length;
      const nowMs = now(), work = [];
      page.names.forEach((n, i) => { for (const w of workOf(n, docs[i], nowMs, policy)) work.push(w); });
      s.eligible += work.filter(w => w.kind === "dispatch").length;
      let next = 0, pageStop = null;
      const worker = async () => {
        for (;;) {
          if (pageStop || next >= work.length) return;
          if (overDeadline()) { pageStop = "deadline"; return; }
          const item = work[next];
          if (item.kind === "dispatch") { if (dispatchBudget <= 0) { pageStop = "dispatch-budget"; return; } dispatchBudget--; }
          next++;
          try {
            if (item.kind === "exhaust") { if (await markRecoveryExhausted(container, item, deps, policy, now())) s.exhausted++; else s.skipped++; continue; }
            const r = await recoverTarget(container, item, deps, policy, now());
            if (r === "skipped") { s.skipped++; dispatchBudget++; } else s[r]++;
          } catch { s.errors++; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(limits.concurrency, Math.max(1, work.length)) }, worker));
      if (pageStop) { stoppedBy = pageStop; break; }                      // page not fully worked: the cursor stays before it
      // Page fully scanned and worked → advance the cursor (lease owner only).
      if (!(await ownsSweepLease(container, requestId, now()))) { leaseLost = true; stoppedBy = "lease-lost"; break; }
      token = page.continuationToken;
      if (!token) { cycle++; cycleCompleted = true; }
      await writeCursor(container, { token, cycle, completedCycle: cycleCompleted }, now());
      if (cycleCompleted) { stoppedBy = "end-of-cycle"; break; }
    }
  } catch (e) {
    obs?.logWarn?.("coding.autoGrade.recovery.failed", { ...s, errorCode: safeCode(e) });
    throw e;
  } finally {
    if (!leaseLost) await releaseSweepLease(container, { requestId });
  }
  const result = { ok: true, status: "completed", stoppedBy, ...s, cycle, cycleCompleted, cursorReset, leaseLost, durationMs: Math.max(0, now() - started) };
  obs?.logInfo?.("coding.autoGrade.recovery.completed", result);
  return result;
}

// ── Teacher bulk retry ───────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Re-dispatches every open coding target of ONE assignment that needs it — pending, retryable (incl. exhausted) and STALE
 * dispatched; never complete or freshly dispatched — at the SAME revision, resetting automatic backoff / exhaustion. Bounded per
 * call (BULK_RETRY_LIMIT, hasMore); resumable without a client cursor: a target retried by a teacher within the cooldown is
 * skipped, so the next call continues with the rest. ONE audit event per call. → { status, scheduled, dispatched, retryable,
 * skipped, hasMore } | { status: 404, code }
 */
async function bulkRetryAssignment(container, { assignmentId, actor, limit } = {}, deps = {}, obs = null) {
  const now = typeof deps.now === "function" ? deps.now : Date.now;
  const id = String(assignmentId || "");
  const assignment = await storage.downloadJsonOrNull(container, AP + id + ".json");
  if (!assignment) return { status: 404, code: "NOT_FOUND" };
  const names = (await storage.listBlobNames(container, SP + id + "/")).sort();
  const docs = await storage.mapConcurrent(names, storage.getReadConcurrency(), n => storage.downloadJsonOrNull(container, n));
  const nowMs = now(), candidates = [];
  names.forEach((name, i) => {
    const m = SUBMISSION_NAME.exec(name), doc = docs[i];
    if (!m || m[1] !== id || !isObj(doc) || !Array.isArray(doc.attempts) || (doc.studentId !== undefined && String(doc.studentId) !== m[2])) return;
    for (const attempt of [...doc.attempts].sort((a, b) => Number(a && a.attemptNumber) - Number(b && b.attemptNumber))) {
      const targets = isObj(attempt) && isObj(attempt.codingGrading) && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets : null;
      if (!targets || !Number.isInteger(attempt.attemptNumber)) continue;
      for (const key of Object.keys(targets).sort()) {
        const t = targets[key];
        if (!bulkEligible(t, nowMs)) continue;
        if (isObj(t.recovery) && nowMs - timeOf(t.recovery.manualRetryAt) < BULK_RETRY_COOLDOWN_MS) continue;
        candidates.push({ ids: { assignmentId: id, studentId: m[2], attemptNumber: attempt.attemptNumber }, targetKey: key, revision: t.revision, jobId: t.jobId, state: t.state });
      }
    }
  });
  const cap = Number.isInteger(limit) && limit >= 1 ? Math.min(limit, BULK_RETRY_LIMIT) : BULK_RETRY_LIMIT;
  const batch = candidates.slice(0, cap), hasMore = candidates.length > cap;
  const r = { scheduled: 0, dispatched: 0, retryable: 0, skipped: 0 };
  let next = 0;
  const worker = async () => {
    while (next < batch.length) {
      const item = batch[next++];
      try {
        const expect = { revision: item.revision, jobId: item.jobId };
        const reset = await mutateTarget(container, item.ids, item.targetKey, expect, t => {
          if (!bulkEligible(t, now())) return false;
          t.recovery = manualRecovery(deps);
          return true;
        }, deps);
        if (!reset) { r.skipped++; continue; }
        r.scheduled++;
        const out = await ensureCodingGradingJobs(container, item.ids, deps, { targets: [item.targetKey], states: [item.state], expect });
        if (out[0] && out[0].state === "dispatched") r.dispatched++; else r.retryable++;
      } catch { r.skipped++; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(BULK_RETRY_CONCURRENCY, Math.max(1, batch.length)) }, worker));
  const summary = { scheduled: r.scheduled, dispatched: r.dispatched, retryable: r.retryable, hasMore };
  await (deps.recordAuditEvent || recordAuditEvent)(container, { actor: String(actor || "builder"), action: "coding.autoGrade.bulkRetry", targetType: "assignment", targetId: id, targetLabel: String(assignment.title || ""), details: { assignmentId: id, ...summary } });
  obs?.logInfo?.("coding.autoGrade.bulkRetry", { ...summary, skipped: r.skipped });
  return { status: 200, ...summary, skipped: r.skipped };
}
/** Bulk retry selection: pending, retryable, or dispatched for longer than the stale threshold (never complete). */
function bulkEligible(t, nowMs) {
  if (!isObj(t) || typeof t.jobId !== "string" || !t.jobId || !Number.isInteger(t.revision)) return false;
  if (t.state === "pending" || t.state === "retryable") return true;
  return t.state === "dispatched" && nowMs - timeOf(t.updatedAt) > RECOVERY_POLICY.staleDispatchedMs;
}

module.exports = {
  RECOVERY_POLICY, SWEEP_LIMITS, RECOVERY_CURSOR_NAME, SWEEP_LEASE_NAME, BULK_RETRY_LIMIT, BULK_RETRY_COOLDOWN_MS,
  retryBackoffMs, recoveryDecision, acquireSweepLease, releaseSweepLease, runCodingGradingRecoverySweep, bulkRetryAssignment
};
