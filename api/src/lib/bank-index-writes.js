// Data-integrity fix (batch 4) — the shared bank index (index/questions-index.json) and the source documents
// (sources/<id>.json) are written by several routes. A route that read the whole document, worked (an AI call can take
// seconds), then uploaded the whole document back, silently erased what another request wrote meanwhile (an imported
// source's entries, a teacher's edit). These helpers apply a route's own change onto the CURRENT document inside one
// CAS round (platform-storage.mutateJsonWithRetry: ETag-conditional, retried on a conflict), so concurrent writers merge.
const { mutateJsonWithRetry } = require("./platform-storage");

const INDEX_BLOB = "index/questions-index.json";

const questionsOf = doc => (doc && Array.isArray(doc.questions) ? doc.questions : []);

/** Replaces ONE source's entries in the index; every other source's entries are kept as they are now. */
function replaceSourceInIndex(container, sourceId, entries, now) {
  return mutateJsonWithRetry(container, INDEX_BLOB, current => {
    const questions = [...questionsOf(current).filter(entry => entry.sourceId !== sourceId), ...entries];
    return { ...(current || {}), schemaVersion: 1, updatedAt: now, questionCount: questions.length, questions };
  });
}

/** Calls `apply(entry)` on the CURRENT index entry of each listed question id (missing ids are skipped). */
function updateIndexEntries(container, ids, apply, now) {
  const wanted = new Set(ids);
  return mutateJsonWithRetry(container, INDEX_BLOB, current => {
    if (!current) return current;
    for (const entry of questionsOf(current)) if (entry && wanted.has(entry.id)) apply(entry);
    current.updatedAt = now;
    return current;
  });
}

/**
 * Calls `apply(question)` on the CURRENT source document's question of each listed id and saves it. A missing source
 * document is an error (it was read moments ago), never an empty document written in its place.
 */
function updateSourceQuestions(container, sourceBlobName, ids, apply, now) {
  const wanted = new Set(ids);
  return mutateJsonWithRetry(container, sourceBlobName, current => {
    if (!current) throw new Error("Bank source document is missing: " + sourceBlobName);
    for (const question of questionsOf(current)) if (question && wanted.has(question.id)) apply(question);
    current.updatedAt = now;
    return current;
  });
}

module.exports = { INDEX_BLOB, replaceSourceInIndex, updateIndexEntries, updateSourceQuestions };
