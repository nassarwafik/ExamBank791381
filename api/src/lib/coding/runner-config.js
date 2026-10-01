// Phase 17B — configuration of the remote Coding Runner Gateway, read from the Function App settings. FAIL CLOSED: anything
// missing, explicitly disabled or malformed yields { enabled: false } and the API answers EXECUTION_UNAVAILABLE (a normal,
// supported state — students still write, autosave and submit; teachers grade manually). There is never a local fallback.
//     CODING_RUNNER_URL        https://… base URL of the gateway (http:// ONLY for an explicit loopback host: local dev / tests);
//                              no credentials, no query, no fragment
//     CODING_RUNNER_HMAC_KEY   the request-signing key shared ONLY with the gateway (≥ 32 characters, no whitespace); it is
//                              not a session secret and is never sent anywhere — only HMAC digests leave this process
//     CODING_RUNNER_ENABLED    optional kill switch: "false" / "0" disables; "true" / "1" / unset = enabled when configured
// The returned object never exposes the key through enumeration / JSON / string conversion (non-enumerable property).
const KEY_MIN_LENGTH = 32;
const KEY_MAX_LENGTH = 512;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const off = reason => Object.freeze({ enabled: false, reason });

function readCodingRunnerConfig(env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  const flag = source.CODING_RUNNER_ENABLED;
  if (flag !== undefined && flag !== "") {
    const v = String(flag).trim().toLowerCase();
    if (v === "false" || v === "0") return off("disabled");
    if (v !== "true" && v !== "1") return off("malformed");
  }
  const rawUrl = source.CODING_RUNNER_URL, key = source.CODING_RUNNER_HMAC_KEY;
  if (!rawUrl && !key) return off("not-configured");
  if (typeof rawUrl !== "string" || typeof key !== "string" || !rawUrl || !key) return off("incomplete");
  let url;
  try { url = new URL(rawUrl); } catch { return off("malformed"); }
  if (url.username || url.password || url.search || url.hash) return off("malformed");
  if (url.protocol === "http:") { if (!LOOPBACK_HOSTS.has(url.hostname)) return off("malformed"); }
  else if (url.protocol !== "https:") return off("malformed");
  if (key.length < KEY_MIN_LENGTH || key.length > KEY_MAX_LENGTH || /\s/.test(key)) return off("malformed");
  const config = { enabled: true, baseUrl: url.origin + url.pathname.replace(/\/+$/, "") };
  Object.defineProperty(config, "key", { value: key, enumerable: false });
  return Object.freeze(config);
}

/**
 * Phase 17C — Review Fix 1. The RAW request-signing key exactly as configured (byte-for-byte; "" when absent / not a string).
 * Deliberately independent of URL validity, the kill switch and every other runner setting: it exists ONLY so that key
 * separation (callback key ≠ runner key) can be enforced whatever state the outbound runner configuration is in. It never
 * enables the runner and is never used to sign anything.
 */
function readRunnerSigningKey(env = process.env) {
  const key = env && typeof env === "object" ? env.CODING_RUNNER_HMAC_KEY : undefined;
  return typeof key === "string" ? key : "";
}

module.exports = { readCodingRunnerConfig, readRunnerSigningKey };
