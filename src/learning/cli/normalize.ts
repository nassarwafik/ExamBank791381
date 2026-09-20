// Learning Materials — CLI simulator: input NORMALIZATION + value parsers. Pure string functions, no state.
//
// Rules (v1): trim, collapse runs of whitespace, case-insensitive KEYWORDS (handled by the grammar), values kept as
// typed, interface spellings folded to one canonical short form where that is safe (FastEthernet0/1 = fa0/1 =
// f0/1 = "f0/1"; GigabitEthernet0/0.10 = g0/0.10). IPv4 addresses and masks are checked octet by octet; VLAN ids
// must be 1–4094. Nothing is evaluated or executed — these are plain regular-expression checks.

/** Collapse whitespace and trim. Never throws; non-strings become "". */
export function normalizeInput(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
}

/** Whitespace-separated tokens of the normalized line ([] for an empty line). */
export function tokenize(raw: unknown): string[] {
  const line = normalizeInput(raw);
  return line ? line.split(" ") : [];
}

const IF_RE = /^(fastethernet|fast|fa|f|gigabitethernet|gigabit|gig|gi|g|ethernet|eth|e)(\d+(?:\/\d+)+)(\.\d+)?$/i;
const SVI_RE = /^vlan(\d{1,4})$/i;
const PREFIX: Record<string, string> = { fastethernet: "f", fast: "f", fa: "f", f: "f", gigabitethernet: "g", gigabit: "g", gig: "g", gi: "g", g: "g", ethernet: "e", eth: "e", e: "e" };

/**
 * Canonical short interface name: "FastEthernet0/1" | "fa0/1" | "Fa 0/1" | "f0/1" → "f0/1"; "G0/0.10" → "g0/0.10";
 * "vlan 1" → "vlan1". Returns null when the text is not an interface name. Tokens may be joined without spaces first.
 */
export function normalizeInterfaceName(raw: string): string | null {
  const s = raw.replace(/\s+/g, "");
  const svi = SVI_RE.exec(s);
  if (svi) return "vlan" + String(Number(svi[1]));
  const m = IF_RE.exec(s);
  if (!m) return null;
  return PREFIX[m[1].toLowerCase()] + m[2] + (m[3] ?? "");
}

/** True when the canonical name is a sub-interface ("g0/0.10"). */
export function isSubInterface(name: string): boolean {
  return /\.\d+$/.test(name);
}

const RANGE_RE = /^(fastethernet|fast|fa|f|gigabitethernet|gigabit|gig|gi|g|ethernet|eth|e)(\d+(?:\/\d+)*\/)(\d+)-(\d+)$/i;

/**
 * Expand an interface RANGE such as "f0/23-24" or "fa0/1-10" into canonical names (["f0/23", "f0/24"]). A single
 * interface (no dash) expands to itself. Returns null for anything else, an inverted range, or a range wider than
 * 48 ports.
 */
export function expandInterfaceRange(raw: string): string[] | null {
  const s = raw.replace(/\s+/g, "");
  const m = RANGE_RE.exec(s);
  if (!m) {
    const one = normalizeInterfaceName(s);
    return one ? [one] : null;
  }
  const from = Number(m[3]), to = Number(m[4]);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to || to - from >= 48) return null;
  const prefix = PREFIX[m[1].toLowerCase()] + m[2];
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(prefix + String(i));
  return out;
}

const OCTET_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Dotted-quad check (each octet 0–255, no leading '+', no spaces). */
export function isIpv4(raw: string): boolean {
  const m = OCTET_RE.exec(raw);
  if (!m) return false;
  return m.slice(1).every(o => Number(o) <= 255 && !(o.length > 1 && o.startsWith("0")));
}

/** A dotted-quad SUBNET MASK: valid IPv4 whose bits are contiguous ones then zeros (255.255.255.0, 255.0.0.0 …). */
export function isSubnetMask(raw: string): boolean {
  if (!isIpv4(raw)) return false;
  const bits = raw.split(".").map(o => Number(o).toString(2).padStart(8, "0")).join("");
  return /^1*0*$/.test(bits) && bits !== "0".repeat(32);
}

/** A VLAN id 1–4094, else null. */
export function parseVlanId(raw: string): number | null {
  if (!/^\d{1,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= 4094 ? n : null;
}

/**
 * A VLAN LIST "10,20,30" (also "10-12" ranges, at most 64 ids) → sorted, de-duplicated ids; null when malformed.
 * Whitespace inside the list is tolerated only when the tokens were joined first (the grammar joins them).
 */
export function parseVlanList(raw: string): number[] | null {
  const s = raw.replace(/\s+/g, "");
  if (!/^\d{1,4}(-\d{1,4})?(,\d{1,4}(-\d{1,4})?)*$/.test(s)) return null;
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const [a, b] = part.split("-");
    const from = parseVlanId(a), to = b === undefined ? from : parseVlanId(b);
    if (from === null || to === null || from > to || to - from > 64) return null;
    for (let v = from; v <= to; v++) out.add(v);
    if (out.size > 64) return null;
  }
  return [...out].sort((x, y) => x - y);
}

/** Hostname / pool / VLAN name: letters, digits, '-' and '_' (1–63 chars), starting with a letter or digit. */
export function isSimpleName(raw: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(raw);
}
