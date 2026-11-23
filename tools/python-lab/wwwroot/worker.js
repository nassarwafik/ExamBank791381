// Python lab — CPython 3.13 (Pyodide, WebAssembly) in a Web Worker. One request at a time:
//   ← { type: "run", id, source, stdin }   → { type: "result", id, result, fatal }   (→ { type: "ready", readyMs, python } once started)
// The program runs like the Runner's python@1 (runner/workers/python/toolchain.json, runner/workers/supervisor.py):
//   • a syntax check first (compile(src, "main.py", "exec")) → "compile-error" with the diagnostic;
//   • then the program as __main__, its stdin a fresh stream of the given text (input(), sys.stdin.read(), sys.stdin.buffer);
//   • exit 0 / no exception → "success"; an uncaught exception or a non-zero SystemExit → "runtime-error" (the traceback on stderr);
//   • output beyond OUTPUT_CAP_BYTES → "output-limit" (the program is stopped at that write).
// Between two runs of the same worker the interpreter is put back: builtins, modules the program imported, the standard streams and
// the recursion limit. A run that must start clean of ANY earlier program (grading) asks the lab for a fresh worker instead.
// SEALED after boot, as the C# lab (#699): every network, storage and sub-worker entry point of this global throws, so a program
// (through `import js`, pyodide.http or urllib) cannot reach anything.
import { loadPyodide } from "./pyodide/pyodide.mjs";

const OUTPUT_CAP_BYTES = 16 * 1024;
const started = performance.now();
let out = [], err = [], outBytes = 0, errBytes = 0, limited = false;
const sink = (parts, which) => ({
  write(buffer) {
    const n = buffer.length;
    if (which === "out") { if (outBytes + n > OUTPUT_CAP_BYTES) { limited = true; throw new Error("output limit"); } outBytes += n; }
    else { if (errBytes + n > OUTPUT_CAP_BYTES) return n; errBytes += n; }              // stderr is bounded, never the reason to stop
    parts.push(buffer.slice());
    return n;
  },
});
// The interpreter's files come from the PARENT page (main.js relays): its HTTP cache keeps them between visits, while this opaque-origin
// frame's own cache would not. Only the files of the pinned release are asked; anything else, or a refused / failed relay, falls back
// to this worker's own fetch (the lab still works, it only downloads again). Before the seal below, so the relay is boot-time only.
const RELAYED = new Set(["pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]);
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
const indexURL = new URL("./pyodide/", import.meta.url).href;
const ownFetch = self.fetch.bind(self);
const typeOf = name => (name.endsWith(".wasm") ? "application/wasm" : name.endsWith(".json") ? "application/json" : "application/zip");
self.fetch = (input, init) => {
  const url = String(input && input.url ? input.url : input);
  const name = url.startsWith(indexURL) ? url.slice(indexURL.length).split("?")[0] : "";
  if (!RELAYED.has(name)) return ownFetch(input, init);
  return viaPage(name).then(buffer => new Response(buffer, { headers: { "Content-Type": typeOf(name) } })).catch(() => ownFetch(input, init));
};
const pyodide = await loadPyodide({ indexURL, fullStdLib: false, checkAPIVersion: true });
pyodide.setStdout(sink(out, "out"));
pyodide.setStderr(sink(err, "err"));
pyodide.runPython(`
import sys, io, builtins, traceback
__lab_builtins = dict(builtins.__dict__)
__lab_modules = set(sys.modules)
__lab_recursion = sys.getrecursionlimit()
__lab_streams = (sys.stdout, sys.stderr)

def __lab_reset():
    sys.stdout.flush(); sys.stderr.flush()
    builtins.__dict__.clear(); builtins.__dict__.update(__lab_builtins)
    for name in [m for m in sys.modules if m not in __lab_modules]:
        del sys.modules[name]
    sys.setrecursionlimit(__lab_recursion)
    sys.stdout, sys.stderr = __lab_streams

def __lab_run(src, stdin_text):
    sys.stdin = io.TextIOWrapper(io.BufferedReader(io.BytesIO(stdin_text.encode("utf-8"))), encoding="utf-8")
    try:
        code = compile(src, "main.py", "exec")
    except (SyntaxError, ValueError) as e:
        return ("compile-error", "".join(traceback.format_exception_only(type(e), e)))
    g = {"__name__": "__main__", "__builtins__": builtins}
    status = "success"
    try:
        exec(code, g)
    except SystemExit as e:
        c = e.code
        if c is None or c == 0:
            status = "success"
        else:
            status = "runtime-error"
            if not isinstance(c, int):
                sys.stderr.write(str(c) + "\\n")
    except BaseException as e:
        status = "runtime-error"
        try:
            sys.stderr.write("".join(traceback.format_exception(type(e), e, e.__traceback__.tb_next)))
        except BaseException:
            pass
    finally:
        try:
            __lab_reset()
        except BaseException:
            pass
    return (status, "")
`);
const labRun = pyodide.globals.get("__lab_run");
const python = pyodide.runPython("import sys; '%d.%d.%d' % sys.version_info[:3]");

const SEALED = ["fetch", "XMLHttpRequest", "WebSocket", "WebSocketStream", "WebTransport", "EventSource", "importScripts", "Worker", "SharedWorker",
  "BroadcastChannel", "indexedDB", "caches"];
function blocked() { throw new Error("The Python lab has no network or storage access."); }
for (const name of SEALED) {
  for (let o = self; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    if (!Object.prototype.hasOwnProperty.call(o, name)) continue;
    try { Object.defineProperty(o, name, { value: blocked, writable: false, configurable: false, enumerable: false }); } catch { /* already fixed */ }
  }
  try { Object.defineProperty(self, name, { value: blocked, writable: false, configurable: false, enumerable: false }); } catch { /* already fixed */ }
}

const decode = parts => new TextDecoder().decode(parts.length === 1 ? parts[0] : Uint8Array.from(parts.flatMap(p => Array.from(p))));
self.addEventListener("message", event => {
  const m = event.data || {};
  if (m.type !== "run") return;
  out.length = 0; err.length = 0; outBytes = 0; errBytes = 0; limited = false;
  let result, fatal = false;
  const t0 = performance.now();
  try {
    const r = labRun(String(m.source ?? ""), String(m.stdin ?? ""));
    const [status, diagnostic] = r.toJs();
    r.destroy();
    const runMs = Math.round(performance.now() - t0);
    if (status === "compile-error") result = { status, stdout: "", stderr: diagnostic, compileMs: runMs, runMs: 0 };
    else result = { status: limited ? "output-limit" : status, stdout: decode(out), stderr: decode(err), compileMs: 0, runMs };
  } catch (e) {
    // A JavaScript error out of the harness means the interpreter itself failed (Pyodide's «fatal error»): replace this worker.
    fatal = true;
    result = { status: limited ? "output-limit" : "internal-error", stdout: decode(out), stderr: String(e && e.message || e).slice(0, 4096), compileMs: 0, runMs: Math.round(performance.now() - t0) };
  }
  self.postMessage({ type: "result", id: m.id, result, fatal });
});
self.postMessage({ type: "ready", readyMs: Math.round(performance.now() - started), python });
