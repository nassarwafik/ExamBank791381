// Phase L.6a — the learning-book MODULE BODIES as the API serves them: api/src/data/learning-content/<courseId>/<moduleId>.json,
// generated from the authored content (scripts/build-learning-content.mjs, pinned by src/learning/content/contentData.sync.test.ts).
// Read-only data, loaded once per process and cached with a strong ETag of the exact bytes.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DATA_DIR = path.join(__dirname, "../data/learning-content");
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const CACHE = new Map();

/** { module, etag } for a module of a course, or null for an id the book does not have (never a path outside the data dir). */
function loadModuleBody(courseId, moduleId) {
  const c = String(courseId || "").trim(), m = String(moduleId || "").trim();
  if (!ID.test(c) || !ID.test(m)) return null;
  const key = c + "/" + m;
  if (CACHE.has(key)) return CACHE.get(key);
  let entry = null;
  try {
    const text = fs.readFileSync(path.join(DATA_DIR, c, m + ".json"), "utf8");
    const module = JSON.parse(text);
    if (module && typeof module === "object" && module.id === m && Array.isArray(module.lessons)) {
      entry = { module, etag: '"' + crypto.createHash("sha256").update(text).digest("base64url").slice(0, 22) + '"' };
    }
  } catch { entry = null; }
  CACHE.set(key, entry);
  return entry;
}

module.exports = { loadModuleBody };
