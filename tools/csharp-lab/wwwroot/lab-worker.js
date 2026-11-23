// Teacher C# lab — the DEDICATED WORKER that hosts the .NET WebAssembly runtime and Roslyn (Lab.cs), off the page's thread.
// (docs/enterprise-csharp-visual-lab-plan.md, phase V1.) Created only by bridge.js; it answers only bridge.js.
//   in : { type: "run", id, source, stdin, library }
//   out: { type: "ready" } | { type: "boot-failed", message } | { type: "running", id } | { type: "result", id, result } | { type: "crash", id, message }
// TIME is not bounded here (Lab.Run is synchronous): the bridge terminates this worker when a run is too long.
// SEALED after boot: once the runtime has loaded its files, every network / storage / sub-worker entry point of this global is
// replaced by a function that throws — a program the teacher pastes (for example a student's code) cannot reach the site's API,
// another origin, IndexedDB or the Cache API from here. The page's session token never reaches a worker at all (sessionStorage
// does not exist in workers).
import { dotnet } from "./_framework/dotnet.js";

const post = self.postMessage.bind(self);
const SEALED = ["fetch", "XMLHttpRequest", "WebSocket", "WebSocketStream", "WebTransport", "EventSource", "importScripts", "Worker", "SharedWorker",
  "BroadcastChannel", "indexedDB", "caches"];

function blocked() { throw new Error("The C# lab has no network or storage access."); }

/** Every own definition of each name on the global object's prototype chain → a throwing function, not configurable. */
function seal() {
  for (const name of SEALED) {
    for (let o = self; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      if (!Object.prototype.hasOwnProperty.call(o, name)) continue;
      try { Object.defineProperty(o, name, { value: blocked, writable: false, configurable: false, enumerable: false }); } catch { /* already fixed */ }
    }
    try { Object.defineProperty(self, name, { value: blocked, writable: false, configurable: false, enumerable: false }); } catch { /* already fixed */ }
  }
}

async function boot() {
  const runtime = await dotnet.create();
  const exports = await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName);
  seal();
  return exports;
}

const booted = boot();
let latest = -1;               // runs posted while the runtime starts: only the newest one is run
booted.then(() => post({ type: "ready" }), e => post({ type: "boot-failed", message: String(e && e.message || e) }));

self.onmessage = async event => {
  const m = event.data;
  if (!m || m.type !== "run" || !Number.isSafeInteger(m.id) || typeof m.source !== "string" || typeof m.stdin !== "string" || typeof m.library !== "string") return;
  latest = m.id;
  let exports;
  try { exports = await booted; } catch { return; }      // boot-failed was already reported
  if (m.id !== latest) return;                             // replaced by a newer run while the runtime was starting
  post({ type: "running", id: m.id });
  try {
    post({ type: "result", id: m.id, result: JSON.parse(exports.Lab.Run(m.source, m.stdin, m.library)) });
  } catch (e) {
    post({ type: "crash", id: m.id, message: String(e && e.message || e) });
  }
};
