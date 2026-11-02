// Trial accounts — outgoing email through Azure Communication Services (owner decision: ACS). The ONLY email channel of the API.
//
// Configuration (Static Web App application settings, set by the owner; never logged, never returned):
//   ACS_EMAIL_CONNECTION_STRING   "endpoint=https://<resource>.communication.azure.com/;accesskey=<key>"   (a secret)
//   TRIAL_EMAIL_SENDER            the verified sender address of the ACS email domain (e.g. DoNotReply@<domain>)
//   OWNER_NOTIFICATION_EMAIL      the owner's own address for the owner copies (optional: without it only teachers are written to)
//   PLATFORM_TIME_ZONE            optional IANA zone for dates in the emails (e.g. Asia/Amman); default UTC
// Missing or malformed → { ok: false, reason } and nothing is sent: the caller reports "not configured", never an error per email.
const { EmailClient } = require("@azure/communication-email");

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const CONNECTION = /^endpoint=https:\/\/[^;\s]+;accesskey=[^;\s]+;?$/i;
const isEmail = v => typeof v === "string" && v.length <= 254 && EMAIL.test(v.trim());

/** The time zone for dates in emails: PLATFORM_TIME_ZONE when it is a zone this runtime knows, else UTC. */
function emailTimeZone(env = process.env) {
  const tz = typeof env.PLATFORM_TIME_ZONE === "string" ? env.PLATFORM_TIME_ZONE.trim() : "";
  if (!tz) return "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } catch { return "UTC"; }
}

/** → { ok: true, connectionString, sender, ownerEmail, timeZone } | { ok: false, reason } (a code, never a setting's value). */
function emailConfig(env = process.env) {
  const connectionString = typeof env.ACS_EMAIL_CONNECTION_STRING === "string" ? env.ACS_EMAIL_CONNECTION_STRING.trim() : "";
  const sender = typeof env.TRIAL_EMAIL_SENDER === "string" ? env.TRIAL_EMAIL_SENDER.trim() : "";
  if (!connectionString && !sender) return { ok: false, reason: "not-configured" };
  if (!CONNECTION.test(connectionString)) return { ok: false, reason: "connection-string-invalid" };
  if (!isEmail(sender)) return { ok: false, reason: "sender-invalid" };
  const owner = typeof env.OWNER_NOTIFICATION_EMAIL === "string" ? env.OWNER_NOTIFICATION_EMAIL.trim() : "";
  return { ok: true, connectionString, sender, ownerEmail: isEmail(owner) ? owner : "", timeZone: emailTimeZone(env) };
}

/**
 * Hands one email to ACS. Resolves when ACS has ACCEPTED it (the send operation started); delivery itself is asynchronous and is not
 * awaited, so a sweep stays inside the host's request time limit. Throws when ACS refuses it. `deps.emailClient` (tests) replaces the
 * real client.
 */
async function sendEmail(cfg, { to, subject, plainText, html }, deps = {}) {
  if (!isEmail(to)) { const e = new Error("Invalid recipient."); e.code = "RECIPIENT_INVALID"; throw e; }
  const client = deps.emailClient || new EmailClient(cfg.connectionString);
  const poller = await client.beginSend({
    senderAddress: cfg.sender,
    recipients: { to: [{ address: to.trim() }] },
    content: { subject, plainText, html }
  });
  const state = poller && typeof poller.getOperationState === "function" ? poller.getOperationState() : null;
  if (state && state.error) { const e = new Error("Email refused."); e.code = "EMAIL_REFUSED"; throw e; }
  return { accepted: true };
}

const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

module.exports = { emailConfig, emailTimeZone, sendEmail, isEmail, escapeHtml };
