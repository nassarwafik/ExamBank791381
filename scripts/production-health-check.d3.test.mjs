import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { judgeHealth, judgeHome, runChecks, normalizeBase, REQUIRED_HEADERS } from "./production-health-check.mjs";

// D3 (item 3) — the production health probe: what counts as healthy, the single retry, and the workflow's read-only shape.

const repo = path.resolve(import.meta.dirname, "..");
const GOOD_HEADERS = { "x-content-type-options": "nosniff", "x-frame-options": "SAMEORIGIN", "strict-transport-security": "max-age=31536000", "referrer-policy": "strict-origin-when-cross-origin" };
const GOOD_HTML = '<html><head><meta charset="UTF-8" />\n<meta http-equiv="Content-Security-Policy" content="default-src \'self\'" /></head><body><div id="root"></div></body></html>';
const response = (status, text, headers = {}) => ({ status, text: async () => text, headers: new Headers(headers) });

describe("judging the responses", () => {
  it("health: 200 + { ok: true, service } within 10 s", () => {
    expect(judgeHealth(200, { ok: true, service: "ExamBank791381" }, 300)).toEqual([]);
    expect(judgeHealth(503, { ok: true, service: "x" }, 300)).toEqual(["status 503"]);
    expect(judgeHealth(200, { ok: false }, 300)).toEqual(["body is not { ok: true, service }"]);
    expect(judgeHealth(200, { ok: true, service: "x" }, 12000)).toEqual(["slow: 12000 ms"]);
  });
  it("home: the app shell, the CSP meta and every D2 header must be there", () => {
    expect(judgeHome(200, GOOD_HEADERS, GOOD_HTML)).toEqual([]);
    expect(judgeHome(200, GOOD_HEADERS, GOOD_HTML.replace(/<meta http-equiv[^>]*>/, ""))).toEqual(["the Content-Security-Policy meta is missing"]);
    expect(judgeHome(200, { ...GOOD_HEADERS, "x-frame-options": "" }, GOOD_HTML)).toEqual(["header x-frame-options missing or changed"]);
    expect(judgeHome(200, GOOD_HEADERS, "<html>maintenance</html>")).toContain("the app shell is missing");
    expect(Object.keys(REQUIRED_HEADERS)).toEqual(["x-content-type-options", "x-frame-options", "strict-transport-security", "referrer-policy"]);
  });
  it("only an https origin is accepted as the base", () => {
    expect(normalizeBase("https://example.org/some/path?x=1")).toBe("https://example.org");
    expect(() => normalizeBase("http://example.org")).toThrow(/https/);
  });
});

describe("running the checks", () => {
  it("a healthy site passes both checks with one GET each — and the probe only ever GETs", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push({ url, method: (init && init.method) || "GET" }); return url.endsWith("/api/health") ? response(200, '{"ok":true,"service":"ExamBank791381"}') : response(200, GOOD_HTML, GOOD_HEADERS); };
    const results = await runChecks("https://prod.example", { fetchImpl, pause: async () => {} });
    expect(results.map(r => r.ok)).toEqual([true, true]);
    expect(calls).toEqual([{ url: "https://prod.example/api/health", method: "GET" }, { url: "https://prod.example/", method: "GET" }]);
  });
  it("one dropped request is retried once and is not an alert; two failures are", async () => {
    let n = 0;
    const flaky = async url => { if (url.endsWith("/api/health") && n++ === 0) throw new TypeError("fetch failed"); return url.endsWith("/api/health") ? response(200, '{"ok":true,"service":"x"}') : response(200, GOOD_HTML, GOOD_HEADERS); };
    expect((await runChecks("https://prod.example", { fetchImpl: flaky, pause: async () => {} })).every(r => r.ok)).toBe(true);
    const down = async () => response(502, "Bad gateway");
    const results = await runChecks("https://prod.example", { fetchImpl: down, pause: async () => {} });
    expect(results.map(r => r.ok)).toEqual([false, false]);
    expect(results[0].problems).toContain("status 502");
  });
});

describe("the scheduled workflow", () => {
  const yml = fs.readFileSync(path.join(repo, ".github/workflows/production-health.yml"), "utf8");
  const script = fs.readFileSync(path.join(repo, "scripts/production-health-check.mjs"), "utf8");
  it("runs on a schedule (and by hand), read-only permissions, no secret, runs the probe", () => {
    expect(yml).toMatch(/schedule:\s*\n\s*- cron: "13,43 \* \* \* \*"/);
    expect(yml).toContain("workflow_dispatch:");
    expect(yml).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(yml).not.toMatch(/secrets\./);
    expect(yml).toContain("run: node scripts/production-health-check.mjs");
  });
  it("the probe never sends anything but GET and never reads a secret", () => {
    expect(script).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)/i);
    expect(script).not.toMatch(/process\.env\.(?!PRODUCTION_BASE_URL|GITHUB_STEP_SUMMARY)[A-Z_]+/);
  });
});
