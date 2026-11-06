import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { recordedManagedToken } from "./fixtures/managed-session.js";

// Tadris+ P10-I — every JSON API response defaults to `Cache-Control: private, no-store` (closes security review O12; design
// docs/enterprise-no-store-p10i.md, owner decision §19.46). On a shared school computer a student's answers or a teacher's saved
// exams must not stay in the browser's cache after sign-out. The rule is central: withObservability applies it, and every route
// outside that wrapper is registered through withCachePolicy. A response that states its own Cache-Control is never touched,
// and a non-JSON response (`body`) is outside the rule.
//
// The handlers are called EXACTLY as Azure calls them: the function registered with app.http, captured at registration. The
// blob client is replaced by the in-memory container; every session is real (a recorded managed teacher, a signed student
// token). TEST data only; no provider, network or real storage is reached.

const require = createRequire(import.meta.url);
const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "functions");

const SAVED = { ...process.env };
process.env.BANK_SETUP_KEY = "p10i-no-store-root-secret";
process.env.BUILDER_PASSWORD = "shared";
process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";   // never dialled: the blob client is replaced below
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "STUDENT_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER", "OPENAI_API_KEY", "AZURE_OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];

// Loaded lazily, inside the tests that use it, so this file also runs on the baseline (where the module does not exist yet) and
// the fail-first assertions below report the real missing header instead of an import error.
const httpCache = () => require("../src/lib/http-cache.js");
const { withObservability } = require("../src/lib/observability.js");
const { ACCESS_CONTROL_DOC } = require("../src/lib/access/access-mode.js");
const { buildRevision, revisionName, resetRevisionCache } = require("../src/lib/access/revisions.js");
const { newTeacherSessionId } = require("../src/lib/identity/teacher-token.js");
const { teacherAccountName } = require("../src/lib/identity/teacher-accounts.js");
const { resetOperatorGateCache } = require("../src/lib/identity/operator-gate.js");
const { createStudentToken } = require("../src/lib/student-auth.js");

const NO_STORE = "private, no-store";
const TEACHER = "t_00000000000000e1";
const NOBODY = "t_00000000000000e2";   // a managed teacher the owner never assigned (refused 403 everywhere in enforce)
const S1 = "21111111-1111-4111-8111-111111111111";

let mem;
let restoreBlob;
const registrations = [];
const byName = name => registrations.find(r => r.name === name);

beforeAll(() => {
  for (const m of ["log", "info", "warn", "error"]) vi.spyOn(console, m).mockImplementation(() => {});   // the routes' request logs
  const blob = require("@azure/storage-blob");
  const real = blob.BlobServiceClient.fromConnectionString;
  blob.BlobServiceClient.fromConnectionString = () => ({ getContainerClient: () => mem.container });
  restoreBlob = () => { blob.BlobServiceClient.fromConnectionString = real; };
  const fnPkg = require("@azure/functions");
  const realHttp = fnPkg.app.http;
  // The registering file is read from the call stack: a route module may require another one, whose registration then happens
  // while the first is loading.
  const registeringFile = () => { const frame = (new Error().stack || "").split("\n").find(l => l.includes(FUNCTIONS_DIR)); const m = frame && frame.match(/functions[\\/]([^\\/:]+\.js)/); return m ? m[1] : "?"; };
  fnPkg.app.http = (name, options) => { registrations.push({ name, file: registeringFile(), ...options }); };
  try {
    for (const f of readdirSync(FUNCTIONS_DIR).filter(n => n.endsWith(".js")).sort()) require(join(FUNCTIONS_DIR, f));
  } finally { fnPkg.app.http = realHttp; }
});
afterAll(() => {
  if (restoreBlob) restoreBlob();
  vi.restoreAllMocks();
  for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k];
  Object.assign(process.env, SAVED);
});

/** A fresh platform with test data: a managed teacher, their class, one student, a published assignment with a graded attempt. */
function platform(mode = "observe") {
  resetOperatorGateCache(); resetRevisionCache();
  mem = createMemoryContainer({});
  const { revision } = buildRevision({ accountId: TEACHER, presetId: "full-teaching", presetVersion: 2, createdBy: "owner:own_0011223344556677" });
  mem.setJson(revisionName(revision.revisionId), revision);
  const account = (id, extra = {}) => mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username: "u" + id.slice(-2), displayName: "معلم تجريبي", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], ...extra });
  account(TEACHER, { accessRevisionId: revision.revisionId, accessPreset: { id: "full-teaching", version: 2 } });
  account(NOBODY);
  mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  mem.setJson("platform/classes/c1.json", { classId: "c1", name: "صف تجريبي", status: "active", active: true, ownerId: TEACHER });
  mem.setJson("platform/users/" + S1 + ".json", { schemaVersion: 3, userId: S1, role: "student", code: "1001", displayName: "طالب تجريبي", classId: "c1", active: true, archived: false, authVersion: 1, createdAt: "2026-01-01T00:00:00.000Z" });
  const question = { examQuestionId: "q1", presentationType: "trueFalse", marks: 1, text: "عبارة تجريبية", answer: { correct: true } };
  mem.setJson("platform/assignments/a1.json", { assignmentId: "a1", classId: "c1", status: "published", title: "واجب تجريبي", instructions: "", maxAttempts: 1, questionCount: 1, totalMarks: 1, ownerId: TEACHER, examSnapshot: { title: "امتحان", questions: [question] } });
  mem.setJson("platform/submissions/a1/" + S1 + ".json", { assignmentId: "a1", studentId: S1, status: "submitted", attempts: [{ attemptNumber: 1, submittedAt: "2026-11-01T08:00:00.000Z", score: 1, totalMarks: 1, percentage: 100, answers: { q1: true }, questionGrades: [{ questionId: "q1", score: 1, maxScore: 1, correct: true }] }] });
  mem.setJson("exams/e1.json", { savedAt: "2026-11-01T08:00:00.000Z", ownerId: TEACHER, exam: { examId: "e1", title: "امتحان محفوظ", ownerId: TEACHER, questions: [question] } });
  const teacher = { "x-builder-token": recordedManagedToken(mem, { accountId: TEACHER, sid: newTeacherSessionId(), authVersion: 1 }).token };
  const nobody = { "x-builder-token": recordedManagedToken(mem, { accountId: NOBODY, sid: newTeacherSessionId(), authVersion: 1 }).token };
  const student = { "x-student-token": createStudentToken({ userId: S1, authVersion: 1, code: "1001", displayName: "طالب تجريبي", classId: "c1" }) };
  return { teacher, nobody, student };
}

function request(method, path, { headers = {}, params = {}, body = {} } = {}) {
  const url = new URL("https://x.invalid/api/" + path);
  const h = { "content-type": "application/json", ...headers };
  return {
    method, url: url.href, query: url.searchParams, params,
    headers: { get: k => h[String(k).toLowerCase()] ?? null },
    json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0),
    formData: async () => { throw new Error("no form data in this test"); }
  };
}
const AZURE_CONTEXT = { invocationId: "p10i" };
const call = (name, req) => byName(name).handler(req, AZURE_CONTEXT);
const cacheControlOf = r => {
  const key = Object.keys((r && r.headers) || {}).find(k => k.toLowerCase() === "cache-control");
  return key ? r.headers[key] : undefined;
};

describe("P10-I the five routes named by the review answer a valid request with private, no-store (O12)", () => {
  it("fail-first: student assignment, student submission, learning training, assignment review and saved exams (baseline: no Cache-Control)", async () => {
    const s = platform();
    const answers = {
      "student-assignment": await call("studentAssignment", request("GET", "student-assignment/a1", { headers: s.student, params: { assignmentId: "a1" } })),
      "student-submission": await call("studentSubmission", request("GET", "student-submission/a1", { headers: s.student, params: { assignmentId: "a1" } })),
      "learning-training": await call("learningTraining", request("GET", "learning-training", { headers: s.student, params: {} })),
      "assignment-review": await call("assignmentReview", request("GET", "assignment-review?assignmentId=a1&studentId=" + S1 + "&attemptNumber=1", { headers: s.teacher })),
      "manage-saved-exams": await call("manageSavedExams", request("GET", "saved-exams", { headers: s.teacher }))
    };
    const seen = Object.fromEntries(Object.entries(answers).map(([route, r]) => [route, r.status + " " + cacheControlOf(r)]));
    expect(seen).toEqual(Object.fromEntries(Object.keys(answers).map(route => [route, "200 " + NO_STORE])));
    expect(answers["student-assignment"].jsonBody.assignment.assignmentId).toBe("a1");
    expect(answers["student-submission"].jsonBody.ok).toBe(true);
    expect(answers["assignment-review"].jsonBody.attempt.attemptNumber).toBe(1);
    expect(answers["manage-saved-exams"].jsonBody.exams.map(e => e.examId)).toContain("e1");
  });

  it("only the header is added: the same request through the bare handler gives the same status and body", async () => {
    const s = platform();
    // The submission answer carries the server's clock (`serverNow`): the clock is held still (Date only) so the two calls are
    // compared byte for byte, instead of differing by the millisecond that passes between them on a loaded machine.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
    try {
      const bare = require(join(FUNCTIONS_DIR, "student-submission.js")).handler;
      const req = () => request("GET", "student-submission/a1", { headers: s.student, params: { assignmentId: "a1" } });
      const plain = await bare(req());
      const served = await call("studentSubmission", req());
      expect(served.status).toBe(plain.status);
      expect(served.jsonBody).toEqual(plain.jsonBody);
      expect(cacheControlOf(plain)).toBeUndefined();
      expect(cacheControlOf(served)).toBe(NO_STORE);
      const bareSaved = require(join(FUNCTIONS_DIR, "manage-saved-exams.js")).handler;
      const savedReq = () => request("GET", "saved-exams", { headers: s.teacher });
      const plainSaved = await bareSaved(savedReq());
      const servedSaved = await call("manageSavedExams", savedReq());
      expect(servedSaved.status).toBe(plainSaved.status);
      expect(servedSaved.jsonBody).toEqual(plainSaved.jsonBody);
      expect(cacheControlOf(servedSaved)).toBe(NO_STORE);
    } finally { vi.useRealTimers(); }
  });
});

describe("P10-I every registration: no JSON answer leaves without a Cache-Control", () => {
  /** Calls every registration with every method it declares; returns the JSON answers that carry no Cache-Control. */
  async function sweep(headersOf) {
    const missing = [];
    let json = 0;
    for (const reg of registrations) {
      for (const method of reg.methods || ["GET"]) {
        const s = platform("enforce");
        const path = String(reg.route || reg.name).replace(/\{[^}]+\}/g, "x");
        let r;
        try { r = await reg.handler(request(method, path, { headers: headersOf(s), params: {} }), AZURE_CONTEXT); } catch (e) { r = { status: "threw: " + e.message }; }
        if (r && r.jsonBody !== undefined) {
          json++;
          if (cacheControlOf(r) === undefined) missing.push(reg.file + " [" + reg.name + "] " + method + " → " + r.status);
        }
      }
    }
    return { missing, json };
  }

  it("the inventory: every route file in api/src/functions is captured, 100 registrations", () => {
    expect(registrations.length).toBeGreaterThanOrEqual(100);
    const files = readdirSync(FUNCTIONS_DIR).filter(n => n.endsWith(".js") && /app\.http\(/.test(readFileSync(join(FUNCTIONS_DIR, n), "utf8")));
    expect(files.filter(f => !registrations.some(r => r.file === f))).toEqual([]);
  });

  it("a request with no session: every JSON answer carries a Cache-Control (baseline: most carry none)", async () => {
    const { missing, json } = await sweep(() => ({}));
    expect(json).toBeGreaterThanOrEqual(90);
    expect(missing).toEqual([]);
  }, 60000);

  it("a signed-in teacher the owner never assigned (enforce): every JSON refusal carries a Cache-Control", async () => {
    const { missing, json } = await sweep(s => s.nobody);
    expect(json).toBeGreaterThanOrEqual(90);
    expect(missing).toEqual([]);
  }, 60000);
});

describe("P10-I what the rule never touches", () => {
  it("a route that states its own policy keeps it: the exam library stays private, no-cache with Vary", async () => {
    const s = platform();
    const r = await call("examLibrary", request("GET", "exam-library", { headers: s.teacher, params: {} }));
    expect(r.status).toBe(200);
    expect(cacheControlOf(r)).toBe("private, no-cache");
    expect(r.headers.Vary).toBeTruthy();
  });

  it("an explicit Cache-Control in any letter case is kept byte for byte, and no second one is added", () => {
    const { applyDefaultCachePolicy } = httpCache();
    const immutable = { status: 200, jsonBody: { ok: true }, headers: { "cache-control": "public, max-age=31536000, immutable" } };
    expect(applyDefaultCachePolicy(immutable)).toBe(immutable);
    const upper = { status: 200, jsonBody: {}, headers: { "CACHE-CONTROL": "private, no-cache" } };
    expect(applyDefaultCachePolicy(upper)).toBe(upper);
  });

  it("a non-JSON answer (an image, a file) is outside the rule", () => {
    const { applyDefaultCachePolicy } = httpCache();
    const image = { status: 200, body: Buffer.from("png"), headers: { "content-type": "image/png" } };
    expect(applyDefaultCachePolicy(image)).toBe(image);
    const empty = { status: 204 };
    expect(applyDefaultCachePolicy(empty)).toBe(empty);
    expect(applyDefaultCachePolicy(undefined)).toBe(undefined);
  });

  it("a JSON answer keeps every other header, its status and its body; the input is not mutated", () => {
    const { applyDefaultCachePolicy } = httpCache();
    const res = { status: 409, jsonBody: { ok: false, code: "X" }, headers: { "Retry-After": "5", "X-Request-ID": "r1" } };
    const out = applyDefaultCachePolicy(res);
    expect(out).toEqual({ status: 409, jsonBody: { ok: false, code: "X" }, headers: { "Retry-After": "5", "X-Request-ID": "r1", "Cache-Control": NO_STORE } });
    expect(res.headers["Cache-Control"]).toBeUndefined();
    expect(applyDefaultCachePolicy({ status: 200, jsonBody: [] }).headers).toEqual({ "Cache-Control": NO_STORE });
  });

  it("withCachePolicy passes every argument through; withObservability applies the same rule and keeps X-Request-ID", async () => {
    const { withCachePolicy } = httpCache();
    const seen = [];
    const wrapped = withCachePolicy(async (...args) => { seen.push(args); return { status: 200, jsonBody: { ok: true } }; });
    const r = await wrapped("req", "ctx", "extra");
    expect(seen).toEqual([["req", "ctx", "extra"]]);
    expect(r.headers["Cache-Control"]).toBe(NO_STORE);
    const observed = await withObservability("p10i-test", async () => ({ status: 200, jsonBody: { ok: true } }))(request("GET", "x"), AZURE_CONTEXT);
    expect(observed.headers["Cache-Control"]).toBe(NO_STORE);
    expect(observed.headers["X-Request-ID"]).toBeTruthy();
    const explicit = await withObservability("p10i-test", async () => ({ status: 200, jsonBody: {}, headers: { "Cache-Control": "private, no-cache" } }))(request("GET", "x"), AZURE_CONTEXT);
    expect(explicit.headers["Cache-Control"]).toBe("private, no-cache");
    const file = await withObservability("p10i-test", async () => ({ status: 200, body: "x" }))(request("GET", "x"), AZURE_CONTEXT);
    expect(cacheControlOf(file)).toBeUndefined();
  });
});

describe("P10-I static guard: a new route cannot forget the rule", () => {
  it("every app.http registration in api/src/functions hands Azure a handler wrapped by withObservability or withCachePolicy", () => {
    const offenders = [];
    let count = 0;
    for (const f of readdirSync(FUNCTIONS_DIR).filter(n => n.endsWith(".js"))) {
      const src = readFileSync(join(FUNCTIONS_DIR, f), "utf8");
      const calls = src.split(/\bapp\.http\(/).slice(1);
      for (const tail of calls) {
        count++;
        const m = tail.match(/\bhandler\s*:\s*([A-Za-z_$][\w$]*)/);
        let wrapper = m ? m[1] : "";
        if (wrapper && !/^with(Observability|CachePolicy)$/.test(wrapper)) {
          // A named handler (`handler: observed`) is accepted only when that name is itself bound to a wrapper in the same file.
          const bound = src.match(new RegExp("\\bconst\\s+" + wrapper.replace(/\$/g, "\\$") + "\\s*=\\s*(withObservability|withCachePolicy)\\("));
          wrapper = bound ? bound[1] : wrapper;
        }
        if (!/^with(Observability|CachePolicy)$/.test(wrapper)) offenders.push(f + " → handler: " + (m ? m[1] : "?"));
      }
      if (/\bwithCachePolicy\(/.test(src)) expect(src, f).toMatch(/require\("\.\.\/lib\/http-cache"\)/);
    }
    expect(count).toBeGreaterThanOrEqual(100);
    expect(offenders).toEqual([]);
  });
});
