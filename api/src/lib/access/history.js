const storage = require("../platform-storage");
const { REVISION_ID_RE, revisionName, evaluateRevision } = require("./revisions");

// Tadris+ P4-B1 — a teacher's access history: the chain of immutable revisions from the account's CURRENT pointer back through
// `parentRevisionId` (blueprint §6.3). Read-only. Every stored revision is re-validated (fail closed): an entry that cannot be
// trusted is shown as invalid and the walk stops there — nothing past an untrusted link is presented as this teacher's history.
// Orphans (a revision written whose pointer swap lost a race) are not on the chain, so they never appear.

const MAX_HISTORY = 50;

/**
 * → { entries: [{ revisionId, parentRevisionId, preset, grants, denies, reason, createdAt, createdBy, valid, code?, capabilities }],
 *     truncated }   newest first; `truncated` when older revisions exist beyond the limit.
 */
async function readAccessHistory(container, accountId, headRevisionId, deps = {}, limit = MAX_HISTORY) {
  const download = deps.downloadJsonOrNull || storage.downloadJsonOrNull;
  const entries = [];
  const seen = new Set();
  let id = headRevisionId || null;
  while (id && entries.length < limit) {
    if (!REVISION_ID_RE.test(String(id)) || seen.has(id)) { entries.push(broken(id, "REVISION_INVALID")); return { entries, truncated: false }; }
    seen.add(id);
    const doc = await download(container, revisionName(id));
    if (!doc) { entries.push(broken(id, "REVISION_MISSING")); return { entries, truncated: false }; }
    if (doc.schemaVersion !== 1 || doc.revisionId !== id || doc.accountId !== accountId) { entries.push(broken(id, "REVISION_INVALID")); return { entries, truncated: false }; }
    const verdict = evaluateRevision(doc);
    entries.push({
      revisionId: id, parentRevisionId: doc.parentRevisionId || null,
      preset: doc.preset && typeof doc.preset === "object" ? { id: String(doc.preset.id || ""), version: Number(doc.preset.version) } : null,
      grants: Array.isArray(doc.grants) ? doc.grants.map(String) : [], denies: Array.isArray(doc.denies) ? doc.denies.map(String) : [],
      reason: String(doc.reason || ""), createdAt: String(doc.createdAt || ""), createdBy: String(doc.createdBy || ""),
      valid: verdict.ok, ...(verdict.ok ? {} : { code: verdict.code }), capabilities: verdict.ok ? verdict.capabilities : []
    });
    if (!verdict.ok) return { entries, truncated: false };
    id = doc.parentRevisionId || null;
  }
  return { entries, truncated: Boolean(id) };
}

const broken = (revisionId, code) => ({ revisionId: String(revisionId), parentRevisionId: null, preset: null, grants: [], denies: [], reason: "", createdAt: "", createdBy: "", valid: false, code, capabilities: [] });

module.exports = { MAX_HISTORY, readAccessHistory };
