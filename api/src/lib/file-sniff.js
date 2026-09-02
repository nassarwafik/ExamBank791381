// Real content-fingerprint checks for uploaded question-source files — never trust a filename
// extension or a client-declared MIME type alone (both are attacker-controlled).

const EXTENSION_TO_KIND = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".html": "html",
  ".htm": "html"
};

const MIME_TO_KIND = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/html": "html"
};

function extensionOf(fileName) {
  const match = /\.[^./\\]+$/.exec(String(fileName || "").toLowerCase());
  return match ? match[0] : "";
}

function kindFromExtension(fileName) {
  return EXTENSION_TO_KIND[extensionOf(fileName)] || null;
}

function kindFromMime(mimeType) {
  return MIME_TO_KIND[String(mimeType || "").toLowerCase().trim()] || null;
}

function isPdfBuffer(buffer) {
  return buffer.length >= 5 && buffer.slice(0, 5).toString("latin1") === "%PDF-";
}

// DOCX is a zip. A renamed plain .zip must not pass — require the zip's local file headers to
// contain the "word/document.xml" entry name that only a real Office Open XML document has.
function isDocxBuffer(buffer) {
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
    return false;
  }
  return buffer.includes("word/document.xml");
}

// HTML has no reliable magic bytes; accept any content here and rely entirely on sanitize-html
// downstream — this function only rules out obvious binary content.
function looksLikeText(buffer, sampleSize = 512) {
  const sample = buffer.slice(0, sampleSize);
  let controlBytes = 0;
  for (const byte of sample) {
    if (byte === 0) {
      return false;
    }
    if (byte < 9 || (byte > 13 && byte < 32)) {
      controlBytes += 1;
    }
  }
  return sample.length === 0 || controlBytes / sample.length < 0.05;
}

// Validates that a file's extension, declared MIME type, and actual byte content all agree on
// one supported kind ("pdf" | "docx" | "html"). Returns { ok:true, kind } or { ok:false, reason }.
function detectAndValidateKind(fileName, mimeType, buffer) {
  const extKind = kindFromExtension(fileName);
  if (!extKind) {
    return { ok: false, reason: "unsupported-extension" };
  }

  const mimeKind = kindFromMime(mimeType);
  if (mimeKind && mimeKind !== extKind) {
    return { ok: false, reason: "extension-mime-mismatch" };
  }

  if (extKind === "pdf" && !isPdfBuffer(buffer)) {
    return { ok: false, reason: "content-not-pdf" };
  }

  if (extKind === "docx" && !isDocxBuffer(buffer)) {
    return { ok: false, reason: "content-not-docx" };
  }

  if (extKind === "html" && !looksLikeText(buffer)) {
    return { ok: false, reason: "content-not-text" };
  }

  return { ok: true, kind: extKind };
}

module.exports = {
  extensionOf,
  kindFromExtension,
  kindFromMime,
  isPdfBuffer,
  isDocxBuffer,
  looksLikeText,
  detectAndValidateKind
};
