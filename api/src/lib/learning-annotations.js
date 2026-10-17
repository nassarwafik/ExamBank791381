// Phase L.5 — a student's PRIVATE reading annotations in the Learning Materials Reader: bookmarks, one note per page and text
// highlights. Private by design (decision D3): only the student's own session reads or writes them; no teacher endpoint, report
// or export reads this prefix. Storage: platform/learning-annotations/<studentId>.json, ONE document per student:
//
//   { schemaVersion: 1, courses: { "<courseId>": {
//       bookmarks:  { "<pageId>": "<iso>" },
//       notes:      { "<pageId>": { text, updatedAt } },
//       highlights: { "<pageId>": [ { id, quote, createdAt } ] } } } }
//
// A page is accepted only when it exists in the generated PAGE INDEX (L.3), so every key is a real page of the book, and every
// list is bounded (LIMITS), so the document can never grow without limit. Reads are filtered to the modules the class can see
// NOW: a unit hidden later disappears from the view, its annotations stay stored and come back when it is published again.
// Annotations are never a grade and feed nothing else.
const ANNOTATIONS_PREFIX = "platform/learning-annotations/";
const annotationsDocName = studentId => ANNOTATIONS_PREFIX + String(studentId || "").trim() + ".json";
const LIMITS = Object.freeze({ NOTE_MAX: 1000, QUOTE_MIN: 2, QUOTE_MAX: 300, HIGHLIGHTS_PER_PAGE: 10, HIGHLIGHTS_PER_COURSE: 200 });
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const isIso = v => typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const isControl = ch => { const c = ch.charCodeAt(0); return c < 32 || c === 127; };
/** A note as the student typed it: line breaks and tabs kept, other control characters dropped, outer whitespace trimmed. */
function cleanNoteText(v) {
  if (typeof v !== "string") return "";
  return Array.from(v.replace(/\r\n?/g, "\n")).filter(ch => ch === "\n" || ch === "\t" || !isControl(ch)).join("").trim();
}
/** A highlighted quote: control characters become spaces, whitespace is collapsed (the page's line breaks are layout). */
function cleanQuote(v) {
  if (typeof v !== "string") return "";
  return Array.from(v).map(ch => (isControl(ch) ? " " : ch)).join("").replace(/\s+/g, " ").trim();
}

/** A safe, bounded copy of a stored document (anything malformed is dropped field by field, never thrown). */
function normalizeAnnotationsDoc(raw) {
  const out = { schemaVersion: 1, courses: {} };
  const courses = raw && typeof raw === "object" && raw.courses && typeof raw.courses === "object" ? raw.courses : {};
  for (const [courseId, c] of Object.entries(courses)) {
    if (!ID.test(courseId) || !c || typeof c !== "object") continue;
    const bookmarks = {}, notes = {}, highlights = {};
    if (c.bookmarks && typeof c.bookmarks === "object") for (const [p, at] of Object.entries(c.bookmarks)) if (ID.test(p) && isIso(at)) bookmarks[p] = at;
    if (c.notes && typeof c.notes === "object") {
      for (const [p, n] of Object.entries(c.notes)) {
        const text = n && typeof n === "object" ? cleanNoteText(n.text) : "";
        if (ID.test(p) && text && text.length <= LIMITS.NOTE_MAX && isIso(n.updatedAt)) notes[p] = { text, updatedAt: n.updatedAt };
      }
    }
    let total = 0;
    if (c.highlights && typeof c.highlights === "object") {
      for (const [p, list] of Object.entries(c.highlights)) {
        if (!ID.test(p) || !Array.isArray(list)) continue;
        const kept = [];
        for (const h of list) {
          const quote = h && typeof h === "object" ? cleanQuote(h.quote) : "";
          if (kept.length >= LIMITS.HIGHLIGHTS_PER_PAGE || total >= LIMITS.HIGHLIGHTS_PER_COURSE) break;
          if (!ID.test(String(h?.id || "")) || quote.length < LIMITS.QUOTE_MIN || quote.length > LIMITS.QUOTE_MAX || !isIso(h.createdAt)) continue;
          if (kept.some(k => k.id === h.id || k.quote === quote)) continue;
          kept.push({ id: h.id, quote, createdAt: h.createdAt }); total++;
        }
        if (kept.length) highlights[p] = kept;
      }
    }
    out.courses[courseId] = { bookmarks, notes, highlights };
  }
  return out;
}

const courseOf = (doc, courseId) => doc.courses[courseId] || (doc.courses[courseId] = { bookmarks: {}, notes: {}, highlights: {} });
const highlightCount = c => Object.values(c.highlights).reduce((n, l) => n + l.length, 0);

/**
 * Apply one change to the FRESHEST document. Pure. Returns { doc, changed } or { error } — error is "limit" when a bound
 * would be exceeded and "invalid" when the change itself is malformed. A change that alters nothing returns changed:false.
 *   { kind: "bookmark", on }            — add / remove the page's bookmark (the first bookmark time never moves)
 *   { kind: "note", text }              — set the page's note; an empty text removes it
 *   { kind: "highlight-add", quote, id } — add a highlight (the same quote on the same page is kept once)
 *   { kind: "highlight-remove", id }    — remove one highlight
 */
function applyAnnotation(raw, { courseId, pageId, change }, now) {
  const doc = normalizeAnnotationsDoc(raw);
  const c = courseOf(doc, courseId);
  if (!change || typeof change !== "object") return { error: "invalid" };
  if (change.kind === "bookmark") {
    if (typeof change.on !== "boolean") return { error: "invalid" };
    if (change.on === has(c.bookmarks, pageId)) return { doc, changed: false };
    if (change.on) c.bookmarks[pageId] = now; else delete c.bookmarks[pageId];
    return { doc, changed: true };
  }
  if (change.kind === "note") {
    if (typeof change.text !== "string") return { error: "invalid" };
    const text = cleanNoteText(change.text);
    if (text.length > LIMITS.NOTE_MAX) return { error: "limit" };
    if (!text) {
      if (!has(c.notes, pageId)) return { doc, changed: false };
      delete c.notes[pageId];
      return { doc, changed: true };
    }
    if (has(c.notes, pageId) && c.notes[pageId].text === text) return { doc, changed: false };
    c.notes[pageId] = { text, updatedAt: now };
    return { doc, changed: true };
  }
  if (change.kind === "highlight-add") {
    const quote = cleanQuote(change.quote);
    if (quote.length < LIMITS.QUOTE_MIN || quote.length > LIMITS.QUOTE_MAX || !ID.test(String(change.id || ""))) return { error: "invalid" };
    const list = c.highlights[pageId] || [];
    if (list.some(h => h.quote === quote)) return { doc, changed: false };
    if (list.length >= LIMITS.HIGHLIGHTS_PER_PAGE || highlightCount(c) >= LIMITS.HIGHLIGHTS_PER_COURSE) return { error: "limit" };
    c.highlights[pageId] = [...list, { id: change.id, quote, createdAt: now }];
    return { doc, changed: true };
  }
  if (change.kind === "highlight-remove") {
    const list = c.highlights[pageId] || [];
    const next = list.filter(h => h.id !== change.id);
    if (next.length === list.length) return { doc, changed: false };
    if (next.length) c.highlights[pageId] = next; else delete c.highlights[pageId];
    return { doc, changed: true };
  }
  return { error: "invalid" };
}

/**
 * The student's annotations in one course, restricted to the modules `canSee(moduleId)` allows NOW, each list in the book's
 * reading order: { bookmarks: [{ pageId, at }], notes: [{ pageId, text, updatedAt }], highlights: [{ pageId, id, quote, createdAt }] }.
 */
function annotationsView(raw, courseId, index, canSee) {
  const c = normalizeAnnotationsDoc(raw).courses[courseId] || { bookmarks: {}, notes: {}, highlights: {} };
  const bookmarks = [], notes = [], highlights = [];
  for (const [moduleId, pages] of Object.entries(index.modules)) {
    if (!canSee(moduleId)) continue;
    for (const pageId of pages) {
      if (has(c.bookmarks, pageId)) bookmarks.push({ pageId, at: c.bookmarks[pageId] });
      if (has(c.notes, pageId)) notes.push({ pageId, ...c.notes[pageId] });
      if (has(c.highlights, pageId)) for (const h of c.highlights[pageId]) highlights.push({ pageId, ...h });
    }
  }
  return { bookmarks, notes, highlights };
}

module.exports = { ANNOTATIONS_PREFIX, annotationsDocName, LIMITS, cleanNoteText, cleanQuote, normalizeAnnotationsDoc, applyAnnotation, annotationsView };
