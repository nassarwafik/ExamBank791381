"use strict";
// Phase 17F-A1 — Pilot Gate P2 tooling against the REAL SmartAssess callback handler (api/src/functions/coding-grading.js,
// needs `npm ci --prefix api`; no Docker): the operator's callback probe (smoke.js callback) proves the key relationship and the
// near-maximum evidence size WITHOUT writing anything — the probe names a job that does not exist.
//   CP1  matching key → 404 UNKNOWN_JOB (authenticated + validated, nothing applied); wrong key → 401; near-max ≈ 6.45 MB → 404
//   CP2  API callback key missing, or equal to the runner request key → 503 GRADING_UNAVAILABLE (reported as such)
//   CP3  no storage write happened in any of the above
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const F = require("../../../api/tests/fixtures/coding-17c.js");
const grading = require("../../../api/src/functions/coding-grading.js");
const smoke = require("../../deploy/azure-vm/smoke.js");

async function realApi(env) {
  const ctx = F.seed({ a: F.assignment({}, { short: false }) });
  const writes = [];
  // every write of the fixture storage goes through a blob client (upload / delete / set… / commit / stage): record them all
  const WRITE = /upload|delete|^set|commit|stage|beginCopy|syncCopy|create/i;
  const wrapClient = (client, name) => new Proxy(client, { get(t, k) { const v = t[k]; if (typeof v !== "function") return v; return WRITE.test(String(k)) ? (...a) => { writes.push(String(k) + " " + name); return v.apply(t, a); } : v.bind(t); } });
  const container = new Proxy(ctx.container, { get(t, k) { const v = t[k]; if (k === "getBlockBlobClient" || k === "getBlobClient") return name => wrapClient(v.call(t, name), name); return typeof v === "function" ? v.bind(t) : v; } });
  const server = http.createServer((req, res) => {
    const parts = []; req.on("data", d => parts.push(d)); req.on("end", async () => {
      const text = Buffer.concat(parts).toString("utf8");
      const r = await grading.callbackHandler({ method: "POST", url: "http://127.0.0.1" + req.url, headers: new Headers(Object.entries(req.headers).filter(([, v]) => typeof v === "string")), text: async () => text }, { getContainer: () => container, env });
      res.writeHead(r.status, { "content-type": "application/json" }); res.end(JSON.stringify(r.jsonBody));
    });
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  return { url: "http://127.0.0.1:" + server.address().port, writes, container, close: () => new Promise(r => server.close(r)) };
}

test("CP1 / CP3 — the probe authenticates against the REAL handler, near-max evidence is accepted, nothing is written", { timeout: 60000 }, async () => {
  const api = await realApi(F.ENV);
  try {
    const out = await smoke.smokeCallback({ baseUrl: api.url, key: F.CALLBACK_KEY, nearMax: true });
    assert.deepEqual(out.filter(c => !c.ok), [], JSON.stringify(out));
    assert.match(out.find(c => c.id === "callback-near-max-body-accepted").detail, /404 UNKNOWN_JOB .*\((6\d{6}) bytes\)/);
    assert.deepEqual(api.writes, [], "an unknown-job probe never writes");
    // positive control: the recorder DOES see a write made through the same storage object
    await api.container.getBlockBlobClient("platform/system/probe-control.json").upload("{}", 2);
    assert.deepEqual(api.writes, ["upload platform/system/probe-control.json"]);
  } finally { await api.close(); }
});

test("CP2 — API callback key missing or equal to the runner key → 503 GRADING_UNAVAILABLE, reported by the probe", { timeout: 60000 }, async () => {
  for (const env of [{ ...F.ENV, CODING_GRADING_CALLBACK_HMAC_KEY: undefined }, { ...F.ENV, CODING_GRADING_CALLBACK_HMAC_KEY: F.RUNNER_KEY }]) {
    const api = await realApi(env);
    try {
      const out = await smoke.smokeCallback({ baseUrl: api.url, key: env.CODING_GRADING_CALLBACK_HMAC_KEY || F.CALLBACK_KEY });
      const c = out.find(x => x.id === "callback-key-matches-api");
      assert.equal(c.ok, false); assert.match(c.detail, /HTTP 503 GRADING_UNAVAILABLE/);
    } finally { await api.close(); }
  }
});
