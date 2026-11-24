// Visual lab V14 (docs/enterprise-csharp-visual-lab-plan.md §24) — a Vite plugin, at the end of `vite build` (vite.config.ts): the list of files the offline C# lab needs,
// written to dist/offline-lab.json for the service worker (public/sw.js), which caches exactly these on the learner's explicit tap.
//   • the page (/lab.html), its scripts and styles and everything they import, statically or lazily (Vite's manifest, from the `lab`
//     entry), so every drawing of the visual run works offline;
//   • the lab: /csharp-lab/worker.js and every runtime file of /csharp-lab/_framework/ (not the .br / .gz copies, not the language
//     folders). The lab's own index.html / main.js are not needed: the page writes main.js into its frame itself.
// No API path, no book content: only static files that are already public. `version` changes whenever any listed file changes.
// When the build has no lab (public/csharp-lab was not placed, as in the plain Quality Gate build) the pack says `available: false`
// and the page offers no download. dist/.vite (the manifest) is removed afterwards: it is not served.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The files the `lab.html` entry reaches in a Vite manifest: its own file, css, assets, and the closure of imports / dynamic imports. */
export function labClosure(manifest, entry = "lab.html") {
  const files = new Set();
  const seen = new Set();
  const walk = key => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error("the Vite manifest has no entry " + key);
    files.add(chunk.file);
    for (const f of chunk.css || []) files.add(f);
    for (const f of chunk.assets || []) files.add(f);
    for (const k of [...(chunk.imports || []), ...(chunk.dynamicImports || [])]) walk(k);
  };
  walk(entry);
  return [...files].map(f => "/" + f.replace(/^\/+/, "")).sort();
}

/** The lab's runtime files under dist/csharp-lab: worker.js and _framework/* (no compressed copies, no folders). */
export function labRuntimeFiles(dist) {
  const dir = path.join(dist, "csharp-lab", "_framework");
  if (!fs.existsSync(path.join(dir, "dotnet.js")) || !fs.existsSync(path.join(dist, "csharp-lab", "worker.js"))) return null;
  const names = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isFile() && !/\.(br|gz)$/.test(d.name)).map(d => d.name).sort();
  return ["/csharp-lab/worker.js", ...names.map(n => "/csharp-lab/_framework/" + n)];
}

export function buildPack(dist) {
  const manifestPath = path.join(dist, ".vite", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const page = ["/lab.html", ...labClosure(manifest)];
  const runtime = labRuntimeFiles(dist);
  if (!runtime) return { available: false, version: "", bytes: 0, files: [] };
  const files = [...page, ...runtime];
  const hash = createHash("sha256");
  let bytes = 0;
  for (const f of files) {
    const body = fs.readFileSync(path.join(dist, f.slice(1)));
    bytes += body.length;
    hash.update(f).update("\0").update(body);
  }
  return { available: true, version: hash.digest("hex").slice(0, 16), bytes, files };
}

/** Writes dist/offline-lab.json and removes the manifest Vite wrote for it (dist/.vite is never deployed). */
export function writePack(dist) {
  const pack = buildPack(dist);
  fs.writeFileSync(path.join(dist, "offline-lab.json"), JSON.stringify(pack) + "\n");
  fs.rmSync(path.join(dist, ".vite"), { recursive: true, force: true });
  return pack;
}

/** The Vite plugin: once the build has written every file (the manifest included), the pack list is written — so `npm run build` is
 *  unchanged and every build has its pack list. */
export function offlineLabPackPlugin() {
  let outDir = "dist";
  return {
    name: "offline-lab-pack",
    apply: "build",
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir); },
    closeBundle() {
      const pack = writePack(outDir);
      console.log(pack.available ? "offline lab pack: " + pack.files.length + " files, " + (pack.bytes / 1048576).toFixed(1) + " MB, version " + pack.version
        : "offline lab pack: not available (no lab in this build)");
    },
  };
}
