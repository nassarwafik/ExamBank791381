import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { buildContentSecurityPolicy, injectContentSecurityPolicy, contentSecurityPolicyPlugin, labFrameHash, LAB_FRAME_SCRIPT, sha256Source } from "./content-security-policy.ts";
import { checkCspMeta, parseCsp } from "./check-csp-meta.mjs";

// Visual lab V14 (docs/enterprise-csharp-visual-lab-plan.md §24; owner decision 2026-11-24) — the offline C# lab page's OWN policy:
//   • lab.html = the app's policy + in script-src exactly 'wasm-unsafe-eval', blob: and the lab frame's sha256 (main.js, byte for byte);
//   • index.html's policy is unchanged — still 'self' + its own inline hash, no wasm, no blob: (a pin);
//   • the build gate refuses a lab page whose frame hash is missing or wrong, any other loosening, and a hash no script of the page has.
const DARK = 'try{if(localStorage.getItem("examBankTheme")==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}';
const page = (path: string) => (contentSecurityPolicyPlugin().transformIndexHtml.handler(
  '<!doctype html><html><head><meta charset="UTF-8" /><script>' + DARK + '</script></head><body><script type="module" src="/x.js"></script></body></html>', { path }));

describe("V14 — the offline lab page's policy", () => {
  it("lab.html: the app's policy plus exactly 'wasm-unsafe-eval', blob: and the lab frame's hash — in script-src only", () => {
    const app = parseCsp(buildContentSecurityPolicy({ scriptHashes: [sha256Source(DARK)] }));
    const lab = parseCsp(buildContentSecurityPolicy({ scriptHashes: [sha256Source(DARK)], lab: { frameHash: labFrameHash() } }));
    expect(lab["script-src"]).toEqual([...app["script-src"], "'wasm-unsafe-eval'", "blob:", "'" + sha256Source(fs.readFileSync(LAB_FRAME_SCRIPT, "utf8")) + "'"]);
    for (const k of Object.keys(app)) if (k !== "script-src") expect(lab[k]).toEqual(app[k]);
  });
  it("the plugin: /lab.html gets the lab's policy, /index.html the app's (unchanged: no wasm, no blob: script) — a pin", () => {
    const index = parseCsp(/content="([^"]*)"/.exec(page("/index.html"))![1]);
    const lab = parseCsp(/content="([^"]*)"/.exec(page("/lab.html"))![1]);
    expect(index["script-src"]).toEqual(["'self'", "'" + sha256Source(DARK) + "'"]);
    expect(lab["script-src"]).toEqual(["'self'", "'" + sha256Source(DARK) + "'", "'wasm-unsafe-eval'", "blob:", "'" + labFrameHash() + "'"]);
  });
  it("the build gate: the lab page passes with its frame hash, fails without it or with the wrong one; index.html may not have any of it", () => {
    const frameHash = labFrameHash();
    expect(checkCspMeta(page("/lab.html"), { frameHash })).toEqual([]);
    expect(checkCspMeta(page("/lab.html"), { frameHash: "sha256-AAAA" }).join()).toMatch(/lab frame's exact hash/);
    expect(checkCspMeta(page("/lab.html")).join()).toMatch(/script-src must stay 'self' \+ exact hashes/);   // as if it were index.html
    expect(checkCspMeta(page("/index.html"))).toEqual([]);
    const loose = injectContentSecurityPolicy('<!doctype html><meta charset="UTF-8"><p>x</p>', { frameHash }).replace("blob:", "blob: https://cdn.example");
    expect(checkCspMeta(loose, { frameHash }).join()).toMatch(/script-src must stay/);
    const stray = injectContentSecurityPolicy('<!doctype html><meta charset="UTF-8"><p>x</p>').replace("script-src 'self'", "script-src 'self' 'sha256-STRAY'");
    expect(checkCspMeta(stray).join()).toMatch(/a hash no inline script of this page has/);
  });
});
