// Phase 17C — OFFICIAL automatic grading of coding@1 questions with teacher-owned hidden tests.
//
// "The Runner executes code. The SmartAssess server decides the grade."
//
//   1. PLAN (inside the attempt CAS, pure): every completed-attempt writer (submit, finalizeTimedOutAttempt, finalizeIntegrityExit,
//      teacher endActiveAttempt) calls planCodingGrading() on the attempt it is about to commit. Each COUNTED coding@1 question in
//      `answer.gradingMode: "hiddenTests"` becomes a durable target in attempt.codingGrading.targets[questionId] (coding is not
//      compound-capable, so the target key IS the question id). A missing / blank answer is graded 0 immediately ("no-answer",
//      complete); an answered target is "pending". Nothing external happens here.
//   2. DISPATCH (after the commit, never inside a storage mutation callback): ensureCodingGradingJobs() re-reads the AUTHORITATIVE
//      attempt + assignment snapshot, rebuilds the grading key, upserts the job record platform/coding-grading-jobs/<jobId>.json
//      (identifiers + state only: never source, tests or expected outputs) and sends ONE signed request to the runner's
//      POST /v1/official-grading-jobs carrying only { jobId, language, languageVersion, source, cases: [{ token, stdin }], limits }.
//      A runner outage / refusal never rejects the submission and is never a zero: the target becomes "retryable" (technical code)
//      and the question stays in manual review.
//   3. APPLY (callback, applyOfficialCallback): the runner reports RAW evidence only. The server re-derives the authority (job →
//      target → revision → grading key recomputed from the stored answer and the snapshot question), compares outputs with the
//      stored comparator, weights them, scores `effectiveMax × passedWeight / totalWeight` (rounded once) and rebuilds the attempt
//      totals with the ONE canonical rebuild (manual overrides always win). Stale / foreign / duplicate results never mutate.
//
// Phase 17D-B2 — DURABLE DELIVERY. Every send of a job is preceded by a bounded DELIVERY LEASE on its job record (ETag CAS on
// platform/coding-grading-jobs/<jobId>.json → delivery { state, attempt, leaseOwner, leaseExpiresAt, lastDeliveryAt,
// lastDeliveryCode, lastDeliveryErrorClass }): only the claimant sends; the lease is released with the outcome and EXPIRES on its
// own (DELIVERY_LEASE.ttlMs; a lease claiming to last longer than maxFutureMs is ignored), so a dispatcher that dies mid-delivery
// never strands a job. The runner request also carries { revision, targetRef } (an opaque hash of the target identity) so the
// runner's durable journal can refuse an older revision that arrives after a newer one. Delivery is at-least-once; the runner
// journal (idempotent job identity) and applyOfficialCallback (one official application) make it effectively-once for grading.
// The delivery state lives in the server-only job record — never in the attempt, never shown to students, never source / tests /
// keys / signatures.
// Target: { mode: "hiddenTests", state: "pending" | "dispatched" | "complete" | "retryable", revision, jobId, gradingKey,
//           answerHash, questionFingerprint, createdAt, updatedAt, technicalCode?, result? }
// The grading key binds the snapshot identity (assignment + attempt + question fingerprint: question id, type version, mode,
// tests, comparator, official limits, allowed languages, effective/counted marks), the answer (language, version, source hash)
// and the revision. A force regrade starts a new revision (new job id); a result of an older revision is refused.
const crypto = require("crypto");
const { readCodingRunnerConfig } = require("./runner-config");
const { signRunnerRequest } = require("./runner-protocol");
const { resolveCallbackKey } = require("./hmac-key-separation");
const { codingGradingMode, codingScoringPolicy, bindCodeAnswerToQuestion, validateCodingQuestion, CODING_COMPARATORS, DEFAULT_CODING_COMPARATOR, CODING_TEST_LIMITS, codingCompileErrorPolicy, codingQuestionVersion, codingTemplateOf, bindCodingTemplateAnswerToQuestion } = require("../shared-finalization/codingQuestion");
// Phase 19F — coding@3 (locked template): the official source is RECONSTRUCTED here, on the server, from the PUBLISHED template and the
// bound gap values — the single seam below (boundAnswer) feeds dispatch, answerHash, gradingKey, callback, regrade and recovery alike.
const { isCodeTemplateAnswered } = require("../shared-finalization/codingTemplate");
const { evaluateOfficialCodingRun, officialCodingScoreFor, officialCaseToken, OFFICIAL_STDOUT_CAPTURE_BYTES, OFFICIAL_STDERR_CAPTURE_BYTES, OFFICIAL_PREVIEW_BYTES } = require("../shared-finalization/codingContract");
const { flattenQuestions, effectiveMaxMarks } = require("../exam-structure");
// Phase 20D — composite@1 coding children: the SAME lifecycle under a NEW server-owned target identity <questionId>::part::<partId> (the
// shared child key, ≤ 128 chars, SAFE_ID charset). Top-level targets are resolved first and EXACTLY as before (their keys, fingerprints,
// grading keys, job ids and target refs are byte-identical); a child key resolves only to a coding child of a VALID composite parent; a key
// that resolves both ways is ambiguous and fails closed (finalization also refuses such ids).
const { parseCompositeChildKey, compositeStructure, compositeChildNode, compositeChildKey, isCompositeQuestionNode, isCompositeQuestionId } = require("../shared-finalization/compositeQuestion");
const { stableStringify } = require("../exam-canonical");
const { rebuildAttemptGrades } = require("../attempt-grade-rebuild");
const storage = require("../platform-storage");
const { recordAuditEvent } = require("../audit-log");
const { recordEventSafely } = require("../notification-events");
const { recordAchievementIfEligible } = require("../achievement-feed");

const AP = "platform/assignments/", SP = "platform/submissions/", UP = "platform/users/";
const JOB_PREFIX = "platform/coding-grading-jobs/";
const OFFICIAL_PATH = "/v1/official-grading-jobs";
const ENGINE = "runner-official-v1";
const DISPATCH_TIMEOUT_MS = 8000;
const DISPATCH_RESPONSE_MAX_BYTES = 16 * 1024;
const OFFICIAL_COMPILE_STDERR_BYTES = 32 * 1024;
const OFFICIAL_LIMITS = Object.freeze({ timeMs: [250, 10000], memoryMb: [16, 512] });
const JOB_ID = /^cg_[A-Za-z0-9_-]{16,64}$/;
const TECH_CODE = /^[A-Z][A-Z0-9_]{0,47}$/;
const SYSTEM_ACTOR = "system:coding-grader";
const ACTIVE_STATES = Object.freeze(["pending", "dispatched", "retryable"]);
// Phase 17F-C2 (Review Fix 1) — TWO terminal target states for automatic execution. "complete" = an authoritative automatic result
// was applied (a score, incl. a real 0, or no-answer). "reviewRequired" = the Runner's execution is COMPLETE (a structural compile
// error under the question's coding@2 "manualReview" policy) but NO automatic academic score exists: the teacher decides. Its own
// state (never an overloaded "complete") is the rollback boundary: a PRE-C2 binary treats an unknown non-complete state as
// "automatic work not finished" (score withheld, not redispatched — not an ACTIVE state), never as a decided zero.
const TERMINAL_STATES = Object.freeze(["complete", "reviewRequired"]);
const isTerminalState = s => s === "complete" || s === "reviewRequired";
// Phase 17D-A — a "dispatched" target older than this has most likely lost its callback (the Recovery Engine re-dispatches the
// SAME revision; the gradebook counts it as stale). Shared by the recovery policy and the gradebook status.
const STALE_DISPATCHED_MS = 30 * 60 * 1000;
// Phase 17D-B2 — the delivery lease: longer than one dispatch (DISPATCH_TIMEOUT_MS) plus its storage round trips, short enough that
// a crashed dispatcher delays a retry by seconds; a stored expiry further than maxFutureMs ahead is treated as invalid.
const DELIVERY_LEASE = Object.freeze({ ttlMs: 30 * 1000, maxFutureMs: 2 * 60 * 1000, claimAttempts: 4 });

const sha256 = text => crypto.createHash("sha256").update(text, "utf8").digest("hex");
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
/** RF1-D — the ONE canonical "review required" derivation of a stored target: state reviewRequired AND a CURRENT result (the same
 *  revision) whose outcome is the compile error the policy answers AND the stored flag. Anything else in that state is corrupt /
 *  stale evidence: consumers fail SAFE (status withheld as still processing, evidence incomplete) — never a fabricated zero. */
function reviewRequiredTarget(t) {
  return isObj(t) && t.state === "reviewRequired" && isObj(t.result) && Number.isInteger(t.result.revision) && t.result.revision === t.revision && t.result.outcome === "compile-error" && t.result.reviewRequired === true;
}
const nowIso = deps => new Date((deps && deps.now ? deps.now() : Date.now())).toISOString();
const isCodingNode = q => isObj(q) && String(q.presentationType ?? q.type ?? "") === "coding";
const jobName = jobId => JOB_PREFIX + jobId + ".json";

/** Phase 17D-B2 — the OPAQUE target reference sent to the runner (orders revisions of one target; reveals no identifier). */
function officialTargetRef({ assignmentId, studentId, attemptNumber, submittedAt, targetKey }) {
  return "tr_" + sha256(["cg-target-v1", assignmentId, studentId, attemptNumber, submittedAt, targetKey].join("\n")).slice(0, 40);
}

/** Deterministic job id for (attempt, target, revision): re-dispatch of the same revision always reuses it (runner dedupe). */
function officialJobId({ assignmentId, studentId, attemptNumber, submittedAt, targetKey, revision }) {
  return "cg_" + sha256(["cg-job-v1", assignmentId, studentId, attemptNumber, submittedAt, targetKey, revision].join("\n")).slice(0, 40);
}

/** Official runner limits of a coding question (time + memory as configured; stdout capture bounded by the official contract). */
function officialLimits(cfg) {
  const l = isObj(cfg) && isObj(cfg.limits) ? cfg.limits : {};
  const timeMs = Number(l.timeMs), memoryMb = Number(l.memoryMb), out = Number(l.outputBytes);
  if (!Number.isInteger(timeMs) || timeMs < OFFICIAL_LIMITS.timeMs[0] || timeMs > OFFICIAL_LIMITS.timeMs[1]) return null;
  if (!Number.isInteger(memoryMb) || memoryMb < OFFICIAL_LIMITS.memoryMb[0] || memoryMb > OFFICIAL_LIMITS.memoryMb[1]) return null;
  if (!Number.isInteger(out) || out < 1024) return null;
  return { timeMs, memoryMb, outputBytes: Math.min(out, OFFICIAL_STDOUT_CAPTURE_BYTES) };
}

/** The gradeable hidden-test contract of a question (fail closed), or { ok: false, code }. */
function gradeableQuestion(q) {
  // Review Fix 1 — the catalog decides which coding versions THIS server supports (coding@1 historical, coding@2 policy, coding@3 locked
  // template since 19F); any other version fails closed here, so a server that does not know a version can never grade it under another
  // version's contract.
  const version = isCodingNode(q) ? codingQuestionVersion(q) : undefined;
  if (version === undefined) return { ok: false, code: "QUESTION_INVALID" };
  if (codingGradingMode(q.answer) !== "hiddenTests") return { ok: false, code: "QUESTION_INVALID" };
  let issues;
  try { issues = validateCodingQuestion(q); } catch { issues = [{ code: "THROW" }]; }
  if (Array.isArray(issues) && issues.length) return { ok: false, code: "QUESTION_INVALID" };
  const key = q.answer, tests = Array.isArray(key.hiddenTests) ? key.hiddenTests : [];
  const comparator = key.comparator === undefined ? DEFAULT_CODING_COMPARATOR : key.comparator;
  if (!CODING_COMPARATORS.includes(comparator) || tests.length < 1 || tests.length > CODING_TEST_LIMITS.hiddenTests) return { ok: false, code: "QUESTION_INVALID" };
  const limits = officialLimits(q.coding);
  if (!limits) return { ok: false, code: "QUESTION_INVALID" };
  let total = 0;
  const clean = [];
  for (const t of tests) {
    if (!isObj(t) || typeof t.id !== "string" || typeof t.input !== "string" || typeof t.expectedOutput !== "string") return { ok: false, code: "QUESTION_INVALID" };
    if (!(typeof t.weight === "number" && Number.isFinite(t.weight) && t.weight >= 0)) return { ok: false, code: "QUESTION_INVALID" };
    if (Buffer.byteLength(t.expectedOutput, "utf8") > limits.outputBytes) return { ok: false, code: "QUESTION_INVALID" };
    total += t.weight;
    clean.push({ id: t.id, title: typeof t.title === "string" ? t.title : "", input: t.input, expectedOutput: t.expectedOutput, weight: t.weight });
  }
  if (!(total > 0)) return { ok: false, code: "QUESTION_INVALID" };
  const allowedLanguages = Array.isArray(q.coding.allowedLanguages) ? q.coding.allowedLanguages.map(String) : [];
  // Phase 17E-A — the teacher's scoring policy (validated above: an unknown value already made the question QUESTION_INVALID)
  // Phase 17F-C2 — the teacher's compile-error policy under the question's OWN version (coding@1: "zero" only; coding@2: explicit).
  // The validator above already refused the invalid combinations; an unresolvable policy is never graded as zero (fail closed).
  const compileErrorPolicy = codingCompileErrorPolicy(key, version);
  if (compileErrorPolicy === undefined) return { ok: false, code: "QUESTION_INVALID" };
  // Phase 19F — coding@3: the validated published template is grading authority (it is part of every official source).
  const template = version === 3 ? codingTemplateOf(q) : null;
  if (version === 3 && !template) return { ok: false, code: "QUESTION_INVALID" };
  return { ok: true, version, tests: clean, comparator, limits, allowedLanguages, scoringPolicy: codingScoringPolicy(key), compileErrorPolicy, ...(template ? { template } : {}) };
}

/**
 * Phase 20D — THE target resolution: → { question, grade, rawAnswer, composite? } | { ambiguous: true } | null. A top-level target reads the
 * snapshot question, its question grade and attempt.answers[key] (unchanged); a composite child reads the CHILD node (its own marks), the
 * PART grade inside the parent's grade (a live reference: applying a result mutates the part, the canonical rebuild recomputes the parent)
 * and attempt.answers[parent].parts[part]. A linked SmartSim part, an unknown part or an invalid composite never resolves.
 */
function resolveCodingTarget(exam, attempt, targetKey) {
  const flat = flattenQuestions(exam);
  const grades = attempt && Array.isArray(attempt.questionGrades) ? attempt.questionGrades : [];
  const answers = attempt && isObj(attempt.answers) ? attempt.answers : {};
  const top = flat.find(x => x.questionId === targetKey);
  let child = null;
  const c = parseCompositeChildKey(targetKey);
  if (c) {
    const parent = flat.find(x => x.questionId === c.questionId);
    const st = parent && isCompositeQuestionNode(parent.question) ? compositeStructure(parent.question) : null;
    const part = st && st.ok ? st.model.partById.get(c.partId) : undefined;
    if (part && !part.linkedSmartSim) {
      const pg = grades.find(g => isObj(g) && String(g.questionId) === c.questionId);
      const grade = pg && Array.isArray(pg.parts) ? pg.parts.find(x => isObj(x) && String(x.partId) === c.partId) || null : null;
      const pa = answers[c.questionId];
      const rawAnswer = isObj(pa) && pa.kind === "composite" && isObj(pa.parts) && Object.prototype.hasOwnProperty.call(pa.parts, c.partId) ? pa.parts[c.partId] : undefined;
      child = { question: { ...compositeChildNode(part.raw), marks: part.marks }, grade, rawAnswer, composite: { questionId: c.questionId, partId: c.partId } };
    }
  }
  if (top && child) return { ambiguous: true };
  if (top) return { question: top.question, grade: grades.find(g => String(g.questionId) === targetKey) || null, rawAnswer: answers[targetKey] };
  return child;
}

/** The bound, non-blank code answer of a question, or null (no answer / blank / unbindable — graded 0 as "no-answer"). */
function boundAnswer(q, raw) {
  if (!raw) return null;
  // Phase 19F — coding@3: ONLY a codeTemplate answer binds; the official source = published locked text + bound gap values, rebuilt
  // HERE (never a client-sent source); an answer whose gaps are all blank is "no-answer" (the locked text alone is never an answer).
  if (codingQuestionVersion(q) === 3) {
    const t = bindCodingTemplateAnswerToQuestion(raw, q);
    if (!t.ok || !isCodeTemplateAnswered(t.answer)) return null;
    return { kind: "code", language: t.answer.language, languageVersion: t.answer.languageVersion, source: t.source };
  }
  const b = bindCodeAnswerToQuestion(raw, q);
  if (!b.ok || !String(b.answer.source).trim()) return null;
  return b.answer;
}

/**
 * The AUTHORITY of one target, recomputed from the attempt as stored and the assignment snapshot. Never reads a client value.
 * → { ok, question, grade, tests, comparator, limits, scoringPolicy, answer|null, maxMarks, questionFingerprint, answerHash, gradingKey, jobId }
 */
function targetAuthority(exam, attempt, targetKey, { assignmentId, studentId, revision }) {
  const entry = resolveCodingTarget(exam, attempt, targetKey);                                     // 20D: top-level unchanged, or a composite child
  const grade = entry && !entry.ambiguous ? entry.grade : null;
  const ids = { assignmentId: String(assignmentId), studentId: String(studentId), attemptNumber: Number(attempt.attemptNumber), submittedAt: String(attempt.submittedAt || ""), targetKey, revision };
  const jobId = officialJobId(ids), targetRef = officialTargetRef(ids);
  if (!entry || entry.ambiguous || !grade) return { ok: false, code: "QUESTION_INVALID", jobId };
  const q = entry.question, g = gradeableQuestion(q), maxMarks = effectiveMaxMarks(grade);
  if (!g.ok) return { ok: false, code: g.code, jobId };
  const answer = boundAnswer(q, entry.rawAnswer);
  const questionFingerprint = sha256(stableStringify({ v: 1, questionId: targetKey, type: "coding", questionTypeVersion: g.version, mode: "hiddenTests", comparator: g.comparator, tests: g.tests.map(t => ({ id: t.id, input: t.input, expectedOutput: t.expectedOutput, weight: t.weight })), limits: g.limits, allowedLanguages: g.allowedLanguages, maxMarks, counted: maxMarks > 0, ...(g.scoringPolicy === "allOrNothing" ? { scoringPolicy: "allOrNothing" } : {}), ...(g.version >= 2 ? { compileErrorPolicy: g.compileErrorPolicy } : {}), ...(g.version >= 3 ? { template: g.template } : {}), ...(entry.composite ? { target: { kind: "compositePart", questionId: entry.composite.questionId, partId: entry.composite.partId } } : {}) }));   // 17F-C2 RF1: coding@1 adds NO material (byte-identical, in-flight keys unchanged); coding@2 binds its explicit policy · 20D: only a composite child adds its target material
  const answerHash = sha256(answer ? stableStringify({ language: answer.language, languageVersion: answer.languageVersion, source: answer.source }) : "no-answer");
  const gradingKey = sha256(stableStringify({ v: 1, ...ids, mode: "hiddenTests", questionFingerprint, answerHash }));
  return { ok: true, question: q, grade, tests: g.tests, comparator: g.comparator, limits: g.limits, scoringPolicy: g.scoringPolicy, compileErrorPolicy: g.compileErrorPolicy, answer, maxMarks, questionFingerprint, answerHash, gradingKey, jobId, targetRef, revision };
}

function noAnswerResult(auth, revision, at) {
  return { revision, jobId: auth.jobId, engine: ENGINE, automaticScore: 0, maxMarks: auth.maxMarks, passedWeight: 0, totalWeight: auth.tests.reduce((s, t) => s + t.weight, 0), testCount: auth.tests.length, passedCount: 0, outcome: "no-answer", cases: [], completedAt: at };
}
/** Applies an automatic score to the question grade (the canonical rebuild then decides totals; an override still wins). */
function applyGrade(grade, score, fullMarks) { grade.score = score; grade.manualReview = false; grade.correct = !!fullMarks; }
/** Phase 17F-C2 — a compile error under the "manualReview" policy: automatic execution is complete, but NO authoritative automatic
 *  score is applied. The grade keeps the provisional base the submission plan wrote (score 0 while manualReview is true — counted
 *  by the canonical rebuild as marks still awaiting the teacher, never as an awarded zero); the teacher's override resolves it. */
function holdForReview(grade) { grade.score = 0; grade.manualReview = true; grade.correct = false; }

/** (Re)builds one target for `revision` from the authority. Mutates the attempt's grade for a "no-answer". Returns the target. */
function buildTarget(exam, attempt, targetKey, ids, revision, at, previous) {
  const auth = targetAuthority(exam, attempt, targetKey, { ...ids, revision });
  const t = { mode: "hiddenTests", state: "pending", revision, jobId: auth.jobId, gradingKey: auth.gradingKey || "", answerHash: auth.answerHash || "", questionFingerprint: auth.questionFingerprint || "", createdAt: previous && previous.createdAt ? previous.createdAt : at, updatedAt: at };
  if (previous && previous.result) t.result = previous.result;                               // the applied result stays until a newer one lands
  if (!auth.ok) { t.state = "retryable"; t.technicalCode = auth.code; return { target: t, changed: false }; }
  if (!auth.answer) {
    t.state = "complete"; t.result = noAnswerResult(auth, revision, at);
    applyGrade(auth.grade, 0, false);
    return { target: t, changed: true };
  }
  return { target: t, changed: false };
}

/**
 * PLAN — called INSIDE the completed-attempt CAS on the attempt about to be committed (pure: no I/O). Adds
 * attempt.codingGrading only when the attempt has at least one counted hidden-test target. Returns { dispatch: [targetKey] }.
 */
function planCodingGrading(exam, attempt, { assignmentId, studentId, now } = {}) {
  const at = now || new Date().toISOString(), targets = {}, dispatch = [];
  let changed = false;
  const grades = Array.isArray(attempt.questionGrades) ? attempt.questionGrades : [];
  for (const { question: q, questionId } of flattenQuestions(exam)) {
    if (!isCodingNode(q) || codingGradingMode(q.answer) !== "hiddenTests") continue;
    const grade = grades.find(g => String(g.questionId) === questionId);
    if (!grade || !(effectiveMaxMarks(grade) > 0)) continue;                                   // not counted (firstNAnswered): nothing to grade
    const built = buildTarget(exam, attempt, questionId, { assignmentId, studentId }, 1, at, null);
    targets[questionId] = built.target;
    changed = changed || built.changed;
    if (built.target.state === "pending") dispatch.push(questionId);
  }
  // Phase 20D — composite@1 coding children (hidden-test mode): planned only when the composite AND the part are COUNTED (an excess first-N
  // composite / part never becomes a job), under the child key; a key that would collide with a top-level id is never planned (fail closed).
  const topIds = new Set(flattenQuestions(exam).map(x => x.questionId));
  for (const { question: q, questionId } of flattenQuestions(exam)) {
    if (!isCompositeQuestionNode(q) || !isCompositeQuestionId(questionId)) continue;
    const pg = grades.find(g => String(g.questionId) === questionId);
    if (!pg || !(effectiveMaxMarks(pg) > 0) || !Array.isArray(pg.parts)) continue;
    const st = compositeStructure(q);
    if (!st.ok) continue;
    for (const grp of st.model.groups) for (const part of grp.parts) {
      if (part.type !== "coding" || codingGradingMode(isObj(part.raw.answer) ? part.raw.answer : undefined) !== "hiddenTests") continue;
      const partGrade = pg.parts.find(x => isObj(x) && String(x.partId) === part.id);
      const key = compositeChildKey(questionId, part.id);
      if (!partGrade || !(effectiveMaxMarks(partGrade) > 0) || topIds.has(key)) continue;
      const built = buildTarget(exam, attempt, key, { assignmentId, studentId }, 1, at, null);
      targets[key] = built.target;
      changed = changed || built.changed;
      if (built.target.state === "pending") dispatch.push(key);
    }
  }
  if (!Object.keys(targets).length) return { dispatch: [] };
  attempt.codingGrading = { version: 1, targets };
  if (changed) rebuildAttemptGrades(attempt);
  return { dispatch };
}

/**
 * Phase 17D-A — the teacher-facing AGGREGATE coding grading status of one attempt: { pending, retryable, stale } counts (pending
 * includes a freshly dispatched target; stale = dispatched longer than STALE_DISPATCHED_MS ago), or null when nothing is open.
 * Never a technical code, job id, grading key or recovery internals.
 */
function codingGradingStatus(attempt, nowMs = Date.now()) {
  const t = attempt && attempt.codingGrading && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets : null;
  if (!t) return null;
  const out = { pending: 0, retryable: 0, stale: 0 };
  for (const x of Object.values(t)) {
    if (!isObj(x) || isTerminalState(x.state)) continue;
    if (x.state === "retryable") out.retryable++;
    else if (x.state === "dispatched" && nowMs - (Number.isFinite(Date.parse(x.updatedAt)) ? Date.parse(x.updatedAt) : 0) > STALE_DISPATCHED_MS) out.stale++;   // no timestamp = old (as the recovery policy)
    else out.pending++;
  }
  return out.pending + out.retryable + out.stale > 0 ? out : null;
}

/**
 * Phase 17E-C — the STUDENT-SAFE aggregate of a completed attempt's official coding grading, derived ONLY from the stored targets:
 *   undefined   no hidden-test coding target (not applicable — the field is omitted);
 *   "complete"  every target complete (incl. an unanswered target graded 0 at submission);
 *   "reviewRequired" (17F-C2) every target complete but at least one compile error under the "manualReview" policy still awaits the
 *               teacher's mark (an override resolves it; the stored compile evidence stays) — the automatic part is DONE: no polling;
 *   "delayed"   every open target is retryable with automatic recovery EXHAUSTED (it stays under review; a teacher retry resets it);
 *   otherwise the most informative open state among targets still progressing automatically —
 *   "retrying" (retryable) > "processing" (dispatched, or an unrecognised state: fail safe, never "complete") > "queued" (pending).
 *   Precedence: retrying > processing > queued > delayed > reviewRequired > complete.
 * One value per attempt: never a per-question state, a technical code, a job id, a timestamp, a retry count or any evidence.
 * Independent of gradingStatus (mark finality), which stays the canonical deriveGradingStatus.
 */
function studentCodingGradingStatus(attempt) {
  const t = attempt && attempt.codingGrading && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets : null;
  if (!t) return undefined;
  let seen = false, exhausted = 0, review = 0, best = 0;              // best: 0 none · 1 queued · 2 processing · 3 retrying
  for (const [id, x] of Object.entries(t)) {
    if (!isObj(x)) continue;
    // Phase 17E-D (F3) — an OPEN target of a question the teacher has already marked manually cannot change the mark: it is
    // background evidence for the teacher only. The student never sees "automatic grading in progress" next to that mark.
    const override = overrideScoreOf(attempt, id);
    if (!isTerminalState(x.state) && override !== null) continue;
    seen = true;
    if (x.state === "complete") continue;
    if (x.state === "reviewRequired") {
      // 17F-C2 RF1 — the compile error held for the teacher: "review required" until the teacher's override lands. Corrupt / stale
      // evidence in that state is withheld as still processing (fail safe) — never counted as complete.
      if (override !== null) continue;
      if (reviewRequiredTarget(x)) review++; else best = Math.max(best, 2);
      continue;
    }
    if (x.state === "retryable" && isObj(x.recovery) && x.recovery.exhausted === true) { exhausted++; continue; }
    best = Math.max(best, x.state === "retryable" ? 3 : x.state === "pending" ? 1 : 2);
  }
  if (!seen) return undefined;
  if (best) return ["", "queued", "processing", "retrying"][best];
  if (exhausted) return "delayed";
  return review ? "reviewRequired" : "complete";
}

/** true while any official coding target of the attempt that can still change the mark has automatic execution still OPEN (a
 *  boolean, nothing else). A well-formed review-required target is NOT pending (execution is done); a corrupt one is (fail safe). */
function autoGradingPending(attempt) {
  const t = attempt && attempt.codingGrading && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets : null;
  return !!t && Object.entries(t).some(([id, x]) => x && x.state !== "complete" && !reviewRequiredTarget(x) && overrideScoreOf(attempt, id) === null);   // 17E-D F3
}
/**
 * Phase 17F-C2 (Review Fix 1) — the PUBLIC legacy field `autoGradingPending` of the student projections (student-submission,
 * student-dashboard): historically "automatic grading still open"; for OLDER clients it is the SCORE-WITHHOLD compatibility bit.
 * A pre-C2 (B1) client does not know the word "reviewRequired" and falls back to this boolean, so it must be true while a compile
 * error awaits the teacher — otherwise a cached browser would render the provisional "0 / 30". ONE helper for both endpoints.
 * The modern client never polls from it (it polls from autoGradingStatus only).
 */
function legacyAutoGradingWithhold(attempt) {
  return autoGradingPending(attempt) || studentCodingGradingStatus(attempt) === "reviewRequired";
}

// ── Dispatch ───────────────────────────────────────────────────────────────────────────────────────────────────────────
async function readBounded(res, maxBytes) {
  if (!res.body || typeof res.body.getReader !== "function") { const text = await res.text(); return Buffer.byteLength(text, "utf8") > maxBytes ? "" : text; }
  const reader = res.body.getReader(), parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } return ""; }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts).toString("utf8");
}

/** Sends ONE signed official job to the runner. → { state: "dispatched" } | { state: "retryable", technicalCode }. Never throws. */
async function dispatchOfficialJob(job, deps = {}) {
  const env = deps.env || process.env;
  const config = readCodingRunnerConfig(env);
  // Phase 17D-A — the callback key must also be SEPARATED from the runner request key (Review Fix 1 resolver): with equal keys
  // nothing is sent (a result could not be authenticated anyway) and the target stays retryable.
  if (!config.enabled || !resolveCallbackKey(env)) return { state: "retryable", technicalCode: "EXECUTION_UNAVAILABLE", errorClass: "config" };
  const fetchImpl = deps.fetch || globalThis.fetch, now = deps.now || Date.now;
  const bodyText = JSON.stringify(job), body = Buffer.from(bodyText, "utf8");
  const requestId = "og_" + crypto.randomBytes(12).toString("hex");
  const headers = { ...signRunnerRequest({ key: config.key, method: "POST", path: OFFICIAL_PATH, timestamp: String(Math.floor(now() / 1000)), requestId, body }), "content-type": "application/json" };
  let res;
  try { res = await fetchImpl(config.baseUrl + OFFICIAL_PATH, { method: "POST", headers, body: bodyText, redirect: "error", signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS) }); }
  catch { return { state: "retryable", technicalCode: "EXECUTION_FAILED", errorClass: "network" }; }
  let json = null;
  try { json = JSON.parse(await readBounded(res, DISPATCH_RESPONSE_MAX_BYTES)); } catch { json = null; }
  if (res.status === 202 && json && json.ok === true && json.accepted === true) return { state: "dispatched", duplicate: json.duplicate === true };
  const code = json && typeof json.code === "string" ? json.code : "";
  if (res.status === 409 && (code === "JOB_ID_CONFLICT" || code === "STALE_REVISION")) return { state: "retryable", technicalCode: code, errorClass: "conflict" };
  if (res.status === 503 && code === "RUNNER_BUSY") return { state: "retryable", technicalCode: code, errorClass: "busy" };
  if (res.status === 503 && code === "GRADING_UNAVAILABLE") return { state: "retryable", technicalCode: code, errorClass: "unavailable" };
  if (res.status === 422 && code === "LANGUAGE_UNAVAILABLE") return { state: "retryable", technicalCode: "LANGUAGE_UNAVAILABLE", errorClass: "unavailable" };
  if (res.status === 401) return { state: "retryable", technicalCode: "RUNNER_UNAUTHORIZED", errorClass: "auth" };
  return { state: "retryable", technicalCode: "EXECUTION_FAILED", errorClass: "protocol" };
}

/** The ONE runner request of a target: identifiers-free (opaque job id + case tokens), no expected output / weight / title / marks. */
function buildOfficialRunnerJob(auth, jobId) {
  return { jobId, language: auth.answer.language, languageVersion: auth.answer.languageVersion, source: auth.answer.source, cases: auth.tests.map((t, i) => ({ token: officialCaseToken(i), stdin: t.input })), limits: { timeMs: auth.limits.timeMs, memoryMb: auth.limits.memoryMb, outputBytes: auth.limits.outputBytes }, revision: auth.revision, targetRef: auth.targetRef };
}

const io = deps => ({ dl: deps.downloadJsonOrNull || storage.downloadJsonOrNull, mut: deps.mutateJsonWithRetry || storage.mutateJsonWithRetry, audit: deps.recordAuditEvent || recordAuditEvent });
const STOP = Symbol("stop");
/** CAS on the submission that changes ONE target only if it is still the expected (revision, job) and not complete. */
async function updateTarget(container, ids, targetKey, expect, patch, deps) {
  const { mut } = io(deps);
  let applied = false;
  try {
    await mut(container, SP + ids.assignmentId + "/" + ids.studentId + ".json", current => {
      applied = false;
      const attempt = current && Array.isArray(current.attempts) ? current.attempts.find(x => Number(x.attemptNumber) === Number(ids.attemptNumber)) : null;
      const t = attempt && attempt.codingGrading && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets[targetKey] : null;
      if (!t || t.revision !== expect.revision || t.jobId !== expect.jobId || isTerminalState(t.state)) throw STOP;
      Object.assign(t, patch);
      if (patch.state !== "retryable") delete t.technicalCode;
      applied = true;
      return current;
    });
  } catch (e) { if (e !== STOP) throw e; }
  return applied;
}
/**
 * Phase 17D-A — CAS on the submission that lets `fn(target, attempt)` change ONE target only while it is still the expected
 * (revision, job) and not complete; `fn` returns false to abort without a write. → true when the change was written.
 */
async function mutateTarget(container, ids, targetKey, expect, fn, deps) {
  const { mut } = io(deps);
  let applied = false;
  try {
    await mut(container, SP + ids.assignmentId + "/" + ids.studentId + ".json", current => {
      applied = false;
      const attempt = current && Array.isArray(current.attempts) ? current.attempts.find(x => Number(x.attemptNumber) === Number(ids.attemptNumber)) : null;
      const t = attempt && attempt.codingGrading && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets[targetKey] : null;
      if (!t || t.revision !== expect.revision || t.jobId !== expect.jobId || isTerminalState(t.state)) throw STOP;
      if (fn(t, attempt) === false) throw STOP;
      applied = true;
      return current;
    });
  } catch (e) { if (e !== STOP) throw e; }
  return applied;
}
/** The recovery metadata after a TEACHER action (retry / bulk retry): automatic backoff and exhaustion start over. */
const manualRecovery = deps => ({ automaticAttempts: 0, exhausted: false, manualRetryAt: nowIso(deps) });
async function setJobState(container, jobId, revision, state, extra, deps) {
  const { mut } = io(deps);
  try {
    await mut(container, jobName(jobId), cur => {
      if (!cur || cur.jobId !== jobId || cur.revision !== revision || cur.state === "complete" || cur.state === "superseded") throw STOP;
      cur.state = state; cur.updatedAt = nowIso(deps);
      if (extra && extra.technicalCode) cur.technicalCode = extra.technicalCode; else delete cur.technicalCode;
      return cur;
    });
  } catch (e) { if (e !== STOP) throw e; }
}

// ── Phase 17D-B2 delivery lease ───────────────────────────────────────────────────────────────────────────────────────
const timeOf = v => { const t = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : 0; };
const leaseHeld = (d, nowMs) => isObj(d) && typeof d.leaseOwner === "string" && d.leaseOwner !== "" && timeOf(d.leaseExpiresAt) > nowMs && timeOf(d.leaseExpiresAt) - nowMs <= DELIVERY_LEASE.maxFutureMs;
/**
 * CLAIMS the delivery of one job (ETag CAS on its job record, creating it when absent): refused while another dispatcher holds an
 * unexpired lease, or when the job is complete / superseded. → { ok: true, attempt } | { ok: false, reason: "leased" | "terminal" }
 */
async function claimDelivery(container, seed, owner, nowMs) {
  const at = new Date(nowMs).toISOString();
  for (let i = 0; i < DELIVERY_LEASE.claimAttempts; i++) {
    const { value, etag } = await storage.downloadJsonWithEtagOrNull(container, jobName(seed.jobId));
    const cur = isObj(value) && value.jobId === seed.jobId ? value : null;
    if (cur && (cur.state === "complete" || cur.state === "superseded" || cur.revision !== seed.revision)) return { ok: false, reason: "terminal" };
    const d = cur && isObj(cur.delivery) ? cur.delivery : {};
    if (leaseHeld(d, nowMs)) return { ok: false, reason: "leased" };
    const next = cur ? { ...cur } : { schemaVersion: 1, jobId: seed.jobId, assignmentId: seed.assignmentId, studentId: seed.studentId, attemptNumber: seed.attemptNumber, targetKey: seed.targetKey, revision: seed.revision, gradingKey: seed.gradingKey, state: "pending", dispatchCount: 0, createdAt: at };
    next.gradingKey = seed.gradingKey; next.updatedAt = at; next.dispatchCount = (Number(next.dispatchCount) || 0) + 1;
    if (next.state !== "complete") next.state = "pending";
    const attemptNo = (Number.isInteger(d.attempt) && d.attempt >= 0 ? d.attempt : 0) + 1;
    next.delivery = { state: "delivering", attempt: attemptNo, leaseOwner: owner, leaseExpiresAt: new Date(nowMs + DELIVERY_LEASE.ttlMs).toISOString(), claimedAt: at, lastDeliveryAt: typeof d.lastDeliveryAt === "string" ? d.lastDeliveryAt : null, lastDeliveryCode: typeof d.lastDeliveryCode === "string" ? d.lastDeliveryCode : null, lastDeliveryErrorClass: typeof d.lastDeliveryErrorClass === "string" ? d.lastDeliveryErrorClass : null };
    try { await storage.uploadJsonConditional(container, jobName(seed.jobId), next, etag || null); return { ok: true, attempt: attemptNo }; }
    catch (e) { if (!storage.isConcurrencyConflict(e)) throw e; }                       // another dispatcher wrote first: re-read
  }
  return { ok: false, reason: "leased" };
}
/** Releases the lease with the delivery outcome — only while this dispatcher still owns it (an expired lease is simply gone). */
async function releaseDelivery(container, jobId, owner, outcome, deps) {
  const { mut } = io(deps);
  try {
    await mut(container, jobName(jobId), cur => {
      if (!cur || !isObj(cur.delivery) || cur.delivery.leaseOwner !== owner) throw STOP;
      const ok = outcome.state === "dispatched";
      cur.delivery = { ...cur.delivery, state: ok ? "received" : "failed", leaseOwner: null, leaseExpiresAt: null, lastDeliveryAt: nowIso(deps), lastDeliveryCode: ok ? (outcome.duplicate ? "DUPLICATE" : "ACCEPTED") : String(outcome.technicalCode || "EXECUTION_FAILED"), lastDeliveryErrorClass: ok ? null : String(outcome.errorClass || "unknown") };
      return cur;
    });
  } catch (e) { if (e !== STOP) throw e; }
}

async function dispatchTarget(container, assignment, ids, attempt, targetKey, target, deps, obs) {
  const { audit } = io(deps);
  const expect = { revision: target.revision, jobId: target.jobId };
  const auth = targetAuthority(assignment.examSnapshot, attempt, targetKey, { ...ids, revision: target.revision });
  let outcome;
  if (!auth.ok || auth.gradingKey !== target.gradingKey || auth.jobId !== target.jobId || !auth.answer) {
    outcome = { state: "retryable", technicalCode: auth.ok ? "AUTHORITY_CHANGED" : auth.code };
  } else {
    // Phase 17D-B2 — the job record (identifiers + state only) exists BEFORE the runner can call back, and the delivery is
    // CLAIMED on it first: a concurrent dispatcher (any instance, any path) holding an unexpired lease means "already being sent".
    const owner = "dl_" + crypto.randomBytes(12).toString("hex");
    const claim = await claimDelivery(container, { jobId: target.jobId, assignmentId: ids.assignmentId, studentId: ids.studentId, attemptNumber: Number(ids.attemptNumber), targetKey, revision: target.revision, gradingKey: target.gradingKey }, owner, deps.now ? deps.now() : Date.now());
    if (!claim.ok) {
      obs?.logInfo?.("coding.runner.delivery.duplicate", { jobId: target.jobId, revision: target.revision, reason: claim.reason });
      return { targetKey, jobId: target.jobId, revision: target.revision, state: target.state, applied: false, deliverySkipped: claim.reason };
    }
    obs?.logInfo?.("coding.runner.delivery.claimed", { jobId: target.jobId, revision: target.revision, attempt: claim.attempt });
    outcome = await dispatchOfficialJob(buildOfficialRunnerJob(auth, target.jobId), deps);   // OUTSIDE every storage mutation
    try { await releaseDelivery(container, target.jobId, owner, outcome, deps); }
    catch { obs?.logWarn?.("coding.runner.delivery.release.failed", { jobId: target.jobId, revision: target.revision }); }   // the lease expires on its own
  }
  const patch = { state: outcome.state, updatedAt: nowIso(deps), ...(outcome.technicalCode ? { technicalCode: outcome.technicalCode } : {}) };
  const applied = await updateTarget(container, ids, targetKey, expect, patch, deps);
  if (auth.ok && auth.answer) await setJobState(container, target.jobId, target.revision, outcome.state, outcome, deps);
  const fields = { jobId: target.jobId, revision: target.revision, state: outcome.state, ...(outcome.technicalCode ? { technicalCode: outcome.technicalCode } : {}), ...(outcome.duplicate ? { duplicate: true } : {}) };
  if (outcome.state === "dispatched") obs?.logInfo?.("coding.autoGrade.dispatched", fields);
  else obs?.logWarn?.("coding.autoGrade.retryable", fields);
  if (applied) await audit(container, { actor: SYSTEM_ACTOR, action: outcome.state === "dispatched" ? "coding.autoGrade.dispatched" : "coding.autoGrade.retryable", targetType: "student", targetId: ids.studentId, targetLabel: "", details: { assignmentId: ids.assignmentId, attemptNumber: Number(ids.attemptNumber), questionId: targetKey, revision: target.revision, state: outcome.state, ...(outcome.technicalCode ? { technicalCode: outcome.technicalCode } : {}) } });
  return { targetKey, ...fields, applied };
}

/**
 * Dispatches the attempt's targets whose state is in `opts.states` (default pending + retryable). Re-reads the authoritative
 * attempt + snapshot; idempotent (same revision → same job id, the runner dedupes). Never throws for a runner / storage failure
 * of an individual target (the target simply stays pending / retryable). → [{ targetKey, jobId, revision, state, ... }]
 * Phase 17D-A: `opts.expect` = { revision, jobId } binds the call to ONE known revision — a target that has moved on (force
 * regrade) is skipped, so a recovery decided on an older read can never dispatch a different revision.
 */
async function ensureCodingGradingJobs(container, { assignmentId, studentId, attemptNumber }, deps = {}, opts = {}) {
  const { dl } = io(deps), obs = opts.obs || null;
  const states = Array.isArray(opts.states) ? opts.states : ["pending", "retryable"];
  const ids = { assignmentId: String(assignmentId), studentId: String(studentId), attemptNumber: Number(attemptNumber) };
  const assignment = await dl(container, AP + ids.assignmentId + ".json");
  const sub = await dl(container, SP + ids.assignmentId + "/" + ids.studentId + ".json");
  const attempt = assignment && sub && Array.isArray(sub.attempts) ? sub.attempts.find(x => Number(x.attemptNumber) === ids.attemptNumber) : null;
  const targets = attempt && attempt.codingGrading && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets : {};
  const out = [];
  for (const [key, t] of Object.entries(targets)) {
    if (!t || !states.includes(t.state) || (Array.isArray(opts.targets) && !opts.targets.includes(key))) continue;
    if (opts.expect && (t.revision !== opts.expect.revision || t.jobId !== opts.expect.jobId)) continue;
    try { out.push(await dispatchTarget(container, assignment, ids, attempt, key, t, deps, obs)); }
    catch { obs?.logWarn?.("coding.autoGrade.dispatch.failed", { jobId: t.jobId, revision: t.revision }); out.push({ targetKey: key, jobId: t.jobId, revision: t.revision, state: t.state, applied: false }); }
  }
  return out;
}

/** Post-commit hook for the completed-attempt writers: dispatch the planned targets; NEVER fails the caller. */
async function dispatchPlannedGrading(container, ids, plan, deps = {}, obs = null) {
  if (!plan || !Array.isArray(plan.dispatch) || !plan.dispatch.length) return [];
  try { return await ensureCodingGradingJobs(container, ids, deps, { obs, targets: plan.dispatch, states: ["pending"] }); }
  catch { obs?.logWarn?.("coding.autoGrade.dispatch.failed", { targets: plan.dispatch.length }); return []; }
}

// ── Teacher retry / force regrade ──────────────────────────────────────────────────────────────────────────────────────
/** retry: re-dispatch the SAME revision (pending / dispatched / retryable). force: a NEW revision from the current authority. */
async function regradeTarget(container, { assignmentId, studentId, attemptNumber, questionId, action, actor }, deps = {}, obs = null) {
  const { dl, mut, audit } = io(deps);
  const ids = { assignmentId: String(assignmentId), studentId: String(studentId), attemptNumber: Number(attemptNumber) };
  const assignment = await dl(container, AP + ids.assignmentId + ".json");
  const sub = assignment ? await dl(container, SP + ids.assignmentId + "/" + ids.studentId + ".json") : null;
  const attempt = sub && Array.isArray(sub.attempts) ? sub.attempts.find(x => Number(x.attemptNumber) === ids.attemptNumber) : null;
  const target = attempt && attempt.codingGrading && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets[questionId] : null;
  if (!isObj(target)) return { status: 404, code: "NOT_FOUND" };
  // Phase 17E-D — the PUBLISHED snapshot question is the authority for whether this target may be graded at all: a question that
  // is (no longer) an official hidden-test coding question is not found; a version this server cannot validate is refused.
  const entry = resolveCodingTarget(assignment.examSnapshot, attempt, questionId);                 // 20D: top-level unchanged, or a composite child
  if (!entry || entry.ambiguous || !isCodingNode(entry.question) || codingGradingMode(entry.question.answer) !== "hiddenTests") return { status: 404, code: "NOT_FOUND" };
  if (codingQuestionVersion(entry.question) === undefined) return { status: 409, code: "QUESTION_UNSUPPORTED" };
  if (action === "retry") {
    // a terminal target (complete, or complete evidence awaiting the teacher) is not technical retryable work; force regrade stays available
    if (isTerminalState(target.state)) return { status: 409, code: "ALREADY_COMPLETE" };
    // Phase 17D-A — a teacher retry resets automatic backoff / exhaustion (same revision, job id and grading key).
    if (target.recovery) await mutateTarget(container, ids, questionId, { revision: target.revision, jobId: target.jobId }, t => { t.recovery = manualRecovery(deps); }, deps);
    const r = await ensureCodingGradingJobs(container, ids, deps, { obs, targets: [questionId], states: ACTIVE_STATES });
    const t = r[0] || { state: target.state, revision: target.revision };
    // Phase 17E-D — a teacher retry is audited like a force regrade (identifiers + mode only; never source / tests / outputs).
    await audit(container, { actor: String(actor || "builder"), action: "coding.autoGrade.retryRequested", targetType: "student", targetId: ids.studentId, targetLabel: "", details: { assignmentId: ids.assignmentId, attemptNumber: ids.attemptNumber, questionId, revision: target.revision, mode: "retry" } });
    return { status: 200, state: t.state, revision: t.revision };
  }
  // force — a new revision; the previously applied result stays visible until the new revision completes
  let next = null, previousJobId = null, becameFinal = false;
  try {
    await mut(container, SP + ids.assignmentId + "/" + ids.studentId + ".json", current => {
      const att = current && Array.isArray(current.attempts) ? current.attempts.find(x => Number(x.attemptNumber) === ids.attemptNumber) : null;
      const t = att && att.codingGrading && isObj(att.codingGrading.targets) ? att.codingGrading.targets[questionId] : null;
      if (!t) throw STOP;
      const wasFinal = !!att.finalized, at = nowIso(deps);
      previousJobId = t.jobId;
      const built = buildTarget(assignment.examSnapshot, att, questionId, ids, (Number(t.revision) || 1) + 1, at, t);
      att.codingGrading.targets[questionId] = built.target;
      if (built.changed) rebuildAttemptGrades(att);
      becameFinal = !wasFinal && !!att.finalized;
      next = built.target; current.updatedAt = at;
      return current;
    });
  } catch (e) { if (e === STOP) return { status: 404, code: "NOT_FOUND" }; throw e; }
  if (previousJobId && previousJobId !== next.jobId) {
    try { await mut(container, jobName(previousJobId), cur => { if (!cur || cur.state === "superseded") throw STOP; cur.state = "superseded"; cur.updatedAt = nowIso(deps); return cur; }); }
    catch (e) { if (e !== STOP) throw e; }
  }
  await audit(container, { actor: String(actor || "builder"), action: "coding.autoGrade.regraded", targetType: "student", targetId: ids.studentId, targetLabel: "", details: { assignmentId: ids.assignmentId, attemptNumber: ids.attemptNumber, questionId, revision: next.revision, mode: "force" } });
  obs?.logInfo?.("coding.autoGrade.regraded", { jobId: next.jobId, revision: next.revision, state: next.state });
  if (becameFinal) await finalSideEffects(container, assignment, ids, deps, obs);
  if (next.state !== "pending") return { status: 200, state: next.state, revision: next.revision };
  const r = await ensureCodingGradingJobs(container, ids, deps, { obs, targets: [questionId], states: ["pending"] });
  return { status: 200, state: r[0] ? r[0].state : next.state, revision: next.revision };
}

// ── Callback application ───────────────────────────────────────────────────────────────────────────────────────────────
const CALLBACK_KEYS = new Set(["jobId", "outcome", "technicalCode", "compile", "cases"]);
const COMPILE_KEYS = new Set(["status", "stderr", "durationMs"]);
const CASE_KEYS = new Set(["token", "status", "stdout", "stderr", "exitCode", "durationMs"]);
const CASE_STATUSES = new Set(["success", "runtime-error", "timeout", "output-limit", "internal-error"]);
const TOKEN = /^c[0-9]{2}$/;
const bytes = s => Buffer.byteLength(s, "utf8");
const okNumber = v => v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 3600000);
const okExit = v => v === undefined || (Number.isInteger(v) && v >= -255 && v <= 1024);

/** Strict structural validation of a callback body (raw evidence only; a score / verdict / unknown field is refused). */
function validateCallbackBody(b) {
  if (!isObj(b) || Object.getPrototypeOf(b) !== Object.prototype) return false;
  for (const k of Object.keys(b)) if (!CALLBACK_KEYS.has(k)) return false;
  if (typeof b.jobId !== "string" || !JOB_ID.test(b.jobId)) return false;
  if (b.outcome !== "completed" && b.outcome !== "failed") return false;
  if (b.technicalCode !== undefined && (typeof b.technicalCode !== "string" || !TECH_CODE.test(b.technicalCode))) return false;
  if (!Array.isArray(b.cases) || b.cases.length > CODING_TEST_LIMITS.hiddenTests) return false;
  if (b.compile !== undefined) {
    const c = b.compile;
    if (!isObj(c)) return false;
    for (const k of Object.keys(c)) if (!COMPILE_KEYS.has(k)) return false;
    if (c.status !== "compiled" && c.status !== "compile-error") return false;
    if (c.stderr !== undefined && (typeof c.stderr !== "string" || bytes(c.stderr) > OFFICIAL_COMPILE_STDERR_BYTES)) return false;
    if (!okNumber(c.durationMs)) return false;
  }
  for (const c of b.cases) {
    if (!isObj(c)) return false;
    for (const k of Object.keys(c)) if (!CASE_KEYS.has(k)) return false;
    if (typeof c.token !== "string" || !TOKEN.test(c.token) || !CASE_STATUSES.has(c.status)) return false;
    if (typeof c.stdout !== "string" || bytes(c.stdout) > OFFICIAL_STDOUT_CAPTURE_BYTES) return false;
    if (typeof c.stderr !== "string" || bytes(c.stderr) > OFFICIAL_STDERR_CAPTURE_BYTES) return false;
    if (!okExit(c.exitCode) || !okNumber(c.durationMs)) return false;
  }
  return true;
}

async function finalSideEffects(container, assignment, ids, deps, obs) {
  const { dl } = io(deps);
  try {
    const sub = await dl(container, SP + ids.assignmentId + "/" + ids.studentId + ".json");
    const attempt = sub && Array.isArray(sub.attempts) ? sub.attempts.find(x => Number(x.attemptNumber) === Number(ids.attemptNumber)) : null;
    if (!attempt || !attempt.finalized) return;
    const student = await dl(container, UP + ids.studentId + ".json");
    // Phase 6D event reused: ONE automatic "reviewed" notification per attempt (deterministic dedupe key).
    await (deps.recordEventSafely || recordEventSafely)(container, { scope: "student", studentId: ids.studentId, type: "assignment_reviewed", dedupeKey: "coding-autograde-final:" + ids.assignmentId + ":" + ids.attemptNumber, data: { assignmentId: ids.assignmentId, assignmentTitle: assignment.title, attemptNumber: Number(ids.attemptNumber), becameFinal: true, scoreChanged: true, feedbackChanged: false, finalized: true, percentage: attempt.percentage, automatic: true } }, deps, obs);
    // Achievement records are create-only (idempotent per assignment + student).
    if (student) await (deps.recordAchievementIfEligible || recordAchievementIfEligible)(container, { classId: assignment.classId, studentId: ids.studentId, studentDisplayName: student.displayName, assignmentId: ids.assignmentId, assignmentTitle: assignment.title, percentage: attempt.percentage, shareAchievements: student.shareAchievements });
  } catch { obs?.logWarn?.("coding.autoGrade.sideEffects.failed", { attemptNumber: Number(ids.attemptNumber) }); }
}

/**
 * Applies ONE authenticated, structurally valid callback. → { status, body }:
 *   200 { applied: true, state }      complete (scored) or retryable (technical — never a zero)
 *   200 { alreadyApplied: true }      the same job's result is already applied (no write)
 *   404 UNKNOWN_JOB                   no job record (nothing written)
 *   409 STALE_RESULT                  superseded revision / different job / the authority changed since dispatch (no write)
 */
async function applyOfficialCallback(container, body, deps = {}, obs = null) {
  const { dl, mut, audit } = io(deps);
  const job = await dl(container, jobName(body.jobId));
  if (!job || job.jobId !== body.jobId) return { status: 404, body: { ok: false, code: "UNKNOWN_JOB" } };
  const ids = { assignmentId: String(job.assignmentId), studentId: String(job.studentId), attemptNumber: Number(job.attemptNumber) };
  const assignment = await dl(container, AP + ids.assignmentId + ".json");
  if (!assignment) return { status: 409, body: { ok: false, code: "STALE_RESULT" } };
  let outcome = null;
  try {
    await mut(container, SP + ids.assignmentId + "/" + ids.studentId + ".json", current => {
      outcome = null;
      const attempt = current && Array.isArray(current.attempts) ? current.attempts.find(x => Number(x.attemptNumber) === ids.attemptNumber) : null;
      const target = attempt && attempt.codingGrading && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets[job.targetKey] : null;
      if (!target || target.jobId !== body.jobId || target.revision !== job.revision) { outcome = { kind: "stale" }; throw STOP; }
      if (isTerminalState(target.state) && target.result && target.result.jobId === body.jobId) { outcome = { kind: "already" }; throw STOP; }
      const auth = targetAuthority(assignment.examSnapshot, attempt, job.targetKey, { ...ids, revision: target.revision });
      if (!auth.ok || !auth.answer || auth.gradingKey !== target.gradingKey || job.gradingKey !== target.gradingKey) { outcome = { kind: "stale" }; throw STOP; }
      const at = nowIso(deps), wasFinal = !!attempt.finalized;
      const ev = body.outcome === "failed"
        ? { kind: "technical", code: typeof body.technicalCode === "string" ? body.technicalCode : "RUNNER_FAILED" }
        : evaluateOfficialCodingRun({ tests: auth.tests, comparator: auth.comparator, run: { ...(body.compile ? { compile: body.compile } : {}), cases: body.cases } });
      if (ev.kind === "technical") {
        target.state = "retryable"; target.technicalCode = ev.code; target.updatedAt = at;
        outcome = { kind: "retryable", code: ev.code };
      } else {
        // Phase 17E-A — the question's scoring policy decides the mark (proportional = the 17C rule; allOrNothing = all cases pass)
        const allOrNothing = auth.scoringPolicy === "allOrNothing";
        // Phase 17F-C2 — a REAL compile error (the runner's structural verdict) under the teacher's "manualReview" policy is complete
        // evidence that requires the teacher's mark: no automatic score is computed or stored, the grade stays under review.
        const reviewRequired = ev.compileError && auth.compileErrorPolicy === "manualReview";
        const automaticScore = reviewRequired ? null : officialCodingScoreFor(auth.scoringPolicy, auth.maxMarks, ev);
        target.result = { revision: target.revision, jobId: body.jobId, engine: ENGINE, ...(reviewRequired ? { reviewRequired: true } : { automaticScore }), maxMarks: auth.maxMarks, passedWeight: ev.passedWeight, totalWeight: ev.totalWeight, testCount: ev.testCount, passedCount: ev.passedCount, ...(allOrNothing ? { scoringPolicy: "allOrNothing" } : {}), outcome: ev.compileError ? "compile-error" : "graded", ...(ev.compilePreview !== undefined ? { compilePreview: ev.compilePreview } : {}), cases: ev.cases.map(c => ({ testId: c.testId, status: c.status, passed: c.passed, ...(c.durationMs !== undefined ? { durationMs: c.durationMs } : {}), ...(c.actualPreview !== undefined ? { actualPreview: c.actualPreview } : {}), ...(c.stderrPreview !== undefined ? { stderrPreview: c.stderrPreview } : {}) })), completedAt: at };
        // RF1-C — its OWN terminal state: the Runner job is acknowledged complete, the SmartAssess target awaits the teacher
        target.state = reviewRequired ? "reviewRequired" : "complete"; delete target.technicalCode; target.updatedAt = at;
        if (reviewRequired) holdForReview(auth.grade);
        else applyGrade(auth.grade, automaticScore, allOrNothing ? !ev.compileError && ev.passedCount === ev.testCount : !ev.compileError && ev.passedWeight >= ev.totalWeight);
        rebuildAttemptGrades(attempt);                                                      // the ONE canonical rebuild; an override still wins
        outcome = { kind: "complete", targetState: target.state, becameFinal: !wasFinal && !!attempt.finalized, outcome: target.result.outcome, ...(reviewRequired ? { reviewRequired: true } : {}), passedCount: ev.passedCount, testCount: ev.testCount };
      }
      current.updatedAt = at;
      return current;
    });
  } catch (e) { if (e !== STOP) throw e; }
  if (!outcome || outcome.kind === "stale") { obs?.logWarn?.("coding.autoGrade.callback.stale", { jobId: body.jobId, revision: job.revision }); return { status: 409, body: { ok: false, code: "STALE_RESULT" } }; }
  if (outcome.kind === "already") { obs?.logInfo?.("coding.autoGrade.callback.duplicate", { jobId: body.jobId, revision: job.revision }); return { status: 200, body: { ok: true, alreadyApplied: true } }; }
  const state = outcome.kind === "complete" ? "complete" : "retryable";
  await setJobState(container, job.jobId, job.revision, state, outcome.kind === "retryable" ? { technicalCode: outcome.code } : null, deps);
  await audit(container, { actor: SYSTEM_ACTOR, action: state === "complete" ? "coding.autoGrade.completed" : "coding.autoGrade.retryable", targetType: "student", targetId: ids.studentId, targetLabel: "", details: { assignmentId: ids.assignmentId, attemptNumber: ids.attemptNumber, questionId: job.targetKey, revision: job.revision, state: outcome.kind === "complete" ? outcome.targetState : state, ...(outcome.kind === "retryable" ? { technicalCode: outcome.code } : { outcome: outcome.outcome, ...(outcome.reviewRequired ? { reviewRequired: true } : {}), passedCount: outcome.passedCount, testCount: outcome.testCount }) } });
  obs?.logInfo?.("coding.autoGrade.callback.applied", { jobId: body.jobId, revision: job.revision, state, ...(outcome.kind === "retryable" ? { technicalCode: outcome.code } : { outcome: outcome.outcome, ...(outcome.reviewRequired ? { reviewRequired: true } : {}), becameFinal: outcome.becameFinal }) });
  if (outcome.kind === "complete" && outcome.becameFinal) await finalSideEffects(container, assignment, ids, deps, obs);
  return { status: 200, body: { ok: true, applied: true, state } };
}

// ── Phase 17E-D teacher evidence ───────────────────────────────────────────────────────────────────────────────────────
// ONE teacher-safe projection of the official grading evidence of one coding question (it replaces the ad-hoc 17C view). It is
// built FIELD BY FIELD from the published snapshot question (tests, titles, expected outputs, weights, comparator, scoring policy
// — never the mutable Builder copy) and the stored completed attempt (target state / revision, the applied result, the bound
// answer, the canonical question grade and the manual override). It never spreads a stored object, so job ids, grading keys,
// answer hashes, question fingerprints, target refs, delivery / lease / recovery internals and the result's job id / engine can
// never leak through it. Every string is re-bounded (official preview caps) and every number re-validated: corrupt stored data
// degrades to `incomplete: true`, never to a crash or an unbounded payload. Cases are correlated by the stable server test id in
// SNAPSHOT order; an unknown id in the stored result is ignored, a missing one is "not-run" — nothing is fabricated.
const EVIDENCE_CONTRACT = 1;
const TITLE_MAX_BYTES = 256;
const CASE_OUTCOMES = new Set(["runtime-error", "timeout", "output-limit", "compile-error"]);
const RESULT_OUTCOMES = new Set(["graded", "no-answer", "compile-error"]);
function prefixBytes(s, maxBytes) {
  if (Buffer.byteLength(s, "utf8") <= maxBytes) return s;
  let end = 0, used = 0;
  while (end < s.length) {
    const cp = s.codePointAt(end), w = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (used + w > maxBytes) break;
    used += w; end += cp > 0xffff ? 2 : 1;
  }
  return s.slice(0, end);
}
const finiteNonNeg = v => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const countOf = v => (Number.isInteger(v) && v >= 0 ? v : null);
const isoOrNull = v => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null);
/** The score of a VALID manual teacher override of question `id` (the same rule as the canonical rebuild), or null. */
function directOverrideScore(attempt, id) {
  const o = attempt && isObj(attempt.manualOverrides) ? attempt.manualOverrides[id] : null;
  if (!isObj(o) || o.score === undefined || o.score === null) return null;
  const n = Number(o.score);
  return Number.isFinite(n) ? n : null;
}
/** Phase 20D — for a composite child target the part's own override wins, and a whole-question override of its COMPOSITE parent supersedes
 *  the child too (the canonical rebuild applies it over every part). A top-level id keeps the exact original rule. */
function overrideScoreOf(attempt, id) {
  const own = directOverrideScore(attempt, id);
  if (own !== null) return own;
  const c = parseCompositeChildKey(id);
  if (!c) return null;
  const pg = attempt && Array.isArray(attempt.questionGrades) ? attempt.questionGrades.find(g => isObj(g) && String(g.questionId) === c.questionId) : null;
  return pg && isObj(pg.composite) ? directOverrideScore(attempt, c.questionId) : null;
}
/** The automatic grading PHASE of one stored target: queued | processing | retrying | delayed | complete | unknown (fail safe). */
function automaticPhase(t) {
  if (!isObj(t)) return "unknown";
  if (t.state === "complete") return isObj(t.result) && Number.isInteger(t.result.revision) && t.result.revision === t.revision ? "complete" : "unknown";
  if (t.state === "reviewRequired") return reviewRequiredTarget(t) ? "complete" : "unknown";   // execution complete, teacher review required
  if (t.state === "pending") return "queued";
  if (t.state === "dispatched") return "processing";
  if (t.state === "retryable") return isObj(t.recovery) && t.recovery.exhausted === true ? "delayed" : "retrying";
  return "unknown";
}
/** Teacher-safe recovery classification (never counters, timestamps, leases or scheduler internals). */
function recoveryState(t, phase) {
  if (phase === "complete" || !isObj(t) || !isObj(t.recovery)) return "none";
  const rec = t.recovery;
  if (rec.exhausted === true) return "delayed";
  const manual = Date.parse(rec.manualRetryAt), auto = Date.parse(rec.lastAutomaticAttemptAt);
  if (Number.isFinite(manual) && (!Number.isFinite(auto) || manual >= auto)) return "manual";
  return Number.isInteger(rec.automaticAttempts) && rec.automaticAttempts > 0 ? "automatic" : "none";
}

/**
 * The ONE teacher evidence projection of question `{ questionId, node }` (node = the PUBLISHED snapshot question) for a stored
 * completed attempt, or null when there is no official automatic grading for it (non-coding, manual mode, no target).
 */
function teacherCodingEvidence(question, attempt) {
  const id = question && question.questionId, q = question && question.node;
  if (!isCodingNode(q) || codingGradingMode(q.answer) !== "hiddenTests") return null;
  const t = attempt && attempt.codingGrading && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets[id] : null;
  if (t === null || t === undefined) return null;
  let incomplete = !isObj(t);
  const key = isObj(q.answer) ? q.answer : {};
  const unsupported = codingQuestionVersion(q) === undefined;
  const tests = (Array.isArray(key.hiddenTests) ? key.hiddenTests : []).filter(x => isObj(x) && typeof x.id === "string").slice(0, CODING_TEST_LIMITS.hiddenTests);
  const comparator = key.comparator === undefined ? DEFAULT_CODING_COMPARATOR : CODING_COMPARATORS.includes(key.comparator) ? key.comparator : null;
  if (comparator === null) incomplete = true;
  // Phase 20D — a composite child passes its PART grade and its raw child answer explicitly (`grade` / `rawAnswer`); top-level callers pass
  // neither and keep the original lookups byte-for-byte.
  const hasOwn = k => Object.prototype.hasOwnProperty.call(question, k);
  const grade = hasOwn("grade") ? (isObj(question.grade) ? question.grade : null) : (Array.isArray(attempt.questionGrades) ? attempt.questionGrades : []).find(g => isObj(g) && String(g.questionId) === id) || null;
  const rawAnswer = hasOwn("rawAnswer") ? question.rawAnswer : attempt.answers && attempt.answers[id];
  const bound = rawAnswer ? (codingQuestionVersion(q) === 3 ? bindCodingTemplateAnswerToQuestion(rawAnswer, q) : bindCodeAnswerToQuestion(rawAnswer, q)) : { ok: false };   // 19F: a coding@3 answer binds to its template
  const revision = isObj(t) && Number.isInteger(t.revision) && t.revision >= 1 ? t.revision : null;
  if (isObj(t) && revision === null) incomplete = true;
  const r = !unsupported && isObj(t) && isObj(t.result) ? t.result : null;
  if (!unsupported && isObj(t) && t.result !== undefined && t.result !== null && !r) incomplete = true;
  const resultRevision = r && Number.isInteger(r.revision) && r.revision >= 1 ? r.revision : null;
  if (r && resultRevision === null) incomplete = true;
  const phase = unsupported ? "unsupported" : automaticPhase(t);
  if (phase === "unknown") incomplete = true;
  const override = overrideScoreOf(attempt, id);
  const pick = (v, fn) => { if (!r) return null; const out = fn(v); if (out === null && v !== undefined) incomplete = true; return out; };
  const outcome = r ? (RESULT_OUTCOMES.has(r.outcome) ? r.outcome : (incomplete = true, null)) : null;
  const gradeScore = grade && finiteNonNeg(grade.score) !== null ? grade.score : null;
  const ev = {
    contract: EVIDENCE_CONTRACT,
    status: phase === "unsupported" ? "unsupported" : override !== null && phase !== "complete" ? "superseded" : phase,
    automaticStatus: phase,
    revision,
    resultRevision,
    resultCurrent: !!(r && isObj(t) && isTerminalState(t.state) && resultRevision !== null && resultRevision === revision),
    gradingMode: "hiddenTests",
    language: bound.ok ? bound.answer.language : null,
    languageVersion: bound.ok ? bound.answer.languageVersion : null,
    scoringPolicy: codingScoringPolicy(key),
    comparator,
    testCount: tests.length,
    maxMarks: grade ? effectiveMaxMarks(grade) : r ? finiteNonNeg(r.maxMarks) : null,
    automaticScore: pick(r && r.automaticScore, finiteNonNeg),
    passedCount: pick(r && r.passedCount, countOf),
    passedWeight: pick(r && r.passedWeight, finiteNonNeg),
    totalWeight: pick(r && r.totalWeight, finiteNonNeg),
    outcome,
    completedAt: pick(r && r.completedAt, isoOrNull)
  };
  if (outcome === "compile-error" && typeof r.compilePreview === "string") ev.compilePreview = prefixBytes(r.compilePreview, OFFICIAL_PREVIEW_BYTES);
  // 17F-C2 RF1 — the compile error was held for the teacher (policy manualReview): no automatic score exists by design (not
  // "incomplete"). ONE canonical derivation (state + current revision + outcome + flag) — never the stored flag alone.
  ev.reviewRequired = !unsupported && reviewRequiredTarget(t);
  ev.override = { active: override !== null, score: override !== null ? (gradeScore !== null ? gradeScore : override) : null };
  // The EFFECTIVE (official) question score is the canonical rebuild's grade — never computed here. While the question still
  // awaits review (a technical failure, an open first grading) there is no effective score yet: never a zero.
  ev.effectiveScore = grade && (override !== null || grade.manualReview !== true) ? gradeScore : null;
  ev.recovery = { state: unsupported ? "none" : recoveryState(t, phase) };
  ev.technicalCode = isObj(t) && !isTerminalState(t.state) && typeof t.technicalCode === "string" && TECH_CODE.test(t.technicalCode) ? t.technicalCode : null;
  let cases = [];
  if (r && outcome !== "no-answer") {
    if (!Array.isArray(r.cases)) incomplete = true;
    const byId = new Map();
    for (const c of Array.isArray(r.cases) ? r.cases.slice(0, CODING_TEST_LIMITS.hiddenTests * 2) : []) if (isObj(c) && typeof c.testId === "string" && !byId.has(c.testId)) byId.set(c.testId, c);
    cases = tests.map(test => {
      const c = byId.get(test.id);
      const caseOutcome = !c ? "not-run" : c.status === "success" ? (c.passed === true ? "passed" : "wrong-output") : CASE_OUTCOMES.has(c.status) ? c.status : "unknown";
      if (caseOutcome === "unknown") incomplete = true;
      const duration = c ? finiteNonNeg(c.durationMs) : null;
      if (c && c.durationMs !== undefined && duration === null) incomplete = true;
      const out = { testId: test.id, title: typeof test.title === "string" ? prefixBytes(test.title, TITLE_MAX_BYTES) : "", weight: finiteNonNeg(test.weight), outcome: caseOutcome, durationMs: duration === null ? null : Math.round(duration), expectedOutput: typeof test.expectedOutput === "string" ? prefixBytes(test.expectedOutput, OFFICIAL_STDOUT_CAPTURE_BYTES) : "" };
      if (c && typeof c.actualPreview === "string") out.actualPreview = prefixBytes(c.actualPreview, OFFICIAL_PREVIEW_BYTES);
      if (c && typeof c.stderrPreview === "string") out.stderrPreview = prefixBytes(c.stderrPreview, OFFICIAL_PREVIEW_BYTES);
      return out;
    });
  }
  ev.incomplete = incomplete;
  ev.cases = cases;
  return ev;
}

/**
 * Phase 17E-D — the COMPACT teacher gradebook summary of one attempt (no per-case evidence, no identifiers):
 * { status, openTargets, delayedTargets, supersededTargets }, or null without official coding targets. An open target under a
 * valid teacher override is "superseded" (it cannot change the mark). status precedence: delayed > retrying > processing
 * (incl. an unrecognised state, fail safe) > queued > superseded > complete.
 */
function teacherCodingSummary(attempt) {
  const t = attempt && attempt.codingGrading && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets : null;
  if (!t) return null;
  const RANK = { delayed: 5, retrying: 4, processing: 3, unknown: 3, queued: 2 };
  let seen = false, open = 0, delayed = 0, superseded = 0, best = 0;
  for (const [id, x] of Object.entries(t)) {
    if (x === null || x === undefined) continue;
    seen = true;
    const p = automaticPhase(x);
    if (p === "complete") continue;
    if (overrideScoreOf(attempt, id) !== null) { superseded++; continue; }
    open++;
    if (p === "delayed") delayed++;
    best = Math.max(best, RANK[p] || 3);
  }
  if (!seen) return null;
  const status = best === 5 ? "delayed" : best === 4 ? "retrying" : best === 3 ? "processing" : best === 2 ? "queued" : superseded ? "superseded" : "complete";
  return { status, openTargets: open, delayedTargets: delayed, supersededTargets: superseded };
}

module.exports = {
  JOB_PREFIX, OFFICIAL_PATH, ENGINE, ACTIVE_STATES, TERMINAL_STATES, STALE_DISPATCHED_MS, legacyAutoGradingWithhold, reviewRequiredTarget, DELIVERY_LEASE, officialJobId, officialTargetRef, officialLimits, targetAuthority, planCodingGrading, autoGradingPending, codingGradingStatus, studentCodingGradingStatus, buildOfficialRunnerJob,
  dispatchOfficialJob, ensureCodingGradingJobs, dispatchPlannedGrading, regradeTarget, validateCallbackBody, applyOfficialCallback, teacherCodingEvidence, teacherCodingSummary, overrideScoreOf, mutateTarget, manualRecovery, resolveCodingTarget
};
