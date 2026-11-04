import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchBrowser } from "./fixtures/smartsim-browser.js";

// Tadris+ P9-B2 — the SmartSim browser fixture when Chromium does NOT become ready (CI run 41858886186, attempt 1:
// «Chromium did not start» after 30 s, and at the end of the job the runner had to kill the browser it left behind —
// «Terminate orphan process: pid (5606) (chrome)», with its crashpad handlers and a `cat` child).
//   • a start that fails or times out stops the WHOLE browser process group and removes its temporary profile;
//   • the failure says what was observed (elapsed time, the process state, whether Chrome wrote DevToolsActivePort, the load);
//   • the start budget is unchanged (30 s by default — never widened); tests pass a short one to a FAKE browser.
// The fake browser is a small Node script standing in for Chromium (no real browser is needed): it records its own pid, the
// pid of a child it spawns (like Chrome's helpers) and its --user-data-dir, prints D-Bus-like noise, and never gets ready.

const sleep = ms => new Promise(r => setTimeout(r, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
const tmp = [];
afterEach(() => {
  delete process.env.SMARTSIM_CHROME_PATH;
  for (const d of tmp.splice(0)) {
    try { const rec = JSON.parse(fs.readFileSync(path.join(d, "record.json"), "utf8")); for (const p of [rec.pid, rec.child]) try { process.kill(p, "SIGKILL"); } catch { /* gone */ } } catch { /* no record */ }
    fs.rmSync(d, { recursive: true, force: true });
  }
});

/** A fake «Chromium» executable. mode "hang": never ready; "port-file": writes DevToolsActivePort only (no stderr line). */
function fakeBrowser(mode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-chrome-"));
  tmp.push(dir);
  const exe = path.join(dir, "chrome");
  fs.writeFileSync(exe, `#!${process.execPath}
const fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const profile = (process.argv.find(a => a.startsWith("--user-data-dir=")) || "").slice("--user-data-dir=".length);
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
fs.writeFileSync(${JSON.stringify(path.join(dir, "record.json"))}, JSON.stringify({ pid: process.pid, child: child.pid, profile }));
fs.writeFileSync(path.join(profile, "Local State"), "{}");
process.stderr.write("[1:2:ERROR:dbus/bus.cc:405] Failed to connect to the bus: Could not parse server address\\n");
if (${JSON.stringify(mode)} === "port-file") setTimeout(() => fs.writeFileSync(path.join(profile, "DevToolsActivePort"), "1\\n/devtools/browser/fake\\n"), 200);
setInterval(() => {}, 1000);
`);
  fs.chmodSync(exe, 0o755);
  const record = () => JSON.parse(fs.readFileSync(path.join(dir, "record.json"), "utf8"));
  return { exe, record };
}

describe("P9-B2 the SmartSim browser fixture when Chromium does not start", () => {
  it("fail-first: a start that times out leaves nothing behind — the browser, its helper child and its profile are gone", async () => {
    const fake = fakeBrowser("hang");
    process.env.SMARTSIM_CHROME_PATH = fake.exe;
    const t0 = Date.now();
    await expect(launchBrowser({ startTimeoutMs: 1500 })).rejects.toThrow(/Chromium did not start/);
    const rec = fake.record();
    const deadline = Date.now() + 3000;
    while ((alive(rec.pid) || alive(rec.child)) && Date.now() < deadline) await sleep(50);
    expect({ browser: alive(rec.pid), helper: alive(rec.child), profile: fs.existsSync(rec.profile) }).toEqual({ browser: false, helper: false, profile: false });
    expect(Date.now() - t0).toBeLessThan(45000);
  }, 45000);

  it("the failure reports what was observed: the budget, the elapsed time, the process, the port file and the load", async () => {
    process.env.SMARTSIM_CHROME_PATH = fakeBrowser("hang").exe;
    const err = await launchBrowser({ startTimeoutMs: 1000 }).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/not ready within 1000 ms/);
    expect(err.message).toMatch(/process: running/);
    expect(err.message).toMatch(/DevToolsActivePort: absent/);
    expect(err.message).toMatch(/load average: [\d.]+/);
    expect(err.message).toMatch(/dbus\/bus\.cc/);                                   // the browser's own last output
  }, 45000);

  it("readiness has a second signal: the DevToolsActivePort file Chrome writes into its profile (stderr line missing)", async () => {
    process.env.SMARTSIM_CHROME_PATH = fakeBrowser("port-file").exe;
    // the fake serves no DevTools endpoint: reaching the CONNECT step (not «did not start») proves readiness was detected
    const err = await launchBrowser({ startTimeoutMs: 5000 }).catch(e => e);
    expect(String(err && err.message)).not.toMatch(/did not start/);
    expect(String(err && err.message)).toMatch(/CDP websocket error|ECONNREFUSED|connect/i);
  }, 45000);

  it("the default start budget stays 30 s (never widened)", () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, "fixtures", "smartsim-browser.js"), "utf8");
    expect(src).toMatch(/startTimeoutMs = 30000/);
  });
});
