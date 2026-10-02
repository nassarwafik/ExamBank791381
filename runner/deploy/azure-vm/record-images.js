"use strict";
// Phase 17F-A1 — prints the worker IMAGE MANIFEST (JSON) for exactly the images of the gateway's registry (registry.js — never a
// hand-written list): { schemaVersion, recordedAt, images: { "<image>": "<sha256 image id>" } }. The preflight compares the
// local images against it (--image-manifest), so a swapped / rebuilt image is noticed before the gateway starts.
// Used by build-and-record-images.sh. Exit 1 when an image is missing.
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { LANGUAGES } = require(path.join(__dirname, "..", "..", "gateway", "registry.js"));

const images = {};
for (const e of Object.values(LANGUAGES)) {
  const r = spawnSync("docker", ["image", "inspect", "--format", "{{.Id}}", e.image], { encoding: "utf8", shell: false });
  if (r.status !== 0 || !/^sha256:[0-9a-f]{64}$/.test(r.stdout.trim())) { console.error("missing worker image: " + e.image); process.exit(1); }
  images[e.image] = r.stdout.trim();
}
console.log(JSON.stringify({ schemaVersion: 1, recordedAt: new Date().toISOString(), images }, null, 2));
