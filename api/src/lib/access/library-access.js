const storage = require("../platform-storage");
const { readAccessMode } = require("./access-mode");
const { isTeacherAccountId } = require("../identity/teacher-token");

// Tadris+ P6-D — each teacher's own exam bank (owner direction, blueprint §19.19). Every exam of the library has an AUDIENCE:
//   "all"      — in every teacher's bank (today's teachers and those added later);
//   "selected" — only in the banks of the teachers listed.
// A teacher's bank = the "all" exams + the exams the owner selected for them (+ their own saved exams and questions, unchanged).
//
// ONE document holds every audience (platform/catalog/exam-library-audience.json), so the owner's two ways of choosing — one
// teacher's bank, or one exam for a group of teachers / everyone — edit the same record atomically (CAS), and a teacher's request
// reads one document. Launch default (owner decision, §19.19): the 36 exams the library shipped with before P6-D are "all" until
// the owner chooses — nobody loses anything on day one; an exam added to the library LATER starts "selected" for nobody, so it
// reaches teachers only when the owner decides its audience. A document that exists but cannot be understood fails CLOSED
// (LibraryAccessError → the routes answer 503; nothing is shown, nothing is overwritten).
//
// Applied exactly like the course entitlement (course-access.js): to managed teacher sessions, while the owner's access mode is
// ENFORCE (an unreadable mode = enforce); identities that predate the console keep today's whole library. A published assignment
// is never touched by an audience change (it carries its own frozen copy).

const AUDIENCE_DOC = "platform/catalog/exam-library-audience.json";
const AUDIENCES = Object.freeze(["all", "selected"]);
const MAX_TEACHERS = 2000;
const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** The exams the library shipped with before P6-D: "all" until the owner decides. Frozen — never extended. */
const LAUNCH_ITEMS = Object.freeze(new Set(["F01", "F02", "F03", "F04", "F05", "F06", ...Array.from({ length: 30 }, (_, i) => "T" + String(i + 1).padStart(2, "0"))]));

class LibraryAccessError extends Error {
  constructor(message) { super(message); this.name = "LibraryAccessError"; this.code = "LIBRARY_ACCESS_UNAVAILABLE"; }
}

function validEntry(e) {
  return !!e && typeof e === "object" && AUDIENCES.includes(e.audience) && Array.isArray(e.teachers) && e.teachers.length <= MAX_TEACHERS
    && e.teachers.every(t => typeof t === "string" && isTeacherAccountId(t));
}
/** Validates a stored audience document ({ items: {} } when there is none). Throws LibraryAccessError when it cannot be understood. */
function parseAudienceDoc(doc) {
  if (!doc) return { schemaVersion: 1, items: {} };
  if (doc.schemaVersion !== 1 || !doc.items || typeof doc.items !== "object" || Array.isArray(doc.items)) throw new LibraryAccessError("audience document invalid");
  for (const [id, e] of Object.entries(doc.items)) if (!ITEM_ID.test(id) || !validEntry(e)) throw new LibraryAccessError("audience entry invalid: " + id);
  return doc;
}
async function readAudienceDoc(container, deps = {}) {
  let doc;
  try { doc = await (deps.downloadJsonOrNull || storage.downloadJsonOrNull)(container, AUDIENCE_DOC); }
  catch { throw new LibraryAccessError("audience document unreadable"); }
  return parseAudienceDoc(doc);
}

/** The audience of one exam: its stored entry, else the launch default ("all" for the launch exams, "selected" for nobody otherwise). */
function audienceOf(doc, itemId) {
  const e = doc.items[itemId];
  if (e) return { audience: e.audience, teachers: e.teachers.slice(), stored: true };
  return { audience: LAUNCH_ITEMS.has(itemId) ? "all" : "selected", teachers: [], stored: false };
}
function inBank(doc, itemId, accountId) {
  const a = audienceOf(doc, itemId);
  return a.audience === "all" || a.teachers.includes(accountId);
}

async function narrowingApplies(container, user, deps) {
  if (!user || user.am !== "managed" || typeof user.sub !== "string" || !user.sub) return false;   // identities that predate the console
  try { return (await readAccessMode(container, deps)).mode === "enforce"; } catch { return true; }
}
/**
 * The bank of a verified teacher session: null = the whole library (no narrowing), else a predicate itemId → boolean.
 * Throws LibraryAccessError when the audience cannot be read (fail closed).
 */
async function teacherLibraryFilter(container, user, deps = {}) {
  if (!(await narrowingApplies(container, user, deps))) return null;
  const doc = await readAudienceDoc(container, deps);
  const accountId = user.sub;
  return itemId => inBank(doc, String(itemId), accountId);
}

/**
 * Tadris+ P6-E — an exam the OWNER imported (IMP-nnn) always follows its audience, for EVERY teacher session: also before enforcement
 * and for identities that predate the console (whose bundled library is not narrowed). Nobody had it before, so nobody loses
 * anything, and «لم يُحدَّد بعد» really means nobody sees it. An identity without an account sees only the «all» ones.
 * Returns a predicate itemId → boolean for imported ids; throws LibraryAccessError when the audience cannot be read (fail closed).
 */
async function importedLibraryFilter(container, user, deps = {}) {
  const doc = await readAudienceDoc(container, deps);
  const accountId = user && user.am === "managed" && typeof user.sub === "string" ? user.sub : "";
  return itemId => {
    const a = audienceOf(doc, String(itemId));
    return a.audience === "all" || (!!accountId && a.teachers.includes(accountId));
  };
}

/** The refusal of a route that could not read the audience. */
const libraryAccessUnavailable = () => ({ status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" }, jsonBody: { ok: false, code: "ACCESS_UNAVAILABLE", error: "تعذر التحقق من الصلاحيات حاليًا. حاول مرة أخرى." } });

/**
 * Compare-and-set of the audience document. `change(doc)` receives a validated, mutable copy and edits `doc.items`; it may throw to
 * refuse (nothing is written). A stored document that cannot be understood is never overwritten (LibraryAccessError).
 */
async function mutateAudience(container, change, deps = {}) {
  let result;
  await (deps.mutateJsonWithRetry || storage.mutateJsonWithRetry)(container, AUDIENCE_DOC, current => {
    const doc = JSON.parse(JSON.stringify(parseAudienceDoc(current)));
    result = change(doc);
    for (const [id, e] of Object.entries(doc.items)) if (!ITEM_ID.test(id) || !validEntry(e)) throw new LibraryAccessError("refusing to write an invalid entry: " + id);
    return doc;
  });
  return result;
}

module.exports = {
  AUDIENCE_DOC, AUDIENCES, MAX_TEACHERS, LAUNCH_ITEMS, LibraryAccessError, parseAudienceDoc, readAudienceDoc, audienceOf, inBank,
  teacherLibraryFilter, importedLibraryFilter, libraryAccessUnavailable, mutateAudience
};
