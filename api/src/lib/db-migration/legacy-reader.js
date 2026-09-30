// Phase 15A — read-only loader of the legacy blob documents used by the 15A transform.
// Lists each prefix and downloads with the shared bounded concurrency. Never writes, never deletes.

const { listBlobNames, downloadManyJson } = require("../platform-storage");
const { PREFIX } = require("./legacy-transform");

async function readPrefix(container, prefix) {
  const names = await listBlobNames(container, prefix);
  const docs = await downloadManyJson(container, names);
  const out = [];
  names.forEach((name, i) => { if (docs[i] !== null && docs[i] !== undefined) out.push({ name, doc: docs[i] }); });
  return out;
}

/** { users, auth, classes, assignments, submissions, teacherProfiles }: arrays of { name, doc }. */
async function readLegacyPlatform(container) {
  const result = {};
  for (const [key, prefix] of Object.entries(PREFIX)) result[key] = await readPrefix(container, prefix);
  return result;
}

module.exports = { readLegacyPlatform };
