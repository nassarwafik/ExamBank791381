// Phase 17A — the server-owned CodingExecutionProvider contract.
//
// SECURITY: student code is NEVER executed inside Azure Functions. This process holds application secrets, storage
// credentials, auth configuration and production network access; it is not a sandbox (no eval / new Function / node:vm /
// child_process / worker_threads / Docker — architecture-guarded by api/tests/coding-guards-17a.test.js). A future trusted
// provider (Phase 17B: an execution gateway in front of isolated workers with no secrets, no storage credentials, no
// unrestricted outbound network, an ephemeral filesystem and CPU / time / memory limits) is reached ONLY through this
// interface:
//     provider.capabilities() → { available, languages: [{ key, languageVersion, ... }] }
//     provider.execute(request: CodingExecutionRequest) → CodeExecutionResult-like (normalised here)
// In 17A no provider is configured in production: resolveCodingExecutionProvider() returns the UNAVAILABLE provider for every
// environment, which is a normal, supported state (students write / autosave / submit; teachers review manually). There is no
// local fallback and no fake success, ever. Tests inject a deterministic fake through `deps.codingExecutionProvider`.
const { buildExecutionRequest, normalizeExecutionResult } = require("../shared-finalization/codingContract");
const { codingLanguage } = require("../shared-finalization/codingQuestion");

const UNAVAILABLE_PROVIDER = Object.freeze({
  id: "unavailable",
  capabilities: () => ({ available: false, languages: [] }),
  execute: async () => { const e = new Error("EXECUTION_UNAVAILABLE"); e.code = "EXECUTION_UNAVAILABLE"; throw e; }
});

const isProvider = p => !!p && typeof p === "object" && typeof p.capabilities === "function" && typeof p.execute === "function";

/** The trusted provider for this request context. 17A ships none: an environment setting can never conjure one (17B will add a
 *  reviewed gateway client); only code may inject a provider object (tests). A malformed injection resolves to UNAVAILABLE. */
function resolveCodingExecutionProvider(deps = {}) {
  return isProvider(deps && deps.codingExecutionProvider) ? deps.codingExecutionProvider : UNAVAILABLE_PROVIDER;
}

/** Factual capability report: only languages the registry knows, reduced to { key, languageVersion }; nothing else a provider
 *  says is forwarded. Unavailable → { available: false, languages: [] } (never advertise an unconfigured language). */
function codingCapabilities(provider) {
  let raw;
  try { raw = provider.capabilities(); } catch { return { available: false, languages: [] }; }
  if (!raw || raw.available !== true || !Array.isArray(raw.languages)) return { available: false, languages: [] };
  const languages = [];
  for (const l of raw.languages) {
    const def = l && codingLanguage(l.key);
    if (def && def.capabilities.run && l.languageVersion === def.version && !languages.some(x => x.key === def.key)) languages.push({ key: def.key, languageVersion: def.version });
  }
  return { available: languages.length > 0, languages };
}

/** Runs ONE request through the provider. Order: provider available? → request built from an allow-list and validated →
 *  language offered by the provider? → execute → normalise. Never retries on the API host, never executes locally. */
async function runCodingExecution(provider, input) {
  const caps = codingCapabilities(provider);
  if (!caps.available) return { ok: false, status: 503, code: "EXECUTION_UNAVAILABLE" };
  const built = buildExecutionRequest(input);
  if (!built.ok) return { ok: false, status: 400, code: "REQUEST_INVALID" };
  const req = built.request;
  if (!caps.languages.some(l => l.key === req.language && l.languageVersion === req.languageVersion)) return { ok: false, status: 422, code: "LANGUAGE_UNAVAILABLE" };
  let raw;
  try { raw = await provider.execute(req); } catch { return { ok: false, status: 502, code: "EXECUTION_FAILED" }; }
  return { ok: true, result: normalizeExecutionResult(raw, req.limits.outputBytes) };
}

module.exports = { UNAVAILABLE_PROVIDER, resolveCodingExecutionProvider, codingCapabilities, runCodingExecution };
