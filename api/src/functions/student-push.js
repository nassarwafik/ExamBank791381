// Phase 6B — STUDENT Web Push subscription surface (hardened student session):
//   GET  /api/student-push                                         → { ok, available, publicKey }   (VAPID public key only)
//   POST /api/student-push { action: "subscribe", subscription }   → save/refresh THIS browser's subscription
//   POST /api/student-push { action: "unsubscribe", endpoint }     → remove THIS browser's subscription
// The student is ALWAYS the verified session subject (requireActiveStudentSession): a body studentId / userId is never
// read, so a student can only add or remove their OWN subscriptions and can never list anyone's. The subscription must
// be a real browser push endpoint (https on a known push service, stored in its canonical form) with valid P-256 keys.
// Ownership changes are compare-and-set guarded (push-subscriptions). When the server has no VAPID
// configuration the feature reports available:false and subscribe answers 503 — messaging is unaffected either way.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { normalizeSubscription, upsertStudentSubscription, removeStudentSubscription } = require("../lib/push-subscriptions");
const { pushConfig } = require("../lib/push-notify");

const json = (status, body) => ({ status, jsonBody: body });

async function handler(request, deps = {}, obs = null) {
  try {
    const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
    if (!sess.ok) return sess.response;
    const container = sess.container;
    const studentId = String(sess.student && sess.student.userId || "");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(studentId)) return json(401, { ok: false, error: "Unauthorized" });
    const config = (deps.pushConfig || pushConfig)();

    if (request.method === "GET") {
      return json(200, { ok: true, available: config.available, publicKey: config.available ? config.publicKey : "" });
    }
    if (request.method !== "POST") return json(405, { ok: false, error: "Method not allowed." });

    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const action = String(body && body.action || "").trim();

    if (action === "subscribe") {
      if (!config.available) return json(503, { ok: false, code: "pushUnavailable", error: "الإشعارات غير متاحة حاليًا على الخادم." });
      const subscription = normalizeSubscription(body.subscription);
      if (!subscription) return json(400, { ok: false, error: "اشتراك الإشعارات غير صالح." });
      const result = await upsertStudentSubscription(container, studentId, subscription, deps);
      return json(200, { ok: true, subscribed: true, created: result.created });
    }
    if (action === "unsubscribe") {
      const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
      if (!endpoint) return json(400, { ok: false, error: "اشتراك الإشعارات غير صالح." });
      const result = await removeStudentSubscription(container, studentId, endpoint, deps);
      return json(200, { ok: true, removed: result.removed });
    }
    return json(400, { ok: false, error: "إجراء غير مدعوم." });
  } catch (e) {
    obs?.logError("student.push.error", e);
    return json(500, { ok: false, error: "تعذر حفظ إعداد الإشعارات حاليًا." });
  }
}

app.http("studentPush", { methods: ["GET", "POST"], authLevel: "anonymous", route: "student-push", handler: withObservability("student-push", handler) });
module.exports = { handler };
