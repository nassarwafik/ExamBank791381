// Phase 16B-A — the EXPLICIT static allow-list of file types a SmartSim package may contain, and the strict MIME type each is
// served with. Anything not listed is refused at upload (never stored, never served): no executables, shared objects,
// shell / batch / PowerShell scripts, archives, Java, Python, PHP, WebAssembly, source maps or extension-less files.
const CONTENT_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
});
const ALLOWED_PACKAGE_EXTENSIONS = Object.freeze(Object.keys(CONTENT_TYPES));
/** Extensions that mark a NESTED ARCHIVE (refused even though .zip is not allow-listed — the code is explicit). */
const ARCHIVE_EXTENSIONS = Object.freeze([".zip", ".smartsim"]);            // other archive formats fall under UNSUPPORTED_FILE_TYPE
/** Text types whose content is scanned for external resources. */
const SCANNED_EXTENSIONS = Object.freeze([".html", ".htm", ".js", ".mjs", ".css", ".svg"]);

function extensionOf(p) { const s = String(p || ""); const base = s.slice(s.lastIndexOf("/") + 1); const dot = base.lastIndexOf("."); return dot <= 0 ? "" : base.slice(dot).toLowerCase(); }
/** Strict content type for an allow-listed path; null for everything else. */
function contentTypeFor(p) { return CONTENT_TYPES[extensionOf(p)] || null; }
const isArchivePath = p => ARCHIVE_EXTENSIONS.includes(extensionOf(p));
const isScannedPath = p => SCANNED_EXTENSIONS.includes(extensionOf(p));
const isHtmlPath = p => { const e = extensionOf(p); return e === ".html" || e === ".htm"; };

module.exports = { CONTENT_TYPES, ALLOWED_PACKAGE_EXTENSIONS, ARCHIVE_EXTENSIONS, SCANNED_EXTENSIONS, extensionOf, contentTypeFor, isArchivePath, isScannedPath, isHtmlPath };
