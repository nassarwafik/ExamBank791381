"use strict";
// Hotfix — QM22 mutation reliability. Post-merge run 37326548273 reported `TIMEOUT QM22` (not SURVIVED): one 5-test-file suite run
// under the mutant exceeded the mutation runner's 300 s bound, although the same mutant is killed in ~6 s by EV2 / RP3 / RP6 (20 / 20
// local runs). Root cause — a HANG that any suite run can hit, independent of the mutant:
//   • the staging rehearsal (load-review-fix-3) reserved its callback port with a probe that binds an EPHEMERAL port and closes it
//     again; until the harness binds it, any listen(0) / outbound connection — the test's own local stack, or the four other test files
//     the runner executes concurrently — can be handed that port by the kernel;
//   • the harness bound the receiver with `new Promise(r => server.listen(port, r))`: EADDRINUSE became an uncaught error, the promise
//     never settled, the test's cleanup never ran and the open stack kept the process alive — `node --test` never exited ⇒ TIMEOUT.
// CP1 / CP2 are fail-first on 8de1f6a: the occupied port HANGS runScenario; no non-ephemeral port allocator exists.
const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../load/lib/index.js");

const SHA = "0123456789abcdef0123456789abcdef01234567";
const KEY = "test-only-callback-port-key-0123456789abcdef";
const within = (promise, ms, what) => { let t; return Promise.race([promise, new Promise((_, reject) => { t = setTimeout(() => reject(new Error(what + " did not settle within " + ms + " ms (a hang)")), ms); })]).finally(() => clearTimeout(t)); };

test("CP1 an occupied callback receiver port makes runScenario settle FAST with an explicit refusal (never a hang, never an uncaught error)", async () => {
  const squatter = net.createServer(); await new Promise(r => squatter.listen(0, r));          // the port is in use (all interfaces)
  const port = squatter.address().port;
  const stack = L.createLocalStack({ maxConcurrency: 2, official: { maxPending: 3, maxActive: 1 }, callbackBaseUrl: "http://127.0.0.1:" + port, callbackKey: KEY });
  await stack.start();
  const uncaught = []; const onUncaught = e => uncaught.push(e && e.code); process.on("uncaughtException", onUncaught);
  try {
    const env = { RUNNER_URL: stack.baseUrl, RUNNER_HMAC_KEY: stack.key, LOAD_CALLBACK_RECEIVER_PORT: String(port), LOAD_CALLBACK_HMAC_KEY: KEY };
    const r = await within(L.runScenario({ scenario: "CERT-E", target: "staging", env, buildSha: SHA, params: { jobs: 4, officialJobs: 8, casesPerJob: 1, runner: { maxPending: 3 } } }), 15000, "runScenario");
    assert.equal(r.ok, false);
    assert.equal(r.code, "CALLBACK_RECEIVER_UNAVAILABLE");
    assert.match(r.detail, /EADDRINUSE/);
    assert.deepEqual(uncaught, [], "the bind failure is handled, not thrown into the event loop");
  } finally { process.off("uncaughtException", onUncaught); await stack.close(); await new Promise(r => squatter.close(r)); }
});

test("CP2 the rehearsal's explicit callback port comes from OUTSIDE the kernel's ephemeral range (no listen(0) / connect can be handed it) and binds on all interfaces", async () => {
  assert.equal(typeof L.allocateExplicitPort, "function");
  const [lo, hi] = L.ephemeralPortRange();
  assert.ok(Number.isInteger(lo) && Number.isInteger(hi) && lo < hi);
  for (let i = 0; i < 5; i++) {
    const port = await L.allocateExplicitPort();
    assert.ok(port >= 1024 && port < lo, "port " + port + " is below the ephemeral range " + lo + "–" + hi);
    const s = net.createServer(); await new Promise((resolve, reject) => { s.once("error", reject); s.listen(port, resolve); });   // the harness binds all interfaces
    await new Promise(r => s.close(r));
  }
  // the kernel never hands out such a port implicitly: a burst of listen(0) sockets all land INSIDE the ephemeral range
  const socks = await Promise.all(Array.from({ length: 50 }, () => new Promise(r => { const s = net.createServer(); s.listen(0, () => r(s)); })));
  for (const s of socks) assert.ok(s.address().port >= lo && s.address().port <= hi);
  await Promise.all(socks.map(s => new Promise(r => s.close(r))));
});

test("CP3 the staging rehearsal reserves its callback port with the non-ephemeral allocator (no bind-0-and-close probe left)", () => {
  const src = fs.readFileSync(path.join(__dirname, "load-review-fix-3.rtest.js"), "utf8");
  assert.match(src, /L\.allocateExplicitPort\(\)/);
  assert.doesNotMatch(src, /listen\(0, "127\.0\.0\.1", \(\) => \{ const p = s\.address\(\)\.port; s\.close/);
});
