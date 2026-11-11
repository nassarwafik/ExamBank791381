// Phase 21G.7 — the teacher's PDF export: a print-ready, right-to-left report printed from a hidden same-origin iframe (no popup,
// no dependency). The browser's «حفظ بصيغة PDF» then produces the PDF with proper Arabic shaping — which a JavaScript PDF library
// would not. Built from the SAME rows as the CSV / Excel exports, every cell HTML-escaped (a name can never inject markup).

export type ReportCell = string | number;
/** Phase R-4 — a report of several tables: each section is a titled table after the main one (or instead of it). */
export type PrintSection = { title: string; columns: readonly string[]; rows: readonly (readonly ReportCell[])[] };
/** Phase R-4 — a chart of the screen as a picture. Only a PNG data URL is accepted (anything else is dropped). */
export type PrintFigure = { title: string; src: string };
export type PrintReport = { title: string; subtitle?: string; meta: ReadonlyArray<[string, string]>; columns: readonly string[]; rows: readonly (readonly ReportCell[])[]; generatedAt: string; sections?: readonly PrintSection[]; figures?: readonly PrintFigure[] };

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const tableHtml = (columns: readonly string[], rows: readonly (readonly ReportCell[])[]) =>
  "<table><thead><tr>" + columns.map(c => "<th scope=\"col\">" + esc(c) + "</th>").join("") + "</tr></thead><tbody>"
  + rows.map(row => "<tr>" + columns.map((_, i) => { const v = row[i]; return "<td" + (typeof v === "number" ? " class=\"num\"" : "") + ">" + esc(v ?? "") + "</td>"; }).join("") + "</tr>").join("") + "</tbody></table>";

/** The report's whole HTML document (exported for tests). Without `sections` / `figures` it is byte for byte the 21G.7 document. */
export function reportHtml(r: PrintReport): string {
  const head = r.columns.map(c => "<th scope=\"col\">" + esc(c) + "</th>").join("");
  const body = r.rows.map(row => "<tr>" + r.columns.map((_, i) => { const v = row[i]; return "<td" + (typeof v === "number" ? " class=\"num\"" : "") + ">" + esc(v ?? "") + "</td>"; }).join("") + "</tr>").join("");
  // Phase R-4 — figures (charts as pictures) and sections (more tables). A figure whose source is not a PNG data URL is dropped.
  const figures = (r.figures || []).filter(f => PNG_DATA_URL.test(f.src));
  const sections = r.sections || [];
  const extended = sections.length > 0 || figures.length > 0;
  const extraCss = extended
    ? "h2{font-size:12pt;margin:6mm 0 2mm;break-after:avoid}.figs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4mm;margin:0 0 4mm}"
      + "figure{margin:0;border:1px solid #cbd5e1;border-radius:2mm;padding:2mm 3mm;break-inside:avoid}figcaption{font-weight:700;font-size:10pt;margin:0 0 1mm}figure img{display:block;width:100%;height:auto}"
    : "";
  const figuresHtml = figures.length ? "<div class=\"figs\">" + figures.map(f => "<figure><figcaption>" + esc(f.title) + "</figcaption><img alt=\"" + esc(f.title) + "\" src=\"" + esc(f.src) + "\"></figure>").join("") + "</div>" : "";
  const sectionsHtml = sections.map(s => "<h2>" + esc(s.title) + "</h2>" + tableHtml(s.columns, s.rows)).join("");
  const mainTable = extended && !r.columns.length ? "" : "<table><thead><tr>" + head + "</tr></thead><tbody>" + body + "</tbody></table>";
  const meta = r.meta.map(([k, v]) => "<div><dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd></div>").join("");
  return "<!doctype html><html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"utf-8\"><title>" + esc(r.title) + "</title><style>"
    + "@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:system-ui,'Segoe UI',Tahoma,Arial,sans-serif;color:#0f172a;font-size:11pt}"
    + "h1{font-size:16pt;margin:0 0 2mm}p.sub{margin:0 0 4mm;color:#475569}dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2mm 6mm;margin:0 0 5mm}"
    + "dl div{border:1px solid #cbd5e1;border-radius:2mm;padding:2mm 3mm}dt{color:#475569;font-size:9pt}dd{margin:0;font-weight:700}"
    + "table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:1.5mm 2mm;text-align:start;vertical-align:top}"
    + "th{background:#f1f5f9;font-size:9.5pt}td.num{font-variant-numeric:tabular-nums}thead{display:table-header-group}tr{break-inside:avoid}"
    + "footer{margin-top:4mm;color:#64748b;font-size:9pt}" + extraCss + "</style></head><body><h1>" + esc(r.title) + "</h1>"
    + (r.subtitle ? "<p class=\"sub\">" + esc(r.subtitle) + "</p>" : "") + (meta ? "<dl>" + meta + "</dl>" : "")
    + figuresHtml + mainTable + sectionsHtml + "<footer>أُنشئ في " + esc(r.generatedAt) + "</footer></body></html>";
}

/** How long a document with pictures waits for them before it prints anyway. */
export const PRINT_IMAGE_WAIT_MS = 1500;

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
  const go = () => { win.focus(); win.print(); };
  // Phase R-4 — a picture written into the document is NOT loaded yet when the write returns (measured in Chromium: `complete`
  // is false right after doc.close()), so printing at once would print empty frames. A document with pictures prints when they
  // have all loaded or failed — or after PRINT_IMAGE_WAIT_MS at the latest; a document without pictures prints at once, as before.
  const waiting = Array.from(doc.querySelectorAll("img")).filter(img => !(img.complete && img.naturalWidth > 0));
  if (!waiting.length) go();
  else {
    let left = waiting.length, started = false;
    const start = () => { if (started) return; started = true; if (frame.isConnected) go(); };
    const tick = () => { left -= 1; if (left <= 0) start(); };
    for (const img of waiting) { img.addEventListener("load", tick, { once: true }); img.addEventListener("error", tick, { once: true }); }
    setTimeout(start, PRINT_IMAGE_WAIT_MS);
  }
  setTimeout(() => { if (frame.isConnected) frame.remove(); }, 60000);    // a browser that never fires afterprint
  return true;
}
