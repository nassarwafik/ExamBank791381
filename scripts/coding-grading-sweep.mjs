#!/usr/bin/env node
// Phase 17D-A — the GitHub Actions scheduler of the coding grading RECOVERY SWEEP (.github/workflows/coding-grading-recovery.yml).
// Sends ONE signed POST {"version":1} to SmartAssess (SA-CODING-SWEEP-1) and maps the reply to an exit code:
//     2xx                        → 0 (sweep ran; aggregate counts printed)
//     409 { code: "SWEEP_BUSY" } → 0 (another sweep holds the lease: documented success, the next schedule continues)
//     anything else              → 1 (401 / 400 / 503 / 500 / 409 REPLAYED_REQUEST / redirect / network error / missing configuration)
// Every invocation signs a FRESH crypto-random request id (24 bytes, base64url), which the server reserves once (17D-B1); a step
// retry therefore never collides with an earlier request. The id is never printed.
// Configuration (environment): SMARTASSESS_GRADING_SWEEP_URL (repository variable: https://<host>/api/coding/grading-sweep) and
// CODING_GRADING_SWEEP_HMAC_KEY (repository secret). Node crypto only — no third-party code; the key and the signature are
// never printed. An independent implementation of api/src/lib/coding/sweep-protocol.js (a test pins both to the same bytes).
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const PROTOCOL = "SA-CODING-SWEEP-1";
const PATH = "/api/coding/grading-sweep";
const BODY = '{"version":1}';
const TIMEOUT_MS = 60000;
const PRINTABLE = new Set(["status", "stoppedBy", "scanned", "pages", "eligible", "dispatched", "retryable", "exhausted", "skipped", "errors", "cycle", "cycleCompleted", "cursorReset", "leaseLost", "durationMs", "code"]);

/** → { ok: true, url, key } | { ok: false, error } (errors name the setting, never its value). */
export function readSweepConfig(env = process.env) {
  const rawUrl = typeof env.SMARTASSESS_GRADING_SWEEP_URL === "string" ? env.SMARTASSESS_GRADING_SWEEP_URL.trim() : "";
  const key = typeof env.CODING_GRADING_SWEEP_HMAC_KEY === "string" ? env.CODING_GRADING_SWEEP_HMAC_KEY : "";
  if (!rawUrl) return { ok: false, error: "SMARTASSESS_GRADING_SWEEP_URL is not configured (repository variable)." };
  let url;
  try { url = new URL(rawUrl); } catch { return { ok: false, error: "SMARTASSESS_GRADING_SWEEP_URL is not a valid URL." }; }
  if (url.protocol !== "https:") return { ok: false, error: "SMARTASSESS_GRADING_SWEEP_URL must use https." };
  if (url.username || url.password || url.search || url.hash) return { ok: false, error: "SMARTASSESS_GRADING_SWEEP_URL must not contain credentials, a query or a fragment." };
  if (url.pathname !== PATH) return { ok: false, error: "SMARTASSESS_GRADING_SWEEP_URL must end with " + PATH + "." };
  if (!key) return { ok: false, error: "CODING_GRADING_SWEEP_HMAC_KEY is not configured (repository secret)." };
  if (key.length < 32 || key.length > 512 || /\s/.test(key)) return { ok: false, error: "CODING_GRADING_SWEEP_HMAC_KEY must be 32–512 characters without whitespace." };
  return { ok: true, url: url.origin + PATH, key };
}

/** The signed request: { url, init } for fetch (redirects are errors; the body is exactly {"version":1}). */
export function buildSweepRequest({ url, key, nowMs = Date.now(), requestId = "gh_" + crypto.randomBytes(24).toString("base64url") }) {
  const timestamp = String(Math.floor(nowMs / 1000));
  const bodyHash = crypto.createHash("sha256").update(Buffer.from(BODY, "utf8")).digest("hex");
  const canonical = [PROTOCOL, "POST", PATH, timestamp, requestId, bodyHash].join("\n");
  const signature = "v1=" + crypto.createHmac("sha256", Buffer.from(key, "utf8")).update(canonical, "utf8").digest("hex");
  return {
    url,
    init: { method: "POST", redirect: "error", body: BODY, headers: { "content-type": "application/json", "x-sa-sweep-protocol": "1", "x-sa-sweep-timestamp": timestamp, "x-sa-sweep-request-id": requestId, "x-sa-sweep-signature": signature } }
  };
}

const summary = json => {
  if (!json || typeof json !== "object") return "";
  return Object.entries(json).filter(([k, v]) => PRINTABLE.has(k) && ["number", "string", "boolean"].includes(typeof v)).map(([k, v]) => k + "=" + String(v).slice(0, 40)).join(" ");
};

/** Runs one trigger. → exit code (0 success incl. 409 SWEEP_BUSY, 1 failure). `log` receives safe lines only. */
export async function runSweep({ env = process.env, fetch: fetchImpl = globalThis.fetch, log = line => console.log(line), nowMs = Date.now() } = {}) {
  const cfg = readSweepConfig(env);
  if (!cfg.ok) { log("coding-grading-sweep: configuration error — " + cfg.error); return 1; }
  const req = buildSweepRequest({ url: cfg.url, key: cfg.key, nowMs });
  let res;
  try { res = await fetchImpl(req.url, { ...req.init, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
  catch (e) { log("coding-grading-sweep: request failed (" + (e && e.name ? e.name : "error") + ")."); return 1; }
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  if (res.status >= 200 && res.status < 300) { log("coding-grading-sweep: HTTP " + res.status + " " + summary(json)); return 0; }
  if (res.status === 409 && json && json.code === "SWEEP_BUSY") { log("coding-grading-sweep: HTTP 409 SWEEP_BUSY — another sweep holds the lease (success)."); return 0; }
  log("coding-grading-sweep: HTTP " + res.status + " " + summary(json) + " — failure.");
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runSweep().then(code => { process.exitCode = code; }, () => { console.log("coding-grading-sweep: unexpected failure."); process.exitCode = 1; });
}
