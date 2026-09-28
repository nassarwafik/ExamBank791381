// Client-side CSV export with UTF-8 BOM (so Excel reads Arabic correctly) and formula-injection
// protection: a cell is prefixed with a single quote when it starts with TAB/CR, or when its first MEANINGFUL
// character — after any leading whitespace, control, zero-width or bidi-mark characters a spreadsheet may skip —
// is = + - or @ (" =SUM(1,1)", "\t@cmd", "\u200f=1+1"). Only the quote is added; the cell's own text, including its
// leading spacing, is exported unchanged. Keep in sync with api/src/lib/reports/aggregate.js (parity-tested).
const SKIPPABLE = /[\s\u200b-\u200f\u2060\u061c]/;                       // whitespace, zero-width, bidi marks
const skippable = (ch: string) => { const c = ch.charCodeAt(0); return c < 0x20 || c === 0x7f || SKIPPABLE.test(ch); };
function formulaShaped(s: string): boolean {
  if (s[0] === "\t" || s[0] === "\r") return true;
  let i = 0;
  while (i < s.length && skippable(s[i])) i++;
  return i < s.length && "=+-@".includes(s[i]);
}
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (formulaShaped(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function toCsv(rows: unknown[][]): string {
  return rows.map(r => r.map(csvCell).join(",")).join("\r\n");
}

// Triggers a client download of the given rows as a CSV file (BOM + CRLF).
export function downloadCsv(filename: string, rows: unknown[][]): void {
  const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
