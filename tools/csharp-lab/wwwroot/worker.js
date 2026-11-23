// Teacher C# lab — the .NET WebAssembly runtime (Roslyn) in a Web Worker. One request at a time:
//   ← { type: "run", id, source, stdin, library }   → { type: "result", id, result }   (→ { type: "ready" } once started)
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

const started = performance.now();
const runtime = await dotnet.withResourceLoader(loader).create();
const exports = await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName);
self.addEventListener("message", event => {
  const m = event.data || {};
  if (m.type !== "run") return;
  let result;
  try { result = JSON.parse(exports.Lab.Run(String(m.source ?? ""), String(m.stdin ?? ""), String(m.library ?? ""))); }
  catch (e) { result = { status: "internal-error", stdout: "", stderr: String(e && e.message || e), compileMs: 0, runMs: 0 }; }
  self.postMessage({ type: "result", id: m.id, result });
});
self.postMessage({ type: "ready", readyMs: Math.round(performance.now() - started) });
