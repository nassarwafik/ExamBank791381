"use strict";
// R1 — the real-Docker suites' diagnostics helper (tests/helpers/docker-timeline.js) itself, without Docker: it times every spawned
// invocation and passes it through unchanged; `around` prints the timeline ONLY on failure and rethrows the original error.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDockerTimeline } = require("../helpers/docker-timeline.js");

const closeOf = child => new Promise(r => child.once("close", r));

test("TL1 an invocation passes through unchanged and is timed: spawn → first stdout byte → close with its exit code", async () => {
  const tl = createDockerTimeline();
  const child = tl.spawnImpl(process.execPath, ["-e", "process.stdout.write('hi'); process.exit(3)"], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", d => { out += d; });
  const code = await closeOf(child);
  assert.equal(code, 3);
  assert.equal(out, "hi");                                            // the caller's own listeners still see every byte
  const [ev] = tl.events;
  assert.equal(ev.code, 3);
  assert.ok(ev.firstOut !== null && ev.closed !== null && ev.closed >= ev.firstOut && ev.firstOut >= ev.at);
});

test("TL2 around(): silent on success, prints the timeline on failure and rethrows the very same error", async () => {
  const tl = createDockerTimeline();
  const printed = [];
  const original = console.error;
  console.error = (...a) => { printed.push(a.join(" ")); };
  try {
    assert.equal(await tl.around("ok-case", async () => 42), 42);
    assert.equal(printed.length, 0);
    const boom = new Error("boom");
    await assert.rejects(() => tl.around("failing-case", async () => { throw boom; }), e => e === boom);
  } finally { console.error = original; }
  assert.equal(printed.length, 1);
  const report = JSON.parse(printed[0].replace(/^\[docker-timeline\] /, ""));
  assert.equal(report.label, "failing-case");
  assert.ok(report.host && "loadavg" in report.host && "io" in report.host && "cpu" in report.host);
  assert.ok(Array.isArray(report.events));
});
