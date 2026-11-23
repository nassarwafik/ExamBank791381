import { normalizeExecutionResult, type CodeExecutionResult } from "../codingContract";
import { CSharpToolRunError } from "./csharpToolRun";

// On-device Python lab (docs/enterprise-python-lab-spike.md; AGENTS.md §1 «On-device Python lab») — Python 3.13 (Pyodide, WebAssembly) on
// the user's own computer, served at /python-lab/, desktop only. The same design as the C# lab (deviceCSharpLab.ts): a hidden iframe
// with sandbox="allow-scripts" (an OPAQUE origin: no access to this app's storage, cookies or session), the interpreter in a Web Worker
// the lab terminates after 10 s and seals after boot (no network, no storage). Messages are accepted only from that iframe's window and
// only from the opaque origin ("null"). One lab per page, created on the first RUN (opening a question downloads nothing).
// Caching: the lab asks THIS page for the interpreter's heavy files (/python-lab/pyodide/<name>, the public Pyodide release, ~4.8 MB
// compressed), so this page's normal HTTP cache keeps them between visits. Only a plain file name, only under /python-lab/pyodide/.
// Owner decisions, the only places it is used: the «تشغيل» of a Python coding question in an exam (practice on the question's visible
// examples), and the teacher's «صحّح على جهازي» (src/coding/deviceGrading.ts) — which only EXECUTES; the server decides the mark.

export const PYTHON_LAB_URL = "/python-lab/index.html";
export const PYTHON_LAB_FILES = "/python-lab/pyodide/";
const LOAD_TIMEOUT_MS = 30000;          // the lab PAGE (small); the interpreter is fetched on the first run
const RUN_TIMEOUT_MS = 180000;          // the first run also downloads the interpreter (~4.8 MB, once)
const OUTPUT_BYTES = 16 * 1024;
const FILE_NAME = /^[A-Za-z0-9._-]{1,128}$/;

/** An interpreter file the lab asked for, from this page's cache; anything else (or any failure) is a refusal the lab falls back from. */
async function answerFetch(frame: HTMLIFrameElement, id: string, name: unknown): Promise<void> {
  const reply = (msg: Record<string, unknown>, transfer?: Transferable[]) => frame.contentWindow?.postMessage(msg, "*", transfer);
  if (typeof name !== "string" || !FILE_NAME.test(name) || name.startsWith(".")) { reply({ type: "fetched", id, error: true }); return; }
  try {
    const res = await fetch(PYTHON_LAB_FILES + name);
    if (!res.ok) throw new Error(String(res.status));
    const buffer = await res.arrayBuffer();
    reply({ type: "fetched", id, buffer }, [buffer]);
  } catch {
    reply({ type: "fetched", id, error: true });
  }
}

type Pending = { resolve: (raw: unknown) => void; timer: ReturnType<typeof setTimeout> };
type Lab = { frame: HTMLIFrameElement; ready: Promise<void>; pending: Map<string, Pending> };
let lab: Lab | null = null;
let seq = 0;

const unavailable = () => new CSharpToolRunError("PYTHON_LAB_UNAVAILABLE", "تعذّر تحميل مفسّر Python على هذا الجهاز. تحقّق من الاتصال وحاول مرة أخرى.");

function ensureLab(): Lab {
  if (lab) return lab;
  const frame = document.createElement("iframe");
  frame.src = PYTHON_LAB_URL;
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.title = "مختبر Python";
  frame.hidden = true;
  frame.dataset.testid = "python-lab";
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

/** ONE Python run on this device (the lab is created on the first call). `fresh`: a new interpreter for this run (teacher-device
 *  grading: each student's answer in its own interpreter). The program's own run time (runMs) is the case's duration. */
export async function devicePythonRun(source: string, stdin: string, signal?: AbortSignal, opts: { fresh?: boolean } = {}): Promise<CodeExecutionResult> {
  const l = ensureLab();
  try { await l.ready; } catch { throw unavailable(); }
  if (signal?.aborted) throw new CSharpToolRunError("ABORTED", "");
  const id = "py-" + (++seq);
  const result = await new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => { l.pending.delete(id); reject(unavailable()); }, RUN_TIMEOUT_MS);
    l.pending.set(id, { resolve, timer });
    signal?.addEventListener("abort", () => { clearTimeout(timer); l.pending.delete(id); reject(new CSharpToolRunError("ABORTED", "")); }, { once: true });
    l.frame.contentWindow?.postMessage({ type: "run", id, source, stdin, ...(opts.fresh ? { fresh: true } : {}) }, "*");
  });
  const raw = result && typeof result === "object" && !Array.isArray(result) ? (result as Record<string, unknown>) : null;
  return normalizeExecutionResult(raw && typeof raw.runMs === "number" && raw.durationMs === undefined ? { ...raw, durationMs: raw.runMs } : result, OUTPUT_BYTES);
}

/** Test seam: forget the page's lab. */
export function resetDevicePythonLabForTests(): void {
  lab?.frame.remove();
  lab = null;
}
