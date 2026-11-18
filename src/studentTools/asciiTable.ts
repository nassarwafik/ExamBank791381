// Phase T6 — the ASCII table behind the `asciiTable` student tool. Pure data and lookups (7-bit ASCII, codes 0–127); no I/O.

export type AsciiRow = { code: number; char: string; name: string; dec: string; hex: string; oct: string; bin: string; printable: boolean };
export type AsciiRange = "printable" | "full";

// The 33 control characters' standard abbreviations (0–31 and 127).
const CONTROL_NAMES = ["NUL", "SOH", "STX", "ETX", "EOT", "ENQ", "ACK", "BEL", "BS", "HT", "LF", "VT", "FF", "CR", "SO", "SI",
  "DLE", "DC1", "DC2", "DC3", "DC4", "NAK", "SYN", "ETB", "CAN", "EM", "SUB", "ESC", "FS", "GS", "RS", "US"];

function row(code: number): AsciiRow {
  const printable = code >= 32 && code <= 126;
  const name = code < 32 ? CONTROL_NAMES[code] : code === 127 ? "DEL" : code === 32 ? "مسافة (SP)" : String.fromCharCode(code);
  return {
    code, printable, name,
    char: printable ? String.fromCharCode(code) : "",
    dec: String(code), hex: code.toString(16).toUpperCase().padStart(2, "0"), oct: code.toString(8).padStart(3, "0"), bin: code.toString(2).padStart(8, "0")
  };
}

export const ASCII_ROWS: readonly AsciiRow[] = Object.freeze(Array.from({ length: 128 }, (_, i) => Object.freeze(row(i))));

export function asciiRows(range: AsciiRange): readonly AsciiRow[] {
  return range === "full" ? ASCII_ROWS : ASCII_ROWS.filter(r => r.printable);
}

export type AsciiLookup = { ok: true; rows: AsciiRow[] } | { ok: false; message: string };

/**
 * One query: a single character ("A"), a decimal code ("65"), a hex code ("0x41" or "41h"), a binary code ("0b1000001" or 7–8 bits),
 * or a control name ("LF"). Several characters ("Hi") list each character in order (at most 32). Codes outside the chosen range are
 * reported, never shown.
 */
export function asciiLookup(query: string, range: AsciiRange): AsciiLookup {
  const q = typeof query === "string" ? query : "";
  if (!q.length) return { ok: false, message: "اكتب حرفًا أو رمزًا أو عددًا." };
  if (q.length > 64) return { ok: false, message: "النص أطول من المسموح." };
  const allowed = (code: number) => code >= 0 && code <= 127 && (range === "full" || ASCII_ROWS[code].printable);
  const pick = (code: number): AsciiLookup =>
    allowed(code) ? { ok: true, rows: [ASCII_ROWS[code]] } : { ok: false, message: code > 127 ? "الرمز خارج جدول ASCII (0–127)." : "هذا رمز تحكم غير معروض في هذا الجدول." };
  const t = q.trim();
  const name = CONTROL_NAMES.indexOf(t.toUpperCase());
  if (t && name >= 0) return pick(name);
  if (t.toUpperCase() === "DEL") return pick(127);
  if (/^0x[0-9a-f]{1,2}$/i.test(t)) return pick(parseInt(t.slice(2), 16));
  if (/^[0-9a-f]{1,2}h$/i.test(t)) return pick(parseInt(t.slice(0, -1), 16));
  if (/^0b[01]{1,8}$/i.test(t)) return pick(parseInt(t.slice(2), 2));
  if (/^[01]{7,8}$/.test(t)) return pick(parseInt(t, 2));
  if (/^\d{1,3}$/.test(t) && t.length > 1) return pick(Number(t));
  // Text: each character (a single digit is a character, "7" → 55).
  const chars = [...q];
  if (chars.length > 32) return { ok: false, message: "اكتب 32 حرفًا على الأكثر." };
  const rows: AsciiRow[] = [];
  for (const ch of chars) {
    const code = ch.codePointAt(0)!;
    if (code > 127) return { ok: false, message: "الحرف «" + ch + "» ليس من جدول ASCII (الحروف العربية مثلًا خارجه)." };
    if (!allowed(code)) return { ok: false, message: "هذا رمز تحكم غير معروض في هذا الجدول." };
    rows.push(ASCII_ROWS[code]);
  }
  return { ok: true, rows };
}
