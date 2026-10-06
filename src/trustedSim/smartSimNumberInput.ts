// Phase 20A.2 — number entry for SmartSim workspaces (UI only). Students type in an RTL page: Arabic-Indic digits, the Arabic decimal
// separator "٫" and the typographic minus "−" are accepted and normalized; anything else (words, "NaN", "Infinity", expressions) is refused.
// The plugin's strict action normalizer remains the authority: this helper only turns text into a candidate number.
const DIGITS: Readonly<Record<string, string>> = Object.freeze({
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9"
});
const NUMBER = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
export function parseNumberInput(text: string): number | undefined {
  const t = text.trim().replace(/[٠-٩۰-۹]/g, d => DIGITS[d] ?? d).replace(/٫/g, ".").replace(/[−–]/g, "-");
  if (!NUMBER.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? (n === 0 ? 0 : n) : undefined;
}
/** A comma / Arabic-comma / semicolon separated list of numbers; undefined when any item is not a number. Empty text = []. */
export function parseNumberList(text: string): number[] | undefined {
  const parts = text.split(/[,،;]/).map(s => s.trim()).filter(s => s.length > 0);
  const out: number[] = [];
  for (const p of parts) { const n = parseNumberInput(p); if (n === undefined) return undefined; out.push(n); }
  return out;
}
/** Display a number for an LTR island (≤ 10 significant digits, typographic minus avoided so values can be copied back). */
export const showNumber = (n: number): string => (Number.isFinite(n) ? String(Number(n.toPrecision(10))) : "—");
