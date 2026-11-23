// SPIKE — start the .NET WebAssembly runtime once and expose Lab.Run to the smoke test as window.csharpLab.
import { dotnet } from "./_framework/dotnet.js";

const started = performance.now();
const runtime = await dotnet.create();
const exports = await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName);
window.csharpLab = {
  readyMs: Math.round(performance.now() - started),
  run: (source, stdin, library) => JSON.parse(exports.Lab.Run(source, stdin ?? "", library ?? "")),
};
document.getElementById("status").textContent = "ready";
