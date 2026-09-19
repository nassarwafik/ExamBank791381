// Teacher identity — the audited model: ONE builder identity (BUILDER_USER_CODE), a signed token whose `sub` is the
// user code, and a hard-coded "المعلم" display name with no editable profile document. This module adds the minimal
// canonical self-profile: platform/teacher-profiles/<sub>.json { displayName, avatarId, profilePhoto, updatedAt }.
// The teacher id is ALWAYS the verified token subject — never a body/query field — so self-service can never target
// another teacher. Display-name authority: profile displayName → configured fallback (TEACHER_DISPLAY_NAME env) →
// "المعلم". The preset avatar allow-list mirrors src/avatars.tsx (the same set students use).
const { downloadJsonOrNull } = require("./platform-storage");
const { photoMeta } = require("./profile-photo-store");

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
const teacherPhotoBlobName = sub => PHOTO_PREFIX + teacherKey(sub) + "/current.webp";

function fallbackDisplayName() {
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
    displayName: name || fallbackDisplayName(),
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
    if (!teacherKey(sub)) return fallbackDisplayName();
    const container = typeof containerOrGetter === "function" ? containerOrGetter() : containerOrGetter;
    const doc = await dl(container, profileDocName(sub));
    return publicTeacherProfile(sub, doc).displayName;
  } catch {
    return fallbackDisplayName();
  }
}

module.exports = { PROFILE_PREFIX, PHOTO_PREFIX, VALID_AVATARS, MAX_NAME_LENGTH, DEFAULT_DISPLAY_NAME, teacherKey, profileDocName, teacherPhotoBlobName, fallbackDisplayName, normalizeDisplayName, publicTeacherProfile, resolveTeacherDisplayName };
