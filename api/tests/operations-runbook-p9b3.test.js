import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Tadris+ P9-B3 — the owner's observe → enforce runbook (docs/operations-access-enforcement.md) quotes the console's own words
// between «…». Every quoted label must still exist in the app or the API, so the runbook can never send the owner looking for a
// button that was renamed. The runbook's claims about the server are pinned against the code too.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNBOOK = readFileSync(join(ROOT, "docs/operations-access-enforcement.md"), "utf8");
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
  return /\.(tsx?|c?js)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
});
const squash = s => s.replace(/\s+/g, " ");
// the app and the API, plus AGENTS.md (the runbook also names the operating contract's section)
const CORPUS = squash([...walk(join(ROOT, "src")), ...walk(join(ROOT, "api", "src")), join(ROOT, "AGENTS.md")].map(f => readFileSync(f, "utf8")).join("\n"));
// «…» fragments (a quote inside a quote yields its pieces), whitespace-normalised; the owner's decision quote is not a label.
const QUOTED = [...new Set([...squash(RUNBOOK).matchAll(/«([^«»]+)»/g)].map(m => m[1].trim()).filter(Boolean))];

describe("P9-B3 the observe → enforce runbook", () => {
  it("quotes enough of the console to be followed step by step", () => {
    expect(QUOTED.length).toBeGreaterThanOrEqual(25);
    for (const step of ["تشغيل المراقبة", "تفعيل التطبيق", "تأكيد: تفعيل التطبيق", "إيقاف التطبيق (العودة إلى المراقبة)", "جاهزية التطبيق", "ما كان سيُمنع"]) expect(QUOTED).toContain(step);
  });
  it("every label it quotes exists in the app or the API", () => {
    expect(QUOTED.filter(q => !CORPUS.includes(q))).toEqual([]);
  });
  it("its claims about the server hold: enforce is refused while a teacher has no access, leaving enforce is always allowed", () => {
    const route = readFileSync(join(ROOT, "api/src/functions/owner-access.js"), "utf8");
    expect(route).toMatch(/if \(wanted === "enforce"\) \{\s*const r = await computeReadiness\(container\);\s*if \(!r\.ready\) return reply\(409, \{ ok: false, code: "ACCESS_NOT_READY"/);
    expect(route).toMatch(/const denial = stepUpDenial\(session, nowMs\);\s*if \(denial\) return denial;/);   // every POST: step-up
    expect(RUNBOOK).toContain("ACCESS_NOT_READY");
  });
});
