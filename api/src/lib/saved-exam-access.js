// Phase 21F.0 — saved-exam ownership and conditional (optimistic-concurrency) saves.
//
// Ownership: in multi-user mode (BUILDER_USERS, a session whose signed `am` claim is "multi-user") the token subject is the owner
// of every exam it saves; the owner is stamped on the stored document ENVELOPE (`ownerId`, never inside `exam`) and an exam owned
// by another subject is invisible to list / load / delete and refused by save. Legacy single-password mode has one shared
// identity, so it neither stamps nor enforces an owner. A stored exam without an owner (saved before this phase) stays
// accessible to every teacher and is claimed by the first multi-user save after this phase (owner decision D2).
//
// Conditional saves: a client that opts in (`conditional: true`) states the ETag it last read (`baseEtag`) or that it expects to
// CREATE the exam (`baseEtag: null`). A write only lands when the stored blob still has that ETag (If-Match) or does not exist
// (If-None-Match: *); otherwise the save is refused with 409 EXAM_CONFLICT and nothing is overwritten. Clients that do not opt in
// (the legacy flat editor) keep last-write-wins, but every write is still atomic with the ownership check it was decided on.
const storage = require("./platform-storage");

const EXAM_CONFLICT = "EXAM_CONFLICT";
const EXAM_FORBIDDEN = "EXAM_FORBIDDEN";
const MAX_UNCONDITIONAL_ATTEMPTS = 3;

/** The owner identity of a verified teacher session: its subject in multi-user mode, else null (no ownership). */
function examOwnerOf(user) {
  return user && user.am === "multi-user" && typeof user.sub === "string" && user.sub ? user.sub : null;
}

/** The owner stamped on a stored saved-exam document, or null. */
function storedOwnerOf(document) {
  return document && typeof document.ownerId === "string" && document.ownerId ? document.ownerId : null;
}

/** Whether `owner` (examOwnerOf) may see / change this stored document. */
function canAccessSavedExam(document, owner) {
  const stored = storedOwnerOf(document);
  return !owner || !stored || stored === owner;
}

class SaveRefusal extends Error {
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra || {};
  }
}

/**
 * Writes a saved-exam document at `blobName`.
 * - `build(current)` returns the document to store (called with the stored document or null, on every attempt).
 * - `owner`: examOwnerOf(auth.user).
 * - `conditional` / `baseEtag`: see the header.
 * Resolves { etag } or throws SaveRefusal (403 EXAM_FORBIDDEN, 409 EXAM_CONFLICT); any other error propagates.
 */
async function writeSavedExam(container, blobName, { build, owner, conditional, baseEtag }, deps = {}) {
  const io = deps.storage || storage;
  const attempts = conditional ? 1 : MAX_UNCONDITIONAL_ATTEMPTS;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { value: current, etag: currentEtag } = await io.downloadJsonWithEtagOrNull(container, blobName);
    if (!canAccessSavedExam(current, owner)) throw new SaveRefusal(403, EXAM_FORBIDDEN);
    if (conditional) {
      const expected = typeof baseEtag === "string" && baseEtag ? baseEtag : null;
      const matches = expected ? currentEtag === expected : current === null;
      if (!matches) throw new SaveRefusal(409, EXAM_CONFLICT, conflictDetails(current, currentEtag, blobName));
    }
    const document = build(current);
    const ownerId = owner || storedOwnerOf(current);
    if (ownerId) document.ownerId = ownerId;
    try {
      const etag = await io.uploadJsonConditional(container, blobName, document, currentEtag);
      return { etag };
    } catch (e) {
      if (!io.isConcurrencyConflict(e)) throw e;
      if (conditional) {
        const { value: latest, etag: latestEtag } = await io.downloadJsonWithEtagOrNull(container, blobName);
        throw new SaveRefusal(409, EXAM_CONFLICT, conflictDetails(latest, latestEtag, blobName));
      }
    }
  }
  throw new SaveRefusal(409, EXAM_CONFLICT, { blobName });
}

function conflictDetails(current, etag, blobName) {
  return { blobName, serverEtag: etag || null, serverSavedAt: current && typeof current.savedAt === "string" ? current.savedAt : null };
}

module.exports = { examOwnerOf, storedOwnerOf, canAccessSavedExam, writeSavedExam, SaveRefusal, EXAM_CONFLICT, EXAM_FORBIDDEN };
