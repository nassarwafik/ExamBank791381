// Teacher C# lab — the bridge between the teacher's book editor (the PARENT page) and the runtime worker.
// Runs inside the sandboxed iframe (opaque origin). Protocol with the parent (window.postMessage):
//   ← { type: "run", id, source, stdin, library }       → { type: "result", id, result: { status, stdout, stderr, compileMs, runMs } }
//   → { type: "lab-ready" } once, when this page has loaded (the runtime itself starts on the first run).
//   → { type: "fetch", id, name }  ← { type: "fetched", id, buffer } | { type: "fetched", id, error: true }
//     The runtime's heavy files (_framework/<name>: the .NET runtime and assemblies, ~11 MB) are fetched BY THE PARENT: an
//     opaque-origin frame's HTTP cache is keyed to that one frame, so it would download them again on every visit, while the
//     parent's cache keeps them (ETag revalidation). Names are checked here and again by the parent.
// • The runtime lives in a WORKER created from a blob (an opaque-origin page cannot start a worker from a URL); a program that
//   does not finish within RUN_LIMIT_MS is stopped by terminating the worker → status "timeout", and the next run starts a fresh one.
//   A result marked «fatal» (the runtime ended itself, e.g. a stack overflow) also replaces the worker.
// • The course library (the book's classes) arrives IN the message: the parent reads it from the API with the teacher's session —
//   course content is never a public file, and this opaque-origin page has no session of its own.
// • Only messages from the parent window are answered.
const RUN_LIMIT_MS = 10000;        // compile + run of one program (the first run also starts the runtime: not counted)
const FILE_NAME = /^[A-Za-z0-9._-]{1,128}$/;
const base = new URL(".", import.meta.url).href;
let worker = null, workerReady = null, onResult = null;
const queue = [];
let busy = false;
let fetchSeq = 0;
const fetches = new Map();         // parent fetch id → the worker that asked (and its own request id)

// A CLASSIC worker from a blob that loads worker.js (an ES module) with a dynamic import(): in an opaque-origin page a MODULE worker
// from a blob fails to start (Chromium, proven by the lab's probe), while a classic one with import() works.
function startWorker() {
  const src = JSON.stringify(new URL("worker.js", base).href);
  const blob = new Blob(["import(" + src + ").catch(e => postMessage({ type: \"boot-error\", message: String(e && e.message || e) }));"], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const w = new Worker(url);
  worker = w;
  workerReady = new Promise((resolve, reject) => {
    w.onmessage = e => {
      const m = e.data || {};
      if (m.type === "ready") { URL.revokeObjectURL(url); resolve(); }
      else if (m.type === "boot-error") reject(new Error(m.message));
      else if (m.type === "result" && w === worker && onResult) onResult(m.result, m.fatal === true);
      else if (m.type === "fetch") {
        const id = "f" + (++fetchSeq);
        if (typeof m.name !== "string" || !FILE_NAME.test(m.name)) { w.postMessage({ type: "fetched", id: m.id, error: true }); return; }
        fetches.set(id, { w, workerId: m.id });
        window.parent.postMessage({ type: "fetch", id, name: m.name }, "*");
      }
    };
    w.onerror = e => reject(new Error(e.message || "worker failed"));
  });
}

function runOnce(m) {
  return new Promise(async resolve => {
    try {
      if (!worker) startWorker();
      await workerReady;
    } catch (e) {
      worker = null;
      resolve({ status: "internal-error", stdout: "", stderr: "تعذّر تشغيل المترجم على هذا الجهاز: " + (e && e.message || e), compileMs: 0, runMs: 0 });
      return;
    }
    const timer = setTimeout(() => {
      onResult = null;
      worker.terminate();
      worker = null;
      resolve({ status: "timeout", stdout: "", stderr: "", compileMs: 0, runMs: RUN_LIMIT_MS });
    }, RUN_LIMIT_MS);
    onResult = (result, fatal) => {
      onResult = null;
      clearTimeout(timer);
      // The runtime ended itself (a stack overflow): this worker is gone for good — replace it before the next run.
      if (fatal) { worker.terminate(); worker = null; }
      resolve(result);
    };
    worker.postMessage({ type: "run", source: m.source, stdin: m.stdin, library: m.library });
  });
}

async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const m = queue.shift();
    const result = await runOnce(m);
    window.parent.postMessage({ type: "result", id: m.id, result }, "*");
  }
  busy = false;
}

window.addEventListener("message", event => {
  if (event.source !== window.parent) return;
  const m = event.data || {};
  if (m.type === "fetched" && typeof m.id === "string" && fetches.has(m.id)) {
    const { w, workerId } = fetches.get(m.id);
    fetches.delete(m.id);
    if (m.buffer instanceof ArrayBuffer) w.postMessage({ type: "fetched", id: workerId, buffer: m.buffer }, [m.buffer]);
    else w.postMessage({ type: "fetched", id: workerId, error: true });
    return;
  }
  if (m.type !== "run" || typeof m.id !== "string" || typeof m.source !== "string") return;
  queue.push({ id: m.id, source: m.source, stdin: typeof m.stdin === "string" ? m.stdin : "", library: typeof m.library === "string" ? m.library : "" });
  pump();
});
window.parent.postMessage({ type: "lab-ready" }, "*");
