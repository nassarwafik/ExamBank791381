// Splits extracted "pages" into AI-call-sized chunks so a large document is never sent to the AI
// provider in one prompt. Pure function — a chunk never spans more characters than the budget,
// and page/section boundaries (for source-metadata like page numbers) are preserved per chunk.

function chunkPages(pages, options = {}) {
  const maxCharsPerChunk = Number(options.maxCharsPerChunk) > 0 ? Number(options.maxCharsPerChunk) : 8000;
  const maxPagesPerChunk = Number(options.maxPagesPerChunk) > 0 ? Number(options.maxPagesPerChunk) : 6;

  const chunks = [];
  let currentPages = [];
  let currentText = [];
  let currentChars = 0;

  const flush = () => {
    if (currentPages.length === 0) {
      return;
    }
    chunks.push({
      chunkIndex: chunks.length,
      pageNumbers: currentPages.map(page => page.pageNumber),
      text: currentText.join("\n\n"),
      images: currentPages.flatMap(page => Array.isArray(page.images) ? page.images : [])
    });
    currentPages = [];
    currentText = [];
    currentChars = 0;
  };

  for (const page of Array.isArray(pages) ? pages : []) {
    const pageText = String(page?.text || "");

    // A single page that alone exceeds the budget is split on its own into multiple sequential
    // chunks (each still tagged with the same page number) rather than ever exceeding the budget.
    if (pageText.length > maxCharsPerChunk) {
      flush();
      for (let offset = 0; offset < pageText.length; offset += maxCharsPerChunk) {
        chunks.push({
          chunkIndex: chunks.length,
          pageNumbers: [page.pageNumber],
          text: pageText.slice(offset, offset + maxCharsPerChunk),
          images: offset === 0 && Array.isArray(page.images) ? page.images : []
        });
      }
      continue;
    }

    const separatorLength = currentPages.length > 0 ? 2 : 0; // "\n\n" join separator
    const wouldExceedChars = currentChars + separatorLength + pageText.length > maxCharsPerChunk;
    const wouldExceedPages = currentPages.length >= maxPagesPerChunk;

    if (currentPages.length > 0 && (wouldExceedChars || wouldExceedPages)) {
      flush();
    }

    currentPages.push(page);
    currentText.push(pageText);
    currentChars += separatorLength + pageText.length;
  }

  flush();

  return chunks;
}

module.exports = { chunkPages };
