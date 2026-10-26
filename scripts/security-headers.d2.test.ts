import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildContentSecurityPolicy, injectContentSecurityPolicy, inlineScripts, sha256Source, contentSecurityPolicyPlugin } from "./content-security-policy.ts";
import { checkCspMeta, parseCsp } from "./check-csp-meta.mjs";

// D2 — security headers (item 4) and dependency hygiene (item 6). The application's CSP is a build-time meta in index.html (never a
// global header, so the API and the sandboxed simulator runtime keep their own policies); the static headers are global; Dependabot
// opens update PRs; the dependency audit fails on high / critical advisories in shipped dependencies.

const repo = path.resolve(__dirname, "..");
const read = (f: string) => fs.readFileSync(path.join(repo, f), "utf8");
const INDEX = read("index.html");
// The hash real Chromium reported for the dark-mode bootstrap script when it was blocked (negative control, D2 design record §1).
const CHROMIUM_THEME_HASH = "sha256-1dbjLO75spiPvYNU+DS8IIa2fl9UkCH/JXhcy/z3MvY=";

describe("the application's Content-Security-Policy", () => {
  const csp = parseCsp(buildContentSecurityPolicy({ scriptHashes: ["sha256-abc"] }));
  it("scripts: same origin + exact hashes only — no 'unsafe-inline', no 'unsafe-eval', no other origin", () => {
    expect(csp["script-src"]).toEqual(["'self'", "'sha256-abc'"]);
    for (const values of Object.values(csp)) expect(values).not.toContain("'unsafe-eval'");
  });
  it("everything else stays on the same origin; plugins, base and form targets are closed", () => {
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["connect-src"]).toEqual(["'self'"]);
    expect(csp["frame-src"]).toEqual(["'self'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
    expect(csp["img-src"]).toEqual(["'self'", "data:", "blob:"]);
    expect(csp["worker-src"]).toEqual(["'self'", "blob:"]);
    expect("upgrade-insecure-requests" in csp).toBe(true);
  });
  it("index.html has exactly one inline script (the dark-mode bootstrap) and its hash is the one Chromium computes", () => {
    const scripts = inlineScripts(INDEX);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain("examBankTheme");
    expect(sha256Source(scripts[0])).toBe(CHROMIUM_THEME_HASH);
  });
  it("the built page gets the policy right after <meta charset>, allowing that script by its hash", () => {
    const out = injectContentSecurityPolicy(INDEX);
    const meta = out.indexOf('http-equiv="Content-Security-Policy"');
    expect(meta).toBeGreaterThan(out.indexOf("<meta charset"));
    expect(meta).toBeLessThan(out.indexOf("<script"));
    expect(out).toContain("'" + CHROMIUM_THEME_HASH + "'");
    expect(checkCspMeta(out)).toEqual([]);
  });
  it("the source index.html never carries a policy (the dev server needs none) and a second policy is refused", () => {
    expect(INDEX).not.toMatch(/Content-Security-Policy/i);
    expect(() => injectContentSecurityPolicy(injectContentSecurityPolicy(INDEX))).toThrow(/already declares/);
    expect(() => injectContentSecurityPolicy("<html><head><script>x()</script></head></html>")).toThrow(/charset/);
  });
  it("the Vite plugin runs at build only and touches only the application's index.html (never the browser-harness pages)", () => {
    const plugin = contentSecurityPolicyPlugin();
    expect(plugin.apply).toBe("build");
    expect(plugin.transformIndexHtml.handler(INDEX, { path: "/index.html" })).toMatch(/Content-Security-Policy/);
    expect(plugin.transformIndexHtml.handler(INDEX, { path: "/browser-harness/code-editor.html" })).toBe(INDEX);
    expect(read("vite.config.ts")).toMatch(/plugins: \[react\(\), contentSecurityPolicyPlugin\(\)\]/);
  });
});

describe("check:csp — the build gate on dist/index.html", () => {
  const good = injectContentSecurityPolicy(INDEX);
  it("runs inside npm run build", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts.build).toMatch(/&& npm run check:csp$/);
    expect(pkg.scripts["check:csp"]).toBe("node scripts/check-csp-meta.mjs dist/index.html");
  });
  it("fails a page without a policy, with two, or with the policy after a script", () => {
    expect(checkCspMeta(INDEX)[0]).toMatch(/exactly one/);
    expect(checkCspMeta(good.replace("<title>", '<meta http-equiv="Content-Security-Policy" content="default-src *" /><title>'))[0]).toMatch(/exactly one/);
    const moved = good.replace(/\n\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, "").replace("</head>", good.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/)![0] + "</head>");
    expect(checkCspMeta(moved)).toContain("the policy meta must come before every script and stylesheet");
  });
  it("fails 'unsafe-eval', an inline-script wildcard, a missing object-src and an inline script without its hash", () => {
    expect(checkCspMeta(good.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"))).toContain("script-src must not allow 'unsafe-eval'");
    expect(checkCspMeta(good.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"))).toContain("script-src must stay 'self' + exact hashes");
    expect(checkCspMeta(good.replace("script-src 'self'", "script-src 'self' https://cdn.example"))).toContain("script-src must stay 'self' + exact hashes");
    expect(checkCspMeta(good.replace("object-src 'none'; ", ""))).toContain("object-src must be 'none'");
    expect(checkCspMeta(good.replace("</body>", "<script>alert(1)</script></body>")).join(" ")).toMatch(/inline script not allowed by its hash/);
  });
});

describe("static security headers (staticwebapp.config.json)", () => {
  const swa = JSON.parse(read("public/staticwebapp.config.json"));
  const h = swa.globalHeaders;
  it("nosniff, same-origin framing only, a referrer that never leaves paths, HTTPS pinned, powerful features off, own browsing group", () => {
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("SAMEORIGIN");                      // not DENY: the simulator runtime is framed by the app itself
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Strict-Transport-Security"]).toMatch(/^max-age=31536000/);
    for (const f of ["camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()"]) expect(h["Permissions-Policy"]).toContain(f);
    expect(h["Permissions-Policy"]).toContain("fullscreen=(self)");          // the learning reader's full-screen mode
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  });
  it("no global CSP / CORP / COEP: the API and the sandboxed simulator runtime keep their own policies", () => {
    expect(Object.keys(h).join(" ")).not.toMatch(/Content-Security-Policy|Cross-Origin-Resource-Policy|Cross-Origin-Embedder-Policy/i);
  });
});

describe("dependency hygiene (item 6)", () => {
  it("Dependabot watches the web app, the API and the workflows' actions", () => {
    const yml = read(".github/dependabot.yml");
    expect(yml).toMatch(/^version: 2$/m);
    for (const dir of ['directory: "/"\n', 'directory: "/api"\n']) expect(yml).toContain(dir);
    expect(yml.match(/package-ecosystem: npm/g)).toHaveLength(2);
    expect(yml).toContain("package-ecosystem: github-actions");
  });
  it("the audit gate fails on high / critical advisories in shipped dependencies of both packages; the gating steps cannot be skipped", () => {
    const yml = read(".github/workflows/dependency-audit.yml");
    expect(yml).toContain("run: npm audit --omit=dev --audit-level=high\n");
    expect(yml).toContain("run: npm audit --omit=dev --audit-level=high --prefix api\n");
    expect(yml).not.toMatch(/continue-on-error/);
    expect(yml).toMatch(/schedule:\s*\n\s*- cron:/);
    expect(yml).toMatch(/push:\s*\n\s*branches: \[main\]/);
    for (const f of ["package-lock.json", "api/package-lock.json"]) expect(yml).toContain('- "' + f + '"');
  });
  it("the advisories fixed in D2 stay fixed in the lockfiles (dompurify via override, sharp, sanitize-html, source-map-js)", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.overrides.dompurify).toBe("3.4.17");
    const atLeast = (v: string, min: string) => { const a = v.split(".").map(Number), b = min.split(".").map(Number); for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; } return true; };
    const root = JSON.parse(read("package-lock.json")).packages, api = JSON.parse(read("api/package-lock.json")).packages;
    const checks: Array<[Record<string, { version: string }>, string, string]> = [
      [root, "node_modules/dompurify", "3.4.17"], [root, "node_modules/source-map-js", "1.2.2"], [root, "node_modules/vite", "8.3.5"],
      [api, "node_modules/sharp", "0.35.5"], [api, "node_modules/sanitize-html", "2.18.1"], [api, "node_modules/source-map-js", "1.2.2"]
    ];
    for (const [lock, name, min] of checks) expect(atLeast(lock[name].version, min), name + " " + lock[name].version).toBe(true);
  });
});
