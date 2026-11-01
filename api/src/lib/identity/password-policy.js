// Tadris+ P1-A — password policy for managed accounts (blueprint §7.5). Length is the main defence (NIST SP 800-63B):
// at least 14 characters for the owner, 12 for teachers (P2-A); no composition rules; a small built-in list of obviously
// guessable values and a check that the password does not contain the username. No external breach service is called.

const MAX_LENGTH = 256;
const MIN_LENGTH = { owner: 14, teacher: 12 };

const COMMON = new Set([
  "passwordpassword", "password123456", "12345678901234", "qwertyuiopasdf", "adminadminadmin",
  "tadrisplus12345", "examBank791381".toLowerCase(), "welcome1234567", "iloveyou123456", "11111111111111"
]);

/** → { ok: true } or { ok: false, code } with code ∈ TOO_SHORT | TOO_LONG | CONTAINS_USERNAME | TOO_COMMON | REPETITIVE. */
function checkPassword(password, { role = "owner", username = "" } = {}) {
  const text = String(password ?? "");
  const min = MIN_LENGTH[role] || MIN_LENGTH.owner;
  if ([...text].length < min) return { ok: false, code: "TOO_SHORT", min };
  if (text.length > MAX_LENGTH) return { ok: false, code: "TOO_LONG" };
  const lower = text.normalize("NFKC").toLowerCase();
  const user = String(username || "").normalize("NFKC").toLowerCase();
  if (user.length >= 3 && lower.includes(user)) return { ok: false, code: "CONTAINS_USERNAME" };
  if (COMMON.has(lower)) return { ok: false, code: "TOO_COMMON" };
  if (new Set([...lower]).size < 5) return { ok: false, code: "REPETITIVE" };
  return { ok: true };
}

const MESSAGES = {
  TOO_SHORT: min => `كلمة المرور قصيرة: ${min} حرفًا على الأقل.`,
  TOO_LONG: () => "كلمة المرور طويلة جدًا.",
  CONTAINS_USERNAME: () => "كلمة المرور يجب ألا تحتوي اسم المستخدم.",
  TOO_COMMON: () => "كلمة المرور شائعة جدًا. اختر عبارة أطول وأقل توقعًا.",
  REPETITIVE: () => "كلمة المرور متكررة الأحرف. اختر عبارة أكثر تنوعًا."
};

function passwordPolicyMessage(result) {
  const fn = MESSAGES[result?.code];
  return fn ? fn(result.min) : "كلمة المرور غير مقبولة.";
}

module.exports = { MIN_LENGTH, MAX_LENGTH, checkPassword, passwordPolicyMessage };
