import { describe, it, expect, vi } from "vitest";
import { runDeviceJob, gradeAllOnDevice, gradeStudentOnDevice, deviceGradeNotice, DeviceGradingError, type DeviceJob } from "./deviceGrading";
import type { CodeExecutionResult } from "../codingContract";
import { TeacherHttpError } from "../teacherFetch";
import { CSharpToolRunError } from "../studentTools/csharpToolRun";

// Teacher-device grading — the client: the device only executes and reports raw evidence; what it cannot vouch for is never sent.
const job = (over: Partial<DeviceJob> = {}): DeviceJob => ({
  attemptNumber: 1, questionId: "q1", revision: 3, ticket: "dt_" + "a".repeat(40), language: "csharp", languageVersion: 1,
  source: "class P {}", cases: [{ token: "c01", stdin: "1 2\n" }, { token: "c02", stdin: "3 4\n" }], limits: { timeMs: 2000, outputBytes: 16384 }, ...over
});
const ok = (stdout: string, durationMs = 5): CodeExecutionResult => ({ status: "success", stdout, stderr: "", durationMs });
const runner = (...results: CodeExecutionResult[]) => vi.fn(async () => { const r = results.shift(); if (!r) throw new Error("no more"); return r; });

describe("runDeviceJob — one answer on this device", () => {
  it("runs each case once with its stdin, a FRESH runtime for the first case only, no course library; reports raw evidence", async () => {
    const run = runner(ok("3\n", 4.6), ok("7\n", 2));
    const ev = await runDeviceJob(job(), run);
    expect(run.mock.calls).toEqual([["class P {}", "1 2\n", "", undefined, { fresh: true }], ["class P {}", "3 4\n", "", undefined, { fresh: false }]]);
    expect(ev).toEqual({ compile: { status: "compiled" }, cases: [{ token: "c01", status: "success", stdout: "3\n", stderr: "", durationMs: 5 }, { token: "c02", status: "success", stdout: "7\n", stderr: "", durationMs: 2 }] });
  });
  it("a compile error on the first case is the compile verdict (no cases); stderr bounded to 32 KB", async () => {
    const ev = await runDeviceJob(job(), runner({ status: "compile-error", stdout: "", stderr: "é".repeat(40000) }));
    expect(ev!.compile.status).toBe("compile-error");
    expect(ev!.cases).toEqual([]);
    expect(new TextEncoder().encode(ev!.compile.stderr!).length).toBeLessThanOrEqual(32 * 1024);
  });
  it("a runtime error of the student's program is evidence (stderr bounded to 4 KB)", async () => {
    const ev = await runDeviceJob(job(), runner({ status: "runtime-error", stdout: "", stderr: "x".repeat(9000), durationMs: 3 }, ok("7\n")));
    expect(ev!.cases[0]).toMatchObject({ status: "runtime-error", stderr: "x".repeat(4096) });
  });
  for (const [name, r] of [
    ["timeout", { status: "timeout", stdout: "", stderr: "" }],
    ["timeout (even with a short duration)", { status: "timeout", stdout: "3\n", stderr: "", durationMs: 5 }],
    ["output limit", { status: "output-limit", stdout: "x", stderr: "", durationMs: 3 }],
    ["lab failure", { status: "internal-error", stdout: "", stderr: "" }],
    ["over the question's time limit", ok("3\n", 2001)],
    ["unknown duration", { status: "success", stdout: "3\n", stderr: "" }],
    ["an API the browser cannot offer", { status: "runtime-error", stdout: "", stderr: "System.PlatformNotSupportedException", durationMs: 1 }],
  ] as [string, CodeExecutionResult][]) {
    it("held, nothing to send: " + name, async () => {
      const run = runner(r, ok("7\n"));
      expect(await runDeviceJob(job(), run)).toBeNull();
      expect(run).toHaveBeenCalledTimes(1);                                   // stops at once
    });
  }
  it("a compile error AFTER a compiled case is not a verdict (held)", async () => {
    expect(await runDeviceJob(job(), runner(ok("3\n"), { status: "compile-error", stdout: "", stderr: "?" }))).toBeNull();
  });
});

describe("gradeAllOnDevice / gradeStudentOnDevice — the server decides", () => {
  function fakeApi(over: { post?: (body: Record<string, unknown>) => unknown } = {}) {
    const posts: Record<string, unknown>[] = [];
    const api = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") { const b = JSON.parse(String(options.body)); posts.push(b); return over.post ? over.post(b) : { ok: true, applied: true, state: "complete" }; }
      if (url.includes("studentId=s1")) return { ok: true, jobs: [job()], skipped: 0 };
      if (url.includes("studentId=s2")) return { ok: true, jobs: [job({ questionId: "q2" })], skipped: 1 };
      return { ok: true, students: [{ studentId: "s1", jobs: 1 }, { studentId: "s2", jobs: 1 }], skipped: 2, hasMore: false };
    });
    return { api: api as unknown as <T>(url: string, options?: RequestInit) => Promise<T>, calls: api, posts };
  }
  it("all students: lists, fetches each student's jobs, runs them, posts identifiers + raw evidence only; progress reported", async () => {
    const { api, calls, posts } = fakeApi();
    const progress: unknown[] = [];
    const sum = await gradeAllOnDevice(api, "A 1", { run: runner(ok("3\n"), ok("7\n"), ok("3\n"), ok("7\n")), onProgress: p => progress.push(p) });
    expect(calls.mock.calls[0][0]).toBe("/api/coding/device-grading?assignmentId=A%201");
    expect(calls.mock.calls[1][0]).toBe("/api/coding/device-grading?assignmentId=A%201&studentId=s1");
    expect(posts).toHaveLength(2);
    expect(Object.keys(posts[0]).sort()).toEqual(["assignmentId", "attemptNumber", "cases", "compile", "questionId", "revision", "studentId", "ticket"]);
    expect(posts[0]).toMatchObject({ assignmentId: "A 1", studentId: "s1", attemptNumber: 1, questionId: "q1", revision: 3, ticket: job().ticket });
    expect(sum).toEqual({ students: 2, graded: 2, review: 0, held: 0, failed: 0, skipped: 3 });
    expect(progress).toEqual([{ student: 1, students: 2, answer: 1, answers: 1 }, { student: 2, students: 2, answer: 1, answers: 1 }]);
  });
  it("server answers are counted honestly: reviewRequired, 422 held, 409 / already applied skipped, other errors failed", async () => {
    const answers: unknown[] = [{ ok: true, applied: true, state: "reviewRequired" }];
    const { api } = fakeApi({ post: () => { const a = answers.shift(); if (a instanceof Error) throw a; return a; } });
    expect(await gradeStudentOnDevice(api, "A", "s1", { run: runner(ok("3\n"), ok("7\n")) })).toMatchObject({ review: 1 });
    for (const [answer, key] of [[new TeacherHttpError("x", 422, "DEVICE_INCONCLUSIVE"), "held"], [new TeacherHttpError("x", 409, "STALE_RESULT"), "skipped"], [{ ok: true, alreadyApplied: true }, "skipped"], [new TeacherHttpError("x", 500), "failed"]] as const) {
      answers.push(answer);
      const s = await gradeStudentOnDevice(api, "A", "s1", { run: runner(ok("3\n"), ok("7\n")) });
      expect(s[key], key).toBe(1);
      expect(s.graded).toBe(0);
    }
  });
  it("held evidence is NEVER posted", async () => {
    const { api, posts } = fakeApi();
    const sum = await gradeStudentOnDevice(api, "A", "s1", { run: runner({ status: "timeout", stdout: "", stderr: "" }) });
    expect(posts).toEqual([]);
    expect(sum).toMatchObject({ held: 1, graded: 0 });
  });
  it("the lab itself unavailable stops the run with a clear Arabic message", async () => {
    const { api, posts } = fakeApi();
    const run = vi.fn(async () => { throw new CSharpToolRunError("LAB_UNAVAILABLE", "تعذّر تحميل المترجم على هذا الجهاز."); });
    await expect(gradeAllOnDevice(api, "A", { run })).rejects.toThrow(DeviceGradingError);
    expect(posts).toEqual([]);
  });
});

describe("deviceGradeNotice", () => {
  it("nothing open → says so; otherwise counts, with «قيد المراجعة» for what the device held", () => {
    expect(deviceGradeNotice({ students: 0, graded: 0, review: 0, held: 0, failed: 0, skipped: 2 })).toBe("لا توجد إجابات C# تنتظر التصحيح.");
    const t = deviceGradeNotice({ students: 3, graded: 4, review: 1, held: 1, failed: 0, skipped: 0 });
    expect(t).toContain("صُحّح على جهازك: 4 إجابات.");
    expect(t).toContain("خطأ ترجمة يحتاج قرارك: إجابة واحدة.");
    expect(t).toContain("قيد المراجعة");
  });
});
