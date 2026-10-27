// D3 (item 3) — the browser half of client error reporting (api/src/functions/client-error-report.js). It sends a SMALL,
// CONTENT-FREE report when something breaks in a signed-in session: an uncaught error, an unhandled promise rejection, a render error
// caught by an error boundary, a lazy chunk that failed after a deployment, or a Content-Security-Policy violation (D2).
//
// Privacy (the ErrorBoundary rule): never a message, a stack, a component tree, a URL query, an answer or an identity — only a fixed
// kind, an allowlisted error-class name, the code location inside the app's own bundle (/assets/<file>:line:col), a coarse UI area
// and the build id. The server re-validates all of it. Without a session nothing is sent (the route requires one). At most 5 reports
// per page load, deduplicated; a failed send is dropped (never retried, never queued); reporting can never throw into the app.

export type ClientErrorKind = "runtime" | "rejection" | "render" | "chunk" | "csp";
export type ClientErrorReport = { kind: ClientErrorKind; name?: string; file?: string; line?: number; col?: number; area?: string; build?: string; directive?: string; blocked?: string };

const ENDPOINT = "/api/client-error-report";
const MAX_REPORTS = 5;
const SAFE_ERROR_NAMES = new Set(["Error", "TypeError", "ChunkLoadError", "ReferenceError", "SyntaxError", "RangeError", "EvalError", "URIError", "AggregateError", "SecurityError", "NotAllowedError", "QuotaExceededError", "AbortError", "NetworkError"]);
const NOISE = /ResizeObserver loop/;

let sent = 0;
const seen = new Set<string>();
let tokenSource: () => string = () => { try { return sessionStorage.getItem("examBankBuilderToken") || ""; } catch { return ""; } };

export function safeErrorName(error: unknown): string {
  const name = (error as { name?: unknown } | null | undefined)?.name;
  return typeof name === "string" && SAFE_ERROR_NAMES.has(name) ? name : "Error";
}

// The app's own code location only: a same-origin /assets/ (or /src/ in development) path with line and column. Anything else
// (a browser extension, another origin, an inline script) is reported without a location.
export function ownLocation(url: unknown, line?: unknown, col?: unknown): { file?: string; line?: number; col?: number } {
  if (typeof url !== "string" || !url) return {};
  let u: URL;
  try { u = new URL(url, location.href); } catch { return {}; }
  if (u.origin !== location.origin || !/^\/(?:assets|src)\/[A-Za-z0-9._/-]{1,160}$/.test(u.pathname)) return {};
  const n = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);
  return { file: u.pathname, line: n(line), col: n(col) };
}

// The first frame of a stack that points into the app's own bundle ("…(https://host/assets/x.js:1:234)" or "@https://host/…:1:234").
export function topFrame(stack: unknown): { file?: string; line?: number; col?: number } {
  if (typeof stack !== "string") return {};
  for (const m of stack.matchAll(/(https?:\/\/[^\s()]+?):(\d+):(\d+)/g)) {
    const loc = ownLocation(m[1], Number(m[2]), Number(m[3]));
    if (loc.file) return loc;
  }
  return {};
}

// The build id is the hashed name of the entry chunk (index-<hash>.js): it changes with every deployment.
export function buildId(): string {
  try {
    const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
    const m = s && /\/assets\/(index-[A-Za-z0-9_-]{1,32})\.js$/.exec(new URL(s.src, location.href).pathname);
    return m ? m[1] : (import.meta.env.DEV ? "dev" : "");
  } catch { return ""; }
}

function blockedOf(uri: unknown): string {
  const v = String(uri || "");
  if (["inline", "eval", "data", "blob", "self", "wasm-eval", "trusted-types-policy", "trusted-types-sink"].includes(v)) return v;
  try { const u = new URL(v); return u.protocol === "data:" ? "data" : u.protocol === "blob:" ? "blob" : u.origin; } catch { return "other"; }
}

export function sendClientErrorReport(report: ClientErrorReport): boolean {
  try {
    if (sent >= MAX_REPORTS) return false;
    const token = tokenSource();
    if (!token) return false;
    const body: ClientErrorReport = { ...report, area: report.area || "global", build: report.build ?? buildId() };
    const key = [body.kind, body.name, body.file, body.line, body.col, body.directive, body.blocked].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    sent += 1;
    void fetch(ENDPOINT, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(body) }).catch(() => {});
    return true;
  } catch { return false; }
}

/** For error boundaries: a render error (or a failed lazy chunk) caught at `area`. */
export function reportRenderError(error: unknown, area: string, chunk = false): void {
  sendClientErrorReport({ kind: chunk ? "chunk" : "render", name: safeErrorName(error), ...topFrame((error as { stack?: unknown } | null)?.stack), area });
}

let installed = false;
/** Installs the global listeners once (main.tsx). `getToken` is a test seam; the app reads its session token itself. */
export function installClientErrorReporting(options: { getToken?: () => string } = {}): void {
  if (options.getToken) tokenSource = options.getToken;
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e: ErrorEvent) => {
    if (!(e instanceof ErrorEvent)) return;                                    // resource load errors (img, link) are not code errors
    if (NOISE.test(String(e.message || ""))) return;
    const loc = ownLocation(e.filename, e.lineno, e.colno);
    sendClientErrorReport({ kind: "runtime", name: safeErrorName(e.error), ...(loc.file ? loc : topFrame(e.error?.stack)) });
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason = e.reason as { stack?: unknown } | undefined;
    sendClientErrorReport({ kind: "rejection", name: safeErrorName(reason), ...topFrame(reason?.stack) });
  });
  document.addEventListener("securitypolicyviolation", (e: SecurityPolicyViolationEvent) => {
    sendClientErrorReport({ kind: "csp", directive: String(e.effectiveDirective || e.violatedDirective || "").split(" ")[0].slice(0, 40), blocked: blockedOf(e.blockedURI), ...ownLocation(e.sourceFile, e.lineNumber, e.columnNumber) });
  });
}

/** Tests only. */
export function resetClientErrorReporting(): void { sent = 0; seen.clear(); installed = false; tokenSource = () => { try { return sessionStorage.getItem("examBankBuilderToken") || ""; } catch { return ""; } }; }
