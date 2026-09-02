// Shared sanitize-html configuration for untrusted content coming from teacher-uploaded files
// (HTML files directly, and DOCX files converted to HTML by mammoth). Unlike import-html-exam.js's
// bespoke mini-parser — built only for trusted, self-authored exam pages and never designed as a
// general sanitizer — anything reaching this config is genuinely untrusted input and must be
// stripped of scripts/styles/event handlers/remote resource references.

const SANITIZE_HTML_OPTIONS = {
  allowedTags: [
    "p", "br", "strong", "em", "b", "i", "u",
    "table", "thead", "tbody", "tr", "th", "td",
    "ul", "ol", "li", "img", "sub", "sup", "span", "div"
  ],
  allowedAttributes: {
    img: ["src", "alt"],
    table: ["border"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"]
  },
  // Only inline data: images are allowed - never let sanitized content reference (and later
  // trigger a fetch of) an arbitrary remote http(s) URL.
  allowedSchemesByTag: { img: ["data"] },
  disallowedTagsMode: "discard"
};

module.exports = { SANITIZE_HTML_OPTIONS };
