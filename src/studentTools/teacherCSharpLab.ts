import { normalizeExecutionResult, type CodeExecutionResult } from "../codingContract";
import { CSharpToolRunError, type CSharpToolRunner } from "./csharpToolRun";

// Teacher C# lab (docs/enterprise-teacher-csharp-lab-spike.md; AGENTS.md §1 «Teacher C# lab») — the TEACHER's book editor runs C#
// on the teacher's own computer: Roslyn on .NET WebAssembly, served at /csharp-lab/ and loaded ONLY here, only for the teacher actor
// (LearningReaderWithTraining actor="teacher"). Never students, never exams, never grading — those keep their server paths.
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
 *  phone or tablet the teacher's editor stays exactly as it was (the Runner path). Presentation only, read when the dock mounts. */
export const DESKTOP_QUERY = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
export function isDesktopViewport(): boolean {
  try { return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_QUERY).matches; } catch { return false; }
}
const LOAD_TIMEOUT_MS = 30000;          // the lab PAGE (small); the runtime is fetched on the first run
const RUN_TIMEOUT_MS = 180000;          // the first run also downloads the compiler (~12 MB, once)
const OUTPUT_BYTES = 16 * 1024;
export const LAB_FILES = "/csharp-lab/_framework/";
const FILE_NAME = /^[A-Za-z0-9._-]{1,128}$/;

/** A runtime file the lab asked for, from this page's cache; anything else (or any failure) is a refusal the lab falls back from. */
async function answerFetch(frame: HTMLIFrameElement, id: string, name: unknown): Promise<void> {
  const reply = (msg: Record<string, unknown>, transfer?: Transferable[]) => frame.contentWindow?.postMessage(msg, "*", transfer);
  if (typeof name !== "string" || !FILE_NAME.test(name) || name.startsWith(".")) { reply({ type: "fetched", id, error: true }); return; }
  try {
    const res = await fetch(LAB_FILES + name);
    if (!res.ok) throw new Error(String(res.status));
    const buffer = await res.arrayBuffer();
    reply({ type: "fetched", id, buffer }, [buffer]);
  } catch {
    reply({ type: "fetched", id, error: true });
  }
}

type Pending = { resolve: (r: CodeExecutionResult) => void; timer: ReturnType<typeof setTimeout> };
type Lab = { frame: HTMLIFrameElement; ready: Promise<void>; pending: Map<string, Pending> };
let lab: Lab | null = null;
let seq = 0;

const unavailable = () => new CSharpToolRunError("LAB_UNAVAILABLE", "تعذّر تحميل المترجم على هذا الجهاز. تحقّق من الاتصال وحاول مرة أخرى.");

function ensureLab(): Lab {
  if (lab) return lab;
  const frame = document.createElement("iframe");
  frame.src = LAB_URL;
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
      p.resolve(normalizeExecutionResult(m.result, OUTPUT_BYTES));
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

/** The teacher's on-device runner for one book: `headers` are the teacher reader's session headers (for the book's classes only). */
export function teacherLabRunner(courseId: string, headers: Record<string, string>): CSharpToolRunner {
  const library = libraryLoader(courseId, headers);
  return {
    where: "device",
    available: async () => true,
    async run(source, stdin, signal) {
      let lib: string;
      try { lib = await library(); } catch { throw new CSharpToolRunError("LIBRARY_UNAVAILABLE", "تعذّر تحميل فئات الكتاب (Stack وQueue وNode…). تحقّق من الاتصال وحاول مرة أخرى."); }
      const l = ensureLab();
      try { await l.ready; } catch { throw unavailable(); }
      if (signal?.aborted) throw new CSharpToolRunError("ABORTED", "");
      const id = "run-" + (++seq);
      return new Promise<CodeExecutionResult>((resolve, reject) => {
        const timer = setTimeout(() => { l.pending.delete(id); reject(unavailable()); }, RUN_TIMEOUT_MS);
        l.pending.set(id, { resolve, timer });
        signal?.addEventListener("abort", () => { clearTimeout(timer); l.pending.delete(id); reject(new CSharpToolRunError("ABORTED", "")); }, { once: true });
        l.frame.contentWindow?.postMessage({ type: "run", id, source, stdin, library: lib }, "*");
      });
    },
  };
}

/** Test seam: forget the page's lab (unit tests mount and unmount many readers). */
export function resetTeacherLabForTests(): void {
  lab?.frame.remove();
  lab = null;
}
