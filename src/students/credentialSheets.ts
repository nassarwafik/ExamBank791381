// Classes & Students — teacher-facing hand-out formats for a GENERATED credential batch (in-memory only, see
// credentialBatch.ts): a CSV for the school's records and printable login cards to cut and hand to students.
// Pure builders (unit-tested) + one thin print helper. Nothing here persists or sends the plaintext anywhere: the CSV
// is a local download, and the print document (every value HTML-escaped) lives in a hidden iframe removed after printing.
import { buildCredentialsDownload, type CredentialBatch } from "../credentialBatch";
import { csvCell } from "../reports/csv";

export function buildCredentialsCsv(batch: CredentialBatch): string {
  const { className, students } = buildCredentialsDownload(batch);
  const rows: unknown[][] = [
    ["الاسم", "اسم العائلة", "الصف", "رقم الهوية / الدخول", "كلمة المرور"],
    ...students.map(s => [s.firstName, s.familyName, className, s.identityNumber, s.password])
  ];
  return "﻿" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));

/** A self-contained RTL print document: one card per student (name, class, login id, password), 2 per row. */
export function buildCredentialCardsHtml(batch: CredentialBatch, loginHint = ""): string {
  const { className, generatedAt, students } = buildCredentialsDownload(batch);
  const date = generatedAt ? new Date(generatedAt).toLocaleDateString("ar", { numberingSystem: "latn" } as Intl.DateTimeFormatOptions) : "";
  const cards = students.map(s => `<article class="card">
  <h2>${escapeHtml([s.firstName, s.familyName].filter(Boolean).join(" ") || s.displayName)}</h2>
  <p class="class">${escapeHtml(className)}</p>
  <dl><div><dt>رقم الهوية / الدخول</dt><dd dir="ltr">${escapeHtml(s.identityNumber)}</dd></div>
  <div><dt>كلمة المرور</dt><dd dir="ltr">${escapeHtml(s.password)}</dd></div></dl>
  ${loginHint ? `<p class="hint">${escapeHtml(loginHint)}</p>` : ""}
</article>`).join("\n");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>بطاقات الدخول — ${escapeHtml(className)}</title>
<style>
@page{size:A4;margin:12mm}
*{box-sizing:border-box}
body{font-family:system-ui,"Segoe UI",Tahoma,Arial,sans-serif;color:#111;margin:0}
header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #999;margin-bottom:8mm;padding-bottom:2mm}
header h1{font-size:14pt;margin:0}header p{margin:0;font-size:9pt;color:#444}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.card{border:1px dashed #555;border-radius:3mm;padding:5mm;break-inside:avoid;page-break-inside:avoid}
.card h2{font-size:13pt;margin:0 0 1mm}.card .class{margin:0 0 3mm;color:#444;font-size:10pt}
dl{margin:0;display:grid;gap:2mm}dl div{display:flex;justify-content:space-between;gap:4mm}
dt{color:#444;font-size:10pt}dd{margin:0;font:600 13pt ui-monospace,Consolas,monospace;letter-spacing:.5px}
.hint{margin:3mm 0 0;font-size:9pt;color:#444}
</style></head><body>
<header><h1>بطاقات الدخول · ${escapeHtml(className)}</h1><p>${escapeHtml(date)} · ${students.length} طالبًا · سرّي — يُسلَّم لكل طالب بطاقته فقط</p></header>
<main class="grid">
${cards}
</main></body></html>`;
}

/** Prints an HTML document through a hidden iframe (no popup window); the iframe is removed afterwards. */
export function printHtmlDocument(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.style.cssText = "position:fixed;inset-inline-start:-10000px;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const cleanup = () => { window.setTimeout(() => frame.remove(), 1000); };
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) { frame.remove(); return; }
  doc.open(); doc.write(html); doc.close();
  win.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(() => { try { win.focus(); win.print(); } finally { cleanup(); } }, 50);
}
