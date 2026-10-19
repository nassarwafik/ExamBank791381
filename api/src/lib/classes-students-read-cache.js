// Phase S.2 — READ COST of «الصفوف والطلاب» (roster, classes list, student profile, pending-grading guard) without a new
// authority. Each of these reads still lists and reads the AUTHORITATIVE documents — the user documents decide membership
// (class-membership), the class documents the list, the assignment and submission documents the profile and the guard. The
// roster index (classroom.studentIds) and the class-assignment index are NOT used for any of them: the first is a display
// count that never decides membership, the second covers published assignments only (an assignment archived after its
// publication can still hold work awaiting the teacher, which the guard must see).
//
// What changes is the DOWNLOAD cost: one shared ETag-verified document cache (etag-doc-cache, 21H.4). A document is reused
// only when the listing reports the same ETag RIGHT NOW, so any change by any writer is downloaded again and nothing can be
// stale; a hit is a fresh parsed object. A teacher moving between classes, opening profiles or refreshing the page no longer
// re-downloads every user / class / assignment / submission document that did not change. The listings are still made on
// every request.
const { createDocCache, loadJsonDocs, loadJsonEntries, listEntries } = require("./etag-doc-cache");

const CLASSES_STUDENTS_DOC_CACHE = createDocCache();

/** The documents under `prefix`, in listing order (listJson's contract), through the shared cache. */
async function loadDocs(container, prefix) {
  return (await loadJsonDocs(container, prefix, CLASSES_STUDENTS_DOC_CACHE)).docs;
}

/** The documents of the given listing entries ({ name, etag }), aligned with them (null when deleted meanwhile). */
async function loadEntries(container, entries) {
  return (await loadJsonEntries(container, entries, CLASSES_STUDENTS_DOC_CACHE)).docs;
}

module.exports = { CLASSES_STUDENTS_DOC_CACHE, loadDocs, loadEntries, listEntries };
