"use strict";
// Phase 17F-B10-A — the SAFE TARGET MODEL of the load harness. Three explicit classes, nothing implicit:
//   local       an in-process stack (gateway + journal + a callback receiver) started by the harness itself; no credentials;
//   staging     a remote Runner (RUNNER_URL + RUNNER_HMAC_KEY from the environment) that the operator declares non-production;
//   production  the live Runner — FAIL CLOSED: refused unless the operator sets SMARTASSESS_ALLOW_PRODUCTION_LOAD_TEST=I_UNDERSTAND
//               in the environment of the harness process (never a flag that can be copied into a script by accident, never a
//               repository file), and the URL is https.
// Keys are kept NON-ENUMERABLE on the resolved target so a serialized target (reports, logs) never carries them.
const TARGET_NAMES = Object.freeze(["local", "staging", "production"]);
const PRODUCTION_ACK_ENV = "SMARTASSESS_ALLOW_PRODUCTION_LOAD_TEST";
const PRODUCTION_ACK_VALUE = "I_UNDERSTAND";
const KEY_OK = k => typeof k === "string" && k.length >= 32 && k.length <= 512 && !/\s/.test(k);

function remoteTarget(name, env, { failClosed }) {
  const baseUrl = typeof env.RUNNER_URL === "string" ? env.RUNNER_URL.trim().replace(/\/+$/, "") : "";
  const key = env.RUNNER_HMAC_KEY;
  if (!baseUrl || !KEY_OK(key)) return { ok: false, code: "TARGET_NOT_CONFIGURED", detail: "RUNNER_URL and RUNNER_HMAC_KEY (≥ 32 chars) must be set in the environment" };
  let u;
  try { u = new URL(baseUrl); } catch { return { ok: false, code: "TARGET_NOT_CONFIGURED", detail: "RUNNER_URL is not a URL" }; }
  if (u.username || u.password || u.search || u.hash) return { ok: false, code: "TARGET_NOT_CONFIGURED", detail: "RUNNER_URL must not carry credentials, a query or a fragment" };
  if (failClosed && u.protocol !== "https:") return { ok: false, code: "PRODUCTION_REQUIRES_HTTPS" };
  const t = { ok: true, name, remote: true, failClosed, baseUrl: u.origin, host: u.hostname };
  Object.defineProperty(t, "key", { value: key, enumerable: false });
  return t;
}

/** → { ok: true, name, remote, failClosed, baseUrl?, key (non-enumerable) } | { ok: false, code, detail? } */
function resolveTarget({ target, env = {} } = {}) {
  if (typeof target !== "string" || !TARGET_NAMES.includes(target)) return { ok: false, code: "UNKNOWN_TARGET", detail: "target must be one of " + TARGET_NAMES.join(" | ") };
  if (target === "local") return { ok: true, name: "local", remote: false, failClosed: false };
  if (target === "staging") return remoteTarget("staging", env, { failClosed: false });
  // production: the acknowledgement is checked FIRST so a missing URL never hides a missing acknowledgement (and vice versa the
  // acknowledgement alone never makes an unconfigured target "ok")
  if (env[PRODUCTION_ACK_ENV] !== PRODUCTION_ACK_VALUE) return { ok: false, code: "PRODUCTION_NOT_ACKNOWLEDGED", detail: "set " + PRODUCTION_ACK_ENV + "=" + PRODUCTION_ACK_VALUE + " in the harness environment to load-test production" };
  return remoteTarget("production", env, { failClosed: true });
}

module.exports = { TARGET_NAMES, PRODUCTION_ACK_ENV, PRODUCTION_ACK_VALUE, resolveTarget };
