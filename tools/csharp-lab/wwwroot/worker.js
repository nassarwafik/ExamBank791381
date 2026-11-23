// Teacher C# lab — the .NET WebAssembly runtime (Roslyn) in a module Web Worker. One request at a time:
//   ← { type: "run", id, source, stdin, library }   → { type: "result", id, result }   (→ { type: "ready" } once started)
import { dotnet } from "./_framework/dotnet.js";

const started = performance.now();
const runtime = await dotnet.create();
const exports = await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName);
self.onmessage = event => {
  const m = event.data || {};
  if (m.type !== "run") return;
  let result;
  try { result = JSON.parse(exports.Lab.Run(String(m.source ?? ""), String(m.stdin ?? ""), String(m.library ?? ""))); }
  catch (e) { result = { status: "internal-error", stdout: "", stderr: String(e && e.message || e), compileMs: 0, runMs: 0 }; }
  self.postMessage({ type: "result", id: m.id, result });
};
self.postMessage({ type: "ready", readyMs: Math.round(performance.now() - started) });
