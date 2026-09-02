const sanitizeHtml = require("sanitize-html");
const { htmlDocumentToMarkdownText } = require("./table-markdown");
const { SANITIZE_HTML_OPTIONS } = require("./html-sanitize-config");
const { makeImageToken } = require("./image-linking");

const DATA_IMAGE_REGEX = /<img[^>]+src=["']data:([\w/+-]+);base64,([A-Za-z0-9+/=]+)["'][^>]*>/gi;

// Captures every inline data:-URI <img> into a separate buffer (same convention as docx-extract.js
// and import-html-exam.js's decodeDataImage), replacing the tag in-place with a plain-text
// image-linking token (see image-linking.js) instead of raw base64 or an empty string - this is
// what lets a later step attach the image to whichever detected question's verbatim text still
// contains that token (same surrounding block == linked; token lost == unassigned). No AI
// guessing, no "nearest question" heuristic.
function extractDataImages(sanitizedHtml) {
  const images = [];
  let counter = 0;

  const withoutImages = sanitizedHtml.replace(DATA_IMAGE_REGEX, (match, contentType, base64) => {
    counter += 1;
    const id = `html-img-${counter}`;
    images.push({ id, buffer: Buffer.from(base64, "base64"), contentType });
    return makeImageToken(id);
  });

  return { html: withoutImages, images };
}

// Uploaded HTML files are genuinely untrusted teacher input (unlike import-html-exam.js's bespoke
// mini-parser, which only ever processes trusted, hand-authored exam pages and has no real
// sanitization). Sanitize FIRST, then convert - never let unsanitized markup reach any later step.
// No page concept exists for a standalone HTML file, matching docx-extract.js's single-"page"
// treatment.
async function extractPages(buffer) {
  const html = buffer.toString("utf8");
  const sanitized = sanitizeHtml(html, SANITIZE_HTML_OPTIONS);
  const { html: withoutImages, images } = extractDataImages(sanitized);
  const text = htmlDocumentToMarkdownText(withoutImages);

  return {
    pages: [{ pageNumber: 1, text, kind: "text", images }],
    warnings: []
  };
}

module.exports = { extractPages };
