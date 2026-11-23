// Teacher C# lab — the bridge between the teacher's book editor (the PARENT page) and the runtime worker.
// Runs inside the sandboxed iframe (opaque origin). Protocol with the parent (window.postMessage):
//   ← { type: "run", id, courseId, source, stdin }      → { type: "result", id, result: { status, stdout, stderr, compileMs, runMs } }
//   → { type: "lab-ready" } once, when this page has loaded (the runtime itself starts on the first run).
// • The runtime lives in a module WORKER created from a blob (an opaque-origin page cannot start a worker from a URL); a program that
//   does not finish within RUN_LIMIT_MS is stopped by terminating the worker → status "timeout", and the next run starts a fresh one.
// • The course library (the book's classes) is fetched from ./libraries/<courseId>.txt for a known course id only.
// • Only messages from the parent window are answered.
const RUN_LIMIT_MS = 10000;        // compile + run of one program (the first run also starts the runtime: not counted)
const COURSE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const base = new URL(".", import.meta.url).href;
const libraries = new Map();
let worker = null, workerReady = null;
const queue = [];
let busy = false;

function startWorker() {
  const blob = new Blob(['import "' + new URL("worker.js", base).href + '";'], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  worker = new Worker(url, { type: "module" });
  workerReady = new Promise((resolve, reject) => {
    worker.onmessage = e => { if (e.data && e.data.type === "ready") { URL.revokeObjectURL(url); resolve(); } };
    worker.onerror = e => reject(new Error(e.message || "worker failed"));
  });
}

async function library(courseId) {
  if (!courseId || !COURSE_ID.test(courseId)) return "";
  if (!libraries.has(courseId)) {
    libraries.set(courseId, fetch(new URL("libraries/" + courseId + ".txt", base)).then(r => (r.ok ? r.text() : "")).catch(() => ""));
  }
  return libraries.get(courseId);
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
    const lib = await library(m.courseId);
    const timer = setTimeout(() => {
      worker.terminate();
      worker = null;
      resolve({ status: "timeout", stdout: "", stderr: "", compileMs: 0, runMs: RUN_LIMIT_MS });
    }, RUN_LIMIT_MS);
    worker.onmessage = e => {
      if (!e.data || e.data.type !== "result") return;
      clearTimeout(timer);
      resolve(e.data.result);
    };
    worker.postMessage({ type: "run", source: m.source, stdin: m.stdin, library: lib });
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
  if (m.type !== "run" || typeof m.id !== "string" || typeof m.source !== "string") return;
  queue.push({ id: m.id, courseId: typeof m.courseId === "string" ? m.courseId : "", source: m.source, stdin: typeof m.stdin === "string" ? m.stdin : "" });
  pump();
});
window.parent.postMessage({ type: "lab-ready" }, "*");
