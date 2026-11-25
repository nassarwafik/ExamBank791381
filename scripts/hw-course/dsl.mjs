// HW-A2 — the AUTHORING helpers of the course «أنظمة محوسبة» (791283) (docs/enterprise-791283-course.md).
//
// A unit is written once, compactly, in scripts/hw-course/uNN.mjs with these helpers; scripts/build-hw-course.mjs turns it into the
// site's content files (manifest + one module per unit). Nothing here runs in the browser.
//
// Inline text: `…` = a left-to-right run (English terms, addresses: RAM, FA:2E:34:EF:12:15) · **…** = bold · __…__ = a term.
// Provenance: what the book says (rewritten, on the owner's request, in simple language for the students) is origin "book"; every
// block the author ADDS (the 3D models, examples, «هل تعلم؟», the exam questions and the practice) is origin "teacher-enrichment".

/** Inline mini-markup → safe spans. */
export function spans(md) {
  const out = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__)/g;
  let at = 0, m;
  while ((m = re.exec(md))) {
    if (m.index > at) out.push({ text: md.slice(at, m.index) });
    const tok = m[0];
    if (tok.startsWith("`")) out.push({ text: tok.slice(1, -1), dir: "ltr" });
    else if (tok.startsWith("**")) out.push({ text: tok.slice(2, -2), style: "strong" });
    else out.push({ text: tok.slice(2, -2), style: "term" });
    at = m.index + tok.length;
  }
  if (at < md.length) out.push({ text: md.slice(at) });
  return out;
}
/** Plain text of a markup string (prompts / options / table cells are plain strings in the content model). */
export const plain = md => md.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");

const book = b => ({ ...b, origin: "book" });
const enr = b => ({ ...b, origin: "teacher-enrichment" });

// ── book blocks (the book's content, in simple words) ────────────────────────────────────────────────────────────────
export const P = md => book({ type: "text", spans: spans(md) });
export const H = (text, level = 3) => book({ type: "heading", level, text });
const callout = (kind, wrap) => (title, md) => wrap(md === undefined ? { type: "callout", kind, spans: spans(title) } : { type: "callout", kind, title, spans: spans(md) });
export const DEF = callout("important", book);
export const NOTE = callout("warning", book);
export const REM = callout("remember", book);
export const SUM = callout("summary", book);
export const LIST = (items, opts = {}) => (opts.added ? enr : book)({
  type: "list", variant: opts.variant ?? "plain", ...(opts.title ? { title: opts.title } : {}),
  items: items.map((it, i) => (Array.isArray(it) ? { id: "i" + (i + 1), term: it[0], text: spans(it[1]) } : { id: "i" + (i + 1), text: spans(it) })),
});
export const OL = (items, opts = {}) => LIST(items, { ...opts, variant: "ordered" });
export const TABLE = (headers, rows, opts = {}) => (opts.added ? enr : book)({
  type: "table", ...(opts.caption ? { caption: opts.caption } : {}), headers, rows,
  ...(opts.ltr ? { columnDirs: headers.map((_, i) => (opts.ltr.includes(i) ? "ltr" : "rtl")) } : {}),
});

// ── enrichment blocks ─────────────────────────────────────────────────────────────────────────────────────────────────
/** «هل تعلم؟» / an everyday example — the teacher's words, not the book's. */
export const TIP = (title, md) => enr(md === undefined ? { type: "callout", kind: "tip", spans: spans(title) } : { type: "callout", kind: "tip", title, spans: spans(md) });
export const CLAR = (title, md) => enr({ type: "callout", kind: "clarification", ...(md === undefined ? { spans: spans(title) } : { title, spans: spans(md) }) });
/** A solved example (teacher's). */
export const EX = ({ title, prompt, steps = [], result, explanation }) => enr({
  type: "example", mode: "solved", ...(title ? { title } : {}), ...(prompt ? { prompt: plain(prompt) } : {}),
  steps: steps.map(s => ({ text: plain(s) })), ...(result ? { result: plain(result) } : {}), ...(explanation ? { explanation: plain(explanation) } : {}),
});
/** «حل مع المعلم»: prompt → think first → steps revealed one by one → result. */
export const GUIDED = ({ title, prompt, steps, result, explanation }) => enr({
  type: "guided", guidedType: "reveal", version: 1, title,
  ...(prompt ? { prompt: spans(prompt) } : {}),
  steps: steps.map((s, i) => ({ id: "s" + (i + 1), text: spans(s) })),
  ...(result ? { result: spans(result) } : {}), ...(explanation ? { explanation: plain(explanation) } : {}),
});

/** HW-A1 — a computer part as a 3D model to explore (interactive-diagram / hw-part-3d / v1); `scene` comes from parts.mjs. */
export const PART3D = (scene, opts = {}) => enr({
  type: "interactive-diagram", interactionType: "hw-part-3d", version: 1, title: opts.title ?? "نموذج ثلاثي الأبعاد: " + scene.title,
  ...(opts.description ? { description: opts.description } : {}),
  capabilities: { fullscreen: true, reset: true, interactive: true },
  config: { scene, ...(opts.hint ? { hint: opts.hint } : {}) },
  fallback: { text: scene.title + ": " + scene.targets.map(t => t.label + " — " + t.detail).join(" · ") },
});

// ── self-check exercises (enrichment; the server holds the keys once served) ─────────────────────────────────────────
const fb = (explanation, hints) => ({ explanation: plain(explanation), ...(hints?.length ? { hints: hints.map(plain) } : {}) });
const practice = (question, extra = {}) => enr({ type: "practice", reveal: true, question, ...(extra.from ? { _from: extra.from } : {}) });
/** Multiple choice: the correct option starts with "*". `from` (authoring only) names the exam it is taken from. */
export const MC = (prompt, options, explanation, extra = {}) => practice({
  kind: "multipleChoice", prompt: plain(prompt),
  options: options.map((o, i) => (o.startsWith("*") ? { id: "o" + (i + 1), text: plain(o.slice(1)), correct: true } : { id: "o" + (i + 1), text: plain(o) })),
  feedback: fb(explanation, extra.hints),
}, extra);
export const TF = (prompt, answer, explanation, extra = {}) => practice({ kind: "trueFalse", prompt: plain(prompt), answer, feedback: fb(explanation, extra.hints) }, extra);
export const SHORT = (prompt, answer, explanation, extra = {}) => enr({ type: "practice", question: { kind: "shortInput", prompt: plain(prompt), answer, feedback: fb(explanation, extra.hints) }, ...(extra.from ? { _from: extra.from } : {}) });
/** Matching: pairs in the right order (the generator shows the right side in a fixed scrambled order). */
export const MATCH = (prompt, pairs, explanation, extra = {}) => {
  const left = pairs.map(([l], i) => ({ id: "l" + (i + 1), text: plain(l) }));
  const right = pairs.map(([, r], i) => ({ id: "r" + (i + 1), text: plain(r) }));
  const order = right.map((_, i) => i).sort((a, b) => ((a * 7 + 3) % right.length) - ((b * 7 + 3) % right.length));
  return practice({ kind: "matching", prompt: plain(prompt), left, right: order.map(i => right[i]), pairs: Object.fromEntries(left.map((l, i) => [l.id, "r" + (i + 1)])), feedback: fb(explanation, extra.hints) }, extra);
};
/** Classify: groups = labels; items = [text, groupIndex]. */
export const CLASSIFY = (prompt, groups, items, explanation, extra = {}) => practice({
  kind: "classify", prompt: plain(prompt),
  groups: groups.map((g, i) => ({ id: "g" + (i + 1), text: g })),
  items: items.map(([t], i) => ({ id: "c" + (i + 1), text: t })),
  assign: Object.fromEntries(items.map(([, g], i) => ["c" + (i + 1), "g" + (g + 1)])),
  feedback: fb(explanation, extra.hints),
}, extra);
/** Ordering: items in the RIGHT order; shown in a fixed scrambled order. */
export const ORDER = (prompt, inOrder, explanation, extra = {}) => {
  const items = inOrder.map((t, i) => ({ id: "s" + (i + 1), text: plain(t) }));
  const n = items.length;
  const shown = items.map((_, i) => i).sort((a, b) => ((a * 5 + 2) % n) - ((b * 5 + 2) % n));
  if (shown.every((v, i) => v === i)) shown.reverse();
  return practice({ kind: "ordering", prompt: plain(prompt), items: shown.map(i => items[i]), order: items.map(i => i.id), feedback: fb(explanation, extra.hints) }, extra);
};

/** An exam question heading: «سؤال n · من امتحان البجروت …». */
export const QH = (n, exam) => enr({ type: "heading", level: 3, text: "سؤال " + n + " · " + exam });
/** Marks a block the author wrote (a heading, a definition, a paragraph …) on an ADDED page as enrichment, not book content. */
export const ADDED = b => ({ ...b, origin: "teacher-enrichment" });
