"use strict";
// R1 (runner test stability) — DIAGNOSTICS ONLY, for the real-Docker suites. On 2026-11-05 two C# cases failed on CI and never
// locally: G3 (the official C# compile sandbox hit its 30 s outer wall although it normally answers in ~1 s, and the supervisor's
// own 20 s compile limit never answered first) and DP3 (a C# program that throws answered `timeout`). Both point to a stall OUTSIDE
// the compiler / program — Docker or the host — but the failures carried no timing, so the cause could not be shown.
//
// This helper records, per docker CLI invocation made by the sandbox under test, when it was spawned, when its first stdout byte
// arrived and when it closed (with its exit code); before every `docker kill` (only issued on a wall timeout or an abort) it reads
// the container's State (status, StartedAt, …) so a failure can tell "container never started" from "started, then stalled". It
// adds a host snapshot (load average and Linux pressure-stall information for cpu / io / memory). The real docker CLI still runs
// every invocation unchanged: nothing about the sandbox, its limits or its timeouts is altered, and a passing test prints nothing.
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");

const readOr = file => { try { return fs.readFileSync(file, "utf8").trim(); } catch { return "n/a"; } };
const hostSnapshot = () => ({ loadavg: readOr("/proc/loadavg"), cpu: readOr("/proc/pressure/cpu"), io: readOr("/proc/pressure/io"), memory: readOr("/proc/pressure/memory") });

function createDockerTimeline() {
  const t0 = Date.now();
  const events = [];
  function spawnImpl(cmd, argv, opts) {
    const sub = argv[0];
    const name = sub === "run" ? argv[argv.indexOf("--name") + 1] : (sub === "kill" || sub === "rm") ? argv[argv.length - 1] : "";
    const ev = { sub, name, at: Date.now() - t0, firstOut: null, closed: null, code: null };
    if (sub === "kill" && name) {
      const r = spawnSync(cmd, ["inspect", "--format", "{{json .State}}", name], { encoding: "utf8", timeout: 5000 });
      ev.stateBeforeKill = String(r.stdout || "").trim().slice(0, 800) || "inspect exit " + r.status;
    }
    events.push(ev);
    const child = spawn(cmd, argv, opts);
    if (child.stdout) child.stdout.once("data", () => { ev.firstOut = Date.now() - t0; });
    child.once("close", code => { ev.closed = Date.now() - t0; ev.code = code; });
    return child;
  }
  const report = label => JSON.stringify({ label, elapsedMs: Date.now() - t0, host: hostSnapshot(), events }, null, 1);
  /** Runs `fn`; on ANY failure prints the timeline (stderr, CI log) and rethrows the original error unchanged. */
  async function around(label, fn) {
    try { return await fn(); } catch (e) { console.error("[docker-timeline] " + report(label)); throw e; }
  }
  return { spawnImpl, report, around, events };
}

module.exports = { createDockerTimeline, hostSnapshot };
