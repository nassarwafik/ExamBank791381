import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// Phase 17C — 17C-C (hidden-test secrecy). Canary values sit in every teacher-private / identity field of the fixture; the
// serialized traffic of every boundary is scanned for them:
//   • the official Runner request carries ONLY {jobId, language, languageVersion, source, cases:[{token, stdin}], limits};
//   • no student response (assignment GET, submission GET / POST, dashboard) carries hidden tests, expected outputs, weights,
//     titles, reference solutions, grading fingerprints, job ids, callback state or teacher evidence;
//   • practice /api/coding/run never reads hidden tests and never touches grading state;
//   • logs carry no source / stdin / stdout / stderr / hidden data.
// Fail-first on 543fa9f4: there is no official dispatch / grading intent to inspect.
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = () => require_("../src/functions/student-submission.js");
const studentAssignment = () => require_("../src/functions/student-assignment.js");
const dashboard = () => require_("../src/functions/student-dashboard.js");
const codingRun = () => require_("../src/functions/coding-run.js");
const grading = () => require_("../src/functions/coding-grading.js");
const { createFakeCodingExecutionProvider } = require_("./fixtures/fake-coding-execution-provider.js");

const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const ANSWERS = { auto1: F.code("a,b=map(int,input().split());print('SUM='+str(a+b))\n"), sa1: { kind: "text", value: "x" } };
const PRIVATE = [...F.CANARY.expected, F.CANARY.title, F.CANARY.reference, F.CANARY.teacherNote, "hiddenTests", "expectedOutput", "referenceSolutions", "\"weight\"", "MANUAL-EXPECTED"];
const GRADING_INTERNALS = ["codingGrading", "gradingKey", "answerHash", "questionFingerprint", "jobId", "cg_", "technicalCode", "actualPreview", "stderrPreview", "passedWeight"];
const scan = (text, needles) => needles.filter(n => text.includes(n));

async function submitted({ fetch = F.runnerFetch(), logs = [] } = {}) {
  const ctx = F.seed({ a: F.assignment({}, { manual: true }) });
  const obs = { logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) };
  const deps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch };
  const r = await submission().handler(F.studentRequest(F.submitBody(ANSWERS)), deps, obs);
  return { ctx, fetch, deps, obs, logs, r };
}

describe("17C-C — the official Runner request carries NO grading truth and NO identity", () => {
  it("exact shape: {jobId, language, languageVersion, source, cases[{token, stdin}], limits{timeMs, memoryMb, outputBytes}}", async () => {
    const { fetch } = await submitted();
    const calls = fetch.calls.filter(c => c.path === "/v1/official-grading-jobs");
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST"); expect(calls[0].redirect).toBe("error");
    expect(calls[0].url).toBe("https://runner.example.test/v1/official-grading-jobs");
    const job = JSON.parse(calls[0].body);
    expect(Object.keys(job).sort()).toEqual(["cases", "jobId", "language", "languageVersion", "limits", "source"]);
    expect(Object.keys(job.limits).sort()).toEqual(["memoryMb", "outputBytes", "timeMs"]);
    expect(job.limits).toEqual({ timeMs: 2000, memoryMb: 128, outputBytes: require_("../src/lib/shared-finalization/codingContract.js").OFFICIAL_STDOUT_CAPTURE_BYTES });
    expect(job.cases).toEqual([{ token: "c01", stdin: "1 2\n" }, { token: "c02", stdin: "-1 -2\n" }, { token: "c03", stdin: "5 5\n" }]);
    for (const c of job.cases) expect(Object.keys(c).sort()).toEqual(["stdin", "token"]);
  });
  it("the serialized request contains NONE of: expected outputs, weights, titles, test ids, reference solutions, marks, student / class / teacher identity, exam title", async () => {
    const { fetch } = await submitted();
    const raw = fetch.calls.filter(c => c.path === "/v1/official-grading-jobs").map(c => c.body + JSON.stringify(c.headers)).join("\n");
    expect(scan(raw, [...F.CANARY.expected, F.CANARY.title, F.CANARY.reference, F.CANARY.studentName, F.CANARY.studentCode, F.CANARY.teacherId, F.CANARY.examTitle, F.CANARY.teacherNote, F.S1, F.CLASS_ID, F.AID])).toEqual([]);
    expect(raw).not.toMatch(/expected|weight|title|marks|score|h-small|h-neg|h-ten|student|class|teacher|exam|reference|callback/i);
  });
  it("the request is signed with the existing runner key over the exact body (no callback URL / image / command / flags inside it)", async () => {
    const { fetch } = await submitted();
    const call = fetch.calls.find(c => c.path === "/v1/official-grading-jobs");
    const { verifyRequest, createReplayGuard } = require_("../../runner/gateway/auth.js");
    expect(verifyRequest({ key: F.RUNNER_KEY, method: "POST", path: "/v1/official-grading-jobs", headers: call.headers, body: Buffer.from(call.body), replay: createReplayGuard() }).ok).toBe(true);
    expect(call.body).not.toMatch(/https?:|image|command|entrypoint|docker|--|env/);
  });
});

describe("17C-C — no browser response exposes hidden tests or grading internals", () => {
  it("submit / submission GET responses carry score + status only", async () => {
    const { ctx, r, deps, obs } = await submitted();
    const get = await submission().handler(F.studentRequest(null, "GET"), deps, obs);
    for (const body of [r.jsonBody, get.jsonBody]) {
      const s = JSON.stringify(body);
      expect(scan(s, PRIVATE)).toEqual([]); expect(scan(s, GRADING_INTERNALS)).toEqual([]);
    }
    expect(ctx.names("platform/coding-grading-jobs/")).toHaveLength(1);                            // the job exists server-side only
  });
  it("after the official result is applied, the student still sees only the score / status (no evidence, no per-test outcome)", async () => {
    const { ctx, fetch, deps, obs } = await submitted();
    const j = fetch.jobs()[0];
    await grading().callbackHandler(F.callbackRequest(F.callbackBody(j, [F.CANARY.expected[0], "wrong-output-canary", F.CANARY.expected[2]])), { getContainer: () => ctx.container, env: F.ENV });
    const get = await submission().handler(F.studentRequest(null, "GET"), deps, obs);
    const s = JSON.stringify(get.jsonBody);
    expect(scan(s, [...PRIVATE, ...GRADING_INTERNALS, "wrong-output-canary", "h-small"])).toEqual([]);
    const dash = await dashboard().handler({ method: "GET", url: "https://app.example.test/api/student-dashboard", params: {}, headers: new Headers(), query: new URLSearchParams() }, deps, obs);
    expect(scan(JSON.stringify(dash.jsonBody), [...PRIVATE, ...GRADING_INTERNALS, "wrong-output-canary"])).toEqual([]);
  });
  it("the student assignment GET (exam snapshot) never carries gradingMode / hidden tests / reference solutions", async () => {
    const ctx = F.seed();
    const r = await studentAssignment().handler({ method: "GET", url: "https://app.example.test/api/student-assignment/" + F.AID, params: { assignmentId: F.AID }, headers: new Headers(), query: new URLSearchParams() }, { container: ctx.container, requireStudentAuth: studentAuth });
    expect(r.status).toBe(200);
    expect(scan(JSON.stringify(r.jsonBody), [...PRIVATE, "gradingMode", "hiddenTests"])).toEqual([]);
  });
  it("the shared sanitizer drops a gradingMode / grading state smuggled into the PUBLIC coding config or a question node", () => {
    const { sanitizeExamForStudent } = require_("../src/lib/student-exam-sanitize.js");
    const q = F.autoQ({ coding: { ...F.CFG, gradingMode: "hiddenTests", codingGrading: { jobId: "cg_x" } }, codingGrading: { targets: {} }, gradingKey: "abc" });
    const s = JSON.stringify(sanitizeExamForStudent({ sections: [{ id: "s1", questions: [q] }] }));
    expect(scan(s, [...PRIVATE, "gradingMode", "codingGrading", "gradingKey", "cg_x"])).toEqual([]);
  });
});

describe("17C-C — practice execution stays completely separate from official grading", () => {
  it("a practice run never reads hidden tests, never writes grading state / jobs / scores, and its provider request carries no grading truth", async () => {
    const ctx = F.seed({ doc: F.activeDoc({}) });
    const provider = createFakeCodingExecutionProvider({ languages: [{ key: "python", languageVersion: 1 }] });
    const before = JSON.stringify(ctx.names("platform/").filter(n => !n.startsWith("platform/throttle/")).sort().map(n => [n, ctx.getJson(n)]));
    const body = { assignmentId: F.AID, questionId: "auto1", language: "python", languageVersion: 1, source: "print(input())", stdin: "1 2\n" };
    const r = await codingRun().runHandler({ method: "POST", url: "https://app.example.test/api/coding/run", params: {}, headers: new Headers(), text: async () => JSON.stringify(body) }, { container: ctx.container, requireStudentAuth: studentAuth, codingExecutionProvider: provider, env: {} });
    expect(r.status).toBe(200);
    expect(JSON.stringify(ctx.names("platform/").filter(n => !n.startsWith("platform/throttle/")).sort().map(n => [n, ctx.getJson(n)]))).toBe(before);
    expect(ctx.names("platform/coding-grading-jobs/")).toEqual([]);
    expect(scan(JSON.stringify(provider.requests), PRIVATE)).toEqual([]);
  });
});

describe("17C-C — logs never carry code, stdin, stdout, stderr or hidden data", () => {
  it("the submit + dispatch + callback path logs only safe metadata", async () => {
    const logs = [];
    const { ctx, fetch } = await submitted({ logs });
    const j = fetch.jobs()[0];
    const obs = { logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) };
    await grading().callbackHandler(F.callbackRequest(F.callbackBody(j, [F.CANARY.expected[0], "STDOUT-CANARY", { status: "runtime-error", stderr: "STDERR-CANARY" }])), { getContainer: () => ctx.container, env: F.ENV }, obs);
    const text = JSON.stringify(logs) + JSON.stringify(ctx.names("platform/audit/").map(n => ctx.getJson(n)));
    expect(scan(text, [...PRIVATE, "STDOUT-CANARY", "STDERR-CANARY", "SUM=", "print(", "1 2\\n", F.CALLBACK_KEY, F.RUNNER_KEY])).toEqual([]);
    expect(logs.map(l => l[0])).toEqual(expect.arrayContaining(["coding.autoGrade.dispatched", "coding.autoGrade.callback.applied"]));
  });
});
