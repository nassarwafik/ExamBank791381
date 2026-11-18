// Phase T1 — the IPv4 / subnet calculator engine behind the `ipv4Calculator` student tool.
//
// Pure arithmetic on unsigned 32-bit integers: no clock, no randomness, no I/O, no React. It is deliberately SELF-CONTAINED and does
// not import the frozen networkCli@1 / router CLI / networkTopology engines: those are grading authorities, and a student
// convenience tool must never be able to change what they accept. Input grammar is strict: dotted-decimal IPv4 with four octets
// 0–255 and no leading zeros (the same notation the curriculum uses), a prefix "/0".."/32" or a contiguous dotted mask.
//
// Conventions (stated in the UI in T2/T3):
//   • /31 — RFC 3021 point-to-point: both addresses are usable, there is no network / broadcast pair;
//   • /32 — a single host route: the one address is the usable host;
//   • otherwise usable hosts = 2^(32 − prefix) − 2, first = network + 1, last = broadcast − 1.

export type Ipv4Scope = "private" | "public" | "loopback" | "linkLocal" | "multicast" | "reserved" | "thisNetwork" | "sharedAddress";
export type Ipv4Class = "A" | "B" | "C" | "D" | "E";

export type Ipv4Analysis = {
  address: string;
  prefix: number;
  mask: string;
  wildcard: string;
  network: string;
  broadcast: string | null;      // null for /31 and /32 (no broadcast address)
  firstHost: string;
  lastHost: string;
  totalAddresses: number;
  usableHosts: number;
  addressClass: Ipv4Class;
  scope: Ipv4Scope;
  binary: { address: string; mask: string; network: string };
};

export type SubnetRow = { index: number; network: string; firstHost: string; lastHost: string; broadcast: string | null };
export type SubnetSplit = { basePrefix: number; newPrefix: number; borrowedBits: number; totalSubnets: number; hostsPerSubnet: number; subnets: SubnetRow[]; truncated: boolean };

export type Ipv4Result<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

export const MAX_SUBNET_ROWS = 64;
const OCTET = /^(0|[1-9]\d{0,2})$/;

const u32 = (n: number): number => n >>> 0;

/** Strict dotted-decimal IPv4 → unsigned 32-bit integer, or null. Surrounding whitespace is ignored. */
export function parseIpv4(text: string): number | null {
  if (typeof text !== "string") return null;
  const parts = text.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!OCTET.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return u32(n);
}

export function formatIpv4(n: number): string {
  const v = u32(n);
  return [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join(".");
}

/** Dotted binary form, eight bits per octet: 11000000.10101000.00000001.00001010 */
export function binaryIpv4(n: number): string {
  const v = u32(n);
  return [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].map(o => o.toString(2).padStart(8, "0")).join(".");
}

export function maskFromPrefix(prefix: number): number {
  return prefix === 0 ? 0 : u32(0xffffffff << (32 - prefix));
}

/** A contiguous mask (ones then zeros) → its prefix length, or null for a non-contiguous mask. 0.0.0.0 → 0, 255.255.255.255 → 32. */
export function prefixFromMask(mask: number): number | null {
  const m = u32(mask);
  const inverted = u32(~m);
  // contiguous ⇔ the host part is of the form 0…01…1 ⇔ (inverted + 1) is a power of two (or 2^32 for mask 0).
  if ((inverted & (inverted + 1)) !== 0) return null;
  let bits = 0;
  for (let i = 31; i >= 0; i--) { if ((m >>> i) & 1) bits++; else break; }
  return bits;
}

/** "/26", "26" or "255.255.255.192" → prefix length 0..32, or null. */
export function parsePrefixOrMask(text: string): number | null {
  if (typeof text !== "string") return null;
  const t = text.trim();
  const m = /^\/?(0|[1-9]\d?)$/.exec(t);
  if (m) { const p = Number(m[1]); return p <= 32 ? p : null; }
  const mask = parseIpv4(t);
  return mask === null ? null : prefixFromMask(mask);
}

/** "192.168.1.10/26", "192.168.1.10 /26" or "192.168.1.10 255.255.255.192". */
export function parseCidrInput(text: string): Ipv4Result<{ address: number; prefix: number }> {
  if (typeof text !== "string" || !text.trim()) return { ok: false, code: "EMPTY", message: "اكتب عنوان IPv4 مع البادئة، مثل 192.168.1.10/24." };
  const t = text.trim();
  const slash = t.indexOf("/");
  const [ipPart, maskPart] = slash >= 0 ? [t.slice(0, slash), t.slice(slash)] : t.split(/\s+/).length === 2 ? t.split(/\s+/) : [t, ""];
  const address = parseIpv4(ipPart);
  if (address === null) return { ok: false, code: "INVALID_ADDRESS", message: "العنوان غير صالح: أربعة أجزاء من 0 إلى 255 تفصلها نقاط." };
  if (!maskPart.trim()) return { ok: false, code: "MISSING_PREFIX", message: "أضف البادئة (مثل /24) أو قناع الشبكة (مثل 255.255.255.0)." };
  const prefix = parsePrefixOrMask(maskPart);
  if (prefix === null) return { ok: false, code: "INVALID_PREFIX", message: "البادئة أو القناع غير صالح: البادئة من 0 إلى 32، والقناع آحاد متتالية ثم أصفار." };
  return { ok: true, value: { address, prefix } };
}

export function addressClass(address: number): Ipv4Class {
  const first = u32(address) >>> 24;
  if (first < 128) return "A";
  if (first < 192) return "B";
  if (first < 224) return "C";
  if (first < 240) return "D";
  return "E";
}

const inBlock = (a: number, base: string, prefix: number): boolean => {
  const m = maskFromPrefix(prefix);
  return u32(a & m) === u32((parseIpv4(base) as number) & m);
};

export function addressScope(address: number): Ipv4Scope {
  const a = u32(address);
  if (inBlock(a, "0.0.0.0", 8)) return "thisNetwork";
  if (inBlock(a, "127.0.0.0", 8)) return "loopback";
  if (inBlock(a, "10.0.0.0", 8) || inBlock(a, "172.16.0.0", 12) || inBlock(a, "192.168.0.0", 16)) return "private";
  if (inBlock(a, "100.64.0.0", 10)) return "sharedAddress";
  if (inBlock(a, "169.254.0.0", 16)) return "linkLocal";
  if (inBlock(a, "224.0.0.0", 4)) return "multicast";
  if (inBlock(a, "240.0.0.0", 4)) return "reserved";
  return "public";
}

function hostRange(network: number, prefix: number): { first: number; last: number; broadcast: number | null; usable: number; total: number } {
  const total = 2 ** (32 - prefix);
  const last = u32(network + total - 1);
  if (prefix === 32) return { first: network, last: network, broadcast: null, usable: 1, total };
  if (prefix === 31) return { first: network, last, broadcast: null, usable: 2, total };
  return { first: u32(network + 1), last: u32(last - 1), broadcast: last, usable: total - 2, total };
}

export function analyzeIpv4(address: number, prefix: number): Ipv4Result<Ipv4Analysis> {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return { ok: false, code: "INVALID_PREFIX", message: "البادئة يجب أن تكون من 0 إلى 32." };
  const a = u32(address), mask = maskFromPrefix(prefix), network = u32(a & mask);
  const r = hostRange(network, prefix);
  return {
    ok: true,
    value: {
      address: formatIpv4(a), prefix, mask: formatIpv4(mask), wildcard: formatIpv4(u32(~mask)),
      network: formatIpv4(network), broadcast: r.broadcast === null ? null : formatIpv4(r.broadcast),
      firstHost: formatIpv4(r.first), lastHost: formatIpv4(r.last), totalAddresses: r.total, usableHosts: r.usable,
      addressClass: addressClass(a), scope: addressScope(a),
      binary: { address: binaryIpv4(a), mask: binaryIpv4(mask), network: binaryIpv4(network) }
    }
  };
}

/** Parse + analyse in one step (the tool's main field). */
export function analyzeCidrText(text: string): Ipv4Result<Ipv4Analysis> {
  const p = parseCidrInput(text);
  return p.ok ? analyzeIpv4(p.value.address, p.value.prefix) : p;
}

/** Split the network of `address`/`basePrefix` into subnets of `newPrefix`; at most `limit` rows are listed (the count is exact). */
export function splitSubnets(address: number, basePrefix: number, newPrefix: number, limit = MAX_SUBNET_ROWS): Ipv4Result<SubnetSplit> {
  if (!Number.isInteger(basePrefix) || basePrefix < 0 || basePrefix > 32) return { ok: false, code: "INVALID_PREFIX", message: "البادئة الأصلية يجب أن تكون من 0 إلى 32." };
  if (!Number.isInteger(newPrefix) || newPrefix <= basePrefix || newPrefix > 32) return { ok: false, code: "INVALID_NEW_PREFIX", message: "البادئة الجديدة يجب أن تكون أكبر من البادئة الأصلية وألا تتجاوز 32." };
  const rows = Math.max(0, Math.min(Math.floor(limit), MAX_SUBNET_ROWS));
  const base = u32(address & maskFromPrefix(basePrefix));
  const borrowedBits = newPrefix - basePrefix, totalSubnets = 2 ** borrowedBits, size = 2 ** (32 - newPrefix);
  const subnets: SubnetRow[] = [];
  for (let i = 0; i < Math.min(totalSubnets, rows); i++) {
    const network = u32(base + i * size), r = hostRange(network, newPrefix);
    subnets.push({ index: i + 1, network: formatIpv4(network), firstHost: formatIpv4(r.first), lastHost: formatIpv4(r.last), broadcast: r.broadcast === null ? null : formatIpv4(r.broadcast) });
  }
  return { ok: true, value: { basePrefix, newPrefix, borrowedBits, totalSubnets, hostsPerSubnet: hostRange(base, newPrefix).usable, subnets, truncated: totalSubnets > subnets.length } };
}

/** The longest prefix (smallest subnet) that still holds `hosts` usable hosts, using the conventions above; null when impossible. */
export function prefixForHosts(hosts: number): number | null {
  if (!Number.isInteger(hosts) || hosts < 1) return null;
  for (let p = 32; p >= 0; p--) if (hostRange(0, p).usable >= hosts) return p;
  return null;
}

/** The prefix after borrowing enough bits from `basePrefix` for at least `count` subnets; null when it would exceed /32. */
export function prefixForSubnetCount(basePrefix: number, count: number): number | null {
  if (!Number.isInteger(basePrefix) || basePrefix < 0 || basePrefix > 32 || !Number.isInteger(count) || count < 1) return null;
  const bits = Math.ceil(Math.log2(count) - 1e-12);
  const p = basePrefix + Math.max(0, bits);
  return p <= 32 ? p : null;
}
