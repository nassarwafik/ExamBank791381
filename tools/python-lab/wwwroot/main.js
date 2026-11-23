// Python lab — the bridge between the parent page and the Python worker. Same protocol as the C# lab (tools/csharp-lab/wwwroot/main.js):
//   ← { type: "run", id, source, stdin, fresh? }   → { type: "result", id, result: { status, stdout, stderr, compileMs, runMs } }
//   → { type: "lab-ready" } once, when this page has loaded (the runtime starts on the first run).
//   → { type: "fetch", id, name }  ← { type: "fetched", id, buffer } | { type: "fetched", id, error: true }
//     The interpreter's heavy files (pyodide/<name>: the WebAssembly runtime and the standard library, ~4.8 MB compressed) are fetched
//     BY THE PARENT: an opaque-origin frame's HTTP cache is keyed to that one frame, so it would download them again on every visit,
//     while the parent's cache keeps them (ETag revalidation). Names are checked here and again by the parent.
// • CPython (Pyodide) runs in a WORKER created from a blob (an opaque-origin page cannot start a worker from a URL): a classic blob
//   worker that import()s worker.js (a module blob worker fails in an opaque origin, as the C# lab found).
// • A program that does not finish within RUN_LIMIT_MS is stopped by terminating the worker → "timeout"; the next run starts a new one.
// • A result marked «fatal» (the runtime itself failed) also replaces the worker. `fresh` starts a new runtime for that run.
// • Only messages from the parent window are answered.
const RUN_LIMIT_MS = 10000;        // one program (the first run also starts the runtime: not counted)
const FILE_NAME = /^[A-Za-z0-9._-]{1,128}$/;
const base = new URL(".", import.meta.url).href;
let worker = null, workerReady = null, onResult = null;
const queue = [];
let busy = false;
let fetchSeq = 0;
const fetches = new Map();         // parent fetch id → the worker that asked (and its own request id)

function startWorker() {
  const src = JSON.stringify(new URL("worker.js", base).href);
  const blob = new Blob(["import(" + src + ").catch(e => postMessage({ type: \"boot-error\", message: String(e && e.message || e) }));"], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const w = new Worker(url);
  worker = w;
  workerReady = new Promise((resolve, reject) => {
    w.onmessage = e => {
      const m = e.data || {};
      if (m.type === "ready") { URL.revokeObjectURL(url); resolve(m); }
      else if (m.type === "boot-error") reject(new Error(m.message));
      else if (m.type === "result" && w === worker && onResult) onResult(m.result, m.fatal === true);
      else if (m.type === "fetch") {
        const id = "f" + (++fetchSeq);
        if (typeof m.name !== "string" || !FILE_NAME.test(m.name) || m.name.startsWith(".")) { w.postMessage({ type: "fetched", id: m.id, error: true }); return; }
        fetches.set(id, { w, workerId: m.id });
        window.parent.postMessage({ type: "fetch", id, name: m.name }, "*");
      }
    };
    w.onerror = e => reject(new Error(e.message || "worker failed"));
  });
}

function runOnce(m) {
  return new Promise(async resolve => {
    if (m.fresh && worker) { onResult = null; worker.terminate(); worker = null; }
    let ready;
    try {
      if (!worker) startWorker();
      ready = await workerReady;
    } catch (e) {
      worker = null;
      resolve({ status: "internal-error", stdout: "", stderr: "تعذّر تشغيل مفسّر Python على هذا الجهاز: " + (e && e.message || e), compileMs: 0, runMs: 0 });
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
      if (fatal) { worker.terminate(); worker = null; }
      resolve({ ...result, ...(ready && typeof ready.readyMs === "number" ? { bootMs: ready.readyMs } : {}) });
    };
    worker.postMessage({ type: "run", source: m.source, stdin: m.stdin });
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
  queue.push({ id: m.id, source: m.source, stdin: typeof m.stdin === "string" ? m.stdin : "", fresh: m.fresh === true });
  pump();
});
window.parent.postMessage({ type: "lab-ready" }, "*");
