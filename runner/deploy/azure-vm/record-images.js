"use strict";
// Phase 17F-A1 — prints the worker IMAGE MANIFEST (JSON) for exactly the images of the gateway's registry (registry.js — never a
// hand-written list): { schemaVersion, recordedAt, images: { "<image>": "<sha256 image id>" } }. The preflight compares the
// local images against it (--image-manifest), so a swapped / rebuilt image is noticed before the gateway starts.
// 17F-A1.1 (M2): the manifest is validated with the SAME structural contract the preflight enforces (image-manifest.js) before
// it is printed — the writer can never produce what the reader would refuse.
// Used by build-and-record-images.sh. Starts no process (read-only Docker Engine API). Exit 1 when an image is missing / invalid.
const { LANGUAGES } = require("../../gateway/registry.js");
const { createDockerApi } = require("./docker-api.js");
const { validateImageManifest } = require("./image-manifest.js");

const registryImages = () => Object.values(LANGUAGES).map(e => e.image);

/** { imageId: image → Promise<id|null>, now } → { ok: true, manifest } | { ok: false, missing: [images], reason } */
async function buildImageManifest({ imageId, now = () => new Date() }) {
  const images = {}, missing = [];
  for (const image of registryImages()) {
    const id = await imageId(image);
    if (!id) missing.push(image); else images[image] = id;
  }
  if (missing.length) return { ok: false, missing, reason: "missing worker image: " + missing.join(", ") };
  const manifest = { schemaVersion: 1, recordedAt: now().toISOString(), images };
  const v = validateImageManifest(manifest, { images: registryImages() });
  return v.ok ? { ok: true, manifest } : { ok: false, missing: [], reason: "image manifest invalid: " + v.reason };
}

async function main() {
  const docker = createDockerApi();
  const r = await buildImageManifest({ imageId: image => docker.imageId(image) });
  if (!r.ok) { console.error("record-images: " + r.reason); process.exit(1); }
  console.log(JSON.stringify(r.manifest, null, 2));
}

if (require.main === module) main().catch(() => { console.error("record-images: unexpected error"); process.exit(1); });

module.exports = { buildImageManifest };
