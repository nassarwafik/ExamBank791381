// Client-side CSV export with UTF-8 BOM (so Excel reads Arabic correctly) and formula-injection
// protection: any cell starting with = + - @ (or tab/CR) is prefixed with a single quote.
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
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
