// Teacher C# lab, phase V1 (docs/enterprise-csharp-visual-lab-plan.md) — how the lab sits in the SITE, read as text (no build, no .NET):
//   • ONE lab policy: the bridge page's meta CSP and the site's /csharp-lab/* header are the same string; it allows only the lab's own
//     scripts and worker plus 'wasm-unsafe-eval', and the SITE's policy never gains 'wasm-unsafe-eval' (or any eval);
//   • the lab files are revalidated (no-cache: a new deployment is never mixed with a cached one) and never committed;
//   • the deploy job publishes the lab after the quality gate, before the Static Web Apps build; the lab's own job proves the very files;
//   • the worker seals the network / storage entry points after boot; the bridge answers only its parent, on this origin;
//   • the book's classes are never a lab file (they are course content: the API, a teacher session only).
// The behaviour itself is proven in Chromium: tools/csharp-lab/smoke.mjs and scripts/check-csharp-lab-browser.mjs (csharp-lab.yml).
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { buildContentSecurityPolicy } from "./content-security-policy.ts";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const swa = JSON.parse(read("public/staticwebapp.config.json"));
const labRoute = swa.routes.find(r => r.route === "/csharp-lab/*");
const bridgeHtml = read("tools/csharp-lab/wwwroot/index.html");
const metaCsp = (/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(bridgeHtml) || [])[1];
const directives = csp => Object.fromEntries(csp.split(";").map(d => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

describe("Teacher C# lab — one strict policy, the site's own unchanged", () => {
  it("the bridge page's meta policy IS the site's /csharp-lab/* header", () => {
    expect(labRoute).toBeTruthy();
    expect(metaCsp).toBe(labRoute.headers["Content-Security-Policy"]);
  });
  it("it allows the lab's own scripts and worker and WebAssembly only — no eval, no other origin, nothing else", () => {
    const d = directives(metaCsp);
    expect(d["default-src"]).toEqual(["'none'"]);
    expect(d["script-src"]).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(d["worker-src"]).toEqual(["'self'"]);
    expect(d["connect-src"]).toEqual(["'self'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'none'"]);
    expect(d["form-action"]).toEqual(["'none'"]);
    expect(metaCsp).not.toMatch(/'unsafe-eval'|'unsafe-inline'|\*|https?:/);
  });
  it("the site's policy never gains WebAssembly eval (the lab lives in its own frame); framing stays same-origin", () => {
    const site = buildContentSecurityPolicy({ scriptHashes: [] });
    expect(site).not.toMatch(/wasm-unsafe-eval|unsafe-eval/);
    expect(directives(site)["frame-src"]).toEqual(["'self'"]);
    expect(swa.globalHeaders["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(swa.globalHeaders["Content-Security-Policy"]).toBeUndefined();
  });
  it("lab files are revalidated on every load, served as WebAssembly, and not indexed", () => {
    expect(labRoute.headers["Cache-Control"]).toBe("no-cache");
    expect(labRoute.headers["X-Robots-Tag"]).toBe("noindex");
    expect(swa.mimeTypes[".wasm"]).toBe("application/wasm");
  });
});

describe("Teacher C# lab — built in the deploy job, never committed", () => {
  const deploy = read(".github/workflows/azure-static-web-apps-white-grass-0ce642c10.yml");
  const job = deploy.slice(deploy.indexOf("build_and_deploy_job:"), deploy.indexOf("close_pull_request_job:"));
  it("the deploy job (after the quality gate) publishes the lab, then builds and deploys", () => {
    expect(job).toMatch(/needs: quality_gate/);
    const at = s => job.indexOf(s);
    expect(at("actions/checkout@")).toBeGreaterThan(-1);
    expect(at('dotnet-install.sh" --channel 10.0')).toBeGreaterThan(at("actions/checkout@"));
    expect(at("run: node scripts/build-csharp-lab.mjs")).toBeGreaterThan(at('dotnet-install.sh" --channel 10.0'));
    expect(at("name: Build And Deploy")).toBeGreaterThan(at("run: node scripts/build-csharp-lab.mjs"));
    expect(deploy.slice(0, deploy.indexOf("build_and_deploy_job:"))).not.toMatch(/build-csharp-lab/);   // the gate is unchanged
  });
  it("the lab's own job builds with the same script and proves those files in Chromium and in the site", () => {
    const lab = read(".github/workflows/csharp-lab.yml");
    expect(lab).toMatch(/run: node scripts\/build-csharp-lab\.mjs/);
    expect(lab).toMatch(/run: node tools\/csharp-lab\/smoke\.mjs public\/csharp-lab/);
    expect(lab).toMatch(/run: node scripts\/check-csharp-lab-browser\.mjs/);
    expect(existsSync(new URL("../.github/workflows/csharp-lab-spike.yml", import.meta.url))).toBe(false);
  });
  it("public/csharp-lab/ is git-ignored; the build script copies no compressed copies, symbols or course library", () => {
    expect(read(".gitignore").split("\n")).toContain("public/csharp-lab/");
    const script = read("scripts/build-csharp-lab.mjs");
    expect(script).toMatch(/const SKIP = \/\\\.\(br\|gz\|pdb\|map\)\$\/i;/);
    expect(script).not.toMatch(/course-libraries|Unit4\.cs/);
    for (const f of ["index.html", "bridge.js", "lab-worker.js"]) expect(script).toContain('"' + f + '"');
  });
});

describe("Teacher C# lab — the owner's rule in AGENTS.md", () => {
  it("teacher only, books only, desktop only, never grading; the site's policy never gains WebAssembly eval; widening is the owner's", () => {
    const agents = read("AGENTS.md").replace(/\s+/g, " ");
    expect(agents).toContain("**Teacher only, books only, desktop only, never grading**");
    expect(agents).toContain("It is **never** offered to a student, never in an exam or an assignment, and never a source of any mark or grading evidence.");
    expect(agents).toContain("the only place `'wasm-unsafe-eval'` exists (the site's policy never gains it)");
    expect(agents).toContain("Widening any of this (students, exams, grading, the site's policy) is an owner decision recorded in this file first.");
  });
});

describe("Teacher C# lab — the frame and the worker", () => {
  const worker = read("tools/csharp-lab/wwwroot/lab-worker.js");
  const bridge = read("tools/csharp-lab/wwwroot/bridge.js");
  it("the worker seals every network, storage and sub-worker entry point, after the runtime has loaded", () => {
    for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "Worker", "SharedWorker", "BroadcastChannel", "indexedDB", "caches"])
      expect(worker).toContain('"' + name + '"');
    expect(worker.indexOf("seal();")).toBeGreaterThan(worker.indexOf("getAssemblyExports"));
  });
  it("the bridge answers only its parent on this origin, and posts only to this origin", () => {
    expect(bridge).toContain("if (event.origin !== ORIGIN || event.source !== window.parent || window.parent === window) return;");
    expect(bridge).toContain("window.parent.postMessage(message, ORIGIN)");
    expect(bridge).not.toMatch(/postMessage\([^)]*"\*"\)/);
  });
  it("the lab bounds output in the compiler host (Lab.cs) and time in the bridge", () => {
    expect(read("tools/csharp-lab/Lab.cs")).toContain("internal const int OutputCap = 16 * 1024;");
    expect(bridge).toMatch(/export const RUN_TIMEOUT_MS = 10000;/);
  });
});
