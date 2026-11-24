// Teacher C# lab — the bridge between the teacher's book editor (the PARENT page) and the runtime worker.
// Runs inside the sandboxed iframe (opaque origin). Protocol with the parent (window.postMessage):
//   ← { type: "run", id, source, stdin, library, fresh? } → { type: "result", id, result: { status, stdout, stderr, compileMs, runMs } }
//   ← { type: "trace", id, source, stdin, library, options, fresh? }  → { type: "result", id, result: { …, steps } }   (phase V2: Tracer.cs)
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
// • Visual lab V14 (docs/enterprise-csharp-visual-lab-plan.md §24) — this same script also runs INLINE, as the `srcdoc` of the offline
//   lab page's sandboxed frame (/lab.html): a frame loaded from a URL never reaches the service worker, so it could not start
//   offline. Inline (this document is about:srcdoc), the worker's own modules — worker.js and the runtime's dotnet.js,
//   dotnet.native.js, dotnet.runtime.js — are asked from the parent like the heavy files, made into blob: URLs here, and handed to the
//   worker (self.__labModules). The runtime's modules locate files from their own URL, which a blob: URL cannot give: their
//   `import.meta.url` is replaced by a fixed base that is never fetched (every file goes through the loader). The frame is the same
//   opaque-origin sandbox, the worker is sealed after boot as before.
const RUN_LIMIT_MS = 10000;        // compile + run of one program (the first run also starts the runtime: not counted)
const FILE_NAME = /^[A-Za-z0-9._-]{1,128}$/;
const inline = location.href === "about:srcdoc";   // written from text (its base URL, and so import.meta.url, is the parent's)
const base = inline ? null : new URL(".", import.meta.url).href;
const MODULES = ["worker.js", "dotnet.js", "dotnet.native.js", "dotnet.runtime.js"];
const NEVER_FETCHED = "https://csharp-lab.invalid/_framework/";
let modules = null;                // inline: the blob: URLs of the worker's modules (made once for this frame)
const own = new Map();             // inline: this page's own parent fetches (its modules) → their resolvers
let ownSeq = 0;
function fromParent(name) {
  return new Promise((resolve, reject) => {
    const id = "m" + (++ownSeq);
    own.set(id, { resolve, reject });
    window.parent.postMessage({ type: "fetch", id, name }, "*");
  });
}
async function inlineModules() {
  if (modules) return modules;
  const urls = {};
  for (const name of MODULES) {
    let text = new TextDecoder().decode(await fromParent(name));
    if (name !== "worker.js") text = text.split("import.meta.url").join(JSON.stringify(NEVER_FETCHED + name));
    urls[name] = URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
  }
  return (modules = urls);
}
let worker = null, workerReady = null, onResult = null;
const queue = [];
let busy = false;
let fetchSeq = 0;
const fetches = new Map();         // parent fetch id → the worker that asked (and its own request id)

// A CLASSIC worker from a blob that loads worker.js (an ES module) with a dynamic import(): in an opaque-origin page a MODULE worker
// from a blob fails to start (Chromium, proven by the lab's probe), while a classic one with import() works.
function startWorker() {
  workerReady = (async () => {
    const mods = inline ? await inlineModules() : null;
    const src = JSON.stringify(mods ? mods["worker.js"] : new URL("worker.js", base).href);
    const blob = new Blob([(mods ? "self.__labModules = " + JSON.stringify(mods) + ";" : "")
      + "import(" + src + ").catch(e => postMessage({ type: \"boot-error\", message: String(e && e.message || e) }));"], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const w = new Worker(url);
    worker = w;
    return { w, url };
  })().then(({ w, url }) => new Promise((resolve, reject) => {
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
  }));
}

function runOnce(m) {
  return new Promise(async resolve => {
    // `fresh`: a new runtime for this run (teacher-device grading starts each student's answer in its own runtime, so one student's
    // program can never leave anything behind — a static, a hooked global — that another student's run would meet).
    if (m.fresh && worker) { onResult = null; worker.terminate(); worker = null; }
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
    worker.postMessage({ type: m.kind, source: m.source, stdin: m.stdin, library: m.library, options: m.options });
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
  if (m.type === "fetched" && typeof m.id === "string" && own.has(m.id)) {   // V14 inline: one of this page's own modules
    const { resolve, reject } = own.get(m.id);
    own.delete(m.id);
    if (m.buffer instanceof ArrayBuffer) resolve(m.buffer); else reject(new Error("the lab's files are not available"));
    return;
  }
  if (m.type === "fetched" && typeof m.id === "string" && fetches.has(m.id)) {
    const { w, workerId } = fetches.get(m.id);
    fetches.delete(m.id);
    if (m.buffer instanceof ArrayBuffer) w.postMessage({ type: "fetched", id: workerId, buffer: m.buffer }, [m.buffer]);
    else w.postMessage({ type: "fetched", id: workerId, error: true });
    return;
  }
  if ((m.type !== "run" && m.type !== "trace") || typeof m.id !== "string" || typeof m.source !== "string") return;
  queue.push({ kind: m.type, id: m.id, source: m.source, stdin: typeof m.stdin === "string" ? m.stdin : "", library: typeof m.library === "string" ? m.library : "",
    options: m.type === "trace" && typeof m.options === "string" ? m.options : "", fresh: m.fresh === true });
  pump();
});
window.parent.postMessage({ type: "lab-ready" }, "*");
