// D2 — the application's Content-Security-Policy. It is delivered as a <meta http-equiv> in the BUILT index.html only
// (vite.config.ts → contentSecurityPolicyPlugin), never as a global HTTP header: a header from staticwebapp.config.json would also
// reach the API responses, and the simulator runtime / mesh routes send their own stricter policies (api/src/lib/smartsim/
// runtime-headers.js, api/src/functions/mesh-assets.js) that a second policy must never narrow. The dev server gets no policy (its
// hot reload needs inline scripts); the browser suites and production run the built page.
//
// What the app needs, from an inventory of src/ and of the built assets (docs/enterprise-security-headers-d2.md §1):
//   scripts  — same-origin module chunks + ONE inline script (the dark-mode bootstrap in index.html), allowed by its hash;
//              no eval / new Function anywhere in the built code
//   styles   — bundled CSS + React style attributes and the Monaco editor's injected <style> → 'unsafe-inline' for styles only
//   images   — same-origin files and /api/question-image, data: (sanitized SVG / inline icons), blob: (profile photo preview)
//   workers  — the service worker (/sw.js) and the Monaco editor worker (a same-origin chunk; blob: is Monaco's own fallback)
//   frames   — the simulator runtime (/api/simulators/runtime/…, same origin, sandboxed by its own policy)
//   requests — /api/* on the same origin only
//
// Visual lab V14 (owner decision 2026-11-24, docs/enterprise-csharp-visual-lab-plan.md §24) — the OFFLINE C# LAB PAGE (/lab.html) gets
// its own policy: this one, plus — in script-src only — 'wasm-unsafe-eval' (the .NET runtime), blob: (the runtime's modules, made
// into blob: URLs inside the lab's frame) and the exact hash of the lab frame's script (tools/csharp-lab/wwwroot/main.js, written as
// the `srcdoc` of a sandboxed frame, which inherits this page's policy). index.html's policy is unchanged.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type CspOptions = { scriptHashes: string[]; lab?: { frameHash: string } };

/** The lab frame's script, byte for byte as the offline lab page writes it into its frame (src/offlineLab imports it ?raw). */
export const LAB_FRAME_SCRIPT = fileURLToPath(new URL("../tools/csharp-lab/wwwroot/main.js", import.meta.url));
export const labFrameHash = (): string => sha256Source(readFileSync(LAB_FRAME_SCRIPT, "utf8"));

export function buildContentSecurityPolicy({ scriptHashes, lab }: CspOptions): string {
  const hashes = scriptHashes.map(h => "'" + h + "'");
  const labScript = lab ? ["'wasm-unsafe-eval'", "blob:", "'" + lab.frameHash + "'"] : [];
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", ...hashes, ...labScript]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'", "data:"]],
    ["media-src", ["'self'", "data:", "blob:"]],
    ["connect-src", ["'self'"]],
    ["worker-src", ["'self'", "blob:"]],
    ["child-src", ["'self'", "blob:"]],
    ["frame-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["upgrade-insecure-requests", []]
  ];
  return directives.map(([name, values]) => [name, ...values].join(" ")).join("; ");
}

export const sha256Source = (code: string): string => "sha256-" + createHash("sha256").update(code, "utf8").digest("base64");

// Inline classic scripts of an HTML document (no src attribute). Module / external scripts are covered by 'self'.
export function inlineScripts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    out.push(m[2]);
  }
  return out;
}

// Inserts the policy meta directly after <meta charset>, before any script or stylesheet it governs. Throws when the document has
// no charset meta (the build must fail rather than ship a page without its policy) or already carries a policy.
export function injectContentSecurityPolicy(html: string, lab?: { frameHash: string }): string {
  if (/http-equiv\s*=\s*["']?Content-Security-Policy/i.test(html)) throw new Error("index.html already declares a Content-Security-Policy");
  const charset = /<meta\s+charset=["']?[^"'>\s]+["']?\s*\/?>/i.exec(html);
  if (!charset) throw new Error("index.html has no <meta charset>; the Content-Security-Policy meta cannot be placed first");
  const csp = buildContentSecurityPolicy({ scriptHashes: inlineScripts(html).map(sha256Source), ...(lab ? { lab } : {}) });
  const meta = '\n    <meta http-equiv="Content-Security-Policy" content="' + csp + '" />';
  const at = charset.index + charset[0].length;
  return html.slice(0, at) + meta + html.slice(at);
}

// Vite plugin: build only, and only the application's own pages — index.html, and (V14) lab.html with the lab's policy (the
// browser-harness pages are test fixtures).
export function contentSecurityPolicyPlugin() {
  return {
    name: "tadris-content-security-policy",
    apply: "build" as const,
    transformIndexHtml: {
      order: "post" as const,
      handler(html: string, ctx: { path: string }) {
        return ctx.path === "/index.html" ? injectContentSecurityPolicy(html)
          : ctx.path === "/lab.html" ? injectContentSecurityPolicy(html, { frameHash: labFrameHash() }) : html;
      }
    }
  };
}
