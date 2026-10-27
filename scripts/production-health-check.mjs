#!/usr/bin/env node
// D3 (item 3) — production health probe, run by .github/workflows/production-health.yml every 30 minutes. READ-ONLY: two GET requests
// (the public liveness route and the app's home page), never a login, never a write, never a load test. A failure fails the job, and
// GitHub notifies the repository owner about a failed scheduled run — an alert channel that needs no Azure configuration.
//
// Checks (each retried once after a short pause, so one dropped request is not an alert):
//   API    GET /api/health → 200, JSON { ok: true, service }, within 10 s
//   Web    GET /           → 200 HTML carrying the D2 Content-Security-Policy meta and the D2 security headers
// Output: one line per check on stdout and a table in $GITHUB_STEP_SUMMARY. No secret is needed or read.
import fs from "node:fs";

export const REQUIRED_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "strict-transport-security": "max-age=",
  "referrer-policy": "strict-origin-when-cross-origin"
});
const TIMEOUT_MS = 10000, RETRY_PAUSE_MS = 20000;

export function normalizeBase(raw) {
  const u = new URL(String(raw || "").trim());
  if (u.protocol !== "https:") throw new Error("the production base URL must be https");
  return u.origin;
}

/** PURE: problems with a /api/health response (empty = healthy). */
export function judgeHealth(status, body, ms) {
  const out = [];
  if (status !== 200) out.push("status " + status);
  if (!body || body.ok !== true || typeof body.service !== "string") out.push("body is not { ok: true, service }");
  if (ms > TIMEOUT_MS) out.push("slow: " + ms + " ms");
  return out;
}

/** PURE: problems with the home page response (empty = healthy). `headers` is a lower-cased name → value map. */
export function judgeHome(status, headers, html) {
  const out = [];
  if (status !== 200) out.push("status " + status);
  if (!/<div id="root"><\/div>/.test(html || "")) out.push("the app shell is missing");
  if (!/<meta http-equiv="Content-Security-Policy"/.test(html || "")) out.push("the Content-Security-Policy meta is missing");
  for (const [name, expected] of Object.entries(REQUIRED_HEADERS)) if (!String(headers[name] || "").includes(expected)) out.push("header " + name + " missing or changed");
  return out;
}

async function timedGet(url, fetchImpl) {
  const started = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS + 5000);
  try {
    const r = await fetchImpl(url, { signal: ctrl.signal, headers: { "Cache-Control": "no-cache", "User-Agent": "tadris-production-health/1" } });
    const text = await r.text();
    const headers = {};
    r.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    return { status: r.status, headers, text, ms: Date.now() - started };
  } catch (e) {
    return { status: 0, headers: {}, text: "", ms: Date.now() - started, error: e && e.name === "AbortError" ? "timeout" : "network error" };
  } finally { clearTimeout(t); }
}

export async function runChecks(base, { fetchImpl = fetch, pause = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const checks = [
    { name: "API /api/health", run: async () => { const r = await timedGet(base + "/api/health", fetchImpl); let body = null; try { body = JSON.parse(r.text); } catch { body = null; } return r.error ? [r.error] : judgeHealth(r.status, body, r.ms); } },
    { name: "Web / (shell, CSP, headers)", run: async () => { const r = await timedGet(base + "/", fetchImpl); return r.error ? [r.error] : judgeHome(r.status, r.headers, r.text); } }
  ];
  const results = [];
  for (const c of checks) {
    let problems = await c.run();
    if (problems.length) { await pause(RETRY_PAUSE_MS); problems = await c.run(); }
    results.push({ name: c.name, ok: problems.length === 0, problems });
  }
  return results;
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const base = normalizeBase(process.env.PRODUCTION_BASE_URL || "https://white-grass-0ce642c10.7.azurestaticapps.net");
  const results = await runChecks(base);
  const lines = results.map(r => (r.ok ? "PASS " : "FAIL ") + r.name + (r.ok ? "" : " — " + r.problems.join("; ")));
  console.log("Production health — " + base + "\n" + lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "### Production health — " + base + "\n\n| Check | Result |\n|---|---|\n" + results.map(r => "| " + r.name + " | " + (r.ok ? "✅ pass" : "❌ " + r.problems.join("; ")) + " |").join("\n") + "\n");
  }
  process.exit(results.every(r => r.ok) ? 0 : 1);
}
