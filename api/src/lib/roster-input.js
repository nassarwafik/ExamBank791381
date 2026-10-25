// Classes & Students hardening — the ONE input-normalization module for roster identifiers and teacher-typed text.
//
// Every id that becomes a blob-name segment (classId, userId, targetClassId, profileUserId) must match the repository's
// safe-id convention (class-assignment-index / assignment-results SAFE_ID). Without it a value such as "../auth/<hash>"
// is resolved by the storage SDK as a dot-segment and reaches a document outside platform/classes/ or platform/users/.
//
// Identity numbers: Arabic-Indic (U+0660–0669) and Extended Arabic-Indic / Persian (U+06F0–06F9) digits are mapped
// to ASCII BEFORE anything is stripped, so "١٢٣٤٥٦٧٨٩" is the same identity as "123456789" (previously those digits
// were deleted by /\D/ and the remainder zero-padded into a DIFFERENT identity). Only digit-group separators (space,
// dash, dot, slash) are tolerated; any other character makes the value invalid instead of being silently removed.
//
// Person names / class labels: Unicode NFC, invisible bidi-override and control characters removed (an RLO/LRO in a
// name can visually reorder a roster row or an exported CSV), whitespace collapsed, and a bounded length.

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
function isSafeId(value) { return typeof value === "string" && SAFE_ID.test(value); }

function toAsciiDigits(value) {
  return String(value ?? "").replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
}

/**
 * Canonical identity number: ASCII digits; a short value is left-padded to 9 (the established spreadsheet
 * leading-zero rule); a longer run is kept so the 9-digit validator rejects it. A value containing anything other
 * than digits and group separators is returned as its cleaned text so validation fails instead of guessing.
 */
function normalizeIdentityNumber(value) {
  const text = toAsciiDigits(value).trim();
  if (!text) return "";
  if (/[^\d\s\-./]/.test(text)) return text.replace(/\s+/g, "");
  const digits = text.replace(/\D/g, "");
  if (!digits) return "";
  return digits.length <= 9 ? digits.padStart(9, "0") : digits;
}

// Bidi marks/embeddings/overrides/isolates, zero-width space, BOM and C0/C1 controls never belong in a name. ZWNJ/ZWJ
// (U+200C/U+200D) are kept: they are legitimate in Persian/Arabic orthography.
function isInvisible(code) {
  return code <= 0x08 || (code >= 0x0E && code <= 0x1F) || (code >= 0x7F && code <= 0x9F) ||
    code === 0x200B || code === 0x200E || code === 0x200F || (code >= 0x202A && code <= 0x202E) ||
    (code >= 0x2060 && code <= 0x2069) || code === 0xFEFF;
}
function cleanText(value) {
  // Tab / newline / CR (0x09–0x0D) are whitespace: collapsed to one space below rather than deleted.
  const visible = Array.from(String(value ?? "").normalize("NFC")).filter(ch => !isInvisible(ch.codePointAt(0))).join("");
  const text = visible.replace(/\s+/g, " ").trim();
  // QA-20 — ZWNJ / ZWJ are kept INSIDE a word, but a value made only of them (and spaces) shows nothing: it is empty, so a
  // "name" nobody can see is refused exactly like a blank one.
  return text.replace(/[\u200C\u200D\s]/g, "") ? text : "";
}

const LIMITS = Object.freeze({ personName: 60, className: 80, grade: 40, schoolYear: 20, passwordMin: 6, passwordMax: 128 });

module.exports = { isSafeId, toAsciiDigits, normalizeIdentityNumber, cleanText, LIMITS };
