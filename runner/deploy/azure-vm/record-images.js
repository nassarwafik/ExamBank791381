"use strict";
// Phase 17F-A1 — prints the worker IMAGE MANIFEST (JSON) for exactly the images of the gateway's registry (registry.js — never a
// hand-written list): { schemaVersion, recordedAt, images: { "<image>": "<sha256 image id>" } }. The preflight compares the
// local images against it (--image-manifest), so a swapped / rebuilt image is noticed before the gateway starts.
// Used by build-and-record-images.sh. Starts no process (read-only Docker Engine API). Exit 1 when an image is missing.
const { LANGUAGES } = require("../../gateway/registry.js");
const { createDockerApi } = require("./docker-api.js");

async function main() {
  const docker = createDockerApi();
  const images = {};
  for (const e of Object.values(LANGUAGES)) {
    const id = await docker.imageId(e.image);
    if (!id) { console.error("missing worker image: " + e.image); process.exit(1); }
    images[e.image] = id;
  }
  console.log(JSON.stringify({ schemaVersion: 1, recordedAt: new Date().toISOString(), images }, null, 2));
}

main().catch(() => { console.error("record-images: unexpected error"); process.exit(1); });
