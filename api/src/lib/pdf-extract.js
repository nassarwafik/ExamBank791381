const pdfParse = require("pdf-parse");

// A page with fewer than this many extractable characters is treated as "scanned" (no real text
// layer) rather than "text" - a simple, no-precedent-needed heuristic (see plan judgment calls).
const SCANNED_PAGE_TEXT_THRESHOLD = 25;

// Extracts per-page text from a PDF buffer using pdf-parse's classic v1 API (pinned deliberately -
// the pdf-parse v2 line is a substantially different, unfamiliar rewrite; v1's simple
// buffer-in/text-out + pagerender-callback API is well understood and lower risk here).
// Returns {pages: [{pageNumber, text, kind:"text"|"scanned", images:[]}], warnings: string[]}.
//
// Embedded-image extraction for scanned pages is intentionally NOT implemented in this module
// (see plan §Judgment Calls #1: no pdfjs-dist+canvas full-page rasterization, to avoid a fragile
// native-binary dependency right after a production outage caused by a fragile dependency chain).
// Scanned pages are returned with kind:"scanned" and empty text so the caller can flag them for
// manual review instead of silently losing them.
async function extractPages(buffer) {
  const pages = [];
  const warnings = [];

  await pdfParse(buffer, {
    pagerender(pageData) {
      return pageData.getTextContent({ normalizeWhitespace: true }).then(textContent => {
        let lastY = null;
        let text = "";
        for (const item of textContent.items) {
          if (lastY === item.transform[5] || lastY === null) {
            text += item.str;
          } else {
            text += "\n" + item.str;
          }
          lastY = item.transform[5];
        }

        const trimmed = text.trim();
        pages.push({
          pageNumber: pageData.pageNumber,
          text: trimmed,
          kind: trimmed.length >= SCANNED_PAGE_TEXT_THRESHOLD ? "text" : "scanned",
          images: []
        });

        return text;
      });
    }
  });

  pages.sort((a, b) => a.pageNumber - b.pageNumber);

  const scannedCount = pages.filter(page => page.kind === "scanned").length;
  if (scannedCount > 0) {
    warnings.push(`${scannedCount} page(s) had no extractable text and were marked for manual review.`);
  }

  return { pages, warnings };
}

module.exports = { extractPages, SCANNED_PAGE_TEXT_THRESHOLD };
