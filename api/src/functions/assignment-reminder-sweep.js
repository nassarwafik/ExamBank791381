// D4 (item 8) — POST /api/assignment-reminder-sweep: the GitHub Actions scheduler (.github/workflows/assignment-reminders.yml) triggers
// ONE bounded automatic-reminder sweep (lib/assignment-reminder-sweep.js). SA-REMINDER-SWEEP-1 HMAC under its OWN key
// ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY (lib/reminder-sweep-protocol.js). Order of checks, all BEFORE any storage access:
//   unsigned (401) → key configured AND separated from the three coding keys (else 503 REMINDERS_UNAVAILABLE) → bounded body (400)
//   → HMAC (401) → timestamp (401) → body exactly {"version":1} (400) → sweep (200, aggregate counts only; 503 when a listing fails).
// The response and the logs carry counts only — never a student, an assignment title or a key.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { getContainer } = require("../lib/platform-storage");
const { resolveReminderKey, verifyReminderRequest, REMINDER_HEADERS } = require("../lib/reminder-sweep-protocol");
const { runReminderSweep } = require("../lib/assignment-reminder-sweep");

const MAX_BYTES = 1024;
const NO_STORE = { "Cache-Control": "no-store" };
const reply = (status, jsonBody) => ({ status, headers: NO_STORE, jsonBody });

async function handler(request, _azureContext, obs, deps = {}) {
  const headers = request.headers;
  const signed = headers && typeof headers.get === "function" && headers.get(REMINDER_HEADERS.signature);
  if (!signed) return reply(401, { ok: false, error: "Unauthorized" });
  const key = (deps.resolveReminderKey || resolveReminderKey)(deps.env || process.env);
  if (!key) { obs?.logWarn?.("reminders.sweep.unavailable", { reason: "not-configured" }); return reply(503, { ok: false, code: "REMINDERS_UNAVAILABLE", error: "Reminders are not configured." }); }
  let raw = "";
  try { raw = await request.text(); } catch { raw = ""; }
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) return reply(400, { ok: false, error: "Body too large." });
  const v = verifyReminderRequest({ key, headers, body: raw, nowMs: deps.now ? deps.now() : Date.now() });
  if (!v.ok) { obs?.logWarn?.("reminders.sweep.rejected", { reason: v.reason }); return reply(401, { ok: false, error: "Unauthorized" }); }
  let body = null;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || body.version !== 1) return reply(400, { ok: false, error: "Body must be {\"version\":1}." });
  try {
    const container = (deps.getContainer || getContainer)();
    const result = await (deps.runReminderSweep || runReminderSweep)(container, { nowMs: deps.now ? deps.now() : Date.now(), deps, obs });
    obs?.logInfo?.("reminders.sweep.completed", { count: result.reminded, outcome: result.truncated ? "truncated" : "complete", attempts: result.considered });
    return reply(200, { ok: true, ...result });
  } catch (e) {
    obs?.logError?.("reminders.sweep.failed", e);
    return reply(503, { ok: false, code: "REMINDERS_UNAVAILABLE", error: "Reminder sweep failed; the next run retries." });
  }
}

app.http("assignmentReminderSweep", { methods: ["POST"], authLevel: "anonymous", route: "assignment-reminder-sweep", handler: withObservability("assignment-reminder-sweep", handler) });
module.exports = { handler };
