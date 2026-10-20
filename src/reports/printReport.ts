// Phase 21G.7 — the teacher's PDF export: a print-ready, right-to-left report printed from a hidden same-origin iframe (no popup,
// no dependency). The browser's «حفظ بصيغة PDF» then produces the PDF with proper Arabic shaping — which a JavaScript PDF library
// would not. Built from the SAME rows as the CSV / Excel exports, every cell HTML-escaped (a name can never inject markup).

export type ReportCell = string | number;
/** Phase R-4 — one titled table of a multi-section report (the Reports Center); the gradebook keeps the single-table form. */
export type PrintSection = { heading?: string; columns: readonly string[]; rows: readonly (readonly ReportCell[])[] };
export type PrintReport = { title: string; subtitle?: string; meta: ReadonlyArray<[string, string]>; columns?: readonly string[]; rows?: readonly (readonly ReportCell[])[]; sections?: readonly PrintSection[]; generatedAt: string };

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The report's whole HTML document (exported for tests). */
function tableHtml(t: PrintSection): string {
  const head = t.columns.map(c => "<th scope=\"col\">" + esc(c) + "</th>").join("");
  const body = t.rows.map(row => "<tr>" + t.columns.map((_, i) => { const v = row[i]; return "<td" + (typeof v === "number" ? " class=\"num\"" : "") + ">" + esc(v ?? "") + "</td>"; }).join("") + "</tr>").join("");
  return (t.heading ? "<h2>" + esc(t.heading) + "</h2>" : "") + "<table><thead><tr>" + head + "</tr></thead><tbody>" + body + "</tbody></table>";
}

export function reportHtml(r: PrintReport): string {
  const sections: readonly PrintSection[] = r.sections ?? [{ columns: r.columns ?? [], rows: r.rows ?? [] }];
  const meta = r.meta.map(([k, v]) => "<div><dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd></div>").join("");
  return "<!doctype html><html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"utf-8\"><title>" + esc(r.title) + "</title><style>"
    + "@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:system-ui,'Segoe UI',Tahoma,Arial,sans-serif;color:#0f172a;font-size:11pt}"
    + "h1{font-size:16pt;margin:0 0 2mm}h2{font-size:12pt;margin:5mm 0 2mm;break-after:avoid}p.sub{margin:0 0 4mm;color:#475569}dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2mm 6mm;margin:0 0 5mm}"
    + "dl div{border:1px solid #cbd5e1;border-radius:2mm;padding:2mm 3mm}dt{color:#475569;font-size:9pt}dd{margin:0;font-weight:700}"
    + "table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:1.5mm 2mm;text-align:start;vertical-align:top}"
    + "th{background:#f1f5f9;font-size:9.5pt}td.num{font-variant-numeric:tabular-nums}thead{display:table-header-group}tr{break-inside:avoid}"
    + "footer{margin-top:4mm;color:#64748b;font-size:9pt}</style></head><body><h1>" + esc(r.title) + "</h1>"
    + (r.subtitle ? "<p class=\"sub\">" + esc(r.subtitle) + "</p>" : "") + (meta ? "<dl>" + meta + "</dl>" : "")
    + sections.map(tableHtml).join("") + "<footer>أُنشئ في " + esc(r.generatedAt) + "</footer></body></html>";
}

/** Prints the report from a hidden iframe (removed after printing). Returns false when the browser offers no iframe document. */
export function printReport(r: PrintReport): boolean {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.title = "تقرير للطباعة";
  frame.style.cssText = "position:fixed;inset-block-end:0;inset-inline-end:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument, win = frame.contentWindow;
  if (!doc || !win || typeof win.print !== "function") { frame.remove(); return false; }
  doc.open(); doc.write(reportHtml(r)); doc.close();
  const cleanup = () => setTimeout(() => frame.remove(), 0);
  win.addEventListener("afterprint", cleanup, { once: true });
  win.focus();
  win.print();
  setTimeout(() => { if (frame.isConnected) frame.remove(); }, 60000);    // a browser that never fires afterprint
  return true;
}
