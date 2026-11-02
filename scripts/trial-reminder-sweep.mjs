#!/usr/bin/env node
// Trial accounts — the GitHub Actions scheduler of the trial reminder EMAILS (.github/workflows/trial-reminders.yml).
// Sends ONE signed POST {"version":1} to the platform (SA-TRIAL-REMINDER-1) and maps the reply to an exit code:
//     2xx                → 0 (sweep ran; aggregate counts printed)
//     not configured     → 0 with a notice (the reminders stay inactive until the owner sets both settings — no failure spam)
//     anything else      → 1 (401 / 400 / 503 / 500 / redirect / network error / a malformed setting)
// Configuration (environment): TRIAL_REMINDER_SWEEP_URL (repository variable: https://<host>/api/trial-reminder-sweep) and
// TRIAL_REMINDER_SWEEP_HMAC_KEY (repository secret, a FIFTH key, never one of the four others). Node crypto only; the key and the
// signature are never printed. An independent implementation of api/src/lib/trial-reminder-protocol.js (a test pins both).
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const PROTOCOL = "SA-TRIAL-REMINDER-1";
const PATH = "/api/trial-reminder-sweep";
const BODY = '{"version":1}';
const TIMEOUT_MS = 60000;
const PRINTABLE = new Set(["emailConfigured", "trials", "due", "sent", "alreadySent", "failed", "truncated", "code"]);

/** → { ok: true, url, key } | { ok: false, missing: true, error } | { ok: false, error } (never a value). */
export function readTrialReminderConfig(env = process.env) {
  const rawUrl = typeof env.TRIAL_REMINDER_SWEEP_URL === "string" ? env.TRIAL_REMINDER_SWEEP_URL.trim() : "";
  const key = typeof env.TRIAL_REMINDER_SWEEP_HMAC_KEY === "string" ? env.TRIAL_REMINDER_SWEEP_HMAC_KEY : "";
  if (!rawUrl && !key) return { ok: false, missing: true, error: "TRIAL_REMINDER_SWEEP_URL and TRIAL_REMINDER_SWEEP_HMAC_KEY are not configured; trial reminder emails are inactive." };
  if (!rawUrl) return { ok: false, error: "TRIAL_REMINDER_SWEEP_URL is not configured (repository variable)." };
  let url;
  try { url = new URL(rawUrl); } catch { return { ok: false, error: "TRIAL_REMINDER_SWEEP_URL is not a valid URL." }; }
  if (url.protocol !== "https:") return { ok: false, error: "TRIAL_REMINDER_SWEEP_URL must use https." };
  if (url.username || url.password || url.search || url.hash) return { ok: false, error: "TRIAL_REMINDER_SWEEP_URL must not contain credentials, a query or a fragment." };
  if (url.pathname !== PATH) return { ok: false, error: "TRIAL_REMINDER_SWEEP_URL must end with " + PATH + "." };
  if (!key) return { ok: false, error: "TRIAL_REMINDER_SWEEP_HMAC_KEY is not configured (repository secret)." };
  if (key.length < 32 || key.length > 512 || /\s/.test(key)) return { ok: false, error: "TRIAL_REMINDER_SWEEP_HMAC_KEY must be 32–512 characters without whitespace." };
  return { ok: true, url: url.origin + PATH, key };
}

export function buildTrialReminderRequest({ url, key, nowMs = Date.now(), requestId = "gh_" + crypto.randomBytes(24).toString("base64url") }) {
  const timestamp = String(Math.floor(nowMs / 1000));
  const bodyHash = crypto.createHash("sha256").update(Buffer.from(BODY, "utf8")).digest("hex");
  const canonical = [PROTOCOL, "POST", PATH, timestamp, requestId, bodyHash].join("\n");
  const signature = "v1=" + crypto.createHmac("sha256", Buffer.from(key, "utf8")).update(canonical, "utf8").digest("hex");
  return {
    url,
    init: { method: "POST", redirect: "error", body: BODY, headers: { "content-type": "application/json", "x-sa-trial-protocol": "1", "x-sa-trial-timestamp": timestamp, "x-sa-trial-request-id": requestId, "x-sa-trial-signature": signature } }
  };
}

const summary = json => {
  if (!json || typeof json !== "object") return "";
  return Object.entries(json).filter(([k, v]) => PRINTABLE.has(k) && ["number", "string", "boolean"].includes(typeof v)).map(([k, v]) => k + "=" + String(v).slice(0, 40)).join(" ");
};

/** Runs one trigger → exit code. `log` receives safe lines only. */
export async function runTrialReminderTrigger({ env = process.env, fetch: fetchImpl = globalThis.fetch, log = line => console.log(line), nowMs = Date.now() } = {}) {
  const cfg = readTrialReminderConfig(env);
  if (!cfg.ok && cfg.missing) { log("::notice::trial-reminders: " + cfg.error); return 0; }
  if (!cfg.ok) { log("trial-reminders: configuration error — " + cfg.error); return 1; }
  const req = buildTrialReminderRequest({ url: cfg.url, key: cfg.key, nowMs });
  let res;
  try { res = await fetchImpl(req.url, { ...req.init, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
  catch (e) { log("trial-reminders: request failed (" + (e && e.name ? e.name : "error") + ")."); return 1; }
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  if (res.status >= 200 && res.status < 300) { log("trial-reminders: ok " + summary(json)); return 0; }
  log("trial-reminders: HTTP " + res.status + " " + summary(json));
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(await runTrialReminderTrigger());
