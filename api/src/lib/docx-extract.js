const mammoth = require("mammoth");
const sanitizeHtml = require("sanitize-html");
const { htmlDocumentToMarkdownText } = require("./table-markdown");
const { SANITIZE_HTML_OPTIONS } = require("./html-sanitize-config");
const { makeImageToken, inlineImageTokensIntoHtml } = require("./image-linking");

// DOCX has no page concept. The whole document is treated as one logical page ("page 1") here;
// import-chunking.js splits it further by character count, and the caller labels the result with
// a synthetic "section N/M" rather than a real page number (see ImportedQuestion.pageRange).
//
// Images are captured as separate buffers (not inlined as base64 into the HTML) via mammoth's
// custom image handler. Each image's mammoth-emitted <img> tag is given alt="<image-linking
// token>", which inlineImageTokensIntoHtml() then turns into plain text at that exact position in
// the document flow - this is what lets image-linking.js later attach an image to whichever
// detected question's verbatim-copied text still contains that token (same paragraph/block ==
// linked; token lost or outside any question == unassigned). No AI guessing, no "nearest question"
// heuristic.
async function extractPages(buffer) {
  const images = [];
  let imageCounter = 0;

  const imageHandler = mammoth.images.imgElement(async image => {
    imageCounter += 1;
    const contentBuffer = await image.read();
    const id = `docx-img-${imageCounter}`;
    images.push({ id, buffer: contentBuffer, contentType: image.contentType || "image/png" });
    return { src: "", alt: makeImageToken(id) };
  });

  const result = await mammoth.convertToHtml({ buffer }, { convertImage: imageHandler });
  const warnings = (result.messages || [])
    .filter(message => message.type === "warning" || message.type === "error")
    .map(message => message.message);

  const sanitized = sanitizeHtml(result.value, SANITIZE_HTML_OPTIONS);
  const withInlineTokens = inlineImageTokensIntoHtml(sanitized);
  const text = htmlDocumentToMarkdownText(withInlineTokens);

  return {
    pages: [{ pageNumber: 1, text, kind: "text", images }],
    warnings
  };
}

module.exports = { extractPages };
