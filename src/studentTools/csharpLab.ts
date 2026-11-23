import { normalizeExecutionResult } from "../codingContract";
import { CSharpToolRunError, type CSharpToolRunner } from "./csharpToolRun";

// Teacher C# lab, phase V1 (docs/enterprise-csharp-visual-lab-plan.md; AGENTS.md §10 «Teacher C# lab») — the book reader's C# editor,
// for a TEACHER on a DESKTOP, runs the program IN THE TEACHER'S BROWSER instead of on the Coding Runner: Microsoft's real C# compiler
// (Roslyn on .NET WebAssembly, tools/csharp-lab) in a hidden same-origin frame (/csharp-lab/index.html, its own strict policy with
// 'wasm-unsafe-eval'; the site's policy is unchanged), which runs every program in a dedicated, network-sealed worker with a hard time
// limit. Nothing is sent to a server but ONE read: the book's classes (GET /api/teacher-tools/csharp-lab, a teacher session only).
// Never a student's tool, never an exam, never grading. Presentation only: who may read the book's classes is the server's decision.
// Light on purpose (no React): CourseToolDock imports it.

export const LAB_PATH = "/csharp-lab/index.html";
const LIBRARY_PATH = "/api/teacher-tools/csharp-lab";
/** The frame must say hello this long after it was added, or the lab is not deployed here (the editor then says so). */
export const HELLO_TIMEOUT_MS = 15000;
/** The runtime's first start downloads ~11 MB (once; then the browser's cache). Past this the lab is reported unavailable. */
export const READY_TIMEOUT_MS = 120000;
/** The bridge's run limit (tools/csharp-lab/wwwroot/bridge.js RUN_TIMEOUT_MS), shown in the editor's time-out message. */
export const LAB_TIMEOUT_SECONDS = 10;
const OUTPUT_BYTES = 64 * 1024;   // the lab cuts each stream at 16 K characters; this only bounds what the page accepts

/** Desktop only (owner decision): a wide screen with a precise pointer. Presentation only — a phone keeps the editor as it was. */
export const DESKTOP_QUERY = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
export function isDesktopViewport(): boolean {
  try { return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_QUERY).matches; } catch { return false; }
}

export type LabRunner = CSharpToolRunner & { dispose(): void };
type Frame = { window: Window | null; remove(): void };
/** Test seam: how the hidden frame is made (production: an <iframe> on document.body). */
export type FrameFactory = (src: string) => Frame;

const defaultFrame: FrameFactory = src => {
  const f = document.createElement("iframe");
  f.src = src;
  f.title = "مختبر C#";
  f.hidden = true;
  f.tabIndex = -1;
  f.setAttribute("aria-hidden", "true");
  f.dataset.testid = "csharp-lab-frame";
  document.body.appendChild(f);
  return { get window() { return f.contentWindow; }, remove: () => f.remove() };
};

type Waiter = { resolve(r: unknown): void; reject(e: Error): void };

/** The teacher's lab for one book: the session's auth headers (only for the library read) and the course. */
export function teacherCSharpLab(headers: Record<string, string>, courseId: string, makeFrame: FrameFactory = defaultFrame): LabRunner {
  const origin = typeof location !== "undefined" ? location.origin : "";
  let frame: Frame | null = null;
  let hello = false, state: "booting" | "ready" | "failed" | "none" = "none";
  let readyWaiters: ((up: boolean) => void)[] = [];
  let helloTimer: ReturnType<typeof setTimeout> | undefined, readyTimer: ReturnType<typeof setTimeout> | undefined;
  const runs = new Map<number, Waiter>();
  let nextId = 1;
  let library: Promise<string> | null = null;

  const settleReady = (up: boolean) => { const w = readyWaiters; readyWaiters = []; w.forEach(f => f(up)); };
  const post = (message: object) => frame?.window?.postMessage(message, origin);

  const onMessage = (event: MessageEvent) => {
    if (!frame || event.origin !== origin || event.source !== frame.window) return;
    const m = event.data as { type?: unknown; state?: unknown; id?: unknown; result?: unknown } | null;
    if (!m || typeof m !== "object") return;
    if (m.type === "csharp-lab:hello") { hello = true; clearTimeout(helloTimer); post({ type: "csharp-lab:warm" }); return; }
    if (m.type === "csharp-lab:state" && (m.state === "booting" || m.state === "ready" || m.state === "failed")) {
      state = m.state;
      if (state === "ready") { clearTimeout(readyTimer); settleReady(true); }
      if (state === "failed") { clearTimeout(readyTimer); settleReady(false); }
      return;
    }
    if (m.type === "csharp-lab:result" && typeof m.id === "number" && runs.has(m.id)) {
      const w = runs.get(m.id)!;
      runs.delete(m.id);
      w.resolve(m.result);
    }
  };

  function ensureFrame() {
    if (frame) return;
    window.addEventListener("message", onMessage);
    frame = makeFrame(LAB_PATH);
    helloTimer = setTimeout(() => { if (!hello) { state = "failed"; settleReady(false); } }, HELLO_TIMEOUT_MS);
    readyTimer = setTimeout(() => { if (state !== "ready") { state = "failed"; settleReady(false); } }, READY_TIMEOUT_MS);
  }

  async function readLibrary(): Promise<string> {
    let res: Response;
    try { res = await fetch(LIBRARY_PATH + "?courseId=" + encodeURIComponent(courseId), { headers, cache: "no-store" }); }
    catch { throw new CSharpToolRunError("NETWORK", "تعذّر الاتصال بالخادم لتحميل فئات الكتاب. تحقّق من الاتصال وحاول مرة أخرى."); }
    let body: { ok?: unknown; library?: unknown; code?: unknown; error?: unknown } = {};
    try { body = await res.json(); } catch { body = {}; }
    if (res.ok && body.ok === true && typeof body.library === "string") return body.library;
    throw new CSharpToolRunError(typeof body.code === "string" ? body.code : "LAB_UNAVAILABLE",
      typeof body.error === "string" && body.error ? body.error : "تعذّر تحميل فئات الكتاب لمختبر C#.");
  }

  return {
    mode: "lab",
    timeoutSeconds: LAB_TIMEOUT_SECONDS,
    available() {
      ensureFrame();
      if (state === "ready") return Promise.resolve(true);
      if (state === "failed") {
        // «التحقق مرة أخرى»: a fresh frame (a deployment may have arrived, or the network is back).
        this.dispose();
        ensureFrame();
      }
      return new Promise<boolean>(resolve => { readyWaiters.push(resolve); });
    },
    async run(source, stdin, signal) {
      ensureFrame();
      if (!library) library = readLibrary().catch(e => { library = null; throw e; });
      const lib = await library;
      if (signal?.aborted) throw new CSharpToolRunError("ABORTED", "أُلغي التشغيل.");
      const id = nextId++;
      const raw = await new Promise<unknown>((resolve, reject) => {
        runs.set(id, { resolve, reject });
        signal?.addEventListener("abort", () => {
          if (!runs.has(id)) return;
          runs.delete(id);
          post({ type: "csharp-lab:cancel" });
          reject(new CSharpToolRunError("ABORTED", "أُلغي التشغيل."));
        }, { once: true });
        post({ type: "csharp-lab:run", id, source, stdin, library: lib });
      });
      const r = normalizeExecutionResult(raw, OUTPUT_BYTES);
      if (r.status === "internal-error") throw new CSharpToolRunError("LAB_UNAVAILABLE", "تعذّر التشغيل في مختبر C#. حاول مرة أخرى.");
      return r;
    },
    dispose() {
      clearTimeout(helloTimer); clearTimeout(readyTimer);
      if (typeof window !== "undefined") window.removeEventListener("message", onMessage);
      frame?.remove();
      frame = null; hello = false; state = "none";
      settleReady(false);
      for (const w of runs.values()) w.reject(new CSharpToolRunError("ABORTED", "أُلغي التشغيل."));
      runs.clear();
    }
  };
}
