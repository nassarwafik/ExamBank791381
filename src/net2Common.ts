// Phase 20C — networkTopology@2 shared primitives (pure; compiled into the shared server build): IPv4 arithmetic, MAC formats, the
// deterministic hash, password values and their educational display forms. No clock, no randomness, no I/O. The IPv4 grammar is the
// frozen networkCli@1 / router CLI v1 grammar (imported, never modified) so v1 and v2 agree on what an address is.
import { isIpv4, isSubnetMask, isUsableHostAddress, prefixLength } from "./networkCliEngine";
import { ipv4ToInt, intToIpv4, networkAddress } from "./routerCliEngine";

export { isIpv4, isSubnetMask, isUsableHostAddress, prefixLength, ipv4ToInt, intToIpv4, networkAddress };
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);
export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const ownKeys = (o: Record<string, unknown>): string[] => Object.keys(o).filter(k => !FORBIDDEN_KEYS.has(k));
export const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
export const hasControlChar = (text: string, allowNewline = false): boolean => {
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); if ((c < 32 && !(allowNewline && c === 10)) || c === 127) return true; }
  return false;
};
/** Printable ASCII without spaces (passwords, VTP names). */
export const isToken = (v: unknown, max: number): v is string => typeof v === "string" && v.length >= 1 && v.length <= max && /^[\x21-\x7e]+$/.test(v);

// ── IPv4 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const sameSubnet = (a: string, b: string, mask: string): boolean => ((ipv4ToInt(a) & ipv4ToInt(mask)) >>> 0) === ((ipv4ToInt(b) & ipv4ToInt(mask)) >>> 0);
export const broadcastAddress = (ip: string, mask: string): string => intToIpv4(((ipv4ToInt(ip) & ipv4ToInt(mask)) | (~ipv4ToInt(mask) >>> 0)) >>> 0);
export const ipCompare = (a: string, b: string): number => ipv4ToInt(a) - ipv4ToInt(b);

// ── deterministic hashing and MAC addresses ────────────────────────────────────────────────────────────────────────────────────────
export function fnv1a(text: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
const hex2 = (n: number) => (n & 255).toString(16).padStart(2, "0");
/** A locally administered unicast MAC from a stable identity (deviceId + interface): `02xx.xxxx.xxxx`. Same input ⇒ same MAC, everywhere. */
export function macFromIdentity(identity: string): string {
  const a = fnv1a(identity), b = fnv1a("#" + identity + "#", 0x9e3779b9);
  const bytes = [0x02, (a >>> 24) & 255, (a >>> 16) & 255, (a >>> 8) & 255, a & 255, b & 255];
  return hex2(bytes[0]) + hex2(bytes[1]) + "." + hex2(bytes[2]) + hex2(bytes[3]) + "." + hex2(bytes[4]) + hex2(bytes[5]);
}
const MAC_RE = /^([0-9a-f]{4})\.([0-9a-f]{4})\.([0-9a-f]{4})$/;
/** Canonical lowercase dotted MAC (`aabb.ccdd.eeff`); refuses all-zero, broadcast and multicast addresses. */
export function parseMac(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = MAC_RE.exec(raw.toLowerCase());
  if (!m) return null;
  const mac = raw.toLowerCase();
  if (mac === "0000.0000.0000" || (parseInt(mac.slice(0, 2), 16) & 1) === 1) return null;
  return mac;
}
export const isMac = (v: unknown): v is string => typeof v === "string" && parseMac(v) === v;

// ── passwords (educational configuration values, never ExamBank authentication) ────────────────────────────────────────────────────
export const PASSWORD_MAX = 32;
export type Net2Passwords = { enablePassword?: string; enableSecret?: string; consolePassword?: string; consoleLogin?: boolean; vtyPassword?: string; vtyLogin?: boolean; encryption?: boolean };
const PASSWORD_KEYS = ["enablePassword", "enableSecret", "consolePassword", "consoleLogin", "vtyPassword", "vtyLogin", "encryption"] as const;
export const isPassword = (v: unknown): v is string => isToken(v, PASSWORD_MAX);
export function canonicalPasswords(p: Net2Passwords): Net2Passwords {
  const out: Net2Passwords = {};
  if (isPassword(p.enablePassword)) out.enablePassword = p.enablePassword;
  if (isPassword(p.enableSecret)) out.enableSecret = p.enableSecret;
  if (isPassword(p.consolePassword)) out.consolePassword = p.consolePassword;
  if (p.consoleLogin === true) out.consoleLogin = true;
  if (isPassword(p.vtyPassword)) out.vtyPassword = p.vtyPassword;
  if (p.vtyLogin === true) out.vtyLogin = true;
  if (p.encryption === true) out.encryption = true;
  return out;
}
/** Strict ingest of an untrusted password block: known keys, bounded tokens, booleans only `true`. */
export function normalizePasswords(raw: unknown): Net2Passwords | undefined {
  if (!isObj(raw) || Object.keys(raw).some(k => !(PASSWORD_KEYS as readonly string[]).includes(k))) return undefined;
  for (const k of ["enablePassword", "enableSecret", "consolePassword", "vtyPassword"] as const) if (raw[k] !== undefined && !isPassword(raw[k])) return undefined;
  for (const k of ["consoleLogin", "vtyLogin", "encryption"] as const) if (raw[k] !== undefined && raw[k] !== true) return undefined;
  return canonicalPasswords(raw as Net2Passwords);
}
const TYPE7 = "dsfd;kfoA,.iyewrkldJKDHSUBsgvca69834ncxv9873254k;fg87";
/** Cisco "type 7" display form (reversible obfuscation, fixed seed 2 — deterministic; display only, the canonical state keeps the value). */
export function type7(pw: string): string {
  let out = "02";
  for (let i = 0; i < pw.length; i++) out += ((pw.charCodeAt(i) ^ TYPE7.charCodeAt((2 + i) % TYPE7.length)) & 255).toString(16).toUpperCase().padStart(2, "0");
  return out;
}
const B64 = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/** The educational "enable secret 5" display: a deterministic one-way digest that never contains the value itself. */
export function secretDigest(pw: string): string {
  let h = fnv1a("salt:" + pw), salt = "", body = "";
  for (let i = 0; i < 4; i++) { salt += B64[h & 63]; h = (Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0) || 1; }
  for (let i = 0; i < 22; i++) { body += B64[h & 63]; h = (Math.imul(h ^ (h >>> 15), 0x27d4eb2d) + i) >>> 0; }
  return "$1$" + salt + "$" + body;
}
/** running-config lines for the password block (switch and router share the curriculum subset). */
export function passwordConfigLines(p: Net2Passwords, section: "global" | "lines"): string[] {
  const shown = (v: string) => (p.encryption ? "7 " + type7(v) : v);
  if (section === "global") {
    const out: string[] = [];
    if (p.encryption) out.push("service password-encryption", "!");
    if (p.enableSecret) out.push("enable secret 5 " + secretDigest(p.enableSecret));
    if (p.enablePassword) out.push("enable password " + shown(p.enablePassword));
    if (p.enableSecret || p.enablePassword) out.push("!");
    return out;
  }
  const out: string[] = [];
  if (p.consolePassword !== undefined || p.consoleLogin) { out.push("line con 0"); if (p.consolePassword) out.push(" password " + shown(p.consolePassword)); if (p.consoleLogin) out.push(" login"); out.push("!"); }
  if (p.vtyPassword !== undefined || p.vtyLogin) { out.push("line vty 0 4"); if (p.vtyPassword) out.push(" password " + shown(p.vtyPassword)); if (p.vtyLogin) out.push(" login"); out.push("!"); }
  return out;
}
export const pad = (s: string, n: number): string => (s.length >= n ? s + " " : s.padEnd(n));
/** "10,20,30-32" — compressed VLAN list (sorted input). */
export function compressVlans(list: readonly number[]): string {
  const out: string[] = [];
  for (let i = 0; i < list.length; i++) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
    out.push(j - i >= 2 ? list[i] + "-" + list[j] : j === i ? String(list[i]) : list[i] + "," + list[j]);
    i = j;
  }
  return out.join(",");
}
