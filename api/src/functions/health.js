const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { reportAuthSecretConfiguration } = require("../lib/auth-config-status");

// Roadmap #9 §13 — minimal liveness/diagnostic endpoint. Anonymous is acceptable because the body carries NO
// secrets, config values, environment variables, or internal topology, and it performs NO storage I/O. It is
// always no-store and always carries an X-Request-ID (added by the observability wrapper) so a caller can
// correlate a probe with backend logs. A build/version string is included ONLY if a safe, explicitly-provided
// non-secret env value exists; otherwise it is omitted rather than invented.
const SERVICE = "ExamBank791381";

function safeVersion() {
  const raw = String(process.env.APP_VERSION || process.env.BUILD_VERSION || "").trim();
  // Never echo anything that isn't a short, plain version/commit token.
  return /^[A-Za-z0-9._+-]{1,64}$/.test(raw) ? raw : "";
}

async function handler(_request, _azureContext, obs) {
  // Phase 11A — server-log-only diagnostic: once per process, a structured `auth.secret_configuration` warning when a
  // dedicated auth secret is missing (fallback in use). Nothing about it is ever added to this anonymous response.
  reportAuthSecretConfiguration(obs);
  const body = { ok: true, service: SERVICE, time: new Date().toISOString() };
  const version = safeVersion();
  if (version) body.version = version;
  return { status: 200, headers: { "Cache-Control": "no-store", "Pragma": "no-cache" }, jsonBody: body };
}

app.http("health", { methods: ["GET"], authLevel: "anonymous", route: "health", handler: withObservability("health", handler) });
module.exports = { handler, safeVersion };
