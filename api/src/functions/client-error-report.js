const { app } = require("@azure/functions");
const { withObservability, pseudonym } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireStudentAuth } = require("../lib/student-auth");

// D3 (item 3) — client error reporting. Before D3 a crash in a student's or teacher's browser (a render error, an unhandled
// rejection, a failed lazy chunk after a deployment, a Content-Security-Policy violation) was only written to that browser's console:
// nobody operating the platform could see it. The browser now sends a SMALL, CONTENT-FREE report here and this route turns it into
// one structured log event (client.error / client.csp_violation) that Application Insights collects like every other API event
// (docs/operations-monitoring.md has the queries and alert rules).
//
// PRIVACY (the ErrorBoundary rule, extended to the wire): a report never carries an error message, a stack, a component tree, a URL
// query, an answer or an identity. It carries a fixed kind, an allowlisted error-class name, the code location inside the app's own
// bundle (/assets/<file>:line:col), a coarse UI area label and the build id. Everything is re-validated here; anything outside the
// allowlists is dropped or collapsed, so a crafted report cannot smuggle data into the logs. The reporter is a session holder: a
// teacher or student token (stateless check — no storage I/O); anonymous calls get 401 like every other non-public route.
//
// Volume: the browser sends at most 5 reports per page load (deduplicated); this instance accepts at most 30 per user per 10 minutes
// (in-memory, per instance — it only bounds log volume, it is never an authority) and answers 429 beyond that.

const MAX_BODY_CHARS = 2048;
const KINDS = new Set(["runtime", "rejection", "render", "chunk", "csp"]);
const SAFE_ERROR_NAMES = new Set(["Error", "TypeError", "ChunkLoadError", "ReferenceError", "SyntaxError", "RangeError", "EvalError", "URIError", "AggregateError", "SecurityError", "NotAllowedError", "QuotaExceededError", "AbortError", "NetworkError"]);
const FILE_RE = /^\/(?:assets|src)\/[A-Za-z0-9._/-]{1,160}$/;
const AREA_RE = /^[a-z0-9-]{1,40}$/;
const BUILD_RE = /^[A-Za-z0-9._-]{1,40}$/;
const DIRECTIVE_RE = /^[a-z-]{1,40}$/;
const BLOCKED_KEYWORDS = new Set(["inline", "eval", "data", "blob", "self", "wasm-eval", "trusted-types-policy", "trusted-types-sink"]);
const ORIGIN_RE = /^https?:\/\/[A-Za-z0-9.-]{1,90}(?::\d{1,5})?$/;
const WINDOW_MS = 10 * 60 * 1000, PER_WINDOW = 30, MAX_TRACKED = 5000;
const recent = new Map();   // userref → { start, count }

const int = (v, max) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= max ? n : 0; };

/** PURE: the validated, content-free event fields of a report, or null when the report is unusable. */
function sanitizeReport(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const kind = String(raw.kind || "");
  if (!KINDS.has(kind)) return null;
  const out = { kind, errorName: SAFE_ERROR_NAMES.has(raw.name) ? raw.name : "Error" };
  const file = typeof raw.file === "string" && FILE_RE.test(raw.file) && !raw.file.includes("..") ? raw.file : "";
  out.location = file ? file + ":" + int(raw.line, 1e7) + ":" + int(raw.col, 1e7) : "";
  out.area = typeof raw.area === "string" && AREA_RE.test(raw.area) ? raw.area : "global";
  out.build = typeof raw.build === "string" && BUILD_RE.test(raw.build) ? raw.build : "";
  if (kind === "csp") {
    out.directive = typeof raw.directive === "string" && DIRECTIVE_RE.test(raw.directive) ? raw.directive : "";
    const b = typeof raw.blocked === "string" ? raw.blocked : "";
    out.blocked = BLOCKED_KEYWORDS.has(b) || ORIGIN_RE.test(b) ? b : "other";
    delete out.errorName;
  }
  return out;
}

function admit(userref, nowMs) {
  const cur = recent.get(userref);
  if (!cur || nowMs - cur.start >= WINDOW_MS) {
    if (recent.size >= MAX_TRACKED) recent.clear();
    recent.set(userref, { start: nowMs, count: 1 });
    return true;
  }
  cur.count += 1;
  return cur.count <= PER_WINDOW;
}

async function handler(request, _azureContext, obs, deps = {}) {
  const builder = (await requireTeacherSession(request, deps));
  const student = builder.ok ? null : (deps.requireStudentAuth || requireStudentAuth)(request);
  const session = builder.ok ? builder : student;
  if (!session || !session.ok) return { status: 401, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: false, error: "Unauthorized" } };
  const role = builder.ok ? "teacher" : "student";
  const userref = pseudonym(role + ":" + String((session.user && session.user.sub) || ""));
  let text = "";
  try { text = await request.text(); } catch { text = ""; }
  if (text.length > MAX_BODY_CHARS) return { status: 413, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: false, error: "Report too large" } };
  let raw = null;
  try { raw = JSON.parse(text); } catch { raw = null; }
  const report = sanitizeReport(raw);
  if (!report) return { status: 400, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: false, error: "Invalid report" } };
  if (!admit(userref, deps.now ? deps.now() : Date.now())) return { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "600" }, jsonBody: { ok: false, error: "Too many reports" } };
  if (obs && typeof obs.logWarn === "function") obs.logWarn(report.kind === "csp" ? "client.csp_violation" : "client.error", { ...report, role, userref });
  return { status: 204, headers: { "Cache-Control": "no-store" } };
}

const resetClientErrorWindow = () => recent.clear();

app.http("clientErrorReport", { methods: ["POST"], authLevel: "anonymous", route: "client-error-report", handler: withObservability("client-error-report", handler) });
module.exports = { handler, sanitizeReport, resetClientErrorWindow, MAX_BODY_CHARS };
