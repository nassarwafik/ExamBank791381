// Phase 21G.0 — teacher tenancy: every teacher works in their OWN space (classes, the students and assignments of those classes and
// everything derived from them, and the content they author). One authority decides "may this teacher see / change this document".
//
// Identity: in multi-user mode (BUILDER_USERS; a session whose signed `am` claim is "multi-user") the tenant is the token subject.
// Legacy single-password mode has ONE shared identity: no tenant, nothing is stamped or filtered (behaviour unchanged).
//
// Ownership: a document created by a tenant carries `ownerId` (on the document itself, or for class-bound data on its CLASS — the
// class is the root of students, assignments, submissions, messages, projects, reports …). A document without `ownerId` was created
// before tenancy existed. Its owner is the operator-chosen LEGACY_DATA_OWNER (a teacher subject) when that server setting is present;
// while it is absent, such a document stays SHARED (visible to every teacher, exactly as before) — nothing is ever claimed silently.
// An owned document is visible ONLY to its owner; another teacher's is reported exactly like a missing one (existence not disclosed).

/** The tenant of a verified teacher session: its subject in multi-user mode, else null (single tenant — no isolation). */
// Tadris+ P2-A2 — a MANAGED teacher session (am "managed", accounts created by the owner) is a tenant exactly like a
// BUILDER_USERS session: its subject (the account id) owns what it creates and sees only its own space.
const TENANT_MODES = new Set(["multi-user", "managed"]);
function tenantOf(user) {
  return user && TENANT_MODES.has(user.am) && typeof user.sub === "string" && user.sub ? user.sub : null;
}

/** The operator-configured owner of pre-tenancy (unowned) documents, or null (they stay shared). */
function legacyDataOwner(env = process.env) {
  const v = typeof env.LEGACY_DATA_OWNER === "string" ? env.LEGACY_DATA_OWNER.trim() : "";
  return v || null;
}

/** The effective owner of a stored document: its stamped `ownerId`, else the legacy owner, else null (shared). */
function ownerOfDocument(doc, env = process.env) {
  const stamped = doc && typeof doc.ownerId === "string" && doc.ownerId ? doc.ownerId : null;
  return stamped || legacyDataOwner(env);
}

// Tadris+ hotfix after P2-A2 — an account the owner creates from the Owner Console (id "t_" + 16 hex, identity/teacher-token.js)
// starts with an EMPTY space: a pre-tenancy document (no ownerId, no LEGACY_DATA_OWNER) is never visible to it. Owner rule:
// «لا تُسند البيانات القديمة عشوائيًا لأي معلم». Existing teachers (BUILDER_USERS ids, later imported with the same id in P2-B)
// keep today's shared view (owner decision D7) until the owner assigns that data explicitly.
const CONSOLE_ACCOUNT_RE = /^t_[a-f0-9]{16}$/;

/** Whether `tenant` (tenantOf) may see / change this document. No tenant (single mode) or a shared document → yes. */
function canAccessDocument(doc, tenant, env = process.env) {
  if (!tenant) return true;
  const owner = ownerOfDocument(doc, env);
  if (owner === null) return !CONSOLE_ACCOUNT_RE.test(tenant);
  return owner === tenant;
}

/** The ownership fields a NEW document created by `tenant` carries ({} in single mode). */
function ownerStamp(tenant) {
  return tenant ? { ownerId: tenant } : {};
}

/** Keep only the documents `tenant` may access. */
function filterAccessible(docs, tenant, env = process.env) {
  if (!tenant) return docs;
  return docs.filter(d => canAccessDocument(d, tenant, env));
}

/**
 * The class ids `tenant` may access, from the class documents already loaded (or null = every class: single mode). Class-bound
 * data (students, assignments, submissions, messages, projects, reports …) is accessible exactly when its class is.
 */
function accessibleClassIds(classes, tenant, env = process.env) {
  if (!tenant) return null;
  const out = new Set();
  for (const c of classes || []) if (c && typeof c.classId === "string" && canAccessDocument(c, tenant, env)) out.add(c.classId);
  return out;
}

/** Whether a class id is in an accessibleClassIds result (null = every class). */
function classIdAllowed(allowed, classId) {
  return allowed === null || allowed.has(String(classId || ""));
}

/**
 * Whether `tenant` may act on the class `classId` (true in single mode). `load(name)` reads one stored JSON document (null when
 * missing). A missing class is not accessible to a tenant.
 */
async function classAccessible(load, classId, tenant, env = process.env) {
  if (!tenant) return true;
  const id = String(classId || "");
  if (!id) return false;
  const doc = await load("platform/classes/" + id + ".json");
  return !!doc && canAccessDocument(doc, tenant, env);
}

/** Whether `tenant` may act on this student document: through its own owner stamp, or (without one) through its class. */
async function studentAccessible(load, student, tenant, env = process.env) {
  if (!tenant) return true;
  if (!student || student.role !== "student") return false;
  if (typeof student.ownerId === "string" && student.ownerId) return canAccessDocument(student, tenant, env);
  return classAccessible(load, student.classId, tenant, env);
}

module.exports = { CONSOLE_ACCOUNT_RE, classAccessible, studentAccessible, tenantOf, legacyDataOwner, ownerOfDocument, canAccessDocument, ownerStamp, filterAccessible, accessibleClassIds, classIdAllowed };
