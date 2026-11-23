// Teacher-device grading (owner decision 2026-11-23, docs/enterprise-teacher-device-grading.md).
//
// "The teacher's device executes code. The SmartAssess server decides the grade."
//
// The OFFICIAL hidden-test grading of a C# (csharp@1) or — since Python phase 2 (owner decision 2026-11-23) — Python (python@1) coding
// answer may run on the TEACHER'S OWN COMPUTER, in the on-device lab of its language (/csharp-lab/ or /python-lab/: sandboxed
// opaque-origin iframe, a fresh runtime per graded answer, desktop only), instead of on the Coding Runner VM:
//   1. LIST   (teacher): which students of the assignment have open C# / Python targets (pending / dispatched / retryable) — counts only.
//   2. JOBS   (teacher): for ONE student, each open C# / Python target as a device job: the stored answer's source (coding@3: rebuilt HERE from
//              the published template, exactly as the Runner receives it), the cases as { token, stdin } in snapshot order and the
//              question's time limit. Expected outputs, weights, titles and marks NEVER leave the server (as for the Runner). The job is
//              bound to the target's revision and grading key by an opaque ticket.
//   3. APPLY  (teacher): the device reports RAW evidence only (compile status, per case: token, status, stdout, stderr, durationMs).
//              The server re-derives the authority exactly as for a Runner callback (target → revision → grading key recomputed from
//              the stored answer and the snapshot question), compares and weights with the SAME code (evaluateOfficialCodingRun,
//              scoreCompleteEvidence) and applies once, under the target's own job id: a Runner callback for the same revision that
//              arrives later is "already applied", and vice versa. Nothing new is decided on the device.
//
// FAIL SAFE — evidence the device cannot vouch for is REFUSED and NOTHING is written (the question stays «قيد المراجعة», the teacher
// decides or the Runner grades it later; never a zero):
//   • a case that timed out, hit the output limit or failed inside the lab, or ran longer than the question's time limit, or whose
//     duration is unknown (DEVICE_INCONCLUSIVE) — the device is not the Runner's measured sandbox;
//   • a runtime error raised by the browser runtime itself — an API the lab cannot offer (C#: PlatformNotSupportedException; Python:
//     no threads, "Function not implemented", an Emscripten / Pyodide limit) — BROWSER_LIMIT;
//   • a compile error under any policy other than the question's explicit "manualReview" (coding@2+), which only routes the answer
//     to the teacher (reviewRequired) — so a lab-only compile difference can never cost marks (DEVICE_COMPILE_ERROR);
//   • any language other than C# and Python (DEVICE_LANGUAGE): Java has no on-device lab.
// The teacher can always override the mark anyway (manual override wins in the canonical rebuild); the device evidence is recorded
// as engine "teacher-device-v1" and audited under the teacher's id.
const crypto = require("crypto");
const storage = require("../platform-storage");
const { recordAuditEvent } = require("../audit-log");
const { evaluateOfficialCodingRun, officialCaseToken } = require("../shared-finalization/codingContract");
const { targetAuthority, validateCallbackBody, scoreCompleteEvidence, isTerminalState, setJobState, finalSideEffects, ACTIVE_STATES } = require("./official-grading");

const DEVICE_ENGINE = "teacher-device-v1";
const AP = "platform/assignments/", SP = "platform/submissions/";
const SUBMISSION_NAME = /^platform\/submissions\/([A-Za-z0-9._:-]{1,128})\/([A-Za-z0-9._:-]{1,128})\.json$/;
const TICKET = /^dt_[0-9a-f]{40}$/;
const LIST_MAX_SUBMISSIONS = 1000;
const INCONCLUSIVE_CASE = new Set(["timeout", "output-limit", "internal-error"]);
// the shape check reuses the Runner callback's exact bounds (keys, statuses, tokens, byte caps) under a fixed internal job id
const SHAPE_JOB_ID = "cg_device_evidence_shape";
const STOP = Symbol("stop");
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const sha256 = text => crypto.createHash("sha256").update(text, "utf8").digest("hex");
const nowIso = deps => new Date((deps && deps.now ? deps.now() : Date.now())).toISOString();

/** The opaque ticket of a device job: binds the evidence to the target's grading key (revision, answer, snapshot) — reveals nothing. */
function deviceTicket(gradingKey) { return "dt_" + sha256("cg-device-v1\n" + String(gradingKey || "")).slice(0, 40); }
const DEVICE_LANGUAGES = Object.freeze(["csharp", "python"]);       // each at languageVersion 1 (the Runner's csharp@1 / python@1)
const deviceLanguage = answer => !!answer && DEVICE_LANGUAGES.includes(answer.language) && answer.languageVersion === 1;
// A runtime error the BROWSER caused, not the student's program: the device cannot vouch for it (the Runner might run it fine).
const BROWSER_LIMIT = /PlatformNotSupported|can't start new thread|Function not implemented|emscripten|pyodide/i;
const openTargetsOf = attempt => (isObj(attempt) && isObj(attempt.codingGrading) && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets : {});
const attemptsOf = doc => (isObj(doc) && Array.isArray(doc.attempts) ? doc.attempts.filter(a => isObj(a) && Number.isInteger(a.attemptNumber) && a.attemptNumber >= 1) : []);

/** One open target as a device job, or { skip } (another language / a target whose authority no longer matches). */
function deviceJobOf(assignment, attempt, targetKey, ids) {
  const t = openTargetsOf(attempt)[targetKey];
  if (!isObj(t) || !ACTIVE_STATES.includes(t.state) || !Number.isInteger(t.revision)) return null;
  const auth = targetAuthority(assignment.examSnapshot, attempt, targetKey, { ...ids, revision: t.revision });
  if (!auth.ok || !auth.answer || auth.gradingKey !== t.gradingKey || auth.jobId !== t.jobId) return { skip: "authority" };
  if (!deviceLanguage(auth.answer)) return { skip: "language" };
  return {
    attemptNumber: Number(attempt.attemptNumber), questionId: targetKey, revision: t.revision, ticket: deviceTicket(t.gradingKey),
    language: auth.answer.language, languageVersion: auth.answer.languageVersion, source: auth.answer.source,
    cases: auth.tests.map((x, i) => ({ token: officialCaseToken(i), stdin: x.input })),
    limits: { timeMs: auth.limits.timeMs, outputBytes: auth.limits.outputBytes }
  };
}

/** The jobs of one student's submission document (every attempt, every open target). → { jobs, skipped } */
function jobsOfSubmission(assignment, doc, studentId) {
  const jobs = [];
  let skipped = 0;
  for (const attempt of attemptsOf(doc).sort((a, b) => a.attemptNumber - b.attemptNumber)) {
    const ids = { assignmentId: String(assignment.id || ""), studentId: String(studentId), attemptNumber: attempt.attemptNumber };
    for (const key of Object.keys(openTargetsOf(attempt)).sort()) {
      const j = deviceJobOf(assignment, attempt, key, ids);
      if (!j) continue;
      if (j.skip) skipped++; else jobs.push(j);
    }
  }
  return { jobs, skipped };
}

async function loadAssignment(container, assignmentId, deps) {
  const dl = deps.downloadJsonOrNull || storage.downloadJsonOrNull;
  const a = await dl(container, AP + assignmentId + ".json");
  return isObj(a) && isObj(a.examSnapshot) ? { ...a, id: assignmentId } : null;
}

/** LIST — the students with open C# / Python targets (counts only, never source or tests). → { status, students: [{ studentId, jobs }], skipped, hasMore } */
async function listDeviceGrading(container, { assignmentId }, deps = {}) {
  const assignment = await loadAssignment(container, assignmentId, deps);
  if (!assignment) return { status: 404, code: "NOT_FOUND" };
  const list = deps.listBlobNames || storage.listBlobNames, dl = deps.downloadJsonOrNull || storage.downloadJsonOrNull;
  const names = (await list(container, SP + assignmentId + "/")).filter(n => { const m = SUBMISSION_NAME.exec(n); return m && m[1] === assignmentId; }).sort();
  const hasMore = names.length > LIST_MAX_SUBMISSIONS, taken = names.slice(0, LIST_MAX_SUBMISSIONS);
  const docs = await storage.mapConcurrent(taken, storage.getReadConcurrency(), n => dl(container, n).catch(() => null));
  const students = [];
  let skipped = 0;
  taken.forEach((n, i) => {
    const studentId = SUBMISSION_NAME.exec(n)[2], doc = docs[i];
    if (!isObj(doc) || (doc.studentId !== undefined && String(doc.studentId) !== studentId)) return;
    const r = jobsOfSubmission(assignment, doc, studentId);
    skipped += r.skipped;
    if (r.jobs.length) students.push({ studentId, jobs: r.jobs.length });
  });
  return { status: 200, students, skipped, hasMore };
}

/** JOBS — one student's device jobs (source + case stdin + time limit; never expected outputs, weights, titles or marks). */
async function studentDeviceJobs(container, { assignmentId, studentId }, deps = {}) {
  const assignment = await loadAssignment(container, assignmentId, deps);
  if (!assignment) return { status: 404, code: "NOT_FOUND" };
  const dl = deps.downloadJsonOrNull || storage.downloadJsonOrNull;
  const doc = await dl(container, SP + assignmentId + "/" + studentId + ".json");
  if (!isObj(doc) || (doc.studentId !== undefined && String(doc.studentId) !== studentId)) return { status: 200, jobs: [], skipped: 0 };
  const r = jobsOfSubmission(assignment, doc, studentId);
  return { status: 200, jobs: r.jobs, skipped: r.skipped };
}

const BODY_KEYS = ["assignmentId", "attemptNumber", "cases", "compile", "questionId", "revision", "studentId", "ticket"];
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
/** Strict shape of a device result: identifiers + the raw evidence, within the Runner callback's exact bounds. */
function validateDeviceBody(b) {
  if (!isObj(b) || Object.getPrototypeOf(b) !== Object.prototype) return false;
  const keys = Object.keys(b).sort();
  if (keys.length !== BODY_KEYS.length || !keys.every((k, i) => k === BODY_KEYS[i])) return false;
  for (const k of ["assignmentId", "studentId", "questionId"]) if (typeof b[k] !== "string" || !SAFE_ID.test(b[k]) || b[k].includes("..")) return false;
  if (!Number.isInteger(b.attemptNumber) || b.attemptNumber < 1 || b.attemptNumber > 1000) return false;
  if (!Number.isInteger(b.revision) || b.revision < 1 || b.revision > 1000000) return false;
  if (typeof b.ticket !== "string" || !TICKET.test(b.ticket)) return false;
  if (!isObj(b.compile)) return false;                                   // the device always states whether the program compiled
  return validateCallbackBody({ jobId: SHAPE_JOB_ID, outcome: "completed", compile: b.compile, cases: b.cases });
}

/** The device-only refusals (see the header): a reason code, or null when the evidence is conclusive for the device. */
function deviceRefusal(body, auth) {
  if (body.compile.status === "compile-error") return auth.compileErrorPolicy === "manualReview" ? null : "DEVICE_COMPILE_ERROR";
  for (const c of body.cases) {
    if (INCONCLUSIVE_CASE.has(c.status)) return "DEVICE_INCONCLUSIVE";
    if (typeof c.durationMs !== "number" || c.durationMs > auth.limits.timeMs) return "DEVICE_INCONCLUSIVE";
    if (c.status === "runtime-error" && BROWSER_LIMIT.test(c.stderr)) return "DEVICE_INCONCLUSIVE";
  }
  return null;
}

/**
 * APPLY — one device result. → { status, body }:
 *   200 { applied: true, state }   complete (scored) or reviewRequired (compile error under "manualReview")
 *   200 { alreadyApplied: true }   this revision already has its result (from the Runner or an earlier device run) — no write
 *   404 NOT_FOUND                  no such assignment / target
 *   409 STALE_RESULT               the revision / grading key moved on, or the target is no longer open — no write
 *   422 <device refusal>           the evidence is not conclusive on a device (see deviceRefusal) or invalid — no write
 */
async function applyDeviceEvidence(container, body, { actor } = {}, deps = {}, obs = null) {
  const assignment = await loadAssignment(container, body.assignmentId, deps);
  if (!assignment) return { status: 404, body: { ok: false, code: "NOT_FOUND" } };
  const mut = deps.mutateJsonWithRetry || storage.mutateJsonWithRetry, audit = deps.recordAuditEvent || recordAuditEvent;
  const ids = { assignmentId: body.assignmentId, studentId: body.studentId, attemptNumber: body.attemptNumber };
  let outcome = null, jobId = null;
  try {
    await mut(container, SP + ids.assignmentId + "/" + ids.studentId + ".json", current => {
      outcome = null;
      const attempt = isObj(current) && Array.isArray(current.attempts) ? current.attempts.find(x => isObj(x) && Number(x.attemptNumber) === ids.attemptNumber) : null;
      const target = attempt ? openTargetsOf(attempt)[body.questionId] : null;
      if (!isObj(target)) { outcome = { kind: "missing" }; throw STOP; }
      if (target.revision !== body.revision || body.ticket !== deviceTicket(target.gradingKey)) { outcome = { kind: "stale" }; throw STOP; }
      jobId = target.jobId;
      if (isTerminalState(target.state) && isObj(target.result) && target.result.revision === target.revision) { outcome = { kind: "already" }; throw STOP; }
      if (!ACTIVE_STATES.includes(target.state)) { outcome = { kind: "stale" }; throw STOP; }
      const auth = targetAuthority(assignment.examSnapshot, attempt, body.questionId, { ...ids, revision: target.revision });
      if (!auth.ok || !auth.answer || auth.gradingKey !== target.gradingKey || auth.jobId !== target.jobId) { outcome = { kind: "stale" }; throw STOP; }
      if (!deviceLanguage(auth.answer)) { outcome = { kind: "refused", code: "DEVICE_LANGUAGE" }; throw STOP; }
      const refusal = deviceRefusal(body, auth);
      if (refusal) { outcome = { kind: "refused", code: refusal }; throw STOP; }
      const ev = evaluateOfficialCodingRun({ tests: auth.tests, comparator: auth.comparator, run: { compile: body.compile, cases: body.cases } });
      if (ev.kind !== "complete") { outcome = { kind: "refused", code: "EVIDENCE_INVALID" }; throw STOP; }   // never a technical state from a device
      const at = nowIso(deps);
      outcome = scoreCompleteEvidence(target, attempt, auth, ev, { jobId: target.jobId, engine: DEVICE_ENGINE, at, wasFinal: !!attempt.finalized, scoreBefore: Number(attempt.score) });
      current.updatedAt = at;
      return current;
    });
  } catch (e) { if (e !== STOP) throw e; }
  if (!outcome || outcome.kind === "missing") return { status: 404, body: { ok: false, code: "NOT_FOUND" } };
  if (outcome.kind === "stale") { obs?.logWarn?.("coding.deviceGrade.stale", { revision: body.revision }); return { status: 409, body: { ok: false, code: "STALE_RESULT" } }; }
  if (outcome.kind === "already") return { status: 200, body: { ok: true, alreadyApplied: true } };
  if (outcome.kind === "refused") { obs?.logInfo?.("coding.deviceGrade.refused", { code: outcome.code, revision: body.revision }); return { status: 422, body: { ok: false, code: outcome.code } }; }
  await setJobState(container, jobId, body.revision, "complete", null, deps);            // a Runner job record, when one exists, follows
  await audit(container, { actor: String(actor || "teacher"), action: "coding.deviceGrade.completed", targetType: "student", targetId: ids.studentId, targetLabel: "", details: { assignmentId: ids.assignmentId, attemptNumber: ids.attemptNumber, questionId: body.questionId, revision: body.revision, engine: DEVICE_ENGINE, state: outcome.targetState, outcome: outcome.outcome, ...(outcome.reviewRequired ? { reviewRequired: true } : {}), passedCount: outcome.passedCount, testCount: outcome.testCount } });
  obs?.logInfo?.("coding.deviceGrade.applied", { revision: body.revision, outcome: outcome.outcome, becameFinal: outcome.becameFinal });
  if (outcome.becameFinal) await finalSideEffects(container, assignment, ids, deps, obs);
  else if (outcome.finalScoreChanged) await finalSideEffects(container, assignment, ids, deps, obs, { regradeJobId: jobId });
  return { status: 200, body: { ok: true, applied: true, state: outcome.targetState } };
}

module.exports = { DEVICE_ENGINE, DEVICE_LANGUAGES, BROWSER_LIMIT, LIST_MAX_SUBMISSIONS, deviceTicket, listDeviceGrading, studentDeviceJobs, validateDeviceBody, applyDeviceEvidence };
