import { normalizeExecutionResult, type CodeExecutionResult } from "../codingContract";
import { bookCSharpRunner, CSharpToolRunError, type CSharpToolRunner } from "./csharpToolRun";
import { readLabTrace, type LabTraceOptions, type LabTraceResult } from "./labTrace";

// On-device C# lab (docs/enterprise-teacher-csharp-lab-spike.md; AGENTS.md §1 «On-device C# lab») — PRACTICE runs of C# on the user's
// own computer, on a DESKTOP only (isDesktopViewport): Roslyn on .NET WebAssembly, served at /csharp-lab/. Owner decisions, the only
// places it is used:
//   • the C# editor of the tool bar in a COURSE BOOK, for the teacher and for students (bookDeviceRunner);
//   • the «تشغيل» of a C# CODING QUESTION in an exam — practice on the question's visible examples only (deviceLabs.ts withDeviceLabs);
//   • the TEACHER's «صحّح على جهازي» (src/coding/deviceGrading.ts, docs/enterprise-teacher-device-grading.md): it only EXECUTES the
//     official cases and reports raw evidence; the server compares, weights and decides the mark.
// Never the tool bar's editor in an exam (write only); never a mark decided here.
//
// Isolation: the lab page lives in a hidden iframe with sandbox="allow-scripts" — an OPAQUE origin, so the code it runs cannot reach
// this app's storage, cookies or session; its runtime runs in a Web Worker the lab terminates after 10 s (an endless program never
// freezes this page). Messages are accepted only from that iframe's window and only from the opaque origin ("null").
// One lab per page; it is created on the first RUN (opening the editor downloads nothing).
// Caching: an opaque-origin frame's HTTP cache lives and dies with that frame, so the lab asks THIS page for the runtime's heavy files
// (/csharp-lab/_framework/<name>, the public .NET runtime and assemblies, ~11 MB): this page's normal HTTP cache keeps them between
// visits (ETag revalidation). Only a plain file name is accepted, only from the lab's window, and only under /csharp-lab/_framework/.
// The book's classes (Node, Stack, Queue, BinNode … — course content) come from the API with the teacher's session
// (GET /api/student-tools/csharp-run?library=<courseId>) and travel in the run message: they are never a public file.

export const LAB_URL = "/csharp-lab/index.html";

/** DESKTOP ONLY (owner decision 2026-11-23, docs/enterprise-csharp-visual-lab-plan.md): a wide screen with a precise pointer. On a
 *  phone or tablet the book editor and the exam question's practice stay exactly as they were (the Runner path). Presentation only,
 *  read when the dock / the question mounts. */
export const DESKTOP_QUERY = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
export function isDesktopViewport(): boolean {
  try { return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_QUERY).matches; } catch { return false; }
}
const LOAD_TIMEOUT_MS = 30000;          // the lab PAGE (small); the runtime is fetched on the first run
const RUN_TIMEOUT_MS = 180000;          // the first run also downloads the compiler (~12 MB, once)
const OUTPUT_BYTES = 16 * 1024;
export const LAB_FILES = "/csharp-lab/_framework/";
const FILE_NAME = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Visual lab V14 (docs/enterprise-csharp-visual-lab-plan.md §24) — the offline lab page (/lab.html) writes the lab's frame FROM TEXT
 * (`srcdoc`: tools/csharp-lab/wwwroot/main.js, byte for byte, which that page's policy allows by its hash): a frame loaded from a URL
 * never reaches the service worker, so it could not start offline. Same sandbox (allow-scripts only: an opaque origin). In that mode
 * the frame also asks for the lab's worker.js (its other modules are runtime files). Never used by the app's own pages.
 */
let inlineScript: string | null = null;
export function inlineLabFrame(script: string): void {
  if (/<\/script/i.test(script)) throw new Error("the lab frame's script cannot be written inline");
  inlineScript = script;
}

/** A runtime file the lab asked for, from this page's cache; anything else (or any failure) is a refusal the lab falls back from. */
async function answerFetch(frame: HTMLIFrameElement, id: string, name: unknown): Promise<void> {
  const reply = (msg: Record<string, unknown>, transfer?: Transferable[]) => frame.contentWindow?.postMessage(msg, "*", transfer);
  if (typeof name !== "string" || !FILE_NAME.test(name) || name.startsWith(".")) { reply({ type: "fetched", id, error: true }); return; }
  try {
    const res = await fetch(inlineScript !== null && name === "worker.js" ? "/csharp-lab/worker.js" : LAB_FILES + name);
    if (!res.ok) throw new Error(String(res.status));
    const buffer = await res.arrayBuffer();
    reply({ type: "fetched", id, buffer }, [buffer]);
  } catch {
    reply({ type: "fetched", id, error: true });
  }
}

/** `resolve` gets the lab's raw result: a run normalises it (deviceCSharpRun), a trace reads it (deviceCSharpTrace). */
type Pending = { resolve: (raw: unknown) => void; timer: ReturnType<typeof setTimeout> };
type Lab = { frame: HTMLIFrameElement; ready: Promise<void>; pending: Map<string, Pending> };
let lab: Lab | null = null;
let seq = 0;

const unavailable = () => new CSharpToolRunError("LAB_UNAVAILABLE", "تعذّر تحميل المترجم على هذا الجهاز. تحقّق من الاتصال وحاول مرة أخرى.");

function ensureLab(): Lab {
  if (lab) return lab;
  const frame = document.createElement("iframe");
  if (inlineScript !== null) frame.srcdoc = '<!doctype html><meta charset="utf-8"><title>C# lab</title><script type="module">' + inlineScript + "</script>";
  else frame.src = LAB_URL;
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.title = "مختبر C#";
  frame.hidden = true;
  frame.dataset.testid = "teacher-csharp-lab";
  const pending = new Map<string, Pending>();
  let resolveReady: () => void = () => {};
  let rejectReady: (e: Error) => void = () => {};
  const ready = new Promise<void>((res, rej) => { resolveReady = res; rejectReady = rej; });
  const loadTimer = setTimeout(() => rejectReady(new Error("lab load timeout")), LOAD_TIMEOUT_MS);
  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow || e.origin !== "null") return;
    const m = (e.data ?? {}) as { type?: unknown; id?: unknown; result?: unknown; name?: unknown };
    if (m.type === "lab-ready") { clearTimeout(loadTimer); resolveReady(); return; }
    if (m.type === "fetch" && typeof m.id === "string") { void answerFetch(frame, m.id, m.name); return; }
    if (m.type === "result" && typeof m.id === "string") {
      const p = pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(m.id);
      p.resolve(m.result);
    }
  };
  window.addEventListener("message", onMessage);
  const created: Lab = { frame, ready, pending };
  ready.catch(() => { window.removeEventListener("message", onMessage); frame.remove(); if (lab === created) lab = null; });
  document.body.appendChild(frame);
  lab = created;
  return created;
}

/** The book's classes for the lab, read once per runner with the teacher's session; a book without classes → "". */
function libraryLoader(courseId: string, headers: Record<string, string>): () => Promise<string> {
  let loaded: Promise<string> | null = null;
  return () => {
    if (!loaded) {
      loaded = (async () => {
        const res = await fetch("/api/student-tools/csharp-run?library=" + encodeURIComponent(courseId), { headers });
        const body = (await res.json().catch(() => ({}))) as { ok?: unknown; library?: unknown };
        if (res.status === 404) return "";
        if (!res.ok || body.ok !== true || typeof body.library !== "string") throw new Error("library " + res.status);
        return body.library;
      })();
      loaded.catch(() => { loaded = null; });                 // a failure is not remembered: the next run asks again
    }
    return loaded;
  };
}

/** ONE run on this device (the lab is created on the first call). `library`: the book's classes, or "". `fresh`: start a new runtime
 *  for this run (teacher-device grading: each student's answer in its own runtime). */
export async function deviceCSharpRun(source: string, stdin: string, library: string, signal?: AbortSignal, opts: { fresh?: boolean } = {}): Promise<CodeExecutionResult> {
  const l = ensureLab();
  try { await l.ready; } catch { throw unavailable(); }
  if (signal?.aborted) throw new CSharpToolRunError("ABORTED", "");
  const result = await post(l, { type: "run", source, stdin, library, ...(opts.fresh ? { fresh: true } : {}) }, signal);
  // the lab reports the program's own run time as runMs (compile excluded): it is the case's duration
  const raw = result && typeof result === "object" && !Array.isArray(result) ? (result as Record<string, unknown>) : null;
  return normalizeExecutionResult(raw && typeof raw.runMs === "number" && raw.durationMs === undefined ? { ...raw, durationMs: raw.runMs } : result, OUTPUT_BYTES);
}

/** One message to the lab and its raw answer (time-out → unavailable; abort → ABORTED). */
function post(l: Lab, message: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const id = "run-" + (++seq);
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => { l.pending.delete(id); reject(unavailable()); }, RUN_TIMEOUT_MS);
    l.pending.set(id, { resolve, timer });
    signal?.addEventListener("abort", () => { clearTimeout(timer); l.pending.delete(id); reject(new CSharpToolRunError("ABORTED", "")); }, { once: true });
    l.frame.contentWindow?.postMessage({ ...message, id }, "*");
  });
}

/** Visual lab V3 — ONE program RECORDED step by step on this device (the lab's trace recorder, tools/csharp-lab/Tracer.cs), read
 *  strictly into the course's trace shape (labTrace.ts). Same lab, same isolation and time limit as a run. */
export async function deviceCSharpTrace(source: string, stdin: string, library: string, signal?: AbortSignal, options: LabTraceOptions = {}): Promise<LabTraceResult> {
  const l = ensureLab();
  try { await l.ready; } catch { throw unavailable(); }
  if (signal?.aborted) throw new CSharpToolRunError("ABORTED", "");
  const result = await post(l, { type: "trace", source, stdin, library, options: JSON.stringify({ rich: true, ...(options.inside ? { inside: true } : {}) }) }, signal);
  return readLabTrace(result, source, stdin);
}

/** The book editor's on-device runner (teacher and students): `headers` are the reader's session headers, used ONLY to read the
 *  book's classes from the API, which checks the reader (a teacher entitled to the course; a student whose class offers the book
 *  with running allowed). */
export function bookDeviceRunner(courseId: string, headers: Record<string, string>, opts: { visual?: boolean } = {}): CSharpToolRunner {
  const library = libraryLoader(courseId, headers);
  const lib = async () => {
    try { return await library(); } catch { throw new CSharpToolRunError("LIBRARY_UNAVAILABLE", "تعذّر تحميل فئات الكتاب (Stack وQueue وNode…). تحقّق من الاتصال وحاول مرة أخرى."); }
  };
  return {
    where: "device",
    available: async () => true,
    async run(source, stdin, signal) {
      const result = await deviceCSharpRun(source, stdin, await lib(), signal);
      return viaRunner(result, () => bookCSharpRunner(headers, courseId).run(source, stdin, signal), signal);   // V6: LAB0001 → the Runner
    },
    // Visual lab V3: the TEACHER's reader only (`visual`, set by the dock from the reader's actor) — the plan keeps students for V7.
    ...(opts.visual ? { async trace(source: string, stdin: string, signal?: AbortSignal, options?: LabTraceOptions) { return deviceCSharpTrace(source, stdin, await lib(), signal, options); } } : {}),
  };
}

/**
 * Visual lab V6 (docs/enterprise-csharp-visual-lab-plan.md §14) — the lab refused this program BEFORE running it because it needs a
 * library the lab's trimmed download leaves out (LAB0001, tools/csharp-lab/Lab.cs). The Runner has every library: practice runs then
 * go to it (the book editor here, the exam question in deviceLabs.ts). Teacher-device grading never falls back: a compile error is
 * refused by the API and stays in teacher review.
 */
export const leftOutOfLab = (r: CodeExecutionResult) => r.status === "compile-error" && /\bLAB0001\b/.test(r.stderr);

/** A practice run the lab refused (LAB0001) asked of the Runner instead; if the Runner cannot answer, the lab's own answer stands. */
export async function viaRunner(labResult: CodeExecutionResult, runner: () => Promise<CodeExecutionResult>, signal?: AbortSignal): Promise<CodeExecutionResult> {
  if (!leftOutOfLab(labResult)) return labResult;
  try { return await runner(); }
  catch (e) { if (signal?.aborted || (e instanceof CSharpToolRunError && e.code === "ABORTED")) throw e; return labResult; }
}

/** V14 — the offline lab page's runner: the learner's own program on this device, no book classes (no request at all), and the
 *  visual run. A program needing a library the lab leaves out is refused by the lab (LAB0001): offline there is no Runner to ask. */
export function plainDeviceRunner(): CSharpToolRunner {
  return {
    where: "device",
    available: async () => true,
    run: (source, stdin, signal) => deviceCSharpRun(source, stdin, "", signal),
    trace: (source, stdin, signal, options) => deviceCSharpTrace(source, stdin, "", signal, options),
  };
}

/** Test seam: forget the page's lab (unit tests mount and unmount many readers). */
export function resetDeviceLabForTests(): void {
  lab?.frame.remove();
  lab = null;
  inlineScript = null;
}
