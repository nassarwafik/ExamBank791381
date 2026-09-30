// Phase 16B-A — response headers for SERVED simulator assets. Every document / asset of a package is delivered with a strict
// MIME type, an immutable long-lived cache (content-addressed URL → safe), nosniff, no referrer, same-origin resource policy
// and a Content-Security-Policy that lets the package load ONLY itself: no network (connect-src 'none'), no nested frames,
// no plugins, no <base>, no form submission; framed only by this origin. The main application CSP is never touched.
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

/**
 * buildRuntimeHeaders({ contentType, origin, packagePrefix, singleFile })
 *   origin        — scheme + host of the request (e.g. https://app.example)
 *   packagePrefix — the package's runtime path prefix (/api/simulators/runtime/<id>/<version>/<hash>/)
 *   singleFile    — allow inline <script> / event handlers (a single-file HTML package needs it; the package can only ever run
 *                   its own code, so this does not widen isolation: connect-src stays 'none' and the frame has no origin)
 */
function buildRuntimeHeaders({ contentType, origin, packagePrefix, singleFile = true }) {
  const self = String(origin || "").replace(/\/+$/, "") + String(packagePrefix || "");
  const csp = [
    "default-src 'none'",
    "script-src 'self' " + self + (singleFile ? " 'unsafe-inline'" : ""),
    "style-src 'self' " + self + " 'unsafe-inline'",
    "img-src 'self' " + self + " data:",
    "font-src 'self' " + self,
    "media-src 'self' " + self,
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'"
  ].join("; ") + ";";
  return {
    "Content-Type": contentType,
    "Cache-Control": IMMUTABLE_CACHE,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": csp
  };
}
/** Origin (scheme + host) of an incoming request URL; falls back to a relative prefix when the URL is unusable. */
function originOf(url) { try { const u = new URL(String(url)); return u.protocol + "//" + u.host; } catch { return ""; } }

module.exports = { buildRuntimeHeaders, originOf, IMMUTABLE_CACHE };
