// Phase 6B — send a Web Push notification to a STUDENT when a teacher's direct message has been SAVED.
//
// Rules:
//  - The message is the source of truth; this is a best-effort side effect. Nothing here throws to the caller:
//    missing/invalid VAPID configuration, a push service outage, timeouts or expired subscriptions only produce a
//    result summary (and a redacted log line). Callers await it with a time bound (see notifyWithTimeout).
//  - The notification carries NO message content (lock screens are shared/visible): a fixed Arabic title/body.
//  - Every stored subscription of the student is tried independently (Promise.allSettled). 404/410 from the push
//    service = the browser unsubscribed → the subscription is removed. Any other failure is kept (may be transient).
//  - FAIL-CLOSED ownership: a device is used only when its owner record explicitly names this student. A missing,
//    released or foreign owner record means no send (the stale list entry is cleaned up by claim, never blindly).
//  - Only the canonical endpoint (push-subscriptions.canonicalEndpoint, the value validated at subscribe time) is ever
//    handed to the sender; an entry that is not canonical is never sent to.
//  - Configuration comes only from environment variables; the private key is never logged or sent to clients.

const webpush = require("web-push");
const { pseudonym } = require("./observability");
const { listStudentSubscriptions, ownerRecord, removeExpiredSubscriptions, canonicalEndpoint } = require("./push-subscriptions");

const ENV_PUBLIC = "WEB_PUSH_VAPID_PUBLIC_KEY";
const ENV_PRIVATE = "WEB_PUSH_VAPID_PRIVATE_KEY";
const ENV_SUBJECT = "WEB_PUSH_VAPID_SUBJECT";
const PUSH_TTL_SECONDS = 24 * 60 * 60;
const PUSH_REQUEST_TIMEOUT_MS = 5000;
const NOTIFY_TIME_BUDGET_MS = 8000;

const MESSAGE_NOTIFICATION = Object.freeze({ type: "message", title: "رسالة جديدة", body: "لديك رسالة جديدة من المعلم.", url: "./", tag: "eb-message" });

function b64urlBytes(value) {
  try { return Buffer.from(String(value).replace(/-/g, "+").replace(/_/g, "/"), "base64").length; } catch { return 0; }
}

/** Server-side Web Push configuration. `available:false` (with a reason) whenever anything is missing or malformed. */
function pushConfig(env = process.env) {
  const publicKey = String(env[ENV_PUBLIC] || "").trim();
  const privateKey = String(env[ENV_PRIVATE] || "").trim();
  const subject = String(env[ENV_SUBJECT] || "").trim();
  if (!publicKey || !privateKey || !subject) return { available: false, reason: "unconfigured" };
  if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject)) return { available: false, reason: "invalidSubject" };
  if (!/^[A-Za-z0-9_-]+$/.test(publicKey) || b64urlBytes(publicKey) !== 65) return { available: false, reason: "invalidPublicKey" };
  if (!/^[A-Za-z0-9_-]+$/.test(privateKey) || b64urlBytes(privateKey) !== 32) return { available: false, reason: "invalidPrivateKey" };
  return { available: true, publicKey, privateKey, subject };
}

function endpointHost(endpoint) {
  try { return new URL(endpoint).hostname; } catch { return ""; }
}

/**
 * Notify `studentId` that a new teacher message is waiting. Never throws. Returns a summary:
 * { status: "unconfigured" | "no-subscriptions" | "sent", attempted, delivered, expired, failed }.
 */
async function notifyStudentOfNewMessage(container, studentId, deps = {}, log = null) {
  const summary = { status: "sent", attempted: 0, delivered: 0, expired: 0, failed: 0 };
  const warn = (event, fields) => { try { if (log && log.logWarn) log.logWarn(event, { student: pseudonym(studentId), ...fields }); } catch { /* logging is best-effort */ } };
  try {
    const config = (deps.pushConfig || pushConfig)();
    if (!config.available) return { ...summary, status: "unconfigured" };
    const subs = await listStudentSubscriptions(container, studentId, deps);
    if (!subs.length) return { ...summary, status: "no-subscriptions" };
    // undefined = the owner record could not be read (skip this time, no cleanup); null = no owner record at all.
    const owners = await Promise.all(subs.map(s => ownerRecord(container, s.id, deps).catch(() => undefined)));
    const eligible = (s, i) => !!owners[i] && owners[i].studentId === studentId && canonicalEndpoint(s.endpoint) === s.endpoint;
    const deliver = subs.filter(eligible);
    const stale = subs.filter((s, i) => owners[i] !== undefined && !eligible(s, i)).map(s => ({ id: s.id, claim: s.claim || "" }));
    if (!deliver.length && !stale.length) return { ...summary, status: "no-subscriptions" };

    const send = deps.sendNotification || ((sub, payload, options) => webpush.sendNotification(sub, payload, options));
    const payload = JSON.stringify(MESSAGE_NOTIFICATION);
    const options = {
      vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
      TTL: PUSH_TTL_SECONDS, urgency: "normal", timeout: PUSH_REQUEST_TIMEOUT_MS, topic: "eb-message"
    };
    summary.attempted = deliver.length;
    // `s.endpoint` is the canonical endpoint (checked in `eligible`): exactly the URL that was validated.
    const results = await Promise.allSettled(deliver.map(s => send({ endpoint: s.endpoint, keys: s.keys }, payload, options)));
    const cleanup = [...stale];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") { summary.delivered += 1; return; }
      const statusCode = Number(r.reason && r.reason.statusCode) || 0;
      if (statusCode === 404 || statusCode === 410) { summary.expired += 1; cleanup.push({ id: deliver[i].id, claim: deliver[i].claim || "" }); return; }
      summary.failed += 1;
      warn("push.send.failed", { host: endpointHost(deliver[i].endpoint), statusCode });   // never the endpoint/keys
    });
    if (cleanup.length) {
      try { await (deps.removeExpiredSubscriptions || removeExpiredSubscriptions)(container, studentId, cleanup, deps); }
      catch (e) { warn("push.cleanup.failed", { count: cleanup.length, statusCode: Number(e && e.statusCode) || 0 }); }
    }
    return summary;
  } catch (e) {
    warn("push.notify.failed", { statusCode: Number(e && e.statusCode) || 0 });
    return { ...summary, status: "error" };
  }
}

/** Await the notification with a hard time budget, so a slow push service can never hold up the send response. */
async function notifyWithTimeout(promise, ms = NOTIFY_TIME_BUDGET_MS) {
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({ status: "timeout" }), ms); });
  try { return await Promise.race([Promise.resolve(promise).catch(() => ({ status: "error" })), timeout]); }
  finally { clearTimeout(timer); }
}

module.exports = {
  ENV_PUBLIC, ENV_PRIVATE, ENV_SUBJECT, MESSAGE_NOTIFICATION, NOTIFY_TIME_BUDGET_MS, PUSH_REQUEST_TIMEOUT_MS,
  pushConfig, notifyStudentOfNewMessage, notifyWithTimeout
};
