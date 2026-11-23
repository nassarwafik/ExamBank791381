// Teacher C# lab — the .NET WebAssembly runtime (Roslyn) in a Web Worker. One request at a time:
//   ← { type: "run", id, source, stdin, library }   → { type: "result", id, result, fatal }   (→ { type: "ready" } once started)
//   fatal: the runtime itself is gone (it ended itself): the lab terminates this worker and starts a fresh one for the next run.
// The runtime's binary resources (the .wasm runtime and assemblies) are asked from the lab page, which asks the teacher's page:
//   → { type: "fetch", id, name }   ← { type: "fetched", id, buffer | error }
// so the browser's normal HTTP cache keeps them between visits (an opaque-origin frame's own cache does not survive the visit).
// Any failure of that path falls back to the loader's own fetch: the lab still works, it only downloads again.
import { dotnet } from "./_framework/dotnet.js";

const ASK_TIMEOUT_MS = 60000;
const asks = new Map();
let askSeq = 0;
self.addEventListener("message", e => {
  const m = e.data || {};
  if (m.type !== "fetched" || !asks.has(m.id)) return;
  const { resolve, reject, timer } = asks.get(m.id);
  asks.delete(m.id);
  clearTimeout(timer);
  if (m.buffer instanceof ArrayBuffer) resolve(m.buffer); else reject(new Error("fetch refused"));
});
function viaPage(name) {
  return new Promise((resolve, reject) => {
    const id = ++askSeq;
    const timer = setTimeout(() => { asks.delete(id); reject(new Error("fetch timeout")); }, ASK_TIMEOUT_MS);
    asks.set(id, { resolve, reject, timer });
    self.postMessage({ type: "fetch", id, name });
  });
}
const typeOf = name => (name.endsWith(".wasm") ? "application/wasm" : name.endsWith(".json") ? "application/json" : "application/octet-stream");
// JavaScript modules (dotnet.js, dotnet.native.js, dotnet.runtime.js: small) keep the loader's default; binaries go through the page.
const loader = (type, name, defaultUri) => {
  if (type === "dotnetjs" || String(type).startsWith("js-module")) return undefined;
  const file = String(defaultUri || name).split("?")[0].split("/").pop();
  return viaPage(file)
    .then(buffer => new Response(buffer, { headers: { "Content-Type": typeOf(file) } }))
    .catch(() => fetch(defaultUri));
};

// The .NET runtime ENDS ITSELF on a stack overflow (a recursion without end: «Program terminated with exit(1)»), as on
// Environment.Exit. Lab.Run catches every program exception itself, so anything thrown out of it means the runtime is gone: the result
// says so («fatal») and the lab replaces this worker before the next run.
const ENDED = /terminated with exit|call stack|stack overflow|too much recursion/i;

const started = performance.now();
const runtime = await dotnet.withResourceLoader(loader).create();
const exports = await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName);
self.addEventListener("message", event => {
  const m = event.data || {};
  if (m.type !== "run") return;
  let result, fatal = false;
  try { result = JSON.parse(exports.Lab.Run(String(m.source ?? ""), String(m.stdin ?? ""), String(m.library ?? ""))); }
  catch (e) {
    const message = String(e && e.message || e);
    fatal = true;
    result = ENDED.test(message)
      ? { status: "runtime-error", stdout: "", stderr: "Stack overflow: the program stopped the C# runtime — most often a recursion without a stopping condition.\n" + message, compileMs: 0, runMs: 0 }
      : { status: "internal-error", stdout: "", stderr: message, compileMs: 0, runMs: 0 };
  }
  self.postMessage({ type: "result", id: m.id, result, fatal });
});
self.postMessage({ type: "ready", readyMs: Math.round(performance.now() - started) });
