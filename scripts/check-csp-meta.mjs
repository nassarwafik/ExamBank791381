#!/usr/bin/env node
// D2 — build gate: the BUILT dist/index.html must carry the application's Content-Security-Policy (scripts/content-security-policy.ts),
// placed before anything it governs, allowing every inline script by its exact hash and nothing broader. Runs after `vite build`
// (package.json "build"), so a page without its policy, or with an inline script the policy would block, never deploys.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sha256Source = code => "sha256-" + createHash("sha256").update(code, "utf8").digest("base64");

export function parseCsp(text) {
  const out = {};
  for (const part of String(text || "").split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out[name.toLowerCase()] = values;
  }
  return out;
}

export function checkCspMeta(html) {
  const issues = [];
  const metas = [...html.matchAll(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content="([^"]*)"\s*\/?>/gi)];
  if (metas.length !== 1) return [`expected exactly one Content-Security-Policy meta, found ${metas.length}`];
  const meta = metas[0];
  const firstGoverned = html.search(/<script\b|<link\b[^>]*rel=["']?(?:stylesheet|modulepreload)/i);
  if (firstGoverned !== -1 && firstGoverned < meta.index) issues.push("the policy meta must come before every script and stylesheet");
  const csp = parseCsp(meta[1]);
  const scriptSrc = csp["script-src"] || [];
  for (const [name, values] of Object.entries(csp)) if (values.includes("'unsafe-eval'")) issues.push(name + " must not allow 'unsafe-eval'");
  if (scriptSrc.includes("'unsafe-inline'") || scriptSrc.includes("*") || scriptSrc.some(v => /^(?:https?:|data:|blob:)/.test(v))) issues.push("script-src must stay 'self' + exact hashes");
  if ((csp["object-src"] || []).join(" ") !== "'none'") issues.push("object-src must be 'none'");
  if (!(csp["default-src"] || []).length) issues.push("default-src missing");
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    const hash = "'" + sha256Source(m[2]) + "'";
    if (!scriptSrc.includes(hash)) issues.push("inline script not allowed by its hash: " + hash);
  }
  return issues;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.resolve(process.argv[2] || "dist/index.html");
  const issues = checkCspMeta(fs.readFileSync(file, "utf8"));
  if (issues.length) { console.error("CSP check FAILED for " + file + ":\n - " + issues.join("\n - ")); process.exit(1); }
  console.log("CSP check passed (" + path.relative(process.cwd(), file) + ")");
}
