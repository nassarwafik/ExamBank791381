"use strict";
// Phase 17C — Independent Security Review Fix 1 (runner side, defense in depth): the gateway refuses to START when the raw
// RUNNER_HMAC_KEY and SMARTASSESS_CALLBACK_HMAC_KEY are equal — regardless of whether the callback destination URL is valid,
// missing or malformed. Comparison is on the exact configured bytes. Separate keys keep the existing behaviour (official
// grading on only with a valid destination). The refusal never echoes a key.
// Fail-first on 68afc136: RK2 / RK3 (equal keys with a missing / invalid callback URL) started the gateway.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readGatewayConfig } = require("../../gateway/main.js");

const KEY = "test-only-runner-hmac-key-0123456789abcdef";
const CB_KEY = "test-only-callback-hmac-key-fedcba9876543210";
const refusesWithoutLeaking = env => {
  assert.throws(() => readGatewayConfig(env), err => {
    assert.match(err.message, /SMARTASSESS_CALLBACK_HMAC_KEY must differ from RUNNER_HMAC_KEY/);
    assert.doesNotMatch(err.message, new RegExp(KEY));
    return true;
  });
};

test("RK1 equal keys + VALID callback destination → startup refused", () => {
  refusesWithoutLeaking({ RUNNER_HMAC_KEY: KEY, SMARTASSESS_CALLBACK_BASE_URL: "https://app.example.test", SMARTASSESS_CALLBACK_HMAC_KEY: KEY });
});

test("RK2 equal keys + callback destination MISSING → startup still refused (no partial-config fail-open)", () => {
  refusesWithoutLeaking({ RUNNER_HMAC_KEY: KEY, SMARTASSESS_CALLBACK_HMAC_KEY: KEY });
});

test("RK3 equal keys + MALFORMED callback destination (not https, credentials, query, not a URL) → startup still refused", () => {
  for (const url of ["http://app.example.test", "ftp://app.example.test", "https://u:p@app.example.test", "https://app.example.test?x=1", "not a url"]) {
    refusesWithoutLeaking({ RUNNER_HMAC_KEY: KEY, SMARTASSESS_CALLBACK_BASE_URL: url, SMARTASSESS_CALLBACK_HMAC_KEY: KEY });
  }
});

test("RK4 separate keys + valid destination (+ a durable journal, Phase 17D-B2) → official grading enabled; keys never enumerable", () => {
  const durable = { journalProbe: { mounts: () => "/dev/vda1 / ext4 rw 0 0", resourceDevice: () => null } };
  const env = { RUNNER_HMAC_KEY: KEY, SMARTASSESS_CALLBACK_BASE_URL: "https://app.example.test", SMARTASSESS_CALLBACK_HMAC_KEY: CB_KEY };
  const c = readGatewayConfig({ ...env, RUNNER_JOURNAL_DIR: "/var/lib/smartassess-runner/journal" }, durable);
  assert.equal(c.official.enabled, true);
  assert.doesNotMatch(JSON.stringify(c), new RegExp(KEY + "|" + CB_KEY));
  assert.equal(readGatewayConfig(env, durable).official.enabled, false);                     // no journal → still fail closed
});

test("RK5 separate keys + destination missing → starts with official grading DISABLED (unchanged fail-closed behaviour)", () => {
  assert.equal(readGatewayConfig({ RUNNER_HMAC_KEY: KEY, SMARTASSESS_CALLBACK_HMAC_KEY: CB_KEY }).official.enabled, false);
  assert.equal(readGatewayConfig({ RUNNER_HMAC_KEY: KEY }).official.enabled, false);
});

test("RK6 exact configured bytes: a callback key differing only by case / whitespace is NOT treated as equal", () => {
  for (const cb of [KEY.toUpperCase(), KEY + " ", " " + KEY]) {
    assert.doesNotThrow(() => readGatewayConfig({ RUNNER_HMAC_KEY: KEY, SMARTASSESS_CALLBACK_HMAC_KEY: cb }), JSON.stringify(cb));
  }
});
