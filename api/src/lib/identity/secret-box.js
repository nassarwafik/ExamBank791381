const crypto = require("crypto");

// Tadris+ P1-A — authenticated encryption (AES-256-GCM) for secrets that must be READ back later, i.e. the owner's TOTP
// secret (a hash is impossible: the server must recompute codes). Passwords and recovery codes are never stored this way;
// they are hashed.
//
// Key: HMAC-SHA256(root secret, "ExamBank791381:secret-box:v1:" + purpose), a key per purpose (domain separation), from the
// same root chain as the owner session signer: OWNER_SESSION_SECRET || BUILDER_SESSION_SECRET || BANK_SETUP_KEY.
// The additional authenticated data binds a sealed value to its owner (e.g. the account id), so a sealed TOTP secret
// copied into another account document does not open.
//
// Operator note: rotating the root secret makes sealed TOTP secrets unreadable. The owner then signs in with a recovery
// code and re-enrols TOTP (recovery codes are hashes and survive a rotation).

const CONTEXT = "ExamBank791381:secret-box:v1:";
const IV_BYTES = 12;

function rootSecret(env = process.env) {
  return env.OWNER_SESSION_SECRET || env.BUILDER_SESSION_SECRET || env.BANK_SETUP_KEY || "";
}

function keyFor(purpose, env) {
  const root = rootSecret(env);
  if (!root) throw new Error("No signing secret is configured for the secret box.");
  return crypto.createHmac("sha256", root).update(CONTEXT + String(purpose)).digest();
}

/** → { v: 1, iv, tag, ct } (base64 strings). */
function sealSecret(plain, { purpose, aad = "", env = process.env }) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFor(purpose, env), iv);
  cipher.setAAD(Buffer.from(String(aad), "utf8"));
  const ct = Buffer.concat([cipher.update(Buffer.isBuffer(plain) ? plain : Buffer.from(String(plain), "utf8")), cipher.final()]);
  return { v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}

/** → Buffer, or null when the box is malformed, tampered, sealed for another purpose / aad, or the root secret changed. */
function openSecret(box, { purpose, aad = "", env = process.env }) {
  try {
    if (!box || box.v !== 1) return null;
    const iv = Buffer.from(String(box.iv || ""), "base64");
    const tag = Buffer.from(String(box.tag || ""), "base64");
    const ct = Buffer.from(String(box.ct || ""), "base64");
    if (iv.length !== IV_BYTES || tag.length !== 16 || !ct.length) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyFor(purpose, env), iv);
    decipher.setAAD(Buffer.from(String(aad), "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    return null;
  }
}

module.exports = { sealSecret, openSecret, rootSecret };
