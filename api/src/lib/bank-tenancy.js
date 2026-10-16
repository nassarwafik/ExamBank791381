// Phase 21G.0 — teacher tenancy for the question bank. The OFFICIAL bank (the generated 791381 / 791367 sources) is the platform's
// shared library: every teacher reads it, nobody owns it. Every other question (entered by hand, imported from a file or an exam) is
// the content of the teacher who added it: its index entry and its stored question carry `ownerId`, and only that teacher (or, for a
// pre-tenancy question without one, everyone until LEGACY_DATA_OWNER names its owner) sees, selects, changes or deletes it.
const { canAccessDocument, ownerStamp } = require("./teacher-tenancy");

/** The official generated bank: sources 791381-20xx / 791367-20xx, or an entry whose examCode is one of them. */
function isOfficialBankEntry(entry) {
  const s = String(entry && entry.sourceId || ""), e = String(entry && entry.examCode || "");
  return /^791381-20\d{2}/.test(s) || /^791367-20\d{2}/.test(s) || e === "791381" || e === "791367";
}

/** Whether `tenant` may see / use this bank index entry or question (always in single mode; always for official questions). */
function bankEntryVisible(entry, tenant, env = process.env) {
  if (!tenant || isOfficialBankEntry(entry)) return true;
  return canAccessDocument(entry, tenant, env);
}

/** The index / question entries `tenant` may see. */
function visibleBankEntries(entries, tenant, env = process.env) {
  const list = Array.isArray(entries) ? entries : [];
  return tenant ? list.filter(e => bankEntryVisible(e, tenant, env)) : list;
}

/** The owner fields a question / index entry created by `tenant` carries ({} in single mode). */
const bankOwnerStamp = ownerStamp;

module.exports = { isOfficialBankEntry, bankEntryVisible, visibleBankEntries, bankOwnerStamp };
