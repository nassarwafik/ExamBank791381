// Phase L.3 — server-side READING PROGRESS of the Learning Materials Reader: where a student is in each book and which pages
// they have read, so «أكمل من حيث توقفت» and the index's read marks follow the student across devices (and, in L.4, a
// teacher can see how far a class has read). Storage: platform/learning-progress/<studentId>.json, ONE document per student:
//
//   { schemaVersion: 1, courses: { "<courseId>": { lastPageId, lastModuleId, lastReadAt, pages: { "<pageId>": "<first read iso>" } } } }
//
// A page is accepted only when it exists in the generated PAGE INDEX (api/src/data/learning-pages/<courseId>.json, pinned to
// the content by src/learning/progress/pageIndex.sync.test.ts), so the document is bounded by the book's size and can never
// hold an invented id. Reading progress is NEVER a grade: it feeds no Strength, no assignment and no gradebook.
// Every read is filtered to the modules the student's class can see NOW: a unit hidden later disappears from the view (its
// stored pages stay, so re-publishing restores them). Writes go through mutateJsonWithRetry (CAS).
const PROGRESS_PREFIX = "platform/learning-progress/";
const progressDocName = studentId => PROGRESS_PREFIX + String(studentId || "").trim() + ".json";
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const cleanId = v => (typeof v === "string" ? v.trim() : "");
const isIso = v => typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));

// ── the page index (generated content data; read-only) ───────────────────────────────────────────────────────
const INDEX_CACHE = new Map();
/** The page index of a course ({ modules: { moduleId: [pageIds] }, moduleOf: Map }) or null when the course has none. */
function loadPageIndex(courseId) {
  const id = cleanId(courseId);
  if (!ID.test(id)) return null;
  if (INDEX_CACHE.has(id)) return INDEX_CACHE.get(id);
  let raw = null;
  try { raw = require("../data/learning-pages/" + id + ".json"); } catch { raw = null; }
  let index = null;
  if (raw && raw.schemaVersion === 1 && raw.courseId === id && raw.modules && typeof raw.modules === "object") {
    const moduleOf = new Map();
    for (const [moduleId, pages] of Object.entries(raw.modules)) if (Array.isArray(pages)) for (const p of pages) moduleOf.set(p, moduleId);
    index = { courseId: id, modules: raw.modules, moduleOf };
  }
  INDEX_CACHE.set(id, index);
  return index;
}
/** The module a page belongs to, or null for an id the book does not have. */
function moduleOfPage(index, pageId) {
  const id = cleanId(pageId);
  return index && ID.test(id) ? index.moduleOf.get(id) || null : null;
}

// ── the per-student document ──────────────────────────────────────────────────────────────────────────────────
/** A safe, bounded copy of a stored document (anything malformed is dropped field by field, never thrown). */
function normalizeProgressDoc(raw) {
  const out = { schemaVersion: 1, courses: {} };
  const courses = raw && typeof raw === "object" && raw.courses && typeof raw.courses === "object" ? raw.courses : {};
  for (const [courseId, c] of Object.entries(courses)) {
    if (!ID.test(courseId) || !c || typeof c !== "object") continue;
    const pages = {};
    if (c.pages && typeof c.pages === "object") for (const [pageId, at] of Object.entries(c.pages)) if (ID.test(pageId) && isIso(at)) pages[pageId] = at;
    out.courses[courseId] = {
      lastPageId: ID.test(cleanId(c.lastPageId)) ? cleanId(c.lastPageId) : null,
      lastModuleId: ID.test(cleanId(c.lastModuleId)) ? cleanId(c.lastModuleId) : null,
      lastReadAt: isIso(c.lastReadAt) ? c.lastReadAt : null,
      pages,
    };
  }
  return out;
}

/** True when recording this visit would change nothing: the page is already read AND it is already the last page. */
function visitIsNoop(doc, { courseId, pageId }) {
  const c = normalizeProgressDoc(doc).courses[courseId];
  return !!c && c.lastPageId === pageId && Object.prototype.hasOwnProperty.call(c.pages, pageId);
}

/** Record a visit on the FRESHEST document (idempotent: a page's first-read time never moves). */
function applyVisit(doc, { courseId, moduleId, pageId }, now) {
  const next = normalizeProgressDoc(doc);
  const c = next.courses[courseId] || (next.courses[courseId] = { lastPageId: null, lastModuleId: null, lastReadAt: null, pages: {} });
  if (!Object.prototype.hasOwnProperty.call(c.pages, pageId)) c.pages[pageId] = now;
  c.lastPageId = pageId; c.lastModuleId = moduleId; c.lastReadAt = now;
  return next;
}

/**
 * The student's progress in one course, restricted to the modules `canSee(moduleId)` allows NOW:
 * { lastPageId, lastReadAt, visited: [pageIds in reading order], modules: { moduleId: { read, total } } }.
 * The last page is reported only while its module is visible and the page still exists in the book.
 */
function progressView(doc, courseId, index, canSee) {
  const c = normalizeProgressDoc(doc).courses[courseId] || { lastPageId: null, lastReadAt: null, pages: {} };
  const visited = [], modules = {};
  for (const [moduleId, pages] of Object.entries(index.modules)) {
    if (!canSee(moduleId)) continue;
    let read = 0;
    for (const pageId of pages) if (Object.prototype.hasOwnProperty.call(c.pages, pageId)) { read++; visited.push(pageId); }
    modules[moduleId] = { read, total: pages.length };
  }
  const lastModule = c.lastPageId ? moduleOfPage(index, c.lastPageId) : null;
  const lastVisible = !!lastModule && canSee(lastModule);
  return { lastPageId: lastVisible ? c.lastPageId : null, lastReadAt: lastVisible ? c.lastReadAt : null, visited, modules };
}

module.exports = { PROGRESS_PREFIX, progressDocName, loadPageIndex, moduleOfPage, normalizeProgressDoc, visitIsNoop, applyVisit, progressView };

// ── Phase L.4: the CLASS reading summary a teacher sees ─────────────────────────────────────────────────────────────
// Per published unit: how many of the class's students have started it, how many have read all of it, and the average share
// read. Per student: pages read per published unit, the total, and the last reading time. Deliberately NOT per page: a
// teacher sees how far each student got, never the exact pages (privacy by default; decision L4-a).

/** The class summary for one course: { modules: [...], students: [...] } over the visible modules only. Pure. */
function classProgressSummary(index, modules, students) {
  const visible = modules.filter(m => Array.isArray(index.modules[m.moduleId]));
  const rows = students.map(s => {
    const view = progressView(s.doc, index.courseId, index, id => visible.some(m => m.moduleId === id));
    const perModule = {};
    let read = 0;
    for (const m of visible) { const r = view.modules[m.moduleId] ? view.modules[m.moduleId].read : 0; perModule[m.moduleId] = r; read += r; }
    const c = normalizeProgressDoc(s.doc).courses[index.courseId];
    return { userId: s.userId, displayName: s.displayName, code: s.code, modules: perModule, readPages: read, lastReadAt: read > 0 && c ? c.lastReadAt : null };
  });
  const totalPages = visible.reduce((n, m) => n + index.modules[m.moduleId].length, 0);
  const summary = visible.map(m => {
    const total = index.modules[m.moduleId].length;
    const reads = rows.map(r => r.modules[m.moduleId]);
    const started = reads.filter(n => n > 0).length;
    const completed = reads.filter(n => n >= total).length;
    const averageRead = rows.length ? Math.round((reads.reduce((a, b) => a + b, 0) / (rows.length * total)) * 100) : 0;
    return { moduleId: m.moduleId, title: m.title, order: m.order, total, started, completed, averageRead };
  });
  return { totalPages, modules: summary, students: rows.map(r => ({ ...r, totalPages })) };
}

module.exports.classProgressSummary = classProgressSummary;
