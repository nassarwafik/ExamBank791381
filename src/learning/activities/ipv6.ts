// Reader follow-up — pure IPv6 address logic for the `ipv6-compress` practice simulator (Book 791381 PDF 167).
//
// Kept in its own module (no React) so the renderer file exports only its component and the logic can be unit-tested
// directly. Everything here is deterministic and offline: NO grading, NO persistence, NO network. Canonicalization
// follows RFC-5952 (expand to 8 groups → strip leading zeros → compress the first longest run of ≥2 zero groups with
// «::»), which lets the book's short form, the long form, any other valid compression and any letter-casing all verify
// equal, while a double «::» or non-hex input is rejected.

export type Ipv6Example = { long: string; short: string };

// The THREE exact PDF 167 examples (the canonical source of truth; also mirrored in the content block config).
export const BOOK_EXAMPLES: Ipv6Example[] = [
  { long: "2001:0db8:0000:0000:0000:ff00:0042:8329", short: "2001:db8::ff00:42:8329" },
  { long: "fe80:0000:0000:0000:0202:b3ff:fe1e:8329", short: "fe80::202:b3ff:fe1e:8329" },
  { long: "2a00:8640:0000:0000:0200:23ff:fe10:8329", short: "2a00:8640::200:23ff:fe10:8329" },
];

/** Expand an IPv6 string to 8 lowercase 4-hex groups, or null if invalid (double «::», bad hex, wrong group count). */
export function expandIpv6(raw: string): string[] | null {
  const s = raw.trim().toLowerCase();
  if (!s || !/^[0-9a-f:]+$/.test(s)) return null;
  if ((s.match(/::/g) || []).length > 1) return null;   // «::» may appear at most once
  if (/:::/.test(s)) return null;
  let groups: string[];
  if (s.includes("::")) {
    const [h, t] = s.split("::");
    const head = h ? h.split(":") : [];
    const tail = t ? t.split(":") : [];
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;   // «::» must stand for at least one all-zero group
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  } else {
    groups = s.split(":");
  }
  if (groups.length !== 8) return null;
  const out: string[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(g.padStart(4, "0"));
  }
  return out;
}

/** Canonical compressed form (strip leading zeros; compress the first longest run of ≥2 zero groups with «::»). */
export function canonicalIpv6(raw: string): string | null {
  const groups = expandIpv6(raw);
  if (!groups) return null;
  const g = groups.map(x => x.replace(/^0+/, "") || "0");
  let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
  for (let i = 0; i < 8; i++) {
    if (g[i] === "0") { if (curStart < 0) { curStart = i; curLen = 1; } else curLen++; if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; } }
    else { curStart = -1; curLen = 0; }
  }
  if (bestLen < 2) return g.join(":");
  return g.slice(0, bestStart).join(":") + "::" + g.slice(bestStart + bestLen).join(":");
}

/** Read the block config's examples, keeping only well-formed pairs whose two sides canonicalize equal; else the book set. */
export function readExamples(config: unknown): Ipv6Example[] {
  const c = (config ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(c.examples) ? c.examples : [];
  const parsed: Ipv6Example[] = [];
  for (const e of raw) {
    const o = (e ?? {}) as Record<string, unknown>;
    if (typeof o.long !== "string" || typeof o.short !== "string") continue;
    const cl = canonicalIpv6(o.long), cs = canonicalIpv6(o.short);
    if (cl && cs && cl === cs) parsed.push({ long: o.long.trim(), short: o.short.trim() });
  }
  return parsed.length ? parsed : BOOK_EXAMPLES;   // fall back to the fixed book set if config is absent/invalid
}
