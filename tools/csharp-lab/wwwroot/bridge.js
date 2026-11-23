// Teacher C# lab — the BRIDGE: this page (/csharp-lab/index.html) is a hidden same-origin frame of the teacher's book reader. It
// owns the lab worker (lab-worker.js) and is the only thing that talks to it. (docs/enterprise-csharp-visual-lab-plan.md, phase V1.)
// Why a frame: the .NET WebAssembly runtime needs 'wasm-unsafe-eval'; only this page's own policy has it, the site's policy does not.
//
// Protocol — messages from the PARENT window only (same origin, event.source === parent):
//   { type: "csharp-lab:warm" }                                   start the runtime now (the editor was opened)
//   { type: "csharp-lab:run", id, source, stdin, library }       run one program (one at a time; a new run replaces an older one)
//   { type: "csharp-lab:cancel" }                                  stop the current run (the worker is terminated)
// Answers to the parent (targetOrigin = this origin):
//   { type: "csharp-lab:hello", version: 1 }                       this page loaded
//   { type: "csharp-lab:state", state: "booting" | "ready" | "failed" }
//   { type: "csharp-lab:result", id, result: { status, stdout, stderr, durationMs } }
// LIMITS (fixed here, never from the message): a run that has not finished RUN_TIMEOUT_MS after it started → the worker is
// terminated and the result is «timeout»; a runtime that is not up BOOT_TIMEOUT_MS after it was needed → «internal-error». A worker
// that crashed or was terminated is replaced by a fresh one on the next run.
const ORIGIN = location.origin;
export const RUN_TIMEOUT_MS = 10000;
export const BOOT_TIMEOUT_MS = 120000;
export const SOURCE_MAX_CHARS = 64 * 1024;
export const STDIN_MAX_CHARS = 16 * 1024;
export const LIBRARY_MAX_CHARS = 64 * 1024;

let worker = null;
let ready = false;
let current = null;            // { id, timer, started, running }

function tell(message) { if (window.parent !== window) window.parent.postMessage(message, ORIGIN); }
function state(s) { tell({ type: "csharp-lab:state", state: s }); }

function stopWorker() {
  if (worker) { worker.terminate(); worker = null; }
  ready = false;
}

function finish(result) {
  if (!current) return;
  clearTimeout(current.timer);
  tell({ type: "csharp-lab:result", id: current.id, result });
  current = null;
}

function arm(ms, onExpire) {
  clearTimeout(current.timer);
  current.timer = setTimeout(onExpire, ms);
}

function onWorker(event) {
  const m = event.data || {};
  if (m.type === "ready") { ready = true; state("ready"); return; }
  if (m.type === "boot-failed") {
    stopWorker(); state("failed");
    finish({ status: "internal-error", stdout: "", stderr: "C# lab: the runtime did not start. " + String(m.message || "") });
    return;
  }
  if (!current || m.id !== current.id) return;
  if (m.type === "running") {
    current.started = performance.now();
    current.running = true;
    arm(RUN_TIMEOUT_MS, () => { stopWorker(); finish({ status: "timeout", stdout: "", stderr: "", durationMs: RUN_TIMEOUT_MS }); });
    return;
  }
  if (m.type === "result") {
    const r = m.result || {};
    finish({ status: r.status, stdout: r.stdout, stderr: r.stderr, durationMs: Math.round(performance.now() - current.started) });
    return;
  }
  if (m.type === "crash") {
    // The runtime itself failed (for example a recursion without end exhausts the WebAssembly stack): its state is unknown → replace it.
    stopWorker();
    finish({ status: "runtime-error", stdout: "", stderr: crashText(m.message) });
  }
}

function crashText(message) {
  const text = String(message || "");
  // The .NET runtime ends itself on a stack overflow (observed: «Program terminated with exit(1)»), as it does on Environment.Exit.
  return /call stack|stack overflow|too much recursion|terminated with exit/i.test(text)
    ? "The program stopped the C# runtime — most often a recursion without a stopping condition (stack overflow).\n" + text
    : text;
}

function startWorker() {
  if (worker) return;
  ready = false;
  state("booting");
  worker = new Worker(new URL("./lab-worker.js", import.meta.url), { type: "module" });
  worker.onmessage = onWorker;
  worker.onerror = event => {
    event.preventDefault();
    stopWorker();
    if (current) finish({ status: "runtime-error", stdout: "", stderr: crashText(event.message) });
    else state("failed");
  };
}

function run(m) {
  if (!Number.isSafeInteger(m.id) || typeof m.source !== "string" || typeof m.stdin !== "string" || typeof m.library !== "string") return;
  // An older run: still waiting for the runtime → simply replaced; already running (the worker is busy) → the worker is replaced.
  if (current) { if (current.running) stopWorker(); finish({ status: "internal-error", stdout: "", stderr: "replaced by a newer run" }); }
  current = { id: m.id, timer: 0, started: performance.now(), running: false };
  if (m.source.length > SOURCE_MAX_CHARS || m.stdin.length > STDIN_MAX_CHARS || m.library.length > LIBRARY_MAX_CHARS) {
    finish({ status: "internal-error", stdout: "", stderr: "The program, its input or the book's classes are too long for the lab." });
    return;
  }
  startWorker();
  if (!ready) arm(BOOT_TIMEOUT_MS, () => { stopWorker(); state("failed"); finish({ status: "internal-error", stdout: "", stderr: "C# lab: the runtime did not start in time." }); });
  worker.postMessage({ type: "run", id: m.id, source: m.source, stdin: m.stdin, library: m.library });
}

window.addEventListener("message", event => {
  if (event.origin !== ORIGIN || event.source !== window.parent || window.parent === window) return;
  const m = event.data;
  if (!m || typeof m !== "object") return;
  if (m.type === "csharp-lab:warm") startWorker();
  else if (m.type === "csharp-lab:run") run(m);
  else if (m.type === "csharp-lab:cancel" && current) { if (current.running) stopWorker(); finish({ status: "internal-error", stdout: "", stderr: "cancelled" }); }
});

tell({ type: "csharp-lab:hello", version: 1 });
