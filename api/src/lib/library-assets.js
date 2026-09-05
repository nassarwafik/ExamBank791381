// Externalizes inline base64 question images into standalone files served as static content, so
// the library's item JSON (and therefore the Azure Functions bundle it ships in) never carries
// multi-megabyte data: URIs. Files are content-addressed (sha256) so identical images dedupe and
// every rebuild produces byte-identical names (idempotent). Images are NOT secret - they're the
// question diagrams a student sees during the exam anyway - so they live in the public static tree;
// answers stay only in the auth-gated item JSON.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PUBLIC_URL_PREFIX = "/exam-library/assets/";

const EXT_BY_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg"
};

function extForContentType(contentType) {
  return EXT_BY_MIME[String(contentType || "").toLowerCase()] || "png";
}

// Writes one base64 image under <assetsRootDir>/<code>/<sha8>.<ext> (skipping the write if it
// already exists) and returns its site-relative URL. Deterministic: same bytes -> same path.
function externalizeImage(base64, contentType, code, assetsRootDir) {
  const buffer = Buffer.from(String(base64 || ""), "base64");
  const sha = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const ext = extForContentType(contentType);
  const fileName = sha + "." + ext;
  const dir = path.join(assetsRootDir, code);
  const filePath = path.join(dir, fileName);

  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, buffer);
  }

  return PUBLIC_URL_PREFIX + code + "/" + fileName;
}

// Rewrites a question's image block: any asset carrying a base64 data: URL is written to disk and
// its dataUrl replaced with the served file URL. Assets already referencing a URL are left as-is.
// Returns a new image block; never mutates the input.
function externalizeImageBlock(imageBlock, code, assetsRootDir) {
  if (!imageBlock || !Array.isArray(imageBlock.assets) || !imageBlock.assets.length) {
    return imageBlock || { exists: false, visible: false, origin: null, assets: [], prompt: null };
  }

  const assets = imageBlock.assets.map(asset => {
    const dataUrlMatch = /^data:([\w/+.-]+);base64,(.*)$/s.exec(String(asset.dataUrl || ""));
    if (!dataUrlMatch) return asset;
    // Keep the field name `dataUrl` (StudentQuestionCard.tsx renders it as <img src>); a served URL
    // works there exactly like a data: URI, so the renderer needs no change.
    const url = externalizeImage(dataUrlMatch[2], dataUrlMatch[1], code, assetsRootDir);
    return { ...asset, dataUrl: url };
  });

  return { ...imageBlock, assets };
}

// Externalizes every question's images in an exam snapshot, in place-safe (returns a new snapshot).
function externalizeSnapshotImages(snapshot, code, assetsRootDir) {
  return {
    ...snapshot,
    questions: snapshot.questions.map(question => ({
      ...question,
      image: externalizeImageBlock(question.image, code, assetsRootDir)
    }))
  };
}

module.exports = { externalizeImage, externalizeImageBlock, externalizeSnapshotImages, extForContentType, PUBLIC_URL_PREFIX };
