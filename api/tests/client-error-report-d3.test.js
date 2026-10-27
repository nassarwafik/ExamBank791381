import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";

// D3 (item 3) — client error reports become one structured, content-free log event. A report can never carry a message, a stack,
// a URL query, an answer or an identity into the logs: the route re-validates every field against allowlists.

const require = createRequire(import.meta.url);
const SECRETS = { BUILDER_SESSION_SECRET: "cer-d3-builder", STUDENT_SESSION_SECRET: "cer-d3-student", BUILDER_PASSWORD: "cer-d3-password" };
const saved = {};
beforeAll(() => { for (const [k, v] of Object.entries(SECRETS)) { saved[k] = process.env[k]; process.env[k] = v; } saved.BUILDER_USERS = process.env.BUILDER_USERS; delete process.env.BUILDER_USERS; });
afterAll(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

const { handler, sanitizeReport, resetClientErrorWindow, MAX_BODY_CHARS } = require("../src/functions/client-error-report.js");
const { createBuilderToken } = require("../src/lib/builder-auth.js");
const { createStudentToken } = require("../src/lib/student-auth.js");
const observability = require("../src/lib/observability.js");

const req = (token, body) => ({ method: "POST", url: "https://example.invalid/api/client-error-report", headers: new Headers(token ? { authorization: "Bearer " + token } : {}), text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
let logs;
const call = async (token, body, deps) => {
  const ctx = observability.createRequestContext(req(token, body), { route: "client-error-report" });
  return handler(req(token, body), {}, ctx, deps);
};
beforeEach(() => { logs = []; observability.setSink(r => { logs.push(r); return r; }); resetClientErrorWindow(); });
afterEach(() => observability.resetSink());

const NASTY = {
  kind: "runtime", name: "Error", file: "/assets/StudentExamPage-ab12cd34.js", line: 1, col: 4242, area: "student-exam", build: "index-liwypafl",
  message: "answer=الإجابة السرية token=eyJhbGciOi", stack: "Error: secret at https://host/assets/x.js:1:2?token=abc", url: "https://host/#/exam?student=s1",
  answers: { q1: "سرّي" }, studentName: "سارة أحمد", email: "a@b.c"
};

describe("sanitizeReport — allowlists only", () => {
  it("keeps kind, an allowlisted name, the bundle location, area and build; drops everything else", () => {
    expect(sanitizeReport(NASTY)).toEqual({ kind: "runtime", errorName: "Error", location: "/assets/StudentExamPage-ab12cd34.js:1:4242", area: "student-exam", build: "index-liwypafl" });
  });
  it("an unknown error name collapses to Error; a non-bundle or traversal path loses the location; a bad area becomes global", () => {
    expect(sanitizeReport({ kind: "render", name: "MySecretError token=x", file: "https://evil.example/x.js", area: "Student Exam!" })).toEqual({ kind: "render", errorName: "Error", location: "", area: "global", build: "" });
    expect(sanitizeReport({ kind: "render", file: "/assets/../../etc/passwd" }).location).toBe("");
    expect(sanitizeReport({ kind: "render", file: "/assets/x.js?token=abc" }).location).toBe("");
  });
  it("csp reports keep the directive and only an origin or keyword of what was blocked", () => {
    expect(sanitizeReport({ kind: "csp", directive: "script-src-elem", blocked: "https://cdn.evil.example", file: "/assets/index-a.js", line: 3, col: 9 })).toEqual({ kind: "csp", location: "/assets/index-a.js:3:9", area: "global", build: "", directive: "script-src-elem", blocked: "https://cdn.evil.example" });
    expect(sanitizeReport({ kind: "csp", directive: "img-src", blocked: "https://x.example/path?student=1" }).blocked).toBe("other");
    expect(sanitizeReport({ kind: "csp", directive: "script-src", blocked: "inline" }).blocked).toBe("inline");
  });
  it("an unknown kind or a non-object is unusable", () => {
    for (const bad of [null, [], "x", { kind: "debug" }, { kind: "" }]) expect(sanitizeReport(bad)).toBeNull();
  });
});

describe("the route", () => {
  it("anonymous → 401 and nothing is logged", async () => {
    expect((await call(null, NASTY)).status).toBe(401);
    expect(logs.filter(l => l.event.startsWith("client."))).toEqual([]);
  });
  it("a teacher report → 204 and ONE client.error event with no message, stack, query, answer, name or token in it", async () => {
    const r = await call(createBuilderToken("teacher-1"), NASTY);
    expect(r.status).toBe(204);
    const ev = logs.filter(l => l.event === "client.error");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ level: "warn", kind: "runtime", errorName: "Error", location: "/assets/StudentExamPage-ab12cd34.js:1:4242", area: "student-exam", build: "index-liwypafl", role: "teacher" });
    expect(ev[0].userref).toMatch(/^u_[0-9a-f]{12}$/);
    const line = JSON.stringify(ev[0]);
    for (const leak of ["الإجابة", "eyJhbG", "token", "student=s1", "سرّي", "سارة", "a@b.c", "teacher-1", "secret"]) expect(line, leak).not.toContain(leak);
  });
  it("a student session may report too (role student); a CSP report becomes client.csp_violation", async () => {
    const token = createStudentToken({ userId: "stu-1", authVersion: 1, code: "S1", displayName: "x", classId: "c1" });
    expect((await call(token, { kind: "csp", directive: "script-src", blocked: "inline" })).status).toBe(204);
    expect(logs.filter(l => l.event === "client.csp_violation")[0]).toMatchObject({ role: "student", directive: "script-src", blocked: "inline" });
  });
  it("too large → 413, unparsable or unusable → 400, and neither is logged as a client event", async () => {
    const t = createBuilderToken("teacher-1");
    expect((await call(t, "x".repeat(MAX_BODY_CHARS + 1))).status).toBe(413);
    expect((await call(t, "{not json")).status).toBe(400);
    expect((await call(t, { kind: "debug" })).status).toBe(400);
    expect(logs.filter(l => l.event.startsWith("client."))).toEqual([]);
  });
  it("volume: 30 reports per user per 10 minutes on this instance, then 429 until the window passes; other users unaffected", async () => {
    const t = createBuilderToken("teacher-1"), now = { v: 0 };
    const deps = { now: () => now.v };
    for (let i = 0; i < 30; i++) expect((await call(t, { kind: "runtime" }, deps)).status).toBe(204);
    expect((await call(t, { kind: "runtime" }, deps)).status).toBe(429);
    expect((await call(createBuilderToken("teacher-2"), { kind: "runtime" }, deps)).status).toBe(204);
    now.v = 10 * 60 * 1000;
    expect((await call(t, { kind: "runtime" }, deps)).status).toBe(204);
  });
});
