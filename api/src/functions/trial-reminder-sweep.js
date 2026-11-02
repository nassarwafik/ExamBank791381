// Trial accounts — POST /api/trial-reminder-sweep: the GitHub Actions scheduler (.github/workflows/trial-reminders.yml) triggers ONE
// bounded trial reminder EMAIL sweep (lib/trial-reminder-sweep.js). SA-TRIAL-REMINDER-1 HMAC under its OWN key
// TRIAL_REMINDER_SWEEP_HMAC_KEY (lib/trial-reminder-protocol.js). Order of checks, all BEFORE any storage access:
//   unsigned (401) → key configured AND separated from the four other keys (else 503 TRIAL_REMINDERS_UNAVAILABLE) → bounded body (400)
//   → HMAC (401) → timestamp (401) → body exactly {"version":1} (400) → sweep (200, aggregate counts only; 503 when a listing fails).
// Email not configured is a 200 with emailConfigured:false (nothing is sent). The response and the logs carry counts only — never a
// teacher, an address or a setting.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { getContainer } = require("../lib/platform-storage");
const { resolveTrialReminderKey, verifyTrialReminderRequest, TRIAL_HEADERS } = require("../lib/trial-reminder-protocol");
const { runTrialReminderSweep } = require("../lib/trial-reminder-sweep");

const MAX_BYTES = 1024;
const NO_STORE = { "Cache-Control": "no-store" };
const reply = (status, jsonBody) => ({ status, headers: NO_STORE, jsonBody });

async function handler(request, _azureContext, obs, deps = {}) {
  const headers = request.headers;
  const signed = headers && typeof headers.get === "function" && headers.get(TRIAL_HEADERS.signature);
  if (!signed) return reply(401, { ok: false, error: "Unauthorized" });
  const env = deps.env || process.env;
  const key = (deps.resolveTrialReminderKey || resolveTrialReminderKey)(env);
  if (!key) { obs?.logWarn?.("trial.reminders.unavailable", { reason: "not-configured" }); return reply(503, { ok: false, code: "TRIAL_REMINDERS_UNAVAILABLE", error: "Trial reminders are not configured." }); }
  let raw = "";
  try { raw = await request.text(); } catch { raw = ""; }
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) return reply(400, { ok: false, error: "Body too large." });
  const nowMs = deps.now ? deps.now() : Date.now();
  const v = verifyTrialReminderRequest({ key, headers, body: raw, nowMs });
  if (!v.ok) { obs?.logWarn?.("trial.reminders.rejected", { reason: v.reason }); return reply(401, { ok: false, error: "Unauthorized" }); }
  let body = null;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || body.version !== 1) return reply(400, { ok: false, error: "Body must be {\"version\":1}." });
  try {
    const container = (deps.getContainer || getContainer)();
    const result = await (deps.runTrialReminderSweep || runTrialReminderSweep)(container, { nowMs, env, deps, obs });
    obs?.logInfo?.("trial.reminders.completed", { count: result.sent, outcome: !result.emailConfigured ? "email-not-configured" : result.truncated ? "truncated" : "complete", attempts: result.due });
    return reply(200, { ok: true, ...result });
  } catch (e) {
    obs?.logError?.("trial.reminders.failed", e);
    return reply(503, { ok: false, code: "TRIAL_REMINDERS_UNAVAILABLE", error: "Trial reminder sweep failed; the next run retries." });
  }
}

app.http("trialReminderSweep", { methods: ["POST"], authLevel: "anonymous", route: "trial-reminder-sweep", handler: withObservability("trial-reminder-sweep", handler) });
module.exports = { handler };
