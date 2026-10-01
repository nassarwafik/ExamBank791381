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
  if (!out[0] || out[0].deliverySkipped) return "skipped";           // completed / superseded meanwhile, or another dispatcher holds the delivery lease (17D-B2)
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
// Review Fix 1 — ONE teacher request is bounded in EVERY dimension: blob names listed / submissions downloaded
// (BULK_RETRY_MAX_SCANNED), targets dispatched (BULK_RETRY_LIMIT), concurrency (BULK_RETRY_CONCURRENCY) and wall clock
// (BULK_RETRY_DEADLINE_MS, checked before every page, every claim and — Review Fix 2 — again right before every dispatch).
// All limits are server-owned constants.
//
// Progress across calls is a SERVER-OWNED operation cursor per assignment, platform/system/coding-bulk-retry/<assignment>.json:
//     { schemaVersion: 1, assignmentId, operation: { startedAt, pageToken, after } | null, lock?: { owner, expiresAt }, updatedAt }
// `pageToken` is the listing token of the page being worked (null = first page); `after` = { name, attemptNumber, targetKey } is
// the LAST target considered in that page, in the total order (blob name, attempt number, target key). Everything at or before
// `after` was considered by this operation; the next call resumes with the first target after it — mid-page, mid-submission or
// mid-attempt — and never advances past a target it did not consider. The end of the listing completes the operation
// (`operation: null`); the next call starts a new one. The cooldown only dedupes a target a teacher retried moments ago; it never
// owns progress. The cursor is a CAS-protected lock as well: a second concurrent call is refused with 409 BULK_RETRY_BUSY, and a
// call that lost its (expired) lock never overwrites the newer progress. The client never sees or sends the cursor.
//
// Review Fix 2 — strict pre-dispatch deadline. The claim (the CAS that re-checks eligibility and applies manualRecovery()) is
// asynchronous, so storage latency can carry it past BULK_RETRY_DEADLINE_MS. The deadline is therefore re-checked SYNCHRONOUSLY
// between a successful claim and ensureCodingGradingJobs(): a claimed target that misses it is DEFERRED — not dispatched, and
// the cursor stops just before the first deferred target (`after`), recording in `handled` the few targets past it that
// concurrent workers already finished (so they are not sent twice). A deferred claim stays rediscoverable because the cooldown
// only dedupes a manual retry that reached a dispatch outcome (target.updatedAt ≥ recovery.manualRetryAt); the claim itself
// changes neither the target's state, revision, job id nor grading key.
const BULK_RETRY_MAX_SCANNED = 100;
const BULK_RETRY_DEADLINE_MS = 20000;
const BULK_RETRY_LOCK_TTL_MS = 60 * 1000;
const BULK_RETRY_OPERATION_TTL_MS = 24 * 60 * MIN;
const BULK_RETRY_HANDLED_MAX = 16;
const BULK_CURSOR_PREFIX = "platform/system/coding-bulk-retry/";
const ASSIGNMENT_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const TARGET_KEY = /^[A-Za-z0-9._:-]{1,128}$/;

/** Total order of a target inside an assignment listing: (blob name, attempt number, target key). */
function comparePosition(a, b) {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  if (a.attemptNumber !== b.attemptNumber) return a.attemptNumber < b.attemptNumber ? -1 : 1;
  return a.targetKey === b.targetKey ? 0 : (a.targetKey < b.targetKey ? -1 : 1);
}
/** A stored operation, or null when absent / malformed / stale / not this assignment's (→ a new operation starts). */
function validOperation(op, assignmentId, nowMs) {
  if (!isObj(op)) return null;
  const started = timeOf(op.startedAt);
  if (!started || nowMs - started > BULK_RETRY_OPERATION_TTL_MS || started - nowMs > LEASE_MAX_FUTURE_MS) return null;
  const tokenOk = op.pageToken === null || (typeof op.pageToken === "string" && op.pageToken.length > 0 && op.pageToken.length <= CURSOR_TOKEN_MAX && /^[\x21-\x7e]+$/.test(op.pageToken));
  if (!tokenOk) return null;
  let after = null;
  if (op.after !== null) {
    const a = op.after, m = isObj(a) && typeof a.name === "string" ? SUBMISSION_NAME.exec(a.name) : null;
    if (!m || m[1] !== assignmentId || !Number.isInteger(a.attemptNumber) || a.attemptNumber < 1 || typeof a.targetKey !== "string" || !TARGET_KEY.test(a.targetKey)) return null;
    after = { name: a.name, attemptNumber: a.attemptNumber, targetKey: a.targetKey };
  }
  const handled = [];
  if (op.handled !== undefined) {
    if (!Array.isArray(op.handled) || op.handled.length > BULK_RETRY_HANDLED_MAX) return null;
    for (const h of op.handled) {
      const m = isObj(h) && typeof h.name === "string" ? SUBMISSION_NAME.exec(h.name) : null;
      if (!m || m[1] !== assignmentId || !Number.isInteger(h.attemptNumber) || h.attemptNumber < 1 || typeof h.targetKey !== "string" || !TARGET_KEY.test(h.targetKey)) return null;
      const pos = { name: h.name, attemptNumber: h.attemptNumber, targetKey: h.targetKey };
      if (after && comparePosition(pos, after) <= 0) return null;
      handled.push(pos);
    }
  }
  return { startedAt: op.startedAt, pageToken: op.pageToken, after, handled };
}
/** CAS-acquire the assignment's bulk retry cursor (create, or take over an expired lock). → { ok, etag, operation } | busy */
async function acquireBulkCursor(container, assignmentId, owner, nowMs) {
  const name = BULK_CURSOR_PREFIX + assignmentId + ".json";
  const { value, etag } = await storage.downloadJsonWithEtagOrNull(container, name);
  if (isObj(value) && isObj(value.lock)) {
    const exp = timeOf(value.lock.expiresAt);
    if (exp > nowMs && exp - nowMs <= LEASE_MAX_FUTURE_MS) return { ok: false };
  }
  const operation = (isObj(value) && value.assignmentId === assignmentId ? validOperation(value.operation, assignmentId, nowMs) : null) || { startedAt: iso(nowMs), pageToken: null, after: null, handled: [] };
  const doc = { schemaVersion: 1, assignmentId, operation, lock: { owner, expiresAt: iso(nowMs + BULK_RETRY_LOCK_TTL_MS) }, updatedAt: iso(nowMs) };
  try { return { ok: true, name, operation, etag: await storage.uploadJsonConditional(container, name, doc, etag || null) }; }
  catch (e) { if (storage.isConcurrencyConflict(e)) return { ok: false }; throw e; }
}
/** Persists progress and releases the lock — only if this call still owns it (If-Match on the acquired ETag). */
async function releaseBulkCursor(container, held, assignmentId, operation, nowMs) {
  const doc = { schemaVersion: 1, assignmentId, operation, updatedAt: iso(nowMs), ...(operation ? {} : { lastCompletedAt: iso(nowMs) }) };
  try { await storage.uploadJsonConditional(container, held.name, doc, held.etag); return true; }
  catch (e) { if (storage.isConcurrencyConflict(e)) return false; throw e; }
}

/** The bulk-eligible targets of ONE submission strictly after `after`, in (attempt number, target key) order. */
const positionKey = p => p.name + "\n" + p.attemptNumber + "\n" + p.targetKey;
/** The cooldown dedupes a manual retry that reached a dispatch outcome (target updated at / after it) — never a bare claim. */
function inManualCooldown(t, nowMs) {
  if (!isObj(t.recovery)) return false;
  const at = timeOf(t.recovery.manualRetryAt);
  return nowMs - at < BULK_RETRY_COOLDOWN_MS && timeOf(t.updatedAt) >= at;
}
function bulkItemsOf(name, doc, assignmentId, after, nowMs, handledKeys) {
  const m = SUBMISSION_NAME.exec(name);
  if (!m || m[1] !== assignmentId || !isObj(doc) || !Array.isArray(doc.attempts) || (doc.studentId !== undefined && String(doc.studentId) !== m[2])) return [];
  const out = [];
  for (const attempt of [...doc.attempts].filter(a => isObj(a) && Number.isInteger(a.attemptNumber) && a.attemptNumber >= 1).sort((a, b) => a.attemptNumber - b.attemptNumber)) {
    const targets = isObj(attempt.codingGrading) && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets : null;
    if (!targets) continue;
    for (const key of Object.keys(targets).filter(k => TARGET_KEY.test(k)).sort()) {
      const pos = { name, attemptNumber: attempt.attemptNumber, targetKey: key };
      if (after && comparePosition(pos, after) <= 0) continue;
      if (handledKeys && handledKeys.has(positionKey(pos))) continue;                       // already finished by this operation
      const t = targets[key];
      if (!bulkEligible(t, nowMs)) continue;
      if (inManualCooldown(t, nowMs)) continue;                                              // dedupe only
      out.push({ pos, ids: { assignmentId, studentId: m[2], attemptNumber: attempt.attemptNumber }, targetKey: key, revision: t.revision, jobId: t.jobId, state: t.state });
    }
  }
  return out;
}

/**
 * Teacher bulk retry of ONE assignment: re-dispatches pending, retryable (incl. exhausted) and STALE dispatched coding targets —
 * never complete or freshly dispatched — at the SAME revision, resetting automatic backoff / exhaustion (manualRecovery). One call
 * does at most BULK_RETRY_MAX_SCANNED listed names, BULK_RETRY_LIMIT dispatches, BULK_RETRY_CONCURRENCY in flight and stops
 * starting work at BULK_RETRY_DEADLINE_MS; `hasMore` = this operation has assignment space it has not processed yet. ONE audit
 * event per call. → { status: 200, scheduled, dispatched, retryable, skipped, hasMore } | { status: 404 | 409, code }
 */
async function bulkRetryAssignment(container, { assignmentId, actor } = {}, deps = {}, obs = null) {
  const now = typeof deps.now === "function" ? deps.now : Date.now;
  const id = String(assignmentId || "");
  if (!ASSIGNMENT_ID.test(id) || id.includes("..")) return { status: 404, code: "NOT_FOUND" };
  const assignment = await storage.downloadJsonOrNull(container, AP + id + ".json");
  if (!assignment) return { status: 404, code: "NOT_FOUND" };
  const started = now();
  const held = await acquireBulkCursor(container, id, "br_" + crypto.randomBytes(9).toString("hex"), started);
  if (!held.ok) { obs?.logInfo?.("coding.autoGrade.bulkRetry.busy", {}); return { status: 409, code: "BULK_RETRY_BUSY" }; }
  const overDeadline = () => now() - started >= BULK_RETRY_DEADLINE_MS;
  const r = { scheduled: 0, dispatched: 0, retryable: 0, skipped: 0 };
  let { pageToken, after } = held.operation, handled = held.operation.handled || [], scanned = 0, budget = BULK_RETRY_LIMIT, complete = false, tokenReset = false;
  let saved = false;
  try {
    for (;;) {
      if (overDeadline() || budget <= 0 || scanned >= BULK_RETRY_MAX_SCANNED) break;
      let page;
      try { page = await storage.listBlobNamesPage(container, SP + id + "/", { continuationToken: pageToken, maxPageSize: BULK_RETRY_MAX_SCANNED - scanned }); }
      catch (e) {
        if (e && e.code === "INVALID_CONTINUATION_TOKEN" && pageToken && !tokenReset) { tokenReset = true; pageToken = null; after = null; handled = []; continue; }
        throw e;
      }
      scanned += page.names.length;
      const toRead = page.names.filter(n => { const m = SUBMISSION_NAME.exec(n); return m && m[1] === id && (!after || n >= after.name); });
      if (overDeadline()) break;                                                            // the cursor stays at this page
      const docs = await storage.mapConcurrent(toRead, storage.getReadConcurrency(), n => storage.downloadJsonOrNull(container, n).catch(() => null));
      const nowMs = now(), items = [];
      const handledKeys = new Set(handled.map(positionKey));
      toRead.forEach((n, i) => { for (const it of bulkItemsOf(n, docs[i], id, after, nowMs, handledKeys)) items.push(it); });
      let next = 0, pageStop = false;
      const outcome = [];                                                                   // per taken item: "done" | "deferred"
      const worker = async () => {
        for (;;) {
          if (pageStop || next >= items.length) return;
          if (overDeadline() || budget <= 0) { pageStop = true; return; }
          budget--;
          const idx = next++, item = items[idx];
          outcome[idx] = "done";
          try {
            const expect = { revision: item.revision, jobId: item.jobId };
            const reset = await mutateTarget(container, item.ids, item.targetKey, expect, t => {
              if (!bulkEligible(t, now())) return false;                                    // completed / changed since the scan
              t.recovery = manualRecovery(deps);
              return true;
            }, deps);
            if (!reset) { r.skipped++; continue; }
            // Review Fix 2: the claim may have crossed the deadline — re-check SYNCHRONOUSLY right before entering the dispatch
            // path. A deferred claim is left for the next call of this operation (the cursor stops before it).
            if (overDeadline()) { outcome[idx] = "deferred"; pageStop = true; return; }
            r.scheduled++;
            const out = await ensureCodingGradingJobs(container, item.ids, deps, { targets: [item.targetKey], states: [item.state], expect });
            if (out[0] && out[0].state === "dispatched") r.dispatched++; else r.retryable++;
          } catch { r.skipped++; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(BULK_RETRY_CONCURRENCY, Math.max(1, items.length)) }, worker));
      if (pageStop) {
        // resume right after the last target taken — or just before the first DEFERRED one, remembering the targets past it
        // that concurrent workers already finished so they are not sent twice
        const firstDeferred = outcome.indexOf("deferred"), cut = firstDeferred >= 0 ? firstDeferred : next;
        if (cut > 0) after = items[cut - 1].pos;
        const finished = items.slice(cut, next).filter((_, k) => outcome[cut + k] === "done").map(it => it.pos);
        const seen = new Set();
        handled = [...handled, ...finished].filter(p => (!after || comparePosition(p, after) > 0) && !seen.has(positionKey(p)) && seen.add(positionKey(p)))
          .sort(comparePosition).slice(0, BULK_RETRY_HANDLED_MAX);
        break;
      }
      if (!page.continuationToken) { complete = true; break; }                              // end of the listing: operation done
      pageToken = page.continuationToken; after = null; handled = [];
    }
    saved = await releaseBulkCursor(container, held, id, complete ? null : { startedAt: held.operation.startedAt, pageToken, after, handled }, now());
  } finally {
    if (!saved) { try { await releaseBulkCursor(container, held, id, held.operation, now()); } catch { /* the lock expires on its own */ } }
  }
  const summary = { scheduled: r.scheduled, dispatched: r.dispatched, retryable: r.retryable, hasMore: !complete };
  await (deps.recordAuditEvent || recordAuditEvent)(container, { actor: String(actor || "builder"), action: "coding.autoGrade.bulkRetry", targetType: "assignment", targetId: id, targetLabel: String(assignment.title || ""), details: { assignmentId: id, ...summary } });
  obs?.logInfo?.("coding.autoGrade.bulkRetry", { ...summary, skipped: r.skipped, scanned });
  return { status: 200, ...summary, skipped: r.skipped };
}
/** Bulk retry selection: pending, retryable, or dispatched for longer than the stale threshold (never complete). */
function bulkEligible(t, nowMs) {
  if (!isObj(t) || typeof t.jobId !== "string" || !t.jobId || !Number.isInteger(t.revision)) return false;
  if (t.state === "pending" || t.state === "retryable") return true;
  return t.state === "dispatched" && nowMs - timeOf(t.updatedAt) > RECOVERY_POLICY.staleDispatchedMs;
}

module.exports = {
  RECOVERY_POLICY, SWEEP_LIMITS, RECOVERY_CURSOR_NAME, SWEEP_LEASE_NAME, BULK_RETRY_LIMIT, BULK_RETRY_COOLDOWN_MS, BULK_RETRY_MAX_SCANNED,
  BULK_RETRY_CONCURRENCY, BULK_RETRY_DEADLINE_MS, BULK_CURSOR_PREFIX,
  retryBackoffMs, recoveryDecision, acquireSweepLease, releaseSweepLease, runCodingGradingRecoverySweep, bulkRetryAssignment
};
