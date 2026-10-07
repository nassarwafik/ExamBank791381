// Phase 20G — CORE ENTERPRISE CERTIFICATION: the in-process PLATFORM harness. It drives the REAL Azure Functions handlers (no stubbed
// grading, no stubbed sanitizer, no stubbed governance) against the shared in-memory blob container, end to end:
//   teacher: save working copy → load → governance enable → submit-review (server finalization) → approve → publish → assignment (binds the
//            immutable published revision) → review / rubric / per-part overrides;
//   student: pre-start delivery → startAttempt → sanitized delivery → saveDraft (autosave) → GET state (restore) → submit;
//   runner:  a recording double of the official endpoint (executes NOTHING) + signed callbacks carrying raw evidence only.
// Only authentication is injected (a fixed teacher / per-student session); every authority decision is the production code's.
const { createMemoryContainer } = require("../fixtures/memory-container.js");
const F = require("../fixtures/coding-17c.js");

const CLASS_ID = "cls-20g-cert";
const TEACHER = "teacher-20g-cert";
const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const handlers = {
  save: () => require("../../src/functions/save-exam-artifact.js").handler,
  saved: () => require("../../src/functions/manage-saved-exams.js").handler,
  gov: () => require("../../src/functions/exam-governance.js").handler,
  assignments: () => require("../../src/functions/manage-assignments.js").handler,
  deliver: () => require("../../src/functions/student-assignment.js").handler,
  submission: () => require("../../src/functions/student-submission.js").handler,
  review: () => require("../../src/functions/assignment-review.js").handler,
  callback: () => require("../../src/functions/coding-grading.js").callbackHandler,
  regrade: () => require("../../src/functions/coding-grading.js").regradeHandler
};
const req = (url, body, method = "POST", params = {}) => ({ method, url: "https://app.example.test" + url, params, headers: new Headers({ "content-type": "application/json" }), query: new URLSearchParams(), json: async () => (body === undefined ? {} : JSON.parse(JSON.stringify(body))), text: async () => JSON.stringify(body ?? {}) });
const studentDoc = (userId, displayName, code) => ({ schemaVersion: 3, role: "student", userId, displayName, code, classId: CLASS_ID, active: true, archived: false, authVersion: 1, shareAchievements: false });

let assignmentCounter = 0;
async function withAssignmentId(seed, fn) {
  const nodeCrypto = require("node:crypto"), original = nodeCrypto.randomUUID;
  const h = nodeCrypto.createHash("sha256").update("cert20g|" + seed + "|" + (++assignmentCounter)).digest("hex");
  nodeCrypto.randomUUID = () => [h.slice(0, 8), h.slice(8, 12), "4" + h.slice(13, 16), "8" + h.slice(17, 20), h.slice(20, 32)].join("-");
  try { return await fn(); } finally { nodeCrypto.randomUUID = original; }
}
/** A fresh platform: one class, the given students (id → display name), a recording Runner double. */
function createPlatform({ students = {}, runner } = {}) {
  const seed = { ["platform/classes/" + CLASS_ID + ".json"]: { classId: CLASS_ID, name: "صف الشهادة 20G", active: true, studentIds: Object.keys(students) } };
  let n = 0;
  for (const [id, name] of Object.entries(students)) seed["platform/users/" + id + ".json"] = studentDoc(id, name, "CERT20G" + String(++n).padStart(3, "0"));
  const mem = createMemoryContainer(seed);
  const fetch = F.runnerFetch(runner);
  const tDeps = { requireBuilderAuth: () => ({ ok: true, user: { sub: TEACHER, role: "teacher" } }), getContainer: () => mem.container, env: F.ENV, fetch };
  const sDeps = sid => ({ container: mem.container, requireStudentAuth: () => ({ ok: true, user: { sub: sid, sv: 1, role: "student" } }), env: F.ENV, fetch });
  const ids = new Map();   // studentId|assignmentId → { attemptNumber, startedAt, attemptEpoch }
  let rid = 0;
  const govCall = async body => handlers.gov()(req("/api/exam-governance", { requestId: "rq-" + (++rid), ...body }), tDeps, quiet);

  const teacher = {
    async saveExam(exam) { return handlers.save()(req("/api/save-exam-artifact", { kind: "exam", exam }), tDeps); },
    async loadExam(blobName) { return handlers.saved()(req("/api/saved-exams", { action: "load", blobName }), tDeps); },
    governance: govCall,
    async status(examId) { return handlers.gov()(req("/api/exam-governance?examId=" + encodeURIComponent(examId), undefined, "GET"), tDeps, quiet); },
    /** enable → submit-review → approve → publish; returns every response so a test can assert each step (a refusal stops the chain). */
    async publish(exam) {
      const steps = [];
      const en = await govCall({ action: "enable", examId: exam.examId, exam }); steps.push(en);
      if (en.status !== 200) return { ok: false, steps };
      let m = en.jsonBody.manifest;
      for (const action of ["submit-review", "approve", "publish"]) {
        const r = await govCall({ action, examId: exam.examId, expectedStateVersion: m.stateVersion, ...(action === "submit-review" ? { revisionId: m.latestRevisionId } : {}) });
        steps.push(r);
        if (r.status !== 200) return { ok: false, steps };
        m = r.jsonBody.manifest;
      }
      return { ok: true, steps, manifest: m };
    },
    /** Creates the assignment with a DETERMINISTIC id (derived from the exam id + a counter) so per-attempt parametric instances — generated from
     *  the server-owned identity (assignment, student, attempt) — are reproducible run after run. Only the id source is pinned; nothing else. */
    async assign(examId, over = {}) { return withAssignmentId(examId, () => handlers.assignments()(req("/api/assignments", { action: "create", classId: CLASS_ID, title: "واجب الشهادة 20G", publish: true, maxAttempts: 2, attemptPolicy: "continuous", examSnapshot: { examId }, ...over }), tDeps, quiet)); },
    async assignSnapshot(examSnapshot, over = {}) { return handlers.assignments()(req("/api/assignments", { action: "create", classId: CLASS_ID, title: "واجب الشهادة 20G", publish: true, maxAttempts: 2, attemptPolicy: "continuous", examSnapshot, ...over }), tDeps, quiet); },
    async reviewGet(aid, sid, attemptNumber = 1) { return handlers.review()(req("/api/assignment-review?assignmentId=" + aid + "&studentId=" + sid + "&attemptNumber=" + attemptNumber, undefined, "GET"), tDeps, quiet); },
    async saveReview(aid, sid, overrides, attemptNumber = 1, teacherFeedback = "") { return handlers.review()(req("/api/assignment-review", { action: "saveReview", assignmentId: aid, studentId: sid, attemptNumber, overrides, teacherFeedback }), tDeps, quiet); },
    async regrade(body) { return handlers.regrade()(req("/api/coding/regrade", body), { getContainer: () => mem.container, requireBuilderAuth: tDeps.requireBuilderAuth, env: F.ENV, fetch }, quiet); }
  };

  function student(sid) {
    const sreq = (aid, body, method = "POST") => req("/api/student-submission/" + aid, body, method, { assignmentId: aid });
    const identity = aid => ids.get(sid + "|" + aid) || {};
    const remember = (aid, state) => { const a = state && state.activeAttempt; if (a) ids.set(sid + "|" + aid, { attemptNumber: a.attemptNumber, startedAt: a.startedAt, ...(a.attemptEpoch ? { attemptEpoch: a.attemptEpoch } : {}) }); };
    const withId = (aid, body, over) => { const i = { ...identity(aid), ...(over || {}) }; return { ...body, expectedAttemptNumber: i.attemptNumber, expectedStartedAt: i.startedAt, ...(i.attemptEpoch ? { expectedAttemptEpoch: i.attemptEpoch } : {}) }; };
    return {
      id: sid,
      identity,
      async deliver(aid) { return handlers.deliver()(req("/api/student-assignment/" + aid, undefined, "GET", { assignmentId: aid }), sDeps(sid), quiet); },
      async state(aid) { const r = await handlers.submission()(sreq(aid, undefined, "GET"), sDeps(sid), quiet); if (r.status === 200) remember(aid, r.jsonBody.state); return r; },
      async start(aid) { const r = await handlers.submission()(sreq(aid, { action: "startAttempt" }), sDeps(sid), quiet); if (r.status === 200) remember(aid, r.jsonBody.state); return r; },
      async draft(aid, answers, idOver) { return handlers.submission()(sreq(aid, withId(aid, { action: "saveDraft", answers }, idOver)), sDeps(sid), quiet); },
      async submit(aid, answers, idOver) { return handlers.submission()(sreq(aid, withId(aid, { action: "submit", answers }, idOver)), sDeps(sid), quiet); },
      async raw(aid, body) { return handlers.submission()(sreq(aid, body), sDeps(sid), quiet); },
      doc(aid) { return mem.getJson("platform/submissions/" + aid + "/" + sid + ".json"); },
      attempt(aid, n = 1) { const d = this.doc(aid); return d && (d.attempts || []).find(a => a.attemptNumber === n); }
    };
  }

  const runnerApi = {
    fetch,
    jobs: () => fetch.jobs(),
    async callback(body, opts) { return handlers.callback()(F.callbackRequest(body, opts), { getContainer: () => mem.container, env: F.ENV }, quiet); },
    callbackBody: F.callbackBody
  };
  return { mem, teacher, student, runner: runnerApi, classId: CLASS_ID, assignmentOf: aid => mem.getJson("platform/assignments/" + aid + ".json") };
}

module.exports = { createPlatform, CLASS_ID, TEACHER };
