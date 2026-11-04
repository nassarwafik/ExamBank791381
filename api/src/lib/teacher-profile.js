// Teacher identity — the audited model: ONE builder identity (BUILDER_USER_CODE), a signed token whose `sub` is the
// user code, and a hard-coded "المعلم" display name with no editable profile document. This module adds the minimal
// canonical self-profile: platform/teacher-profiles/<sub>.json { displayName, avatarId, profilePhoto, updatedAt }.
// The teacher id is ALWAYS the verified token subject — never a body/query field — so self-service can never target
// another teacher. Display-name authority: profile displayName → configured fallback (TEACHER_DISPLAY_NAME env) →
// "المعلم". The preset avatar allow-list mirrors src/avatars.tsx (the same set students use).
const { downloadJsonOrNull } = require("./platform-storage");
const { photoMeta } = require("./profile-photo-store");
const { getBuilderAccount } = require("./builder-users");
const { WIDGETS } = require("./dashboard-widgets");

const PROFILE_PREFIX = "platform/teacher-profiles/";
const PHOTO_PREFIX = "platform/teacher-profile-images/";
const VALID_AVATARS = new Set(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10", "a11", "a12"]);
const MAX_NAME_LENGTH = 60;
const DEFAULT_DISPLAY_NAME = "المعلم";

/** A safe blob-path segment for the teacher id (the token subject). */
function teacherKey(sub) {
  const s = String(sub || "").trim();
  if (!s || s.length > 128) return "";
  return encodeURIComponent(s).replace(/%/g, "_");
}
const profileDocName = sub => PROFILE_PREFIX + teacherKey(sub) + ".json";
/** The teacher's photo namespace — every immutable revision lives under it; the profile document selects the active one. */
const teacherPhotoPrefix = sub => PHOTO_PREFIX + teacherKey(sub) + "/";

// Phase 14B — in multi-user mode (BUILDER_USERS) the configured account's display name sits between the stored profile
// name and the single-teacher TEACHER_DISPLAY_NAME fallback: profile displayName → account displayName → configured
// fallback → «المعلم». The actor id stays the authority; a display name is presentation only.
function fallbackDisplayName(sub) {
  const account = sub ? getBuilderAccount(process.env, String(sub)) : null;
  if (account && account.displayName && account.displayName !== account.actorId) return account.displayName;
  const configured = String(process.env.TEACHER_DISPLAY_NAME || "").trim();
  return configured || DEFAULT_DISPLAY_NAME;
}

/** A trimmed, single-line name of 1..60 characters, or null. */
function normalizeDisplayName(value) {
  const name = String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

/** The public self-profile view of a stored document (never leaks internals; fills the name fallback). */
function publicTeacherProfile(sub, doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  const name = normalizeDisplayName(d.displayName);
  return {
    teacherId: String(sub || ""),
    displayName: name || fallbackDisplayName(sub),
    hasCustomName: !!name,
    avatarId: VALID_AVATARS.has(String(d.avatarId || "")) ? String(d.avatarId) : "",
    profilePhoto: photoMeta(d),
    updatedAt: String(d.updatedAt || "")
  };
}

/** The teacher's display name for session/login responses (one optional read; failures → fallback). */
async function resolveTeacherDisplayName(containerOrGetter, sub, deps = {}) {
  try {
    const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
    if (!teacherKey(sub)) return fallbackDisplayName(sub);
    const container = typeof containerOrGetter === "function" ? containerOrGetter() : containerOrGetter;
    const doc = await dl(container, profileDocName(sub));
    return publicTeacherProfile(sub, doc).displayName;
  } catch {
    return fallbackDisplayName(sub);
  }
}

/** Tadris+ P2-A2 — a MANAGED teacher's name: their own profile name if they set one, else the name the owner gave the account.
 *  Never the deployment-wide TEACHER_DISPLAY_NAME / BUILDER_USERS fallbacks (those describe other identities). */
async function resolveManagedTeacherDisplayName(containerOrGetter, sub, accountDisplayName, deps = {}) {
  const fallback = String(accountDisplayName || "").trim() || DEFAULT_DISPLAY_NAME;
  try {
    const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
    if (!teacherKey(sub)) return fallback;
    const container = typeof containerOrGetter === "function" ? containerOrGetter() : containerOrGetter;
    const profile = publicTeacherProfile(sub, await dl(container, profileDocName(sub)));
    return profile.hasCustomName ? profile.displayName : fallback;
  } catch {
    return fallback;
  }
}

// Tadris+ P7-A2 — the teacher's own arrangement of the «اليوم» cards: { order: widget ids, hidden: widget ids }, stored as
// `appearance.dashboardLayout` of the profile document. Only «today» widget ids, without duplicates; a stored id the teacher may no
// longer see is simply ignored when shown (the server's `widgets` still decides what is sent). Presentation only: hiding a card
// here never widens or narrows what the server serves.
const LAYOUT_IDS = new Set(WIDGETS.filter(w => w.page === "today").map(w => w.id));
const MAX_LAYOUT = 32;
function validateDashboardLayout(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "ترتيب البطاقات غير صالح." };
  const out = {};
  for (const key of ["order", "hidden"]) {
    const v = input[key] === undefined ? [] : input[key];
    if (!Array.isArray(v) || v.length > MAX_LAYOUT) return { ok: false, error: "ترتيب البطاقات غير صالح." };
    if (v.some(id => typeof id !== "string" || !LAYOUT_IDS.has(id))) return { ok: false, error: "بطاقة غير معروفة في الترتيب." };
    if (new Set(v).size !== v.length) return { ok: false, error: "بطاقة مكررة في الترتيب." };
    out[key] = [...v];
  }
  return { ok: true, layout: out };
}
/** The stored arrangement, re-validated on read (an invalid one → the default arrangement, i.e. null). */
function dashboardLayoutOf(doc) {
  const v = doc && doc.appearance && doc.appearance.dashboardLayout;
  if (!v) return null;
  const r = validateDashboardLayout(v);
  return r.ok ? r.layout : null;
}

// Tadris+ P8-A1 — the teacher's appearance presets (blueprint §9.3, owner decisions §19.27), stored as `appearance.{theme, palette,
// density}` of the profile document so it follows the teacher on every device. Only the registered values; «default» is stored as the
// field's absence. PRESENTATION ONLY: no security check ever reads these fields (blueprint acceptance test 12).
const APPEARANCE = Object.freeze({
  theme: Object.freeze({ values: Object.freeze(["light", "dark"]), fallback: "light", capability: "appearance.theme.choose" }),
  palette: Object.freeze({ values: Object.freeze(["default", "ocean", "forest", "sand"]), fallback: "default", capability: "appearance.palette.choose" }),
  density: Object.freeze({ values: Object.freeze(["comfortable", "compact"]), fallback: "comfortable", capability: "appearance.density.choose" })
});
/** { ok, changes: { field: value } } — only the fields present in `input`; each must be a registered value. */
function validateAppearance(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "المظهر غير صالح." };
  const keys = Object.keys(input);
  if (!keys.length || keys.some(k => !Object.prototype.hasOwnProperty.call(APPEARANCE, k))) return { ok: false, error: "المظهر غير صالح." };
  const changes = {};
  for (const k of keys) {
    if (typeof input[k] !== "string" || !APPEARANCE[k].values.includes(input[k])) return { ok: false, error: "قيمة مظهر غير معروفة." };
    changes[k] = input[k];
  }
  return { ok: true, changes };
}
/** The stored appearance, re-validated on read (an unknown value → that field's default). */
function appearanceOf(doc) {
  const a = doc && doc.appearance && typeof doc.appearance === "object" ? doc.appearance : {};
  const out = {};
  for (const [k, spec] of Object.entries(APPEARANCE)) out[k] = typeof a[k] === "string" && spec.values.includes(a[k]) ? a[k] : spec.fallback;
  return out;
}

module.exports = { APPEARANCE, validateAppearance, appearanceOf, validateDashboardLayout, dashboardLayoutOf, resolveManagedTeacherDisplayName, PROFILE_PREFIX, PHOTO_PREFIX, VALID_AVATARS, MAX_NAME_LENGTH, DEFAULT_DISPLAY_NAME, teacherKey, profileDocName, teacherPhotoPrefix, fallbackDisplayName, normalizeDisplayName, publicTeacherProfile, resolveTeacherDisplayName };
