// Trial accounts — the reminder EMAILS before a trial ends (owner decisions: Azure Communication Services; to the teacher AND the owner;
// 3 days before the end, then on the end). Run by the signed sweep route (functions/trial-reminder-sweep.js), triggered hourly by
// .github/workflows/trial-reminders.yml.
//
// Who is written to, per TRIAL account that is not suspended:
//   stage "before" — the trial is running and ends within TRIAL_WARNING_DAYS (the same window as the in-app warnings);
//   stage "ended"  — the trial ended at most ENDED_GRACE_MS ago (an old ended trial is never written to when email is first set up).
//   recipients     — the teacher at the account's email (when it is a valid address) and the owner at OWNER_NOTIFICATION_EMAIL (when set).
//
// Exactly once per recipient, stage and END DATE: a create-only marker named by a SHA-256 of account, end, stage and recipient kind
// reserves the email BEFORE it is sent. A retried or replayed sweep finds the marker and sends nothing; an EXTENDED trial has a new end
// and gets its own reminders. A send ACS refuses releases its marker, so the next hourly run tries again.
//
// Email not configured (lib/email/acs-email.js) → nothing is reserved and nothing is sent; the answer says how many emails are due.
// Bounded: at most MAX_EMAILS_PER_RUN per run (the host's request time limit); the next run continues. The answer and the logs carry
// counts only — never a name, an address or a setting.
const crypto = require("crypto");
const { deleteBlob } = require("./platform-storage");
const { createOnly } = require("./identity/owner-store");
const { listTeacherAccounts, isTrial, trialEnded, trialEndingSoon, DAY_MS } = require("./identity/teacher-accounts");
const { emailConfig, sendEmail, isEmail, escapeHtml } = require("./email/acs-email");

const MARKER_PREFIX = "platform/trial-reminders/";
const ENDED_GRACE_MS = 2 * DAY_MS;
const MAX_EMAILS_PER_RUN = 20;

const markerName = (accountId, endsAtMs, stage, kind) => MARKER_PREFIX + crypto.createHash("sha256").update("trial-reminder|" + accountId + "|" + endsAtMs + "|" + stage + "|" + kind).digest("hex") + ".json";

/** PURE: the reminder stage this account is in now — "before", "ended" or "" (none). */
function reminderStage(account, nowMs) {
  if (!isTrial(account) || account.status === "suspended") return "";
  const end = Number(account.trial && account.trial.endsAtMs);
  if (!Number.isFinite(end)) return "";
  if (trialEndingSoon(account, nowMs)) return "before";
  if (trialEnded(account, nowMs) && nowMs - end <= ENDED_GRACE_MS) return "ended";
  return "";
}

const daysText = n => (n === 1 ? "يوم واحد" : n === 2 ? "يومين" : n + " أيام");
function formatEnd(endsAtMs, timeZone) {
  const text = new Date(endsAtMs).toLocaleString("ar", { dateStyle: "long", timeStyle: "short", timeZone });
  return text + " (" + (timeZone === "UTC" ? "بتوقيت UTC" : "بتوقيت " + timeZone) + ")";
}

/** PURE: the email for one recipient (Arabic, right-to-left). Never a link carrying a credential. */
function composeEmail({ account, stage, kind, nowMs, timeZone }) {
  const end = Number(account.trial.endsAtMs);
  const when = formatEnd(end, timeZone);
  const left = daysText(Math.max(1, Math.ceil((end - nowMs) / DAY_MS)));
  const name = String(account.displayName || account.username || "");
  const user = String(account.username || "");
  let subject, lines;
  if (kind === "teacher") {
    subject = stage === "before" ? "تنبيه: تنتهي فترتك التجريبية خلال " + left : "انتهت الفترة التجريبية لحسابك";
    lines = stage === "before"
      ? ["مرحبًا " + name + "،", "تنتهي الفترة التجريبية لحسابك (" + user + ") في " + when + ".", "بعدها يتوقف دخولك إلى المنصة، وتبقى صفوفك وامتحاناتك وطلابك ونتائجك محفوظة كما هي.", "لتمديد التجربة أو لتحويل حسابك إلى حساب دائم، تواصل مع إدارة المنصة."]
      : ["مرحبًا " + name + "،", "انتهت الفترة التجريبية لحسابك (" + user + ") في " + when + "، وتوقف دخولك إلى المنصة.", "بياناتك محفوظة كما هي، وتعود إليها فور تمديد التجربة أو تحويل حسابك إلى حساب دائم.", "تواصل مع إدارة المنصة لذلك."];
  } else {
    subject = stage === "before" ? "حساب تجريبي ينتهي خلال " + left + ": " + name : "انتهت تجربة " + name;
    lines = stage === "before"
      ? ["تنتهي الفترة التجريبية للمعلم " + name + " (" + user + ") في " + when + ".", "مدّدها أو حوّل الحساب إلى دائم من لوحة المالك › المعلمون، قبل أن يتوقف دخوله."]
      : ["انتهت الفترة التجريبية للمعلم " + name + " (" + user + ") في " + when + "، وتوقف دخوله.", "بياناته محفوظة. يمكنك تمديد التجربة أو تحويل الحساب إلى دائم من لوحة المالك › المعلمون."];
  }
  const plainText = lines.join("\n\n");
  const html = '<!doctype html><html lang="ar" dir="rtl"><body style="font-family:Tahoma,Arial,sans-serif;line-height:1.7;direction:rtl;text-align:right">'
    + lines.map(l => "<p>" + escapeHtml(l) + "</p>").join("") + "</body></html>";
  return { subject, plainText, html };
}

/** One sweep. Never throws for one email's failure; a listing failure throws (the route answers 503 and the next run retries). */
async function runTrialReminderSweep(container, { nowMs = Date.now(), env = process.env, deps = {}, obs = null, maxEmails = MAX_EMAILS_PER_RUN } = {}) {
  const list = deps.listTeacherAccounts || listTeacherAccounts;
  const reserve = deps.createOnly || createOnly;
  const release = deps.deleteBlob || deleteBlob;
  const send = deps.sendEmail || sendEmail;
  const cfg = emailConfig(env);
  const out = { emailConfigured: cfg.ok, trials: 0, due: 0, sent: 0, alreadySent: 0, failed: 0, truncated: false };
  if (!cfg.ok) out.code = "EMAIL_" + cfg.reason.toUpperCase().replace(/-/g, "_");

  const accounts = (await list(container)).filter(a => isTrial(a));
  out.trials = accounts.length;
  for (const account of accounts) {
    const stage = reminderStage(account, nowMs);
    if (!stage) continue;
    const recipients = [];
    if (isEmail(account.email)) recipients.push({ kind: "teacher", to: String(account.email).trim() });
    if (cfg.ok && cfg.ownerEmail) recipients.push({ kind: "owner", to: cfg.ownerEmail });
    else if (!cfg.ok) recipients.push({ kind: "owner", to: "" });          // counted as due: the owner copy needs the email settings too
    for (const r of recipients) {
      out.due += 1;
      if (!cfg.ok) continue;                                                 // not configured: reserve nothing, send nothing
      if (out.sent + out.failed >= maxEmails) { out.truncated = true; continue; }
      const marker = markerName(account.accountId, Number(account.trial.endsAtMs), stage, r.kind);
      let reserved = false;
      try { reserved = await reserve(container, marker, { schemaVersion: 1, stage, kind: r.kind, endsAtMs: Number(account.trial.endsAtMs), reservedAtMs: nowMs }); }
      catch (e) { out.failed += 1; obs?.logWarn?.("trial.reminder.reserve_failed", { reason: String(e?.code || "error") }); continue; }
      if (!reserved) { out.alreadySent += 1; continue; }
      try {
        await send(cfg, { to: r.to, ...composeEmail({ account, stage, kind: r.kind, nowMs, timeZone: cfg.timeZone }) }, deps);
        out.sent += 1;
      } catch (e) {
        out.failed += 1;
        obs?.logWarn?.("trial.reminder.send_failed", { reason: String(e?.code || "error") });
        try { await release(container, marker); } catch { /* the marker stays: this email is not retried (never sent twice) */ }
      }
    }
  }
  return out;
}

module.exports = { MARKER_PREFIX, ENDED_GRACE_MS, MAX_EMAILS_PER_RUN, markerName, reminderStage, composeEmail, runTrialReminderSweep };
