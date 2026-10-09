// Phase 21A.1 — the rich-content PROSE policy, moved verbatim out of richContentModel.ts so that every structured-content authority (rich
// content, ChartSpec) applies the SAME patterns without importing each other. Pure: shared server build.
// Policy: rich PROSE never carries markup or script URLs. Rendering is text-only anyway (React text nodes); this is the authoring /
// import refusal the contract promises ("no raw HTML is accepted"). Code / CLI sources are exempt (they are displayed verbatim as code).
// Linear by construction (independent review fix 1): no whitespace run between "<" and the name (HTML tokenizers never treat "< a" as a
// tag, and the old `<\s*\/?\s*` split was quadratic on "<" + spaces). Dangerous elements are refused on their opening token alone;
// common structural names only as a complete `<…>` tag whose body cannot contain "<" (so "x<a.length" / "0 < a < 1" stay prose and
// every scan stops at the next "<").
export const RAW_HTML = /<\/?(script|style|iframe|object|embed|svg|math|link|meta|img|form|input|button|textarea|select|base|frame|frameset|template|noscript|html|head|body|video|audio|source|picture|canvas)\b|<\/?(a|div|span|p|table|tbody|thead|tr|td|th|br|hr|h[1-6]|ul|ol|li)\b[^<>]*>|<!--|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html/i;
// eslint-disable-next-line no-control-regex
export const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
