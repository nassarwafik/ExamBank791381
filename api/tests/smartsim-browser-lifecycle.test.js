import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as harness from "./fixtures/smartsim-browser.js";

// Post-merge CI hotfix — Chromium target lifecycle of the SmartSim real-browser harness.
// Contract: after `await page.close()` resolves, Chromium no longer reports that page's targetId from Target.getTargets.
// `Target.closeTarget` only STARTS the close; the target can stay listed for a moment afterwards. A harness close that
// resolved on the closeTarget reply leaked a still-closing target into the NEXT test's global page count (main run
// 36835689459, B5: "expected 2 to be 3" — the stale target was counted in `before` and vanished before the second count).
//   L1–L6 drive the harness against a deterministic CDP double (no timing involved: a closing target stays listed for a
//   fixed number of Target.getTargets calls); L7 repeats the contract against real Chromium.
const REQUIRE_BROWSER = !!process.env.CI || process.env.SMARTSIM_REQUIRE_BROWSER === "1";
const EXE = harness.findChromium();

/** A minimal CDP double. A closed target stays listed for `linger` further Target.getTargets calls, then is removed. */
function cdpDouble({ linger = 0, neverClose = false } = {}) {
  let n = 0;
  const targets = new Map([["initial", { targetId: "initial", type: "page", url: "about:blank" }]]);
  const closing = new Map();
  const calls = [];
  const others = [{ targetId: "frame-1", type: "iframe" }, { targetId: "sw-1", type: "service_worker" }, { targetId: "browser-1", type: "browser" }];
  const double = {
    calls,
    extraTargets: false,
    listed: id => targets.has(id),                                                                  // inspector: no side effects
    destroy: id => { targets.delete(id); closing.delete(id); },
    send(method, params = {}) {
      calls.push(method);
      if (method === "Target.createTarget") { const id = "T" + (++n); targets.set(id, { targetId: id, type: "page", url: params.url }); return Promise.resolve({ targetId: id }); }
      if (method === "Target.attachToTarget") return Promise.resolve({ sessionId: "S-" + params.targetId });
      if (method === "Target.closeTarget") {
        if (!targets.has(params.targetId)) return Promise.reject(new Error("Target.closeTarget: No target with given id found"));
        if (!neverClose && !closing.has(params.targetId)) closing.set(params.targetId, linger);
        return Promise.resolve({ success: true });                                                   // replies BEFORE the target is gone
      }
      if (method === "Target.getTargets") {
        for (const [id, left] of closing) if (left <= 0) { targets.delete(id); closing.delete(id); }
        const targetInfos = [...targets.values()].map(t => ({ ...t, attached: true }));
        for (const [id, left] of closing) closing.set(id, left - 1);
        return Promise.resolve({ targetInfos: double.extraTargets ? [...targetInfos, ...others] : targetInfos });
      }
      return Promise.resolve({});
    },
    on() { return () => {}; }
  };
  return double;
}
const getTargetIds = async cdp => (await cdp.send("Target.getTargets")).targetInfos.map(t => t.targetId);

describe("SmartSim browser harness — page close waits for Chromium to drop the target (CDP double)", () => {
  it("L0 — the harness exposes the page lifecycle seam (openPage, pageTargetIds)", () => {
    expect(typeof harness.openPage).toBe("function");
    expect(typeof harness.pageTargetIds).toBe("function");
  });

  it("L1 — close() does not resolve while Target.getTargets still lists the closing target", async () => {
    const cdp = cdpDouble({ linger: 3 });
    const page = await harness.openPage(cdp);
    expect(cdp.listed(page.targetId)).toBe(true);
    await page.close();
    expect(cdp.calls).toContain("Target.closeTarget");
    expect(cdp.listed(page.targetId), "close() resolved while Chromium still reported the target").toBe(false);
    expect(await getTargetIds(cdp)).not.toContain(page.targetId);
    expect(cdp.calls.filter(m => m === "Target.getTargets").length).toBeGreaterThanOrEqual(5);    // 3 lingering polls + the absent one + the check above
  });

  it("L2 — deterministic reproduction of the main-branch B5 failure: a page closed by the previous test is not counted by the next test", async () => {
    const cdp = cdpDouble({ linger: 1 });
    const previous = await harness.openPage(cdp);
    await previous.close();                                                                         // the previous test's finally
    const before = (await harness.pageTargetIds(cdp)).length;                                       // B5: const before = …
    const current = await harness.openPage(cdp);
    const after = (await harness.pageTargetIds(cdp)).length;
    expect(after).toBe(before + 1);
    expect(await harness.pageTargetIds(cdp)).toEqual(["initial", current.targetId].sort());
    await current.close();
  });

  it("L3 — a target that is already gone (closeTarget fails: no such target) closes successfully at once", async () => {
    const cdp = cdpDouble();
    const page = await harness.openPage(cdp);
    cdp.destroy(page.targetId);
    await expect(page.close()).resolves.toBeUndefined();
    expect(await getTargetIds(cdp)).not.toContain(page.targetId);
  });

  it("L4 — a target Chromium never drops makes close() reject after a short bounded timeout (no silent leak into the next test)", async () => {
    const cdp = cdpDouble({ neverClose: true });
    const page = await harness.openPage(cdp, { closeTimeoutMs: 200 });
    const t0 = Date.now();
    await expect(page.close()).rejects.toThrow(new RegExp("target " + page.targetId + " .*still listed"));
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(2000);
  });

  it("L5 — close() is idempotent: a second call neither re-sends Target.closeTarget nor resolves early", async () => {
    const cdp = cdpDouble({ linger: 2 });
    const page = await harness.openPage(cdp);
    const first = page.close(), second = page.close();
    await Promise.all([first, second]);
    expect(cdp.calls.filter(m => m === "Target.closeTarget")).toHaveLength(1);
    expect(cdp.listed(page.targetId)).toBe(false);
  });

  it("L6 — pageTargetIds() reports ONLY real page targets (no iframe / worker / browser targets)", async () => {
    const cdp = cdpDouble();
    const page = await harness.openPage(cdp);
    cdp.extraTargets = true;
    expect(await harness.pageTargetIds(cdp)).toEqual(["initial", page.targetId].sort());
  });
});

describe("browser availability (lifecycle suite)", () => {
  it(REQUIRE_BROWSER ? "a Chromium / Chrome binary is available (required here)" : "a Chromium / Chrome binary is available (optional locally; L7 is skipped without one)", () => {
    if (REQUIRE_BROWSER) expect(EXE, "no Chromium / Chrome found — set SMARTSIM_CHROME_PATH").toBeTruthy();
    else if (!EXE) console.warn("[smartsim-browser-lifecycle] no Chromium / Chrome found: real-browser lifecycle check SKIPPED");
  });
});

const d = EXE ? describe : describe.skip;
d("SmartSim browser harness — real Chromium target lifecycle", () => {
  let browser;
  beforeAll(async () => { browser = await harness.launchBrowser(); }, 60000);
  afterAll(async () => { if (browser) await browser.close(); });

  it("L7 — open → close, repeated: after every close() the page's targetId is gone and the page set is back to its initial value", async () => {
    const initial = await browser.pageTargetIds();
    const html = "data:text/html," + encodeURIComponent('<iframe sandbox="allow-scripts" srcdoc="<script>parent.postMessage(1,`*`)</script>"></iframe>');
    for (let i = 0; i < 40; i++) {
      const page = await browser.newPage();
      await page.goto(html);
      expect(await browser.pageTargetIds()).toEqual([...initial, page.targetId].sort());
      await page.close();
      const { targetInfos } = await browser.cdp.send("Target.getTargets");
      expect(targetInfos.map(t => t.targetId), "iteration " + i).not.toContain(page.targetId);
      expect(await browser.pageTargetIds(), "iteration " + i).toEqual(initial);
    }
  }, 60000);
});
