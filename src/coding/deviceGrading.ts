// Teacher-device grading (owner decision 2026-11-23, docs/enterprise-teacher-device-grading.md) — the OFFICIAL hidden-test grading
// of C# answers — and, since Python phase 2, of Python answers — runs on the TEACHER'S OWN COMPUTER, in the on-device lab of the answer's
// language (deviceCSharpLab.ts / devicePythonLab.ts), instead of on the Coding Runner VM.
//
// The device only EXECUTES: for each open C# / Python answer the server sends the source, the cases' stdin and the time limit (never expected
// outputs, weights or marks); the program runs once per case in a FRESH runtime per answer (one student's program can never meet
// another's), and the RAW evidence goes back. The server compares, weights and applies the mark with the Runner's own code.
//
// Fail safe, on both sides: a case that times out, hits the output limit, fails inside the lab, runs longer than the question's time
// limit, or uses an API the browser runtime cannot offer is NOT sent (the server would refuse it too) — the answer simply stays
// «قيد المراجعة» for the teacher (or the Runner), never a zero.
import type { CodeExecutionResult } from "../codingContract";
import { deviceCSharpRun } from "../studentTools/deviceCSharpLab";
import { devicePythonRun } from "../studentTools/devicePythonLab";
import { CSharpToolRunError } from "../studentTools/csharpToolRun";
import { TeacherHttpError } from "../teacherFetch";

export type DeviceJob = {
  attemptNumber: number; questionId: string; revision: number; ticket: string; language: string; languageVersion: number;
  source: string; cases: { token: string; stdin: string }[]; limits: { timeMs: number; outputBytes: number };
};
type Api = <T>(url: string, options?: RequestInit) => Promise<T>;
/** One run of a job's program on this device (no course library: the program the official grading runs). */
export type Run = (source: string, stdin: string, signal?: AbortSignal, opts?: { fresh?: boolean }) => Promise<CodeExecutionResult>;
/** The on-device lab of a job's language, or undefined (the server lists only C# and Python jobs; anything else is never run). */
export function labRunFor(language: string, languageVersion: number): Run | undefined {
  if (languageVersion !== 1) return undefined;
  if (language === "csharp") return (source, stdin, signal, opts) => deviceCSharpRun(source, stdin, "", signal, opts);
  if (language === "python") return (source, stdin, signal, opts) => devicePythonRun(source, stdin, signal, opts);
  return undefined;
}
/** graded: a mark was applied · review: a compile error the question sends to the teacher · held: stays «قيد المراجعة» (the device could
 *  not vouch for it) · failed: not reported (connection / server) · skipped: not for the device (another language, already graded). */
export type DeviceGradeSummary = { students: number; graded: number; review: number; held: number; failed: number; skipped: number };
export type DeviceGradeProgress = { student: number; students: number; answer: number; answers: number };
export type DeviceGradeOptions = { signal?: AbortSignal; onProgress?: (p: DeviceGradeProgress) => void; run?: (job: DeviceJob) => Run | undefined };

// The Runner callback's exact byte bounds (the server refuses more): compile stderr 32 KB, case stderr 4 KB.
const COMPILE_STDERR_BYTES = 32 * 1024, CASE_STDERR_BYTES = 4096;
const INCONCLUSIVE = new Set(["timeout", "output-limit", "internal-error"]);
// A runtime error the BROWSER caused, not the student's program (the server refuses the same: device-grading.js BROWSER_LIMIT).
const BROWSER_LIMIT = /PlatformNotSupported|can't start new thread|Function not implemented|emscripten|pyodide/i;
const URL_BASE = "/api/coding/device-grading";

export class DeviceGradingError extends Error {
  constructor(message: string) { super(message); this.name = "DeviceGradingError"; }
}
const LAB_TEXT = "تعذّر تشغيل المترجم على هذا الجهاز. تحقّق من الاتصال وحاول مرة أخرى.";

function utf8Prefix(s: string, maxBytes: number): string {
  let bytes = 0, end = 0;
  while (end < s.length) {
    const cp = s.codePointAt(end)!, w = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + w > maxBytes) break;
    bytes += w; end += cp > 0xffff ? 2 : 1;
  }
  return s.slice(0, end);
}

type Evidence = { compile: { status: "compiled" | "compile-error"; stderr?: string; durationMs?: number }; cases: { token: string; status: string; stdout: string; stderr: string; durationMs: number }[] };

/** Runs ONE job on this device. → the evidence to report, or null when the device cannot vouch for it (stays «قيد المراجعة»). */
export async function runDeviceJob(job: DeviceJob, run: Run, signal?: AbortSignal): Promise<Evidence | null> {
  const cases: Evidence["cases"] = [];
  for (let i = 0; i < job.cases.length; i++) {
    const c = job.cases[i];
    const r = await run(job.source, c.stdin, signal, { fresh: i === 0 });            // a fresh runtime for each student's answer
    if (r.status === "compile-error") {
      if (i > 0) return null;                                                             // compiled before: not a real compile verdict
      return { compile: { status: "compile-error", stderr: utf8Prefix(r.stderr, COMPILE_STDERR_BYTES) }, cases: [] };
    }
    if (INCONCLUSIVE.has(r.status)) return null;
    if (typeof r.durationMs !== "number" || r.durationMs > job.limits.timeMs) return null;
    if (r.status === "runtime-error" && BROWSER_LIMIT.test(r.stderr)) return null;
    cases.push({ token: c.token, status: r.status, stdout: r.stdout, stderr: utf8Prefix(r.stderr, CASE_STDERR_BYTES), durationMs: Math.round(r.durationMs) });
  }
  return { compile: { status: "compiled" }, cases };
}

async function gradeStudent(api: Api, assignmentId: string, studentId: string, sum: DeviceGradeSummary, at: { student: number; students: number }, opts: DeviceGradeOptions) {
  const r = await api<{ jobs: DeviceJob[]; skipped: number }>(URL_BASE + "?assignmentId=" + encodeURIComponent(assignmentId) + "&studentId=" + encodeURIComponent(studentId));
  sum.skipped += Number(r.skipped) || 0;
  const jobs = Array.isArray(r.jobs) ? r.jobs : [];
  for (let j = 0; j < jobs.length; j++) {
    if (opts.signal?.aborted) return;
    opts.onProgress?.({ ...at, answer: j + 1, answers: jobs.length });
    const job = jobs[j];
    const run = opts.run ? opts.run(job) : labRunFor(job.language, job.languageVersion);
    if (!run) { sum.skipped++; continue; }                                                 // not a language this device can run
    let ev: Evidence | null;
    try { ev = await runDeviceJob(job, run, opts.signal); }
    catch (e) {
      if (e instanceof CSharpToolRunError && e.code === "ABORTED") return;
      throw new DeviceGradingError(e instanceof CSharpToolRunError && e.message ? e.message : LAB_TEXT);   // the lab itself is unavailable: stop
    }
    if (!ev) { sum.held++; continue; }
    try {
      const res = await api<{ applied?: boolean; alreadyApplied?: boolean; state?: string }>(URL_BASE, { method: "POST", body: JSON.stringify({ assignmentId, studentId, attemptNumber: job.attemptNumber, questionId: job.questionId, revision: job.revision, ticket: job.ticket, ...ev }) });
      if (res.alreadyApplied) sum.skipped++;
      else if (res.state === "reviewRequired") sum.review++;
      else sum.graded++;
    } catch (e) {
      if (e instanceof TeacherHttpError && e.status === 422) sum.held++;                  // the server would not vouch for it either
      else if (e instanceof TeacherHttpError && e.status === 409) sum.skipped++;          // regraded / graded elsewhere meanwhile
      else if (e instanceof TeacherHttpError && e.status === 401) throw e;
      else sum.failed++;
    }
  }
}

const empty = (): DeviceGradeSummary => ({ students: 0, graded: 0, review: 0, held: 0, failed: 0, skipped: 0 });

/** «صحّح على جهازي» for ONE student: every open C# / Python answer of the student (each attempt). */
export async function gradeStudentOnDevice(api: Api, assignmentId: string, studentId: string, opts: DeviceGradeOptions = {}): Promise<DeviceGradeSummary> {
  const sum = empty();
  sum.students = 1;
  await gradeStudent(api, assignmentId, studentId, sum, { student: 1, students: 1 }, opts);
  return sum;
}

/** «صحّح جميع الطلاب على جهازي»: the students the server lists with open C# / Python answers, one after the other. */
export async function gradeAllOnDevice(api: Api, assignmentId: string, opts: DeviceGradeOptions = {}): Promise<DeviceGradeSummary> {
  const sum = empty();
  const list = await api<{ students: { studentId: string; jobs: number }[]; skipped: number }>(URL_BASE + "?assignmentId=" + encodeURIComponent(assignmentId));
  const students = Array.isArray(list.students) ? list.students : [];
  sum.students = students.length;
  sum.skipped += Number(list.skipped) || 0;
  for (let i = 0; i < students.length; i++) {
    if (opts.signal?.aborted) break;
    await gradeStudent(api, assignmentId, students[i].studentId, sum, { student: i + 1, students: students.length }, opts);
  }
  return sum;
}

const n = (k: number, one: string, many: string) => (k === 1 ? one : k + " " + many);
/** The teacher's notice after a device grading run (Arabic, counts only). */
export function deviceGradeNotice(s: DeviceGradeSummary): string {
  if (s.graded + s.review + s.held + s.failed === 0) return "لا توجد إجابات C# أو Python تنتظر التصحيح.";
  const parts = ["صُحّح على جهازك: " + n(s.graded, "إجابة واحدة", "إجابات") + "."];
  if (s.review) parts.push("خطأ ترجمة يحتاج قرارك: " + n(s.review, "إجابة واحدة", "إجابات") + ".");
  if (s.held) parts.push("بقيت «قيد المراجعة» (تجاوزت الوقت أو حدّ المخرجات على جهازك): " + n(s.held, "إجابة واحدة", "إجابات") + " — صحّحها يدويًّا أو بالمشغّل.");
  if (s.failed) parts.push("تعذّر إرسال نتيجة " + n(s.failed, "إجابة واحدة", "إجابات") + "؛ أعد المحاولة.");
  return parts.join(" ");
}
