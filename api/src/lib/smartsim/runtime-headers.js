// Phase 16B-A — response headers for SERVED simulator assets (Independent Review Fix RF1 / RF2).
//
// Threat model: uploaded HTML / JS / SVG is served from the APPLICATION origin through a public, content-addressed route.
// The iframe `sandbox="allow-scripts"` attribute protects it only while it runs inside SimulationSandboxHost; the same URL
// can be opened directly, bookmarked or navigated to. So the RESPONSE itself must sandbox the document:
//
//   Content-Security-Policy: sandbox allow-scripts; …
//     → every served document (HTML, SVG, anything navigable) gets an OPAQUE origin even as a top-level page: no application
//       localStorage / sessionStorage / IndexedDB / cookies, no popups, no top navigation, no forms, no modals, no downloads,
//       no pointer lock / presentation / storage access. Scripts may run (V1 simulators need them). Sent on EVERY runtime
//       response (sub-resources ignore it), so no asset type can become an unsandboxed document.
//   fetch directives name ONLY the exact package prefix (…/runtime/<id>/<version>/<sha256>/): never 'self', which would admit
//       every application script, every other package and beacons to any application URL.
//   connect-src / frame-src / worker-src / object-src / base-uri / form-action 'none'; frame-ancestors 'self'.
//
// RF2 — an opaque-origin document is cross-origin to EVERY URL, including its own package's assets, so:
//   Cross-Origin-Resource-Policy: cross-origin   (same-origin blocked classic scripts / CSS / images: corp-not-same-origin)
//   Access-Control-Allow-Origin: *               (module scripts, fonts and crossorigin CSS are CORS loads with Origin: null)
// Both are safe because the runtime assets are already public by design, immutable and content-addressed; no credentials are
// ever allowed (no Access-Control-Allow-Credentials), no archive / metadata / owner data is reachable through this route,
// the CSP above still restricts what executes, frame-ancestors restricts embedding and the HTTP sandbox covers direct
// navigation. The application's own CSP / CORP (staticwebapp.config.json, index.html) are never touched.
//
// Cacheability: sub-resources are content-addressed → immutable for a year. Executable DOCUMENTS (HTML / SVG) are served
// `no-cache` so a security-header change is picked up on the next load and can never be pinned by a year-long cache.
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
const DOCUMENT_CACHE = "no-cache";
const RUNTIME_SANDBOX_TOKENS = Object.freeze(["allow-scripts"]);

/** Types a browser can render as a script-capable document when navigated to directly. */
const isDocumentType = contentType => /^\s*(text\/html|image\/svg\+xml|application\/xhtml\+xml)\b/i.test(String(contentType || ""));

/**
 * buildRuntimeHeaders({ contentType, origin, packagePrefix, singleFile })
 *   origin        — scheme + host of the request (e.g. https://app.example)
 *   packagePrefix — the package's runtime path prefix (/api/simulators/runtime/<id>/<version>/<hash>/)
 *   singleFile    — allow inline <script> / event handlers (single-file packages need it). It never widens isolation: the
 *                   document is sandboxed (opaque origin), connect-src stays 'none' and only the package prefix is loadable.
 */
function buildRuntimeHeaders({ contentType, origin, packagePrefix, singleFile = true }) {
  const pkg = String(origin || "").replace(/\/+$/, "") + String(packagePrefix || "");
  const csp = [
    "sandbox " + RUNTIME_SANDBOX_TOKENS.join(" "),
    "default-src 'none'",
    "script-src " + pkg + (singleFile ? " 'unsafe-inline'" : ""),
    "style-src " + pkg + " 'unsafe-inline'",
    "img-src " + pkg + " data:",
    "font-src " + pkg,
    "media-src " + pkg,
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'"
  ].join("; ") + ";";
  return {
    "Content-Type": contentType,
    "Cache-Control": isDocumentType(contentType) ? DOCUMENT_CACHE : IMMUTABLE_CACHE,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Access-Control-Allow-Origin": "*",
    "Content-Security-Policy": csp
  };
}

/** Headers for every runtime ERROR response (404): uncacheable, unsniffable, fully sandboxed, never frameable. */
const RUNTIME_ERROR_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'none';"
});

/** Origin (scheme + host) of an incoming request URL; falls back to a relative prefix when the URL is unusable. */
function originOf(url) { try { const u = new URL(String(url)); return u.protocol + "//" + u.host; } catch { return ""; } }

module.exports = { buildRuntimeHeaders, originOf, isDocumentType, RUNTIME_ERROR_HEADERS, RUNTIME_SANDBOX_TOKENS, IMMUTABLE_CACHE, DOCUMENT_CACHE };
