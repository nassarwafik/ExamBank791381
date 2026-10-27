#!/usr/bin/env node
// D4 (item 8) — the GitHub Actions scheduler of the AUTOMATIC assignment reminder (.github/workflows/assignment-reminders.yml).
// Sends ONE signed POST {"version":1} to the platform (SA-REMINDER-SWEEP-1) and maps the reply to an exit code:
//     2xx                → 0 (sweep ran; aggregate counts printed)
//     not configured     → 0 with a notice (the reminder stays inactive until the owner sets both settings — no failure spam)
//     anything else      → 1 (401 / 400 / 503 / 500 / redirect / network error / a malformed setting)
// Configuration (environment): ASSIGNMENT_REMINDER_SWEEP_URL (repository variable: https://<host>/api/assignment-reminder-sweep) and
// ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY (repository secret, a FOURTH key, never one of the coding keys). Node crypto only; the key and the
// signature are never printed. An independent implementation of api/src/lib/reminder-sweep-protocol.js (a test pins both).
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const PROTOCOL = "SA-REMINDER-SWEEP-1";
const PATH = "/api/assignment-reminder-sweep";
const BODY = '{"version":1}';
const TIMEOUT_MS = 60000;
const PRINTABLE = new Set(["assignments", "considered", "reminded", "alreadySent", "failed", "truncated", "code"]);

/** → { ok: true, url, key } | { ok: false, missing: true, error } | { ok: false, error } (never a value). */
export function readReminderConfig(env = process.env) {
  const rawUrl = typeof env.ASSIGNMENT_REMINDER_SWEEP_URL === "string" ? env.ASSIGNMENT_REMINDER_SWEEP_URL.trim() : "";
  const key = typeof env.ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY === "string" ? env.ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY : "";
  if (!rawUrl && !key) return { ok: false, missing: true, error: "ASSIGNMENT_REMINDER_SWEEP_URL and ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY are not configured; automatic reminders are inactive." };
  if (!rawUrl) return { ok: false, error: "ASSIGNMENT_REMINDER_SWEEP_URL is not configured (repository variable)." };
  let url;
  try { url = new URL(rawUrl); } catch { return { ok: false, error: "ASSIGNMENT_REMINDER_SWEEP_URL is not a valid URL." }; }
  if (url.protocol !== "https:") return { ok: false, error: "ASSIGNMENT_REMINDER_SWEEP_URL must use https." };
  if (url.username || url.password || url.search || url.hash) return { ok: false, error: "ASSIGNMENT_REMINDER_SWEEP_URL must not contain credentials, a query or a fragment." };
  if (url.pathname !== PATH) return { ok: false, error: "ASSIGNMENT_REMINDER_SWEEP_URL must end with " + PATH + "." };
  if (!key) return { ok: false, error: "ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY is not configured (repository secret)." };
  if (key.length < 32 || key.length > 512 || /\s/.test(key)) return { ok: false, error: "ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY must be 32–512 characters without whitespace." };
  return { ok: true, url: url.origin + PATH, key };
}

export function buildReminderRequest({ url, key, nowMs = Date.now(), requestId = "gh_" + crypto.randomBytes(24).toString("base64url") }) {
  const timestamp = String(Math.floor(nowMs / 1000));
  const bodyHash = crypto.createHash("sha256").update(Buffer.from(BODY, "utf8")).digest("hex");
  const canonical = [PROTOCOL, "POST", PATH, timestamp, requestId, bodyHash].join("\n");
  const signature = "v1=" + crypto.createHmac("sha256", Buffer.from(key, "utf8")).update(canonical, "utf8").digest("hex");
  return {
    url,
    init: { method: "POST", redirect: "error", body: BODY, headers: { "content-type": "application/json", "x-sa-reminder-protocol": "1", "x-sa-reminder-timestamp": timestamp, "x-sa-reminder-request-id": requestId, "x-sa-reminder-signature": signature } }
  };
}

const summary = json => {
  if (!json || typeof json !== "object") return "";
  return Object.entries(json).filter(([k, v]) => PRINTABLE.has(k) && ["number", "string", "boolean"].includes(typeof v)).map(([k, v]) => k + "=" + String(v).slice(0, 40)).join(" ");
};

/** Runs one trigger → exit code. `log` receives safe lines only. */
export async function runReminderTrigger({ env = process.env, fetch: fetchImpl = globalThis.fetch, log = line => console.log(line), nowMs = Date.now() } = {}) {
  const cfg = readReminderConfig(env);
  if (!cfg.ok && cfg.missing) { log("::notice::assignment-reminders: " + cfg.error); return 0; }
  if (!cfg.ok) { log("assignment-reminders: configuration error — " + cfg.error); return 1; }
  const req = buildReminderRequest({ url: cfg.url, key: cfg.key, nowMs });
  let res;
  try { res = await fetchImpl(req.url, { ...req.init, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
  catch (e) { log("assignment-reminders: request failed (" + (e && e.name ? e.name : "error") + ")."); return 1; }
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  if (res.status >= 200 && res.status < 300) { log("assignment-reminders: ok " + summary(json)); return 0; }
  log("assignment-reminders: HTTP " + res.status + " " + summary(json));
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(await runReminderTrigger());
